/**
 * SISTEM PAKAN & MONITORING KOLAM IKAN
 * Logika Aplikasi (JavaScript):
 * - Pemantauan Suhu Air (°C)
 * - Pemantauan Kekeruhan Air (%)
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

  // Jeda Pakan Manual (Cooldown 5 Jam)
  lastManualFeedTimestamp: 0,

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

  // Jadwal Pakan (Disesuaikan porsi bulat & ideal untuk ikan kecil)
  schedules: [
    { id: 1, time: '07:30', grams: 25, enabled: true },
    { id: 2, time: '12:30', grams: 25, enabled: true },
    { id: 3, time: '17:00', grams: 25, enabled: true }
  ],

  // Profil & Tipe Ikan yang Dipakai (Koki, Guppy, Ikan Mas)
  selectedFishId: 'koki',
  fishTypes: [
    {
      id: 'koki',
      name: 'Ikan Koki',
      fullName: 'Ikan Mas Koki',
      latinName: 'Carassius auratus',
      icon: '🐠',
      tempMin: 20,
      tempMax: 24,
      turbidityMax: 25,
      feedDesc: 'Pelet mudah cerna 2,5 detik (25g), 2-3x sehari (lambat tenggelam)',
      desc: 'Ikan mas koki bertubuh bulat dengan nafsu makan besar. Membutuhkan air sejuk, filtrasi bersih, dan aerasi kaya oksigen.'
    },
    {
      id: 'guppy',
      name: 'Ikan Guppy',
      fullName: 'Ikan Guppy Hias',
      latinName: 'Poecilia reticulata',
      icon: '🐟',
      tempMin: 24,
      tempMax: 28,
      turbidityMax: 30,
      feedDesc: 'Pelet mikro / flake halus 1 detik (10g), 2x sehari',
      desc: 'Ikan hias mungil yang berenang lincah di permukaan air. Menyukai air tropis bersuhu hangat stabil dan arus tenang.'
    },
    {
      id: 'ikan-mas',
      name: 'Ikan Mas',
      fullName: 'Ikan Mas Biasa / Kolam',
      latinName: 'Cyprinus carpio',
      icon: '🎏',
      tempMin: 25,
      tempMax: 30,
      turbidityMax: 40,
      feedDesc: 'Pelet standar 2,5 - 5 detik (25g-50g), 3x sehari',
      desc: 'Ikan omnivora yang tangguh dan rakus di semua lapisan kolam. Mampu beradaptasi dengan variasi suhu dan kekeruhan air yang lebih luas.'
    }
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
      // Sanitasi nilai jadwal agar selalu bilangan bulat & minimal 5 gram
      if (Array.isArray(merged.schedules)) {
        merged.schedules.forEach(s => {
          s.grams = Math.max(5, Math.round(parseFloat(s.grams) || 25));
        });
      }
      // Sanitasi data tipe ikan (Koki, Guppy, Ikan Mas)
      if (!Array.isArray(merged.fishTypes) || merged.fishTypes.length === 0) {
        merged.fishTypes = [...DEFAULT_STATE.fishTypes];
      }
      if (!merged.selectedFishId) {
        merged.selectedFishId = DEFAULT_STATE.selectedFishId;
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
const btnDispenseFeed = document.getElementById('btnDispenseFeed');
const feedActionProgress = document.getElementById('feedActionProgress');
const feedActionStatusText = document.getElementById('feedActionStatusText');
const feedCooldownBox = document.getElementById('feedCooldownBox');
const cooldownLastTime = document.getElementById('cooldownLastTime');
const cooldownTimerBadge = document.getElementById('cooldownTimerBadge');
const btnResetCooldown = document.getElementById('btnResetCooldown');

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
const introVideo = document.getElementById('introVideo');
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

// Modal Panduan Pemasangan IoT
const btnOpenIotGuide = document.getElementById('btnOpenIotGuide');
const iotGuideModal = document.getElementById('iotGuideModal');
const btnCloseIotGuideModal = document.getElementById('btnCloseIotGuideModal');
const btnCloseIotGuideBottom = document.getElementById('btnCloseIotGuideBottom');
const btnIotGuideToSettings = document.getElementById('btnIotGuideToSettings');
const btnCopyPinout = document.getElementById('btnCopyPinout');

// Selektor & Modal Tipe Ikan
const quickPillFish = document.getElementById('quickPillFish');
const activeFishPillText = document.getElementById('activeFishPillText');
const currentFishHeading = document.getElementById('currentFishHeading');
const currentFishDescription = document.getElementById('currentFishDescription');
const btnOpenFishModal = document.getElementById('btnOpenFishModal');
const fishPillButtonsContainer = document.getElementById('fishPillButtonsContainer');
const fishTypeModal = document.getElementById('fishTypeModal');
const btnCloseFishModal = document.getElementById('btnCloseFishModal');
const btnCloseFishModalBottom = document.getElementById('btnCloseFishModalBottom');
const fishCardsList = document.getElementById('fishCardsList');
const btnToggleAddFishForm = document.getElementById('btnToggleAddFishForm');
const addFishFormBox = document.getElementById('addFishFormBox');
const btnSaveNewFish = document.getElementById('btnSaveNewFish');
const newFishName = document.getElementById('newFishName');
const newFishTempMin = document.getElementById('newFishTempMin');
const newFishTempMax = document.getElementById('newFishTempMax');
const newFishTurbMax = document.getElementById('newFishTurbMax');
const newFishIcon = document.getElementById('newFishIcon');
const newFishFeedDesc = document.getElementById('newFishFeedDesc');
const newFishNotes = document.getElementById('newFishNotes');
const tempLabelCold = document.getElementById('tempLabelCold');
const tempLabelIdeal = document.getElementById('tempLabelIdeal');
const tempLabelWarm = document.getElementById('tempLabelWarm');

// Switch Tema Latar Hitam / Putih
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeToggleText = document.getElementById('themeToggleText');

// Komponen Diagram Perbandingan Pakan
const tabFeedBarChart = document.getElementById('tabFeedBarChart');
const tabFeedDonutChart = document.getElementById('tabFeedDonutChart');
const feedBarChartView = document.getElementById('feedBarChartView');
const feedDonutChartView = document.getElementById('feedDonutChartView');
const feedBarsContainer = document.getElementById('feedBarsContainer');
const chartFeedTodayVal = document.getElementById('chartFeedTodayVal');
const chartFeedTodayGram = document.getElementById('chartFeedTodayGram');
const chartFeedTargetVal = document.getElementById('chartFeedTargetVal');
const chartFeedTargetGram = document.getElementById('chartFeedTargetGram');
const chartFeedPercentVal = document.getElementById('chartFeedPercentVal');
const chartFeedRemainingVal = document.getElementById('chartFeedRemainingVal');
const donutProgressRing = document.getElementById('donutProgressRing');
const donutPercentText = document.getElementById('donutPercentText');
const donutDoneText = document.getElementById('donutDoneText');
const donutRemainText = document.getElementById('donutRemainText');
const donutStorageText = document.getElementById('donutStorageText');
const feedChartFooterNote = document.getElementById('feedChartFooterNote');
let currentFeedChartTab = 'bar';

let selectedFeedGrams = 25;
let dataFetchTimer = null;
let lastTriggeredScheduleMinute = '';
let lastWaterLogTime = 0;

// ========================================================
// 3. INISIALISASI APLIKASI
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initIntroSplash();
  initDateTime();
  initFeedChartTabs();
  renderWaterTextSummary();
  renderWaterReadingsList();
  renderAllState();
  renderFeedChart();
  initEventListeners();
  startSensorMonitoring();
});

// ========================================================
// 4. LAYAR INTRO / SPLASH SCREEN
// ========================================================
function dismissIntro() {
  if (introFinished || !introSplash) return;
  introFinished = true;
  if (introVideo) {
    try {
      introVideo.pause();
    } catch (e) {}
  }
  introSplash.classList.add('fade-out');
  setTimeout(() => {
    introSplash.style.display = 'none';
  }, 800);
}

function initIntroSplash() {
  if (!introSplash) return;

  // Jalankan video intro pembuka otomatis
  if (introVideo) {
    introVideo.play().catch(() => {
      // Browser autoplay policy fallback
    });

    // Otomatis selesai dan masuk jika video telah tuntas diputar
    introVideo.addEventListener('ended', () => {
      setTimeout(() => {
        dismissIntro();
      }, 350);
    });
  }

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

  // Animasi progress bar & pesan status pembuka (menyesuaikan durasi video ~3 detik)
  setTimeout(() => {
    if (introFinished) return;
    if (introProgressBar) introProgressBar.style.width = '35%';
    if (introStatusText) introStatusText.textContent = 'Memeriksa sensor suhu & kekeruhan air...';
  }, 600);

  setTimeout(() => {
    if (introFinished) return;
    if (introProgressBar) introProgressBar.style.width = '70%';
    if (introStatusText) introStatusText.textContent = 'Menghubungkan kontrol dispenser pakan otomatis...';
  }, 1600);

  setTimeout(() => {
    if (introFinished) return;
    if (introProgressBar) introProgressBar.style.width = '100%';
    if (introStatusText) introStatusText.textContent = 'Sistem kolam siap digunakan!';
  }, 2700);

  // Fallback timer maksimal 3.8 detik jika video tidak trigger event ended
  setTimeout(() => {
    dismissIntro();
  }, 3800);
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

    // Perbarui countdown jeda pakan manual 5 jam secara real-time
    updateFeedButtonCooldownUI();
  };

  updateClock();
  setInterval(updateClock, 1000);
}

// ========================================================
// 6. UPDATE TAMPILAN SENSOR & PARAMETER (UI)
// ========================================================
function renderAllState() {
  renderFishUI();
  renderSensors();
  renderFeedMetrics();
  renderSchedules();
  renderWaterTextSummary();
  renderWaterReadingsList();
  updateNextScheduleBadge();
  updateConnectionBadge();
  updateFeedButtonCooldownUI();
}

/**
 * Menghitung & Memperbarui status Suhu Air
 */
