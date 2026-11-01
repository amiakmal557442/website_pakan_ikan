/**
 * SISTEM PAKAN & MONITORING KOLAM IKAN
 * Logika Aplikasi (JavaScript):
 * - Pemantauan Suhu Air (°C)
 * - Pemantauan Kekeruhan Air (NTU)
 * - Perhitungan & Kontrol Gram Pakan yang Dikeluarkan
 * - Kalkulator Kebutuhan Pakan Ikan
 * - Manajemen Jadwal Pakan
 * - Integrasi Hardware Arduino / ESP32 / ESP8266 & Mode Simulasi
 */

// ========================================================
// KREDENSIAL FIREBASE RESMI (WEB & DATABASE)
// ========================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBJ56CgfhMKdp9HY9V6o1YbYz7Qb8Q374E",
  authDomain: "connect-esp32-to-database.firebaseapp.com",
  databaseURL: "https://connect-esp32-to-database-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "connect-esp32-to-database",
  storageBucket: "connect-esp32-to-database.firebasestorage.app",
  messagingSenderId: "623633657442",
  appId: "1:623633657442:web:fbf8fbb80f48df125aeb3b"
};

// ========================================================
// 1. STATE & DATA AWAL (Disimpan juga di LocalStorage)
// ========================================================
const DEFAULT_STATE = {
  // Mode default langsung aktif ke Firebase
  mode: 'firebase',
  arduinoIp: 'http://192.168.1.50',
  feedApiUrl: 'http://192.168.1.50/feed?gram=',
  refreshInterval: 3,

  // Endpoint Backend Firebase (PHP Native atau Laravel)
  firebaseApiUrl: 'backend-php/api.php',
  fbRefreshInterval: 3,

  // Kapasitas Tabung Pakan
  storageCapacity: 1000, // gram
  storageRemaining: 850, // gram

  // Pakan Hari Ini
  feedToday: 120, // gram
  feedTarget: 150, // gram
  feedCountToday: 3,

  // Sensor
  currentTemp: 28.4,
  currentTurbidity: 18,
  sugenoScore: 0.85,

  // Jadwal Pakan
  schedules: [
    { id: 1, time: '07:30', grams: 50, enabled: true },
    { id: 2, time: '12:30', grams: 50, enabled: true },
    { id: 3, time: '17:00', grams: 50, enabled: true }
  ],

  // Riwayat Pembacaan Sensor Air Berbasis Teks
  waterReadings: [
    { time: '17:00:00', temp: 28.5, turb: 18, statusText: 'Ideal & Normal', statusClass: 'status-safe' },
    { time: '16:30:00', temp: 28.4, turb: 17, statusText: 'Ideal & Normal', statusClass: 'status-safe' },
    { time: '16:00:00', temp: 28.6, turb: 18, statusText: 'Ideal & Normal', statusClass: 'status-safe' },
    { time: '15:30:00', temp: 28.7, turb: 19, statusText: 'Ideal & Normal', statusClass: 'status-safe' },
    { time: '15:00:00', temp: 28.5, turb: 17, statusText: 'Ideal & Normal', statusClass: 'status-safe' },
    { time: '14:30:00', temp: 28.1, turb: 16, statusText: 'Ideal & Normal', statusClass: 'status-safe' },
    { time: '14:00:00', temp: 27.8, turb: 15, statusText: 'Ideal & Normal', statusClass: 'status-safe' }
  ]
};

// Ambil state dari localStorage atau gunakan default
let appState = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem('pondmaster_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      const merged = { ...DEFAULT_STATE, ...parsed };
      if (!merged.waterReadings || !Array.isArray(merged.waterReadings) || merged.waterReadings.length === 0) {
        merged.waterReadings = [...DEFAULT_STATE.waterReadings];
      }
      return merged;
    }
  } catch (e) {
    console.warn('Gagal memuat state dari storage, memakai default:', e);
  }
  return { ...DEFAULT_STATE };
}

function saveState() {
  try {
    localStorage.setItem('pondmaster_state', JSON.stringify(appState));
  } catch (e) {
    console.warn('Gagal menyimpan state:', e);
  }
}

// ========================================================
// 2. INISIALISASI ELEMEN DOM
// ========================================================
// Parameter Cards
const tempValueEl = document.getElementById('tempValue');
const tempStatusEl = document.getElementById('tempStatus');
const tempBarEl = document.getElementById('tempBar');

const turbidityValueEl = document.getElementById('turbidityValue');
const turbidityStatusEl = document.getElementById('turbidityStatus');
const turbidityBarEl = document.getElementById('turbidityBar');

const feedTodayValueEl = document.getElementById('feedTodayValue');
const feedTargetLabelEl = document.getElementById('feedTargetLabel');
const feedCountTodayEl = document.getElementById('feedCountToday');
const feedPercentTodayEl = document.getElementById('feedPercentToday');
const feedTodayBarEl = document.getElementById('feedTodayBar');

const storageGramsEl = document.getElementById('storageGrams');
const storageStatusEl = document.getElementById('storageStatus');
const storageBarEl = document.getElementById('storageBar');
const btnRefill = document.getElementById('btnRefill');

// Banner & Waktu
const currentDateTimeEl = document.getElementById('currentDateTime');
const nextFeedScheduleBadgeEl = document.getElementById('nextFeedScheduleBadge');
const connectionBadgeEl = document.getElementById('connectionBadge');
const connectionTextEl = document.getElementById('connectionText');

// Kontrol Pakan Cepat
const feedPresetBtns = document.querySelectorAll('.feed-preset-btn');
const customGramInput = document.getElementById('customGramInput');
const btnDispenseFeed = document.getElementById('btnDispenseFeed');
const dispenseGramsLabel = document.getElementById('dispenseGramsLabel');
const feedActionProgress = document.getElementById('feedActionProgress');
const feedActionStatusText = document.getElementById('feedActionStatusText');

