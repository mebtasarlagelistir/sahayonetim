/**
 * Constants Modülü
 * 
 * Proje genelinde kullanılan sabit değerler bu modülde tanımlanır.
 * Magic number'lar ve hardcoded değerler yerine bu modülden alınmalıdır.
 */

/**
 * Maç kontrolü ile ilgili sabitler
 */
const MATCH_CONSTANTS = {
  // Maç zamanlayıcı süreleri (saniye)
  AUTONOMOUS_DURATION: 30,
  PREPARE_TELEOP_DURATION: 5,
  DRIVER_CONTROLLED_DURATION: 120,
  END_GAME_DURATION: 30,
  POST_MATCH_DURATION: 10,
  
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
  // Toast mesaj süreleri (ms)
  TOAST_DURATION_SUCCESS: 3000,
  TOAST_DURATION_ERROR: 5000,
  TOAST_DURATION_WARNING: 4000,
  TOAST_DURATION_INFO: 3000,
  
  // Clock update interval
  CLOCK_UPDATE_INTERVAL: 1000, // 1 saniye
  
  // Event summary refresh interval
  EVENT_SUMMARY_REFRESH_INTERVAL: 30000, // 30 saniye
  
  // Referee panel check interval
  REFEREE_PANEL_CHECK_INTERVAL: 5000 // 5 saniye
};

/**
 * Puanlama ile ilgili sabitler
 * 
 * NOT: Bu değerler backend'deki src/core/scoring/config.py ile senkronize tutulmalıdır.
 * Gelecekte bu değerler API'den alınabilir.
 */
const SCORING_CONSTANTS = {
  // Otonom (OKS) Puanları
  AUTO_LEAVE_POINTS: 3,
  AUTO_BENT1_POINTS: 4,
  AUTO_BENT2_CORRECT_POINTS: 6,
  AUTO_BENT2_WRONG_POINTS: 3,
  AUTO_BENT3_CORRECT_POINTS: 8,
  AUTO_BENT3_WRONG_POINTS: 4,
  AUTO_TANK_POINTS: 7,
  
  // Sürücü Kontrollü (SKS) Puanları
  TELEOP_BENT1_POINTS: 2,
  TELEOP_BENT2_CORRECT_POINTS: 4,
  TELEOP_BENT2_WRONG_POINTS: 3,
  TELEOP_BENT3_CORRECT_POINTS: 6,
  TELEOP_BENT3_WRONG_POINTS: 4,
  TELEOP_TANK_POINTS: 5,
  TELEOP_SOURCE_ENTRY_POINTS: 2,
  TELEOP_CLIMB_POINTS: 15,
  
  // Ceza Puanları
  YELLOW_CARD_POINTS_TO_OPPONENT: 2,
  MAJOR_PENALTY_POINTS_TO_OPPONENT: 5
};
