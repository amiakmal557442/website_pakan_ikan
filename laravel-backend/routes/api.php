<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\PondController;

/*
|--------------------------------------------------------------------------
| API Routes untuk Ambajaya Fish Kolam & Firebase
|--------------------------------------------------------------------------
| Masukkan atau salin baris rute ini ke dalam file routes/api.php di Laravel Anda.
*/

Route::prefix('pond')->group(function () {
    // 1. Uji koneksi Laravel ke Firebase
    Route::get('/test', [PondController::class, 'testConnection']);

    // 2. Ambil parameter status sensor, pakan & kontrol terkini
    Route::get('/status', [PondController::class, 'status']);

    // 3. Perintah keluarkan pakan dari web dashboard
    Route::post('/feed', [PondController::class, 'feed']);

    // 4. Update data sensor dari mikrokontroler ESP32
    Route::post('/sensor', [PondController::class, 'updateSensor']);

    // 5. Konfirmasi putaran servo selesai dari ESP32
    Route::post('/ack-feed', [PondController::class, 'ackFeed']);

    // 6. Sinkronisasi jadwal pakan
    Route::post('/schedules', [PondController::class, 'saveSchedules']);

    // 7. Isi ulang tabung pakan
    Route::post('/refill', [PondController::class, 'refill']);
});

