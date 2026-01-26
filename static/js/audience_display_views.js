/**
 * Audience Display - Views Module
 * 
 * Bu modül farklı view'ların yüklenmesi ile ilgili fonksiyonları içerir:
 * - Match view yükleme
 * - Inspection view yükleme
 * - Awards view yükleme
 * - Next match preview yükleme
 */

/**
 * Maç görünümünü günceller (SSE'den gelen verilerle)
 * 
 * @param {Object} match - Maç objesi
 */
function updateMatchView(match) {
  if (!match) {
    // Preview varsa normal görünümü gösterme
    if (previewPayload) {
      return;
    }
    qs("audience_state_label").textContent = "Beklemede";
    qs("audience_timer_value").textContent = "--:--";
    qs("audience_red_score").textContent = "0";
    qs("audience_blue_score").textContent = "0";
    qs("audience_red_teams").textContent = "-";
    qs("audience_blue_teams").textContent = "-";
    qs("audience_match_meta").textContent = "";
    if (typeof hideResultsPanel === "function") {
      hideResultsPanel();
    }
    if (typeof hideVSPreview === "function") {
      hideVSPreview();
    }
    loadNextMatchPreview();
    return;
  }
  
  // ÖNEMLİ: Preview varsa normal görünümü güncelleme (preview korunmalı)
  if (previewPayload) {
    console.log("updateMatchView: Preview aktif, normal görünüm güncellenmiyor");
    return;
  }
  
  // VS Preview'ı gizle (normal maç görünümüne geçildiğinde)
  if (typeof hideVSPreview === "function") {
    hideVSPreview();
  }
  
  if (typeof hideResultsPanel === "function") {
    hideResultsPanel();
  }
  qs("audience_state_label").textContent = match.state_label || "Beklemede";
  
  // Timer güncelleme (animasyonlu)
  if (typeof updateTimerDisplay === "function") {
    updateTimerDisplay(match.time_remaining || 0, match.current_state);
  }
  
  // Skor güncellemeleri (animasyonlu)
  if (typeof updateScoreDisplay === "function") {
    updateScoreDisplay("red", match.red_score || 0);
    updateScoreDisplay("blue", match.blue_score || 0);
  }
  
  qs("audience_red_teams").textContent = (match.red_alliance || []).join(", ") || "-";
  qs("audience_blue_teams").textContent = (match.blue_alliance || []).join(", ") || "-";
  qs("audience_match_meta").textContent = `${match.match_type || ""} • Saha ${match.field_number || "-"}`;
  qs("audience_next_match").textContent = "";

  if (match.id !== lastMatchId) {
    lastMatchId = match.id;
    lastMatchState = "";
  }
  if (match.current_state && match.current_state !== lastMatchState) {
    lastMatchState = match.current_state;
    if (typeof announceState === "function") {
      announceState(match.current_state);
    }
  }
}

/**
 * Maç görünümünü yükler (API'den)
 */
async function loadMatchView() {
  try {
    // ÖNEMLİ: Preview aktifken normal maç görünümünü yükleme
    if (previewPayload) {
      console.log("loadMatchView: Preview aktif, normal görünüm yüklenmiyor");
      return;
    }
    // İlk yükleme için API'den al (SSE başlatılmadan önce)
    const data = await apiGet("/api/match-control/audience-display");
    updateMatchView(data.match);
  } catch (err) {
    console.error("Audience match error:", err);
  }
}

/**
 * Sıradaki maç önizlemesini yükler
 */
async function loadNextMatchPreview() {
  try {
    const data = await apiGet("/api/public/next-match");
    if (!data.match) {
      qs("audience_next_match").textContent = "Sıradaki maç yok";
      return;
    }
    const match = data.match;
    qs("audience_next_match").textContent = `Sıradaki: ${match.match_number} • Saha ${match.field_number} • ${match.match_date} ${match.match_time}`;
  } catch (err) {
    qs("audience_next_match").textContent = "Sıradaki maç yüklenemedi";
  }
}

/**
 * İnceleme görünümünü yükler
 */
async function loadInspectionView() {
  try {
    const data = await apiGet("/api/public/inspection-status");
    const teams = data.teams || [];
    const slots = data.slots || [];
    const slotMap = {};
    (slots || []).forEach((slot) => {
      const key = slot.team_number;
      const ts = `${slot.slot_date} ${slot.slot_time}`;
      if (!slotMap[key] || ts > slotMap[key].ts) {
        slotMap[key] = { status: slot.status, ts };
      }
    });
    const completed = Object.values(slotMap).filter((item) => item.status === "completed").length;
    const total = teams.length;
    const summary = qs("audience_inspection_summary");
    if (summary) {
      summary.textContent = `Tamamlanan: ${completed} / ${total}`;
    }
    const table = qs("audience_inspection_table");
    if (table) {
      table.innerHTML = (teams || []).map((team) => {
        const status = slotMap[team.number]?.status || "planned";
        return `<div class="audience-table-row">
          <span>${team.number}</span>
          <span>${team.name || ""}</span>
          <span>${status}</span>
        </div>`;
      }).join("");
    }
  } catch (err) {
    console.error("Inspection view error:", err);
  }
}

/**
 * Ödüller görünümünü yükler
 */
async function loadAwardsView() {
  try {
    const awards = await apiGet("/api/public/awards");
    const list = qs("audience_awards_list");
    if (!list) return;
    if (!awards.length) {
      list.innerHTML = "<div class='audience-placeholder'>Ödül bulunamadı.</div>";
      return;
    }
    list.innerHTML = awards.map((award) => {
      const winner = award.winner || award.team || "";
      return `<div class="audience-table-row">
        <span>${award.name || "Ödül"}</span>
        <span>${winner || "-"}</span>
      </div>`;
    }).join("");
  } catch (err) {
    console.error("Awards view error:", err);
  }
}
