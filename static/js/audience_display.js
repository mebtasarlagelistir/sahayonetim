/**
 * Seyirci ekranı
 */

let currentView = "match";
let overlayEnabled = false;
let overlayText = "";
let screenId = "";
let previewPayload = null;
let lastMatchState = "";
let lastMatchId = null;

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || "";
}

function ensureScreenId() {
  const fromQuery = getQueryParam("screen_id");
  const forceNew = getQueryParam("new") === "1";
  const sessionStored = window.sessionStorage?.getItem("audience_screen_id");
  const localStored = window.localStorage?.getItem("audience_screen_id");
  if (fromQuery) {
    screenId = fromQuery;
  } else if (forceNew) {
    screenId = `screen_${Math.random().toString(36).slice(2, 10)}`;
  } else {
    screenId = sessionStored || localStored || `screen_${Math.random().toString(36).slice(2, 10)}`;
  }
  window.sessionStorage?.setItem("audience_screen_id", screenId);
  window.localStorage?.setItem("audience_screen_id", screenId);
}

async function sendHeartbeat() {
  const payload = {
    screen_id: screenId,
    screen_name: getQueryParam("screen_name") || "",
    view: currentView,
    overlay_enabled: overlayEnabled
  };
  try {
    await apiPost("/api/screens/heartbeat", payload);
  } catch (err) {
    console.warn("Heartbeat error:", err);
  }
}

async function loadScreenSettings() {
  try {
    const data = await apiGet(`/api/screens/view?screen_id=${encodeURIComponent(screenId)}`);
    currentView = data.active_view || "match";
    overlayEnabled = !!data.overlay_enabled;
    overlayText = data.overlay_text || "";
    previewPayload = data.preview_payload || null;
    applyOverlay();
    switchView();
  } catch (err) {
    console.error("Audience settings error:", err);
  }
}

function applyOverlay() {
  const overlay = qs("audience_overlay");
  const text = qs("audience_overlay_text");
  if (!overlay || !text) return;
  text.textContent = overlayText;
  overlay.style.display = overlayEnabled && overlayText ? "block" : "none";
}

