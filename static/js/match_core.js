/**
 * Match Core - Merkezi Maç Durumu Yönetim Modülü
 * 
 * Bu modül tüm UI'lar için merkezi match state yönetimi sağlar.
 * Tüm WebSocket bağlantıları ve state yönetimi burada yapılır.
 * UI'lar sadece subscribe olur ve render eder.
 * 
 * MİMARİ:
 * =======
 * - Observer Pattern: UI'lar subscribe olur, state değiştiğinde notify edilir
 * - Single Source of Truth: Tüm match state burada tutulur
 * - WebSocket Yönetimi: Tüm WebSocket bağlantıları burada yönetilir
 * - Timer Yönetimi: Merkezi timer yönetimi (server timestamp ile senkronize)

* 
 * BAĞIMLILIKLAR:
 * ==============
 * - network_utils.js: apiGet, apiPost fonksiyonları
 * - Socket.IO: io() global fonksiyonu
 * - constants.js: MATCH_CONSTANTS, NETWORK_CONSTANTS (opsiyonel)
 * 
 * KULLANIM:
 * ========
 * // UI'da subscribe ol
 * const unsubscribe = MatchCore.subscribe((matchState) => {
 *   // State değiştiğinde UI'ı güncelle
 *   if (matchState.match) {
 *     renderUI(matchState);
 *   }
 * });
 * 
 * // Aktif maçı yükle
 * await MatchCore.loadActiveMatch();
 * 
 * // Periyodik kontrol başlat (opsiyonel)
 * MatchCore.startPeriodicCheck(5000);
 * 
 * // Sayfa kapanırken cleanup
 * window.addEventListener("beforeunload", () => {
 *   unsubscribe();
 * });
 * 
 * // Maç başlatma (sadece match_control'dan)
 * await MatchCore.startMatch(matchId, matchSource, fieldNumber, teamStatuses);
 * 
 * // State değiştirme (sadece match_control'dan)
 * await MatchCore.nextState();
 * 
 * TEST:
 * ====
 * Console'da test etmek için:
 * - testMatchCore() fonksiyonunu çağır (match_core_test.js'de)
 * - veya MatchCore.getState() ile mevcut state'i kontrol et
 */

class MatchCore {
  constructor() {
    // State
    this.match = null;
    this.currentState = "idle";
    this.timeRemaining = 0;
    this.scores = {
      red: null,
      blue: null,
      referee_meta: {}
    };
    this.teamStatuses = {};
    
    // Timer yönetimi
    this.timerStartTime = null;
    this.timerInitialDuration = 0;
    this.timerInterval = null;
    this.serverTimeOffset = 0; // Client-server zaman farkı
    
    // WebSocket bağlantıları
    this.matchSocket = null;
    this.retryCount = 0;
    this.MAX_RETRY_COUNT = 5;
    this.RETRY_DELAY_BASE = 1000;
    
    // Observer pattern - UI'lar subscribe olur
    this.subscribers = new Set();
    
    // Manuel seçim (preview için)
    this.manuallySelectedMatchId = null;
    this.manuallySelectedMatchSource = null;
    
    // Periyodik kontrol
    this.periodicCheckInterval = null;
    
    // Hakem panelinden gelen skor güncellemesi (match control'de formu güncellemek için tek seferlik bayrak)
    this._scoresJustUpdated = false;
  }
  
  /**
   * UI'ları subscribe eder (state değiştiğinde notify edilir)
   * 
   * @param {Function} callback - State değiştiğinde çağrılacak fonksiyon
   * @returns {Function} Unsubscribe fonksiyonu
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    
    // İlk state'i hemen gönder
    if (this.match) {
      callback(this.getState());
    }
    
    // Unsubscribe fonksiyonu döndür
    return () => {
      this.subscribers.delete(callback);
    };
  }
  
  /**
   * Tüm subscriber'lara state değişikliğini bildirir
   */
  notify() {
    const state = this.getState();
    console.log("MatchCore: notify - state:", {
      hasMatch: !!state.match,
      matchId: state.match?.id,
      currentState: state.currentState,
      subscriberCount: this.subscribers.size
    });
    this.subscribers.forEach(callback => {
      try {
        callback(state);
      } catch (err) {
        console.error("MatchCore subscriber error:", err);
      }
    });
  }
  
