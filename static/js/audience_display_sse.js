/**
 * Audience Display - WebSocket Module
 * 
 * Bu modül WebSocket bağlantı yönetimi ile ilgili tüm fonksiyonları içerir.
 * SSE yerine WebSocket kullanıyor (daha iyi performans ve timer senkronizasyonu için).
 * NOT: audienceSocket, retryCount, MAX_RETRY_COUNT, RETRY_DELAY_BASE audience_display_core.js içinde tanımlı (burada tekrar tanımlanmaz).
 */

/**
 * WebSocket bağlantısını başlatır (gerçek zamanlı maç güncellemeleri için)
 * 
 * ÖNEMLİ: Audience Core kullanılıyorsa bu fonksiyon çağrılmamalı.
 * Sadece fallback için korunuyor.
 * 
 * NOT: Fonksiyon adı hala startAudienceSSE (geriye dönük uyumluluk için),
 * ama artık WebSocket kullanıyor.
 */
function startAudienceSSE() {
  // Audience Core kullanılıyorsa, WebSocket Audience Core'da yönetiliyor
  if (typeof AudienceCore !== "undefined") {
    console.log("startAudienceSSE: Audience Core kullanılıyor, bu fonksiyon çağrılmamalı");
    return;
  }
  
  // Fallback: Eski yöntem
  if (previewPayload) {
    console.log("Audience: Preview aktif, WebSocket başlatılmıyor");
    return;
  }
  
  stopAudienceSSE();
  
  try {
    // Socket.IO bağlantısı oluştur (audience namespace)
    audienceSocket = io("/audience", {
      transports: ["websocket", "polling"],  // WebSocket öncelikli, polling fallback
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: MAX_RETRY_COUNT,
      timeout: 20000,
      query: {
        screen_id: screenId
      }
    });
    
    console.log(`Audience WebSocket bağlantısı açılıyor: screen_id=${screenId}`);
    
    // Bağlantı kurulduğunda
    audienceSocket.on("connect", () => {
      console.log("Audience WebSocket bağlantısı kuruldu");
      retryCount = 0;
      
      // Audience güncellemelerine abone ol
      audienceSocket.emit("subscribe_audience", {
        screen_id: screenId
      });
    });
    
    // Maç güncellemesi
    audienceSocket.on("match_update", (data) => {
      try {
        // ÖNEMLİ: Preview aktifken WebSocket mesajlarını tamamen yoksay (preview korunmalı)
        if (previewPayload) {
          return;
        }
        
        const match = data.match;
        if (match && typeof updateMatchView === "function") {
          // Timer senkronizasyonu için server_timestamp kullan
          if (match.server_timestamp) {
            const serverTime = match.server_timestamp * 1000; // ms'ye çevir
            const clientTime = Date.now();
            const timeOffset = clientTime - serverTime; // Client-server zaman farkı
            
            // updateMatchView'e timeOffset'i geç (eğer destekliyorsa)
            updateMatchView(match, timeOffset);
          } else {
            updateMatchView(match);
          }
        }
      } catch (err) {
        console.error("Audience WebSocket match_update error:", err);
      }
    });
    
    // Skor güncellemesi
    audienceSocket.on("scores_update", (data) => {
      try {
        // ÖNEMLİ: Preview aktifken WebSocket mesajlarını tamamen yoksay (preview korunmalı)
        if (previewPayload) {
          return;
        }
        
        // Sadece skorları güncelle (state değişmeden)
        const redScore = data.scores?.red_score ?? null;
        const blueScore = data.scores?.blue_score ?? null;
        
        // Her iki skor için de updateScoreDisplay kullan (animasyonlu güncelleme için)
        if (typeof updateScoreDisplay === "function") {
          if (redScore !== null) {
            updateScoreDisplay("red", redScore);
          }
          if (blueScore !== null) {
            updateScoreDisplay("blue", blueScore);
          }
        } else {
          // Fallback: Eğer updateScoreDisplay yoksa direkt güncelle
          if (redScore !== null) {
            const redScoreEl = qs("audience_red_score");
            if (redScoreEl) redScoreEl.textContent = redScore;
          }
          if (blueScore !== null) {
            const blueScoreEl = qs("audience_blue_score");
            if (blueScoreEl) blueScoreEl.textContent = blueScore;
          }
        }
      } catch (err) {
        console.error("Audience WebSocket scores_update error:", err);
      }
    });
    
    // Hata mesajı
    audienceSocket.on("error", (error) => {
      console.error("Audience WebSocket error:", error);
    });
    
    // Bağlantı kesildiğinde
    audienceSocket.on("disconnect", (reason) => {
      console.warn("Audience WebSocket bağlantısı kesildi:", reason);
      
      // Eğer beklenmeyen bir kesilme ise (reconnect değilse) yeniden bağlanmayı dene
      if (reason === "io server disconnect" || reason === "transport close") {
        if (retryCount < MAX_RETRY_COUNT && currentView === "match" && !previewPayload) {
          const retryDelay = Math.min(30000, RETRY_DELAY_BASE * Math.pow(2, retryCount));
          retryCount++;
          
          setTimeout(() => {
            if (currentView === "match" && !previewPayload) {
              console.log(`Audience WebSocket yeniden bağlanma denemesi ${retryCount}/${MAX_RETRY_COUNT}...`);
              startAudienceSSE();
            }
          }, retryDelay);
        }
      }
    });
    
    // Yeniden bağlanma denemesi
    audienceSocket.on("reconnect_attempt", (attemptNumber) => {
      console.log(`Audience WebSocket yeniden bağlanma denemesi: ${attemptNumber}`);
    });
    
    // Yeniden bağlanma başarılı
    audienceSocket.on("reconnect", (attemptNumber) => {
      console.log(`Audience WebSocket yeniden bağlandı (deneme: ${attemptNumber})`);
      retryCount = 0;
      
      // Audience güncellemelerine tekrar abone ol
      audienceSocket.emit("subscribe_audience", {
        screen_id: screenId
      });
    });
    
  } catch (err) {
    console.error("Start Audience WebSocket error:", err);
  }
}

/**
 * WebSocket bağlantısını durdurur
 * 
 * ÖNEMLİ: Audience Core kullanılıyorsa bu fonksiyon çağrılmamalı.
 * Sadece fallback için korunuyor.
 */
function stopAudienceSSE() {
  // Audience Core kullanılıyorsa, WebSocket Audience Core'da yönetiliyor
  if (typeof AudienceCore !== "undefined") {
    console.log("stopAudienceSSE: Audience Core kullanılıyor, bu fonksiyon çağrılmamalı");
    return;
  }
  
  // Fallback: Eski yöntem
  if (audienceSocket) {
    audienceSocket.disconnect();
    audienceSocket = null;
  }
  retryCount = 0;
}
