/**
 * Maç Kontrol - Ekran Yönetimi Modülü
 * 
 * Seyirci ekranları yönetimi ve sonuç gönderme işlemleri.
 * 
 * Bağımlılıklar: match_control_core.js, match_control_scoring.js
 */

/**
 * Seyirci ekranı ayarlarını yükler
 */
async function loadMatchControlScreenSettings() {
  try {
    const data = await apiGet("/api/screens/settings");
    const activeViewEl = qs("mc_screen_active_view");
    if (activeViewEl) activeViewEl.value = data.active_view || "match";
    const overlayEnabledEl = qs("mc_screen_overlay_enabled");
    if (overlayEnabledEl) overlayEnabledEl.checked = !!data.overlay_enabled;
    const overlayTextEl = qs("mc_screen_overlay_text");
    if (overlayTextEl) overlayTextEl.value = data.overlay_text || "";
  } catch (err) {
    console.error("Load screen settings error:", err);
  }
}

/**
 * Seyirci ekranı ayarlarını kaydeder
 */
async function saveMatchControlScreenSettings() {
  const payload = {
    active_view: qs("mc_screen_active_view")?.value || "match",
    overlay_enabled: !!qs("mc_screen_overlay_enabled")?.checked,
    overlay_text: qs("mc_screen_overlay_text")?.value || ""
  };
  try {
    await apiPost("/api/screens/settings", payload);
    showToast("Seyirci ekranı ayarları güncellendi", "success");
    // Ayarlar kaydedildikten sonra ekran listesini yenile
    await loadMatchControlScreens();
  } catch (err) {
    console.error("Save screen settings error:", err);
    showToast("Ekran ayarları kaydedilemedi", "error");
  }
}

/**
 * Bağlı ekranları listeler
 */
async function loadMatchControlScreens() {
  const list = qs("mc_connected_screens_list");
  if (!list) return;
  try {
    const screens = await apiGet("/api/screens");
    if (!screens.length) {
      list.innerHTML = "<div class='empty'>Bağlı ekran yok</div>";
      return;
    }
    const now = Date.now() / 1000;
    list.innerHTML = screens.map((screen) => {
      const secondsAgo = now - (screen.last_seen || now);
      const desiredView = screen.desired_view || "match";
      const followGlobal = !!screen.follow_global;
      const isActive = secondsAgo < 10; // Son 10 saniye içinde heartbeat varsa aktif
      return `
        <div class="screen-item ${isActive ? "screen-active" : "screen-inactive"}">
          <div>
            <div class="screen-name">
              ${screen.screen_name || "Seyirci Ekranı"}
              ${isActive ? '<span class="screen-status-badge active">Aktif</span>' : '<span class="screen-status-badge inactive">Pasif</span>'}
            </div>
            <div class="screen-meta">
              <span>ID: ${screen.screen_id || "-"}</span>
              <span>IP: ${screen.ip || "-"}</span>
              <span>Görüntü: ${screen.view || "-"}</span>
              <span>Son görülme: ${Math.round(secondsAgo)} sn önce</span>
            </div>
            <div class="screen-controls">
              <select class="screen-view-select" data-screen-id="${screen.screen_id}">
                <option value="match" ${desiredView === "match" ? "selected" : ""}>Maç</option>
                <option value="inspection" ${desiredView === "inspection" ? "selected" : ""}>İnceleme</option>
                <option value="rankings" ${desiredView === "rankings" ? "selected" : ""}>Sıralama</option>
                <option value="awards" ${desiredView === "awards" ? "selected" : ""}>Ödüller</option>
              </select>
              <label class="checkbox small">
                <input type="checkbox" class="screen-follow-toggle" data-screen-id="${screen.screen_id}" ${followGlobal ? "checked" : ""} />
                Global Takip
              </label>
              <button class="btn-small btn-primary screen-apply-btn" data-screen-id="${screen.screen_id}">Uygula</button>
              <button class="btn-small btn-danger screen-close-btn" data-screen-id="${screen.screen_id}" title="Bu ekranı kapat (server yükünü azaltır)">Kapat</button>
            </div>
          </div>
          <a href="/audience?screen_id=${encodeURIComponent(screen.screen_id)}" target="_blank" class="btn-small btn-secondary">Aç</a>
        </div>
      `;
    }).join("");
    list.querySelectorAll(".screen-apply-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const screenId = btn.dataset.screenId;
        const viewSelect = list.querySelector(`.screen-view-select[data-screen-id="${screenId}"]`);
        const followToggle = list.querySelector(`.screen-follow-toggle[data-screen-id="${screenId}"]`);
        try {
          await apiPost("/api/screens/control", {
            screen_id: screenId,
            desired_view: viewSelect?.value || "match",
            follow_global: !!followToggle?.checked
          });
          showToast("Ekran ayarı güncellendi", "success");
          // Listeyi yenile
          await loadMatchControlScreens();
        } catch (err) {
          console.error("Update screen control error:", err);
          showToast("Ekran ayarı kaydedilemedi", "error");
        }
      });
    });
    
    // Ekran kapatma butonları
    list.querySelectorAll(".screen-close-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const screenId = btn.dataset.screenId;
        if (!confirm(`Bu ekranı kapatmak istediğinizden emin misiniz?\n\nEkran ID: ${screenId}\n\nBu işlem ekranı server'dan kaldırır ve server yükünü azaltır. Ekran tekrar bağlanırsa otomatik olarak geri eklenir.`)) {
          return;
        }
        try {
          await apiPost("/api/screens/close", {
            screen_id: screenId
          });
          showToast("Ekran kapatıldı", "success");
          // Listeyi yenile
          await loadMatchControlScreens();
        } catch (err) {
          console.error("Close screen error:", err);
          showToast("Ekran kapatılamadı", "error");
        }
      });
    });
  } catch (err) {
    console.error("Load connected screens error:", err);
    list.innerHTML = "<div class='error'>Ekranlar yüklenemedi</div>";
  }
}

