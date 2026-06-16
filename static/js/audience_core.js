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

class AudienceCoreManager {
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
    // Chroma key (yeşil ekran): tek renk arka plan, OBS vb. ile key'lenebilir
    this.overlayChromaEnabled = false;
    this.overlayChromaColor = "#00ff00";
    
    // Ceremony state (tören durumu)
    this.ceremonyState = null;
    
    // WebSocket bağlantıları
    this.audienceSocket = null;
    this.retryCount = 0;
    this.MAX_RETRY_COUNT = 10;
    this.RETRY_DELAY_BASE = 1000;
    this.isWebSocketActive = false;
    
    // Observer pattern
    this.subscribers = new Set();
    
    // Periyodik kontrol (preview'ın hızlı gelmesi için 1 saniye)
    this.settingsCheckInterval = null;
    this.heartbeatInterval = null;
    this.matchViewInterval = null; // Canlı maç verisi yedek (WebSocket yoksa)
    this.SETTINGS_CHECK_INTERVAL = 500; // 0.5 saniye - "Ön izleme göster" sonrası ilk görüntü hızlı gelsin
    this.HEARTBEAT_INTERVAL = 5000; // 5 saniye
    this.MATCH_VIEW_INTERVAL = 1000; // 1 saniye (baş hakem ekranı gibi periyodik REST ile timer/skor)
    
    // Error recovery
    this.lastError = null;
    this.errorCount = 0;
    this.MAX_ERROR_COUNT = 5;
    // Timer senkronizasyonu: sunucudan gelen son server_timestamp (saniye)
    this.lastServerTimestamp = null;
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
    
    // Screen settings'i yükle (preview varsa hemen al)
    await this.loadScreenSettings();
    
    // WebSocket bağlantısını başlat (view_change için her zaman açık)
    this.startWebSocketConnection();
    
    // Periyodik kontrolleri başlat
    this.startPeriodicChecks();
    
    // Önizleme az önce gönderilmiş olabilir: kısa süre sonra bir kez daha kontrol et
    setTimeout(() => this.loadScreenSettings().catch(() => {}), 500);
    
    // Sekme görünür olduğunda hemen ayar/preview çek (Önizleme Göster sonrası sekmeye geçince)
    if (typeof document !== "undefined" && document.addEventListener) {
      this._visibilityHandler = () => {
        if (document.visibilityState === "visible") {
          this.loadScreenSettings().catch(() => {});
        }
      };
      document.addEventListener("visibilitychange", this._visibilityHandler);
    }
    
