<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Service Laravel untuk Interaksi dengan Firebase Realtime Database
 */
class FirebasePondService
{
    protected string $databaseUrl;
    protected string $secretKey;
    protected array $nodes;

    public function __construct()
    {
        $this->databaseUrl = rtrim(config('firebase.database_url', env('FIREBASE_DATABASE_URL', '')), '/') . '/';
        $this->secretKey   = config('firebase.secret_key', env('FIREBASE_SECRET_KEY', ''));
        $this->nodes       = config('firebase.nodes', [
            'sensors'   => 'pond/sensors',
            'control'   => 'pond/control',
            'schedules' => 'pond/schedules',
            'history'   => 'pond/history',
        ]);
    }

    /**
     * Membentuk URL Firebase lengkap dengan query auth
     */
    protected function buildUrl(string $nodePath): string
    {
        $nodePath = ltrim($nodePath, '/');
        $url = $this->databaseUrl . $nodePath . '.json';

        if (!empty($this->secretKey) && !str_starts_with($this->secretKey, 'MASUKKAN_')) {
            $url .= '?auth=' . urlencode($this->secretKey);
        }

        return $url;
    }

    /**
     * Mengambil data dari Firebase (GET)
     */
    public function get(string $nodePath): mixed
    {
        try {
            $response = Http::timeout(8)->get($this->buildUrl($nodePath));
            if ($response->successful()) {
                return $response->json();
            }
            Log::warning("Firebase GET Error ({$nodePath}): " . $response->body());
            return null;
        } catch (\Throwable $e) {
            Log::error("Firebase GET Exception ({$nodePath}): " . $e->getMessage());
            return null;
        }
    }

    /**
     * Menimpa data secara penuh (PUT)
     */
    public function set(string $nodePath, array $data): bool
    {
        try {
            $response = Http::timeout(8)->put($this->buildUrl($nodePath), $data);
            return $response->successful();
        } catch (\Throwable $e) {
            Log::error("Firebase SET Exception ({$nodePath}): " . $e->getMessage());
            return false;
        }
    }

    /**
     * Memperbarui sebagian atribut (PATCH)
     */
    public function update(string $nodePath, array $data): bool
    {
        try {
            $response = Http::timeout(8)->patch($this->buildUrl($nodePath), $data);
            return $response->successful();
        } catch (\Throwable $e) {
            Log::error("Firebase UPDATE Exception ({$nodePath}): " . $e->getMessage());
            return false;
        }
    }

    /**
     * Menambahkan baris baru dengan ID unik (POST)
     */
    public function push(string $nodePath, array $data): bool
    {
        try {
            $response = Http::timeout(8)->post($this->buildUrl($nodePath), $data);
            return $response->successful();
        } catch (\Throwable $e) {
            Log::error("Firebase PUSH Exception ({$nodePath}): " . $e->getMessage());
            return false;
        }
    }

    public function getNode(string $name): string
    {
        return $this->nodes[$name] ?? "pond/{$name}";
    }

    public function getDatabaseUrl(): string
    {
        return $this->databaseUrl;
    }
}

