/**
 * Maç Kontrol - Core Modülü
 * 
 * Sabitler, global değişkenler ve sayfa başlatma işlemleri.
 * 
 * NOT: Bu dosya constants.js'den sonra yüklenmelidir.
 */

// ============================================================================
// SABİTLER
// ============================================================================

// MATCH_CONSTANTS kontrolü
if (typeof MATCH_CONSTANTS === "undefined") {
  console.error("MATCH_CONSTANTS tanımlı değil! constants.js dosyasının match_control_core.js'den önce yüklendiğinden emin olun.");
}

// Maç durumları ve süreleri
const MATCH_STATES = {
  idle: { 
    label: (typeof MATCH_CONSTANTS !== "undefined" && MATCH_CONSTANTS.STATES) ? MATCH_CONSTANTS.STATES.idle : "Beklemede", 
    duration: 0, 
    color: "#666" 
  },
  autonomous: { 
    label: (typeof MATCH_CONSTANTS !== "undefined" && MATCH_CONSTANTS.STATES) ? MATCH_CONSTANTS.STATES.autonomous : "Otonom", 
    duration: (typeof MATCH_CONSTANTS !== "undefined") ? MATCH_CONSTANTS.AUTONOMOUS_DURATION : 30, 
    color: "#f44336" 
  },
  prepare_teleop: { 
    label: (typeof MATCH_CONSTANTS !== "undefined" && MATCH_CONSTANTS.STATES) ? MATCH_CONSTANTS.STATES.prepare_teleop : "Kontrol Ünitelerinizi Hazırlayınız", 
    duration: (typeof MATCH_CONSTANTS !== "undefined") ? MATCH_CONSTANTS.PREPARE_TELEOP_DURATION : 5, 
    color: "#ff9800" 
  },
  driver_controlled: { 
    label: (typeof MATCH_CONSTANTS !== "undefined" && MATCH_CONSTANTS.STATES) ? MATCH_CONSTANTS.STATES.driver_controlled : "Sürücü Kontrollü", 
    duration: (typeof MATCH_CONSTANTS !== "undefined") ? MATCH_CONSTANTS.DRIVER_CONTROLLED_DURATION : 90,
    color: "#2196f3" 
  },
  post_match: {
    label: (typeof MATCH_CONSTANTS !== "undefined" && MATCH_CONSTANTS.STATES) ? MATCH_CONSTANTS.STATES.post_match : "Maç Sonrası", 
    duration: (typeof MATCH_CONSTANTS !== "undefined") ? MATCH_CONSTANTS.POST_MATCH_DURATION : 10, 
    color: "#607d8b" 
  },
  completed: { 
    label: (typeof MATCH_CONSTANTS !== "undefined" && MATCH_CONSTANTS.STATES) ? MATCH_CONSTANTS.STATES.completed : "Tamamlandı", 
    duration: 0, 
    color: "#4caf50" 
  }
};

// ============================================================================
// GLOBAL DEĞİŞKENLER
// ============================================================================

// Maç durumu
let currentMatch = null;
let matchTimer = null;
let timeRemaining = 0;
let currentState = "idle";
let updateInterval = null;

// Manuel olarak seçilen maç (preview) - checkActiveMatch bunu override etmemeli
let manuallySelectedMatchId = null;
let manuallySelectedMatchSource = null;

// Timer için Date tabanlı zamanlama
let timerStartTime = null;
let timerInitialDuration = 0;

// Oyun sonu uyarısı: SKS (driver_controlled) bitimine 30 sn kala bir kez ses çalınır.
// Faz başına yalnız bir kez çalsın diye bayrak tutulur (updateStateDisplay'de yönetilir).
let endgameWarningPlayed = false;

// Skor düzenleme
let scoreEditMatches = [];
let scoreEditSelected = null;
let detailedScoringHome = null;

// Gerçek zamanlı güncelleme için WebSocket (SSE yerine WebSocket kullanılıyor)
// NOT: matchControlSocket match_control_realtime.js'de tanımlı, burada tanımlanmamalı
// let matchControlSocket = null; // match_control_realtime.js'de tanımlı
let retryCount = 0;
const MAX_RETRY_COUNT = NETWORK_CONSTANTS.SSE_RETRY_MAX;
const RETRY_DELAY_BASE = NETWORK_CONSTANTS.SSE_RETRY_DELAY_BASE;

// ============================================================================
// SAYFA BAŞLATMA
// ============================================================================

/**
 * Sayfa yüklendiğinde başlat
 * 
 * Basit ve güvenilir yaklaşım:
 * 1. Header'ı yükle (kullanıcı, etkinlikler, event switcher)
 * 2. Match control'ü başlat (basit, sıralı çağrılar)
 * 3. Her fonksiyon kendi hatasını yakalar, diğerleri devam eder
 */
document.addEventListener("DOMContentLoaded", async () => {
  // Header yükleme (kritik)
  if (typeof loadUserRole === "function") {
    try { await loadUserRole(); } catch (err) { console.error("loadUserRole hatası:", err); }
  }
  
  if (typeof loadEvents === "function") {
    try { await loadEvents(); } catch (err) { console.error("loadEvents hatası:", err); }
  }
  
  // Event switcher kurulumu
  if (typeof setupEventSwitcher === "function") {
    try { setupEventSwitcher(); } catch (err) { setupMatchControlEventSwitcher(); }
  } else if (typeof window.setupEventSwitcher === "function") {
    try { window.setupEventSwitcher(); } catch (err) { setupMatchControlEventSwitcher(); }
  } else {
    setupMatchControlEventSwitcher();
  }
  
  // Event status güncelleme
  try {
    const eventData = await apiGet("/api/event");
    if (typeof updateEventStatus === "function") {
      updateEventStatus(eventData);
    } else {
      const eventNameDisplay = qs("event-name-display");
      const statusIndicator = qs("status-indicator");
      if (eventNameDisplay) eventNameDisplay.textContent = eventData.name || "Etkinlik seçilmedi";
      if (statusIndicator) {
        const isActive = eventData.name && eventData.name !== "Etkinlik seçilmedi";
        statusIndicator.classList.toggle("active", isActive);
        statusIndicator.classList.toggle("inactive", !isActive);
        statusIndicator.title = isActive ? "Aktif" : "Pasif";
      }
    }
    if (typeof loadEventPhase === "function") await loadEventPhase();
  } catch (err) {
    console.error("Event status update hatası:", err);
  }
  
  // Canlı saati başlat
  if (typeof startClock === "function") startClock();
  
  // Match control başlatma (diğer modüller yüklendikten sonra)
  // initializeMatchControl fonksiyonu match_control.js'de tanımlı olacak
  // DOMContentLoaded event'i tamamlandıktan sonra çağrılacak
  setTimeout(async () => {
    if (typeof initializeMatchControl === "function") {
      try {
        await initializeMatchControl();
      } catch (err) {
        console.error("initializeMatchControl hatası:", err);
      }
    }
  }, 100);
  
  // Sayfa kapanırken cleanup yap
  window.addEventListener("beforeunload", () => {
    // Timer'ları temizle
    if (matchTimer) {
      clearInterval(matchTimer);
      matchTimer = null;
    }
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
    // WebSocket bağlantılarını kapat
    if (typeof stopRealtimeScoreUpdates === "function") {
      stopRealtimeScoreUpdates();
    }
  });
});
