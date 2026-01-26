/**
 * Audience Display - SSE Module
 * 
 * Bu modül Server-Sent Events (SSE) bağlantı yönetimi ile ilgili tüm fonksiyonları içerir.
 */

/**
 * SSE bağlantısını başlatır (gerçek zamanlı maç güncellemeleri için)
 */
function startAudienceSSE() {
  // ÖNEMLİ: Preview aktifken SSE başlatma
  if (previewPayload) {
    console.log("Audience: Preview aktif, SSE başlatılmıyor");
    return;
  }
  
  stopAudienceSSE();
  
  try {
    const url = `/api/public/match/realtime?screen_id=${encodeURIComponent(screenId)}`;
    matchEventSource = new EventSource(url);
    
    matchEventSource.onmessage = (event) => {
      try {
        // ÖNEMLİ: Preview aktifken SSE mesajlarını tamamen yoksay (preview korunmalı)
        if (previewPayload) {
          // Preview aktifken hiçbir SSE mesajını işleme
          return;
        }
        
        const data = JSON.parse(event.data);
        
        // ÖNEMLİ: Preview kontrolü (her mesaj tipinde - double check)
        if (previewPayload) {
          return;
        }
        
        if (data.type === "match_update" && data.match) {
          // Preview yoksa güncelleme yap
          if (typeof updateMatchView === "function") {
            updateMatchView(data.match);
          }
        } else if (data.type === "scores_update") {
          // Sadece skorları güncelle (state değişmeden)
          const redScore = data.scores?.red_score ?? null;
          const blueScore = data.scores?.blue_score ?? null;
          if (redScore !== null) {
            const redScoreEl = qs("audience_red_score");
            if (redScoreEl) redScoreEl.textContent = redScore;
          }
          if (blueScore !== null) {
            if (typeof updateScoreDisplay === "function") {
              updateScoreDisplay("blue", blueScore);
            }
          }
        }
      } catch (err) {
        console.error("SSE message parse error:", err);
      }
    };
    
    matchEventSource.onerror = (err) => {
      console.error("SSE error:", err);
      matchEventSource.close();
      matchEventSource = null;
      retryCount++;
      
      // Retry mekanizması
      if (retryCount < MAX_RETRY_COUNT) {
        const delay = RETRY_DELAY_BASE * Math.min(retryCount, 5);
        setTimeout(() => {
          if (currentView === "match" && !previewPayload) {
            startAudienceSSE();
          }
        }, delay);
      }
    };
    
    matchEventSource.onopen = () => {
      retryCount = 0; // Başarılı bağlantıda retry sayacını sıfırla
    };
  } catch (err) {
    console.error("Start SSE error:", err);
  }
}

/**
 * SSE bağlantısını durdurur
 */
function stopAudienceSSE() {
  if (matchEventSource) {
    matchEventSource.close();
    matchEventSource = null;
  }
}
