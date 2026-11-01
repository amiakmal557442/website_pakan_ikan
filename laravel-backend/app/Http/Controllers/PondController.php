<?php

namespace App\Http\Controllers;

use App\Services\FirebasePondService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Controller untuk Mengelola API Kolam Ikan & Firebase
 */
class PondController extends Controller
{
    protected FirebasePondService $firebase;

    public function __construct(FirebasePondService $firebase)
    {
        $this->firebase = $firebase;
    }

    /**
     * GET /api/pond/test
     * Menguji koneksi backend ke Firebase
     */
    public function testConnection(): JsonResponse
    {
        $testResult = $this->firebase->get($this->firebase->getNode('sensors'));

        if ($testResult !== null || is_array($testResult)) {
            return response()->json([
                'success' => true,
                'message' => '✅ Laravel berhasil terhubung ke Firebase Realtime Database!',
                'db_url'  => $this->firebase->getDatabaseUrl()
            ]);
        }

        return response()->json([
            'success' => false,
            'message' => '❌ Gagal terhubung ke Firebase. Periksa FIREBASE_DATABASE_URL dan FIREBASE_SECRET_KEY pada file .env Anda.'
        ], 500);
    }

    /**
     * GET /api/pond/status
     * Mengambil parameter kolam: suhu, kekeruhan, sisa pakan, kontrol, jadwal
     */
    public function status(): JsonResponse
    {
        $sensors   = $this->firebase->get($this->firebase->getNode('sensors')) ?? [];
        $control   = $this->firebase->get($this->firebase->getNode('control')) ?? [];
        $schedules = $this->firebase->get($this->firebase->getNode('schedules')) ?? [];

        $suhuVal      = isset($sensors['suhu']) ? (float)$sensors['suhu'] : (isset($sensors['temperatureC']) ? (float)$sensors['temperatureC'] : 28.5);
        $kekeruhanVal = isset($sensors['kekeruhan']) ? (int)$sensors['kekeruhan'] : (isset($sensors['turbidityAdc']) ? (int)$sensors['turbidityAdc'] : 18);
        $sisaPakanVal = isset($sensors['sisa_pakan']) ? (float)$sensors['sisa_pakan'] : (isset($sensors['stockGrams']) ? (float)$sensors['stockGrams'] : 850.0);
        $sugenoVal    = isset($sensors['sugenoScore']) ? (float)$sensors['sugenoScore'] : null;

        return response()->json([
            'suhu'         => $suhuVal,
            'temperatureC' => $suhuVal,
            'kekeruhan'    => $kekeruhanVal,
            'turbidityAdc' => isset($sensors['turbidityAdc']) ? (float)$sensors['turbidityAdc'] : null,
            'sisa_pakan'   => (int)round($sisaPakanVal),
            'stockGrams'   => $sisaPakanVal,
            'sugenoScore'  => $sugenoVal,
            'feed_today'   => isset($sensors['feed_today']) ? (int)$sensors['feed_today'] : 120,
            'feed_target'  => isset($sensors['feed_target']) ? (int)$sensors['feed_target'] : 150,
            'control'      => [
                'trigger_feed'   => !empty($control['trigger_feed']),
                'dispense_gram'  => isset($control['dispense_gram']) ? (int)$control['dispense_gram'] : 0,
                'last_feed_time' => $control['last_feed_time'] ?? '-'
            ],
            'schedules'    => is_array($schedules) ? array_values($schedules) : [],
            'updated_at'   => $sensors['updated_at'] ?? now()->toDateTimeString()
        ]);
    }

