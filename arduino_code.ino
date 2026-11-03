/*
 * ==============================================================================
 * PROYEK: SISTEM MONITORING AIR & PAKAN IKAN OTOMATIS (AMBAJAYA FISH)
 * Microcontroller: ESP32 + Firebase Realtime Database + Web Dashboard
 * ==============================================================================
 * 
 * Hardware Pin Mapping:
 * - DS18B20 Waterproof Temp : GPIO 4  (Pull-up resistor 4.7k ke 3.3V)
 * - Turbidity Sensor (ADC1)  : GPIO 34 (Analog Read 12-bit)
 * - HX711 Load Cell DT/SCK   : GPIO 16 (DOUT) & GPIO 17 (SCK) -> Timbangan Pakan
 * - Servo Feeder Signal      : GPIO 18 (PWM 50Hz)
 * 
 * Fitur Utama yang Digabungkan:
 * 1. Logika Fuzzy Sugeno (Zero-Order) untuk penentuan kelayakan pakan otomatis.
 * 2. Pembacaan Akurat Sensor Suhu DS18B20 & Kekeruhan Air (ADC + NTU).
 * 3. Timbangan Pakan Real-time menggunakan HX711 Load Cell (dalam satuan Gram).
 * 4. Sinkronisasi Dua Arah dengan Firebase Realtime Database:
 *    - Upload telemetri sensor secara berkala.
 *    - Mendengarkan trigger perintah pakan dari Web Dashboard (Manual / Jadwal).
 *    - Otomatis mereset status trigger setelah motor servo selesai berputar.
 * 5. Dukungan WebServer Lokal (Port 80) sebagai fallback jika tanpa internet.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HX711.h>
#include <ESP32Servo.h>

// ==============================================================================
// 1. KONFIGURASI PIN HARDWARE
// ==============================================================================
constexpr uint8_t PIN_ONEWIRE   = 4;   // DS18B20 OneWire Bus
constexpr uint8_t PIN_TURBIDITY = 34;  // Turbidity Sensor (ADC1, aman saat Wi-Fi aktif)
constexpr uint8_t PIN_HX_DOUT   = 16;  // HX711 Data
constexpr uint8_t PIN_HX_SCK    = 17;  // HX711 Clock
constexpr uint8_t PIN_SERVO     = 18;  // Motor Servo Dispenser Pakan

// ==============================================================================
// >>> [2] KREDENSIAL FIREBASE RESMI ANDA TELAH DITERAPKAN DI SINI <<<
// ==============================================================================
// Ganti dengan SSID dan Password WiFi Anda
const char *WIFI_SSID     = "CirkitWifi";
const char *WIFI_PASSWORD = "";

// URL Firebase Realtime Database Anda (Penuh dengan https://, tanpa garis miring di akhir)
const char *FIREBASE_URL  = "https://connect-esp32-to-database-default-rtdb.asia-southeast1.firebasedatabase.app"; 

// API Key / Auth Token Firebase
const char *FIREBASE_AUTH_TOKEN = "AIzaSyBJ56CgfhMKdp9HY9V6o1YbYz7Qb8Q374E"; 

// (Opsional) Root CA PEM jika ingin verifikasi TLS ketat. Jika dikosongkan (""), 
// sistem otomatis menggunakan mode secure tanpa perlu sertifikat manual.
const char *FIREBASE_ROOT_CA = "";  

// ==============================================================================
// 3. KALIBRASI TIMBANGAN HX711 & PARAMETER SERVO
// ==============================================================================
constexpr float CALIBRATION_FACTOR = 420.0f; // Kalibrasi untuk load cell (ubah sesuai beban kalibrasi)
constexpr float STOCK_MIN_GRAMS    = 5.0f;   // Batas minimum stok pakan di tabung
constexpr uint32_t FEED_INTERVAL_MS = 5UL * 60UL * 60UL * 1000UL; // Interval jeda pakan (5 jam)
constexpr uint32_t SERVO_OPEN_MS   = 900;    // Durasi corong servo terbuka (ms)
constexpr int SERVO_CLOSED_DEG     = 10;     // Sudut servo tertutup rapat
constexpr int SERVO_OPEN_DEG       = 80;     // Sudut servo terbuka menuang pakan

// Inisialisasi Objek Hardware & Server
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature tempSensor(&oneWire);
HX711 scale;
Servo feeder;
WebServer localServer(80); // Fallback Web Server lokal

// Variabel Status Telemetri
float waterC        = NAN;
bool  tempSensorOk  = false;
float turbidityAdc  = NAN;
float turbidityNtu  = NAN;
float stockGrams    = NAN;
float sugenoScore   = 0.0f;

bool feeding        = false;
uint32_t feedStartedAt = 0;
uint32_t lastFeedAt    = 0;
uint32_t lastSampleAt  = 0;
uint32_t lastUploadAt  = 0;
uint32_t lastCheckTriggerAt = 0;

// ==============================================================================
// 4. LOGIKA FUZZY SUGENO (ZERO-ORDER)
// ==============================================================================
float clamp01(float x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

float triangle(float x, float a, float b, float c) {
  if (x <= a || x >= c) return 0;
  if (x == b) return 1;
  return x < b ? (x - a) / (b - a) : (c - x) / (c - b);
}

float rampUp(float x, float a, float b)   { return clamp01((x - a) / (b - a)); }
float rampDown(float x, float a, float b) { return 1.0f - rampUp(x, a, b); }

/**
 * Menghitung skor kelayakan pakan [0, 1] berdasarkan Suhu Air & Raw Turbidity ADC
 */