  /**
   * Mevcut state'i döndürür
   */
  getState() {
    const scoresJustUpdated = this._scoresJustUpdated;
    this._scoresJustUpdated = false;
    return {
      match: this.match,
      currentState: this.currentState,
      timeRemaining: this.timeRemaining,
      scores: this.scores,
      teamStatuses: this.teamStatuses,
      isActive: this.match?.status === "in_progress",
      isPreview: this.match?.status === "preview",
      manuallySelected: this.manuallySelectedMatchId !== null,
      scoresJustUpdated
    };
  }
  
  /**
   * Aktif maçı yükler (backend'den)
   * 
   * @param {boolean} force - Manuel seçimi yok say ve zorla yükle
   */
  async loadActiveMatch(force = false) {
    try {
      console.log("MatchCore: loadActiveMatch çağrıldı, API'ye istek gönderiliyor...");
      const data = await apiGet("/api/match-control/active");
      console.log("MatchCore: API response alındı:", data);
      
      if (data.match) {
        console.log("MatchCore: Maç bulundu - id:", data.match.id, "status:", data.match.status, "match_source:", data.match.match_source);
        
        // Manuel seçim kontrolü (force değilse)
        if (!force && this.manuallySelectedMatchId && data.match.id !== this.manuallySelectedMatchId) {
          console.log("MatchCore: Aktif maç farklı, manuel seçim korunuyor");
          return;
        }
        
        // match_source alanını garanti et
        if (!data.match.match_source && data.match.source) {
          data.match.match_source = data.match.source;
        } else if (!data.match.match_source) {
          data.match.match_source = "schedule";
        }
        if (!data.match.source && data.match.match_source) {
          data.match.source = data.match.match_source;
        }
        
        // Preview maçlar için skipWebSocket=true (WebSocket başlatılmasın)
        const isPreview = data.match.status === "preview" || data.match.is_preview;
        const skipWebSocket = isPreview;
        
        // setMatch çağrılıyor (preview maçlar için de maç bilgisi gösterilmeli)
        console.log("MatchCore: setMatch çağrılıyor... (preview:", isPreview, ")");
        this.setMatch(data.match, skipWebSocket);
        console.log("MatchCore: setMatch tamamlandı, notify çağrıldı");
      } else {
        console.log("MatchCore: Aktif maç bulunamadı (data.match null)");
        // Aktif maç yok (manuel seçim varsa koru)
        if (!this.manuallySelectedMatchId) {
          console.log("MatchCore: clearMatch çağrılıyor (manuel seçim yok)");
          this.clearMatch();
        } else {
          console.log("MatchCore: Manuel seçim var, maç temizlenmiyor");
        }
      }
    } catch (err) {
      console.error("MatchCore: loadActiveMatch error:", err);
      // Hata durumunda mevcut state'i koru (geçici network hatası olabilir)
    }
  }
  
  /**
   * Periyodik olarak aktif maçı kontrol eder
   * 
   * @param {number} interval - Kontrol aralığı (ms, varsayılan: 5000)
   */
  startPeriodicCheck(interval = 5000) {
    this.stopPeriodicCheck();
    
    this.periodicCheckInterval = setInterval(() => {
      this.loadActiveMatch();
    }, interval);
    
    console.log(`MatchCore: Periyodik kontrol başlatıldı (${interval}ms)`);
  }
  
  /**
   * Periyodik kontrolü durdurur
   */
  stopPeriodicCheck() {
    if (this.periodicCheckInterval) {
      clearInterval(this.periodicCheckInterval);
      this.periodicCheckInterval = null;
    }
  }
  
