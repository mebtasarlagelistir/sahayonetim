/**
 * Sponsor Yönetimi Modülü (Setup → Sponsorlar adımı)
 *
 * Sponsorlar etkinlik verisinde (event.sponsors) tutulur.
 * API: GET/POST /api/sponsors
 */

let sponsorsData = [];

/**
 * Sponsorları API'den yükler ve listeyi çizer.
 */
async function loadSponsors() {
  try {
    sponsorsData = (await apiGet("/api/sponsors")) || [];
    if (!Array.isArray(sponsorsData)) sponsorsData = [];
  } catch (err) {
    sponsorsData = [];
  }
  renderSponsors();
}

/**
 * Sponsor listesini ekrana çizer.
 */
function renderSponsors() {
  const box = qs("sponsors_list");
  if (!box) return;
  if (!sponsorsData.length) {
    box.innerHTML = '<div class="sponsor-empty">Henüz sponsor eklenmedi.</div>';
    return;
  }
  box.innerHTML = sponsorsData
    .map((s, i) => {
      const level = s.level ? `<span class="s-level">${escapeHtml(s.level)}</span>` : "";
      const web = s.website
        ? `<span class="s-web">${escapeHtml(s.website)}</span>`
        : "";
      return (
        '<div class="sponsor-item">' +
        '<span class="s-name">' + escapeHtml(s.name) + "</span>" +
        level +
        web +
        '<button type="button" class="btn-danger s-remove" data-index="' + i + '">Sil</button>' +
        "</div>"
      );
    })
    .join("");
  box.querySelectorAll(".s-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      sponsorsData.splice(idx, 1);
      renderSponsors();
    });
  });
}

/**
 * Formdaki sponsoru listeye ekler (henüz kaydetmez).
 */
function addSponsorFromForm() {
  const name = (qs("sponsor_name")?.value || "").trim();
  if (!name) {
    if (typeof showToast === "function") showToast("Sponsor adı gerekli", "warning");
    return;
  }
  sponsorsData.push({
    name,
    level: (qs("sponsor_level")?.value || "").trim(),
    website: (qs("sponsor_website")?.value || "").trim(),
  });
  if (qs("sponsor_name")) qs("sponsor_name").value = "";
  if (qs("sponsor_level")) qs("sponsor_level").value = "";
  if (qs("sponsor_website")) qs("sponsor_website").value = "";
  renderSponsors();
}

/**
 * Sponsor listesini sunucuya kaydeder.
 */
async function saveSponsors() {
  try {
    setButtonLoading(qs("save_sponsors"), true);
    const res = await apiPost("/api/sponsors", sponsorsData);
    const statusEl = qs("sponsors_status");
    if (statusEl) {
      statusEl.textContent = `✓ ${res.count} sponsor kaydedildi`;
      setTimeout(() => { statusEl.textContent = ""; }, 2500);
    }
    if (typeof showToast === "function") showToast("Sponsorlar kaydedildi", "success");
  } catch (err) {
    if (typeof showToast === "function") showToast("Sponsorlar kaydedilemedi", "error");
  } finally {
    setButtonLoading(qs("save_sponsors"), false);
  }
}

/**
 * Sponsor adımı için event listener'ları kurar.
 */
function setupSponsorsListeners() {
  if (qs("add_sponsor")) qs("add_sponsor").addEventListener("click", addSponsorFromForm);
  if (qs("save_sponsors")) qs("save_sponsors").addEventListener("click", saveSponsors);
  // Enter ile ekleme kolaylığı
  ["sponsor_name", "sponsor_level", "sponsor_website"].forEach((id) => {
    const el = qs(id);
    if (el) {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addSponsorFromForm();
        }
      });
    }
  });
}
