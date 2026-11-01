<?php
/**
 * ==============================================================================
 * REST API ENDPOINT: Ambajaya Fish Kolam <-> Firebase Realtime Database
 * File ini menangani permintaan dari Web Dashboard dan Mikrokontroler Arduino/ESP32
 * ==============================================================================
 */

require_once __DIR__ . '/firebase_config.php';
require_once __DIR__ . '/FirebaseService.php';

// Terapkan header CORS & JSON
setCorsHeaders();

$firebase = new FirebaseService();
$method   = $_SERVER['REQUEST_METHOD'];
$action   = isset($_GET['action']) ? $_GET['action'] : 'status';

// Ambil input JSON dari body request
$rawInput = file_get_contents('php://input');
$inputData = json_decode($rawInput, true) ?? $_POST;

try {
    switch ($action) {

        // ======================================================================
        // 1. UJI KONEKSI FIREBASE
        // Endpoint: GET /backend-php/api.php?action=test
        // ======================================================================
        case 'test':
            $testResult = $firebase->get(NODE_POND_SENSORS);
            if ($testResult['success']) {
                echo json_encode([
                    'success' => true,
                    'message' => '✅ Berhasil tersambung ke Firebase Realtime Database!',
                    'project' => FIREBASE_PROJECT_ID,
                    'db_url'  => FIREBASE_DATABASE_URL
                ], JSON_PRETTY_PRINT);
            } else {
                echo json_encode([
                    'success' => false,
                    'message' => '❌ Gagal terhubung ke Firebase. Periksa URL atau API Key pada firebase_config.php.',
                    'details' => $testResult
                ], JSON_PRETTY_PRINT);
            }
            break;

        // ======================================================================
        // 2. AMBIL STATUS TERKINI (Suhu, Kekeruhan, Sisa Pakan, Kontrol)
        // Endpoint: GET /backend-php/api.php?action=status (atau get_data)
        // ======================================================================
        case 'status':
        case 'get_data':
            $sensorsRes  = $firebase->get(NODE_POND_SENSORS);
            $controlRes  = $firebase->get(NODE_POND_CONTROL);
            $schedRes    = $firebase->get(NODE_POND_SCHEDULES);

            $sensors = ($sensorsRes['success'] && is_array($sensorsRes['data'])) ? $sensorsRes['data'] : [];
            $control = ($controlRes['success'] && is_array($controlRes['data'])) ? $controlRes['data'] : [];
            $schedules = ($schedRes['success'] && is_array($schedRes['data'])) ? $schedRes['data'] : [];

            // Nilai fleksibel membaca format ESP32 suhu/temperatureC, sisa_pakan/stockGrams, kekeruhan/turbidityAdc
            $suhuVal      = isset($sensors['suhu']) ? floatval($sensors['suhu']) : (isset($sensors['temperatureC']) ? floatval($sensors['temperatureC']) : 28.5);
            $kekeruhanVal = isset($sensors['kekeruhan']) ? intval($sensors['kekeruhan']) : (isset($sensors['turbidityAdc']) ? intval($sensors['turbidityAdc']) : 18);
            $sisaPakanVal = isset($sensors['sisa_pakan']) ? floatval($sensors['sisa_pakan']) : (isset($sensors['stockGrams']) ? floatval($sensors['stockGrams']) : 850);
            $sugenoVal    = isset($sensors['sugenoScore']) ? floatval($sensors['sugenoScore']) : null;

            $response = [
                'suhu'         => $suhuVal,
                'temperatureC' => $suhuVal,
                'kekeruhan'    => $kekeruhanVal,
                'turbidityAdc' => isset($sensors['turbidityAdc']) ? floatval($sensors['turbidityAdc']) : null,
                'sisa_pakan'   => round($sisaPakanVal),
                'stockGrams'   => $sisaPakanVal,
                'sugenoScore'  => $sugenoVal,
                'feed_today'   => isset($sensors['feed_today']) ? intval($sensors['feed_today']) : 120,
                'feed_target'  => isset($sensors['feed_target']) ? intval($sensors['feed_target']) : 150,
                'control'      => [
                    'trigger_feed'   => !empty($control['trigger_feed']),
                    'dispense_gram'  => isset($control['dispense_gram']) ? intval($control['dispense_gram']) : 0,
                    'last_feed_time' => $control['last_feed_time'] ?? '-'
                ],
                'schedules'    => array_values($schedules),
                'updated_at'   => $sensors['updated_at'] ?? date('Y-m-d H:i:s')
            ];

            echo json_encode($response, JSON_PRETTY_PRINT);
            break;

        // ======================================================================
        // 3. PERINTAH DISPENSER KELUARKAN PAKAN (Dari Web Dashboard)
        // Endpoint: POST /backend-php/api.php?action=feed
        // Body JSON: {"grams": 25, "source": "Manual"}
        // ======================================================================
        case 'feed':
            $grams  = isset($inputData['grams']) ? intval($inputData['grams']) : 25;
            $source = isset($inputData['source']) ? $inputData['source'] : 'Manual';

            if ($grams <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Jumlah gram pakan harus lebih dari 0!']);
                exit();
            }

            // Ambil sisa pakan & hari ini saat ini dari Firebase
            $sensorsRes = $firebase->get(NODE_POND_SENSORS);
            $currentSensors = ($sensorsRes['success'] && is_array($sensorsRes['data'])) ? $sensorsRes['data'] : [];

            $sisaPakan  = isset($currentSensors['sisa_pakan']) ? intval($currentSensors['sisa_pakan']) : 850;
            $feedToday  = isset($currentSensors['feed_today']) ? intval($currentSensors['feed_today']) : 120;

            if ($sisaPakan < $grams) {
                http_response_code(400);
                echo json_encode([
                    'success' => false, 
                    'message' => "Pakan di tabung tidak mencukupi! Sisa: {$sisaPakan}g, Permintaan: {$grams}g."
                ]);
                exit();
            }

            $newSisaPakan = max(0, $sisaPakan - $grams);
            $newFeedToday = $feedToday + $grams;
            $currentTime  = date('H:i:s');
            $currentDate  = date('Y-m-d H:i:s');

            // 1. Tulis trigger ke node control agar Arduino ESP32 memutar motor servo
            $controlData = [
                'trigger_feed'  => true,
                'dispense_gram' => $grams,
                'source'        => $source,
                'requested_at'  => $currentDate,
                'last_feed_time'=> $currentTime
            ];
            $firebase->set(NODE_POND_CONTROL, $controlData);

            // 2. Update stok pakan di Firebase
            $firebase->update(NODE_POND_SENSORS, [
                'sisa_pakan' => $newSisaPakan,
                'feed_today' => $newFeedToday,
                'updated_at' => $currentDate
            ]);

            // 3. Catat riwayat pemberian pakan
            $firebase->push(NODE_POND_HISTORY, [
                'type'       => 'feed',
                'time'       => $currentTime,
                'grams'      => $grams,
                'source'     => $source,
                'status'     => 'Berhasil',
                'created_at' => $currentDate
            ]);

            echo json_encode([
                'success'         => true,
                'message'         => "Perintah pengeluaran {$grams} gram pakan berhasil dikirim ke Firebase!",
                'dispense_gram'   => $grams,
                'sisa_pakan_baru' => $newSisaPakan,
                'feed_today_baru' => $newFeedToday
            ], JSON_PRETTY_PRINT);
            break;

        // ======================================================================
        // 4. UPDATE DATA SENSOR DARI ARDUINO / ESP32
        // Endpoint: POST /backend-php/api.php?action=update_sensor
        // Body JSON: {"suhu": 28.6, "kekeruhan": 19, "sisa_pakan": 800}
        // ======================================================================
        case 'update_sensor':
            $suhu      = isset($inputData['suhu']) ? floatval($inputData['suhu']) : null;
            $kekeruhan = isset($inputData['kekeruhan']) ? intval($inputData['kekeruhan']) : null;
            $sisaPakan = isset($inputData['sisa_pakan']) ? intval($inputData['sisa_pakan']) : null;

            $updatePayload = [
                'updated_at' => date('Y-m-d H:i:s')
            ];

            if ($suhu !== null) $updatePayload['suhu'] = $suhu;
            if ($kekeruhan !== null) $updatePayload['kekeruhan'] = $kekeruhan;
            if ($sisaPakan !== null) $updatePayload['sisa_pakan'] = $sisaPakan;

            $result = $firebase->update(NODE_POND_SENSORS, $updatePayload);

            // Catat log pembacaan sensor berkala jika diperlukan
            if ($suhu !== null && $kekeruhan !== null) {
                $firebase->push(NODE_POND_HISTORY, [
                    'type'       => 'sensor',
                    'time'       => date('H:i:s'),
                    'suhu'       => $suhu,
                    'kekeruhan'  => $kekeruhan,
                    'created_at' => date('Y-m-d H:i:s')
                ]);
            }

            echo json_encode([
                'success' => $result['success'],
                'message' => 'Data sensor berhasil disimpan ke Firebase Realtime Database!',
                'data'    => $updatePayload
            ], JSON_PRETTY_PRINT);
            break;

        // ======================================================================
        // 5. KONFIRMASI MOTOR SERVO SUDAH BERPUTAR (Dari Arduino ESP32)
        // Endpoint: POST /backend-php/api.php?action=ack_feed
        // ======================================================================
        case 'ack_feed':
            $firebase->update(NODE_POND_CONTROL, [
                'trigger_feed'  => false,
                'dispense_gram' => 0,
                'executed_at'   => date('Y-m-d H:i:s')
            ]);

            echo json_encode([
                'success' => true,
                'message' => 'Status trigger pakan berhasil di-reset (Servo selesai berputar).'
            ], JSON_PRETTY_PRINT);
            break;

        // ======================================================================
        // 6. SIMPAN DAFTAR JADWAL PAKAN
        // Endpoint: POST /backend-php/api.php?action=schedules
        // Body JSON: {"schedules": [{"id":1, "time":"07:30", "grams":50, "enabled":true}, ...]}
        // ======================================================================
        case 'schedules':
            $schedules = isset($inputData['schedules']) ? $inputData['schedules'] : [];
            $res = $firebase->set(NODE_POND_SCHEDULES, $schedules);

            echo json_encode([
                'success' => $res['success'],
                'message' => 'Jadwal pakan kolam berhasil disinkronkan ke Firebase!',
                'count'   => count($schedules)
            ], JSON_PRETTY_PRINT);
            break;

        // ======================================================================
        // 7. ISI ULANG PAKAN (REFILL TABUNG)
        // Endpoint: POST /backend-php/api.php?action=refill
        // Body JSON: {"grams": 500}
        // ======================================================================
        case 'refill':
            $tambah = isset($inputData['grams']) ? intval($inputData['grams']) : 500;
            $sensorsRes = $firebase->get(NODE_POND_SENSORS);
            $currentSensors = ($sensorsRes['success'] && is_array($sensorsRes['data'])) ? $sensorsRes['data'] : [];
            $sisaPakan = isset($currentSensors['sisa_pakan']) ? intval($currentSensors['sisa_pakan']) : 500;

            $newTotal = min(1000, $sisaPakan + $tambah);
            $firebase->update(NODE_POND_SENSORS, [
                'sisa_pakan' => $newTotal,
                'updated_at' => date('Y-m-d H:i:s')
            ]);

            echo json_encode([
                'success'    => true,
                'message'    => "Berhasil isi ulang tabung pakan! Total: {$newTotal} gram.",
                'sisa_pakan' => $newTotal
            ], JSON_PRETTY_PRINT);
            break;

        default:
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'message' => "Aksi '{$action}' tidak dikenal. Opsi: test, status, feed, update_sensor, ack_feed, schedules, refill."
            ], JSON_PRETTY_PRINT);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage()
    ], JSON_PRETTY_PRINT);
}

