<?php
/**
 * ==============================================================================
 * KONFIGURASI KONEKSI FIREBASE (PHP NATIVE & REST API)
 * Proyek: Ambajaya Fish - Sistem Monitoring Air & Pakan Kolam Ikan
 * ==============================================================================
 */

// ==============================================================================
// >>> [1] KREDENSIAL FIREBASE RESMI ANDA TELAH DITERAPKAN DI SINI <<<
// ==============================================================================

// 1. URL Firebase Realtime Database Anda (diakhiri tanda garis miring "/")
define('FIREBASE_DATABASE_URL', 'https://connect-esp32-to-database-default-rtdb.asia-southeast1.firebasedatabase.app/');

// 2. Web API Key / Auth Token Firebase
define('FIREBASE_SECRET_KEY', 'AIzaSyBJ56CgfhMKdp9HY9V6o1YbYz7Qb8Q374E');

// 3. Project ID Firebase Anda
define('FIREBASE_PROJECT_ID', 'connect-esp32-to-database');

// ==============================================================================
// >>> [2] STRUKTUR PATH NODE DATABASE FIREBASE (DAPAT DISESUAIKAN) <<<
// ==============================================================================
define('NODE_POND_SENSORS',   'pond/sensors');   // Node untuk data suhu, kekeruhan, sisa pakan
define('NODE_POND_CONTROL',   'pond/control');   // Node perintah pakan dispenser (servo)
define('NODE_POND_SCHEDULES', 'pond/schedules'); // Node daftar jadwal jam pakan otomatis
define('NODE_POND_HISTORY',   'pond/history');   // Node riwayat pencatatan suhu & pakan

/**
 * Header Standar CORS & JSON agar API dapat diakses dari browser mana saja (Localhost, HP, Web)
 */
function setCorsHeaders() {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Content-Type: application/json; charset=UTF-8');

    // Tangani preflight request HTTP OPTIONS
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }
}

