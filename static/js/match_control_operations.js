/**
 * Maç Kontrol - Maç İşlemleri Modülü
 * 
 * Maç başlatma, durdurma, durum geçişleri ve tamamlama işlemleri.
 * 
 * Bağımlılıklar: match_control_core.js, match_control_timer.js, match_control_ui.js, match_control_data.js, match_control_scoring.js
 */

/**
 * Maçı başlatır
 * 
 * ÖNEMLİ: Match Core kullanılıyor - maç başlatma Match Core üzerinden yapılır.
 */
async function startMatch() {
  if (!currentMatch) return;
  
  // Robot durumlarını topla (maç başlatıldığında kaydedilmeli)
  let teamStatuses = {};
  if (typeof collectTeamStatuses === "function") {
    teamStatuses = collectTeamStatuses();
  }
  
  try {
    // Match Core üzerinden maçı başlat
    if (typeof MatchCore !== "undefined") {
      await MatchCore.startMatch(
        currentMatch.id,
        currentMatch.source || "schedule",
        currentMatch.field_number,
        teamStatuses
      );
      
      // Match Core otomatik olarak state'i güncelleyecek ve notify edecek
      // UI güncellemesi Match Core subscribe callback'inde yapılacak
      showToast("Maç başlatıldı", "success");
    } else {
      // Fallback: Eski yöntem (Match Core yoksa)
      const data = await apiPost("/api/match-control/start", {
        match_id: currentMatch.id,
        field_number: currentMatch.field_number,
        match_source: currentMatch.source || "schedule",
        team_statuses: teamStatuses
      });
      currentMatch.status = "in_progress";
      currentState = data.match.current_state || "autonomous";
      timeRemaining = data.match.time_remaining || MATCH_STATES[currentState].duration;
      
      if (typeof renderMatchDisplay === "function") {
        renderMatchDisplay();
      }
      if (typeof startMatchTimer === "function") {
        startMatchTimer();
      }
      if (typeof updateStateDisplay === "function") {
        updateStateDisplay();
      }
      showToast("Maç başlatıldı", "success");
    }
    
    // Maç listesini güncelle
    if (typeof loadMatchList === "function") {
      await loadMatchList();
    }
    
  } catch (err) {
    console.error("Start match error:", err);
    showToast("Maç başlatılırken hata oluştu", "error");
  }
}

/**
 * Sonraki maç durumuna geçer
 * 
 * Timer süre dolduğunda otomatik olarak çağrılır veya manuel olarak "Sonraki Aşama" butonu ile çağrılabilir
 * 
 * ÖNEMLİ: Match Core kullanılıyor - durum geçişi Match Core üzerinden yapılır.
 */
async function nextMatchState() {
  if (!currentMatch) {
    console.warn("nextMatchState: currentMatch yok");
    return;
  }
  
  try {
    // Match Core üzerinden durum geçişi yap
    if (typeof MatchCore !== "undefined") {
      await MatchCore.nextState();
      
      // Match Core otomatik olarak state'i güncelleyecek ve notify edecek
      // UI güncellemesi Match Core subscribe callback'inde yapılacak
      const newState = MatchCore.currentState;
      showToast(`${MATCH_STATES[newState]?.label || "Durum"} başladı`, "success");
      
      // Önemli anları göster
      if (typeof showImportantMoment === "function") {
        showImportantMoment(newState);
      }
    } else {
      // Fallback: Eski yöntem (Match Core yoksa)
      const stateOrder = ["autonomous", "prepare_teleop", "driver_controlled", "end_game", "post_match"];
      const currentIndex = stateOrder.indexOf(currentState);
      
      if (currentIndex === -1 || currentIndex >= stateOrder.length - 1) {
        if (typeof stopMatchTimer === "function") {
          stopMatchTimer();
        }
        showToast("Son aşamaya ulaşıldı", "info");
        return;
      }
      
      const nextState = stateOrder[currentIndex + 1];
      const data = await apiPost("/api/match-control/state", {
        match_id: currentMatch.id,
        state: nextState,
        match_source: currentMatch.source || "schedule"
      });
      
      currentState = data.state || nextState;
      timeRemaining = data.time_remaining || MATCH_STATES[currentState]?.duration || 0;
      
      if (typeof stopMatchTimer === "function") {
        stopMatchTimer();
      }
      if (typeof updateStateDisplay === "function") {
        updateStateDisplay();
      }
      if (timeRemaining > 0 && typeof startMatchTimer === "function") {
        startMatchTimer();
      }
      showToast(`${MATCH_STATES[currentState].label} başladı`, "success");
    }
    
  } catch (err) {
    console.error("nextMatchState: Hata:", err);
    showToast("Durum güncellenirken hata oluştu", "error");
  }
}

