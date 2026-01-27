/**
 * Audience Core - Merkezi Audience Display Yönetim Modülü
 * 
 * Bu modül tüm audience display ekranları için merkezi state yönetimi sağlar.
 * Preview, WebSocket, view yönetimi ve UI güncellemeleri burada yapılır.
 * 
 * MİMARİ:
 * =======
 * - Observer Pattern: UI'lar subscribe olur, state değiştiğinde notify edilir
 * - Single Source of Truth: Tüm audience state burada tutulur
 * - Preview State Machine: Preview durumları için state machine pattern
 * - WebSocket Yönetimi: /audience namespace için WebSocket bağlantıları
 * - Error Recovery: Hata durumlarında otomatik recovery
 * 
 * BAĞIMLILIKLAR:
 * ==============
 * - network_utils.js: apiGet, apiPost fonksiyonları
 * - Socket.IO: io() global fonksiyonu
 * - constants.js: NETWORK_CONSTANTS (opsiyonel)
 * 
 * KULLANIM:
 * ========
 * // Audience Core'u başlat
 * await AudienceCore.initialize(screenId);
 * 
 * // State değişikliklerini dinle
 * const unsubscribe = AudienceCore.subscribe((state) => {
 *   // State değiştiğinde UI'ı güncelle
 *   updateUI(state);
 * });
 * 
 * // Sayfa kapanırken cleanup
 * window.addEventListener("beforeunload", () => {
 *   unsubscribe();
 *   AudienceCore.cleanup();
 * });
 */

class AudienceCore {
  constructor() {
    // State
    this.screenId = "";
    this.currentView = "match";
    this.match = null;
    this.currentState = "idle";
    this.timeRemaining = 0;
    this.scores = {
      red: 0,
      blue: 0
    };
    
    // State değişikliği takibi (ses efekti için)
    this.lastMatchState = "";
    this.lastMatchId = null;
    
    // Preview yönetimi
    this.previewPayload = null;
    this.previewState = "none"; // "none", "vs_preview", "normal_preview", "results"
    this.previewClearAttempts = 0;
    this.MAX_PREVIEW_CLEAR_ATTEMPTS = 3;
    
    // Overlay
    this.overlayEnabled = false;
    this.overlayText = "";
    
    // WebSocket bağlantıları
    this.audienceSocket = null;
    this.retryCount = 0;
    this.MAX_RETRY_COUNT = 10;
    this.RETRY_DELAY_BASE = 1000;
    this.isWebSocketActive = false;
    
    // Observer pattern
    this.subscribers = new Set();
    
    // Periyodik kontrol
    this.settingsCheckInterval = null;
    this.heartbeatInterval = null;
    this.SETTINGS_CHECK_INTERVAL = 2000; // 2 saniye
    this.HEARTBEAT_INTERVAL = 5000; // 5 saniye
    
    // Error recovery
    this.lastError = null;
    this.errorCount = 0;
    this.MAX_ERROR_COUNT = 5;
  }
  
  /**
   * Audience Core'u başlatır
   * 
   * @param {string} screenId - Ekran ID'si
   */
  async initialize(screenId) {
    if (!screenId) {
      console.error("AudienceCore: screenId gerekli");
      return false;
    }
    
    this.screenId = screenId;
    
    // İlk heartbeat gönder
    await this.sendHeartbeat();
    
    // Screen settings'i yükle
    await this.loadScreenSettings();
    
    // Periyodik kontrolleri başlat
    this.startPeriodicChecks();
    
    console.log("AudienceCore: Başlatıldı", { screenId });
    return true;
  }
  
  /**
   * UI'ları subscribe eder
   * 
   * @param {Function} callback - State değiştiğinde çağrılacak fonksiyon
   * @returns {Function} Unsubscribe fonksiyonu
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    
    // İlk state'i hemen gönder
    callback(this.getState());
    
    return () => {
      this.subscribers.delete(callback);
    };
  }
  
  /**
   * Tüm subscriber'lara state değişikliğini bildirir
   */
  notify() {
    const state = this.getState();
    this.subscribers.forEach(callback => {
      try {
        callback(state);
      } catch (err) {
        console.error("AudienceCore subscriber error:", err);
      }
    });
  }
  
  /**
   * Mevcut state'i döndürür
   */
  getState() {
    return {
      screenId: this.screenId,
      currentView: this.currentView,
      match: this.match,
      currentState: this.currentState,
      timeRemaining: this.timeRemaining,
      scores: this.scores,
      previewPayload: this.previewPayload,
      previewState: this.previewState,
      overlayEnabled: this.overlayEnabled,
      overlayText: this.overlayText,
      isWebSocketActive: this.isWebSocketActive,
      hasPreview: this.previewState !== "none"
    };
  }
  