  /**
   * Maç bilgisini set eder
   * 
   * @param {Object} match - Maç bilgisi
   * @param {boolean} skipWebSocket - WebSocket bağlantısı başlatılmasın (preview maçlar için)
   */
  setMatch(match, skipWebSocket = false) {
    if (!match) {
      console.warn("MatchCore: setMatch çağrıldı ama match null/undefined");
      this.clearMatch();
      return;
    }
    
    console.log("MatchCore: setMatch çağrıldı - id:", match.id, "status:", match.status, "skipWebSocket:", skipWebSocket);
    const previousMatchId = this.match?.id;
    this.match = match;
    
    // State ve timer bilgilerini güncelle
    if (match.status === "in_progress") {
      this.currentState = match.current_state || "idle";
      this.timeRemaining = match.time_remaining || 0;
      
      // Server timestamp ile senkronize et
      if (match.server_timestamp) {
        this.syncWithServerTime(match.server_timestamp, match.time_remaining);
      }
      
      // Timer'ı başlat
      this.startTimer();
      
      // WebSocket bağlantısını başlat (eğer skipWebSocket false ise)
      if (!skipWebSocket && match.id) {
        const matchSource = match.match_source || match.source || "schedule";
        console.log("MatchCore: WebSocket bağlantısı başlatılıyor - matchId:", match.id, "matchSource:", matchSource);
        try {
          this.startWebSocketConnection(match.id, matchSource);
        } catch (err) {
          console.warn("MatchCore: WebSocket bağlantısı başlatılamadı, polling kullanılacak:", err);
          // Hata olsa bile devam et, polling otomatik olarak kullanılacak
        }
      }
    } else {
      // Preview veya diğer durumlar için de state'i güncelle
      this.currentState = match.current_state || "idle";
      this.timeRemaining = match.time_remaining || 0;
      this.stopTimer();
      
      // Preview veya completed maçlar için WebSocket bağlantısı başlatma
      // Sadece aktif maçlar için WebSocket gerekli
      console.log("MatchCore: Maç in_progress değil, WebSocket başlatılmıyor - status:", match.status);
    }
    
    // Skorları yükle
    if (match.scoring_data) {
      this.scores = {
        red: match.scoring_data.red || null,
        blue: match.scoring_data.blue || null,
        referee_meta: match.scoring_data.referee_meta || {}
      };
    } else {
      // Skorlar yoksa varsayılan değerler
      this.scores = {
        red: null,
        blue: null,
        referee_meta: {}
      };
    }
    
    // Team statuses: Sadece backend'den anlamlı veri gelirse güncelle; boş gelirse mevcut seçimleri koru
    // (Periodic loadActiveMatch boş team_statuses döndüğünde seçimlerin silinmesini önler)
    const incomingTeamStatuses = match.scoring_data?.team_statuses;
    if (incomingTeamStatuses && typeof incomingTeamStatuses === "object" && Object.keys(incomingTeamStatuses).length > 0) {
      this.teamStatuses = typeof incomingTeamStatuses === "object" && !Array.isArray(incomingTeamStatuses)
        ? { ...incomingTeamStatuses }
        : {};
    } else if (previousMatchId !== match.id) {
      // Farklı maça geçildi; robot durumlarını temizle
      this.teamStatuses = {};
    }
    // Aksi halde this.teamStatuses değiştirme (aynı maç, boş gelen veri)
    
    console.log("MatchCore: setMatch tamamlandı, notify çağrılıyor - subscriber sayısı:", this.subscribers.size);
    this.notify();
    console.log("MatchCore: notify tamamlandı");
  }
  
  /**
   * Maç bilgisini temizler
   */
  clearMatch() {
    this.match = null;
    this.currentState = "idle";
    this.timeRemaining = 0;
    this.scores = { red: null, blue: null, referee_meta: {} };
    this.teamStatuses = {};
    this.stopTimer();
    this.stopWebSocketConnection();
    this.notify();
  }
  
  /**
   * Tüm kaynakları temizler (sayfa kapanırken)
   */
  cleanup() {
    this.stopTimer();
    this.stopWebSocketConnection();
    this.stopPeriodicCheck();
    this.subscribers.clear();
  }
  
