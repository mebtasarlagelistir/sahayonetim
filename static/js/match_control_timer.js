/**
 * Maç Kontrol - Timer Yönetimi Modülü
 * 
 * Maç timer'ını yönetir ve otomatik durum geçişlerini sağlar.
 * 
 * Bağımlılıklar: match_control_core.js, match_control_operations.js, match_control_ui.js
 * 
 * NOT: timerStartTime ve timerInitialDuration değişkenleri match_control_core.js'de tanımlıdır.
 */

/**
 * Maç timer'ını başlatır
 * 
 * ÖNEMLİ: Match Core kullanılıyor - timer yönetimi Match Core'da.
 * Bu fonksiyon sadece geriye dönük uyumluluk için korunuyor.
 * Match Core timer'ı otomatik olarak yönetir.
 */
function startMatchTimer() {
  // Match Core kullanılıyorsa, timer Match Core'da yönetiliyor
  // Sadece UI güncellemesi yap
  if (typeof MatchCore !== "undefined" && MatchCore.match && MatchCore.match.status === "in_progress") {
    // Match Core timer'ı zaten çalışıyor, sadece UI'ı güncelle
    if (typeof updateStateDisplay === "function") {
      updateStateDisplay();
    }
    return;
  }
  
  // Fallback: Eski timer yönetimi (Match Core yoksa)
  stopMatchTimer();
  
  if (!currentMatch || currentMatch.status !== "in_progress") {
    if (typeof updateStateDisplay === "function") {
      updateStateDisplay();
    }
    return;
  }
  
  if (timeRemaining <= 0) {
    if (typeof updateStateDisplay === "function") {
      updateStateDisplay();
    }
    return;
  }
  
  timerStartTime = Date.now();
  timerInitialDuration = timeRemaining;
  
  if (typeof updateStateDisplay === "function") {
    updateStateDisplay();
  }
  
  // 200ms aralık: kararlı sayım, tam saniye (OKS 20 sn, SKS 120 sn backend ile uyumlu)
  matchTimer = setInterval(() => {
    if (!timerStartTime) {
      stopMatchTimer();
      return;
    }
    
    const elapsed = Math.floor((Date.now() - timerStartTime) / 1000);
    const newTimeRemaining = Math.max(0, timerInitialDuration - elapsed);
    
    if (newTimeRemaining !== timeRemaining) {
      timeRemaining = newTimeRemaining;
      if (typeof updateStateDisplay === "function") {
        updateStateDisplay();
      }
    }
    
    if (timeRemaining <= 0) {
      if (currentState !== "post_match" && currentState !== "completed" && currentMatch && currentMatch.status === "in_progress") {
        stopMatchTimer();
        if (typeof nextMatchState === "function") {
          nextMatchState().catch(err => {
            console.error("Timer: Otomatik durum geçişi hatası:", err);
            stopMatchTimer();
          });
        }
      } else {
        stopMatchTimer();
      }
    }
  }, 100);
}

/**
 * Maç timer'ını durdurur
 */
function stopMatchTimer() {
  if (matchTimer) {
    clearInterval(matchTimer);
    matchTimer = null;
  }
  timerStartTime = null;
  timerInitialDuration = 0;
}

/**
 * Durum görünümünü günceller
 */
function updateStateDisplay() {
  const stateLabel = qs("state_label");
  const stateTimer = qs("state_timer");
  const stateIndicator = qs("state_indicator");

  // Oyun sonu uyarısı: SKS (driver_controlled) bitimine 30 sn kala bir kez ses çal.
  // "end_game" artık ayrı bir faz değil; uyarı eşiği END_GAME_DURATION'dan gelir.
  const warnThreshold = (typeof MATCH_CONSTANTS !== "undefined" && MATCH_CONSTANTS.END_GAME_DURATION) || 30;
  const inEndgame = currentState === "driver_controlled" && timeRemaining > 0 && timeRemaining <= warnThreshold;
  if (typeof endgameWarningPlayed !== "undefined") {
    if (currentState !== "driver_controlled") {
      endgameWarningPlayed = false;
    } else if (!endgameWarningPlayed && inEndgame) {
      endgameWarningPlayed = true;
      if (typeof playAlertTone === "function") {
        playAlertTone();
      }
    }
  }
  // "OYUN SONU" rozetini sürenin altında göster/gizle
  if (typeof showEndgameBanner === "function") {
    showEndgameBanner(inEndgame, qs("state_timer") || qs("compact_timer"));
  }
  
  if (stateLabel) {
    stateLabel.textContent = MATCH_STATES[currentState]?.label || "Bilinmiyor";
  }
  
  if (stateTimer) {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const newContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    
    // Sadece içerik değiştiyse güncelle (gereksiz DOM manipülasyonunu önle)
    if (stateTimer.textContent !== newContent) {
      // requestAnimationFrame kullanarak daha smooth güncelleme
      requestAnimationFrame(() => {
        stateTimer.textContent = newContent;
      });
    }
  }
  
  // Kompakt timer güncelle
  const compactStateLabel = qs("compact_state_label");
  const compactTimer = qs("compact_timer");
  if (compactStateLabel) {
    compactStateLabel.textContent = MATCH_STATES[currentState]?.label || "Beklemede";
  }
  if (compactTimer) {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const newContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    if (compactTimer.textContent !== newContent) {
      requestAnimationFrame(() => {
        compactTimer.textContent = newContent;
      });
    }
  }
  
  if (stateIndicator) {
    const color = MATCH_STATES[currentState]?.color || "#666";
    stateIndicator.style.borderColor = color;
    stateIndicator.style.color = color;
  }
  
  // Kompakt header'a pulse efekti ekle
  const compactHeader = qs("compact_match_header");
  if (compactHeader) {
    if (currentState !== "idle" && currentState !== "completed" && currentState !== "post_match") {
      compactHeader.style.boxShadow = "0 2px 12px rgba(102, 126, 234, 0.4)";
    } else {
      compactHeader.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
    }
  }
}