function updateTemperature(val) {
  if (val === null || val === undefined || isNaN(val) || val <= -50 || val >= 120) {
    appState.currentTemp = null;
    tempValueEl.textContent = '--';
    tempStatusEl.className = 'status-pill status-alert';
    tempStatusEl.textContent = 'Sensor Tidak Terdeteksi';
    tempBarEl.style.width = '0%';
    tempBarEl.style.backgroundColor = '#dc2626';
    return;
  }

  appState.currentTemp = parseFloat(Number(val).toFixed(1));
  tempValueEl.textContent = appState.currentTemp.toFixed(1);

  // Status Suhu disesuaikan dengan tipe ikan yang aktif
  const temp = appState.currentTemp;
  const activeFish = getActiveFish();
  const minT = activeFish.tempMin || 24;
  const maxT = activeFish.tempMax || 28;

  let statusText = `Ideal (${activeFish.name})`;
  let pillClass = 'status-safe';
  let barPercent = Math.min(100, Math.max(10, ((temp - 15) / (35 - 15)) * 100));

  if (temp < minT - 2) {
    statusText = `Sangat Dingin (< ${minT}°C)`;
    pillClass = 'status-alert';
  } else if (temp < minT) {
    statusText = `Dingin (< ${minT}°C)`;
    pillClass = 'status-warn';
  } else if (temp >= minT && temp <= maxT) {
    statusText = `Normal (Ideal ${activeFish.name})`;
    pillClass = 'status-safe';
  } else if (temp > maxT && temp <= maxT + 2.5) {
    statusText = `Mulai Hangat (> ${maxT}°C)`;
    pillClass = 'status-warn';
  } else {
    statusText = `Terlalu Panas (> ${maxT + 2.5}°C)`;
    pillClass = 'status-alert';
  }

  tempStatusEl.className = `status-pill ${pillClass}`;
  tempStatusEl.textContent = statusText;
  tempBarEl.style.width = `${barPercent}%`;

  if (temp > maxT + 2 || temp < minT - 1.5) {
    tempBarEl.style.backgroundColor = '#dc2626';
  } else if (temp >= minT && temp <= maxT) {
    tempBarEl.style.backgroundColor = '#16a34a';
  } else {
    tempBarEl.style.backgroundColor = '#0284c7';
  }
}

