# 🔥 Panduan Integrasi Firebase (PHP Native, Laravel & Arduino ESP32)

Dokumen ini menjelaskan cara menghubungkan sistem **Ambajaya Fish** ke **Firebase Realtime Database** menggunakan backend **PHP Native** atau **Laravel**, serta mikrokontroler **ESP32**.

---

## 📌 1. Cara Mendapatkan API Key & URL Firebase

1. Buka [Firebase Console](https://console.firebase.google.com/) dan buat project baru (atau buka project yang sudah ada).
2. Di menu sebelah kiri, pilih **Build** > **Realtime Database** > Klik **Create Database**.
   - Pilih lokasi server (disarankan: `Singapore (asia-southeast1)`).
   - Pada pilihan Rules (Aturan Keamanan), pilih **Start in test mode** untuk pengujian awal.
3. **Salin Database URL:**
   - URL berada di bagian atas tabel database, contohnya:
     `https://ambajaya-kolam-default-rtdb.asia-southeast1.firebasedatabase.app/`
4. **Dapatkan Database Secret Key (Auth Token):**
   - Klik ikon **⚙️ (Project settings)** di sebelah kiri atas samping tulisan *Project Overview*.
   - Pilih tab **Service accounts**.
   - Klik submenu **Database secrets**.
   - Klik tombol **Show** lalu salin token rahasia tersebut.

---

## 📌 2. Tempat Memasukkan API Key & Database URL

### A. Pilihan 1: Menggunakan PHP Native (Sangat Cepat & Tanpa Composer)
Buka file [`backend-php/firebase_config.php`](file:///c:/akmal%20project/website%20Arduino/backend-php/firebase_config.php), lalu masukkan kredensial Anda pada bagian berikut:

```php
// >>> [1] TEMPAT MEMASUKKAN FIREBASE API KEY & DATABASE URL <<<
define('FIREBASE_DATABASE_URL', 'https://NAMA_PROJECT_ANDA-default-rtdb.firebaseio.com/');
define('FIREBASE_SECRET_KEY',   'MASUKKAN_FIREBASE_DATABASE_SECRET_ATAU_API_KEY_DI_SINI');
define('FIREBASE_PROJECT_ID',   'NAMA_PROJECT_FIREBASE_ANDA');
```

**Cara Menjalankan Website + PHP Backend:**
Cukup jalankan server bawaan PHP di folder utama proyek:
```bash
php -S localhost:8080
```
Buka browser: `http://localhost:8080/index.html`

---

### B. Pilihan 2: Menggunakan Framework Laravel
Jika Anda menggunakan proyek Laravel, salin file dari folder `laravel-backend/`:
1. Salin baris berikut ke file `.env` di proyek Laravel Anda:
   ```env
   # >>> TEMPAT MEMASUKKAN FIREBASE API KEY & CONFIG DI LARAVEL <<<
   FIREBASE_PROJECT_ID=nama-project-firebase-anda
   FIREBASE_DATABASE_URL="https://nama-project-default-rtdb.firebaseio.com/"
   FIREBASE_SECRET_KEY="masukkan_database_secret_atau_api_key_di_sini"
   ```
2. Salin file berikut ke direktori proyek Laravel Anda:
   - `laravel-backend/config/firebase.php` &rarr; `config/firebase.php`
   - `laravel-backend/app/Services/FirebasePondService.php` &rarr; `app/Services/FirebasePondService.php`
   - `laravel-backend/app/Http/Controllers/PondController.php` &rarr; `app/Http/Controllers/PondController.php`
   - `laravel-backend/routes/api.php` &rarr; Tambahkan ke `routes/api.php`
3. Jalankan Laravel:
   ```bash
   php artisan serve
   ```
   Endpoint API Laravel Anda akan aktif di: `http://localhost:8000/api/pond`

---

### C. Pilihan 3: Pada Mikrokontroler Arduino / ESP32
Buka file [`arduino_firebase.ino`](file:///c:/akmal%20project/website%20Arduino/arduino_firebase.ino) di Arduino IDE:
```cpp
// >>> TEMPAT MEMASUKKAN WIFI & FIREBASE API KEY DI ARDUINO / ESP32 <<<
const char* ssid          = "NAMA_WIFI_ANDA";
const char* password      = "PASSWORD_WIFI_ANDA";
const char* FIREBASE_HOST = "NAMA_PROJECT_ANDA-default-rtdb.firebaseio.com"; // tanpa https://
const char* FIREBASE_AUTH = "MASUKKAN_DATABASE_SECRET_ATAU_API_KEY_DI_SINI";
```
Upload ke ESP32 Anda. ESP32 akan langsung mengirim data sensor ke Firebase dan mendengarkan perintah motor pakan.

---

## 📌 3. Struktur Node Realtime Database di Firebase

Data di Firebase Realtime Database disimpan dalam format JSON:

```json
{
  "pond": {
    "sensors": {
      "suhu": 28.5,
      "kekeruhan": 18,
      "sisa_pakan": 850,
      "feed_today": 120,
      "feed_target": 150,
      "updated_at": "2026-11-01 16:30:00"
    },
    "control": {
      "trigger_feed": false,
      "dispense_gram": 0,
      "source": "Manual",
      "last_feed_time": "12:30:00"
    },
    "schedules": [
      { "id": 1, "time": "07:30", "grams": 50, "enabled": true },
      { "id": 2, "time": "12:30", "grams": 50, "enabled": true },
      { "id": 3, "time": "17:00", "grams": 50, "enabled": true }
    ],
    "history": {
      "-OAx123abc": {
        "type": "feed",
        "time": "12:30:00",
        "grams": 25,
        "source": "Manual",
        "status": "Berhasil",
        "created_at": "2026-11-01 12:30:00"
      }
    }
  }
}
```

---

## 📌 4. Mengaktifkan Mode Firebase di Web Dashboard

1. Buka website di browser.
2. Klik tombol **⚙️ Pengaturan Alat** di pojok kanan atas navbar.
3. Pilih opsi **Mode Firebase Cloud (PHP / Laravel Backend)**.
4. Masukkan URL Endpoint:
   - Jika pakai PHP Native: `backend-php/api.php`
   - Jika pakai Laravel: `http://localhost:8000/api/pond`
5. Klik tombol **🔥 Uji Sambungan ke Firebase (via Backend)** untuk memastikan status tersambung.
6. Klik **Simpan Perubahan**. Dashboard Anda kini live terhubung ke cloud Firebase!