/**
 * Sonuçları seyirci ekranına gönderir
 */
async function sendMatchResultsToScreens() {
  if (!currentMatch) return;
  try {
    if (typeof buildMatchResultsPayloadForMatch === "function") {
      const payload = buildMatchResultsPayloadForMatch(currentMatch);
      await apiPost("/api/screens/preview", {
        view: "match",
        mode: "preview",
        duration_seconds: 45,
        payload
      });
      showToast("Sonuçlar seyirci ekranına gönderildi", "success");
    }
  } catch (err) {
    console.error("Show results error:", err);
    showToast("Sonuçlar gönderilemedi", "error");
  }
}

/**
 * Sonuç payload'ını hazırlar
 */
function buildMatchResultsPayloadForMatch(match) {
  if (!match) return {};
  if (typeof calculateScoreBreakdown === "function") {
    calculateScoreBreakdown();
  }
  const redScore = parseInt(qs("red_total_score")?.textContent || 0);
  const blueScore = parseInt(qs("blue_total_score")?.textContent || 0);
  const winner =
    redScore > blueScore ? "Kırmızı İttifak" :
    blueScore > redScore ? "Mavi İttifak" :
    "Berabere";

  const redYellow = parseInt(qs("red_yellow_card")?.value || 0);
  const blueYellow = parseInt(qs("blue_yellow_card")?.value || 0);
  const redRedCards =
    (qs("red_red_card_r1")?.checked ? 1 : 0) +
    (qs("red_red_card_r2")?.checked ? 1 : 0);
  const blueRedCards =
    (qs("blue_red_card_r1")?.checked ? 1 : 0) +
    (qs("blue_red_card_r2")?.checked ? 1 : 0);

  // Ranking puanlarını al
  const redRanking = {
    result: parseInt(qs("red_ranking_result")?.textContent || 0),
    climb: parseInt(qs("red_ranking_climb")?.textContent || 0),
    auto: parseInt(qs("red_ranking_auto")?.textContent || 0),
    total: parseInt(qs("red_ranking_total")?.textContent || 0)
  };
  const blueRanking = {
    result: parseInt(qs("blue_ranking_result")?.textContent || 0),
    climb: parseInt(qs("blue_ranking_climb")?.textContent || 0),
    auto: parseInt(qs("blue_ranking_auto")?.textContent || 0),
    total: parseInt(qs("blue_ranking_total")?.textContent || 0)
  };

  return {
    type: "results",
    match: {
      match_number: match.match_number,
      match_type: match.match_type || "qualification",
      field_number: match.field_number || 1,
      red_alliance: match.red_alliance || [],
      blue_alliance: match.blue_alliance || []
    },
    results: {
      winner,
      red_score: redScore,
      blue_score: blueScore,
      red_auto_total: parseInt(qs("red_auto_total")?.textContent || 0),
      red_teleop_total: parseInt(qs("red_teleop_total")?.textContent || 0),
      red_penalty_total: parseInt(qs("red_penalty_total")?.textContent || 0),
      blue_auto_total: parseInt(qs("blue_auto_total")?.textContent || 0),
      blue_teleop_total: parseInt(qs("blue_teleop_total")?.textContent || 0),
      blue_penalty_total: parseInt(qs("blue_penalty_total")?.textContent || 0),
      red_sp_result: redRanking.result,
      red_sp_climb: redRanking.climb,
      red_sp_auto: redRanking.auto,
      red_sp_total: redRanking.total,
      blue_sp_result: blueRanking.result,
      blue_sp_climb: blueRanking.climb,
      blue_sp_auto: blueRanking.auto,
      blue_sp_total: blueRanking.total,
      red_yellow_cards: redYellow,
      blue_yellow_cards: blueYellow,
      red_red_cards: redRedCards,
      blue_red_cards: blueRedCards
    }
  };
}
