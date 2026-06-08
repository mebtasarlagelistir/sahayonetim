/**
 * Constants Modülü
 * 
 * Proje genelinde kullanılan sabit değerler bu modülde tanımlanır.
 * Magic number'lar ve hardcoded değerler yerine bu modülden alınmalıdır.
 */

/**
 * Maç kontrolü ile ilgili sabitler
 * NOT: Backend (src/core/constants.py) ile aynı değerler olmalı. Timer kararlı sayar.
 */
const MATCH_CONSTANTS = {
  // Maç zamanlayıcı süreleri (saniye) - OKS 30 sn, SKS 120 sn
  AUTONOMOUS_DURATION: 30,      // OKS - Otonom
  PREPARE_TELEOP_DURATION: 10,
  DRIVER_CONTROLLED_DURATION: 120,  // SKS - Sürücü kontrollü
  END_GAME_DURATION: 30,
  POST_MATCH_DURATION: 10,
  
  // Timer: tüm arayüzlerde akıcı geri sayım için yerel tick aralığı (ms)
  TIMER_TICK_MS: 100,
  // Maç durumları
  STATES: {
    idle: "Beklemede",
    autonomous: "Otonom",
    prepare_teleop: "Kontrol Ünitelerinizi Hazırlayınız",
    driver_controlled: "Sürücü Kontrollü",
    end_game: "Oyun Sonu",
    post_match: "Maç Sonrası",
    completed: "Tamamlandı"
  }
};

/**
 * Network ve API ile ilgili sabitler
 */
const NETWORK_CONSTANTS = {
  // Retry mekanizması
  SSE_RETRY_MAX: 5,
  SSE_RETRY_DELAY_BASE: 1000, // ms
  SSE_RETRY_DELAY_MAX: 30000, // ms
  SSE_RETRY_BACKOFF: 2,
  
  // API retry
  API_RETRY_MAX: 3,
  API_RETRY_DELAY_BASE: 1000, // ms
  API_RETRY_BACKOFF: 2,
  
  // Update interval
  UPDATE_INTERVAL: 3000, // ms
  TIMER_UPDATE_INTERVAL: 1000 // ms
};

/**
 * UI ile ilgili sabitler
 */
const UI_CONSTANTS = {
  // Referee panel check interval
  REFEREE_PANEL_CHECK_INTERVAL: 5000, // 5 saniye
  
  // Toast mesaj süreleri (ms)
  TOAST_DURATION_SUCCESS: 3000,
  TOAST_DURATION_ERROR: 5000,
  TOAST_DURATION_WARNING: 4000,
  TOAST_DURATION_INFO: 3000,
  
  // Clock update interval
  CLOCK_UPDATE_INTERVAL: 1000, // 1 saniye
  
  // Event summary refresh interval
  EVENT_SUMMARY_REFRESH_INTERVAL: 30000 // 30 saniye
};

/**
 * Puanlama ile ilgili sabitler (SCORING_CONSTANTS)
 *
 * ÖNEMLİ: Bu sabitler artık TEK kaynaktan, backend'den gelir.
 * window.SCORING_CONSTANTS, /js/scoring_constants.js tarafından doldurulur
 * (kaynak: src/core/scoring/config.py → ScoringConfig.to_frontend_constants).
 *
 * Puanlama JS'lerini (match_control_scoring.js, referee_panel_scoring.js)
 * kullanan her sayfa, bunlardan ÖNCE şu satırı eklemelidir:
 *     <script src="/js/scoring_constants.js"></script>
 *
 * Puan değerlerini değiştirmek için SADECE config.py düzenlenir; burada
 * elle senkron tutmaya gerek yoktur.
 */
