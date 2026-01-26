/**
 * Maç Kontrol - Gerçek Zamanlı Güncellemeler Modülü
 * 
 * Server-Sent Events (SSE) kullanarak gerçek zamanlı skor güncellemelerini yönetir.
 * 
 * Bağımlılıklar: match_control_core.js, match_control_scoring.js
 */

/**
 * Gerçek zamanlı skor güncellemelerini başlatır (SSE)
 */
function startRealtimeScoreUpdates(matchId, matchSource) {
  stopRealtimeScoreUpdates();
  retryCount = 0;
  const source = matchSource || currentMatch?.source || "schedule";
  const url = `/api/match-control/score/realtime/${matchId}?source=${encodeURIComponent(source)}`;
  scoreEventSource = new EventSource(url);
  
  scoreEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (!data || !currentMatch || currentMatch.id !== matchId) return;
      if (data.type === "initial" || data.type === "update") {
        const scores = data.scores || {};
        if (scores.red || scores.blue) {
          if (typeof applyScoringDataToInputs === "function") {
            applyScoringDataToInputs("red", scores.red || {});
            applyScoringDataToInputs("blue", scores.blue || {});
          }
          if (typeof calculateScoreBreakdown === "function") {
            calculateScoreBreakdown();
          }
        }
        
        // Team statuses güncellemesi (hakem panelinden gelen robot durumları için)
        // ÖNEMLİ: Hakem panelinden "Takım Hazır" butonuna basıldığında match control'de de görünmeli
        if (scores.team_statuses && typeof applyTeamStatuses === "function") {
          console.log("Match Control: Team statuses güncellendi (hakem panelinden):", scores.team_statuses);
          applyTeamStatuses(scores.team_statuses);
        }
      }
    } catch (err) {
      console.error("Realtime score update error:", err);
    }
  };
  
  scoreEventSource.onerror = () => {
    if (retryCount < MAX_RETRY_COUNT && currentMatch && currentMatch.id === matchId) {
      const retryDelay = Math.min(30000, RETRY_DELAY_BASE * Math.pow(2, retryCount));
      retryCount++;
      setTimeout(() => {
        if (currentMatch && currentMatch.id === matchId) {
          startRealtimeScoreUpdates(matchId, source);
        }
      }, retryDelay);
    }
  };
}

/**
 * Gerçek zamanlı skor güncellemelerini durdurur
 */
function stopRealtimeScoreUpdates() {
  if (scoreEventSource) {
    scoreEventSource.close();
    scoreEventSource = null;
  }
}