    /**
     * POST /api/pond/feed
     * Menerima perintah beri pakan dari web dashboard lalu mengirim trigger ke Firebase
     */
    public function feed(Request $request): JsonResponse
    {
        $request->validate([
            'grams'  => 'required|numeric|min:5|max:300',
            'source' => 'nullable|string'
        ]);

        $grams  = (int)$request->input('grams', 25);
        $source = $request->input('source', 'Manual');

        $sensors = $this->firebase->get($this->firebase->getNode('sensors')) ?? [];
        $sisaPakan = isset($sensors['sisa_pakan']) ? (int)$sensors['sisa_pakan'] : 850;
        $feedToday = isset($sensors['feed_today']) ? (int)$sensors['feed_today'] : 120;

        if ($sisaPakan < $grams) {
            return response()->json([
                'success' => false,
                'message' => "Pakan di tabung tidak mencukupi! Sisa: {$sisaPakan}g, Permintaan: {$grams}g."
            ], 400);
        }

        $newSisaPakan = max(0, $sisaPakan - $grams);
        $newFeedToday = $feedToday + $grams;
        $currentTime  = now()->format('H:i:s');
        $currentDate  = now()->toDateTimeString();

        // 1. Tulis trigger ke node control Firebase agar Arduino membaca dan memutar servo
        $this->firebase->set($this->firebase->getNode('control'), [
            'trigger_feed'  => true,
            'dispense_gram' => $grams,
            'source'        => $source,
            'requested_at'  => $currentDate,
            'last_feed_time'=> $currentTime
        ]);

        // 2. Perbarui sisa pakan di Firebase
        $this->firebase->update($this->firebase->getNode('sensors'), [
            'sisa_pakan' => $newSisaPakan,
            'feed_today' => $newFeedToday,
            'updated_at' => $currentDate
        ]);

        // 3. Catat riwayat
        $this->firebase->push($this->firebase->getNode('history'), [
            'type'       => 'feed',
            'time'       => $currentTime,
            'grams'      => $grams,
            'source'     => $source,
            'status'     => 'Berhasil',
            'created_at' => $currentDate
        ]);

        return response()->json([
            'success'         => true,
            'message'         => "Perintah pakan {$grams} gram berhasil dikirim ke Firebase!",
            'dispense_gram'   => $grams,
            'sisa_pakan_baru' => $newSisaPakan,
            'feed_today_baru' => $newFeedToday
        ]);
    }

    /**
     * POST /api/pond/sensor
     * Menerima pembaruan suhu & kekeruhan dari mikrokontroler ESP32
     */
    public function updateSensor(Request $request): JsonResponse
    {
        $payload = [
            'updated_at' => now()->toDateTimeString()
        ];

        if ($request->has('suhu')) {
            $payload['suhu'] = (float)$request->input('suhu');
        }
        if ($request->has('kekeruhan')) {
            $payload['kekeruhan'] = (int)$request->input('kekeruhan');
        }
        if ($request->has('sisa_pakan')) {
            $payload['sisa_pakan'] = (int)$request->input('sisa_pakan');
        }

        $updated = $this->firebase->update($this->firebase->getNode('sensors'), $payload);

        return response()->json([
            'success' => $updated,
            'message' => 'Data sensor berhasil disinkronkan ke Firebase!',
            'data'    => $payload
        ]);
    }

    /**
     * POST /api/pond/ack-feed
     * Konfirmasi dari ESP32 bahwa servo telah selesai memutar pakan
     */
    public function ackFeed(): JsonResponse
    {
        $this->firebase->update($this->firebase->getNode('control'), [
            'trigger_feed'  => false,
            'dispense_gram' => 0,
            'executed_at'   => now()->toDateTimeString()
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Status trigger pakan di Firebase berhasil di-reset.'
        ]);
    }

    /**
     * POST /api/pond/schedules
     * Menyimpan daftar jadwal pakan otomatis
     */
    public function saveSchedules(Request $request): JsonResponse
    {
        $schedules = $request->input('schedules', []);
        $saved = $this->firebase->set($this->firebase->getNode('schedules'), $schedules);

        return response()->json([
            'success' => $saved,
            'message' => 'Daftar jadwal pakan berhasil diperbarui di Firebase!'
        ]);
    }

    /**
     * POST /api/pond/refill
     * Isi ulang pakan pada tabung dispenser
     */
    public function refill(Request $request): JsonResponse
    {
        $tambah = (int)$request->input('grams', 500);
        $sensors = $this->firebase->get($this->firebase->getNode('sensors')) ?? [];
        $sisaPakan = isset($sensors['sisa_pakan']) ? (int)$sensors['sisa_pakan'] : 500;

        $newTotal = min(1000, $sisaPakan + $tambah);
        $this->firebase->update($this->firebase->getNode('sensors'), [
            'sisa_pakan' => $newTotal,
            'updated_at' => now()->toDateTimeString()
        ]);

        return response()->json([
            'success'    => true,
            'message'    => "Berhasil isi ulang! Total pakan saat ini: {$newTotal} gram.",
            'sisa_pakan' => $newTotal
        ]);
    }
}