  /**
   * WebSocket bağlantısını başlatır
   */
  startWebSocketConnection(matchId, matchSource) {
    this.stopWebSocketConnection();
    this.retryCount = 0;
    
    const source = matchSource || "schedule";
    
    try {
      this.matchSocket = io("/match", {
        transports: ["websocket", "polling"], // WebSocket öncelikli, polling fallback
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.MAX_RETRY_COUNT,
        timeout: 20000
      });
      
      // Bağlantı kurulduğunda
      this.matchSocket.on("connect", () => {
        console.log("MatchCore: WebSocket bağlantısı kuruldu");
        this.retryCount = 0;
        
        // Maça abone ol
        this.matchSocket.emit("subscribe_match", {
          match_id: matchId,
          match_source: source
        });
      });
      
      // Maç durumu güncellemesi
      this.matchSocket.on("match_state", (data) => {
        try {
          const matchData = data.match;
          
          if (matchData) {
            const previousState = this.currentState;
            const newState = matchData.current_state || this.currentState;
            const stateChanged = previousState !== newState;
            
            // State ve süre güncelle
            this.currentState = newState;
            this.timeRemaining = matchData.time_remaining ?? this.timeRemaining;
            
            // Match bilgisini güncelle
            if (this.match) {
              this.match.current_state = matchData.current_state;
              this.match.time_remaining = matchData.time_remaining;
              this.match.status = matchData.status;
            }
            
            // Timer: Sadece aşama değiştiğinde veya maç artık in_progress değilse start/stop yap.
            // Her match_state'te startTimer() çağrılmaz; böylece SKS tekrar başlamaz.
            if (this.match?.status === "in_progress") {
              if (stateChanged) {
                this.syncWithServerTime(matchData.server_timestamp, matchData.time_remaining);
                this.startTimer();
              } else if (matchData.server_timestamp != null) {
                this.syncWithServerTime(matchData.server_timestamp, matchData.time_remaining);
                this.notify();
              } else {
                this.notify();
              }
            } else {
              this.stopTimer();
              this.notify();
            }
          } else {
            // Maç tamamlandı
            this.clearMatch();
          }
        } catch (err) {
          console.error("MatchCore: match_state error:", err);
        }
      });
      
      // Skor güncellemesi (hakem paneli veya match control'den; tüm ekranlarda eşzamanlı görünsün)
      this.matchSocket.on("scores", (data) => {
        try {
          const scores = data.scores || data;
          
          // Scores formatı: { red: {...}, blue: {...}, referee_meta: {...}, team_statuses: {...} }
          if (scores.red != null) {
            this.scores.red = scores.red && typeof scores.red === "object" && !Array.isArray(scores.red)
              ? scores.red
              : (scores.red?.scoring_data || scores.red || {});
          }
          if (scores.blue != null) {
            this.scores.blue = scores.blue && typeof scores.blue === "object" && !Array.isArray(scores.blue)
              ? scores.blue
              : (scores.blue?.scoring_data || scores.blue || {});
          }
          if (scores.referee_meta) {
            this.scores.referee_meta = scores.referee_meta;
          }
          if (scores.team_statuses !== undefined) {
            this.teamStatuses = scores.team_statuses && typeof scores.team_statuses === "object" ? scores.team_statuses : {};
          }
          
          // Match objesini de güncelle (calculated_scores varsa)
          if (this.match && scores.calculated_scores) {
            if (!this.match.scoring_data) {
              this.match.scoring_data = {};
            }
            this.match.scoring_data.calculated_scores = scores.calculated_scores;
          }
          
          this._scoresJustUpdated = true;
          this.notify();
        } catch (err) {
          console.error("MatchCore: scores error:", err);
        }
      });
      
      // Maç önizleme güncellemesi (Sıradaki Maçı Yükle butonu tıklandığında)
      // Bu event hakem ekranlarının hemen güncellenmesini sağlar
      this.matchSocket.on("match_preview", (data) => {
        try {
          console.log("MatchCore: match_preview alındı:", data);
          const newMatch = data.match;
          
          if (newMatch) {
            // Mevcut maç farklıysa yeni maçı yükle
            if (!this.match || this.match.id !== newMatch.id) {
              console.log(`MatchCore: Yeni maç yükleniyor - ${newMatch.id}`);
              
              // Skorları sıfırla
              this.scores = { red: {}, blue: {}, referee_meta: {} };
              this.teamStatuses = {};
              
              // Yeni maç bilgilerini set et
              this.match = {
                ...newMatch,
                current_state: "pre_match",
                time_remaining: 0,
                status: "preview"
              };
              
              // Yeni maça abone ol
              if (this.matchSocket && this.matchSocket.connected) {
                // Önceki maçtan çık
                this.matchSocket.emit("unsubscribe_match", {});
                
                // Yeni maça abone ol
                this.matchSocket.emit("subscribe_match", {
                  match_id: newMatch.id,
                  match_source: newMatch.match_source || "schedule"
                });
              }
              
              // UI'ı güncelle
              this.notify();
            }
          }
        } catch (err) {
          console.error("MatchCore: match_preview error:", err);
        }
      });
      
      // Hata mesajı
      this.matchSocket.on("error", (error) => {
        console.error("MatchCore: WebSocket error:", error);
        // WebSocket hatası olsa bile uygulama çalışmaya devam etmeli
        // Sadece gerçek zamanlı güncellemeler çalışmayabilir
      });
      
      // Bağlantı hatası (transport hatası)
      this.matchSocket.on("connect_error", (error) => {
        console.warn("MatchCore: WebSocket bağlantı hatası:", error.message);
        // Polling'e fallback yapılacak (otomatik)
      });
      
      // Bağlantı kesildiğinde
      this.matchSocket.on("disconnect", (reason) => {
        console.warn("MatchCore: WebSocket bağlantısı kesildi:", reason);
        
        if (reason === "io server disconnect" || reason === "transport close") {
          if (this.retryCount < this.MAX_RETRY_COUNT && this.match) {
            const retryDelay = Math.min(30000, this.RETRY_DELAY_BASE * Math.pow(2, this.retryCount));
            this.retryCount++;
            
            setTimeout(() => {
              if (this.match) {
                this.startWebSocketConnection(this.match.id, this.match.match_source || "schedule");
              }
            }, retryDelay);
          }
        }
      });
      
      // Yeniden bağlanma
      this.matchSocket.on("reconnect", () => {
        console.log("MatchCore: WebSocket yeniden bağlandı");
        this.retryCount = 0;
        
        if (this.match) {
          this.matchSocket.emit("subscribe_match", {
            match_id: this.match.id,
            match_source: this.match.match_source || "schedule"
          });
        }
      });
      
    } catch (err) {
      console.error("MatchCore: WebSocket bağlantısı oluşturulamadı:", err);
    }
  }
  