function switchView() {
  const views = ["match", "inspection", "rankings", "awards"];
  views.forEach((view) => {
    const el = qs(`audience_${view}_view`);
    if (el) {
      el.style.display = view === currentView ? "block" : "none";
    }
  });
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function announceState(state) {
  if (!state || !("speechSynthesis" in window)) return;
  const messages = {
    autonomous: "Otonom başladı.",
    driver_controlled: "Sürücü kontrol başladı.",
    end_game: "Oyun sonu başladı.",
    post_match: "Maç sona erdi."
  };
  const message = messages[state];
  if (!message) return;
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "tr-TR";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function formatTeamsWithRank(teams, rankings) {
  if (!teams || !teams.length) return "-";
  if (!rankings) return teams.join(", ");
  return teams.map((team) => {
    const rank = rankings[team];
    return rank ? `${team} (#${rank})` : team;
  }).join(", ");
}

function applyPreviewPayload(payload) {
  const match = payload?.match || null;
  const rankings = payload?.rankings || {};
  if (!match) return false;
  if (payload?.type === "results") {
    return applyResultsPayload(payload);
  }
  hideResultsPanel();
  qs("audience_state_label").textContent = "Önizleme";
  qs("audience_timer_value").textContent = "--:--";
  qs("audience_red_score").textContent = "0";
  qs("audience_blue_score").textContent = "0";
  qs("audience_red_teams").textContent = formatTeamsWithRank(match.red_alliance, rankings);
  qs("audience_blue_teams").textContent = formatTeamsWithRank(match.blue_alliance, rankings);
  qs("audience_match_meta").textContent = `${match.match_type || ""} • Saha ${match.field_number || "-"}`;
  const next = qs("audience_next_match");
  if (next) {
    next.textContent = `Sıradaki: ${match.match_number} • ${match.match_date} ${match.match_time}`;
  }
  return true;
}

function hideResultsPanel() {
  const panel = qs("audience_results");
  if (panel) panel.style.display = "none";
}

function applyResultsPayload(payload) {
  const match = payload?.match || null;
  const results = payload?.results || null;
  if (!match || !results) return false;
  qs("audience_state_label").textContent = "Maç Sonucu";
  qs("audience_timer_value").textContent = "BİTTİ";
  qs("audience_red_score").textContent = results.red_score ?? 0;
  qs("audience_blue_score").textContent = results.blue_score ?? 0;
  qs("audience_red_teams").textContent = (match.red_alliance || []).join(", ") || "-";
  qs("audience_blue_teams").textContent = (match.blue_alliance || []).join(", ") || "-";
  qs("audience_match_meta").textContent = `${match.match_type || ""} • Saha ${match.field_number || "-"}`;
  qs("audience_next_match").textContent = "";

  const panel = qs("audience_results");
  if (panel) panel.style.display = "block";
  qs("audience_results_winner").textContent = results.winner || "-";
  qs("audience_results_blue_total").textContent = results.blue_score ?? 0;
  qs("audience_results_blue_auto").textContent = results.blue_auto_total ?? 0;
  qs("audience_results_blue_teleop").textContent = results.blue_teleop_total ?? 0;
  qs("audience_results_blue_penalty").textContent = results.blue_penalty_total ?? 0;
  qs("audience_results_blue_sp").textContent = results.blue_sp_total ?? 0;
  qs("audience_results_blue_yellow").textContent = results.blue_yellow_cards ?? 0;
  qs("audience_results_blue_red").textContent = results.blue_red_cards ?? 0;
  qs("audience_results_red_total").textContent = results.red_score ?? 0;
  qs("audience_results_red_auto").textContent = results.red_auto_total ?? 0;
  qs("audience_results_red_teleop").textContent = results.red_teleop_total ?? 0;
  qs("audience_results_red_penalty").textContent = results.red_penalty_total ?? 0;
  qs("audience_results_red_sp").textContent = results.red_sp_total ?? 0;
  qs("audience_results_red_yellow").textContent = results.red_yellow_cards ?? 0;
  qs("audience_results_red_red").textContent = results.red_red_cards ?? 0;

  announceResults(results);
  return true;
}

function announceResults(results) {
  if (!("speechSynthesis" in window)) return;
  const message = [
    `Maç sonucu: ${results.winner || "berabere"}.`,
    `Kırmızı ${results.red_score ?? 0}, Mavi ${results.blue_score ?? 0}.`,
    `Kırmızı sarı kart ${results.red_yellow_cards ?? 0}, kırmızı kart ${results.red_red_cards ?? 0}.`,
    `Mavi sarı kart ${results.blue_yellow_cards ?? 0}, kırmızı kart ${results.blue_red_cards ?? 0}.`
  ].join(" ");
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "tr-TR";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

async function loadMatchView() {
  try {
    if (previewPayload && applyPreviewPayload(previewPayload)) {
      return;
    }
    const data = await apiGet("/api/match-control/audience-display");
    const match = data.match;
    if (!match) {
      qs("audience_state_label").textContent = "Beklemede";
      qs("audience_timer_value").textContent = "--:--";
      qs("audience_red_score").textContent = "0";
      qs("audience_blue_score").textContent = "0";
      qs("audience_red_teams").textContent = "-";
      qs("audience_blue_teams").textContent = "-";
      qs("audience_match_meta").textContent = "";
      hideResultsPanel();
      await loadNextMatchPreview();
      return;
    }
    hideResultsPanel();
    qs("audience_state_label").textContent = match.state_label || "Beklemede";
    qs("audience_timer_value").textContent = formatTime(match.time_remaining || 0);
    qs("audience_red_score").textContent = match.red_score || 0;
    qs("audience_blue_score").textContent = match.blue_score || 0;
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
      announceState(match.current_state);
    }
  } catch (err) {
    console.error("Audience match error:", err);
  }
}

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

function startAudienceLoop() {
  setInterval(loadScreenSettings, 3000);
  setInterval(() => {
    if (currentView === "match") loadMatchView();
    if (currentView === "inspection") loadInspectionView();
    if (currentView === "awards") loadAwardsView();
  }, 1000);
  setInterval(sendHeartbeat, 5000);
}

document.addEventListener("DOMContentLoaded", () => {
  ensureScreenId();
  loadScreenSettings();
  loadMatchView();
  sendHeartbeat();
  startAudienceLoop();
});