/**
 * Menghitung & Memperbarui status Kekeruhan Air (%)
 */
function updateTurbidity(val) {
  appState.currentTurbidity = Math.round(val);
  turbidityValueEl.textContent = appState.currentTurbidity;

  const ntu = appState.currentTurbidity;
  const activeFish = getActiveFish();
  const maxTurb = activeFish.turbidityMax || 30;

  let statusText = 'Air Jernih (Aman)';
  let pillClass = 'status-safe';
  let barPercent = Math.min(100, Math.max(10, (ntu / 100) * 100));

  if (ntu > maxTurb + 15) {
    statusText = 'Air Keruh (Bahaya)';
    pillClass = 'status-alert';
  } else if (ntu > maxTurb) {
    statusText = 'Melebihi Batas Ideal';
    pillClass = 'status-warn';
  } else {
    statusText = 'Air Jernih (Bagus)';
    pillClass = 'status-safe';
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

  // Perbarui Diagram Perbandingan Pakan
  renderFeedChart();
}

// ========================================================
// 7. LOGIKA PEMBERIAN PAKAN (DISPENSER) & JEDA 5 JAM
// ========================================================

// Durasi jeda tombol pakan manual: 5 Jam (5 * 60 * 60 * 1000 ms)
const FEED_COOLDOWN_HOURS = 5;
const FEED_COOLDOWN_MS = FEED_COOLDOWN_HOURS * 60 * 60 * 1000;

/**
 * Menghitung sisa waktu jeda pakan manual dalam milidetik
 */
function getFeedCooldownRemaining() {
  const lastTime = Number(appState.lastManualFeedTimestamp) || 0;
  if (!lastTime) return 0;
  const elapsed = Date.now() - lastTime;
  const remaining = FEED_COOLDOWN_MS - elapsed;
  return remaining > 0 ? remaining : 0;
}

/**
 * Cek apakah tombol pakan manual sedang dalam masa jeda 5 jam
 */
function isFeedOnCooldown() {
  return getFeedCooldownRemaining() > 0;
}

/**
 * Format milidetik ke string jam, menit, detik (contoh: "04j 58m 20d")
 */
function formatCooldownTimer(ms) {
  if (ms <= 0) return '00j 00m 00d';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}j ${pad(minutes)}m ${pad(seconds)}d`;
}

/**
 * Memperbarui tampilan tombol dan notifikasi jeda pakan manual secara real-time
 */
function updateFeedButtonCooldownUI() {
  if (!btnDispenseFeed) return;

  // Jangan ubah tombol jika sedang dalam proses penuangan servo aktif
  if (feedActionProgress && feedActionProgress.style.display === 'flex') {
    return;
  }

  const remaining = getFeedCooldownRemaining();
  const onCooldown = remaining > 0;

  if (onCooldown) {
    btnDispenseFeed.disabled = true;
    btnDispenseFeed.classList.add('btn-cooldown');
    btnDispenseFeed.innerHTML = `<span class="btn-icon">⏳</span> Jeda Pakan: ${formatCooldownTimer(remaining)}`;

    if (feedCooldownBox) {
      feedCooldownBox.style.display = 'block';
    }
    if (cooldownTimerBadge) {
      cooldownTimerBadge.textContent = formatCooldownTimer(remaining);
    }
    if (cooldownLastTime && appState.lastManualFeedTimestamp) {
      const feedDate = new Date(appState.lastManualFeedTimestamp);
      cooldownLastTime.textContent = feedDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  } else {
    btnDispenseFeed.disabled = false;
    btnDispenseFeed.classList.remove('btn-cooldown');
    btnDispenseFeed.innerHTML = `<span class="btn-icon">🚀</span> Keluarkan Pakan`;

    if (feedCooldownBox) {
      feedCooldownBox.style.display = 'none';
    }
  }
}

/**
 * Eksekusi pengeluaran pakan (manual maupun dari jadwal)
 */
async function dispenseFeed(grams, source = 'Manual') {
  // Jika dipicu manual dan masih dalam periode jeda 5 jam, tolak
  if (source === 'Manual' && isFeedOnCooldown()) {
    const rem = getFeedCooldownRemaining();
    alert(`Pakan manual masih dalam masa jeda!\nSisa waktu: ${formatCooldownTimer(rem)}.\nJeda 5 jam diterapkan demi menjaga kesehatan ikan & kualitas air kolam.`);
    return false;
  }

  if (appState.storageRemaining < grams) {
    alert(`Pakan di tabung tidak mencukupi! Sisa hanya ${appState.storageRemaining} gram, sedangkan permintaan ${grams} gram. Harap isi ulang tabung pakan.`);
    return false;
  }

  // Tampilkan loading / status servo
  feedActionProgress.style.display = 'flex';
  btnDispenseFeed.disabled = true;
  feedActionStatusText.textContent = `Mengeluarkan pakan (${formatFeedDuration(grams)}, ${source})...`;

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

    // Catat waktu pakan manual untuk mengaktifkan jeda 5 jam
    if (source === 'Manual') {
      appState.lastManualFeedTimestamp = Date.now();
    }

    saveState();
    renderFeedMetrics();

    feedActionStatusText.textContent = `Berhasil! Pakan telah dituangkan (${formatFeedDuration(grams)}).`;
    setTimeout(() => {
      feedActionProgress.style.display = 'none';
      updateFeedButtonCooldownUI();
    }, 2000);

    return true;
  } else {
    feedActionProgress.style.display = 'none';
    updateFeedButtonCooldownUI();
    return false;
  }
}

// ========================================================
// 8. JADWAL PAKAN OTOMATIS
// ========================================================

/**
 * Konversi takaran gram ke format durasi waktu aktuator servo (detik)
 * 10g = 1 detik, 25g = 2,5 detik, 50g = 5 detik, 100g = 10 detik
 */
function formatFeedDuration(grams) {
  const g = parseFloat(grams) || 25;
  if (g >= 5) {
    const sec = g / 10;
    return `${sec.toString().replace('.', ',')} detik`;
  }
  return `${g.toString().replace('.', ',')} detik`;
}

function renderSchedules() {
  scheduleListContainer.innerHTML = '';

  if (appState.schedules.length === 0) {
    scheduleListContainer.innerHTML = '<p class="section-desc" style="text-align:center;">Belum ada jadwal pakan aktif.</p>';
    return;
  }

  // Urutkan jadwal berdasarkan jam
  appState.schedules.sort((a, b) => a.time.localeCompare(b.time));

  appState.schedules.forEach(item => {
    // Pastikan takaran pakan selalu bilangan bulat yang aman
    item.grams = Math.max(5, Math.round(parseFloat(item.grams) || 25));

    const itemEl = document.createElement('div');
    itemEl.className = `schedule-item ${item.enabled ? '' : 'disabled'}`;
    itemEl.innerHTML = `
      <div class="schedule-left">
        <span class="schedule-time">${item.time}</span>
        <span class="schedule-grams">Durasi: <strong>${formatFeedDuration(item.grams)}</strong></span>
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

  // Urutkan jadwal aktif berdasarkan urutan jam
  const sortedActive = [...activeSchedules].sort((a, b) => a.time.localeCompare(b.time));
  const upcoming = sortedActive.find(s => s.time > currentHM);
  if (upcoming) {
    nextFeedScheduleBadgeEl.textContent = `${upcoming.time} (${formatFeedDuration(upcoming.grams)})`;
  } else {
    // Lewat semua hari ini, tampilkan jadwal yang paling awal besok
    nextFeedScheduleBadgeEl.textContent = `${sortedActive[0].time} (${formatFeedDuration(sortedActive[0].grams)} - Besok)`;
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
 * Menentukan status kondisi air dan keterangan teks (disesuaikan dengan tipe ikan aktif)
 */
function getWaterCondition(temp, turb) {
  const activeFish = getActiveFish();
  const minT = activeFish.tempMin || 24;
  const maxT = activeFish.tempMax || 28;
  const maxTurb = activeFish.turbidityMax || 30;

  // Jika sensor suhu tidak terdeteksi (-127C / lepas)
  if (temp === null || temp === undefined || isNaN(temp)) {
    return {
      title: 'Peringatan: Sensor Suhu Belum Terdeteksi',
      badge: 'Sensor Suhu Terputus',
      dotClass: 'alert',
      pillClass: 'status-alert',
      statusLabel: 'Suhu Error',
      desc: `Sensor DS18B20 tidak terdeteksi pada ESP32 (Kekeruhan: ${turb}%). Periksa kabel pin GPIO 4 dan resistor pull-up 4.7k ohm.`
    };
  }

  if (turb > maxTurb + 15 || temp > maxT + 2.5 || temp < minT - 2.5) {
    return {
      title: `Peringatan: Kondisi Air Kolam Kritis untuk ${activeFish.name}!`,
      badge: 'Perlu Tindakan',
      dotClass: 'alert',
      pillClass: 'status-alert',
      statusLabel: 'Kritis / Waspada',
      desc: `Suhu ${temp.toFixed(1)}°C dan kekeruhan ${turb}% berisiko bagi kesehatan ${activeFish.name}. Standar ideal: suhu ${minT}-${maxT}°C, kekeruhan < ${maxTurb}%. Segera sirkulasi/kuras air dan tunda pemberian pakan.`
    };
  } else if (turb > maxTurb || temp < minT || temp > maxT) {
    return {
      title: `Kondisi Air Memerlukan Perhatian (${activeFish.name})`,
      badge: 'Perlu Pengawasan',
      dotClass: 'warn',
      pillClass: 'status-warn',
      statusLabel: 'Perlu Pantauan',
      desc: `Parameter air berada di luar rentang ideal ${activeFish.name} (Suhu saat ini: ${temp.toFixed(1)}°C [Ideal: ${minT}-${maxT}°C], Kekeruhan: ${turb}% [Maks: < ${maxTurb}%]). Amati keaktifan ikan dan pastikan filtrasi bekerja baik.`
    };
  } else {
    return {
      title: `Kondisi Air Kolam Sangat Ideal untuk ${activeFish.name}`,
      badge: 'Kondisi Ideal',
      dotClass: '',
      pillClass: 'status-safe',
      statusLabel: 'Ideal & Aman',
      desc: `Suhu air (${temp.toFixed(1)}°C) dan tingkat kekeruhan (${turb}%) berada pada rentang ideal budidaya ${activeFish.name}. Ikan nyaman, sehat, dan dapat mengonsumsi pakan dengan lahap.`
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
  const activeFish = getActiveFish();
  const minT = activeFish.tempMin || 24;
  const maxT = activeFish.tempMax || 28;
  const maxTurb = activeFish.turbidityMax || 30;

  if (waterStatusBadge) waterStatusBadge.textContent = cond.badge;
  if (waterSummaryDot) {
    waterSummaryDot.className = `status-indicator-dot ${cond.dotClass}`;
  }
  if (waterStatusSummaryTitle) waterStatusSummaryTitle.textContent = cond.title;
  if (waterStatusSummaryDesc) waterStatusSummaryDesc.textContent = cond.desc;

  if (waterTempSummaryText) {
    if (temp === null || isNaN(temp)) {
      waterTempSummaryText.innerHTML = `<strong>Tidak Terdeteksi (-- °C)</strong> — <span style="color:#dc2626;">Cek GPIO 4 & Resistor 4.7kΩ</span>`;
    } else {
      let tempNote = `Sesuai Standar Ideal (${minT} - ${maxT} °C)`;
      if (temp < minT) tempNote = `Cenderung Dingin (< ${minT} °C)`;
      else if (temp > maxT) tempNote = `Hangat / Panas (> ${maxT} °C)`;
      waterTempSummaryText.innerHTML = `<strong>${temp.toFixed(1)} °C</strong> — ${tempNote}`;
    }
  }

  if (waterTurbSummaryText) {
    let turbNote = `Air Jernih (< ${maxTurb}%)`;
    if (turb > maxTurb + 15) turbNote = `Keruh Pekat (${turb}%) — Bahaya untuk ${activeFish.name}`;
    else if (turb > maxTurb) turbNote = `Mulai Sedikit Keruh (> ${maxTurb}%)`;
    waterTurbSummaryText.innerHTML = `<strong>${turb}%</strong> — ${turbNote}`;
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
    const tempDisplay = (item.temp !== null && item.temp !== '--' && !isNaN(item.temp)) ? `${item.temp}°C` : '--';
    row.innerHTML = `
      <div class="reading-time-col">
        <span class="reading-clock">🕒 ${item.time}</span>
      </div>
      <div class="reading-info-col">
        <div class="reading-data">
          <span>Suhu: <strong>${tempDisplay}</strong></span>
          <span class="separator">•</span>
          <span>Kekeruhan: <strong>${item.turb}%</strong></span>
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
    temp: (temp !== null && !isNaN(temp)) ? parseFloat(temp.toFixed(1)) : '--',
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
                const parseSuhu = (val) => {
                  if (val === null || val === undefined || isNaN(val) || Number(val) <= -50 || Number(val) >= 120) return null;
                  return Number(val);
                };

                data = {
                  suhu: parseSuhu(rawData.suhu !== undefined ? rawData.suhu : rawData.temperatureC),
                  kekeruhan: (rawData.kekeruhan !== undefined && rawData.kekeruhan !== null) ? Number(rawData.kekeruhan) : 18,
                  turbidityAdc: rawData.turbidityAdc !== undefined ? Number(rawData.turbidityAdc) : null,
                  sisa_pakan: (rawData.sisa_pakan !== undefined && rawData.sisa_pakan !== null) ? Number(rawData.sisa_pakan) : (rawData.stockGrams !== undefined ? Number(rawData.stockGrams) : 850),
                  feed_today: rawData.feed_today ?? 120,
                  feed_target: rawData.feed_target ?? 150,
                  sugenoScore: rawData.sugenoScore ?? null,
                  updated_at: rawData.updated_at ?? null
                };
                isOk = true;
              }
            }
          } catch (e2) {
            isOk = false;
          }
        }

        if (isOk && data) {
          updateTemperature(data.suhu);
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
          updateConnectionBadge(true, data.updated_at);
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

function updateConnectionBadge(isOnline = true, timeNote = null) {
  if (appState.mode === 'simulation') {
    connectionBadgeEl.innerHTML = `<span class="status-dot online"></span> <span>Mode Simulasi (Demo)</span>`;
  } else if (appState.mode === 'firebase') {
    if (isOnline) {
      const extra = timeNote ? ` (${timeNote})` : ' (Aktif)';
      connectionBadgeEl.innerHTML = `<span class="status-dot online"></span> <span>Firebase Live${extra}</span>`;
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
    });
  });

  // Tombol Keluarkan Pakan Manual
  btnDispenseFeed.addEventListener('click', () => {
    if (isFeedOnCooldown()) {
      const rem = getFeedCooldownRemaining();
      alert(`Pakan manual sedang dalam periode jeda 5 jam!\nSisa waktu: ${formatCooldownTimer(rem)}.\nHarap tunggu jeda selesai demi kesehatan ikan dan stabilitas air kolam.`);
      return;
    }
    dispenseFeed(selectedFeedGrams, 'Manual');
  });

  // Tombol Reset Jeda Pakan (Khusus Uji Coba / Demo)
  if (btnResetCooldown) {
    btnResetCooldown.addEventListener('click', () => {
      if (confirm('Apakah Anda ingin mereset jeda pakan 5 jam untuk keperluan pengujian / demo?')) {
        appState.lastManualFeedTimestamp = 0;
        saveState();
        updateFeedButtonCooldownUI();
      }
    });
  }

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
    const grams = parseInt(newScheduleGrams.value, 10);

    if (!time || isNaN(grams) || grams <= 0) {
      alert('Harap pilih jam dan durasi pakan yang valid!');
      return;
    }

    // Cek apakah jadwal pada jam ini sudah ada sebelumnya
    const existing = appState.schedules.find(s => s.time === time);
    if (existing) {
      if (confirm(`Jadwal untuk jam ${time} sudah terdaftar dengan durasi ${formatFeedDuration(existing.grams)}.\nApakah Anda ingin memperbarui durasinya menjadi ${formatFeedDuration(grams)}?`)) {
        existing.grams = grams;
        existing.enabled = true;
        saveState();
        renderSchedules();
        updateNextScheduleBadge();
        addScheduleBox.style.display = 'none';
        btnToggleAddSchedule.textContent = '+ Tambah Jam';
      }
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

  // Modal Panduan Pemasangan IoT
  if (btnOpenIotGuide) {
    btnOpenIotGuide.addEventListener('click', openIotGuideModal);
  }
  if (btnCloseIotGuideModal) {
    btnCloseIotGuideModal.addEventListener('click', closeIotGuideModal);
  }
  if (btnCloseIotGuideBottom) {
    btnCloseIotGuideBottom.addEventListener('click', closeIotGuideModal);
  }
  if (btnIotGuideToSettings) {
    btnIotGuideToSettings.addEventListener('click', () => {
      closeIotGuideModal();
      openSettingsModal();
    });
  }
  if (btnCopyPinout) {
    btnCopyPinout.addEventListener('click', () => {
      const pinoutText = 
`[SKEMA PINOUT ESP32 - AMBAJAYA FISH]
- Sensor Suhu DS18B20  : GPIO 4  (D4, Pull-Up 4.7k ke 3.3V)
- Sensor Kekeruhan Air : GPIO 34 (ADC1 Analog)
- Motor Servo Pakan    : GPIO 18 (PWM Signal)
- HX711 Load Cell      : GPIO 16 (DOUT) & GPIO 17 (SCK)
- Common Ground (GND)  : Hubungkan semua pin GND bersama`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pinoutText).then(() => {
          const orig = btnCopyPinout.textContent;
          btnCopyPinout.textContent = '✅ Tersalin!';
          setTimeout(() => {
            btnCopyPinout.textContent = orig;
          }, 2000);
        }).catch(() => {
          alert(pinoutText);
        });
      } else {
        alert(pinoutText);
      }
    });
  }

  // Modal Tipe Ikan
  if (btnOpenFishModal) {
    btnOpenFishModal.addEventListener('click', openFishModal);
  }
  if (quickPillFish) {
    quickPillFish.addEventListener('click', openFishModal);
  }
  if (btnCloseFishModal) {
    btnCloseFishModal.addEventListener('click', closeFishModal);
  }
  if (btnCloseFishModalBottom) {
    btnCloseFishModalBottom.addEventListener('click', closeFishModal);
  }
  if (btnToggleAddFishForm) {
    btnToggleAddFishForm.addEventListener('click', () => {
      if (addFishFormBox.style.display === 'none') {
        addFishFormBox.style.display = 'block';
        btnToggleAddFishForm.textContent = '✕ Tutup Form';
      } else {
        addFishFormBox.style.display = 'none';
        btnToggleAddFishForm.textContent = '+ Buka Form';
      }
    });
  }
  if (btnSaveNewFish) {
    btnSaveNewFish.addEventListener('click', saveNewFishType);
  }

  // Klik di luar dialog (backdrop) untuk menutup modal
  if (fishTypeModal) {
    fishTypeModal.addEventListener('click', (e) => {
      if (e.target === fishTypeModal) {
        closeFishModal();
      }
    });
  }
  if (iotGuideModal) {
    iotGuideModal.addEventListener('click', (e) => {
      if (e.target === iotGuideModal) {
        closeIotGuideModal();
      }
    });
  }
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        closeSettingsModal();
      }
    });
  }

  // Tombol Escape di keyboard untuk menutup modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeFishModal();
      closeIotGuideModal();
      closeSettingsModal();
    }
  });
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

// ========================================================
// 14. PANDUAN PEMASANGAN PERANGKAT IOT (MODAL POPUP)
// ========================================================
function openIotGuideModal() {
  if (iotGuideModal) {
    iotGuideModal.style.display = 'flex';
  }
}

function closeIotGuideModal() {
  if (iotGuideModal) {
    iotGuideModal.style.display = 'none';
  }
}

// ========================================================
// 15. MANAJEMEN TIPE IKAN (KOKI, GUPPY, IKAN MAS)
// ========================================================
function getActiveFish() {
  if (!appState.fishTypes || !Array.isArray(appState.fishTypes) || appState.fishTypes.length === 0) {
    appState.fishTypes = [...DEFAULT_STATE.fishTypes];
  }
  const found = appState.fishTypes.find(f => f.id === appState.selectedFishId);
  return found || appState.fishTypes[0];
}

function selectFishType(fishId) {
  const target = appState.fishTypes.find(f => f.id === fishId);
  if (!target) return;

  appState.selectedFishId = fishId;
  saveState();
  renderFishUI();
  renderSensors();
  renderWaterTextSummary();

  // Sinkronisasi info ikan ke Firebase jika sedang mode cloud
  if (appState.mode === 'firebase' && FIREBASE_CONFIG?.databaseURL) {
    try {
      const fishUrl = `${FIREBASE_CONFIG.databaseURL}/pond/fish_profile.json?auth=${FIREBASE_CONFIG.apiKey}`;
      fetch(fishUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_fish_id: target.id,
          name: target.name,
          temp_min: target.tempMin,
          temp_max: target.tempMax,
          turbidity_max: target.turbidityMax,
          updated_at: new Date().toISOString()
        })
      }).catch(() => {});
    } catch (e) {}
  }
}

function renderFishUI() {
  const active = getActiveFish();

  // Update Teks di Banner Atas
  if (activeFishPillText) {
    activeFishPillText.textContent = `${active.icon} ${active.name}`;
  }
  if (currentFishHeading) {
    currentFishHeading.textContent = `${active.icon} ${active.name}${active.latinName ? ' (' + active.latinName + ')' : ''}`;
  }
  if (currentFishDescription) {
    currentFishDescription.innerHTML = `Suhu Ideal: <strong>${active.tempMin} - ${active.tempMax} °C</strong> | Kekeruhan Maks: <strong>&lt; ${active.turbidityMax}%</strong> | Rekomendasi Pakan: <strong>${active.feedDesc}</strong>`;
  }

  // Update Label Rentang Skala Suhu di Kartu Suhu Air
  if (tempLabelCold) tempLabelCold.textContent = `Dingin (<${active.tempMin}°C)`;
  if (tempLabelIdeal) tempLabelIdeal.textContent = `Ideal (${active.tempMin}-${active.tempMax}°C)`;
  if (tempLabelWarm) tempLabelWarm.textContent = `Panas (>${active.tempMax}°C)`;

  // Render Deretan Tombol Pill di Dashboard
  if (fishPillButtonsContainer) {
    fishPillButtonsContainer.innerHTML = '';
    appState.fishTypes.forEach(fish => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `fish-pill-btn ${fish.id === active.id ? 'active' : ''}`;
      btn.dataset.fishId = fish.id;
      btn.innerHTML = `<span>${fish.icon}</span> <span>${fish.name}</span>`;
      btn.addEventListener('click', () => {
        selectFishType(fish.id);
      });
      fishPillButtonsContainer.appendChild(btn);
    });

    // Tombol + Tambah Ikan di baris pill
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'fish-pill-btn fish-pill-btn-add';
    addBtn.innerHTML = `<span>➕</span> <span>Tambah Tipe Ikan</span>`;
    addBtn.addEventListener('click', () => {
      openFishModal();
      if (addFishFormBox) addFishFormBox.style.display = 'block';
      if (btnToggleAddFishForm) btnToggleAddFishForm.textContent = '✕ Tutup Form';
    });
    fishPillButtonsContainer.appendChild(addBtn);
  }

  // Render Daftar Kartu di dalam Modal
  if (fishCardsList) {
    fishCardsList.innerHTML = '';
    appState.fishTypes.forEach(fish => {
      const isSelected = fish.id === active.id;
      const card = document.createElement('div');
      card.className = `fish-card-item ${isSelected ? 'active' : ''}`;
      card.innerHTML = `
        <div class="fish-card-left">
          <div class="fish-card-icon">${fish.icon}</div>
          <div class="fish-card-details">
            <h4>
              ${fish.name}
              ${isSelected ? '<span class="status-pill status-safe" style="font-size:0.7rem; padding:0.1rem 0.45rem;">Sedang Aktif</span>' : ''}
            </h4>
            <span class="fish-latin">${fish.latinName || 'Spesies Kolam / Akuarium'}</span>
            <p class="fish-card-desc">${fish.desc}</p>
            <div class="fish-specs-row">
              <span class="fish-spec-chip highlight">🌡️ Suhu: ${fish.tempMin} - ${fish.tempMax} °C</span>
              <span class="fish-spec-chip">💧 Keruh: &lt; ${fish.turbidityMax}%</span>
              <span class="fish-spec-chip">🌾 ${fish.feedDesc}</span>
            </div>
          </div>
        </div>
        <div class="fish-card-actions">
          ${isSelected 
            ? '<button type="button" class="btn btn-sm btn-primary" disabled style="opacity:0.9; cursor:default;">✅ Terpilih</button>' 
            : `<button type="button" class="btn btn-sm btn-outline btn-select-fish" data-fish-id="${fish.id}">Pilih Ikan</button>`
          }
          ${!['koki', 'guppy', 'ikan-mas'].includes(fish.id) 
            ? `<button type="button" class="btn-link-subtle btn-delete-fish" data-fish-id="${fish.id}" style="color:#ef4444; font-size:0.75rem; margin-top:0.25rem;">Hapus</button>`
            : ''
          }
        </div>
      `;

      // Event listener tombol pilih ikan
      const selectBtn = card.querySelector('.btn-select-fish');
      if (selectBtn) {
        selectBtn.addEventListener('click', () => {
          selectFishType(fish.id);
          closeFishModal();
        });
      }

      // Event listener tombol hapus (untuk ikan kustom tambahan)
      const deleteBtn = card.querySelector('.btn-delete-fish');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Hapus profil ikan "${fish.name}"?`)) {
            appState.fishTypes = appState.fishTypes.filter(f => f.id !== fish.id);
            if (appState.selectedFishId === fish.id) {
              appState.selectedFishId = 'koki';
            }
            saveState();
            renderFishUI();
            renderSensors();
            renderWaterTextSummary();
          }
        });
      }

      fishCardsList.appendChild(card);
    });
  }
}

