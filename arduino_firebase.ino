/*
 * ==============================================================================
 * SKETSA ARDUINO / ESP32: INTEGRASI FIREBASE REALTIME DATABASE (REST API)
 * Proyek: Ambajaya Fish - Sistem Monitoring Air & Pakan Kolam Ikan
 * ==============================================================================
 * 
 * Sketsa ini menggunakan HTTPClient bawaan ESP32 / ESP8266 untuk berkomunikasi
 * langsung dengan Firebase Realtime Database menggunakan REST API.
 * Anda TIDAK perlu menginstall library pihak ketiga yang rumit.
 * 
 * Hardware yang didukung:
 * 1. Mikrokontroler : ESP32 atau ESP8266 NodeMCU
 * 2. Sensor Suhu    : DS18B20 Waterproof (Pin Data GPIO 4 / D4)
 * 3. Sensor Keruh   : Turbidity Analog Gravity (Pin Analog GPIO 34 / A0)
 * 4. Dispenser Pakan: Motor Servo MG995 / SG90 (Pin PWM GPIO 13 / D2)
 */

#if defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #include <WiFiClientSecure.h>
  #include <Servo.h>
#elif defined(ESP32)
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <WiFiClientSecure.h>
  #include <ESP32Servo.h>
#endif

#include <OneWire.h>
#include <DallasTemperature.h>

// ==============================================================================
// >>> [1] KREDENSIAL FIREBASE RESMI ANDA TELAH DITERAPKAN DI SINI <<<
// ==============================================================================

// 1. Kredensial WiFi Rumah / Hotspot HP
const char* ssid     = "CirkitWifi";            // Ganti dengan SSID WiFi Anda
const char* password = "";                      // Ganti dengan Password WiFi Anda

// 2. Host Firebase Realtime Database (Tanpa "https://" dan tanpa garis miring di akhir)
const char* FIREBASE_HOST = "connect-esp32-to-database-default-rtdb.asia-southeast1.firebasedatabase.app";

// 3. API Key / Auth Token Firebase
const char* FIREBASE_AUTH = "AIzaSyBJ56CgfhMKdp9HY9V6o1YbYz7Qb8Q374E";

// ==============================================================================
// KONFIGURASI PIN HARDWARE
// ==============================================================================
#define PIN_SUHU_DS18B20  4   // Pin Data DS18B20
#define PIN_TURBIDITY    34   // Pin Analog Kekeruhan (GPIO 34 di ESP32 / A0 di ESP8266)
#define PIN_SERVO_PAKAN  13   // Pin Motor Servo Dispenser

OneWire oneWire(PIN_SUHU_DS18B20);
DallasTemperature sensorSuhu(&oneWire);
Servo servoPakan;

// Variabel status
float suhuAir = 28.5;
int kekeruhanNTU = 18;
int sisaPakanGram = 850;
const int GRAM_PER_CYCLE = 5; // Estimasi 1 siklus buka-tutup = 5 gram

unsigned long lastSendTime = 0;
const unsigned long sendInterval = 5000; // Kirim data sensor ke Firebase setiap 5 detik

// ==============================================================================
// FUNGSI BACA SENSOR
// ==============================================================================
void updateSensors() {
  sensorSuhu.requestTemperatures();
  float t = sensorSuhu.getTempCByIndex(0);
  if (t != DEVICE_DISCONNECTED_C && t > 0) {
    suhuAir = t;
  }

  int sensorValue = analogRead(PIN_TURBIDITY);
  float voltage = sensorValue * (3.3 / 4095.0);
  float ntu = -1120.4 * (voltage * voltage) + 5742.3 * voltage - 4353.8;
  if (ntu < 0) ntu = 0;
  if (ntu > 100) ntu = 100;
  kekeruhanNTU = (int)ntu;
}

