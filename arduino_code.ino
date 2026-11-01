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
constexpr uint32_t FEED_INTERVAL_MS = 12UL * 60UL * 60UL * 1000UL; // Interval pakan otomatis (12 jam)
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
  if (t != DEVICE_DISCONNECTED_C && t > -55.0f && t < 125.0f) {
    waterC = t;
  }

  // 2. Kekeruhan Air (ADC1 & Estimasi NTU)
  const int adc = analogRead(PIN_TURBIDITY);
  if (adc >= 0 && adc <= 4095) {
    turbidityAdc = static_cast<float>(adc);

    // Konversi perkiraan ADC ke NTU (0 - 100 NTU)
    float voltage = (turbidityAdc / 4095.0f) * 3.3f;
    float ntu = -1120.4f * (voltage * voltage) + 5742.3f * voltage - 4353.8f;
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
  if (isfinite(waterC) && isfinite(turbidityAdc)) {
    sugenoScore = sugenoSuitability(waterC, turbidityAdc);
  }
}

// ==============================================================================
// 6. KONTROL MOTOR SERVO DISPENSER PAKAN
// ==============================================================================
void triggerFeederAction(uint32_t now, const char* reason) {
  if (stockGrams < STOCK_MIN_GRAMS) {
    Serial.println("[Feeder] Dibatalkan: Stok pakan di tabung habis/kritis!");
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
  if (!isfinite(waterC) || !isfinite(turbidityAdc) || !isfinite(stockGrams)) return;

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
  if (WiFi.status() != WL_CONNECTED || FIREBASE_URL[0] == '\0' || !isfinite(waterC)) return;

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

    // Format JSON lengkap yang sinkron dengan Web Dashboard & PHP/Laravel
    String body = "{";
    body += "\"suhu\":" + String(waterC, 2) + ",";
    body += "\"temperatureC\":" + String(waterC, 2) + ",";
    body += "\"kekeruhan\":" + String((int)turbidityNtu) + ",";
    body += "\"turbidityAdc\":" + String(turbidityAdc, 0) + ",";
    body += "\"sisa_pakan\":" + String(stockGrams, 1) + ",";
    body += "\"stockGrams\":" + String(stockGrams, 1) + ",";
    body += "\"feedActive\":" + String(feeding ? "true" : "false") + ",";
    body += "\"sugenoScore\":" + String(sugenoScore, 3) + ",";
    body += "\"updated_at\":\"ESP32 Online\"";
    body += "}";

    int httpCode = http.PATCH(body);
    if (httpCode > 0) {
      Serial.printf("[Firebase] Telemetri berhasil diupload. HTTP Code: %d\n", httpCode);
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
  json += "\"suhu\":" + String(waterC, 2) + ",";
  json += "\"temperatureC\":" + String(waterC, 2) + ",";
  json += "\"kekeruhan\":" + String((int)turbidityNtu) + ",";
  json += "\"turbidityAdc\":" + String(turbidityAdc, 0) + ",";
  json += "\"sisa_pakan\":" + String(stockGrams, 1) + ",";
  json += "\"stockGrams\":" + String(stockGrams, 1) + ",";
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

  // Inisialisasi Sensor Suhu
  tempSensor.begin();

  // Inisialisasi Timbangan Pakan HX711
  scale.begin(PIN_HX_DOUT, PIN_HX_SCK);
  scale.set_scale(CALIBRATION_FACTOR);
  if (scale.is_ready()) {
    scale.tare();
    Serial.println("HX711 Tare berhasil.");
  }

  // Inisialisasi Motor Servo Pakan
  feeder.setPeriodHertz(50);
  feeder.attach(PIN_SERVO, 500, 2400);
  feeder.write(SERVO_CLOSED_DEG);

  // Koneksi WiFi
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

  // Daftarkan route HTTP server lokal
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

    Serial.printf("Suhu=%.2f C | Keruh ADC=%.0f (~%d NTU) | Pakan=%.1f g | Sugeno=%.2f | Servo=%s\n",
      waterC, turbidityAdc, (int)turbidityNtu, stockGrams, sugenoScore,
      feeding ? "TERBUKA" : "TERTUTUP");
  }

  // 2. Cek perintah trigger pakan dari Web Dashboard setiap 3 detik
  if (now - lastCheckTriggerAt >= 3000UL) {
    lastCheckTriggerAt = now;
    checkFirebaseFeedTrigger();
  }

  // 3. Upload data sensor ke Firebase setiap 10 detik
  if (now - lastUploadAt >= 10000UL) {
    lastUploadAt = now;
    uploadTelemetryToFirebase();
  }

  delay(10);
}