function openFishModal() {
  if (fishTypeModal) {
    fishTypeModal.style.display = 'flex';
  }
}

function closeFishModal() {
  if (fishTypeModal) {
    fishTypeModal.style.display = 'none';
  }
}

function saveNewFishType() {
  if (!newFishName) return;
  const name = newFishName.value.trim();
  const tempMin = parseFloat(newFishTempMin.value);
  const tempMax = parseFloat(newFishTempMax.value);
  const turbMax = parseFloat(newFishTurbMax.value);
  const icon = (newFishIcon && newFishIcon.value) || '🐠';
  const feedDesc = (newFishFeedDesc && newFishFeedDesc.value.trim()) || 'Porsi pakan standar harian';
  const desc = (newFishNotes && newFishNotes.value.trim()) || `Tipe ikan budidaya baru yang ditambahkan ke sistem.`;

  if (!name) {
    alert('Harap masukkan nama tipe ikan!');
    newFishName.focus();
    return;
  }

  if (isNaN(tempMin) || isNaN(tempMax) || tempMin >= tempMax) {
    alert('Suhu minimal harus lebih kecil dari suhu maksimal!');
    return;
  }

  const newId = 'fish-' + Date.now();
  const newFish = {
    id: newId,
    name: name,
    latinName: '',
    icon: icon,
    tempMin: tempMin,
    tempMax: tempMax,
    turbidityMax: isNaN(turbMax) ? 30 : turbMax,
    feedDesc: feedDesc,
    desc: desc
  };

  appState.fishTypes.push(newFish);
  appState.selectedFishId = newId;
  saveState();

  // Reset form
  newFishName.value = '';
  if (newFishFeedDesc) newFishFeedDesc.value = '';
  if (newFishNotes) newFishNotes.value = '';
  if (addFishFormBox) addFishFormBox.style.display = 'none';
  if (btnToggleAddFishForm) btnToggleAddFishForm.textContent = '+ Buka Form';

  renderFishUI();
  renderSensors();
  renderWaterTextSummary();
  alert(`Berhasil menambahkan tipe ikan "${name}" dan mengaktifkannya!`);
}