// Kalkulator
const calcFishCount = document.getElementById('calcFishCount');
const calcAvgWeight = document.getElementById('calcAvgWeight');
const calcFeedingRate = document.getElementById('calcFeedingRate');
const calcFrequency = document.getElementById('calcFrequency');
const calcTotalBiomass = document.getElementById('calcTotalBiomass');
const calcDailyNeed = document.getElementById('calcDailyNeed');
const calcPerSession = document.getElementById('calcPerSession');
const btnApplyTarget = document.getElementById('btnApplyTarget');

// Jadwal
const btnToggleAddSchedule = document.getElementById('btnToggleAddSchedule');
const addScheduleBox = document.getElementById('addScheduleBox');
const newScheduleTime = document.getElementById('newScheduleTime');
const newScheduleGrams = document.getElementById('newScheduleGrams');
const btnSaveSchedule = document.getElementById('btnSaveSchedule');
const scheduleListContainer = document.getElementById('scheduleListContainer');

// Pemantauan Air Berbasis Teks
const waterStatusBadge = document.getElementById('waterStatusBadge');
const waterSummaryDot = document.getElementById('waterSummaryDot');
const waterStatusSummaryTitle = document.getElementById('waterStatusSummaryTitle');
const waterStatusSummaryDesc = document.getElementById('waterStatusSummaryDesc');
const waterTempSummaryText = document.getElementById('waterTempSummaryText');
const waterTurbSummaryText = document.getElementById('waterTurbSummaryText');
const waterReadingsList = document.getElementById('waterReadingsList');

// Layar Intro / Splash
const introSplash = document.getElementById('introSplash');
const introProgressBar = document.getElementById('introProgressBar');
const introStatusText = document.getElementById('introStatusText');
const introSkipBtn = document.getElementById('introSkipBtn');
let introFinished = false;

// Modal Pengaturan
const btnOpenSettings = document.getElementById('btnOpenSettings');
const settingsModal = document.getElementById('settingsModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelSettings = document.getElementById('btnCancelSettings');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const modeSimRadio = document.getElementById('modeSim');
const modeHwRadio = document.getElementById('modeHw');
const modeFbRadio = document.getElementById('modeFb');
const hardwareSettingsFields = document.getElementById('hardwareSettingsFields');
const firebaseSettingsFields = document.getElementById('firebaseSettingsFields');
const arduinoIpInput = document.getElementById('arduinoIpInput');
const feedApiUrlInput = document.getElementById('feedApiUrlInput');
const refreshIntervalInput = document.getElementById('refreshInterval');
const firebaseApiUrlInput = document.getElementById('firebaseApiUrlInput');
const fbRefreshIntervalInput = document.getElementById('fbRefreshInterval');
const btnTestConnection = document.getElementById('btnTestConnection');
const testConnectionResult = document.getElementById('testConnectionResult');
const btnTestFirebase = document.getElementById('btnTestFirebase');
const testFirebaseResult = document.getElementById('testFirebaseResult');

let selectedFeedGrams = 25;
let dataFetchTimer = null;
let lastTriggeredScheduleMinute = '';
let lastWaterLogTime = 0;

// ========================================================
// 3. INISIALISASI APLIKASI
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
  initIntroSplash();
  initDateTime();
  renderWaterTextSummary();
  renderWaterReadingsList();
  renderAllState();
  initEventListeners();
  calculateFeedRecommendation();
  startSensorMonitoring();
});

// ========================================================
// 4. LAYAR INTRO / SPLASH SCREEN
// ========================================================
function dismissIntro() {
  if (introFinished || !introSplash) return;
  introFinished = true;
  introSplash.classList.add('fade-out');
  setTimeout(() => {
    introSplash.style.display = 'none';
  }, 700);
}

function initIntroSplash() {
  if (!introSplash) return;

  // Tombol lewati intro langsung ke website utama
  if (introSkipBtn) {
    introSkipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissIntro();
    });
  }

  // Klik di sembarang area splash screen juga bisa langsung masuk
  introSplash.addEventListener('click', () => {
    dismissIntro();
  });

  // Animasi progress bar & pesan status pembuka (total ~1.8 detik)
  setTimeout(() => {
    if (introFinished) return;
    if (introProgressBar) introProgressBar.style.width = '35%';
    if (introStatusText) introStatusText.textContent = 'Memeriksa sensor suhu & kekeruhan...';
  }, 350);

  setTimeout(() => {
    if (introFinished) return;
    if (introProgressBar) introProgressBar.style.width = '70%';
    if (introStatusText) introStatusText.textContent = 'Menghubungkan kontrol pakan otomatis...';
  }, 850);

  setTimeout(() => {
    if (introFinished) return;
    if (introProgressBar) introProgressBar.style.width = '100%';
    if (introStatusText) introStatusText.textContent = 'Sistem kolam siap digunakan!';
  }, 1350);

  setTimeout(() => {
    dismissIntro();
  }, 1850);
}

// ========================================================
// 5. WAKTU & JAM SISTEM
// ========================================================
function initDateTime() {
  const updateClock = () => {
    const now = new Date();
    const optionsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('id-ID', optionsDate);
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    currentDateTimeEl.textContent = `${dateStr} • Pukul ${timeStr}`;

    // Cek jadwal pakan per menit
    checkScheduledFeed(now);
  };

  updateClock();
  setInterval(updateClock, 1000);
}

// ========================================================
// 6. UPDATE TAMPILAN SENSOR & PARAMETER (UI)
// ========================================================
function renderAllState() {
  renderSensors();
  renderFeedMetrics();
  renderSchedules();
  renderWaterTextSummary();
  renderWaterReadingsList();
  updateNextScheduleBadge();
  updateConnectionBadge();
}

/**
 * Menghitung & Memperbarui status Suhu Air
 */
