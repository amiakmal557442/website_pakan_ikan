<?php
require_once __DIR__ . '/firebase_config.php';

/**
 * Class FirebaseService
 * Pengelola komunikasi HTTP REST ke Firebase Realtime Database menggunakan cURL PHP murni
 * (Tidak membutuhkan library tambahan/composer, langsung bisa dijalankan di PHP 7.4 - 8.x)
 */
class FirebaseService {
    private $dbUrl;
    private $secretKey;

    public function __construct() {
        $this->dbUrl = rtrim(FIREBASE_DATABASE_URL, '/') . '/';
        $this->secretKey = FIREBASE_SECRET_KEY;
    }

    /**
     * Membentuk URL Firebase lengkap dengan ekstensi .json dan token otentikasi
     */
    private function buildUrl($nodePath) {
        $nodePath = ltrim($nodePath, '/');
        $url = $this->dbUrl . $nodePath . '.json';

        // Jika secret key diisi dan bukan placeholder default, tambahkan param auth
        if (!empty($this->secretKey) && strpos($this->secretKey, 'MASUKKAN_') === false) {
            $url .= '?auth=' . urlencode($this->secretKey);
        }

        return $url;
    }

    /**
     * Mengambil data (GET) dari node Firebase
     * @param string $nodePath Contoh: 'pond/sensors'
     * @return array|mixed
     */
    public function get($nodePath) {
        $url = $this->buildUrl($nodePath);
        return $this->executeCurl($url, 'GET');
    }

    /**
     * Menyimpan/Menimpa data penuh (PUT) ke node Firebase
     * @param string $nodePath Contoh: 'pond/control'
     * @param array $data
     * @return array|mixed
     */
    public function set($nodePath, $data) {
        $url = $this->buildUrl($nodePath);
        return $this->executeCurl($url, 'PUT', $data);
    }

    /**
     * Memperbarui sebagian atribut (PATCH) ke node Firebase
     * @param string $nodePath
     * @param array $data
     * @return array|mixed
     */
    public function update($nodePath, $data) {
        $url = $this->buildUrl($nodePath);
        return $this->executeCurl($url, 'PATCH', $data);
    }

    /**
     * Menambahkan data baru dengan Auto-ID (POST / push) ke node Firebase
     * @param string $nodePath Contoh: 'pond/history'
     * @param array $data
     * @return array|mixed
     */
    public function push($nodePath, $data) {
        $url = $this->buildUrl($nodePath);
        return $this->executeCurl($url, 'POST', $data);
    }

    /**
     * Eksekutor cURL
     */
    private function executeCurl($url, $method = 'GET', $data = null) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

        $headers = ['Content-Type: application/json'];

        if ($data !== null) {
            $jsonData = is_string($data) ? $data : json_encode($data);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonData);
            $headers[] = 'Content-Length: ' . strlen($jsonData);
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return [
                'success' => false,
                'error'   => 'cURL Error: ' . $curlError,
                'status'  => $httpCode
            ];
        }

        $decoded = json_decode($response, true);
        return [
            'success'   => ($httpCode >= 200 && $httpCode < 300),
            'http_code' => $httpCode,
            'data'      => $decoded !== null ? $decoded : $response
        ];
    }
}

