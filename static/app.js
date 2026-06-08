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
    return;
  }
  // Sıralamalar sayfası: etkinlik listesi ve header'ı doldur
  if (page === "rankings") {
    if (typeof loadUserRole === "function") await loadUserRole();
    if (typeof loadEvents === "function") await loadEvents();
    await updateRankingsPageHeader();
    const sel = document.getElementById("event_selector");
    if (sel) {
      sel.addEventListener("change", async () => {
        const eventId = Number(sel.value);
        if (!eventId) return;
        try {
          if (typeof apiPost === "function") await apiPost("/api/events/active", { id: eventId });
          try { window.localStorage?.setItem("active_event_id", String(eventId)); } catch (_) {}
          await updateRankingsPageHeader();
          if (typeof window.loadRankings === "function") window.loadRankings();
        } catch (err) {
          if (typeof showToast === "function") showToast(err.message || "Etkinlik değiştirilemedi", "error");
        }
      });
    }
  }
});

/** Sıralamalar sayfasında header (etkinlik adı, durum) günceller. */
async function updateRankingsPageHeader() {
  const nameEl = document.getElementById("event-name-display");
  const statusEl = document.getElementById("status-indicator");
  try {
    const data = typeof apiGet === "function" ? await apiGet("/api/event") : null;
    const name = (data && data.name) ? data.name : "Etkinlik seçilmedi";
    if (nameEl) nameEl.textContent = name;
    if (statusEl) {
      statusEl.classList.toggle("active", !!(data && data.name));
      statusEl.classList.toggle("inactive", !data || !data.name);
    }
  } catch (_) {
    if (nameEl) nameEl.textContent = "Etkinlik yükleniyor...";
  }
}