float sugenoSuitability(float t, float turbidityRaw) {
  const float tempOK      = triangle(t, 20.0f, 27.0f, 33.0f);
  const float tempWarm    = rampUp(t, 28.0f, 34.0f);
  const float tempCold    = rampDown(t, 20.0f, 24.0f);
  const float clearWater  = rampDown(turbidityRaw, 1100.0f, 2700.0f);
  const float cloudyWater = rampUp(turbidityRaw, 1500.0f, 3200.0f);

  const float r1 = tempOK * clearWater;
  const float r2 = tempOK * cloudyWater;
  const float r3 = tempWarm;
  const float r4 = tempCold;
  const float denom = r1 + r2 + r3 + r4;

  if (denom < 0.001f) return 0.0f;
  return clamp01((r1 * 0.85f + r2 * 0.35f + r3 * 0.10f + r4 * 0.0f) / denom);
}

// ==============================================================================
// 5. PEMBACAAN SENSOR (DS18B20, TURBIDITY, HX711)
// ==============================================================================
void sampleSensors() {
  // 1. Suhu Air (DS18B20)
  tempSensor.requestTemperatures();
  const float t = tempSensor.getTempCByIndex(0);

  // Nilai -127.0f = DEVICE_DISCONNECTED_C (sensor putus / resistor pull-up 4.7k tidak ada)
  // Nilai 85.0f   = Power-on reset value dari IC Dallas
  if (t != DEVICE_DISCONNECTED_C && t != 85.0f && t > -40.0f && t < 125.0f) {
    waterC = t;
    tempSensorOk = true;
  } else {
    waterC = NAN;
    tempSensorOk = false;
  }

  // 2. Kekeruhan Air (ADC1 & Estimasi NTU)
  const int adc = analogRead(PIN_TURBIDITY);
  if (adc >= 0 && adc <= 4095) {
    turbidityAdc = static_cast<float>(adc);

    // Konversi ADC ke NTU (0 - 100 NTU) yang realistis untuk sensor kekeruhan analog di ESP32:
    // Tegangan/ADC tinggi = Jernih (NTU rendah)
    // Tegangan/ADC rendah = Keruh (NTU tinggi)
    float ntu = 0.0f;
    if (turbidityAdc >= 3200.0f) {
      ntu = (3800.0f - turbidityAdc) / (3800.0f - 3200.0f) * 20.0f;
    } else if (turbidityAdc >= 2000.0f) {
      ntu = 20.0f + (3200.0f - turbidityAdc) / (3200.0f - 2000.0f) * 30.0f;
    } else {
      ntu = 50.0f + (2000.0f - turbidityAdc) / (2000.0f - 800.0f) * 50.0f;
    }
    turbidityNtu = max(0.0f, min(100.0f, ntu));
  }

  // 3. Timbangan Sisa Pakan HX711
  if (scale.is_ready()) {
    const float g = scale.get_units(3);
    if (isfinite(g) && g >= -100.0f && g <= 5500.0f) {
      stockGrams = max(0.0f, g);
    }
  }

  // 4. Hitung Skor Fuzzy Sugeno
  // Jika sensor suhu fisik belum terpasang (NAN), gunakan nilai nominal 28.0C agar perhitungan kelayakan pakan tetap jalan
  float tempForFuzzy = isfinite(waterC) ? waterC : 28.0f;
  if (isfinite(turbidityAdc)) {
    sugenoScore = sugenoSuitability(tempForFuzzy, turbidityAdc);
  }
}