function updateTemperature(val) {
  appState.currentTemp = parseFloat(val.toFixed(1));
  tempValueEl.textContent = appState.currentTemp.toFixed(1);

  // Status Suhu:
  // < 25: Dingin, 26 - 30: Ideal, > 30: Hangat/Panas
  const temp = appState.currentTemp;
  let statusText = 'Normal (Ideal)';
  let pillClass = 'status-safe';
  let barPercent = Math.min(100, Math.max(10, ((temp - 20) / (35 - 20)) * 100));

  if (temp < 25) {
    statusText = 'Air Terlalu Dingin';
    pillClass = 'status-warn';
  } else if (temp >= 25 && temp <= 30.5) {
    statusText = 'Ideal (Sehat)';
    pillClass = 'status-safe';
  } else if (temp > 30.5 && temp <= 32) {
    statusText = 'Mulai Hangat';
    pillClass = 'status-warn';
  } else {
    statusText = 'Terlalu Panas (Bahaya)';
    pillClass = 'status-alert';
  }

  tempStatusEl.className = `status-pill ${pillClass}`;
  tempStatusEl.textContent = statusText;
  tempBarEl.style.width = `${barPercent}%`;

  if (temp > 31 || temp < 24) {
    tempBarEl.style.backgroundColor = '#dc2626';
  } else {
    tempBarEl.style.backgroundColor = '#0284c7';
  }
}

/**
 * Menghitung & Memperbarui status Kekeruhan Air (NTU)
 */
function updateTurbidity(val) {
  appState.currentTurbidity = Math.round(val);
  turbidityValueEl.textContent = appState.currentTurbidity;

  const ntu = appState.currentTurbidity;
  let statusText = 'Air Jernih';
  let pillClass = 'status-safe';
  let barPercent = Math.min(100, Math.max(10, (ntu / 100) * 100));

  if (ntu < 25) {
    statusText = 'Air Jernih (Bagus)';
    pillClass = 'status-safe';
  } else if (ntu >= 25 && ntu <= 50) {
    statusText = 'Mulai Sedikit Keruh';
    pillClass = 'status-warn';
  } else {
    statusText = 'Air Keruh (Perlu Ganti)';
    pillClass = 'status-alert';
  }

  turbidityStatusEl.className = `status-pill ${pillClass}`;
  turbidityStatusEl.textContent = statusText;
  turbidityBarEl.style.width = `${barPercent}%`;

  if (ntu > 50) {
    turbidityBarEl.style.backgroundColor = '#dc2626';
  } else if (ntu >= 25) {
    turbidityBarEl.style.backgroundColor = '#d97706';
  } else {
    turbidityBarEl.style.backgroundColor = '#0284c7';
  }
}

function renderSensors() {
  updateTemperature(appState.currentTemp);
  updateTurbidity(appState.currentTurbidity);
}

/**
 * Menghitung & Menampilkan Metrik Pakan (Hari Ini & Sisa Tabung)
 */
function renderFeedMetrics() {
  // Pakan Hari Ini
  feedTodayValueEl.textContent = appState.feedToday;
  feedTargetLabelEl.textContent = `${appState.feedTarget}g`;
  feedCountTodayEl.textContent = `${appState.feedCountToday} kali`;

  const percentToday = Math.min(100, Math.round((appState.feedToday / appState.feedTarget) * 100));
  feedPercentTodayEl.textContent = `${percentToday}%`;
  feedTodayBarEl.style.width = `${percentToday}%`;

  // Sisa di Tabung Dispenser
  storageGramsEl.textContent = appState.storageRemaining;
  const storagePercent = Math.max(0, Math.round((appState.storageRemaining / appState.storageCapacity) * 100));
  storageBarEl.style.width = `${storagePercent}%`;

  if (storagePercent <= 15) {
    storageStatusEl.className = 'status-pill status-alert';
    storageStatusEl.textContent = `Kritis (${storagePercent}%) - Segera Isi`;
    storageBarEl.style.backgroundColor = '#dc2626';
  } else if (storagePercent <= 30) {
    storageStatusEl.className = 'status-pill status-warn';
    storageStatusEl.textContent = `Tersisa ${storagePercent}%`;
    storageBarEl.style.backgroundColor = '#d97706';
  } else {
    storageStatusEl.className = 'status-pill status-safe';
    storageStatusEl.textContent = `Kapasitas ${storagePercent}%`;
    storageBarEl.style.backgroundColor = '#0c8599';
  }
}

// ========================================================
// 7. LOGIKA PEMBERIAN PAKAN (DISPENSER)
// ========================================================

/**
 * Eksekusi pengeluaran pakan (manual maupun dari jadwal)
 */
