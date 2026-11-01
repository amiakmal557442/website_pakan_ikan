<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Konfigurasi Firebase Realtime Database
    |--------------------------------------------------------------------------
    | Nilai di bawah ini dibaca otomatis dari file .env proyek Laravel Anda.
    */

    // Project ID Firebase
    'project_id'   => env('FIREBASE_PROJECT_ID', 'connect-esp32-to-database'),

    // Database URL Realtime Database
    'database_url' => env('FIREBASE_DATABASE_URL', 'https://connect-esp32-to-database-default-rtdb.asia-southeast1.firebasedatabase.app/'),

    // Database Secret / Auth Key
    'secret_key'   => env('FIREBASE_SECRET_KEY', 'AIzaSyBJ56CgfhMKdp9HY9V6o1YbYz7Qb8Q374E'),

    // Service Account File (Opsional)
    'credentials'  => env('FIREBASE_CREDENTIALS', storage_path('app/firebase_credentials.json')),

    // Definisi Node Firebase untuk Kolam
    'nodes' => [
        'sensors'   => 'pond/sensors',
        'control'   => 'pond/control',
        'schedules' => 'pond/schedules',
        'history'   => 'pond/history',
    ],
];

