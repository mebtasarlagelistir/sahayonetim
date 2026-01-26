/**
 * Maç Kontrol - Ana Koordinasyon Modülü
 * 
 * Bu dosya tüm match_control modüllerini koordine eder.
 * 
 * NOT: Bu dosya diğer match_control_*.js modüllerinden SONRA yüklenmelidir.
 * 
 * MODÜL YAPISI:
 * =============
 * - match_control_core.js: Sabitler, global değişkenler, sayfa başlatma
 * - match_control_realtime.js: SSE gerçek zamanlı güncellemeler
 * - match_control_timer.js: Timer yönetimi
 * - match_control_data.js: Veri yükleme ve maç seçimi
 * - match_control_operations.js: Maç işlemleri (start, stop, next state)
 * - match_control_scoring.js: Puanlama hesaplamaları
 * - match_control_ui.js: Arayüz görüntüleme
 * - match_control_screens.js: Ekran yönetimi
 * - match_control_events.js: Event listener kurulumu
 * - match_control.js: Ana koordinasyon (bu dosya)
 */

/**
 * Maç kontrol sayfasını başlatır
 * 
 * Tüm modüller yüklendikten sonra çağrılır.
 * 
 * Bu fonksiyon match_control_core.js'deki DOMContentLoaded event listener'ından çağrılır.
 */
async function initializeMatchControl() {
  // Event listener'ları ekle (kritik)
  try { 
    if (typeof setupEventListeners === "function") {
      setupEventListeners();
    }
  } catch (err) { 
    console.error("setupEventListeners hatası:", err); 
  }
  
  // İlk tab'ı göster
  try { 
    if (typeof switchTab === "function") {
      switchTab("active-match");
    }
  } catch (err) { 
    console.error("switchTab hatası:", err); 
  }
  
  // Veri yükleme (kritik olmayan - her fonksiyon kendi hatasını yakalar)
  if (typeof loadMatchList === "function") {
    loadMatchList().catch(err => console.warn("loadMatchList hatası:", err));
  }
  if (typeof loadNextMatch === "function") {
    loadNextMatch().catch(err => console.warn("loadNextMatch hatası:", err));
  }
  if (typeof checkActiveMatch === "function") {
    checkActiveMatch().catch(err => console.warn("checkActiveMatch hatası:", err));
  }
  if (typeof loadMatchControlScreenSettings === "function") {
    loadMatchControlScreenSettings().catch(err => console.warn("loadMatchControlScreenSettings hatası:", err));
  }
  if (typeof loadMatchControlScreens === "function") {
    loadMatchControlScreens().catch(err => console.warn("loadMatchControlScreens hatası:", err));
  }
  
  // Gerçek zamanlı skor güncellemelerini başlat
  if (currentMatch && typeof startRealtimeScoreUpdates === "function") {
    try {
      startRealtimeScoreUpdates(currentMatch.id, currentMatch.source || "schedule");
    } catch (err) {
      console.error("startRealtimeScoreUpdates hatası:", err);
    }
  }
  
  // Periyodik güncelleme başlat
  try {
    if (typeof NETWORK_CONSTANTS !== "undefined" && NETWORK_CONSTANTS.UPDATE_INTERVAL) {
      updateInterval = setInterval(async () => {
        if (document.hidden) return;
        if (currentMatch && typeof updateMatchStatus === "function") {
          try { 
            await updateMatchStatus(); 
          } catch (err) { 
            console.warn("updateMatchStatus hatası:", err); 
          }
        }
      }, NETWORK_CONSTANTS.UPDATE_INTERVAL);
    }
    
    if (typeof loadMatchControlScreens === "function") {
      setInterval(() => {
        loadMatchControlScreens().catch(err => console.warn("loadMatchControlScreens (interval) hatası:", err));
      }, 5000);
    }
  } catch (err) {
    console.error("Interval başlatma hatası:", err);
  }
}