  /**
   * Screen settings'i yükler ve preview durumunu kontrol eder
   */
  async loadScreenSettings() {
    try {
      const data = await apiGet(`/api/screens/view?screen_id=${encodeURIComponent(this.screenId)}`);
      
      const newView = data.active_view || "match";
      const newOverlayEnabled = !!data.overlay_enabled;
      const newOverlayText = data.overlay_text || "";
      const newPreviewPayload = data.preview_payload || null;
      
      // Overlay güncelle
      if (this.overlayEnabled !== newOverlayEnabled || this.overlayText !== newOverlayText) {
        this.overlayEnabled = newOverlayEnabled;
        this.overlayText = newOverlayText;
      }
      
      // Preview yönetimi (state machine pattern)
      await this.handlePreviewState(newPreviewPayload);
      
      // View değişikliği (preview yoksa)
      if (this.previewState === "none" && this.currentView !== newView) {
        this.switchView(newView);
      }
      
      this.errorCount = 0; // Başarılı, hata sayacını sıfırla
      
    } catch (err) {
      console.error("AudienceCore: loadScreenSettings error:", err);
      this.lastError = err;
      this.errorCount++;
      
      // Çok fazla hata varsa, preview'ı koru ama normal görünüme geçmeyi dene
      if (this.errorCount >= this.MAX_ERROR_COUNT && this.previewState !== "none") {
        console.warn("AudienceCore: Çok fazla hata, preview korunuyor ama normal görünüme geçiliyor");
        // Preview'ı koru ama WebSocket'i başlatmayı dene
        if (this.currentView === "match" && !this.isWebSocketActive) {
          this.startWebSocketConnection();
        }
      }
    }
  }
  
  /**
   * Preview state machine - Preview durumlarını yönetir
   * 
   * @param {Object|null} newPreviewPayload - Yeni preview payload veya null
   */
  async handlePreviewState(newPreviewPayload) {
    // State machine: none -> vs_preview/normal_preview/results -> none
    
    if (newPreviewPayload) {
      // Preview var
      const payloadChanged = JSON.stringify(newPreviewPayload) !== JSON.stringify(this.previewPayload);
      
      if (payloadChanged || !this.previewPayload) {
        // Yeni preview geldi veya güncellendi
        this.previewPayload = newPreviewPayload;
        this.previewClearAttempts = 0;
        
        // Preview tipine göre state'i belirle
        if (newPreviewPayload.type === "vs_preview") {
          this.previewState = "vs_preview";
        } else if (newPreviewPayload.type === "results") {
          this.previewState = "results";
        } else {
          this.previewState = "normal_preview";
        }
        
        // WebSocket'i durdur (preview aktifken)
        this.stopWebSocketConnection();
        
        // Preview'ı uygula
        this.notify();
      }
      // Preview değişmedi, koru
      
    } else if (!newPreviewPayload && this.previewPayload) {
      // Backend'den preview_payload None döndü
      // Preview temizlenmiş olabilir, ama geçici hata da olabilir
      
      this.previewClearAttempts++;
      
      if (this.previewClearAttempts < this.MAX_PREVIEW_CLEAR_ATTEMPTS) {
        // Henüz kesin değil, preview'ı koru
        console.log(`AudienceCore: Preview temizlenme kontrolü (${this.previewClearAttempts}/${this.MAX_PREVIEW_CLEAR_ATTEMPTS})`);
        // Preview korunuyor, state değişikliği yok
      } else {
        // 3 kontrol döngüsü sonrası hala None, preview gerçekten temizlenmiş
        console.log("AudienceCore: Preview temizlendi, normal görünüme geçiliyor");
        this.previewPayload = null;
        this.previewState = "none";
        this.previewClearAttempts = 0;
        
        // Normal maç görünümünü yükle ve WebSocket'i başlat
        if (this.currentView === "match") {
          await this.loadMatchView();
          this.startWebSocketConnection();
        }
        
        this.notify();
      }
      
    } else if (!newPreviewPayload && !this.previewPayload) {
      // Preview yok, normal işlem
      this.previewClearAttempts = 0;
      
      // Eğer preview state'i hala "none" değilse, sıfırla
      if (this.previewState !== "none") {
        this.previewState = "none";
        this.notify();
      }
    }
  }
  
