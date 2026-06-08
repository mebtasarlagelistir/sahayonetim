/**
 * Referee Panel - Core Module
 * 
 * Bu modül temel state yönetimi, constants ve initialization işlemlerini içerir.
 * 
 * MODÜL YAPISI:
 * =============
 * - referee_panel_core.js: State, constants, initialization (bu dosya)
 * - referee_panel_sse.js: SSE bağlantı yönetimi
 * - referee_panel_scoring.js: Skorlama ve otomatik kaydetme
 * - referee_panel_robot_status.js: Robot durumu yönetimi
 * - referee_panel_ui.js: UI güncellemeleri ve render
 * - referee_panel.js: Ana koordinasyon
 */

// utils.js'in yüklendiğini kontrol et
if (typeof window.qs === "undefined") {
  console.error("referee_panel_core.js: utils.js yüklenmemiş! utils.js dosyasının referee_panel_core.js'den önce yüklendiğinden emin olun.");
}

// Global state değişkenleri
let currentMatch = null;
let assignedAlliance = null; // "red" veya "blue" - bu hakemin atandığı ittifak
// NOT: matchSocket referee_panel_sse.js'de tanımlı (fallback için)
let retryCount = 0; // WebSocket yeniden bağlanma sayacı (fallback için)
let refereeMeta = {};

// Retry sabitleri - constants modülünden al
const MAX_RETRY_COUNT = typeof NETWORK_CONSTANTS !== "undefined" 
  ? NETWORK_CONSTANTS.SSE_RETRY_MAX 
  : 10;
const RETRY_DELAY_BASE = typeof NETWORK_CONSTANTS !== "undefined"
  ? NETWORK_CONSTANTS.SSE_RETRY_DELAY_BASE
  : 1000;

// Otomatik skor kaydetme için debounce timer
let autoSaveTimer = null;
const AUTO_SAVE_DELAY = 800; // 800ms debounce - kullanıcı yazmayı bitirdikten sonra kaydet
let isAutoSaving = false; // Çakışmayı önlemek için

// Kullanıcı input yapıyor mu? (Match Core'dan gelen güncellemeleri ignore etmek için)
let isUserEditing = false;
let userEditingTimeout = null;
const USER_EDITING_TIMEOUT = 2000; // 2 saniye input yoksa "editing" modundan çık

/**
 * Hakemin atandığı ittifakı belirler
 * 
 * Öncelik sırası:
 * 1. URL parametresinden (?alliance=red veya ?alliance=blue)
 * 2. Body data attribute'undan (data-referee-mode)
 * 3. Maç numarasına göre (geçici çözüm)
 * 
 * @returns {string} "red" veya "blue"
 */
function determineAssignedAlliance() {
  // 1) Sayfa modu (en güvenilir): /referee/red veya /referee/blue body'ye yazar
  const mode = document.body?.dataset?.refereeMode;
  if (mode === "red" || mode === "blue") {
    sessionStorage.setItem("referee_alliance", mode);
    return mode;
  }
  // 2) URL parametresi (?alliance=red|blue)
  const urlParams = new URLSearchParams(window.location.search);
  const allianceParam = urlParams.get("alliance");
  if (allianceParam === "red" || allianceParam === "blue") {
    sessionStorage.setItem("referee_alliance", allianceParam);
    return allianceParam;
  }
  // 3) Aynı sekmede daha önce belirlenen ittifak (tutarlılık)
  const stored = sessionStorage.getItem("referee_alliance");
  if (stored === "red" || stored === "blue") {
    return stored;
  }
  // 4) Belirlenemedi: maç numarası tek/çift TAHMİNİ KULLANILMAZ — her maçta
  //    ittifak değiştirir ve yanlış ittifağa skor girme riski doğururdu.
  //    Doğru kullanım /referee/red veya /referee/blue panelleridir.
  console.warn(
    "Hakem ittifağı belirlenemedi (mod/URL yok). Lütfen /referee/red veya /referee/blue panelini kullanın. Geçici olarak 'red' atandı."
  );
  return "red";
}

/**
 * Yardımcı fonksiyonlar
 */
function getMatchTypeLabel(type) {
  const labels = {
    "qualification": "Sıralama",
    "elimination": "Elimination",
    "final": "Final",
    "practice": "Deneme"
  };
  return labels[type] || type;
}

function showToast(message, type = "info") {
  // Toast mesajı göster (utils.js'den veya kendi implementasyonunuz)
  if (window.showToast) {
    window.showToast(message, type);
  } else {
    alert(message);
  }
}