async function dispenseFeed(grams, source = 'Manual') {
  if (appState.storageRemaining < grams) {
    alert(`Pakan di tabung tidak mencukupi! Sisa hanya ${appState.storageRemaining} gram, sedangkan permintaan ${grams} gram. Harap isi ulang tabung pakan.`);
    return false;
  }

  // Tampilkan loading / status servo
  feedActionProgress.style.display = 'flex';
  btnDispenseFeed.disabled = true;
  feedActionStatusText.textContent = `Mengeluarkan ${grams} gram pakan (${source})...`;

  let success = false;

  if (appState.mode === 'firebase') {
    // Mode Firebase: Kirim perintah pakan ke Backend PHP / Laravel (dengan Fallback Direct REST)
    try {
      let url = appState.firebaseApiUrl || 'backend-php/api.php';
      if (url.includes('.php')) {
        url += (url.includes('?') ? '&' : '?') + 'action=feed';
      } else {
        url = url.replace(/\/$/, '') + '/feed';
      }

      let resData = null;
      let ok = false;
      
      // Jika dibuka lewat web server HTTP/HTTPS, coba kirim ke backend PHP / Laravel
      if (window.location.protocol.startsWith('http')) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grams: grams, source: source })
          });
          if (response.ok) {
            resData = await response.json();
            ok = true;
          }
        } catch (backendErr) {
          ok = false;
        }
      }

      // Jika server PHP lokal belum menyala atau dibuka via file://, kirim langsung ke Firebase Cloud
      if (!ok) {
        console.warn('Backend server lokal belum aktif, mengirim trigger langsung ke Firebase Cloud...');
        const directUrl = `${FIREBASE_CONFIG.databaseURL}/pond/control.json?auth=${FIREBASE_CONFIG.apiKey}`;
        const directRes = await fetch(directUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trigger_feed: true,
            dispense_gram: grams,
            source: source,
            requested_at: new Date().toISOString(),
            last_feed_time: new Date().toLocaleTimeString('id-ID')
          })
        });
        ok = directRes.ok;
        resData = { success: ok };
      }

      if (ok && resData && resData.success !== false) {
        success = true;
      } else {
        throw new Error(resData?.message || 'Gagal mengirim trigger pakan ke Firebase');
      }
    } catch (err) {
      console.error('Gagal mengirim pakan ke Firebase:', err);
      alert(`Peringatan: Gagal mengirim sinyal ke Firebase (${err.message}). Sistem tetap mencatat simulasi lokal.`);
      success = true; // izinkan pencatatan lokal agar alur tidak terputus
    }
  } else if (appState.mode === 'hardware') {
    // Mode Hardware: Kirim request HTTP ke Arduino / ESP32
    try {
      const url = `${appState.feedApiUrl}${grams}`;
      const response = await fetch(url, { method: 'GET', mode: 'cors' });
      if (response.ok) {
        success = true;
      } else {
        throw new Error(`HTTP Status ${response.status}`);
      }
    } catch (err) {
      console.error('Gagal menghubungi ESP32/Arduino:', err);
      // Fallback atau notifikasi
      alert(`Peringatan: Gagal mengirim sinyal ke Arduino (${err.message}). Sistem tetap mencatat simulasi lokal.`);
      success = true; // izinkan pencatatan lokal agar alur tidak terputus
    }
  } else {
    // Mode Simulasi: Beri jeda 1.2 detik menirukan putaran servo
    await new Promise(r => setTimeout(r, 1200));
    success = true;
  }

  if (success) {
    // Hitung pengurangan di tabung & penambahan hari ini
    appState.storageRemaining -= grams;
    appState.feedToday += grams;
    appState.feedCountToday += 1;

    saveState();
    renderFeedMetrics();

    feedActionStatusText.textContent = `Berhasil! ${grams} gram pakan telah dituangkan.`;
    setTimeout(() => {
      feedActionProgress.style.display = 'none';
      btnDispenseFeed.disabled = false;
    }, 2000);

    return true;
  } else {
    feedActionProgress.style.display = 'none';
    btnDispenseFeed.disabled = false;
    return false;
  }
}

// ========================================================
// 8. KALKULATOR KEBUTUHAN PAKAN
// ========================================================
function calculateFeedRecommendation() {
  const fishCount = parseInt(calcFishCount.value) || 0;
  const avgWeight = parseFloat(calcAvgWeight.value) || 0; // gram
  const feedRate = parseFloat(calcFeedingRate.value) || 0.03; // e.g. 0.03 = 3%
  const frequency = parseInt(calcFrequency.value) || 3;

  // Total biomassa dalam kilogram
  const totalBiomassKg = (fishCount * avgWeight) / 1000;
  // Total gram pakan per hari = Biomassa (gram) * feedRate
  const totalDailyGrams = (fishCount * avgWeight) * feedRate;
  // Porsi per sesi
  const perSessionGrams = frequency > 0 ? (totalDailyGrams / frequency) : 0;

  calcTotalBiomass.textContent = `${totalBiomassKg.toFixed(2)} kg`;
  calcDailyNeed.textContent = `${Math.round(totalDailyGrams)} Gram/hari`;
  calcPerSession.textContent = `${Math.round(perSessionGrams)} Gram/sesi`;

  return Math.round(totalDailyGrams);
}

// ========================================================
// 9. JADWAL PAKAN OTOMATIS
// ========================================================
function renderSchedules() {
  scheduleListContainer.innerHTML = '';

  if (appState.schedules.length === 0) {
    scheduleListContainer.innerHTML = '<p class="section-desc" style="text-align:center;">Belum ada jadwal pakan aktif.</p>';
    return;
  }

  // Urutkan jadwal berdasarkan jam
  appState.schedules.sort((a, b) => a.time.localeCompare(b.time));

  appState.schedules.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = `schedule-item ${item.enabled ? '' : 'disabled'}`;
    itemEl.innerHTML = `
      <div class="schedule-left">
        <span class="schedule-time">${item.time}</span>
        <span class="schedule-grams">Takaran: <strong>${item.grams} gram</strong></span>
      </div>
      <div class="schedule-actions">
        <label class="switch" title="${item.enabled ? 'Nonaktifkan' : 'Aktifkan'}">
          <input type="checkbox" ${item.enabled ? 'checked' : ''} data-id="${item.id}" class="schedule-toggle">
          <span class="slider"></span>
        </label>
        <button class="btn-icon-danger btn-delete-schedule" data-id="${item.id}" title="Hapus Jadwal">✕</button>
      </div>
    `;
    scheduleListContainer.appendChild(itemEl);
  });

  // Event listener tombol toggle & hapus
  document.querySelectorAll('.schedule-toggle').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      const schedule = appState.schedules.find(s => s.id === id);
      if (schedule) {
        schedule.enabled = e.target.checked;
        saveState();
        renderSchedules();
        updateNextScheduleBadge();
      }
    });
  });

  document.querySelectorAll('.btn-delete-schedule').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      appState.schedules = appState.schedules.filter(s => s.id !== id);
      saveState();
      renderSchedules();
      updateNextScheduleBadge();
    });
  });
}

function updateNextScheduleBadge() {
  const now = new Date();
  const currentHM = now.toTimeString().substring(0, 5); // "HH:MM"

  // Cari jadwal hari ini yang belum lewat
  const activeSchedules = appState.schedules.filter(s => s.enabled);
  if (activeSchedules.length === 0) {
    nextFeedScheduleBadgeEl.textContent = 'Tidak Ada Jadwal Aktif';
    return;
  }

  const upcoming = activeSchedules.find(s => s.time > currentHM);
  if (upcoming) {
    nextFeedScheduleBadgeEl.textContent = `${upcoming.time} (${upcoming.grams} gr)`;
  } else {
    // Lewat semua hari ini, tampilkan yang pertama besok
    nextFeedScheduleBadgeEl.textContent = `${activeSchedules[0].time} (${activeSchedules[0].grams} gr - Besok)`;
  }
}

