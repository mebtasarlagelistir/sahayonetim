/**
 * Match Core Test ve Örnek Kullanım
 * 
 * Bu dosya Match Core'un nasıl kullanılacağını gösterir.
 * Gerçek implementasyonda bu kodlar ilgili UI modüllerine entegre edilecek.
 */

/**
 * ÖRNEK 1: Match Control için kullanım
 */
function setupMatchControl() {
  // Match Core'a subscribe ol
  const unsubscribe = MatchCore.subscribe((state) => {
    console.log("Match Control: State güncellendi", state);
    
    if (state.match) {
      // Maç bilgilerini göster
      renderMatchInfo(state.match);
      
      // Skorları göster
      if (state.scores.red || state.scores.blue) {
        renderScores(state.scores);
      }
      
      // Timer göster
      renderTimer(state.currentState, state.timeRemaining);
      
      // Team statuses göster
      if (state.teamStatuses) {
        renderTeamStatuses(state.teamStatuses);
      }
    } else {
      // Aktif maç yok
      renderNoMatch();
    }
  });
  
  // Sayfa yüklendiğinde aktif maçı yükle
  MatchCore.loadActiveMatch();
  
  // Periyodik kontrol başlat (5 saniyede bir)
  MatchCore.startPeriodicCheck(5000);
  
  // Sayfa kapanırken cleanup
  window.addEventListener("beforeunload", () => {
    unsubscribe();
    // MatchCore.cleanup(); // Sadece tüm UI'lar kapandığında çağrılmalı
  });
  
  // Maç başlatma butonu
  document.getElementById("btn_start_match")?.addEventListener("click", async () => {
    const matchId = getSelectedMatchId();
    const matchSource = getSelectedMatchSource();
    const fieldNumber = getFieldNumber();
    const teamStatuses = collectTeamStatuses();
    
    try {
      await MatchCore.startMatch(matchId, matchSource, fieldNumber, teamStatuses);
      showToast("Maç başlatıldı", "success");
    } catch (err) {
      console.error("Maç başlatma hatası:", err);
      showToast("Maç başlatılamadı", "error");
    }
  });
  
  // Sonraki durum butonu
  document.getElementById("btn_next_state")?.addEventListener("click", async () => {
    try {
      await MatchCore.nextState();
      showToast("Durum değiştirildi", "success");
    } catch (err) {
      console.error("Durum değiştirme hatası:", err);
      showToast("Durum değiştirilemedi", "error");
    }
  });
}

/**
 * ÖRNEK 2: Referee Panel için kullanım
 */
function setupRefereePanel() {
  const assignedAlliance = determineAssignedAlliance(); // "red" veya "blue"
  
  // Match Core'a subscribe ol
  const unsubscribe = MatchCore.subscribe((state) => {
    console.log("Referee Panel: State güncellendi", state);
    
    if (state.match) {
      // Maç bilgilerini göster
      renderMatchInfo(state.match);
      
      // Sadece atanan ittifakın skorlarını göster
      if (assignedAlliance === "red" && state.scores.red) {
        renderScoringForm(state.scores.red);
      } else if (assignedAlliance === "blue" && state.scores.blue) {
        renderScoringForm(state.scores.blue);
      }
      
      // Timer göster
      renderTimer(state.currentState, state.timeRemaining);
      
      // Referee meta göster (submit durumu)
      if (state.scores.referee_meta) {
        renderRefereeMeta(state.scores.referee_meta, assignedAlliance);
      }
    } else {
      // Aktif maç yok
      renderNoMatch();
    }
  });
  
  // Sayfa yüklendiğinde aktif maçı yükle
  MatchCore.loadActiveMatch();
  
  // Periyodik kontrol başlat
  MatchCore.startPeriodicCheck(5000);
  
  // Sayfa kapanırken cleanup
  window.addEventListener("beforeunload", () => {
    unsubscribe();
  });
  
  // Skor kaydetme
  document.getElementById("btn_save_score")?.addEventListener("click", async () => {
    const scoringData = collectScoringData();
    
    try {
      await apiPost("/api/referee/score/update", {
        match_id: MatchCore.match.id,
        alliance: assignedAlliance,
        match_source: MatchCore.match.match_source || "schedule",
        scoring_data: scoringData
      });
      showToast("Skor kaydedildi", "success");
      // Match Core otomatik olarak WebSocket'ten güncellenecek
    } catch (err) {
      console.error("Skor kaydetme hatası:", err);
      showToast("Skor kaydedilemedi", "error");
    }
  });
}

