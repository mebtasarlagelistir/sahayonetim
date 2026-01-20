/**
 * Baş Hakem ekranı
 * Hakem girişlerini izler ve onaylar.
 */

let currentMatch = null;
let scoreEventSource = null;
let refereeMeta = {};
let retryCount = 0;
const MAX_RETRY_COUNT = NETWORK_CONSTANTS.SSE_RETRY_MAX;
const RETRY_DELAY_BASE = NETWORK_CONSTANTS.SSE_RETRY_DELAY_BASE;

async function initializeHeadReferee() {
  if (typeof loadUserRole === "function") {
    await loadUserRole();
  }
  await checkActiveMatch();
  setInterval(checkActiveMatch, UI_CONSTANTS.REFEREE_PANEL_CHECK_INTERVAL);
  setupHeadRefereeEvents();
}

async function checkActiveMatch() {
  try {
    const data = await apiGet("/api/match-control/active");
    if (data.match) {
      if (!currentMatch || currentMatch.id !== data.match.id || currentMatch.match_source !== data.match.match_source) {
        currentMatch = data.match;
        await loadHeadRefereeMatch();
      }
    } else {
      currentMatch = null;
      renderNoMatch();
      stopRealtimeUpdates();
    }
  } catch (err) {
    console.error("Head referee active match error:", err);
  }
}

async function loadHeadRefereeMatch() {
  if (!currentMatch) return;
  qs("head_match_info").textContent =
    `Maç ${currentMatch.match_number} - ${getMatchTypeLabel(currentMatch.match_type)} - Saha ${currentMatch.field_number}`;
  qs("head_match_field").textContent = `Saha: ${currentMatch.field_number}`;
  const teams = [
    `Kırmızı: ${(currentMatch.red_alliance || []).join(", ") || "-"}`,
    `Mavi: ${(currentMatch.blue_alliance || []).join(", ") || "-"}`
  ];
  qs("head_match_teams").textContent = `Takımlar: ${teams.join(" | ")}`;

  qs("head_referee_match_card").style.display = "block";
  qs("head_referee_scores").style.display = "block";
  qs("head_no_match").style.display = "none";

  await loadCurrentScores();
  startRealtimeUpdates(currentMatch.id, currentMatch.match_source || "schedule");
}

async function loadCurrentScores() {
  if (!currentMatch) return;
  try {
    const source = currentMatch.match_source || "schedule";
    const data = await apiGet(`/api/referee/score/get/${currentMatch.id}?source=${encodeURIComponent(source)}`);
    const redScore = data.red?.calculated_score ?? 0;
    const blueScore = data.blue?.calculated_score ?? 0;
    qs("head_red_score").textContent = redScore;
    qs("head_blue_score").textContent = blueScore;
    refereeMeta = data.referee_meta || {};
    updateHeadRefereeStatus();
  } catch (err) {
    console.error("Head referee load scores error:", err);
  }
}

function startRealtimeUpdates(matchId, matchSource) {
  stopRealtimeUpdates();
  retryCount = 0;
  const url = `/api/match-control/score/realtime/${matchId}?source=${encodeURIComponent(matchSource || "schedule")}`;
  scoreEventSource = new EventSource(url);
  scoreEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (!data || !currentMatch || currentMatch.id !== matchId) return;
      if (data.type === "initial" || data.type === "update") {
        loadCurrentScores();
      }
    } catch (err) {
      console.error("Head referee SSE error:", err);
    }
  };
  scoreEventSource.onerror = () => {
    if (retryCount < MAX_RETRY_COUNT && currentMatch && currentMatch.id === matchId) {
      const retryDelay = Math.min(30000, RETRY_DELAY_BASE * Math.pow(2, retryCount));
      retryCount++;
      setTimeout(() => {
        if (currentMatch && currentMatch.id === matchId) {
          startRealtimeUpdates(matchId, matchSource);
        }
      }, retryDelay);
    }
  };
}

function stopRealtimeUpdates() {
  if (scoreEventSource) {
    scoreEventSource.close();
    scoreEventSource = null;
  }
}

function updateHeadRefereeStatus() {
  const redMeta = refereeMeta?.red || {};
  const blueMeta = refereeMeta?.blue || {};
  const headMeta = refereeMeta?.head || {};

  qs("head_red_status").textContent = redMeta.submitted
    ? `Giriş tamamlandı (${redMeta.submitted_by || "?"})`
    : "Giriş bekleniyor";
  qs("head_blue_status").textContent = blueMeta.submitted
    ? `Giriş tamamlandı (${blueMeta.submitted_by || "?"})`
    : "Giriş bekleniyor";

  const approveStatus = qs("head_approve_status");
  const approveBtn = qs("btn_head_approve");
  const canApprove = redMeta.submitted && blueMeta.submitted && !headMeta.approved;
  if (headMeta.approved) {
    approveStatus.style.display = "block";
    approveStatus.textContent = `Onaylandı (${headMeta.approved_by || "?"})`;
    approveBtn.disabled = true;
  } else {
    approveStatus.style.display = "none";
    approveBtn.disabled = !canApprove;
  }
}

async function approveMatch() {
  if (!currentMatch) return;
  try {
    await apiPost("/api/referee/approve", {
      match_id: currentMatch.id,
      match_source: currentMatch.match_source || "schedule"
    });
    await loadCurrentScores();
    showToast("Maç onaylandı", "success");
  } catch (err) {
    console.error("Head referee approve error:", err);
    showToast("Onay sırasında hata oluştu", "error");
  }
}

function renderNoMatch() {
  qs("head_referee_match_card").style.display = "none";
  qs("head_referee_scores").style.display = "none";
  qs("head_no_match").style.display = "block";
}

function setupHeadRefereeEvents() {
  const approveBtn = qs("btn_head_approve");
  if (approveBtn) {
    approveBtn.addEventListener("click", approveMatch);
  }
}

function qs(id) {
  return document.getElementById(id);
}

function getMatchTypeLabel(type) {
  const labels = {
    qualification: "Sıralama",
    elimination: "Eleme (Playoff)",
    final: "Final",
    practice: "Deneme"
  };
  return labels[type] || type;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeHeadReferee);
} else {
  initializeHeadReferee();
}