/**
 * Maçı durdurur
 */
async function stopMatch() {
  if (!currentMatch) return;
  
  if (!confirm("Maçı durdurmak istediğinizden emin misiniz?")) {
    return;
  }
  
  try {
    const data = await apiPost("/api/match-control/stop", {
      match_id: currentMatch.id,
      match_source: currentMatch.source || "schedule"
    });
    
    // Backend'den dönen güncel maç bilgisini kullan
    if (data.match) {
      currentMatch = data.match;
      // Match Core kullanılıyorsa, Match Core'u da güncelle
      if (typeof MatchCore !== "undefined") {
        MatchCore.setMatch(data.match);
      }
    } else {
      // Fallback: Manuel güncelleme
      currentMatch.status = "scheduled";
      // Match Core kullanılıyorsa, Match Core'u da güncelle
      if (typeof MatchCore !== "undefined" && MatchCore.match) {
        MatchCore.match.status = "scheduled";
        MatchCore.currentState = "idle";
        MatchCore.timeRemaining = 0;
        MatchCore.stopTimer();
        MatchCore.notify();
      }
    }
    
    currentState = "idle";
    timeRemaining = 0;
    
    // Timer'ı durdur
    if (typeof stopMatchTimer === "function") {
      stopMatchTimer();
    }
    
    // Gerçek zamanlı güncellemeleri durdur (Match Core kullanılıyorsa gerek yok)
    if (typeof MatchCore === "undefined" && typeof stopRealtimeScoreUpdates === "function") {
      stopRealtimeScoreUpdates();
    }
    
    // UI'ı güncelle
    if (typeof renderMatchDisplay === "function") {
      renderMatchDisplay();
    }
    
    // Durum görünümünü güncelle
    if (typeof updateStateDisplay === "function") {
      updateStateDisplay();
    }
    
    showToast("Maç durduruldu", "info");
    
    // Maç listesini güncelle
    if (typeof loadMatchList === "function") {
      await loadMatchList();
    }
    
  } catch (err) {
    console.error("Stop match error:", err);
    showToast("Maç durdurulurken hata oluştu", "error");
  }
}

/**
 * Maçı tamamlar
 */