  /**
   * Maç görünümünü yükler (API'den)
   */
  async loadMatchView() {
    try {
      // Preview aktifken normal maç görünümünü yükleme
      if (this.previewState !== "none") {
        return;
      }
      
      const data = await apiGet("/api/match-control/audience-display");
      
      if (data.match) {
        this.match = data.match;
        this.currentState = data.match.current_state || "idle";
        this.timeRemaining = data.match.time_remaining || 0;
        this.scores = {
          red: data.match.red_score || 0,
          blue: data.match.blue_score || 0
        };
        
        this.notify();
      } else {
        // Maç yok
        this.match = null;
        this.currentState = "idle";
        this.timeRemaining = 0;
        this.scores = { red: 0, blue: 0 };
        this.notify();
      }
    } catch (err) {
      console.error("AudienceCore: loadMatchView error:", err);
      // Hata durumunda mevcut state'i koru
    }
  }
  
  /**
   * WebSocket bağlantısını başlatır
   */
  startWebSocketConnection() {
    // Preview aktifken WebSocket başlatma
    if (this.previewState !== "none") {
      console.log("AudienceCore: Preview aktif, WebSocket başlatılmıyor");
      return;
    }
    
    this.stopWebSocketConnection();
    this.retryCount = 0;
    
    try {
      this.audienceSocket = io("/audience", {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.MAX_RETRY_COUNT,
        timeout: 20000,
        query: {
          screen_id: this.screenId
        }
      });
      
      // Bağlantı kurulduğunda
      this.audienceSocket.on("connect", () => {
        console.log("AudienceCore: WebSocket bağlantısı kuruldu");
        this.retryCount = 0;
        this.isWebSocketActive = true;
        
        // Audience güncellemelerine abone ol
        this.audienceSocket.emit("subscribe_audience", {
          screen_id: this.screenId
        });
        
        this.notify();
      });
      
      // Maç güncellemesi
      this.audienceSocket.on("match_update", (data) => {
        try {
          // Preview aktifken WebSocket mesajlarını yoksay
          if (this.previewState !== "none") {
            return;
          }
          
          const match = data.match;
          if (match) {
            // Maç değiştiyse state takibini sıfırla
            if (match.id !== this.lastMatchId) {
              this.lastMatchId = match.id;
              this.lastMatchState = "";
            }
            
            // State değişikliği kontrolü (ses efekti için - güncellemeden ÖNCE)
            const newState = match.current_state || this.currentState;
            const stateChanged = newState && newState !== this.lastMatchState;
            
            // Match bilgilerini güncelle
            this.match = match;
            this.currentState = newState;
            this.timeRemaining = match.time_remaining || this.timeRemaining;
            
            // State değiştiyse ses efekti için flag set et (UI'da handle edilecek)
            if (stateChanged && newState) {
              this.lastMatchState = newState;
              // State değişikliği için özel flag (UI'da kontrol edilecek)
              this.match._stateChanged = true;
            }
            
            this.notify();
          } else {
            // Maç yok
            this.match = null;
            this.currentState = "idle";
            this.timeRemaining = 0;
            this.notify();
          }
        } catch (err) {
          console.error("AudienceCore: match_update error:", err);
        }
      });
      
      // Skor güncellemesi
      this.audienceSocket.on("scores_update", (data) => {
        try {
          // Preview aktifken WebSocket mesajlarını yoksay
          if (this.previewState !== "none") {
            return;
          }
          
          const redScore = data.scores?.red_score ?? null;
          const blueScore = data.scores?.blue_score ?? null;
          
          if (redScore !== null) {
            this.scores.red = redScore;
          }
          if (blueScore !== null) {
            this.scores.blue = blueScore;
          }
          
          this.notify();
        } catch (err) {
          console.error("AudienceCore: scores_update error:", err);
        }
      });
      
      // Hata mesajı
      this.audienceSocket.on("error", (error) => {
        console.error("AudienceCore: WebSocket error:", error);
      });
      
      // Bağlantı kesildiğinde
      this.audienceSocket.on("disconnect", (reason) => {
        console.warn("AudienceCore: WebSocket bağlantısı kesildi:", reason);
        this.isWebSocketActive = false;
        this.notify();
        
        if (reason === "io server disconnect" || reason === "transport close") {
          if (this.retryCount < this.MAX_RETRY_COUNT && this.currentView === "match" && this.previewState === "none") {
            const retryDelay = Math.min(30000, this.RETRY_DELAY_BASE * Math.pow(2, this.retryCount));
            this.retryCount++;
            
            setTimeout(() => {
              if (this.currentView === "match" && this.previewState === "none") {
                console.log(`AudienceCore: WebSocket yeniden bağlanma denemesi ${this.retryCount}/${this.MAX_RETRY_COUNT}...`);
                this.startWebSocketConnection();
              }
            }, retryDelay);
          }
        }
      });
      
      // Yeniden bağlanma
      this.audienceSocket.on("reconnect", () => {
        console.log("AudienceCore: WebSocket yeniden bağlandı");
        this.retryCount = 0;
        this.isWebSocketActive = true;
        
        // Audience güncellemelerine tekrar abone ol
        this.audienceSocket.emit("subscribe_audience", {
          screen_id: this.screenId
        });
        
        this.notify();
      });
      
    } catch (err) {
      console.error("AudienceCore: WebSocket bağlantısı oluşturulamadı:", err);
      this.isWebSocketActive = false;
      this.notify();
    }
  }
  