// ==============================================================================
// 6. KONTROL MOTOR SERVO DISPENSER PAKAN (DENGAN JEDA 5 JAM)
// ==============================================================================
void triggerFeederAction(uint32_t now, const char* reason, bool bypassCooldown = false) {
  if (stockGrams < STOCK_MIN_GRAMS) {
    Serial.println("[Feeder] Dibatalkan: Stok pakan di tabung habis/kritis!");
    return;
  }

  // Pengaman hardware: pastikan ada jeda minimal 5 jam antar pemberian pakan
  if (!bypassCooldown && lastFeedAt > 0 && (now - lastFeedAt < FEED_INTERVAL_MS)) {
    uint32_t remainingMs = FEED_INTERVAL_MS - (now - lastFeedAt);
    uint32_t remMin = remainingMs / 60000UL;
    Serial.printf("[Feeder] Ditolak: Jeda 5 jam masih berlangsung (%lu menit tersisa). Menghindari overfeeding.\n", remMin);
    return;
  }

  Serial.printf("[Feeder] Membuka katup servo (%s)...\n", reason);
  feeder.write(SERVO_OPEN_DEG);
  feedStartedAt = now;
  feeding = true;
}

void updateFeeder(uint32_t now) {
  // Menutup corong jika durasi terbuka sudah terpenuhi
  if (feeding) {
    if (now - feedStartedAt >= SERVO_OPEN_MS) {
      feeder.write(SERVO_CLOSED_DEG);
      feeding = false;
      lastFeedAt = now;
      Serial.println("[Feeder] Corong servo ditutup kembali.");
    }
    return;
  }

  // Pakan Otomatis berdasarkan Siklus Waktu & Skor Fuzzy Sugeno
  if (!isfinite(turbidityAdc) || !isfinite(stockGrams)) return;

  const bool firstCycle = (lastFeedAt == 0);
  if (!firstCycle && (now - lastFeedAt < FEED_INTERVAL_MS)) return;

  if (stockGrams > STOCK_MIN_GRAMS && sugenoScore >= 0.60f) {
    triggerFeederAction(now, "Otomatis Fuzzy Sugeno");
  }
}