/**
 * ÖRNEK 3: Audience Display için kullanım
 */
function setupAudienceDisplay() {
  // Match Core'a subscribe ol
  const unsubscribe = MatchCore.subscribe((state) => {
    console.log("Audience Display: State güncellendi", state);
    
    if (state.match) {
      // Maç bilgilerini göster
      renderMatchView(state.match);
      
      // Skorları göster
      renderScores(state.scores);
      
      // Timer göster (server timestamp ile senkronize)
      renderTimer(state.currentState, state.timeRemaining);
    } else {
      // Aktif maç yok - next match preview göster
      renderNextMatchPreview();
    }
  });
  
  // Sayfa yüklendiğinde aktif maçı yükle
  MatchCore.loadActiveMatch();
  
  // Periyodik kontrol başlat
  MatchCore.startPeriodicCheck(5000);
  
  // Sayfa kapanırken cleanup
  window.addEventListener("beforeunload", () => {
    unsubscribe();
  });
}

/**
 * ÖRNEK 4: Head Referee için kullanım
 */
function setupHeadReferee() {
  // Match Core'a subscribe ol
  const unsubscribe = MatchCore.subscribe((state) => {
    console.log("Head Referee: State güncellendi", state);
    
    if (state.match) {
      // Maç bilgilerini göster
      renderMatchInfo(state.match);
      
      // Her iki ittifakın skorlarını göster
      renderScores(state.scores);
      
      // Referee meta göster (submit durumları)
      if (state.scores.referee_meta) {
        renderRefereeMeta(state.scores.referee_meta);
      }
      
      // Timer göster
      renderTimer(state.currentState, state.timeRemaining);
    } else {
      // Aktif maç yok
      renderNoMatch();
    }
  });
  
  // Sayfa yüklendiğinde aktif maçı yükle
  MatchCore.loadActiveMatch();
  
  // Periyodik kontrol başlat
  MatchCore.startPeriodicCheck(5000);
  
  // Sayfa kapanırken cleanup
  window.addEventListener("beforeunload", () => {
    unsubscribe();
  });
  
  // Maç onaylama butonu
  document.getElementById("btn_approve_match")?.addEventListener("click", async () => {
    try {
      await apiPost("/api/referee/approve", {
        match_id: MatchCore.match.id,
        match_source: MatchCore.match.match_source || "schedule"
      });
      showToast("Maç onaylandı", "success");
    } catch (err) {
      console.error("Maç onaylama hatası:", err);
      showToast("Maç onaylanamadı", "error");
    }
  });
}

/**
 * TEST: Match Core'un çalışıp çalışmadığını test eder
 */
function testMatchCore() {
  console.log("=== Match Core Test ===");
  
  // 1. Subscribe test
  let receivedState = null;
  const unsubscribe = MatchCore.subscribe((state) => {
    receivedState = state;
    console.log("Test: State alındı", state);
  });
  
  // 2. State kontrolü
  const initialState = MatchCore.getState();
  console.log("Test: Initial state", initialState);
  
  // 3. Aktif maç yükleme testi
  MatchCore.loadActiveMatch().then(() => {
    console.log("Test: Aktif maç yüklendi", MatchCore.match);
  });
  
  // 4. Cleanup
  setTimeout(() => {
    unsubscribe();
    console.log("Test: Unsubscribe yapıldı");
  }, 10000);
}

// Test fonksiyonunu global olarak erişilebilir yap (console'dan test için)
if (typeof window !== "undefined") {
  window.testMatchCore = testMatchCore;
}