  /**
   * WebSocket bağlantısını durdurur
   */
  stopWebSocketConnection() {
    if (this.audienceSocket) {
      this.audienceSocket.disconnect();
      this.audienceSocket = null;
    }
    this.isWebSocketActive = false;
    this.retryCount = 0;
    this.notify();
  }
  
  /**
   * Heartbeat gönderir
   */
  async sendHeartbeat() {
    try {
      await apiPost("/api/screens/heartbeat", {
        screen_id: this.screenId,
        screen_name: "",
        view: this.currentView,
        overlay_enabled: this.overlayEnabled
      });
    } catch (err) {
      console.warn("AudienceCore: Heartbeat error:", err);
    }
  }
  
  /**
   * Periyodik kontrolleri başlatır
   */
  startPeriodicChecks() {
    // Screen settings kontrolü
    this.settingsCheckInterval = setInterval(() => {
      this.loadScreenSettings().catch(err => {
        console.warn("AudienceCore: loadScreenSettings error:", err);
      });
    }, this.SETTINGS_CHECK_INTERVAL);
    
    // Heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat().catch(err => {
        console.warn("AudienceCore: sendHeartbeat error:", err);
      });
    }, this.HEARTBEAT_INTERVAL);
  }
  
  /**
   * Periyodik kontrolleri durdurur
   */
  stopPeriodicChecks() {
    if (this.settingsCheckInterval) {
      clearInterval(this.settingsCheckInterval);
      this.settingsCheckInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  /**
   * View değiştirir
   * 
   * @param {string} viewName - Görüntülenecek view adı
   */
  switchView(viewName) {
    // Preview aktifken view değişikliği yapma
    if (this.previewState !== "none" && viewName === "match") {
      console.log("AudienceCore: Preview aktif, view değişikliği yapılmıyor");
      return;
    }
    
    // View değişmediyse işlem yapma
    if (this.currentView === viewName) {
      return;
    }
    
    this.currentView = viewName;
    
    // Match view için WebSocket yönetimi
    if (viewName === "match" && this.previewState === "none") {
      this.startWebSocketConnection();
      // Match view için maç verilerini yükle
      this.loadMatchView();
    } else {
      this.stopWebSocketConnection();
    }
    
    // View değişikliği için UI güncellemesi yapılacak (notify ile)
    this.notify();
  }
  
  /**
   * Inspection view'ı yükler
   */
  async loadInspectionView() {
    try {
      // Bu fonksiyon UI'da handle edilecek (audience_display_views.js'deki loadInspectionView)
      // Audience Core sadece state'i yönetir, UI güncellemesi notify ile yapılır
      this.notify();
    } catch (err) {
      console.error("AudienceCore: loadInspectionView error:", err);
    }
  }
  
  /**
   * Awards view'ı yükler
   */
  async loadAwardsView() {
    try {
      // Bu fonksiyon UI'da handle edilecek (audience_display_views.js'deki loadAwardsView)
      // Audience Core sadece state'i yönetir, UI güncellemesi notify ile yapılır
      this.notify();
    } catch (err) {
      console.error("AudienceCore: loadAwardsView error:", err);
    }
  }
  
  /**
   * Tüm kaynakları temizler
   */
  cleanup() {
    this.stopWebSocketConnection();
    this.stopPeriodicChecks();
    this.subscribers.clear();
  }
}

// Global instance (class adı ile instance adı farklı olmalı)
const audienceCoreInstance = new AudienceCore();

// Export (geriye dönük uyumluluk için AudienceCore adıyla da export ediyoruz)
if (typeof window !== "undefined") {
  window.AudienceCore = audienceCoreInstance;
}

// Module export
if (typeof module !== "undefined" && module.exports) {
  module.exports = audienceCoreInstance;
}