/**
 * Pengecekan otomatis jam jadwal pakan
 */
function checkScheduledFeed(nowDate) {
  const currentHM = nowDate.toTimeString().substring(0, 5); // "HH:MM"

  // Hindari eksekusi berulang dalam menit yang sama
  if (lastTriggeredScheduleMinute === currentHM) return;

  const matchSchedule = appState.schedules.find(s => s.enabled && s.time === currentHM);
  if (matchSchedule) {
    lastTriggeredScheduleMinute = currentHM;
    console.log(`Menjalankan jadwal pakan otomatis jam ${currentHM}: ${matchSchedule.grams} gram.`);
    dispenseFeed(matchSchedule.grams, `Jadwal Jam ${currentHM}`);
  }
}

// ========================================================
// 10. PEMANTAUAN KUALITAS AIR BERBASIS TEKS (PENGGANTI GRAFIK)
// ========================================================

/**
 * Menentukan status kondisi air dan keterangan teks
 */
function getWaterCondition(temp, turb) {
  if (turb > 50 || temp > 32 || temp < 23) {
    return {
      title: 'Peringatan: Kondisi Air Kolam Kritis!',
      badge: 'Perlu Tindakan',
      dotClass: 'alert',
      pillClass: 'status-alert',
      statusLabel: 'Kritis / Waspada',
      desc: `Suhu ${temp.toFixed(1)}°C dan kekeruhan ${turb} NTU berisiko bagi kesehatan ikan. Segera kuras atau sirkulasi air 30% dan tunda pemberian pakan berlebih.`
    };
  } else if (turb >= 25 || temp < 25 || temp > 30.5) {
    return {
      title: 'Kondisi Air Memerlukan Perhatian',
      badge: 'Perlu Pengawasan',
      dotClass: 'warn',
      pillClass: 'status-warn',
      statusLabel: 'Perlu Pantauan',
      desc: `Parameter air berada di batas toleransi (Suhu: ${temp.toFixed(1)}°C, Kekeruhan: ${turb} NTU). Amati keaktifan ikan dan pastikan aerator kolam bekerja normal.`
    };
  } else {
    return {
      title: 'Kondisi Air Kolam Sangat Baik',
      badge: 'Kondisi Ideal',
      dotClass: '',
      pillClass: 'status-safe',
      statusLabel: 'Ideal & Aman',
      desc: `Suhu air (${temp.toFixed(1)}°C) dan tingkat kekeruhan (${turb} NTU) berada pada rentang ideal budidaya. Ikan nyaman, sehat, dan dapat mengonsumsi pakan dengan lahap.`
    };
  }
}

/**
 * Memperbarui ringkasan teks terkini
 */
function renderWaterTextSummary() {
  const temp = appState.currentTemp;
  const turb = appState.currentTurbidity;
  const cond = getWaterCondition(temp, turb);

  if (waterStatusBadge) waterStatusBadge.textContent = cond.badge;
  if (waterSummaryDot) {
    waterSummaryDot.className = `status-indicator-dot ${cond.dotClass}`;
  }
  if (waterStatusSummaryTitle) waterStatusSummaryTitle.textContent = cond.title;
  if (waterStatusSummaryDesc) waterStatusSummaryDesc.textContent = cond.desc;

  if (waterTempSummaryText) {
    let tempNote = 'Normal & Sesuai Standar (26 - 30 °C)';
    if (temp < 25) tempNote = 'Cenderung Dingin (< 25 °C)';
    else if (temp > 30.5) tempNote = 'Hangat / Panas (> 30.5 °C)';
    waterTempSummaryText.innerHTML = `<strong>${temp.toFixed(1)} °C</strong> — ${tempNote}`;
  }

  if (waterTurbSummaryText) {
    let turbNote = 'Air Jernih & Bersih (< 25 NTU)';
    if (turb > 50) turbNote = 'Keruh Pekat (> 50 NTU)';
    else if (turb >= 25) turbNote = 'Mulai Sedikit Keruh (25 - 50 NTU)';
    waterTurbSummaryText.innerHTML = `<strong>${turb} NTU</strong> — ${turbNote}`;
  }
}

/**
 * Menampilkan riwayat pembacaan berkala dalam bentuk teks yang rapi
 */
function renderWaterReadingsList() {
  if (!waterReadingsList) return;
  waterReadingsList.innerHTML = '';

  if (!appState.waterReadings || appState.waterReadings.length === 0) {
    waterReadingsList.innerHTML = '<p class="section-desc" style="text-align:center; padding: 1rem;">Belum ada riwayat pembacaan sensor.</p>';
    return;
  }

  appState.waterReadings.forEach(item => {
    const row = document.createElement('div');
    row.className = 'reading-text-row';
    row.innerHTML = `
      <div class="reading-time-col">
        <span class="reading-clock">🕒 ${item.time}</span>
      </div>
      <div class="reading-info-col">
        <div class="reading-data">
          <span>Suhu: <strong>${item.temp}°C</strong></span>
          <span class="separator">•</span>
          <span>Kekeruhan: <strong>${item.turb} NTU</strong></span>
        </div>
      </div>
      <div class="reading-status-col">
        <span class="status-pill ${item.statusClass || 'status-safe'}">${item.statusText || 'Ideal'}</span>
      </div>
    `;
    waterReadingsList.appendChild(row);
  });
}

/**
 * Menambahkan catatan pembacaan baru ke daftar teks
 */
function addWaterReading(temp, turb, timeStr) {
  const cond = getWaterCondition(temp, turb);
  if (!appState.waterReadings) appState.waterReadings = [];

  const timeLabel = timeStr || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  appState.waterReadings.unshift({
    time: timeLabel,
    temp: parseFloat(temp.toFixed(1)),
    turb: Math.round(turb),
    statusText: cond.statusLabel,
    statusClass: cond.pillClass
  });

  // Pertahankan maksimal 12 baris teks terakhir agar ringkas dan cepat dimuat
  if (appState.waterReadings.length > 12) {
    appState.waterReadings.pop();
  }

  saveState();
  renderWaterReadingsList();
}