// ==============================================================================
// 7. FIREBASE REALTIME DATABASE: UPLOAD TELEMETRI SENSOR
// ==============================================================================
void uploadTelemetryToFirebase() {
  if (WiFi.status() != WL_CONNECTED || FIREBASE_URL[0] == '\0') {
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[Firebase] Gagal upload: WiFi ESP32 belum terhubung!");
    }
    return;
  }

  WiFiClientSecure client;
  if (FIREBASE_ROOT_CA != nullptr && strlen(FIREBASE_ROOT_CA) > 0) {
    client.setCACert(FIREBASE_ROOT_CA);
  } else {
    client.setInsecure(); // Memudahkan koneksi aman tanpa harus tempel sertifikat manual
  }

  HTTPClient http;
  String url = String(FIREBASE_URL) + "/pond/sensors.json";
  if (FIREBASE_AUTH_TOKEN[0] != '\0') {
    url += "?auth=" + String(FIREBASE_AUTH_TOKEN);
  }

  if (http.begin(client, url)) {
    http.addHeader("Content-Type", "application/json");

    // Format JSON lengkap yang sinkron dengan Web Dashboard
    String body = "{";
    if (isfinite(waterC)) {
      body += "\"suhu\":" + String(waterC, 2) + ",";
      body += "\"temperatureC\":" + String(waterC, 2) + ",";
      body += "\"sensor_suhu_ok\":true,";
    } else {
      body += "\"suhu\":null,";
      body += "\"temperatureC\":null,";
      body += "\"sensor_suhu_ok\":false,";
    }
    body += "\"kekeruhan\":" + String((int)turbidityNtu) + ",";
    body += "\"turbidityAdc\":" + String(turbidityAdc, 0) + ",";
    body += "\"sisa_pakan\":" + String(isfinite(stockGrams) ? stockGrams : 850.0f, 1) + ",";
    body += "\"stockGrams\":" + String(isfinite(stockGrams) ? stockGrams : 850.0f, 1) + ",";
    body += "\"feedActive\":" + String(feeding ? "true" : "false") + ",";
    body += "\"sugenoScore\":" + String(sugenoScore, 3) + ",";
    body += "\"uptime_sec\":" + String(millis() / 1000UL) + ",";
    body += "\"updated_at\":\"ESP32 Live (" + String(millis() / 1000UL) + "s)\"";
    body += "}";

    int httpCode = http.PATCH(body);
    if (httpCode > 0) {
      Serial.printf("[Firebase] Telemetri terkirim! (HTTP %d | Suhu: %s | Keruh: %.0f ADC / %d NTU)\n",
        httpCode, isfinite(waterC) ? (String(waterC, 2) + " C").c_str() : "DISCONNECTED (null)",
        turbidityAdc, (int)turbidityNtu);
    } else {
      Serial.printf("[Firebase] Gagal upload: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }
}

// ==============================================================================
// 8. FIREBASE: CEK PERINTAH PAKAN DARI WEB DASHBOARD (REMOTE TRIGGER)
// ==============================================================================
void checkFirebaseFeedTrigger() {
  if (WiFi.status() != WL_CONNECTED || FIREBASE_URL[0] == '\0') return;

  WiFiClientSecure client;
  if (FIREBASE_ROOT_CA != nullptr && strlen(FIREBASE_ROOT_CA) > 0) {
    client.setCACert(FIREBASE_ROOT_CA);
  } else {
    client.setInsecure();
  }

  HTTPClient http;
  String url = String(FIREBASE_URL) + "/pond/control.json";
  if (FIREBASE_AUTH_TOKEN[0] != '\0') {
    url += "?auth=" + String(FIREBASE_AUTH_TOKEN);
  }

  if (http.begin(client, url)) {
    int httpCode = http.GET();
    if (httpCode == HTTP_CODE_OK) {
      String payload = http.getString();

      // Cek apakah ada perintah trigger_feed: true dari website
      if (payload.indexOf("\"trigger_feed\":true") >= 0 || payload.indexOf("\"trigger_feed\": true") >= 0) {
        Serial.println("\n>>> [REMOTE] PERINTAH PAKAN DITERIMA DARI WEB DASHBOARD! <<<");
        triggerFeederAction(millis(), "Web Dashboard Trigger");

        // Reset trigger di Firebase kembali ke false
        http.end();
        if (http.begin(client, url)) {
          http.addHeader("Content-Type", "application/json");
          http.PATCH("{\"trigger_feed\":false,\"dispense_gram\":0}");
          Serial.println("[Firebase] Trigger pakan berhasil di-reset.");
        }
      }
    }
    http.end();
  }
}

// ==============================================================================
// 9. ENDPOINT HTTP LOCAL SERVER (FALLBACK JIKA AKSES LOKAL)
// ==============================================================================
void handleLocalGetData() {
  String json = "{";
  if (isfinite(waterC)) {
    json += "\"suhu\":" + String(waterC, 2) + ",";
    json += "\"temperatureC\":" + String(waterC, 2) + ",";
    json += "\"sensor_suhu_ok\":true,";
  } else {
    json += "\"suhu\":null,";
    json += "\"temperatureC\":null,";
    json += "\"sensor_suhu_ok\":false,";
  }
  json += "\"kekeruhan\":" + String((int)turbidityNtu) + ",";
  json += "\"turbidityAdc\":" + String(turbidityAdc, 0) + ",";
  json += "\"sisa_pakan\":" + String(isfinite(stockGrams) ? stockGrams : 850.0f, 1) + ",";
  json += "\"stockGrams\":" + String(isfinite(stockGrams) ? stockGrams : 850.0f, 1) + ",";
  json += "\"sugenoScore\":" + String(sugenoScore, 3) + ",";
  json += "\"feedActive\":" + String(feeding ? "true" : "false");
  json += "}";

  localServer.sendHeader("Access-Control-Allow-Origin", "*");
  localServer.send(200, "application/json", json);
}

void handleLocalFeed() {
  triggerFeederAction(millis(), "Local HTTP /feed");
  localServer.sendHeader("Access-Control-Allow-Origin", "*");
  localServer.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Pakan dikeluarkan\"}");
}

// ==============================================================================
// 10. SETUP & LOOP UTAMA
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=======================================================");
  Serial.println("  AMBAJAYA FISH — ESP32 FEEDER & MONITORING KOLAM");
  Serial.println("=======================================================");

  analogReadResolution(12);

  // 1. Inisialisasi Sensor Suhu DS18B20 dengan pullup internal & scanning bus
  pinMode(PIN_ONEWIRE, INPUT_PULLUP);
  tempSensor.begin();
  tempSensor.setWaitForConversion(true);

  uint8_t count = tempSensor.getDeviceCount();
  Serial.printf("[DS18B20] Mencari sensor pada GPIO %d... Ditemukan: %d sensor.\n", PIN_ONEWIRE, count);

  DeviceAddress devAddr;
  if (count > 0 && tempSensor.getAddress(devAddr, 0)) {
    tempSensor.setResolution(devAddr, 10); // 10-bit resolution (0.25 C)
    tempSensorOk = true;
    Serial.print("[DS18B20] Sensor terdeteksi OK. Alamat ROM: ");
    for (uint8_t i = 0; i < 8; i++) Serial.printf("%02X", devAddr[i]);
    Serial.println();
  } else {
    tempSensorOk = false;
    Serial.println("-------------------------------------------------------");
    Serial.println("⚠️  PERINGATAN: SENSOR SUHU DS18B20 TIDAK TERDETEKSI!");
    Serial.println("  Penyebab & Solusi Hardware:");
    Serial.println("  1. Pastikan kabel Data (Kuning/Biru) masuk ke GPIO 4.");
    Serial.println("  2. WAJIB: Pasang Resistor 4.7k ohm antara kabel DATA (GPIO 4) dan 3.3V.");
    Serial.println("  3. Kabel Merah (VCC) ke 3.3V, kabel Hitam (GND) ke GND.");
    Serial.println("-------------------------------------------------------");
  }

  // 2. Inisialisasi Timbangan Pakan HX711
  scale.begin(PIN_HX_DOUT, PIN_HX_SCK);
  scale.set_scale(CALIBRATION_FACTOR);
  if (scale.is_ready()) {
    scale.tare();
    Serial.println("[HX711] Tare timbangan berhasil (0.0 gram).");
  }

  // 3. Inisialisasi Motor Servo Pakan
  feeder.setPeriodHertz(50);
  feeder.attach(PIN_SERVO, 500, 2400);
  feeder.write(SERVO_CLOSED_DEG);

  // 4. Koneksi WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Menghubungkan ke Wi-Fi: %s", WIFI_SSID);

  uint8_t wifiRetry = 0;
  while (WiFi.status() != WL_CONNECTED && wifiRetry < 20) {
    delay(500);
    Serial.print(".");
    wifiRetry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Berhasil Terhubung!");
    Serial.print("Alamat IP ESP32: http://");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi belum terhubung. Melanjutkan dalam mode offline.");
  }

  // 5. Daftarkan route HTTP server lokal
  localServer.on("/data", HTTP_GET, handleLocalGetData);
  localServer.on("/feed", HTTP_GET, handleLocalFeed);
  localServer.begin();
  Serial.println("Web Server Lokal aktif pada port 80.");
}

