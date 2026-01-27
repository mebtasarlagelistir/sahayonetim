/**
 * Maç Kontrol - Gerçek Zamanlı Güncellemeler Modülü
 * 
 * WebSocket kullanarak gerçek zamanlı skor güncellemelerini yönetir.
 * SSE yerine WebSocket kullanılıyor (daha iyi performans için).
 * 
 * ÖNEMLİ: Match Core kullanılıyor - bu dosya sadece geriye dönük uyumluluk için korunuyor.
 * Match Core kullanılıyorsa, bu fonksiyonlar çağrılmaz.
 * 
 * Bağımlılıklar: match_control_core.js, match_control_scoring.js
 */

// WebSocket bağlantısı
let matchControlSocket = null;
let retryCount = 0;
const MAX_RETRY_COUNT = 5;
const RETRY_DELAY_BASE = 1000;

/**
 * Gerçek zamanlı skor güncellemelerini başlatır (WebSocket)
 * 
 * ÖNEMLİ: Match Core kullanılıyorsa bu fonksiyon çağrılmaz.
 * Sadece Match Core yoksa fallback olarak kullanılır.
 */
function startRealtimeScoreUpdates(matchId, matchSource) {
  // Match Core kullanılıyorsa, WebSocket bağlantısı Match Core'da yapılıyor
  if (typeof MatchCore !== "undefined") {
    console.log("startRealtimeScoreUpdates: Match Core kullanılıyor, bu fonksiyon çağrılmamalı");
    return;
  }
  stopRealtimeScoreUpdates();
  retryCount = 0;
  const source = matchSource || currentMatch?.source || "schedule";
  
  try {
    // Socket.IO bağlantısı oluştur
    matchControlSocket = io("/match", {
      transports: ["websocket", "polling"],  // WebSocket öncelikli, polling fallback
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: MAX_RETRY_COUNT,
      timeout: 20000
    });
    
    console.log(`Match Control WebSocket bağlantısı açılıyor: match_id=${matchId}, source=${source}`);
    
    // Bağlantı kurulduğunda
    matchControlSocket.on("connect", () => {
      console.log("Match Control WebSocket bağlantısı kuruldu");
      retryCount = 0;
      
      // Maça abone ol
      matchControlSocket.emit("subscribe_match", {
        match_id: matchId,
        match_source: source
      });
    });
    
    // Skor güncellemesi
    matchControlSocket.on("scores", (data) => {
      try {
        if (!data || !currentMatch || currentMatch.id !== matchId) return;
        
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
      } catch (err) {
        console.error("Match Control WebSocket scores error:", err);
      }
    });
    
    // Hata mesajı
    matchControlSocket.on("error", (error) => {
      console.error("Match Control WebSocket error:", error);
    });
    
    // Bağlantı kesildiğinde
    matchControlSocket.on("disconnect", (reason) => {
      console.warn("Match Control WebSocket bağlantısı kesildi:", reason);
      
      // Eğer beklenmeyen bir kesilme ise (reconnect değilse) yeniden bağlanmayı dene
      if (reason === "io server disconnect" || reason === "transport close") {
        if (retryCount < MAX_RETRY_COUNT && currentMatch && currentMatch.id === matchId) {
          const retryDelay = Math.min(30000, RETRY_DELAY_BASE * Math.pow(2, retryCount));
          retryCount++;
          
          setTimeout(() => {
            if (currentMatch && currentMatch.id === matchId) {
              console.log(`Match Control WebSocket yeniden bağlanma denemesi ${retryCount}/${MAX_RETRY_COUNT}...`);
              startRealtimeScoreUpdates(matchId, source);
            }
          }, retryDelay);
        }
      }
    });
    
    // Yeniden bağlanma denemesi
    matchControlSocket.on("reconnect_attempt", (attemptNumber) => {
      console.log(`Match Control WebSocket yeniden bağlanma denemesi: ${attemptNumber}`);
    });
    
    // Yeniden bağlanma başarılı
    matchControlSocket.on("reconnect", (attemptNumber) => {
      console.log(`Match Control WebSocket yeniden bağlandı (deneme: ${attemptNumber})`);
      retryCount = 0;
      
      // Maça tekrar abone ol
      if (currentMatch && currentMatch.id === matchId) {
        matchControlSocket.emit("subscribe_match", {
          match_id: matchId,
          match_source: source
        });
      }
    });
    
  } catch (err) {
    console.error("Match Control WebSocket bağlantısı oluşturulamadı:", err);
  }
}

/**
 * Gerçek zamanlı skor güncellemelerini durdurur
 */
function stopRealtimeScoreUpdates() {
  if (matchControlSocket) {
    // Abonelikten çık
    if (matchControlSocket.connected) {
      matchControlSocket.emit("unsubscribe_match", {});
    }
    
    // Bağlantıyı kapat
    matchControlSocket.disconnect();
    matchControlSocket = null;
  }
  retryCount = 0;
}
