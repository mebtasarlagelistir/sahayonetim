/**
 * MEMSKOR - Ana JavaScript Dosyası
 * 
 * Bu dosya tüm modülleri yükler ve uygulamayı başlatır.
 * 
 * Modüller:
 * - utils.js: Yardımcı fonksiyonlar (qs, showToast, validasyon, vb.)
 * - event.js: Etkinlik yönetimi
 * - teams.js: Takım yönetimi
 * - users.js: Kullanıcı yönetimi
 * - inspection.js: İnceleme yönetimi
 * - setup.js: Setup sayfası yönetimi
 */

// Modülleri yükle (script tag'leri ile yükleniyor, bu dosya en son yüklenmeli)
// Modüllerin yüklenme sırası önemli:
// 1. utils.js (diğer modüllerin bağımlılığı)
// 2. event.js, teams.js, users.js, inspection.js (birbirinden bağımsız)
// 3. setup.js (diğer modüllere bağımlı)
// 4. app.js (bu dosya - setup'ı başlatır)

// DOMContentLoaded event handler
document.addEventListener("DOMContentLoaded", async () => {
  // Setup sayfasını başlat
  if (typeof initializeSetup === "function") {
    await initializeSetup();
  } else {
    console.error("setup.js modülü yüklenemedi!");
  }
});