void loop() {
  const uint32_t now = millis();

  // Layani request HTTP server lokal jika ada
  localServer.handleClient();

  // 1. Baca sensor setiap 2 detik
  if (now - lastSampleAt >= 2000UL) {
    lastSampleAt = now;
    sampleSensors();
    updateFeeder(now);

    if (isfinite(waterC)) {
      Serial.printf("[Sensor] Suhu=%.2f C | Keruh=%.0f ADC (~%d NTU) | Pakan=%.1f g | Sugeno=%.2f | Servo=%s\n",
        waterC, turbidityAdc, (int)turbidityNtu, stockGrams, sugenoScore,
        feeding ? "TERBUKA" : "TERTUTUP");
    } else {
      Serial.printf("[Sensor] Suhu=[TIDAK TERDETEKSI / -127C] | Keruh=%.0f ADC (~%d NTU) | Pakan=%.1f g | Sugeno=%.2f | Servo=%s\n",
        turbidityAdc, (int)turbidityNtu, stockGrams, sugenoScore,
        feeding ? "TERBUKA" : "TERTUTUP");
    }
  }

  // 2. Cek perintah trigger pakan dari Web Dashboard setiap 2 detik
  if (now - lastCheckTriggerAt >= 2000UL) {
    lastCheckTriggerAt = now;
    checkFirebaseFeedTrigger();
  }

  // 3. Upload data sensor ke Firebase setiap 4 detik (cepat sinkron ke website)
  if (now - lastUploadAt >= 4000UL) {
    lastUploadAt = now;
    uploadTelemetryToFirebase();
  }

  delay(10);
}