// ========================================================
// 11. MONITORING SENSOR & INTEGRASI ARDUINO
// ========================================================
function startSensorMonitoring() {
  if (dataFetchTimer) clearInterval(dataFetchTimer);

  const fetchLoop = async () => {
    if (appState.mode === 'firebase') {
      // Mode Firebase: Ambil data sensor terkini dari Backend PHP / Laravel
      try {
        let endpoint = appState.firebaseApiUrl || 'backend-php/api.php';
        if (endpoint.includes('.php')) {
          endpoint += (endpoint.includes('?') ? '&' : '?') + 'action=status';
        } else {
          endpoint = endpoint.replace(/\/$/, '') + '/status';
        }

        let data = null;
        let isOk = false;

        // Coba hubungi backend PHP / Laravel terlebih dahulu (jika server lokal menyala)
        if (window.location.protocol.startsWith('http')) {
          try {
            const res = await fetch(endpoint, { cache: 'no-store' });
            if (res.ok) {
              const text = await res.text();
              try {
                data = JSON.parse(text);
                isOk = true;
              } catch (parseErr) {
                // Respons bukan JSON (misal file PHP mentah karena server PHP belum menyala)
                isOk = false;
              }
            }
          } catch (fetchErr) {
            isOk = false;
          }
        }

        // Jika server lokal PHP belum menyala atau dibuka langsung lewat file://,
        // gunakan Direct Firebase Cloud REST API secara otomatis!
        if (!isOk) {
          try {
            const directUrl = `${FIREBASE_CONFIG.databaseURL}/pond/sensors.json`;
            const directRes = await fetch(directUrl, { cache: 'no-store' });
            if (directRes.ok) {
              const rawData = await directRes.json();
              if (rawData && typeof rawData === 'object') {
                data = {
                  suhu: rawData.suhu ?? rawData.temperatureC ?? 28.5,
                  kekeruhan: rawData.kekeruhan ?? rawData.turbidityAdc ?? 18,
                  sisa_pakan: rawData.sisa_pakan ?? rawData.stockGrams ?? 850,
                  feed_today: rawData.feed_today ?? 120,
                  feed_target: rawData.feed_target ?? 150,
                  sugenoScore: rawData.sugenoScore ?? null
                };
                isOk = true;
              }
            }
          } catch (e2) {
            isOk = false;
          }
        }

        if (isOk && data) {
          if (data.suhu !== undefined) updateTemperature(data.suhu);
          if (data.kekeruhan !== undefined) updateTurbidity(data.kekeruhan);
          if (data.sisa_pakan !== undefined) {
            appState.storageRemaining = data.sisa_pakan;
          }
          if (data.feed_today !== undefined) {
            appState.feedToday = data.feed_today;
          }
          if (data.feed_target !== undefined) {
            appState.feedTarget = data.feed_target;
          }
          if (data.sugenoScore !== undefined && data.sugenoScore !== null) {
            appState.sugenoScore = parseFloat(data.sugenoScore);
          }
          if (Array.isArray(data.schedules) && data.schedules.length > 0) {
            appState.schedules = data.schedules;
            renderSchedules();
          }

          renderFeedMetrics();
          updateConnectionBadge(true);
          renderWaterTextSummary();

          const nowMs = Date.now();
          if (nowMs - lastWaterLogTime >= 30000 || lastWaterLogTime === 0) {
            lastWaterLogTime = nowMs;
            const timeLabel = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            addWaterReading(appState.currentTemp, appState.currentTurbidity, timeLabel);
          }
        } else {
          updateConnectionBadge(false);
        }
      } catch (e) {
        console.warn('Gagal membaca data dari Firebase:', e);
        updateConnectionBadge(false);
      }
    } else if (appState.mode === 'hardware') {
      try {
        const endpoint = `${appState.arduinoIp}/data`;
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          // Format respons JSON yang diharapkan dari ESP32/Arduino:
          // { "suhu": 28.3, "kekeruhan": 19, "sisa_pakan": 800 }
          if (data.suhu !== undefined) updateTemperature(data.suhu);
          if (data.kekeruhan !== undefined) updateTurbidity(data.kekeruhan);
          if (data.sisa_pakan !== undefined) {
            appState.storageRemaining = data.sisa_pakan;
            renderFeedMetrics();
          }

          updateConnectionBadge(true);
          renderWaterTextSummary();

          // Catat ke riwayat teks berkala (setiap 30 detik agar rapi)
          const nowMs = Date.now();
          if (nowMs - lastWaterLogTime >= 30000 || lastWaterLogTime === 0) {
            lastWaterLogTime = nowMs;
            const timeLabel = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            addWaterReading(appState.currentTemp, appState.currentTurbidity, timeLabel);
          }
        } else {
          updateConnectionBadge(false);
        }
      } catch (e) {
        console.warn('Gagal membaca data dari Arduino:', e);
        updateConnectionBadge(false);
      }
    } else {
      // Mode Simulasi: berikan sedikit fluktuasi alami yang realistis
      const deltaTemp = (Math.random() - 0.5) * 0.2;
      let newTemp = appState.currentTemp + deltaTemp;
      newTemp = Math.max(26.0, Math.min(31.5, newTemp));
      updateTemperature(newTemp);

      const deltaTurb = Math.floor((Math.random() - 0.48) * 3);
      let newTurb = appState.currentTurbidity + deltaTurb;
      newTurb = Math.max(12, Math.min(45, newTurb));
      updateTurbidity(newTurb);

      renderWaterTextSummary();

      // Catat ke riwayat teks berkala (setiap 30 detik agar rapi)
      const nowMs = Date.now();
      if (nowMs - lastWaterLogTime >= 30000 || lastWaterLogTime === 0) {
        lastWaterLogTime = nowMs;
        const timeLabel = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        addWaterReading(appState.currentTemp, appState.currentTurbidity, timeLabel);
      }
    }
  };

  // Jalankan interval sesuai mode
  const intervalSec = (appState.mode === 'firebase' ? (appState.fbRefreshInterval || 3) : (appState.refreshInterval || 3)) * 1000;
  dataFetchTimer = setInterval(fetchLoop, intervalSec);
}

