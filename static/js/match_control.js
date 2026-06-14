/**
 * Maç Kontrol - Ana Koordinasyon Modülü
 * 
 * Bu dosya tüm match_control modüllerini koordine eder.
 * 
 * NOT: Bu dosya diğer match_control_*.js modüllerinden SONRA yüklenmelidir.
 * 
 * ROBOT HAZIRLIK (TEAM_STATUSES) SENKRON MANTIĞI
 * ==============================================
 * - Tek referans: Backend (realtime_manager). Match kontrol ana referans ekranıdır; tüm paneller aynı state'i görür.
 * - Herhangi bir panelden seçim (Maç kontrol veya hakem tabletleri):
 *   1) Panel backend'e yazar (match control: POST /api/match-control/team-status tam state; hakem: POST /api/referee/score/update sadece kendi ittifakı).
 *   2) Backend birleştirir (hakem sadece kendi ittifakını günceller; match control tam state gönderir).
 *   3) Backend "scores" event'i ile odadaki tüm client'lara gönderir.
 *   4) MatchCore teamStatuses günceller ve notify() ile abonelere iletir.
 *   5) Maç kontrol applyTeamStatuses(state.teamStatuses), hakem paneli loadRefereeRobotStatuses({ team_statuses }) uygular.
 * - Sonuç: Her panelden yapılan seçim anında her yerde senkron kalır.
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
  // Önce window.MatchCore'u kontrol et (match_core.js'de window'a ekleniyor)
  const matchCoreInstance = (typeof window !== "undefined" && window.MatchCore) || 
                            (typeof MatchCore !== "undefined" && MatchCore) ||
                            (typeof globalThis !== "undefined" && globalThis.MatchCore);
  
  let matchCoreUnsubscribe = null;
  let lastAppliedMatchId = null;
  /** Robot durumunu sadece backend verisi gerçekten değiştiğinde uygula (timer ile üzerine yazmayı önler) */
  let lastAppliedTeamStatusesKey = "";
  if (matchCoreInstance && typeof matchCoreInstance.subscribe === "function") {
    matchCoreUnsubscribe = matchCoreInstance.subscribe((state) => {
      currentMatch = state.match;
      currentState = state.currentState;
      timeRemaining = state.timeRemaining;
      
      if (typeof renderMatchDisplay === "function") {
        renderMatchDisplay();
      }
      if (typeof updateStateDisplay === "function") {
        updateStateDisplay();
      }
      
      var matchId = state.match ? state.match.id : null;
      var matchChanged = matchId !== lastAppliedMatchId;
      if (matchChanged) {
        lastAppliedMatchId = matchId;
        lastAppliedTeamStatusesKey = "";
      }
      
      var hasNewScores = state.scoresJustUpdated && state.scores && (state.scores.red != null || state.scores.blue != null);
      if (hasNewScores) {
        // Yarış-durumu koruması: operatör skor giriyorsa ezme (applyRemoteScores).
        // team_statuses aşağıda ayrıca uygulanıyor.
        if (typeof applyRemoteScores === "function") {
          applyRemoteScores({ red: state.scores.red || {}, blue: state.scores.blue || {} });
        } else if (typeof applyScoringData === "function") {
          applyScoringData({
            red: state.scores.red || {},
            blue: state.scores.blue || {},
            team_statuses: state.teamStatuses || {}
          });
        }
      }
      
      var ts = state.teamStatuses != null ? state.teamStatuses : {};
      var tsKey = JSON.stringify(ts);
      if (tsKey !== lastAppliedTeamStatusesKey && typeof applyTeamStatuses === "function") {
        applyTeamStatuses(ts);
        lastAppliedTeamStatusesKey = tsKey;
      }
      
      if (typeof calculateScoreBreakdown === "function") {
        calculateScoreBreakdown();
      }
      
      // Baş hakem onayı göstergesi: maç onaylandığında skor kontrol ekranında görünsün
      if (typeof updateHeadRefereeApprovedIndicator === "function" && state.scores) {
        updateHeadRefereeApprovedIndicator(state.scores.referee_meta);
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
    if (typeof matchCoreInstance.loadActiveMatch === "function") {
      await matchCoreInstance.loadActiveMatch();
    }
    
    // Periyodik kontrol başlat (Match Core'da)
    if (typeof matchCoreInstance.startPeriodicCheck === "function") {
      matchCoreInstance.startPeriodicCheck(5000);
    }
  } else {
    console.warn("MatchCore.subscribe bulunamadı, gerçek zamanlı güncellemeler devre dışı", {
      windowMatchCore: typeof window !== "undefined" && !!window.MatchCore,
      globalMatchCore: typeof MatchCore !== "undefined",
      matchCoreInstance: !!matchCoreInstance,
      hasSubscribe: matchCoreInstance && typeof matchCoreInstance.subscribe === "function"
    });
    console.error("MatchCore tanımlı değil! match_core.js yüklenmemiş olabilir veya instance oluşturulurken hata oluştu.");
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
