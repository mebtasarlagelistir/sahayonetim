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
  if (!currentMatch) {
    showToast("Önce bir maç seçin", "warning");
    return;
  }
  
  // Tüm robotlar için hazırlık durumu (Hazır, DQ, RY veya Bypass) zorunlu
  if (typeof canStartMatch === "function" && !canStartMatch()) {
    showToast("Tüm robotlar için hazırlık durumu işaretleyin (Hazır, DQ, RY veya Bypass)", "warning");
    return;
  }
  
  // Çift tıklamayı önle
  const btnStart = qs("btn_start_match");
  if (btnStart && btnStart.disabled) {
    return; // Zaten işlem yapılıyor
  }
  
  // Robot durumlarını topla (maç başlatıldığında kaydedilmeli)
  let teamStatuses = {};
  if (typeof collectTeamStatuses === "function") {
    teamStatuses = collectTeamStatuses();
  }
  
  // Buton loading state
  if (btnStart && typeof setButtonLoading === "function") {
    setButtonLoading(btnStart, true);
  }
  
  try {
    // Match Core instance'ı al (window.MatchCore = instance, MatchCore sınıf değil)
    const matchCoreInstance = (typeof window !== "undefined" && window.MatchCore) ||
                              (typeof globalThis !== "undefined" && globalThis.MatchCore) ||
                              (typeof MatchCore !== "undefined" && MatchCore);
    const matchCoreAvailable = matchCoreInstance && typeof matchCoreInstance.startMatch === "function";

    if (!matchCoreAvailable) {
      console.warn("MatchCore instance veya startMatch bulunamadı, fallback yöntemi kullanılıyor", {
        hasInstance: !!matchCoreInstance,
        hasStartMatch: matchCoreInstance ? typeof matchCoreInstance.startMatch : "N/A"
      });
    }

    if (matchCoreAvailable) {
      if (matchCoreInstance && typeof matchCoreInstance.startMatch === "function") {
        await matchCoreInstance.startMatch(
          currentMatch.id,
          currentMatch.source || "schedule",
          currentMatch.field_number,
          teamStatuses
        );
      }
      
      // Match Core otomatik olarak state'i güncelleyecek ve notify edecek
      // UI güncellemesi Match Core subscribe callback'inde yapılacak
      showToast("Maç başlatıldı", "success");
    } else {
      // Fallback: Eski yöntem (Match Core yoksa veya startMatch metodu yoksa)
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
    const msg = (err && err.message) ? String(err.message) : "";
    const status = err && (err.status ?? err.statusCode);
    const is409 = status === 409 || (msg && (msg.indexOf("Zaten aktif") !== -1 || msg.indexOf("409") !== -1));
    if (is409) {
      showToast("Zaten aktif bir maç var (örn. Maç 2). Yeni maç başlatmak için üstteki «Aktif Maçı Sıfırla» butonuna tıklayın.", "warning");
    } else {
      showToast(msg || "Maç başlatılırken hata oluştu", "error");
    }
  } finally {
    // Buton loading state'i kaldır
    if (btnStart && typeof setButtonLoading === "function") {
      setButtonLoading(btnStart, false);
    }
  }
}

/**
 * Veritabanında takılı kalan aktif maçı sıfırlar; yeni maç başlatmak için kullanılır.
 */
async function resetActiveMatch() {
  const btnReset = qs("btn_reset_active");
  if (btnReset && typeof setButtonLoading === "function") {
    setButtonLoading(btnReset, true);
  }
  try {
    const data = await apiPost("/api/match-control/reset-active", {});
    const reset = (data && data.reset) || [];
    if (reset.length) {
      showToast(`Aktif maç sıfırlandı (${reset.length} maç). Artık yeni maç başlatabilirsiniz.`, "success");
    } else {
      showToast("Veritabanında şu an 'devam eden' maç yok. Ekrandaki maç Takvim'den yüklenen kayıtlı maçtır. Yeni maç başlatmak için «Maçı Başlat» deyin.", "info");
    }
    const matchCoreInstance = (typeof window !== "undefined" && window.MatchCore) || (typeof MatchCore !== "undefined" && MatchCore);
    if (matchCoreInstance && typeof matchCoreInstance.loadActiveMatch === "function") {
      await matchCoreInstance.loadActiveMatch(true);
    }
    if (typeof loadMatchList === "function") {
      loadMatchList();
    }
  } catch (err) {
    console.error("Reset active match error:", err);
    showToast((err && err.message) || "Aktif maç sıfırlanırken hata oluştu", "error");
  } finally {
    if (btnReset && typeof setButtonLoading === "function") {
      setButtonLoading(btnReset, false);
    }
  }
}