    // Maç görünümünde ve önizleme yoksa WebSocket başlat (canlı skor/timer için)
    if (this.currentView === "match" && this.previewState === "none") {
      this.startWebSocketConnection();
    }
    
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
      overlayChromaEnabled: this.overlayChromaEnabled,
      overlayChromaColor: this.overlayChromaColor,
      isWebSocketActive: this.isWebSocketActive,
      hasPreview: this.previewState !== "none",
      ceremonyState: this.ceremonyState,
      serverTimestamp: this.lastServerTimestamp
    };
  }
  
  /**
   * Screen settings'i yükler ve preview durumunu kontrol eder
   */
  async loadScreenSettings() {
    try {
      // Cache-busting: önizleme güncel gelsin (tarayıcı eski yanıt döndürmesin)
      const data = await apiGet(`/api/screens/view?screen_id=${encodeURIComponent(this.screenId)}&_t=${Date.now()}`);
      
      const newView = data.active_view || "match";
      this.followGlobal = data.follow_global !== undefined ? !!data.follow_global : true;
      this.desiredView = data.desired_view || "match";
      const newOverlayEnabled = !!data.overlay_enabled;
      const newOverlayText = data.overlay_text || "";
      const newChromaEnabled = !!data.overlay_chroma_enabled;
      const newChromaColor = (data.overlay_chroma_color || "").trim() || "#00ff00";
      const newPreviewPayload = data.preview_payload || null;
      
      // Overlay ve chroma key güncelle
      if (this.overlayEnabled !== newOverlayEnabled || this.overlayText !== newOverlayText ||
          this.overlayChromaEnabled !== newChromaEnabled || this.overlayChromaColor !== newChromaColor) {
        this.overlayEnabled = newOverlayEnabled;
        this.overlayText = newOverlayText;
        this.overlayChromaEnabled = newChromaEnabled;
        this.overlayChromaColor = newChromaColor;
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
        this.timeRemaining = data.match.time_remaining ?? 0;
        this.scores = {
          red: data.match.red_score ?? 0,
          blue: data.match.blue_score ?? 0
        };
        if (data.server_timestamp != null) {
          this.lastServerTimestamp = data.server_timestamp;
        }
        if (this.match && data.server_timestamp != null) {
          this.match.server_timestamp = data.server_timestamp;
        }
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
   * 
   * WebSocket her zaman açık tutulur (view_change event'leri için).
   * match_update ve scores_update sadece match view'da ve preview yokken işlenir.
   */
  startWebSocketConnection() {
    // Zaten bağlıysa tekrar başlatma
    if (this.audienceSocket && this.audienceSocket.connected) {
      console.log("AudienceCore: WebSocket zaten bağlı");
      return;
    }
    
    this.stopWebSocketConnection();
    this.retryCount = 0;
    
    try {
      // WebSocket bağlantısı - simple-websocket paketi ile threading modunda desteklenir
      // Önce WebSocket dener, başarısız olursa polling'e düşer
      this.audienceSocket = io("/audience", {
        transports: ["websocket", "polling"],  // WebSocket öncelikli
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
        
        // Abone ol; sunucu anında match_update + scores_update gönderir
        this.audienceSocket.emit("subscribe_audience", {
          screen_id: this.screenId
        });
        
        this.notify();
        // Canlı skor/timer için REST yedek (sunucu yanıtı gecikirse)
        this.loadMatchView().catch(() => {});
      });
      
      // ===== VIEW CHANGE EVENT (ANLIK GÜNCELLEME) =====
      // Bu event her zaman dinlenir ve anlık view değişikliği sağlar
      this.audienceSocket.on("view_change", (data) => {
        try {
          console.log("AudienceCore: view_change event alındı:", data);
          
          // Eğer ekran-spesifik bir mesajsa ve bu ekrana ait değilse yoksay
          if (data.screen_id && data.screen_id !== this.screenId) {
            console.log("AudienceCore: Farklı ekran için view_change, yoksayılıyor");
            return;
          }
          
          const newView = data.active_view || "match";
          const newOverlayEnabled = !!data.overlay_enabled;
          const newOverlayText = data.overlay_text || "";
          const newChromaEnabled = !!data.overlay_chroma_enabled;
          const newChromaColor = data.overlay_chroma_color || "#00ff00";
          
          // Overlay ve chroma key güncelle
          this.overlayEnabled = newOverlayEnabled;
          this.overlayText = newOverlayText;
          this.overlayChromaEnabled = newChromaEnabled;
          this.overlayChromaColor = newChromaColor;
          
          // Global view_change ise ve bu ekran global takip etmiyorsa yok say
          if (!data.screen_id && this.followGlobal === false) {
            this.notify();
            return;
          }

          // Eğer maç view'a geçiliyorsa, preview'ı da temizle (server tarafında temizlenmiş demektir)
          if (newView === "match" && this.previewState !== "none") {
            console.log("AudienceCore: Maç view'a geçiliyor, preview temizleniyor");
            this.previewPayload = null;
            this.previewState = "none";
            this.previewClearAttempts = 0;
          }
          
          // View değişikliği
          if (this.currentView !== newView) {
            console.log(`AudienceCore: View değiştiriliyor: ${this.currentView} -> ${newView}`);
            this.switchView(newView);
          } else {
            // Sadece overlay değişikliği için notify
            this.notify();
          }
        } catch (err) {
          console.error("AudienceCore: view_change error:", err);
        }
      });
      
      // ===== INSPECTION UPDATE EVENT (İNCELEME GÜNCELLEMELERİ) =====
      // Bu event her zaman dinlenir ve anlık inceleme güncellemesi sağlar
      this.audienceSocket.on("inspection_update", (data) => {
        try {
          console.log("AudienceCore: inspection_update event alındı:", data);
          
          // Inspection view aktifse içeriği yeniden yükle
          if (this.currentView === "inspection") {
            // loadInspectionView audience_display_views.js'de tanımlı
            if (typeof loadInspectionView === "function") {
              loadInspectionView();
            }
          }
          
          this.notify();
        } catch (err) {
          console.error("AudienceCore: inspection_update error:", err);
        }
      });
      
      // ===== AWARDS UPDATE EVENT (ÖDÜL GÜNCELLEMELERİ) =====
      // Bu event her zaman dinlenir ve anlık ödül güncellemesi sağlar
      this.audienceSocket.on("awards_update", (data) => {
        try {
          console.log("AudienceCore: awards_update event alındı:", data);
          
          // Awards view aktifse içeriği yeniden yükle
          if (this.currentView === "awards") {
            if (typeof loadAwardsView === "function") {
              loadAwardsView();
            }
          }
          
          this.notify();
        } catch (err) {
          console.error("AudienceCore: awards_update error:", err);
        }
      });
      
      // ===== RANKINGS UPDATE EVENT (SIRALAMA GÜNCELLEMELERİ) =====
      // Bu event maç tamamlandığında tetiklenir
      this.audienceSocket.on("rankings_update", (data) => {
        try {
          console.log("AudienceCore: rankings_update event alındı:", data);
          
          // Rankings view aktifse içeriği yeniden yükle
          if (this.currentView === "rankings") {
            if (typeof loadRankingsView === "function") {
              loadRankingsView();
            }
          }
          
          this.notify();
        } catch (err) {
          console.error("AudienceCore: rankings_update error:", err);
        }
      });
      
      // ===== MATCH COMPLETED EVENT (MAÇ TAMAMLANDI) =====
      // Bu event maç tamamlandığında tetiklenir
      this.audienceSocket.on("match_completed", (data) => {
        try {
          console.log("AudienceCore: match_completed event alındı:", data);
          
          // Maç view aktifse ve bu maç için tamamlandıysa UI'ı güncelle
          if (this.currentView === "match") {
            // Maç verilerini yeniden yükle
            this.loadMatchView();
          }
          
          this.notify();
        } catch (err) {
          console.error("AudienceCore: match_completed error:", err);
        }
      });
      
      // ===== CEREMONY UPDATE EVENT (TÖREN GÜNCELLEMELERİ) =====
      // Bu event her zaman dinlenir ve anlık tören güncellemesi sağlar
      this.audienceSocket.on("ceremony_update", (data) => {
        try {
          console.log("AudienceCore: ceremony_update event alındı:", data);
          
          // Ceremony state'i güncelle
          this.ceremonyState = data;
          
          // Ceremony view aktifse VEYA henüz değilse ama tören başladıysa UI'ı güncelle
          // Bu sayede view geçişi sırasında da güncellemeler kaybolmaz
          if (typeof window.AudienceCeremony !== "undefined" && window.AudienceCeremony.handleUpdate) {
            window.AudienceCeremony.handleUpdate(data);
          }
          
          this.notify();
        } catch (err) {
          console.error("AudienceCore: ceremony_update error:", err);
        }
      });
      
      // Maç güncellemesi (maç kontrol ile senkron: state değişince broadcast gelir; timer/ses aynı anda)
      this.audienceSocket.on("match_update", (data) => {
        try {
          const match = data.match;
          const isActiveMatch = match && ["autonomous", "prepare_teleop", "driver_controlled"].includes(match.current_state);
          if (this.previewState !== "none" && isActiveMatch) {
            console.log("AudienceCore: Aktif maç algılandı, preview temizleniyor ve maç view'a geçiliyor");
            this.previewPayload = null;
            this.previewState = "none";
            this.previewClearAttempts = 0;
            // Preview temizlendiğinde, eğer match view'da değilsek, match view'a geç
            if (this.currentView !== "match") {
              console.log(`AudienceCore: View değiştiriliyor: ${this.currentView} -> match (aktif maç nedeniyle)`);
              this.switchView("match");
            }
          }
          if (this.previewState !== "none") {
            return;
          }
          if (match && match.server_timestamp != null) {
            this.lastServerTimestamp = match.server_timestamp;
          } else if (data.server_timestamp != null) {
            this.lastServerTimestamp = data.server_timestamp;
          }
          if (match) {
            if (match.id !== this.lastMatchId) {
              this.lastMatchId = match.id;
              this.lastMatchState = "";
            }
            const newState = match.current_state || this.currentState;
            const stateChanged = newState && newState !== this.lastMatchState;
            this.match = match;
            this.currentState = newState;
            this.timeRemaining = match.time_remaining ?? this.timeRemaining;
            if (this.scores.red !== undefined) this.match.red_score = this.scores.red;
            if (this.scores.blue !== undefined) this.match.blue_score = this.scores.blue;
            if (stateChanged && newState) {
              this.lastMatchState = newState;
              this.match._stateChanged = true;
            }
            this.notify();
          } else {
            this.match = null;
            this.currentState = "idle";
            this.timeRemaining = 0;
            this.notify();
          }
        } catch (err) {
          console.error("AudienceCore: match_update error:", err);
        }
      });
      
      // Skor güncellemesi (match objesine de yazıyoruz ki UI state.match ile senkron kalsın)
      this.audienceSocket.on("scores_update", (data) => {
        try {
          if (this.previewState !== "none") {
            return;
          }
          
          const redScore = data.scores?.red_score ?? null;
          const blueScore = data.scores?.blue_score ?? null;
          
          if (redScore !== null) {
            this.scores.red = redScore;
            if (this.match) this.match.red_score = redScore;
          }
          if (blueScore !== null) {
            this.scores.blue = blueScore;
            if (this.match) this.match.blue_score = blueScore;
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
        
        // Her zaman yeniden bağlanmayı dene (view_change için gerekli)
        if (reason === "io server disconnect" || reason === "transport close") {
          if (this.retryCount < this.MAX_RETRY_COUNT) {
            const retryDelay = Math.min(30000, this.RETRY_DELAY_BASE * Math.pow(2, this.retryCount));
            this.retryCount++;
            
            setTimeout(() => {
              console.log(`AudienceCore: WebSocket yeniden bağlanma denemesi ${this.retryCount}/${this.MAX_RETRY_COUNT}...`);
              this.startWebSocketConnection();
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
    
    // Maç verisi yedek (önizleme yoksa; canlı skor/timer için WebSocket yanı sıra)
    this.matchViewInterval = setInterval(() => {
      if (this.previewState === "none" && this.currentView === "match") {
        this.loadMatchView().catch(() => {});
      }
    }, this.MATCH_VIEW_INTERVAL);
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
    if (this.matchViewInterval) {
      clearInterval(this.matchViewInterval);
      this.matchViewInterval = null;
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
    
    // WebSocket yönetimi - match ve ceremony view'ları için WebSocket açık tutulmalı
    if (viewName === "match" && this.previewState === "none") {
      this.startWebSocketConnection();
      // Match view için maç verilerini yükle
      this.loadMatchView();
    } else if (viewName === "ceremony") {
      // Ceremony view için WebSocket açık tutulmalı (ceremony_update için)
      this.startWebSocketConnection();
      // Ceremony state'i yükle
      this.loadCeremonyState();
    } else {
      this.stopWebSocketConnection();
    }
    
    // View değişikliği için UI güncellemesi yapılacak (notify ile)
    this.notify();
  }
  
  /**
   * Ceremony state'i API'den yükler
   */
  async loadCeremonyState() {
    try {
      const data = await apiGet("/api/public/ceremony");
      console.log("AudienceCore: Ceremony state yüklendi:", data);
      
      this.ceremonyState = data;
      
      // AudienceCeremony modülüne ilet
      if (typeof window.AudienceCeremony !== "undefined" && window.AudienceCeremony.handleUpdate) {
        window.AudienceCeremony.handleUpdate(data);
      }
      
      this.notify();
    } catch (err) {
      console.error("AudienceCore: loadCeremonyState error:", err);
    }
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
    if (typeof document !== "undefined" && this._visibilityHandler) {
      document.removeEventListener("visibilitychange", this._visibilityHandler);
      this._visibilityHandler = null;
    }
  }
}

// Global instance (class adı ile instance adı farklı olmalı)
const audienceCoreInstance = new AudienceCoreManager();

// Export (geriye dönük uyumluluk için AudienceCore adıyla da export ediyoruz)
if (typeof window !== "undefined") {
  window.AudienceCore = audienceCoreInstance;
}

// Module export
if (typeof module !== "undefined" && module.exports) {
  module.exports = audienceCoreInstance;
}