async function completeMatch() {
  if (!currentMatch) return;
  
  // Detaylı skorlama sisteminden skorları al
  if (typeof calculateScoreBreakdown === "function") {
    calculateScoreBreakdown();
  }
  const redScore = parseInt(qs("red_total_score")?.textContent || 0);
  const blueScore = parseInt(qs("blue_total_score")?.textContent || 0);
  
  // Detaylı skorlama verilerini topla
  let scoringData = {};
  if (typeof collectScoringData === "function") {
    scoringData = {
      red: collectScoringData("red"),
      blue: collectScoringData("blue")
    };
  }
  
  // Takım durumlarını topla
  let teamStatuses = {};
  if (typeof collectTeamStatuses === "function") {
    teamStatuses = collectTeamStatuses();
  }
  
  if (!confirm(`Maçı tamamlamak istediğinizden emin misiniz?\nKırmızı: ${redScore} - Mavi: ${blueScore}`)) {
    return;
  }
  
  try {
    const data = await apiPost("/api/match-control/complete", {
      match_id: currentMatch.id,
      red_score: redScore,
      blue_score: blueScore,
      match_source: currentMatch.source || "schedule",
      scoring_data: scoringData,
      team_statuses: teamStatuses
    });
    
    // Backend'den dönen güncel maç bilgisini kullan
    if (data.match) {
      currentMatch = data.match;
      // Match Core kullanılıyorsa, Match Core'u da güncelle
      if (typeof MatchCore !== "undefined") {
        MatchCore.setMatch(data.match);
      }
    } else {
      // Fallback: Manuel güncelleme
      currentMatch.status = "completed";
      currentMatch.red_score = redScore;
      currentMatch.blue_score = blueScore;
      // Match Core kullanılıyorsa, Match Core'u da güncelle
      if (typeof MatchCore !== "undefined" && MatchCore.match) {
        MatchCore.match.status = "completed";
        MatchCore.match.red_score = redScore;
        MatchCore.match.blue_score = blueScore;
        MatchCore.currentState = "completed";
        MatchCore.timeRemaining = 0;
        MatchCore.stopTimer();
        MatchCore.notify();
      }
    }
    
    currentState = "completed";
    timeRemaining = 0;
    
    // Timer'ı durdur
    if (typeof stopMatchTimer === "function") {
      stopMatchTimer();
    }
    
    // Gerçek zamanlı güncellemeleri durdur (Match Core kullanılıyorsa gerek yok)
    if (typeof MatchCore === "undefined" && typeof stopRealtimeScoreUpdates === "function") {
      stopRealtimeScoreUpdates();
    }
    
    // Tüm skorlama inputlarını temizle (maç bilgisi kaybolmadan önce)
    if (typeof resetScoringInputs === "function") {
      resetScoringInputs();
    }
    
    // Takım durumlarını temizle
    if (typeof applyTeamStatuses === "function") {
      applyTeamStatuses({ red: {}, blue: {} });
    }
    
    // Skor breakdown'larını temizle
    ["red", "blue"].forEach(alliance => {
      const totalScoreEl = qs(`${alliance}_total_score`);
      if (totalScoreEl) totalScoreEl.textContent = "0";
      
      // Breakdown elementlerini temizle
      const breakdownElements = [
        `${alliance}_auto_total`,
        `${alliance}_teleop_total`,
        `${alliance}_penalty_total`,
        `${alliance}_ranking_result`,
        `${alliance}_ranking_climb`,
        `${alliance}_ranking_auto`,
        `${alliance}_ranking_total`
      ];
      breakdownElements.forEach(id => {
        const el = qs(id);
        if (el) el.textContent = "0";
      });
    });
    
    // Aktif maçı temizle (null yap) - UI güncellemesinden önce
    currentMatch = null;
    currentState = "idle";
    timeRemaining = 0;
    
    // Manuel seçimi de temizle
    manuallySelectedMatchId = null;
    manuallySelectedMatchSource = null;
    
    // Match Core kullanılıyorsa, Match Core'u da temizle
    if (typeof MatchCore !== "undefined") {
      MatchCore.clearManualSelection();
      MatchCore.clearMatch();
    }
    
    // UI'ı güncelle (ekranı temizler)
    if (typeof renderMatchDisplay === "function") {
      renderMatchDisplay();
    }
    
    // Durum görünümünü güncelle
    if (typeof updateStateDisplay === "function") {
      updateStateDisplay();
    }
    
    showToast("Maç tamamlandı ve veritabanına kaydedildi", "success");
    
    // Maç listesini güncelle
    if (typeof loadMatchList === "function") {
      await loadMatchList();
    }
    if (typeof loadNextMatch === "function") {
      await loadNextMatch();
    }
    
  } catch (err) {
    console.error("Complete match error:", err);
    showToast("Maç tamamlanırken hata oluştu", "error");
  }
}

/**
 * Maç durumunu günceller
 * 
 * ÖNEMLİ: Eğer kullanıcı manuel olarak bir maç seçtiyse (preview),
 * bu fonksiyon onu KESINLIKLE override etmemeli.
 * 
 * Mantık:
 * 1. Manuel seçim varsa → Sadece seçilen maçın state/timer'ını güncelle, currentMatch'i değiştirme
 * 2. Manuel seçim yoksa → Normal akış (currentMatch'in durumunu güncelle)
 */