/**
 * Yüklü olan maçı sıfırlar (skorları temizler, yeniden başlatılabilir hale getirir)
 * 
 * Tamamlanmış bir maçı yeniden oynamak için kullanılır.
 */
async function resetLoadedMatch() {
  if (!currentMatch || !currentMatch.id) {
    showToast("Önce bir maç yükleyin", "warning");
    return;
  }
  
  // Onay iste
  if (!confirm(`"Maç ${currentMatch.match_number}" skorlarını sıfırlamak istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) {
    return;
  }
  
  const btnReset = qs("btn_reset_loaded_match");
  if (btnReset && typeof setButtonLoading === "function") {
    setButtonLoading(btnReset, true);
  }
  
  try {
    const matchSource = currentMatch.source || currentMatch.match_source || "schedule";
    const data = await apiPost("/api/match-control/reset-match", {
      match_id: currentMatch.id,
      match_source: matchSource
    });
    
    if (data && data.ok) {
      showToast(data.message || "Maç sıfırlandı. Artık yeniden başlatabilirsiniz.", "success");
      
      // Maçı yeniden yükle
      if (typeof loadMatchList === "function") {
        await loadMatchList();
      }
      
      // Mevcut maç UI'ını güncelle
      currentMatch.red_score = 0;
      currentMatch.blue_score = 0;
      currentMatch.scoring_data = {};
      currentMatch.status = "scheduled";
      
      // Skorları sıfırla
      if (typeof applyScoringData === "function") {
        applyScoringData({});
      }
      if (typeof calculateScoreBreakdown === "function") {
        calculateScoreBreakdown();
      }
      if (typeof renderMatchDisplay === "function") {
        renderMatchDisplay();
      }
    }
  } catch (err) {
    console.error("Reset loaded match error:", err);
    showToast((err && err.message) || "Maç sıfırlanırken hata oluştu", "error");
  } finally {
    if (btnReset && typeof setButtonLoading === "function") {
      setButtonLoading(btnReset, false);
    }
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
  
  // Çift tıklamayı önle
  const btnNextState = qs("btn_next_state");
  if (btnNextState && btnNextState.disabled) {
    return; // Zaten işlem yapılıyor
  }
  
  // Buton loading state
  if (btnNextState && typeof setButtonLoading === "function") {
    setButtonLoading(btnNextState, true);
  }
  
  try {
    // Match Core üzerinden durum geçişi yap
    const matchCoreInstance = (typeof window !== "undefined" && window.MatchCore) || 
                              (typeof MatchCore !== "undefined" && MatchCore) ||
                              (typeof globalThis !== "undefined" && globalThis.MatchCore);
    
    if (matchCoreInstance && typeof matchCoreInstance.nextState === "function") {
      await matchCoreInstance.nextState();
      
      // Match Core otomatik olarak state'i güncelleyecek ve notify edecek
      // UI güncellemesi Match Core subscribe callback'inde yapılacak
      const newState = matchCoreInstance.currentState;
      showToast(`${MATCH_STATES[newState]?.label || "Durum"} başladı`, "success");
      
      // Önemli anları göster
      if (typeof showImportantMoment === "function") {
        showImportantMoment(newState);
      }
    } else {
      // Fallback: Eski yöntem (Match Core yoksa). Akış: Otonom -> Hazırlık -> SKS (son 30 sn oyun sonu uyarısı) -> Maç Sonrası.
      const stateOrder = ["autonomous", "prepare_teleop", "driver_controlled", "post_match"];
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
  } finally {
    // Buton loading state'i kaldır
    if (btnNextState && typeof setButtonLoading === "function") {
      setButtonLoading(btnNextState, false);
    }
  }
}

/**
 * Maçı durdurur
 */
async function stopMatch() {
  if (!currentMatch) {
    showToast("Önce bir maç seçin", "warning");
    return;
  }
  
  if (!confirm("Maçı durdurmak istediğinizden emin misiniz?")) {
    return;
  }
  
  // Çift tıklamayı önle
  const btnStop = qs("btn_stop_match");
  if (btnStop && btnStop.disabled) {
    return; // Zaten işlem yapılıyor
  }
  
  // Buton loading state
  if (btnStop && typeof setButtonLoading === "function") {
    setButtonLoading(btnStop, true);
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
      const matchCoreInstance = (typeof window !== "undefined" && window.MatchCore) || 
                                (typeof MatchCore !== "undefined" && MatchCore) ||
                                (typeof globalThis !== "undefined" && globalThis.MatchCore);
      if (matchCoreInstance && typeof matchCoreInstance.setMatch === "function") {
        matchCoreInstance.setMatch(data.match);
      }
    } else {
      // Fallback: Manuel güncelleme
      currentMatch.status = "scheduled";
      // Match Core kullanılıyorsa, Match Core'u da güncelle
      const matchCoreInstance = (typeof window !== "undefined" && window.MatchCore) || 
                                (typeof MatchCore !== "undefined" && MatchCore) ||
                                (typeof globalThis !== "undefined" && globalThis.MatchCore);
      if (matchCoreInstance && matchCoreInstance.match) {
        matchCoreInstance.match.status = "scheduled";
        matchCoreInstance.currentState = "idle";
        matchCoreInstance.timeRemaining = 0;
        if (typeof matchCoreInstance.stopTimer === "function") {
          matchCoreInstance.stopTimer();
        }
        if (typeof matchCoreInstance.notify === "function") {
          matchCoreInstance.notify();
        }
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
  } finally {
    // Buton loading state'i kaldır
    if (btnStop && typeof setButtonLoading === "function") {
      setButtonLoading(btnStop, false);
    }
  }
}

/**
 * Maçı tamamlar
 */
async function completeMatch() {
  if (!currentMatch) {
    showToast("Önce bir maç seçin", "warning");
    return;
  }
  
  // Çift tıklamayı önle
  const btnComplete = qs("btn_complete_match");
  if (btnComplete && btnComplete.disabled) {
    return; // Zaten işlem yapılıyor
  }
  
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
  
  // Buton loading state
  if (btnComplete && typeof setButtonLoading === "function") {
    setButtonLoading(btnComplete, true);
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
      const matchCoreInstance = (typeof window !== "undefined" && window.MatchCore) || 
                                (typeof MatchCore !== "undefined" && MatchCore) ||
                                (typeof globalThis !== "undefined" && globalThis.MatchCore);
      if (matchCoreInstance && typeof matchCoreInstance.setMatch === "function") {
        matchCoreInstance.setMatch(data.match);
      }
    } else {
      // Fallback: Manuel güncelleme
      currentMatch.status = "completed";
      currentMatch.red_score = redScore;
      currentMatch.blue_score = blueScore;
      // Match Core kullanılıyorsa, Match Core'u da güncelle
      const matchCoreInstance = (typeof window !== "undefined" && window.MatchCore) || 
                                (typeof MatchCore !== "undefined" && MatchCore) ||
                                (typeof globalThis !== "undefined" && globalThis.MatchCore);
      if (matchCoreInstance && matchCoreInstance.match) {
        matchCoreInstance.match.status = "completed";
        matchCoreInstance.match.red_score = redScore;
        matchCoreInstance.match.blue_score = blueScore;
        matchCoreInstance.currentState = "completed";
        matchCoreInstance.timeRemaining = 0;
        if (typeof matchCoreInstance.stopTimer === "function") {
          matchCoreInstance.stopTimer();
        }
        if (typeof matchCoreInstance.notify === "function") {
          matchCoreInstance.notify();
        }
      }
    }
    
    currentState = "completed";
    timeRemaining = 0;

    if (data.playoff_advance && data.playoff_advance.message) {
      const status = data.playoff_advance.status || "skipped";
      const message = data.playoff_advance.message;
      if (status === "advanced") {
        showToast(message, "success");
      } else if (status === "error") {
        showToast(message, "error");
      } else {
        showToast(message, "warning");
      }
    }
    
    // Timer'ı durdur
    if (typeof stopMatchTimer === "function") {
      stopMatchTimer();
    }
    
    // Gerçek zamanlı güncellemeleri durdur (Match Core kullanılıyorsa gerek yok)
    const matchCoreInstance = (typeof window !== "undefined" && window.MatchCore) || 
                              (typeof MatchCore !== "undefined" && MatchCore) ||
                              (typeof globalThis !== "undefined" && globalThis.MatchCore);
    if (!matchCoreInstance && typeof stopRealtimeScoreUpdates === "function") {
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
    
    // Match Core kullanılıyorsa, Match Core'u da temizle (matchCoreInstance yukarıda tanımlı)
    if (matchCoreInstance) {
      if (typeof matchCoreInstance.clearManualSelection === "function") {
        matchCoreInstance.clearManualSelection();
      }
      if (typeof matchCoreInstance.clearMatch === "function") {
        matchCoreInstance.clearMatch();
      }
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

    // Seyirci ekranındaki skor/sonuç görünümünü kaldır (hakemler düzenleme yaparken görünmesin)
    if (typeof clearAudienceResultsView === "function") {
      await clearAudienceResultsView();
    }

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
  } finally {
    // Buton loading state'i kaldır
    if (btnComplete && typeof setButtonLoading === "function") {
      setButtonLoading(btnComplete, false);
    }
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
