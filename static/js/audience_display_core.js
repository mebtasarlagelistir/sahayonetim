/**
 * Audience Display - Core Module
 * 
 * Bu modül temel state yönetimi, constants ve initialization işlemlerini içerir.
 * 
 * MODÜL YAPISI:
 * =============
 * - audience_display_core.js: State, constants, initialization (bu dosya)
 * - audience_display_preview.js: Preview yönetimi
 * - audience_display_sse.js: SSE bağlantı yönetimi
 * - audience_display_views.js: View yükleme (match, inspection, awards)
 * - audience_display_ui.js: UI güncellemeleri (timer, score, teams)
 * - audience_display.js: Ana koordinasyon
 */

// Global state değişkenleri
let currentView = "match";
let overlayEnabled = false;
let overlayText = "";
let screenId = "";
let previewPayload = null;
let lastMatchState = "";
let lastMatchId = null;
let audienceSocket = null; // WebSocket bağlantısı (SSE yerine WebSocket kullanılıyor)
let retryCount = 0;

/** Takım numarası -> { name, school } (seyirci ekranında takım isimleri için) */
let audienceTeamsMap = {};

// Constants
const MAX_RETRY_COUNT = 10;
const RETRY_DELAY_BASE = 1000; // 1 saniye

/**
 * Query parametresini alır
 */
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || "";
}

/**
 * Screen ID'yi belirler ve saklar
 * 
 * Öncelik sırası:
 * 1. URL'den gelen screen_id parametresi
 * 2. ?new=1 parametresi varsa yeni ID oluştur
 * 3. Session storage'dan
 * 4. Local storage'dan
 * 5. Yeni ID oluştur
 */
function ensureScreenId() {
  const fromQuery = getQueryParam("screen_id");
  const forceNew = getQueryParam("new") === "1";
  const sessionStored = window.sessionStorage?.getItem("audience_screen_id");
  const localStored = window.localStorage?.getItem("audience_screen_id");
  
  if (fromQuery) {
    screenId = fromQuery;
  } else if (forceNew) {
    screenId = `screen_${Math.random().toString(36).slice(2, 10)}`;
  } else {
    screenId = sessionStored || localStored || `screen_${Math.random().toString(36).slice(2, 10)}`;
  }
  
  // ID'yi sakla
  window.sessionStorage?.setItem("audience_screen_id", screenId);
  window.localStorage?.setItem("audience_screen_id", screenId);
}

/**
 * Heartbeat gönderir (ekranı backend'e kaydeder)
 */
async function sendHeartbeat() {
  const payload = {
    screen_id: screenId,
    screen_name: getQueryParam("screen_name") || "",
    view: currentView,
    overlay_enabled: overlayEnabled
  };
  try {
    await apiPost("/api/screens/heartbeat", payload);
  } catch (err) {
    console.warn("Heartbeat error:", err);
  }
}

/**
 * Takım listesini yükler (seyirci ekranında takım isimleri göstermek için)
 */
async function loadAudienceTeams() {
  try {
    const data = await apiGet("/api/teams");
    if (!Array.isArray(data)) return;
    audienceTeamsMap = {};
    data.forEach((t) => {
      if (t && t.number != null) {
        audienceTeamsMap[String(t.number)] = { name: t.name || "", school: t.school || "" };
      }
    });
  } catch (err) {
    console.warn("loadAudienceTeams:", err);
  }
}

/**
 * Preview clear attempts sayacını sıfırlar
 */
function resetPreviewClearAttempts() {
  if (window._previewClearAttempts) {
    window._previewClearAttempts = 0;
  }
}

/**
 * Preview clear attempts sayacını artırır
 */
function incrementPreviewClearAttempts() {
  if (!window._previewClearAttempts) {
    window._previewClearAttempts = 0;
  }
  window._previewClearAttempts++;
  return window._previewClearAttempts;
}
