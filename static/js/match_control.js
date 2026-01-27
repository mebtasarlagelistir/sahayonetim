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
 * - match_control_realtime.js: WebSocket gerçek zamanlı güncellemeler (SSE yerine WebSocket kullanılıyor)
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
 * 
 * ÖNEMLİ: Match Core kullanılıyor - tüm state yönetimi Match Core'da.
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
  
  // Match Core'a subscribe ol (merkezi state yönetimi)
  let matchCoreUnsubscribe = null;
  if (typeof MatchCore !== "undefined") {
    matchCoreUnsubscribe = MatchCore.subscribe((state) => {
      // State değiştiğinde UI'ı güncelle
      currentMatch = state.match;
      currentState = state.currentState;
      timeRemaining = state.timeRemaining;
      
      // UI'ı güncelle
      if (typeof renderMatchDisplay === "function") {
        renderMatchDisplay();
      }
      
      // Timer görünümünü güncelle
      if (typeof updateStateDisplay === "function") {
        updateStateDisplay();
      }
      
      // Skorları güncelle
      if (state.scores.red || state.scores.blue) {
        if (typeof applyScoringData === "function") {
          // Match Core'dan gelen scores formatını uyumlu hale getir
          const scoringData = {
            red: state.scores.red,
            blue: state.scores.blue
          };
          applyScoringData(scoringData);
        }
        if (typeof calculateScoreBreakdown === "function") {
          calculateScoreBreakdown();
        }
      }
      
      // Team statuses güncelle
      if (state.teamStatuses && typeof applyTeamStatuses === "function") {
        applyTeamStatuses(state.teamStatuses);
      }
      
      // Otomatik durum geçişi (timer süre dolduğunda)
      if (state.isActive && state.timeRemaining <= 0 && state.currentState !== "post_match" && state.currentState !== "completed") {
        if (typeof nextMatchState === "function") {
          nextMatchState().catch(err => {
            console.error("Otomatik durum geçişi hatası:", err);
          });
        }
      }
    });
    
    // Aktif maçı yükle
    await MatchCore.loadActiveMatch();
    
    // Periyodik kontrol başlat (Match Core'da)
    MatchCore.startPeriodicCheck(5000);
  } else {
    console.error("MatchCore tanımlı değil! match_core.js yüklenmemiş olabilir.");
    // Fallback: Eski yöntem
    if (typeof checkActiveMatch === "function") {
      checkActiveMatch().catch(err => console.warn("checkActiveMatch hatası:", err));
    }
  }
  
  // Veri yükleme (kritik olmayan - her fonksiyon kendi hatasını yakalar)
  if (typeof loadMatchList === "function") {
    loadMatchList().catch(err => console.warn("loadMatchList hatası:", err));
  }
  if (typeof loadNextMatch === "function") {
    loadNextMatch().catch(err => console.warn("loadNextMatch hatası:", err));
  }
  if (typeof loadMatchControlScreenSettings === "function") {
    loadMatchControlScreenSettings().catch(err => console.warn("loadMatchControlScreenSettings hatası:", err));
  }
  if (typeof loadMatchControlScreens === "function") {
    loadMatchControlScreens().catch(err => console.warn("loadMatchControlScreens hatası:", err));
  }
  
  // Periyodik ekran güncellemesi (Match Core'dan bağımsız)
  let screensUpdateInterval = null;
  if (typeof loadMatchControlScreens === "function") {
    screensUpdateInterval = setInterval(() => {
      loadMatchControlScreens().catch(err => console.warn("loadMatchControlScreens (interval) hatası:", err));
    }, 5000);
  }
  
  // Sayfa kapanırken cleanup
  window.addEventListener("beforeunload", () => {
    if (matchCoreUnsubscribe) {
      matchCoreUnsubscribe();
    }
    // Match Core cleanup
    if (typeof MatchCore !== "undefined") {
      MatchCore.cleanup();
    }
    // Timer'ları temizle (Match Core kendi timer'ını yönetir, ama eski kodlar için)
    if (matchTimer) {
      clearInterval(matchTimer);
      matchTimer = null;
    }
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
    // Periyodik ekran güncellemesi interval'ini temizle
    if (screensUpdateInterval) {
      clearInterval(screensUpdateInterval);
      screensUpdateInterval = null;
    }
  });
}