  /**
   * WebSocket bağlantısını durdurur
   */
  stopWebSocketConnection() {
    if (this.matchSocket) {
      if (this.matchSocket.connected) {
        this.matchSocket.emit("unsubscribe_match", {});
      }
      this.matchSocket.disconnect();
      this.matchSocket = null;
    }
    this.retryCount = 0;
  }
  
  /**
   * Server timestamp ile senkronize eder
   * 
   * @param {number} serverTimestamp - Server timestamp (saniye cinsinden)
   * @param {number} serverTimeRemaining - Server'dan gelen kalan süre (saniye)
   */
  syncWithServerTime(serverTimestamp, serverTimeRemaining) {
    if (!serverTimestamp) return;
    
    const serverTime = serverTimestamp * 1000; // ms'ye çevir
    const clientTime = Date.now();
    this.serverTimeOffset = clientTime - serverTime;
    
    // Timer'ı server'dan gelen time_remaining ile senkronize et
    if (serverTimeRemaining !== undefined && serverTimeRemaining !== null) {
      const previousTimeRemaining = this.timeRemaining;
      this.timeRemaining = serverTimeRemaining;
      
      // Lokal timer değerlerini de güncelle (titreme önleme)
      // Sadece fark 2 saniyeden fazlaysa yeniden hesapla (network gecikmesi toleransı)
      const timeDiff = Math.abs(previousTimeRemaining - serverTimeRemaining);
      if (timeDiff >= 2 && this.timerInterval) {
        // Timer çalışıyorsa başlangıç değerlerini yeniden ayarla
        this.timerInitialDuration = serverTimeRemaining;
        this.timerStartTime = Date.now();
        console.log(`MatchCore: Timer re-synced due to drift (${timeDiff}s difference)`);
      } else if (this.timerInterval) {
        // Küçük fark: sadece timerInitialDuration'ı güncelle, startTime'ı koru
        // Bu sayede lokal timer akışı bozulmaz
        const elapsed = Math.floor((Date.now() - this.timerStartTime) / 1000);
        this.timerInitialDuration = serverTimeRemaining + elapsed;
      }
    }
  }
  
