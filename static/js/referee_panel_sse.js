/**
 * Referee Panel - SSE Module
 * 
 * Bu modül Server-Sent Events (SSE) bağlantı yönetimi ile ilgili tüm fonksiyonları içerir.
 */

/**
 * Gerçek zamanlı güncellemeleri başlatır (SSE)
 * 
 * Birleşik SSE endpoint kullanarak hem maç durumu hem de skor güncellemelerini
 * gerçek zamanlı olarak alır. Tek bir bağlantı ile her iki bilgi de alınır.
 * 
 * @param {number} matchId - Maç ID'si
 * @param {string} matchSource - "schedule" veya "practice"
 */
function startRealtimeUpdates(matchId, matchSource) {
  if (!matchId) {
    console.error("startRealtimeUpdates: matchId yok");
    return;
  }
  
  // Önceki bağlantıyı kapat
  if (scoreEventSource) {
    try {
      scoreEventSource.close();
    } catch (err) {
      console.warn("SSE kapatma hatası:", err);
    }
    scoreEventSource = null;
  }
  
  // Retry sayacını sıfırla (başarılı bağlantıda)
  retryCount = 0;
  
  // Yeni birleşik SSE bağlantısı aç (maç durumu + skorlar)
  const source = matchSource || currentMatch?.match_source || "schedule";
  const url = `/api/match-control/realtime/${matchId}?source=${encodeURIComponent(source)}`;
  
  try {
    scoreEventSource = new EventSource(url);
    console.log(`SSE bağlantısı açıldı: ${url}`);
  } catch (err) {
    console.error("SSE bağlantısı oluşturulamadı:", err);
    if (typeof showToast === "function") {
      showToast("Gerçek zamanlı güncellemeler başlatılamadı", "error");
    }
    return;
  }
  
  scoreEventSource.onmessage = (event) => {
    try {
      // Keep-alive mesajlarını yoksay
      if (!event.data || event.data.trim() === "" || event.data.startsWith(":")) {
        return;
      }
      
      const data = JSON.parse(event.data);
      
      // Başarılı mesaj alındı, retry sayacını sıfırla
      retryCount = 0;
      
      // Maç durumu güncellemesi
      if (data.type === "match_state" && data.match) {
        // Maç bilgilerini güncelle (durum, timer, vb.)
        if (currentMatch && currentMatch.id === data.match.id) {
          currentMatch.current_state = data.match.current_state;
          currentMatch.time_remaining = data.match.time_remaining;
          currentMatch.status = data.match.status;
          // Timer'ı güncelle
          if (typeof updateRefereeTimer === "function") {
            updateRefereeTimer(data.match.current_state, data.match.time_remaining);
          }
        }
      } else if (data.type === "match_state" && !data.match) {
        // Maç tamamlandı veya temizlendi - UI'ı sıfırla
        if (typeof clearRefereeUI === "function") {
          clearRefereeUI("Aktif maç tamamlandı veya durduruldu. Yeni maçı bekleyin.");
        }
        return;
      }
      
      // Skor güncellemesi
      if ((data.type === "scores" || data.type === "update" || data.type === "initial") && assignedAlliance) {
        const scores = data.scores || data;
        // Sadece atanan ittifakın skorlarını güncelle
        if (scores && scores[assignedAlliance]) {
          const scoringData = scores[assignedAlliance].scoring_data || scores[assignedAlliance];
          if (scoringData) {
            if (typeof applyScoringDataToForm === "function") {
              applyScoringDataToForm(scoringData);
            }
          }
        }
        if (scores && scores.referee_meta) {
          refereeMeta = scores.referee_meta;
          if (typeof updateSubmitStatus === "function") {
            updateSubmitStatus();
          }
        }
      }
    } catch (err) {
      console.error("Realtime update error:", err);
      // Hata durumunda toast gösterme (çok fazla mesaj olmasın)
    }
  };
  
  scoreEventSource.onerror = (err) => {
    console.error("SSE connection error:", err);
    
    // Bağlantıyı kapat
    if (scoreEventSource) {
      try {
        scoreEventSource.close();
      } catch (closeErr) {
        console.warn("SSE kapatma hatası:", closeErr);
      }
      scoreEventSource = null;
    }
    
    // Exponential backoff ile yeniden bağlanmayı dene
    const maxRetries = MAX_RETRY_COUNT || 5;
    if (retryCount < maxRetries && currentMatch && currentMatch.id === matchId) {
      const baseDelay = RETRY_DELAY_BASE || 1000;
      const retryDelay = Math.min(30000, baseDelay * Math.pow(2, retryCount));
      retryCount++;
      
      setTimeout(() => {
        if (currentMatch && currentMatch.id === matchId) {
          console.log(`SSE yeniden bağlanma denemesi ${retryCount}/${maxRetries}...`);
          startRealtimeUpdates(matchId, matchSource);
        }
      }, retryDelay);
    } else {
      console.error("SSE bağlantısı kurulamadı, maksimum deneme sayısına ulaşıldı");
      if (typeof showToast === "function") {
        showToast("Gerçek zamanlı güncellemeler bağlantı hatası nedeniyle durduruldu. Sayfayı yenileyin.", "warning");
      }
    }
  };
}

/**
 * Gerçek zamanlı güncellemeleri durdurur
 */
function stopRealtimeUpdates() {
  if (scoreEventSource) {
    try {
      scoreEventSource.close();
    } catch (err) {
      console.warn("SSE kapatma hatası:", err);
    }
    scoreEventSource = null;
  }
  retryCount = 0;
  
  // Auto-save timer'ı da temizle
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  isAutoSaving = false;
}
