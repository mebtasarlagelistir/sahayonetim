/**
 * Referee Panel - WebSocket Module
 * 
 * Bu modül WebSocket bağlantı yönetimi ile ilgili tüm fonksiyonları içerir.
 * SSE yerine WebSocket kullanıyor (daha iyi performans ve timer senkronizasyonu için).
 * 
 * ÖNEMLİ: Match Core kullanılıyor - bu dosya sadece geriye dönük uyumluluk için korunuyor.
 * Match Core kullanılıyorsa, bu fonksiyonlar çağrılmaz.
 */

// WebSocket bağlantısı
let matchSocket = null;
let sseRetryCount = 0;
const SSE_MAX_RETRY_COUNT = 5;
const SSE_RETRY_DELAY_BASE = 1000;

/**
 * Gerçek zamanlı güncellemeleri başlatır (WebSocket)
 * 
 * Birleşik WebSocket kullanarak hem maç durumu hem de skor güncellemelerini
 * gerçek zamanlı olarak alır. Tek bir bağlantı ile her iki bilgi de alınır.
 * Timer senkronizasyonu için server_timestamp kullanılır.
 * 
 * @param {number} matchId - Maç ID'si
 * @param {string} matchSource - "schedule" veya "practice"
 */
function startRealtimeUpdates(matchId, matchSource) {
  // Match Core kullanılıyorsa, WebSocket bağlantısı Match Core'da yapılıyor
  if (typeof MatchCore !== "undefined") {
    console.log("startRealtimeUpdates: Match Core kullanılıyor, bu fonksiyon çağrılmamalı");
    return;
  }
  
  if (!matchId) {
    console.error("startRealtimeUpdates: matchId yok");
    return;
  }
  
  // Önceki bağlantıyı kapat
  stopRealtimeUpdates();
  
  // Retry sayacını sıfırla (başarılı bağlantıda)
  sseRetryCount = 0;
  
  // Yeni WebSocket bağlantısı aç
  const source = matchSource || currentMatch?.match_source || "schedule";
  
  try {
    // Socket.IO bağlantısı oluştur
    matchSocket = io("/match", {
      transports: ["websocket", "polling"],  // WebSocket öncelikli, polling fallback
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: SSE_MAX_RETRY_COUNT,
      timeout: 20000
    });
    
    console.log(`WebSocket bağlantısı açılıyor: match_id=${matchId}, source=${source}`);
    
    // Bağlantı kurulduğunda
    matchSocket.on("connect", () => {
      console.log("WebSocket bağlantısı kuruldu");
      sseRetryCount = 0; // Başarılı bağlantıda retry sayacını sıfırla
      
      // Maça abone ol
      matchSocket.emit("subscribe_match", {
        match_id: matchId,
        match_source: source
      });
    });
    
    // Maç durumu güncellemesi
    matchSocket.on("match_state", (data) => {
      try {
        const matchData = data.match;
        
        // Timer senkronizasyonu için server_timestamp kullan
        if (matchData && matchData.server_timestamp) {
          const serverTime = matchData.server_timestamp * 1000; // ms'ye çevir
          const clientTime = Date.now();
          const timeOffset = clientTime - serverTime; // Client-server zaman farkı
          
          // Maç bilgilerini güncelle
          if (currentMatch && currentMatch.id === matchData.id) {
            currentMatch.current_state = matchData.current_state;
            currentMatch.time_remaining = matchData.time_remaining;
            currentMatch.status = matchData.status;
            
            // Timer'ı güncelle (server_timestamp ile senkronize)
            if (typeof updateRefereeTimer === "function") {
              // Server'dan gelen time_remaining'i kullan ama client-server zaman farkını hesaba kat
              updateRefereeTimer(matchData.current_state, matchData.time_remaining, timeOffset);
            }
          }
        } else if (!matchData) {
          // Maç tamamlandı veya temizlendi - UI'ı sıfırla
          if (typeof clearRefereeUI === "function") {
            clearRefereeUI("Aktif maç tamamlandı veya durduruldu. Yeni maçı bekleyin.");
          }
        }
      } catch (err) {
        console.error("WebSocket match_state error:", err);
      }
    });
    
    // Skor güncellemesi
    matchSocket.on("scores", (data) => {
      try {
        const scores = data.scores || data;
        
        // Sadece atanan ittifakın skorlarını güncelle
        if (scores && assignedAlliance && scores[assignedAlliance]) {
          const scoringData = scores[assignedAlliance].scoring_data || scores[assignedAlliance];
          if (scoringData) {
            // Yarış-durumu koruması: hakem giriş yapıyorsa ezme (applyRemoteRefScores)
            if (typeof applyRemoteRefScores === "function") {
              applyRemoteRefScores(scoringData);
            } else if (typeof applyScoringDataToForm === "function") {
              applyScoringDataToForm(scoringData);
            }
          }
        }
        
        // Referee meta güncellemesi
        if (scores && scores.referee_meta) {
          refereeMeta = scores.referee_meta;
          if (typeof updateSubmitStatus === "function") {
            updateSubmitStatus();
          }
        }
      } catch (err) {
        console.error("WebSocket scores error:", err);
      }
    });
    
    // Maç önizleme güncellemesi (Sıradaki Maçı Yükle butonu tıklandığında)
    // Bu event hakem ekranlarının hemen güncellenmesini sağlar
    matchSocket.on("match_preview", (data) => {
      try {
        console.log("Referee: match_preview alındı:", data);
        const newMatch = data.match;
        
        if (newMatch && (!currentMatch || currentMatch.id !== newMatch.id)) {
          console.log(`Referee: Yeni maç yükleniyor - ${newMatch.id}`);
          
          // Yeni maç bilgilerini güncelle
          currentMatch = {
            ...newMatch,
            current_state: "pre_match",
            time_remaining: 0,
            status: "preview"
          };
          
          // Formları sıfırla
          if (typeof resetScoringForm === "function") {
            resetScoringForm();
          }
          
          // UI'ı güncelle
          if (typeof updateMatchInfo === "function") {
            updateMatchInfo(currentMatch);
          }
          
          // Yeni maça abone ol
          if (matchSocket && matchSocket.connected) {
            matchSocket.emit("unsubscribe_match", {});
            matchSocket.emit("subscribe_match", {
              match_id: newMatch.id,
              match_source: newMatch.match_source || "schedule"
            });
          }
          
          // Bilgilendirme
          if (typeof showToast === "function") {
            showToast(`Yeni maç yüklendi: #${newMatch.match_number || newMatch.id}`, "info");
          }
        }
      } catch (err) {
        console.error("WebSocket match_preview error:", err);
      }
    });
    
    // Hata mesajı
    matchSocket.on("error", (error) => {
      console.error("WebSocket error:", error);
      if (typeof showToast === "function") {
        showToast(error.message || "WebSocket bağlantı hatası", "error");
      }
    });
    
    // Bağlantı kesildiğinde
    matchSocket.on("disconnect", (reason) => {
      console.warn("WebSocket bağlantısı kesildi:", reason);
      
      // Eğer beklenmeyen bir kesilme ise (reconnect değilse) yeniden bağlanmayı dene
      if (reason === "io server disconnect" || reason === "transport close") {
        if (sseRetryCount < SSE_MAX_RETRY_COUNT && currentMatch && currentMatch.id === matchId) {
          const retryDelay = Math.min(30000, SSE_RETRY_DELAY_BASE * Math.pow(2, sseRetryCount));
          sseRetryCount++;
          
          setTimeout(() => {
            if (currentMatch && currentMatch.id === matchId) {
              console.log(`WebSocket yeniden bağlanma denemesi ${sseRetryCount}/${SSE_MAX_RETRY_COUNT}...`);
              startRealtimeUpdates(matchId, source);
            }
          }, retryDelay);
        } else {
          console.error("WebSocket bağlantısı kurulamadı, maksimum deneme sayısına ulaşıldı");
          if (typeof showToast === "function") {
            showToast("Gerçek zamanlı güncellemeler bağlantı hatası nedeniyle durduruldu. Sayfayı yenileyin.", "warning");
          }
        }
      }
    });
    
    // Yeniden bağlanma denemesi
    matchSocket.on("reconnect_attempt", (attemptNumber) => {
      console.log(`WebSocket yeniden bağlanma denemesi: ${attemptNumber}`);
    });
    
    // Yeniden bağlanma başarılı
    matchSocket.on("reconnect", (attemptNumber) => {
      console.log(`WebSocket yeniden bağlandı (deneme: ${attemptNumber})`);
      sseRetryCount = 0;
      
      // Maça tekrar abone ol
      if (currentMatch && currentMatch.id === matchId) {
        matchSocket.emit("subscribe_match", {
          match_id: matchId,
          match_source: source
        });
      }
    });
    
  } catch (err) {
    console.error("WebSocket bağlantısı oluşturulamadı:", err);
    if (typeof showToast === "function") {
      showToast("Gerçek zamanlı güncellemeler başlatılamadı", "error");
    }
  }
}

/**
 * Gerçek zamanlı güncellemeleri durdurur
 */
function stopRealtimeUpdates() {
  if (matchSocket) {
    // Abonelikten çık
    if (matchSocket.connected) {
      matchSocket.emit("unsubscribe_match", {});
    }
    
    // Bağlantıyı kapat
    matchSocket.disconnect();
    matchSocket = null;
  }
  sseRetryCount = 0;
  
  // Auto-save timer'ı da temizle
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  isAutoSaving = false;
}