  /**
   * Timer'ı başlatır (sadece aktif maç için)
   */
  startTimer() {
    this.stopTimer();
    
    if (!this.match || this.match.status !== "in_progress") {
      return;
    }
    
    if (this.timeRemaining <= 0) {
      return;
    }
    
    // Server timestamp ile senkronize: süreler backend'den gelir (OKS 20 sn, SKS 120 sn)
    const now = Date.now();
    // Başlangıç zamanı: server'dan gelen time_remaining ile tutarlı sayım için
    if (this.timerInitialDuration > 0 && this.timerInitialDuration !== this.timeRemaining) {
      // Timer zaten başlamış, geçen süreyi hesapla
      const elapsed = this.timerInitialDuration - this.timeRemaining;
      this.timerStartTime = now - elapsed * 1000;
    } else {
      // Timer yeni başlıyor
      this.timerStartTime = now;
    }
    this.timerInitialDuration = this.timeRemaining;
    
    console.log(`MatchCore: Timer başlatıldı - ${this.timeRemaining}s, state: ${this.currentState}, startTime: ${this.timerStartTime}`);
    
    // Timer interval (100ms)
    this.timerInterval = setInterval(() => {
      if (!this.timerStartTime) {
        this.stopTimer();
        return;
      }
      
      // Tam saniye ile kararlı sayım (floating point kayması önlenir)
      const elapsed = Math.floor((Date.now() - this.timerStartTime) / 1000);
      const newTimeRemaining = Math.max(0, this.timerInitialDuration - elapsed);
      
      if (newTimeRemaining !== this.timeRemaining) {
        this.timeRemaining = newTimeRemaining;
        this.notify();
      }
      
      // Süre dolunca bir kez bildir ve dur
      if (this.timeRemaining <= 0) {
        this.stopTimer();
        this.notify();
      }
    }, 100);
  }
  
  /**
   * Timer'ı durdurur
   */
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timerStartTime = null;
    this.timerInitialDuration = 0;
  }
  
  /**
   * Maçı başlatır (sadece match_control'dan çağrılır)
   */
  async startMatch(matchId, matchSource, fieldNumber, teamStatuses) {
    try {
      const data = await apiPost("/api/match-control/start", {
        match_id: matchId,
        field_number: fieldNumber,
        match_source: matchSource,
        team_statuses: teamStatuses
      });
      
      if (data.match) {
        this.setMatch(data.match);
        this.manuallySelectedMatchId = null;
        this.manuallySelectedMatchSource = null;
        return true;
      }
      return false;
    } catch (err) {
      console.error("MatchCore: startMatch error:", err);
      throw err;
    }
  }
  
  /**
   * Sonraki duruma geçer (sadece match_control'dan çağrılır)
   */
  async nextState() {
    if (!this.match) return;
    
    const nextState = this.getNextState(this.currentState);
    if (!nextState) return;
    
    try {
      const data = await apiPost("/api/match-control/state", {
        match_id: this.match.id,
        state: nextState,
        match_source: this.match.match_source || "schedule"
      });
      
      if (data.state) {
        this.currentState = data.state;
        this.timeRemaining = data.time_remaining || 0;
        this.startTimer();
        this.notify();
        return true;
      }
      return false;
    } catch (err) {
      console.error("MatchCore: nextState error:", err);
      throw err;
    }
  }
  
  /**
   * Sonraki durumu döndürür.
   * SKS (driver_controlled) bitince doğrudan Maç Sonrası'na geçer; Oyun Sonu aşaması yok.
   */
  getNextState(currentState) {
    const stateOrder = [
      "autonomous",
      "prepare_teleop",
      "driver_controlled",
      "post_match"
    ];
    
    const currentIndex = stateOrder.indexOf(currentState);
    if (currentIndex >= 0 && currentIndex < stateOrder.length - 1) {
      return stateOrder[currentIndex + 1];
    }
    return null;
  }
  
  /**
   * Manuel maç seçimi (preview için)
   */
  setManualSelection(matchId, matchSource) {
    this.manuallySelectedMatchId = matchId;
    this.manuallySelectedMatchSource = matchSource;
  }
  
  /**
   * Manuel seçimi temizler
   */
  clearManualSelection() {
    this.manuallySelectedMatchId = null;
    this.manuallySelectedMatchSource = null;
  }
}

// Global instance (class adı ile instance adı farklı olmalı)
let matchCoreInstance = null;