// ==============================================================================
// FUNGSI MOTOR DISPENSER PAKAN (SERVO)
// ==============================================================================
void putarServoPakan(int gram) {
  int jumlahSiklus = gram / GRAM_PER_CYCLE;
  if (jumlahSiklus < 1) jumlahSiklus = 1;

  Serial.print("Mengeluarkan pakan: ");
  Serial.print(gram);
  Serial.println(" gram...");

  for (int i = 0; i < jumlahSiklus; i++) {
    servoPakan.write(90);  // Corong terbuka
    delay(200);
    servoPakan.write(0);   // Corong tertutup
    delay(200);
  }

  sisaPakanGram -= gram;
  if (sisaPakanGram < 0) sisaPakanGram = 0;
}

// ==============================================================================
// KIRIM DATA SENSOR KE FIREBASE
// ==============================================================================
void kirimSensorKeFirebase() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure(); // Mengabaikan validasi SSL certificate agar koneksi ringan
  HTTPClient https;

  String url = "https://" + String(FIREBASE_HOST) + "/pond/sensors.json?auth=" + String(FIREBASE_AUTH);

  if (https.begin(client, url)) {
    https.addHeader("Content-Type", "application/json");

    String json = "{";
    json += "\"suhu\":" + String(suhuAir, 1) + ",";
    json += "\"kekeruhan\":" + String(kekeruhanNTU) + ",";
    json += "\"sisa_pakan\":" + String(sisaPakanGram) + ",";
    json += "\"updated_at\":\"ESP32 Online\"";
    json += "}";

    int httpCode = https.PATCH(json);
    if (httpCode > 0) {
      Serial.print("Data sensor terkirim ke Firebase. Kode HTTP: ");
      Serial.println(httpCode);
    } else {
      Serial.print("Gagal kirim ke Firebase: ");
      Serial.println(https.errorToString(httpCode));
    }
    https.end();
  }
}

// ==============================================================================
// CEK PERINTAH PAKAN (TRIGGER) DARI FIREBASE
// ==============================================================================
void cekPerintahPakanFirebase() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;

  String url = "https://" + String(FIREBASE_HOST) + "/pond/control.json?auth=" + String(FIREBASE_AUTH);

  if (https.begin(client, url)) {
    int httpCode = https.GET();
    if (httpCode == HTTP_CODE_OK) {
      String payload = https.getString();
      
      // Jika terdeteksi "trigger_feed": true
      if (payload.indexOf("\"trigger_feed\":true") >= 0 || payload.indexOf("\"trigger_feed\": true") >= 0) {
        Serial.println(">>> TERIMA PERINTAH PAKAN DARI WEB VIA FIREBASE! <<<");
        
        // Ambil takaran gram
        int dispenseGram = 25;
        int gramIndex = payload.indexOf("\"dispense_gram\":");
        if (gramIndex >= 0) {
          int start = gramIndex + 16;
          int end = payload.indexOf(",", start);
          if (end == -1) end = payload.indexOf("}", start);
          if (end > start) {
            dispenseGram = payload.substring(start, end).toInt();
            if (dispenseGram <= 0) dispenseGram = 25;
          }
        }

        // Putar motor servo
        putarServoPakan(dispenseGram);

        // Reset trigger kembali ke false di Firebase
        https.end();
        String resetUrl = "https://" + String(FIREBASE_HOST) + "/pond/control.json?auth=" + String(FIREBASE_AUTH);
        if (https.begin(client, resetUrl)) {
          https.addHeader("Content-Type", "application/json");
          https.PATCH("{\"trigger_feed\":false,\"dispense_gram\":0}");
          Serial.println("Trigger pakan berhasil di-reset.");
        }
      }
    }
    https.end();
  }
}

// ==============================================================================
// SETUP & LOOP
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- Ambajaya Fish Kolam + Firebase IoT ---");

  sensorSuhu.begin();
  servoPakan.attach(PIN_SERVO_PAKAN);
  servoPakan.write(0);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Menghubungkan ke WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Berhasil Terhubung!");
  Serial.print("IP ESP32: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  updateSensors();

  // Cek perintah pemberian pakan setiap iterasi loop
  cekPerintahPakanFirebase();

  // Kirim pembacaan sensor setiap 5 detik
  if (millis() - lastSendTime >= sendInterval) {
    lastSendTime = millis();
    kirimSensorKeFirebase();
  }

  delay(1000);
}

