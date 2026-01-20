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
  const page = document.body?.dataset?.page || "";
  if (page === "dashboard" && typeof initializeDashboard === "function") {
    await initializeDashboard();
    return;
  }
  if (page === "setup" && typeof initializeSetup === "function") {
    await initializeSetup();
    return;
  }
  if (page === "screens" && typeof initializeScreensPage === "function") {
    await initializeScreensPage();
  }
});