// ========================================================
// 14. SWITCH TEMA LATAR HITAM & PUTIH (DARK / LIGHT MODE)
// ========================================================
function initThemeToggle() {
  let isDark = false;
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      isDark = true;
    } else if (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      isDark = true;
    }
  } catch (e) {}

  applyTheme(isDark);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentDark = document.body.classList.contains('dark-theme');
      applyTheme(!currentDark);
    });
  }
}

function applyTheme(isDark) {
  if (isDark) {
    document.documentElement.classList.add('dark-theme');
    document.body.classList.add('dark-theme');
    if (themeToggleText) themeToggleText.textContent = 'Latar Putih';
    try { localStorage.setItem('theme', 'dark'); } catch (e) {}
  } else {
    document.documentElement.classList.remove('dark-theme');
    document.body.classList.remove('dark-theme');
    if (themeToggleText) themeToggleText.textContent = 'Latar Hitam';
    try { localStorage.setItem('theme', 'light'); } catch (e) {}
  }

  // Refresh tampilan chart agar sinkron dengan tema aktif
  renderFeedChart();
}

// ========================================================
// 15. DIAGRAM PERBANDINGAN PAKAN (CHART)
// ========================================================
function initFeedChartTabs() {
  if (tabFeedBarChart && tabFeedDonutChart) {
    tabFeedBarChart.addEventListener('click', () => {
      currentFeedChartTab = 'bar';
      tabFeedBarChart.classList.add('active');
      tabFeedDonutChart.classList.remove('active');
      if (feedBarChartView) feedBarChartView.style.display = 'block';
      if (feedDonutChartView) feedDonutChartView.style.display = 'none';
      renderFeedChart();
    });

    tabFeedDonutChart.addEventListener('click', () => {
      currentFeedChartTab = 'donut';
      tabFeedDonutChart.classList.add('active');
      tabFeedBarChart.classList.remove('active');
      if (feedBarChartView) feedBarChartView.style.display = 'none';
      if (feedDonutChartView) feedDonutChartView.style.display = 'block';
      renderFeedChart();
    });
  }
}