function updateConnectionBadge(isOnline = true) {
  if (appState.mode === 'simulation') {
    connectionBadgeEl.innerHTML = `<span class="status-dot online"></span> <span>Mode Simulasi (Demo)</span>`;
  } else if (appState.mode === 'firebase') {
    if (isOnline) {
      connectionBadgeEl.innerHTML = `<span class="status-dot online"></span> <span>Firebase Cloud (Aktif)</span>`;
    } else {
      connectionBadgeEl.innerHTML = `<span class="status-dot offline"></span> <span>Firebase Offline</span>`;
    }
  } else {
    if (isOnline) {
      connectionBadgeEl.innerHTML = `<span class="status-dot online"></span> <span>ESP32 Terhubung</span>`;
    } else {
      connectionBadgeEl.innerHTML = `<span class="status-dot offline"></span> <span>Arduino Tidak Terjangkau</span>`;
    }
  }
}

// ========================================================
// 12. EVENT LISTENERS
// ========================================================
function initEventListeners() {
  // Preset Porsi Pakan
  feedPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      feedPresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFeedGrams = parseInt(btn.dataset.grams);
      customGramInput.value = selectedFeedGrams;
      dispenseGramsLabel.textContent = selectedFeedGrams;
    });
  });

  // Input Gram Manual
  customGramInput.addEventListener('input', (e) => {
    let val = parseInt(e.target.value);
    if (!isNaN(val) && val > 0) {
      selectedFeedGrams = val;
      dispenseGramsLabel.textContent = val;
      // Lepas active di preset jika tidak pas
      feedPresetBtns.forEach(b => {
        if (parseInt(b.dataset.grams) === val) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    }
  });

  // Tombol Keluarkan Pakan
  btnDispenseFeed.addEventListener('click', () => {
    dispenseFeed(selectedFeedGrams, 'Manual');
  });

  // Tombol Isi Ulang Tabung Pakan
  btnRefill.addEventListener('click', () => {
    const tambah = prompt('Masukkan jumlah pakan yang diisi ke tabung (Gram):', '500');
    if (tambah !== null) {
      const g = parseInt(tambah);
      if (!isNaN(g) && g > 0) {
        appState.storageRemaining = Math.min(appState.storageCapacity, appState.storageRemaining + g);
        saveState();
        renderFeedMetrics();
        alert(`Berhasil mengisi tabung pakan! Total pakan saat ini: ${appState.storageRemaining} gram.`);
      }
    }
  });

  // Input Kalkulator
  [calcFishCount, calcAvgWeight, calcFeedingRate, calcFrequency].forEach(el => {
    el.addEventListener('input', calculateFeedRecommendation);
    el.addEventListener('change', calculateFeedRecommendation);
  });

  // Terapkan Target Pakan Harian dari Kalkulator
  btnApplyTarget.addEventListener('click', () => {
    const recGrams = calculateFeedRecommendation();
    appState.feedTarget = recGrams;
    saveState();
    renderFeedMetrics();
    alert(`Target pakan harian berhasil diperbarui menjadi ${recGrams} Gram/hari!`);
  });

  // Toggle Box Tambah Jadwal
  btnToggleAddSchedule.addEventListener('click', () => {
    if (addScheduleBox.style.display === 'none') {
      addScheduleBox.style.display = 'block';
      btnToggleAddSchedule.textContent = '✕ Tutup';
    } else {
      addScheduleBox.style.display = 'none';
      btnToggleAddSchedule.textContent = '+ Tambah Jam';
    }
  });

  // Simpan Jadwal Baru
  btnSaveSchedule.addEventListener('click', () => {
    const time = newScheduleTime.value;
    const grams = parseInt(newScheduleGrams.value);

    if (!time || isNaN(grams) || grams <= 0) {
      alert('Harap masukkan jam dan jumlah gram pakan yang valid!');
      return;
    }

    const newId = appState.schedules.length > 0 ? Math.max(...appState.schedules.map(s => s.id)) + 1 : 1;
    appState.schedules.push({
      id: newId,
      time: time,
      grams: grams,
      enabled: true
    });

    saveState();
    renderSchedules();
    updateNextScheduleBadge();

    addScheduleBox.style.display = 'none';
    btnToggleAddSchedule.textContent = '+ Tambah Jam';
  });

  // Modal Pengaturan Arduino & Firebase
  btnOpenSettings.addEventListener('click', openSettingsModal);
  btnCloseModal.addEventListener('click', closeSettingsModal);
  btnCancelSettings.addEventListener('click', closeSettingsModal);
  btnSaveSettings.addEventListener('click', saveSettingsModal);

  modeSimRadio.addEventListener('change', () => {
    hardwareSettingsFields.style.display = 'none';
    if (firebaseSettingsFields) firebaseSettingsFields.style.display = 'none';
  });

  if (modeFbRadio) {
    modeFbRadio.addEventListener('change', () => {
      hardwareSettingsFields.style.display = 'none';
      if (firebaseSettingsFields) firebaseSettingsFields.style.display = 'block';
    });
  }

  modeHwRadio.addEventListener('change', () => {
    hardwareSettingsFields.style.display = 'block';
    if (firebaseSettingsFields) firebaseSettingsFields.style.display = 'none';
  });

  btnTestConnection.addEventListener('click', testArduinoConnection);
  if (btnTestFirebase) {
    btnTestFirebase.addEventListener('click', testFirebaseConnection);
  }
}

// ========================================================
// 13. PENGATURAN KONEKSI ARDUINO & FIREBASE
// ========================================================
function openSettingsModal() {
  if (appState.mode === 'firebase') {
    if (modeFbRadio) modeFbRadio.checked = true;
    if (firebaseSettingsFields) firebaseSettingsFields.style.display = 'block';
    hardwareSettingsFields.style.display = 'none';
  } else if (appState.mode === 'hardware') {
    modeHwRadio.checked = true;
    hardwareSettingsFields.style.display = 'block';
    if (firebaseSettingsFields) firebaseSettingsFields.style.display = 'none';
  } else {
    modeSimRadio.checked = true;
    hardwareSettingsFields.style.display = 'none';
    if (firebaseSettingsFields) firebaseSettingsFields.style.display = 'none';
  }

  if (firebaseApiUrlInput) firebaseApiUrlInput.value = appState.firebaseApiUrl || 'backend-php/api.php';
  if (fbRefreshIntervalInput) fbRefreshIntervalInput.value = appState.fbRefreshInterval || 3;
  if (testFirebaseResult) testFirebaseResult.style.display = 'none';

  arduinoIpInput.value = appState.arduinoIp || 'http://192.168.1.50';
  feedApiUrlInput.value = appState.feedApiUrl || 'http://192.168.1.50/feed?gram=';
  refreshIntervalInput.value = appState.refreshInterval || 3;
  testConnectionResult.style.display = 'none';

  settingsModal.style.display = 'flex';
}

function closeSettingsModal() {
  settingsModal.style.display = 'none';
}

function saveSettingsModal() {
  if (modeFbRadio && modeFbRadio.checked) {
    appState.mode = 'firebase';
  } else if (modeHwRadio && modeHwRadio.checked) {
    appState.mode = 'hardware';
  } else {
    appState.mode = 'simulation';
  }

  if (firebaseApiUrlInput) {
    appState.firebaseApiUrl = firebaseApiUrlInput.value.trim() || 'backend-php/api.php';
  }
  if (fbRefreshIntervalInput) {
    appState.fbRefreshInterval = parseInt(fbRefreshIntervalInput.value) || 3;
  }

  appState.arduinoIp = arduinoIpInput.value.trim().replace(/\/$/, '');
  appState.feedApiUrl = feedApiUrlInput.value.trim();
  appState.refreshInterval = parseInt(refreshIntervalInput.value) || 3;

  saveState();
  closeSettingsModal();
  updateConnectionBadge();
  startSensorMonitoring();

  let modeLabel = 'Mode Simulasi';
  if (appState.mode === 'firebase') modeLabel = 'Firebase Cloud (PHP / Laravel Backend)';
  if (appState.mode === 'hardware') modeLabel = 'Hardware ESP32 WiFi Langsung';

  alert(`Pengaturan berhasil disimpan! Mode aktif: ${modeLabel}`);
}

async function testArduinoConnection() {
  const ip = arduinoIpInput.value.trim();
  if (!ip) {
    alert('Masukkan IP / URL Arduino terlebih dahulu.');
    return;
  }

  testConnectionResult.style.display = 'block';
  testConnectionResult.style.backgroundColor = '#e0f2fe';
  testConnectionResult.style.color = '#0369a1';
  testConnectionResult.textContent = 'Mencoba menghubungi mikrokontroler...';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${ip}/data`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      testConnectionResult.style.backgroundColor = '#dcfce7';
      testConnectionResult.style.color = '#15803d';
      testConnectionResult.textContent = '✅ Berhasil tersambung ke Arduino/ESP32! Sensor siap dibaca.';
    } else {
      throw new Error(`Respons kode HTTP ${res.status}`);
    }
  } catch (err) {
    testConnectionResult.style.backgroundColor = '#fee2e2';
    testConnectionResult.style.color = '#b91c1c';
    testConnectionResult.textContent = `❌ Sambungan gagal: ${err.message}. Pastikan ESP32 satu jaringan WiFi dengan HP / Laptop Anda.`;
  }
}

async function testFirebaseConnection() {
  let url = (firebaseApiUrlInput && firebaseApiUrlInput.value.trim()) ? firebaseApiUrlInput.value.trim() : 'backend-php/api.php';
  if (!url) {
    alert('Masukkan URL Endpoint Backend Firebase terlebih dahulu.');
    return;
  }

  if (url.includes('.php')) {
    url += (url.includes('?') ? '&' : '?') + 'action=test';
  } else {
    url = url.replace(/\/$/, '') + '/test';
  }

  if (testFirebaseResult) {
    testFirebaseResult.style.display = 'block';
    testFirebaseResult.style.backgroundColor = '#e0f2fe';
    testFirebaseResult.style.color = '#0369a1';
    testFirebaseResult.textContent = 'Mencoba menghubungi backend dan Firebase...';
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    const data = await res.json();
    if (res.ok && data.success) {
      if (testFirebaseResult) {
        testFirebaseResult.style.backgroundColor = '#dcfce7';
        testFirebaseResult.style.color = '#15803d';
        testFirebaseResult.textContent = `✅ ${data.message || 'Koneksi ke Firebase Berhasil!'}`;
      }
    } else {
      throw new Error(data.message || `Respons kode HTTP ${res.status}`);
    }
  } catch (err) {
    // Jika backend lokal belum dinyalakan, uji koneksi langsung ke Firebase REST
    try {
      const directTest = await fetch(`${FIREBASE_CONFIG.databaseURL}/pond/sensors.json`, { cache: 'no-store' });
      if (directTest.ok) {
        if (testFirebaseResult) {
          testFirebaseResult.style.backgroundColor = '#dcfce7';
          testFirebaseResult.style.color = '#15803d';
          testFirebaseResult.textContent = `✅ Berhasil tersambung langsung ke Firebase Cloud (${FIREBASE_CONFIG.projectId})! Server siap membaca & menulis data.`;
        }
        return;
      }
    } catch (e2) {
      // Abaikan dan tampilkan pesan error asli
    }

    if (testFirebaseResult) {
      testFirebaseResult.style.backgroundColor = '#fee2e2';
      testFirebaseResult.style.color = '#b91c1c';
      testFirebaseResult.textContent = `❌ Koneksi gagal: ${err.message}. Pastikan koneksi internet aktif.`;
    }
  }
}