async function updateMatchStatus() {
  // DEBUG: Fonksiyon çağrıldığını logla
  console.log(`updateMatchStatus: ÇAĞRILDI - currentMatch: ${currentMatch?.id || "null"}, manuallySelectedMatchId: ${manuallySelectedMatchId || "null"}`);
  
  if (!currentMatch) {
    console.log("updateMatchStatus: currentMatch yok, çıkılıyor");
    return;
  }
  
  // Eğer manuel olarak seçilmiş bir maç varsa, sadece o maçın durumunu güncelle
  // Ama currentMatch'i KESINLIKLE değiştirme
  if (manuallySelectedMatchId && manuallySelectedMatchSource) {
    console.log(`updateMatchStatus: Manuel seçim var - ID: ${manuallySelectedMatchId}, currentMatch ID: ${currentMatch?.id}`);
    
    try {
      const data = await apiGet("/api/match-control/active");
      
      // Seçilen maç hala preview veya aktif durumundaysa, sadece state güncelle
      if (data.match && data.match.id === manuallySelectedMatchId) {
        if (data.match.status === "in_progress") {
          // Seçilen maç aktif oldu, state ve timer güncelle
          currentState = data.match.current_state || currentState;
          timeRemaining = data.match.time_remaining || timeRemaining;
          if (typeof updateStateDisplay === "function") {
            updateStateDisplay();
          }
          console.log(`updateMatchStatus: Seçilen maç aktif, state güncellendi - State: ${currentState}, Time: ${timeRemaining}`);
        }
        // Preview durumundaysa hiçbir şey yapma (timer zaten durmuş)
        return; // Manuel seçilen maçı koru - BAŞKA MAÇ YÜKLEME
      } else if (data.match && data.match.id !== manuallySelectedMatchId) {
        // Backend'den aktif maç farklı döndü (başka bir maç aktif)
        // Ama manuel seçilen maçı KORU
        console.log(`updateMatchStatus: Aktif maç (${data.match.id}) farklı, manuel seçilen maç (${manuallySelectedMatchId}) KORUNUYOR`);
        return; // Manuel seçilen maçı koru - BAŞKA MAÇ YÜKLEME
      } else {
        // Backend'den maç dönmedi (null) - preview maç artık yok
        console.log(`updateMatchStatus: Backend'den maç dönmedi, manuel seçim temizleniyor`);
        manuallySelectedMatchId = null;
        manuallySelectedMatchSource = null;
        // Artık normal akışa devam edebilir
      }
    } catch (err) {
      console.error("updateMatchStatus: Hata (manually selected):", err);
      return; // Hata durumunda manuel seçimi koru
    }
  }
  
  // Eğer maç tamamlandıysa, timer'ı durdur
  if (currentMatch.status === "completed") {
    if (typeof stopMatchTimer === "function") {
      stopMatchTimer();
    }
    currentState = "completed";
    timeRemaining = 0;
    if (typeof updateStateDisplay === "function") {
      updateStateDisplay();
    }
    return;
  }
  
  // Eğer maç aktif değilse, timer'ı durdur
  if (currentMatch.status !== "in_progress") {
    if (typeof stopMatchTimer === "function") {
      stopMatchTimer();
    }
    return;
  }
  
  try {
    const data = await apiGet("/api/match-control/active");
    const activeSource = data.match?.match_source || data.match?.source || "schedule";
    if (data.match && data.match.id === currentMatch.id && activeSource === (currentMatch.source || "schedule")) {
      const newState = data.match.current_state || currentState;
      const newTimeRemaining = data.match.time_remaining || timeRemaining;
      
      // State değiştiyse timer'ı yeniden başlat
      if (newState !== currentState) {
        currentState = newState;
        timeRemaining = newTimeRemaining;
        // Timer'ı yeniden başlat (yeni state için)
        if (timeRemaining > 0) {
          if (typeof startMatchTimer === "function") {
            startMatchTimer();
          }
        }
      } else {
        // Sadece time_remaining'i güncelle (backend'den gelen gerçek değer)
        timeRemaining = newTimeRemaining;
      }
      
      if (typeof updateStateDisplay === "function") {
        updateStateDisplay();
      }
    } else {
      // Maç artık aktif değil
      if (typeof stopMatchTimer === "function") {
        stopMatchTimer();
      }
      currentMatch.status = "scheduled";
      if (typeof renderMatchDisplay === "function") {
        renderMatchDisplay();
      }
    }
  } catch (err) {
    console.error("Update match status error:", err);
  }
}