function renderFeedChart() {
  if (!chartFeedTodayVal) return;

  const todayGrams = Math.max(0, appState.feedToday || 0);
  const targetGrams = Math.max(10, appState.feedTarget || 200);
  const todaySeconds = (todayGrams / 10).toFixed(1).replace('.0', '').replace('.', ',');
  const targetSeconds = (targetGrams / 10).toFixed(1).replace('.0', '').replace('.', ',');

  const percent = Math.min(100, Math.round((todayGrams / targetGrams) * 100));
  const remainingGrams = Math.max(0, targetGrams - todayGrams);
  const remainingSeconds = (remainingGrams / 10).toFixed(1).replace('.0', '').replace('.', ',');

  // Update Statistik Angka
  if (chartFeedTodayVal) chartFeedTodayVal.textContent = `${todaySeconds} detik`;
  if (chartFeedTodayGram) chartFeedTodayGram.textContent = `(~${todayGrams} gram)`;
  if (chartFeedTargetVal) chartFeedTargetVal.textContent = `${targetSeconds} detik`;
  if (chartFeedTargetGram) chartFeedTargetGram.textContent = `(~${targetGrams} gram)`;
  if (chartFeedPercentVal) chartFeedPercentVal.textContent = `${percent}%`;
  if (chartFeedRemainingVal) {
    chartFeedRemainingVal.textContent = remainingGrams > 0 ? `Sisa: ${remainingSeconds} detik` : 'Target Tercapai! 🎉';
  }

  // Render Diagram Batang Sesi
  if (feedBarsContainer) {
    feedBarsContainer.innerHTML = '';

    const sessions = [];
    if (Array.isArray(appState.schedules)) {
      appState.schedules.forEach((sch) => {
        let name = 'Jadwal Rutin';
        let barColor = 'bar-color-morning';
        const hour = parseInt((sch.time || '12:00').split(':')[0], 10);
        if (hour < 11) {
          name = 'Sesi Pagi';
          barColor = 'bar-color-morning';
        } else if (hour < 15) {
          name = 'Sesi Siang';
          barColor = 'bar-color-afternoon';
        } else {
          name = 'Sesi Sore';
          barColor = 'bar-color-evening';
        }

        sessions.push({
          time: sch.time,
          name: name,
          grams: sch.grams,
          colorClass: barColor
        });
      });
    }

    // Tambahkan sesi manual jika pernah diberikan hari ini
    if (appState.feedCountToday > 0) {
      sessions.push({
        time: 'Manual',
        name: 'Dispenser Manual',
        grams: selectedFeedGrams || 25,
        colorClass: 'bar-color-manual'
      });
    }

    if (sessions.length === 0) {
      feedBarsContainer.innerHTML = '<p class="section-desc" style="text-align:center; padding:1rem 0;">Belum ada jadwal pakan terdaftar.</p>';
    } else {
      const maxGrams = Math.max(50, ...sessions.map(s => s.grams));

      sessions.forEach(session => {
        const secVal = (session.grams / 10).toFixed(1).replace('.0', '').replace('.', ',');
        const barPercent = Math.min(100, Math.max(12, Math.round((session.grams / maxGrams) * 100)));

        const row = document.createElement('div');
        row.className = 'feed-bar-row';
        row.innerHTML = `
          <div class="feed-bar-header">
            <span class="feed-bar-time">
              <span class="legend-color-box ${session.colorClass}"></span>
              <strong>${session.time}</strong> — ${session.name}
            </span>
            <span class="feed-bar-val"><strong>${secVal} detik</strong> (${session.grams}g)</span>
          </div>
          <div class="feed-bar-track">
            <div class="feed-bar-fill ${session.colorClass}" style="width: ${barPercent}%;"></div>
          </div>
        `;
        feedBarsContainer.appendChild(row);
      });
    }
  }

  // Render Diagram Donut (SVG Progress Ring)
  if (donutProgressRing) {
    const circumference = 389.56; // 2 * pi * 62
    const offset = circumference - (circumference * percent / 100);
    donutProgressRing.style.strokeDashoffset = offset;
  }
  if (donutPercentText) donutPercentText.textContent = `${percent}%`;
  if (donutDoneText) donutDoneText.textContent = `${todaySeconds} detik (${todayGrams} gr)`;
  if (donutRemainText) donutRemainText.textContent = `${remainingSeconds} detik (${remainingGrams} gr)`;
  if (donutStorageText) {
    const storagePercent = Math.max(0, Math.round((appState.storageRemaining / appState.storageCapacity) * 100));
    donutStorageText.textContent = `${appState.storageRemaining} gr (${storagePercent}%)`;
  }

  // Keterangan Cerdas Rekomendasi
  if (feedChartFooterNote) {
    const activeFish = getActiveFish();
    if (percent >= 100) {
      feedChartFooterNote.innerHTML = `✅ <span>Target pakan harian <strong>${activeFish.name}</strong> telah terpenuhi (${todaySeconds} detik). Jaga kolam tetap bersih dari sisa pakan.</span>`;
    } else if (percent >= 50) {
      feedChartFooterNote.innerHTML = `💡 <span>Konsumsi pakan <strong>${activeFish.name}</strong> berjalan baik (${percent}%). Tersisa <strong>${remainingSeconds} detik</strong> untuk sesi berikutnya.</span>`;
    } else {
      feedChartFooterNote.innerHTML = `🌾 <span>Kebutuhan harian <strong>${activeFish.name}</strong> baru terpenuhi ${percent}%. Pastikan dispenser berjalan sesuai jadwal otomatis.</span>`;
    }
  }
}
