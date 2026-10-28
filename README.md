# 🐟 PondMaster - Sistem Monitoring Air & Pakan Ikan Otomatis

Aplikasi web pemantau kolam dan pengendali pakan ikan otomatis berbasis **HTML, CSS, dan JavaScript murni atau tanpa framework**. Didesain dengan ui yang bersih, sederhana, mudah dibaca, serta responsif baik saat dibuka melalui **Web** maupun **Mobile (Smartphone)**.

---

## 📌 Fitur Utama

1. **Pemantauan Suhu Air (°C)**:
   - Menghitung dan menampilkan suhu air secara *real-time*.
   - Indikator status otomatis (*Air Terlalu Dingin*, *Normal/Ideal 26–30°C*, atau *Terlalu Hangat/Bahaya*).
   - Grafik riwayat suhu air.

2. **Perhitungan & Pengeluaran Pakan Ikan (Gram)**:
   - Tombol pengeluaran pakan cepat (**10g, 25g, 50g, 100g**) dan input gram bebas.
   - Perhitungan akumulasi gram pakan yang telah keluar hari ini terhadap target harian.
   - Pemantau sisa gram pakan di dalam tabung/wadah penyimpanan (kapasitas 1.000 gram) beserta tombol isi ulang (*Refill*).
   - **Kalkulator Kebutuhan Pakan Ikan**: Menghitung dosis pakan harian berdasarkan jumlah ikan, berat rata-rata ikan, dan persentase pakan terhadap bobot tubuh.

3. **Pemantauan Kekeruhan Air (Turbidity / NTU)**:
   - Menghitung dan menampilkan tingkat kekeruhan air (*Jernih < 25 NTU*, *Sedang 25–50 NTU*, *Keruh > 50 NTU*).
   - Kotak analisis kualitas air yang memberikan saran tindakan langsung (misalnya rekomendasi kuras atau bersihkan filter bila air mulai pekat).

4. **Jadwal Pakan Otomatis**:
   - Atur jam pemberian pakan otomatis beserta takaran gram untuk tiap jadwal (misal 07:30, 12:30, 17:00).
   - Saklar aktif/non-aktifkan jadwal dengan mudah.

5. **Catatan Riwayat (Log)**:
   - Mencatat waktu, sumber (manual/jadwal), jumlah gram pakan yang dikeluarkan, dan status dispenser.

6. **Dukungan 2 Mode (Simulasi & Hardware Nyata)**:
   - **Mode Simulasi**: Anda dapat langsung mencoba seluruh fungsi di browser tanpa perlu alat terpasang.
   - **Mode Hardware**: Menghubungkan dashboard langsung ke mikrokontroler **ESP32 / ESP8266 / Arduino WiFi** melalui REST API.

---

## 📁 Struktur File Proyek

```text
website Arduino/
├── index.html          # Struktur halaman antarmuka web
├── style.css           # Desain tampilan bersih & responsif (Laptop & Handphone)
├── script.js           # Logika perhitungan suhu, pakan gram, kekeruhan, grafik, & API
├── arduino_code.ino    # Sketsa program mikrokontroler ESP32/ESP8266 siap pakai
└── README.md           # Panduan penggunaan
```

---

## 🚀 Cara Menjalankan di Laptop

1. **Cara Paling Cepat**:
   - Cukup buka file `index.html` langsung dengan klik 2x (akan otomatis terbuka di browser Chrome/Edge/Firefox).
2. **Menggunakan Web Server Lokal**:
   - Buka terminal/PowerShell di folder proyek ini:
     ```bash
     python -m http.server 8080
     ```
   - Buka browser di laptop: `http://localhost:8080`

---

## 📱 Cara Membuka & Mengontrol Lewat Handphone

Agar web dapat dibuka dari handphone Anda:
1. Pastikan **Laptop dan Handphone terhubung ke jaringan WiFi yang sama** (atau HP menyalakan Hotspot ke laptop).
2. Di laptop, jalankan server:
   ```bash
   python -m http.server 8080
   ```
3. Cari tahu alamat IP laptop Anda (bisa lewat `ipconfig` di command prompt). Contoh IP laptop: `192.168.1.15`.
4. Buka browser di handphone (Chrome / Safari) lalu ketik:
   ```text
   http://192.168.1.15:8080
   ```
5. Website akan menyesuaikan ukuran layar handphone secara otomatis, lengkap dengan tombol kontrol pakan dan grafik monitoring.

---

## 🔌 Cara Integrasi ke Hardware Arduino / ESP32

File `arduino_code.ino` sudah disiapkan di folder ini.

1. Buka file [arduino_code.ino](file:///c:/akmal%20project/website%20Arduino/arduino_code.ino) di software **Arduino IDE**.
2. Masukkan nama WiFi dan password rumah Anda pada baris:
   ```cpp
   const char* ssid     = "NAMA_WIFI_ANDA";
   const char* password = "PASSWORD_WIFI_ANDA";
   ```
3. Pasang komponen:
   - **Sensor Suhu DS18B20 (Waterproof)** ke pin **GPIO 4 (D4)**.
   - **Sensor Kekeruhan Air (Analog)** ke pin **GPIO 34 (A0)**.
   - **Motor Servo Pakan** ke pin **GPIO 13 (D2)**.
4. Upload program ke board ESP32/ESP8266.
5. Buka Serial Monitor (kecepatan baud `115200`). ESP32 akan menampilkan alamat IP-nya, misalnya `http://192.168.1.50`.
6. Di website (baik di laptop atau HP), klik tombol **⚙️ Pengaturan Alat**:
   - Pilih **Mode Hardware Nyata**.
   - Masukkan IP ESP32 (contoh: `http://192.168.1.50`).
   - Klik **Simpan Perubahan**.
7. Data suhu dan kekeruhan kini berasal langsung dari sensor fisik di kolam, dan tombol pakan akan langsung memutar motor servo pengeluaran pakan!