try {
  // Bağımlılıkları kontrol et
  if (typeof apiGet === "undefined") {
    console.warn("MatchCore: apiGet tanımlı değil, network_utils.js yüklenmemiş olabilir");
  }
  if (typeof apiPost === "undefined") {
    console.warn("MatchCore: apiPost tanımlı değil, network_utils.js yüklenmemiş olabilir");
  }
  if (typeof io === "undefined") {
    console.warn("MatchCore: io (Socket.IO) tanımlı değil, Socket.IO kütüphanesi yüklenmemiş olabilir");
  }
  
  matchCoreInstance = new MatchCore();
  
  // Instance'ın doğru oluşturulduğunu kontrol et
  if (!matchCoreInstance || !matchCoreInstance.constructor || matchCoreInstance.constructor.name !== "MatchCore") {
    throw new Error("MatchCore instance doğru oluşturulamadı");
  }
  
  // Global erişim için window'a ekle (geriye dönük uyumluluk)
  if (typeof window !== "undefined") {
    window.MatchCore = matchCoreInstance;
    // Global scope'a da ekle (script tag'lerinde erişim için)
    if (typeof globalThis !== "undefined") {
      globalThis.MatchCore = matchCoreInstance;
    }
    // Eski tarayıcılar için
    if (typeof global !== "undefined") {
      global.MatchCore = matchCoreInstance;
    }
  }
  
  console.log("MatchCore: Instance başarıyla oluşturuldu ve window'a eklendi");
} catch (error) {
  console.error("MatchCore: Instance oluşturulurken hata oluştu:", error);
  console.error("MatchCore: Hata detayları:", {
    errorMessage: error.message,
    errorStack: error.stack,
    hasApiGet: typeof apiGet !== "undefined",
    hasApiPost: typeof apiPost !== "undefined",
    hasIo: typeof io !== "undefined"
  });
  // Hata durumunda null bırak (fallback kodları çalışsın)
  matchCoreInstance = null;
  // window.MatchCore'u undefined bırak ki fallback kodları çalışsın
  if (typeof window !== "undefined") {
    window.MatchCore = undefined;
  }
}

// Module export
if (typeof module !== "undefined" && module.exports) {
  module.exports = matchCoreInstance;
}

// Yükleme onayı ve metod kontrolü
if (matchCoreInstance && matchCoreInstance.constructor && matchCoreInstance.constructor.name === "MatchCore") {
  console.log("MatchCore: Modül yüklendi ve hazır", {
    instance: !!matchCoreInstance,
    window: typeof window !== "undefined" && !!window.MatchCore,
    hasStartMatch: typeof matchCoreInstance.startMatch === "function",
    hasNextState: typeof matchCoreInstance.nextState === "function",
    hasSetMatch: typeof matchCoreInstance.setMatch === "function",
    hasSubscribe: typeof matchCoreInstance.subscribe === "function",
    subscribers: matchCoreInstance.subscribers ? matchCoreInstance.subscribers.size : 0
  });

  // Global MatchCore'un doğru şekilde tanımlandığını kontrol et
  if (typeof window !== "undefined" && window.MatchCore) {
    const requiredMethods = ["startMatch", "nextState", "setMatch", "subscribe", "loadActiveMatch"];
    const missingMethods = requiredMethods.filter(method => typeof window.MatchCore[method] !== "function");
    
    if (missingMethods.length > 0) {
      console.error("MatchCore: Bazı metodlar bulunamadı!", {
        missingMethods: missingMethods,
        instanceType: typeof window.MatchCore,
        constructor: window.MatchCore.constructor ? window.MatchCore.constructor.name : "no constructor",
        availableMethods: Object.getOwnPropertyNames(window.MatchCore).filter(name => typeof window.MatchCore[name] === "function")
      });
    } else {
      console.log("MatchCore: Tüm gerekli metodlar mevcut ve hazır");
    }
  }
} else {
  console.error("MatchCore: Instance oluşturulamadı veya geçersiz!", {
    instance: matchCoreInstance,
    type: typeof matchCoreInstance,
    constructor: matchCoreInstance?.constructor?.name || "no constructor"
  });
  
  // Hata durumunda bile temel metodları eklemeye çalış (fallback)
  if (matchCoreInstance && typeof matchCoreInstance === "object") {
    console.warn("MatchCore: Fallback modunda - bazı metodlar çalışmayabilir");
  }
}
