/**
 * Maç Kontrol Modülü
 * 
 * FTC benzeri maç yönetim ekranı için JavaScript modülü.
 * Maç başlatma, durdurma, skor güncelleme ve canlı durum yönetimi.
 */

// Maç durumları ve süreleri - constants modülünden al
const MATCH_STATES = {
  idle: { label: MATCH_CONSTANTS.STATES.idle, duration: 0, color: "#666" },
  autonomous: { label: MATCH_CONSTANTS.STATES.autonomous, duration: MATCH_CONSTANTS.AUTONOMOUS_DURATION, color: "#f44336" },
  prepare_teleop: { label: MATCH_CONSTANTS.STATES.prepare_teleop, duration: MATCH_CONSTANTS.PREPARE_TELEOP_DURATION, color: "#ff9800" },
  driver_controlled: { label: MATCH_CONSTANTS.STATES.driver_controlled, duration: MATCH_CONSTANTS.DRIVER_CONTROLLED_DURATION, color: "#2196f3" },
  end_game: { label: MATCH_CONSTANTS.STATES.end_game, duration: MATCH_CONSTANTS.END_GAME_DURATION, color: "#9c27b0" },
  post_match: { label: MATCH_CONSTANTS.STATES.post_match, duration: MATCH_CONSTANTS.POST_MATCH_DURATION, color: "#607d8b" },
  completed: { label: MATCH_CONSTANTS.STATES.completed, duration: 0, color: "#4caf50" }
};

// Global değişkenler
let currentMatch = null;
let matchTimer = null;
let timeRemaining = 0;
let currentState = "idle";
let updateInterval = null;
let scoreEditMatches = [];
let scoreEditSelected = null;
let detailedScoringHome = null;

// Gerçek zamanlı güncelleme için EventSource (SSE)
let scoreEventSource = null;
let retryCount = 0; // SSE yeniden bağlanma sayacı
// Retry sabitleri - constants modülünden al
const MAX_RETRY_COUNT = NETWORK_CONSTANTS.SSE_RETRY_MAX;
const RETRY_DELAY_BASE = NETWORK_CONSTANTS.SSE_RETRY_DELAY_BASE;

/**
 * Gerçek zamanlı skor güncellemelerini başlatır (SSE).
 * @param {number} matchId
 * @param {string} matchSource
 */
function startRealtimeScoreUpdates(matchId, matchSource) {
  stopRealtimeScoreUpdates();
  retryCount = 0;
  const source = matchSource || currentMatch?.source || "schedule";
  const url = `/api/match-control/score/realtime/${matchId}?source=${encodeURIComponent(source)}`;
  scoreEventSource = new EventSource(url);
  scoreEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (!data || !currentMatch || currentMatch.id !== matchId) return;
      if (data.type === "initial" || data.type === "update") {
        const scores = data.scores || {};
        if (scores.red || scores.blue) {
          applyScoringDataToInputs("red", scores.red || {});
          applyScoringDataToInputs("blue", scores.blue || {});
          calculateScoreBreakdown();
        }
      }
    } catch (err) {
      console.error("Realtime score update error:", err);
    }
  };
  scoreEventSource.onerror = () => {
    if (retryCount < MAX_RETRY_COUNT && currentMatch && currentMatch.id === matchId) {
      const retryDelay = Math.min(30000, RETRY_DELAY_BASE * Math.pow(2, retryCount));
      retryCount++;
      setTimeout(() => {
        if (currentMatch && currentMatch.id === matchId) {
          startRealtimeScoreUpdates(matchId, source);
        }
      }, retryDelay);
    }
  };
}

/**
 * Gerçek zamanlı skor güncellemelerini durdurur.
 */
function stopRealtimeScoreUpdates() {
  if (scoreEventSource) {
    scoreEventSource.close();
    scoreEventSource = null;
  }
}

/**
 * Sayfa yüklendiğinde başlat
 */
document.addEventListener("DOMContentLoaded", async () => {
  await initializeMatchControl();
  
  // Header'ı güncelle
  if (typeof loadUserRole === "function") {
    await loadUserRole();
  }
  if (typeof loadEvents === "function") {
    await loadEvents();
  }
  if (typeof updateEventStatus === "function") {
    try {
      const eventData = await apiGet("/api/event");
      updateEventStatus(eventData);
      if (typeof loadEventPhase === "function") {
        await loadEventPhase();
      }
    } catch (err) {
      console.error("Event status update error:", err);
    }
  }
  if (typeof startClock === "function") {
    startClock();
  }
});

/**
 * Maç kontrol sayfasını başlatır
 */
async function initializeMatchControl() {
  await loadMatchList();
  await loadNextMatch();
  await checkActiveMatch();
  await loadMatchControlScreenSettings();
  await loadMatchControlScreens();
  
  // Event listener'ları ekle
  setupEventListeners();
  
  // İlk tab'ı göster
  switchTab("active-match");
  
  // Gerçek zamanlı skor güncellemelerini başlat
  if (currentMatch) {
    startRealtimeScoreUpdates(currentMatch.id, currentMatch.source || "schedule");
  }
  
  // Periyodik güncelleme başlat - constants modülünden al
  updateInterval = setInterval(async () => {
    if (document.hidden) return;
    if (currentMatch) {
      await updateMatchStatus();
    }
  }, NETWORK_CONSTANTS.UPDATE_INTERVAL);

  setInterval(loadMatchControlScreens, 5000);
}

/**
 * Maç kontrol ekranı için seyirci ekranı ayarlarını yükler.
 */
async function loadMatchControlScreenSettings() {
  try {
    const data = await apiGet("/api/screens/settings");
    if (qs("mc_screen_active_view")) qs("mc_screen_active_view").value = data.active_view || "match";
    if (qs("mc_screen_overlay_enabled")) qs("mc_screen_overlay_enabled").checked = !!data.overlay_enabled;
    if (qs("mc_screen_overlay_text")) qs("mc_screen_overlay_text").value = data.overlay_text || "";
  } catch (err) {
    console.error("Load screen settings error:", err);
  }
}

/**
 * Seyirci ekranı ayarlarını kaydeder.
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
  } catch (err) {
    console.error("Save screen settings error:", err);
    showToast("Ekran ayarları kaydedilemedi", "error");
  }
}

/**
 * Bağlı ekranları listeler.
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
      return `
        <div class="screen-item">
          <div>
            <div class="screen-name">${screen.screen_name || "Seyirci Ekranı"}</div>
            <div class="screen-meta">
              <span>${screen.ip || "-"}</span>
              <span>Görüntü: ${screen.view || "-"}</span>
              <span>${Math.round(secondsAgo)} sn</span>
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
        } catch (err) {
          console.error("Update screen control error:", err);
          showToast("Ekran ayarı kaydedilemedi", "error");
        }
      });
    });
  } catch (err) {
    console.error("Load connected screens error:", err);
    list.innerHTML = "<div class='error'>Ekranlar yüklenemedi</div>";
  }
}

/**
 * Tab'ları değiştirir
 */
function switchTab(tabName) {
  // Tüm tab butonlarını güncelle
  document.querySelectorAll(".tab-button").forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.setAttribute("data-active", "true");
    } else {
      btn.removeAttribute("data-active");
    }
  });
  
  // Tüm tab içeriklerini gizle
  document.querySelectorAll(".tab-content").forEach(content => {
    content.style.display = "none";
  });
  
  // Seçilen tab'ı göster
  const selectedTab = qs(`tab-${tabName}`);
  if (selectedTab) {
    selectedTab.style.display = "block";
  }
  
  // Tab'a özel veri yükleme
  if (tabName === "schedule") {
    loadScheduleMatches();
  } else if (tabName === "incomplete") {
    loadIncompleteMatches();
  } else if (tabName === "score-edit") {
    loadScoreEditMatches();
    moveDetailedScoringTo("score_edit_detailed_slot");
  }
  if (tabName !== "score-edit") {
    moveDetailedScoringTo("detailed_scoring_home");
  }
}

/**
 * Detaylı skorlama panelini istenen alana taşır
 */
function moveDetailedScoringTo(targetId) {
  const container = qs("detailed_scoring_container");
  const target = qs(targetId);
  if (!container || !target) return;
  if (!detailedScoringHome) {
    detailedScoringHome = container.parentElement;
  }
  if (targetId === "detailed_scoring_home" && detailedScoringHome) {
    detailedScoringHome.appendChild(container);
  } else {
    target.appendChild(container);
  }
}

/**
 * Sıradaki maçı yükler ve seçer
 * 
 * API: GET /api/match-control/next-match
 * 
 * @returns {Promise<void>}
 */
async function loadNextMatchAndSelect() {
  try {
    const data = await apiGet("/api/match-control/next-match");
    if (!data.match) {
      showToast("Sıradaki maç bulunamadı", "warning");
      return;
    }
    
    if (!data.match) {
      showToast("Sıradaki maç yok", "info");
      return;
    }
    
    await selectMatch(data.match.id);
    switchTab("active-match");
    showToast("Sıradaki maç yüklendi", "success");
  } catch (err) {
    console.error("Load next match error:", err);
    showToast("Maç yüklenirken hata oluştu", "error");
  }
}

/**
 * Schedule tab için maçları yükler
 * 
 * API: GET /api/match-schedule
 * 
 * @returns {Promise<void>}
 */
async function loadScheduleMatches() {
  const listContainer = qs("schedule_match_list");
  if (!listContainer) return;
  
  // loadMatchList fonksiyonunu kullan ama farklı container'a yaz
  // Şimdilik basit bir implementasyon
  listContainer.innerHTML = "<div class='loading'>Yükleniyor...</div>";
  
  try {
    const fieldNumber = qs("schedule_field_selector")?.value;
    const matchType = qs("schedule_match_type_selector")?.value;
    
    const matches = await fetchScheduleMatches(fieldNumber, matchType);
    
    if (matches.length === 0) {
      if (matchType === "elimination") {
        listContainer.innerHTML = "<div class='empty'>Eleme (Playoff) maçları, ittifaklar belirlendikten sonra otomatik oluşur.</div>";
      } else {
        listContainer.innerHTML = "<div class='empty'>Maç bulunamadı</div>";
      }
      return;
    }
    
    // Saha listesini doldur
    const fieldSet = new Set(matches.map(m => m.field_number).filter(Boolean));
    const fieldSelector = qs("schedule_field_selector");
    if (fieldSelector) {
      const currentValue = fieldSelector.value;
      fieldSelector.innerHTML = '<option value="">Tüm Sahalar</option>';
      Array.from(fieldSet).sort().forEach(field => {
        const option = document.createElement("option");
        option.value = field;
        option.textContent = `Saha ${field}`;
        if (currentValue === String(field)) option.selected = true;
        fieldSelector.appendChild(option);
      });
    }
    
    listContainer.innerHTML = matches.map(match => {
      const statusClass = match.status === "in_progress" ? "active" : 
                         match.status === "completed" ? "completed" : "";
      const hasScores = match.red_score !== null && match.blue_score !== null;
      const scoreDisplay = hasScores ? 
        `<div class="match-item-score">
          <span class="score-red">K: ${match.red_score || 0}</span>
          <span class="score-separator">-</span>
          <span class="score-blue">M: ${match.blue_score || 0}</span>
        </div>` : "";
      const activateButton = match.source === "practice"
        ? `<button class="btn-small btn-secondary schedule-load-btn" data-match-id="${match.id}" data-source="practice" type="button">Yükle</button>`
        : `<button class="btn-small btn-primary schedule-activate-btn" data-match-id="${match.id}" data-source="schedule" type="button">Aktif Et</button>`;
      return `
        <div class="match-item ${statusClass}" data-match-id="${match.id}" data-source="${match.source}">
          <div class="match-item-header">
            <span class="match-number">${formatMatchNumber(match)}</span>
            <span class="match-status">${getStatusLabel(match.status)}</span>
          </div>
          <div class="match-item-info">
            <span>${getMatchTypeLabel(match.match_type)}</span>
            <span>Saha ${match.field_number}</span>
            <span>${match.match_date} ${match.match_time}</span>
          </div>
          <div class="match-item-teams">
            <span class="alliance-red">K: ${match.red_alliance.join(", ")}</span>
            <span class="alliance-blue">M: ${match.blue_alliance.join(", ")}</span>
          </div>
          ${scoreDisplay}
          ${activateButton}
          ${match.status === "in_progress" ? '<div class="match-item-active">Aktif</div>' : ''}
        </div>
      `;
    }).join("");
    
    // Maç seçim event listener'ları
    listContainer.querySelectorAll(".match-item").forEach(item => {
      item.addEventListener("click", () => {
        const source = item.dataset.source || "schedule";
        const matchId = parseInt(item.dataset.matchId);
        const match = getMatchBySource(matches, source, matchId);
        if (!match) return;
        if (source === "practice") {
          selectPracticeMatch(match);
        } else {
          selectMatch(matchId, matches);
        }
        switchTab("active-match");
      });
    });
    
    listContainer.querySelectorAll(".schedule-activate-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const matchId = parseInt(btn.dataset.matchId);
        selectMatch(matchId, matches);
        switchTab("active-match");
        showToast("Maç aktif edildi", "success");
      });
    });
    
    listContainer.querySelectorAll(".schedule-load-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const matchId = parseInt(btn.dataset.matchId);
        const match = getMatchBySource(matches, "practice", matchId);
        if (!match) return;
        selectPracticeMatch(match);
        switchTab("active-match");
        showToast("Deneme maçı yüklendi", "success");
      });
    });
    
  } catch (err) {
    console.error("Load schedule matches error:", err);
    listContainer.innerHTML = "<div class='error'>Maç listesi yüklenirken hata oluştu</div>";
  }
}

/**
 * Schedule tab için maçları getirir (deneme + resmi).
 * @param {string} fieldNumber
 * @param {string} matchType
 * @returns {Promise<Array>}
 */
async function fetchScheduleMatches(fieldNumber, matchType) {
  if (matchType === "practice") {
    return await loadPracticeScheduleMatches(fieldNumber);
  }
  if (matchType) {
    return await loadOfficialScheduleMatches(fieldNumber, matchType);
  }
  const [practice, official] = await Promise.all([
    loadPracticeScheduleMatches(fieldNumber),
    loadOfficialScheduleMatches(fieldNumber, "")
  ]);
  return [...practice, ...official].sort(compareMatchDateTime);
}

/**
 * Deneme maçlarını Schedule formatında döndürür.
 */
async function loadPracticeScheduleMatches(fieldNumber) {
  const params = {};
  if (fieldNumber) params.field = fieldNumber;
  const matches = await apiGet("/api/practice-matches", params);
  return (matches || []).map(match => ({
    ...match,
    match_type: "practice",
    source: "practice",
  }));
}

/**
 * Resmi maçları Schedule formatında döndürür.
 */
async function loadOfficialScheduleMatches(fieldNumber, matchType) {
  const params = {};
  if (fieldNumber) params.field_number = fieldNumber;
  if (matchType) params.match_type = matchType;
  const matches = await apiGet("/api/match-schedule", params);
  return (matches || []).map(match => ({
    ...match,
    source: "schedule",
  }));
}

/**
 * Maç numarasını görüntü formatına çevirir.
 */
function formatMatchNumber(match) {
  if (match.match_type === "practice") {
    return `Deneme ${match.match_number || "-"}`;
  }
  return `Maç ${match.match_number}`;
}

/**
 * Tarih-saat sıralaması için karşılaştırma.
 */
function compareMatchDateTime(a, b) {
  const aKey = `${a.match_date || ""} ${a.match_time || ""}`.trim();
  const bKey = `${b.match_date || ""} ${b.match_time || ""}`.trim();
  if (aKey === bKey) {
    return (a.field_number || 0) - (b.field_number || 0);
  }
  return aKey.localeCompare(bKey);
}

/**
 * Tamamlanmamış maçları yükler
 */
async function loadIncompleteMatches() {
  const listContainer = qs("incomplete_match_list");
  if (!listContainer) return;
  
  listContainer.innerHTML = "<div class='loading'>Yükleniyor...</div>";
  
  try {
    const matches = await apiGet("/api/match-schedule");
    const incomplete = matches.filter(m => m.status !== "completed");
    
    if (incomplete.length === 0) {
      listContainer.innerHTML = "<div class='empty'>Tamamlanmamış maç yok</div>";
      return;
    }
    
    listContainer.innerHTML = incomplete.map(match => {
      return `
        <div class="match-item" data-match-id="${match.id}">
          <div class="match-item-header">
            <span class="match-number">Maç ${match.match_number}</span>
            <span class="match-status">${getStatusLabel(match.status)}</span>
          </div>
          <div class="match-item-info">
            <span>${getMatchTypeLabel(match.match_type)}</span>
            <span>Saha ${match.field_number}</span>
          </div>
          <div class="match-item-teams">
            <span class="alliance-red">K: ${match.red_alliance.join(", ")}</span>
            <span class="alliance-blue">M: ${match.blue_alliance.join(", ")}</span>
          </div>
        </div>
      `;
    }).join("");
    
    listContainer.querySelectorAll(".match-item").forEach(item => {
      item.addEventListener("click", () => {
        const matchId = parseInt(item.dataset.matchId);
        selectMatch(matchId, incomplete);
        switchTab("active-match");
      });
    });
    
  } catch (err) {
    console.error("Load incomplete matches error:", err);
    listContainer.innerHTML = "<div class='error'>Maç listesi yüklenirken hata oluştu</div>";
  }
}

/**
 * Skor düzenleme için maçları yükler
 */
async function loadScoreEditMatches() {
  const listContainer = qs("score_edit_match_list");
  if (!listContainer) return;
  const form = qs("score_edit_form");
  
  listContainer.innerHTML = "<div class='loading'>Yükleniyor...</div>";
  if (form) {
    form.style.display = "none";
  }
  resetScoringInputs();
  
  try {
    const scheduleMatches = await apiGet("/api/match-schedule");
    const practiceMatches = await apiGet("/api/practice-matches");
    const merged = [
      ...(Array.isArray(scheduleMatches) ? scheduleMatches : []).map((m) => ({ ...m, source: "schedule" })),
      ...(Array.isArray(practiceMatches) ? practiceMatches : []).map((m) => ({
        ...m,
        source: "practice",
        match_type: m.match_type || "practice"
      }))
    ];
    const completed = merged.filter(m => m.status === "completed");
    scoreEditMatches = completed;
    
    if (completed.length === 0) {
      listContainer.innerHTML = "<div class='empty'>Tamamlanmış maç yok</div>";
      return;
    }
    
    listContainer.innerHTML = completed.map(match => {
      const hasScores = match.red_score !== null && match.blue_score !== null;
      return `
        <div class="match-item completed" data-match-id="${match.id}" data-match-source="${match.source}">
          <div class="match-item-header">
            <span class="match-number">Maç ${match.match_number}</span>
            <span class="match-status">${getStatusLabel(match.status)}</span>
          </div>
          <div class="match-item-info">
            <span>${getMatchTypeLabel(match.match_type)}</span>
            <span>Saha ${match.field_number}</span>
          </div>
          ${hasScores ? `
            <div class="match-item-score">
              <span class="score-red">K: ${match.red_score || 0}</span>
              <span class="score-separator">-</span>
              <span class="score-blue">M: ${match.blue_score || 0}</span>
            </div>
          ` : ''}
          <button class="btn-primary btn-small" data-action="edit">Düzenle</button>
        </div>
      `;
    }).join("");

    listContainer.querySelectorAll(".match-item [data-action='edit']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        const item = event.currentTarget.closest(".match-item");
        const matchId = parseInt(item?.dataset.matchId || 0);
        const matchSource = item?.dataset.matchSource || "schedule";
        selectScoreEditMatch(matchId, matchSource);
      });
    });
    
  } catch (err) {
    console.error("Load score edit matches error:", err);
    listContainer.innerHTML = "<div class='error'>Maç listesi yüklenirken hata oluştu</div>";
  }
}

/**
 * Skor düzenleme için maç seçer
 */
function selectScoreEditMatch(matchId, matchSource) {
  const form = qs("score_edit_form");
  const info = qs("score_edit_match_info");
  const redInput = qs("score_edit_red_score");
  const blueInput = qs("score_edit_blue_score");
  const notesInput = qs("score_edit_notes");
  const match = scoreEditMatches.find((m) => m.id === matchId && (m.source || "schedule") === (matchSource || "schedule"));
  if (!match || !form || !info || !redInput || !blueInput) return;

  scoreEditSelected = match;
  info.textContent = `Maç ${match.match_number} • ${getMatchTypeLabel(match.match_type)} • Saha ${match.field_number}`;
  redInput.value = match.red_score ?? 0;
  blueInput.value = match.blue_score ?? 0;
  if (notesInput) {
    notesInput.value = match.notes || "";
  }
  form.style.display = "block";
  moveDetailedScoringTo("score_edit_detailed_slot");
  renderDetailedAllianceTeams("blue", match.blue_alliance);
  renderDetailedAllianceTeams("red", match.red_alliance);
  applyScoringData(match.scoring_data || {});
  calculateScoreBreakdown();
}

/**
 * Skor düzenleme kaydı
 */
async function saveScoreEdit() {
  if (!scoreEditSelected) {
    showToast("Önce bir maç seçin", "warning");
    return;
  }
  const redInput = qs("score_edit_red_score");
  const blueInput = qs("score_edit_blue_score");
  const notesInput = qs("score_edit_notes");
  if (!redInput || !blueInput) return;
  const redScore = parseInt(redInput.value || 0);
  const blueScore = parseInt(blueInput.value || 0);
  if (Number.isNaN(redScore) || Number.isNaN(blueScore)) {
    showToast("Geçerli skor girin", "warning");
    return;
  }
  try {
    const scoringData = {
      blue: collectScoringData("blue"),
      red: collectScoringData("red"),
      team_statuses: collectTeamStatuses()
    };
    await apiPost("/api/match-control/score", {
      match_id: scoreEditSelected.id,
      red_score: redScore,
      blue_score: blueScore,
      match_source: scoreEditSelected.source || "schedule",
      scoring_data: scoringData,
      notes: notesInput?.value || ""
    });
    scoreEditSelected.red_score = redScore;
    scoreEditSelected.blue_score = blueScore;
    scoreEditSelected.scoring_data = scoringData;
    scoreEditSelected.notes = notesInput?.value || "";
    showToast("Skor güncellendi", "success");
    await loadScoreEditMatches();
  } catch (err) {
    console.error("Score edit save error:", err);
    showToast("Skor kaydedilemedi", "error");
  }
}

/**
 * Skor düzenlemeden sonuç gönderir
 */
async function showScoreEditResults() {
  if (!scoreEditSelected) {
    showToast("Önce bir maç seçin", "warning");
    return;
  }
  try {
    const payload = buildMatchResultsPayloadForMatch(scoreEditSelected);
    await apiPost("/api/screens/preview", {
      view: "match",
      mode: "preview",
      duration_seconds: 45,
      payload
    });
    showToast("Sonuçlar seyirci ekranına gönderildi", "success");
  } catch (err) {
    console.error("Score edit results error:", err);
    showToast("Sonuçlar gönderilemedi", "error");
  }
}

/**
 * Skor dökümünü hesaplar (İstanbul ve Su oyununa özel)
 */
function calculateScoreBreakdown() {
  const rankingData = {};
  ["blue", "red"].forEach(alliance => {
    // OTONOM (OKS) Hesaplamaları - constants modülünden al
    // Başlangıç alanını terk etme
    const autoLeaveR1 = qs(`${alliance}_auto_leave_r1`)?.checked ? SCORING_CONSTANTS.AUTO_LEAVE_POINTS : 0;
    const autoLeaveR2 = qs(`${alliance}_auto_leave_r2`)?.checked ? SCORING_CONSTANTS.AUTO_LEAVE_POINTS : 0;
    const autoLeavePoints = autoLeaveR1 + autoLeaveR2;
    
    // Bent Seviye 1
    const autoBent1OwnCount = parseInt(qs(`${alliance}_auto_bent1_own`)?.value || 0);
    const autoBent1OpponentCount = parseInt(qs(`${alliance}_auto_bent1_opponent`)?.value || 0);
    const autoBent1Own = autoBent1OwnCount * SCORING_CONSTANTS.AUTO_BENT1_POINTS;
    const autoBent1Opponent = autoBent1OpponentCount * SCORING_CONSTANTS.AUTO_BENT1_POINTS;
    const autoBent1Points = autoBent1Own;
    const autoBent1OpponentPoints = autoBent1Opponent;
    
    // Bent Seviye 2
    const autoBent2CorrectCount = parseInt(qs(`${alliance}_auto_bent2_correct`)?.value || 0);
    const autoBent2WrongCount = parseInt(qs(`${alliance}_auto_bent2_wrong`)?.value || 0);
    const autoBent2OpponentCount = parseInt(qs(`${alliance}_auto_bent2_opponent`)?.value || 0);
    const autoBent2Correct = autoBent2CorrectCount * SCORING_CONSTANTS.AUTO_BENT2_CORRECT_POINTS;
    const autoBent2Wrong = autoBent2WrongCount * SCORING_CONSTANTS.AUTO_BENT2_WRONG_POINTS;
    const autoBent2Opponent = autoBent2OpponentCount * SCORING_CONSTANTS.AUTO_BENT2_CORRECT_POINTS; // Rakip alana verilen
    const autoBent2Points = autoBent2Correct + autoBent2Wrong;
    const autoBent2OpponentPoints = autoBent2Opponent;
    
    // Bent Seviye 3
    const autoBent3CorrectCount = parseInt(qs(`${alliance}_auto_bent3_correct`)?.value || 0);
    const autoBent3WrongCount = parseInt(qs(`${alliance}_auto_bent3_wrong`)?.value || 0);
    const autoBent3OpponentCount = parseInt(qs(`${alliance}_auto_bent3_opponent`)?.value || 0);
    const autoBent3Correct = autoBent3CorrectCount * SCORING_CONSTANTS.AUTO_BENT3_CORRECT_POINTS;
    const autoBent3Wrong = autoBent3WrongCount * SCORING_CONSTANTS.AUTO_BENT3_WRONG_POINTS;
    const autoBent3Opponent = autoBent3OpponentCount * SCORING_CONSTANTS.AUTO_BENT3_CORRECT_POINTS; // Rakip alana verilen
    const autoBent3Points = autoBent3Correct + autoBent3Wrong;
    const autoBent3OpponentPoints = autoBent3Opponent;
    
    // Sarnıçlar
    const autoTankOwnCount = parseInt(qs(`${alliance}_auto_tank_own`)?.value || 0);
    const autoTankOpponentCount = parseInt(qs(`${alliance}_auto_tank_opponent`)?.value || 0);
    const autoTankOwn = autoTankOwnCount * SCORING_CONSTANTS.AUTO_TANK_POINTS;
    const autoTankOpponent = autoTankOpponentCount * SCORING_CONSTANTS.AUTO_TANK_POINTS; // Rakip alana verilen
    const autoTankPoints = autoTankOwn;
    const autoTankOpponentPoints = autoTankOpponent;
    
    // Otonom toplam
    const autoTotal = autoLeavePoints + autoBent1Points + autoBent2Points + autoBent3Points + autoTankPoints;
    const autoOpponentTotal = autoBent1OpponentPoints + autoBent2OpponentPoints + autoBent3OpponentPoints + autoTankOpponentPoints;
    
    // SÜRÜCÜ KONTROLLÜ (SKS) Hesaplamaları - constants modülünden al
    // Bent Seviye 1
    const teleopBent1OwnCount = parseInt(qs(`${alliance}_teleop_bent1_own`)?.value || 0);
    const teleopBent1OpponentCount = parseInt(qs(`${alliance}_teleop_bent1_opponent`)?.value || 0);
    const teleopBent1Own = teleopBent1OwnCount * SCORING_CONSTANTS.TELEOP_BENT1_POINTS;
    const teleopBent1Opponent = teleopBent1OpponentCount * SCORING_CONSTANTS.TELEOP_BENT1_POINTS;
    const teleopBent1Points = teleopBent1Own;
    const teleopBent1OpponentPoints = teleopBent1Opponent;
    
    // Bent Seviye 2
    const teleopBent2CorrectCount = parseInt(qs(`${alliance}_teleop_bent2_correct`)?.value || 0);
    const teleopBent2WrongCount = parseInt(qs(`${alliance}_teleop_bent2_wrong`)?.value || 0);
    const teleopBent2OpponentCount = parseInt(qs(`${alliance}_teleop_bent2_opponent`)?.value || 0);
    const teleopBent2Correct = teleopBent2CorrectCount * SCORING_CONSTANTS.TELEOP_BENT2_CORRECT_POINTS;
    const teleopBent2Wrong = teleopBent2WrongCount * SCORING_CONSTANTS.TELEOP_BENT2_WRONG_POINTS;
    const teleopBent2Opponent = teleopBent2OpponentCount * SCORING_CONSTANTS.TELEOP_BENT2_CORRECT_POINTS; // Rakip alana verilen
    const teleopBent2Points = teleopBent2Correct + teleopBent2Wrong;
    const teleopBent2OpponentPoints = teleopBent2Opponent;
    
    // Bent Seviye 3
    const teleopBent3CorrectCount = parseInt(qs(`${alliance}_teleop_bent3_correct`)?.value || 0);
    const teleopBent3WrongCount = parseInt(qs(`${alliance}_teleop_bent3_wrong`)?.value || 0);
    const teleopBent3OpponentCount = parseInt(qs(`${alliance}_teleop_bent3_opponent`)?.value || 0);
    const teleopBent3Correct = teleopBent3CorrectCount * SCORING_CONSTANTS.TELEOP_BENT3_CORRECT_POINTS;
    const teleopBent3Wrong = teleopBent3WrongCount * SCORING_CONSTANTS.TELEOP_BENT3_WRONG_POINTS;
    const teleopBent3Opponent = teleopBent3OpponentCount * SCORING_CONSTANTS.TELEOP_BENT3_CORRECT_POINTS; // Rakip alana verilen
    const teleopBent3Points = teleopBent3Correct + teleopBent3Wrong;
    const teleopBent3OpponentPoints = teleopBent3Opponent;
    
    // Sarnıçlar
    const teleopTankOwnCount = parseInt(qs(`${alliance}_teleop_tank_own`)?.value || 0);
    const teleopTankOpponentCount = parseInt(qs(`${alliance}_teleop_tank_opponent`)?.value || 0);
    const teleopTankOwn = teleopTankOwnCount * SCORING_CONSTANTS.TELEOP_TANK_POINTS;
    const teleopTankOpponent = teleopTankOpponentCount * SCORING_CONSTANTS.TELEOP_TANK_POINTS; // Rakip alana verilen
    const teleopTankPoints = teleopTankOwn;
    const teleopTankOpponentPoints = teleopTankOpponent;
    
    // Özel Aksiyonlar
    const teleopSourceEntryCount = parseInt(qs(`${alliance}_teleop_source_entry`)?.value || 0);
    const teleopClimbCount = parseInt(qs(`${alliance}_teleop_climb`)?.value || 0);
    const teleopSourceEntry = teleopSourceEntryCount * SCORING_CONSTANTS.TELEOP_SOURCE_ENTRY_POINTS;
    const teleopClimb = teleopClimbCount * SCORING_CONSTANTS.TELEOP_CLIMB_POINTS;
    
    // Sürücü kontrollü toplam
    const teleopTotal = teleopBent1Points + teleopBent2Points + teleopBent3Points + teleopTankPoints + teleopSourceEntry + teleopClimb;
    const teleopOpponentTotal = teleopBent1OpponentPoints + teleopBent2OpponentPoints + teleopBent3OpponentPoints + teleopTankOpponentPoints;
    
    // CEZALAR - constants modülünden al
    const yellowCard = parseInt(qs(`${alliance}_yellow_card`)?.value || 0);
    const majorPenalty = parseInt(qs(`${alliance}_major_penalty`)?.value || 0);
    const yellowCardPoints = yellowCard * SCORING_CONSTANTS.YELLOW_CARD_POINTS_TO_OPPONENT; // Rakip takıma verilen puan
    const majorPenaltyPoints = majorPenalty * SCORING_CONSTANTS.MAJOR_PENALTY_POINTS_TO_OPPONENT; // Rakip takıma verilen puan
    const penaltyTotal = yellowCardPoints + majorPenaltyPoints;
    
    // Rakip takımın cezalarından gelen puanlar (diğer ittifakın cezaları)
    const opponentAlliance = alliance === "blue" ? "red" : "blue";
    const opponentYellowCard = parseInt(qs(`${opponentAlliance}_yellow_card`)?.value || 0);
    const opponentMajorPenalty = parseInt(qs(`${opponentAlliance}_major_penalty`)?.value || 0);
    const receivedFromPenalties = (opponentYellowCard * SCORING_CONSTANTS.YELLOW_CARD_POINTS_TO_OPPONENT) + (opponentMajorPenalty * SCORING_CONSTANTS.MAJOR_PENALTY_POINTS_TO_OPPONENT);
    
    // Rakip takımın bu ittifakın alanına verdiği puanlar (rakip takımdan gelir, bu ittifaka eklenir)
    // Örnek: Kırmızı takım mavi bentine küre bırakırsa, mavi takıma puan eklenir
    const opponentAutoPoints = alliance === "blue" ? 
      (parseInt(qs("red_auto_bent1_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_BENT1_POINTS +
       parseInt(qs("red_auto_bent2_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_BENT2_CORRECT_POINTS +
       parseInt(qs("red_auto_bent3_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_BENT3_CORRECT_POINTS +
       parseInt(qs("red_auto_tank_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_TANK_POINTS) :
      (parseInt(qs("blue_auto_bent1_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_BENT1_POINTS +
       parseInt(qs("blue_auto_bent2_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_BENT2_CORRECT_POINTS +
       parseInt(qs("blue_auto_bent3_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_BENT3_CORRECT_POINTS +
       parseInt(qs("blue_auto_tank_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_TANK_POINTS);
    
    const opponentTeleopPoints = alliance === "blue" ?
      (parseInt(qs("red_teleop_bent1_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_BENT1_POINTS +
       parseInt(qs("red_teleop_bent2_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_BENT2_CORRECT_POINTS +
       parseInt(qs("red_teleop_bent3_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_BENT3_CORRECT_POINTS +
       parseInt(qs("red_teleop_tank_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_TANK_POINTS) :
      (parseInt(qs("blue_teleop_bent1_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_BENT1_POINTS +
       parseInt(qs("blue_teleop_bent2_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_BENT2_CORRECT_POINTS +
       parseInt(qs("blue_teleop_bent3_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_BENT3_CORRECT_POINTS +
       parseInt(qs("blue_teleop_tank_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_TANK_POINTS);
    
    // Toplam skor = Kendi alanına verilen puanlar + Rakip cezalarından gelen puanlar + Rakip takımın bu alana verdiği puanlar
    const totalScore = autoTotal + teleopTotal + receivedFromPenalties + opponentAutoPoints + opponentTeleopPoints;

    // Saha özeti (OKS + SKS toplamları)
    qs(`${alliance}_field_bent1`).textContent = autoBent1OwnCount + teleopBent1OwnCount;
    qs(`${alliance}_field_bent2_correct`).textContent = autoBent2CorrectCount + teleopBent2CorrectCount;
    qs(`${alliance}_field_bent3_correct`).textContent = autoBent3CorrectCount + teleopBent3CorrectCount;
    qs(`${alliance}_field_tank`).textContent = autoTankOwnCount + teleopTankOwnCount;
    qs(`${alliance}_field_source`).textContent = teleopSourceEntryCount;
    qs(`${alliance}_field_climb`).textContent = teleopClimbCount;
    
    // Breakdown güncellemeleri
    qs(`${alliance}_auto_leave_points`).textContent = autoLeavePoints;
    qs(`${alliance}_auto_bent1_points`).textContent = autoBent1Points;
    qs(`${alliance}_auto_bent2_correct_points`).textContent = autoBent2Correct;
    qs(`${alliance}_auto_bent2_wrong_points`).textContent = autoBent2Wrong;
    qs(`${alliance}_auto_bent3_correct_points`).textContent = autoBent3Correct;
    qs(`${alliance}_auto_bent3_wrong_points`).textContent = autoBent3Wrong;
    qs(`${alliance}_auto_tank_points`).textContent = autoTankPoints;
    // Rakip alana verilen puanlar (bilgi amaçlı - bu ittifakın rakip alana verdiği puanlar)
    qs(`${alliance}_auto_opponent_points`).textContent = `${autoOpponentTotal} (Rakip takıma eklendi)`;
    qs(`${alliance}_auto_total`).textContent = autoTotal;
    
    qs(`${alliance}_teleop_bent1_points`).textContent = teleopBent1Points;
    qs(`${alliance}_teleop_bent2_correct_points`).textContent = teleopBent2Correct;
    qs(`${alliance}_teleop_bent2_wrong_points`).textContent = teleopBent2Wrong;
    qs(`${alliance}_teleop_bent3_correct_points`).textContent = teleopBent3Correct;
    qs(`${alliance}_teleop_bent3_wrong_points`).textContent = teleopBent3Wrong;
    qs(`${alliance}_teleop_tank_points`).textContent = teleopTankPoints;
    qs(`${alliance}_teleop_source_points`).textContent = teleopSourceEntry;
    qs(`${alliance}_teleop_climb_points`).textContent = teleopClimb;
    // Rakip alana verilen puanlar (bilgi amaçlı - bu ittifakın rakip alana verdiği puanlar)
    qs(`${alliance}_teleop_opponent_points`).textContent = `${teleopOpponentTotal} (Rakip takıma eklendi)`;
    qs(`${alliance}_teleop_total`).textContent = teleopTotal;
    
    qs(`${alliance}_yellow_card_points`).textContent = yellowCardPoints;
    qs(`${alliance}_major_penalty_points`).textContent = majorPenaltyPoints;
    qs(`${alliance}_penalty_total`).textContent = penaltyTotal;
    
    qs(`${alliance}_total_score`).textContent = totalScore;
    
    // Merkezi skorları güncelle
    qs(`central_${alliance === "blue" ? "blue" : "red"}_score`).textContent = totalScore;
    
    // Eğer kırmızı kart varsa, skor 0 olabilir (kurallara göre)
    const redCardR1 = qs(`${alliance}_red_card_r1`)?.checked;
    const redCardR2 = qs(`${alliance}_red_card_r2`)?.checked;
    if (redCardR1 || redCardR2) {
      // Kırmızı kart durumunda skor 0 olabilir veya özel işlem yapılabilir
      // Şimdilik uyarı göster
      if (totalScore > 0) {
        console.warn(`${alliance} ittifakında kırmızı kart var, skor kontrol edilmeli`);
      }
    }

    rankingData[alliance] = {
      totalScore,
      teleopClimbCount,
      autoBent1OwnCount,
      autoBent2CorrectCount,
      autoBent3CorrectCount
    };
  });

  updateRankingPoints(rankingData);
}

function updateRankingPoints(data) {
  const redScore = data.red?.totalScore ?? 0;
  const blueScore = data.blue?.totalScore ?? 0;
  const resultPoints = { red: 0, blue: 0 };
  if (redScore > blueScore) {
    resultPoints.red = 2;
  } else if (blueScore > redScore) {
    resultPoints.blue = 2;
  } else if (redScore === blueScore) {
    resultPoints.red = 1;
    resultPoints.blue = 1;
  }

  ["red", "blue"].forEach((alliance) => {
    const climbPoints = (data[alliance]?.teleopClimbCount || 0) >= 2 ? 2 : 0;
    // Otonomda 4 kendi renk küresi (bentlerde doğru konum)
    const autoCorrect =
      (data[alliance]?.autoBent1OwnCount || 0) +
      (data[alliance]?.autoBent2CorrectCount || 0) +
      (data[alliance]?.autoBent3CorrectCount || 0);
    const autoBonus = autoCorrect >= 4 ? 2 : 0;
    const total = resultPoints[alliance] + climbPoints + autoBonus;
    qs(`${alliance}_ranking_result`).textContent = resultPoints[alliance];
    qs(`${alliance}_ranking_climb`).textContent = climbPoints;
    qs(`${alliance}_ranking_auto`).textContent = autoBonus;
    qs(`${alliance}_ranking_total`).textContent = total;
  });
}

/**
 * Maçı kaydeder ve yayınlar
 */
async function commitAndPostMatch() {
  if (!currentMatch) {
    showToast("Önce bir maç seçin", "warning");
    return;
  }
  
  if (currentMatch.status !== "completed") {
    showToast("Önce maçı tamamlayın", "warning");
    return;
  }
  
  // Skorları hesapla ve güncelle
  calculateScoreBreakdown();
  
  const redScore = parseInt(qs("red_total_score")?.textContent || 0);
  const blueScore = parseInt(qs("blue_total_score")?.textContent || 0);
  
  try {
    await apiPost("/api/match-control/score", {
      match_id: currentMatch.id,
      red_score: redScore,
      blue_score: blueScore,
      match_source: currentMatch.source || "schedule"
    });
    
    // Skorları güncelle
    currentMatch.red_score = redScore;
    currentMatch.blue_score = blueScore;
    
    showToast("Maç kaydedildi ve yayınlandı", "success");
    
    // Maç listelerini güncelle
    await loadMatchList();
    await loadScheduleMatches();
    
  } catch (err) {
    console.error("Commit match error:", err);
    showToast("Maç kaydedilirken hata oluştu", "error");
  }
}

/**
 * Event listener'ları kurar
 */
function setupEventListeners() {
  // Tab switching
  document.querySelectorAll(".tab-button").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });
  
  // Load Next Match
  const btnLoadNext = qs("btn_load_next_match");
  if (btnLoadNext) {
    btnLoadNext.addEventListener("click", loadNextMatchAndSelect);
  }
  
  // Show Preview
  const btnPreview = qs("btn_show_preview");
  if (btnPreview) {
    btnPreview.addEventListener("click", async () => {
      try {
        const next = await apiGet("/api/match-control/next-match");
        if (!next.match) {
          showToast("Sıradaki maç bulunamadı", "warning");
          return;
        }
        const eventData = await apiGet("/api/event");
        const rankings = {};
        const rankingList = Array.isArray(eventData.rankings) ? eventData.rankings : [];
        rankingList.forEach((row) => {
          if (row?.team_number && row?.rank) {
            rankings[String(row.team_number)] = row.rank;
          }
        });
        await apiPost("/api/match-control/preview", {
          match_id: next.match.id,
          match_source: next.match.source || "schedule"
        });
        await apiPost("/api/screens/preview", {
          view: "match",
          mode: "preview",
          duration_seconds: 30,
          payload: { match: next.match, rankings }
        });
        showToast("Maç önizlemesi gönderildi", "success");
      } catch (err) {
        console.error("Preview error:", err);
        showToast("Önizleme gönderilemedi", "error");
      }
    });
  }

  const btnShowLive = qs("btn_show_live");
  if (btnShowLive) {
    btnShowLive.addEventListener("click", async () => {
      try {
        await apiPost("/api/screens/preview", {
          view: "match",
          mode: "live"
        });
        showToast("Maç ekranı canlı moda alındı", "success");
      } catch (err) {
        console.error("Show live error:", err);
        showToast("Maç ekranı canlı moda alınamadı", "error");
      }
    });
  }
  
  // Maç başlatma (üst bar'dan)
  const btnStart = qs("btn_start_match");
  if (btnStart) {
    btnStart.addEventListener("click", startMatch);
  }
  
  // Sonraki aşama
  const btnNextState = qs("btn_next_state");
  if (btnNextState) {
    btnNextState.addEventListener("click", nextMatchState);
  }
  
  // Maç durdurma
  const btnStop = qs("btn_stop_match");
  if (btnStop) {
    btnStop.addEventListener("click", stopMatch);
  }

  // Sonuçları göster
  const btnShowResults = qs("btn_show_results");
  if (btnShowResults) {
    btnShowResults.addEventListener("click", sendMatchResultsToScreens);
  }
  
  // Maç tamamlama
  const btnComplete = qs("btn_complete_match");
  if (btnComplete) {
    btnComplete.addEventListener("click", completeMatch);
  }
  
  // Commit & Post
  const btnCommit = qs("btn_commit_post");
  if (btnCommit) {
    btnCommit.addEventListener("click", commitAndPostMatch);
  }

  // Skor düzenleme kaydet
  const btnScoreEditSave = qs("btn_score_edit_save");
  if (btnScoreEditSave) {
    btnScoreEditSave.addEventListener("click", saveScoreEdit);
  }
  const btnScoreEditShowResults = qs("btn_score_edit_show_results");
  if (btnScoreEditShowResults) {
    btnScoreEditShowResults.addEventListener("click", showScoreEditResults);
  }
  
  // Skor güncelleme (detaylı skorlama alanlarından)
  document.querySelectorAll(".score-field").forEach(input => {
    input.addEventListener("change", () => {
      calculateScoreBreakdown();
      // Otomatik olarak skorları kaydet (opsiyonel - istenirse kaldırılabilir)
      // updateScoreFromDetailedScoring();
    });
    input.addEventListener("input", () => {
      calculateScoreBreakdown();
    });
  });
  
  // "Güncelle" butonları ekle (her ittifak için)
  const updateButtons = document.createElement("div");
  updateButtons.className = "score-update-buttons";
  updateButtons.innerHTML = `
    <button class="btn-primary btn-medium" onclick="updateScoreFromDetailedScoring()">Tüm Skorları Güncelle</button>
  `;
  
  // Skor güncelleme butonunu ekle (detaylı skorlama panellerinin altına)
  document.querySelectorAll(".detailed-scoring-panel").forEach(panel => {
    const existingButtons = panel.querySelector(".score-update-buttons");
    if (!existingButtons) {
      const buttonsDiv = document.createElement("div");
      buttonsDiv.className = "score-update-buttons";
      buttonsDiv.style.marginTop = "16px";
      buttonsDiv.innerHTML = `
        <button class="btn-primary btn-small" onclick="updateScoreFromDetailedScoring()">Skorları Güncelle</button>
      `;
      panel.appendChild(buttonsDiv);
    }
  });
  
  // Checkbox'lar için event listener'lar
  document.querySelectorAll("input[type='checkbox'][data-points]").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      calculateScoreBreakdown();
    });
  });
  
  // Kırmızı kart checkbox'ları
  document.querySelectorAll("input[type='checkbox'][id$='_red_card_r1'], input[type='checkbox'][id$='_red_card_r2']").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      calculateScoreBreakdown();
      // Kırmızı kart durumunda uyarı göster
      if (checkbox.checked) {
        const alliance = checkbox.id.includes("blue") ? "Mavi" : "Kırmızı";
        showToast(`${alliance} ittifakında kırmızı kart verildi - Diskalifiye`, "warning");
      }
    });
  });
  
  // Filtreler
  const fieldSelector = qs("field_selector");
  const matchTypeSelector = qs("match_type_selector");
  if (fieldSelector) {
    fieldSelector.addEventListener("change", loadMatchList);
  }
  if (matchTypeSelector) {
    matchTypeSelector.addEventListener("change", loadMatchList);
  }
  
  // Schedule tab filtreleri
  const scheduleFieldSelector = qs("schedule_field_selector");
  const scheduleMatchTypeSelector = qs("schedule_match_type_selector");
  if (scheduleFieldSelector) {
    scheduleFieldSelector.addEventListener("change", () => loadScheduleMatches());
  }
  if (scheduleMatchTypeSelector) {
    scheduleMatchTypeSelector.addEventListener("change", () => loadScheduleMatches());
  }

  // Seyirci ekranları ayarları
  if (qs("mc_save_screen_settings")) {
    qs("mc_save_screen_settings").addEventListener("click", saveMatchControlScreenSettings);
  }
  
  // Kompakt skor butonları için event listener'lar
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-score-plus") || e.target.classList.contains("btn-score-minus")) {
      e.preventDefault();
      e.stopPropagation();
      const fieldId = e.target.dataset.field;
      const field = qs(fieldId);
      if (field) {
        const currentValue = parseInt(field.value) || 0;
        const maxValue = field.hasAttribute("max") ? parseInt(field.getAttribute("max")) : null;
        const newValue = e.target.classList.contains("btn-score-plus") 
          ? (maxValue !== null ? Math.min(maxValue, currentValue + 1) : currentValue + 1)
          : Math.max(0, currentValue - 1);
        field.value = newValue;
        // Input event'ini tetikle ki diğer listener'lar da çalışsın
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        // Skor dökümünü hesapla
        calculateScoreBreakdown();
      }
    }
  });
  
  // Skor alanları değiştiğinde de hesapla
  document.addEventListener("input", (e) => {
    if (e.target.classList.contains("score-field-compact") || e.target.classList.contains("score-field")) {
      calculateScoreBreakdown();
    }
  });
  
  // Checkbox'lar değiştiğinde de hesapla
  document.addEventListener("change", (e) => {
    if (e.target.type === "checkbox" && (e.target.id.includes("auto_leave") || e.target.id.includes("red_card"))) {
      calculateScoreBreakdown();
    }
  });
}

/**
 * Maç listesini yükler
 * 
 * Network hatalarında otomatik retry yapar.
 * 
 * @param {string} filter - Filtre tipi ('all', 'scheduled', 'in_progress', 'completed')
 * @returns {Promise<void>}
 */
async function loadMatchList(filter = 'all') {
  const listContainer = qs("match_list");
  if (!listContainer) return;
  
  try {
    const fieldNumber = qs("field_selector")?.value;
    const matchType = qs("match_type_selector")?.value;
    
    const params = {};
    if (fieldNumber) params.field_number = fieldNumber;
    if (matchType) params.match_type = matchType;
    
    const matches = await apiGet("/api/match-schedule", params);
    
    if (matches.length === 0) {
      listContainer.innerHTML = "<div class='empty'>Maç bulunamadı</div>";
      return;
    }
    
    // Saha listesini doldur
    const fieldSet = new Set(matches.map(m => m.field_number).filter(Boolean));
    const fieldSelector = qs("field_selector");
    if (fieldSelector) {
      const currentValue = fieldSelector.value;
      fieldSelector.innerHTML = '<option value="">Tüm Sahalar</option>';
      Array.from(fieldSet).sort().forEach(field => {
        const option = document.createElement("option");
        option.value = field;
        option.textContent = `Saha ${field}`;
        if (currentValue === String(field)) option.selected = true;
        fieldSelector.appendChild(option);
      });
    }
    
    listContainer.innerHTML = matches.map(match => {
      const statusClass = match.status === "in_progress" ? "active" : 
                         match.status === "completed" ? "completed" : "";
      const hasScores = match.red_score !== null && match.blue_score !== null;
      const scoreDisplay = hasScores ? 
        `<div class="match-item-score">
          <span class="score-red">K: ${match.red_score || 0}</span>
          <span class="score-separator">-</span>
          <span class="score-blue">M: ${match.blue_score || 0}</span>
        </div>` : "";
      return `
        <div class="match-item ${statusClass}" data-match-id="${match.id}">
          <div class="match-item-header">
            <span class="match-number">Maç ${match.match_number}</span>
            <span class="match-status">${getStatusLabel(match.status)}</span>
          </div>
          <div class="match-item-info">
            <span>${getMatchTypeLabel(match.match_type)}</span>
            <span>Saha ${match.field_number}</span>
          </div>
          <div class="match-item-teams">
            <span class="alliance-red">K: ${match.red_alliance.join(", ")}</span>
            <span class="alliance-blue">M: ${match.blue_alliance.join(", ")}</span>
          </div>
          ${scoreDisplay}
          ${match.status === "in_progress" ? '<div class="match-item-active">Aktif</div>' : ''}
        </div>
      `;
    }).join("");
    
    // Maç seçim event listener'ları
    listContainer.querySelectorAll(".match-item").forEach(item => {
      item.addEventListener("click", () => {
        const matchId = parseInt(item.dataset.matchId);
        selectMatch(matchId, matches);
      });
    });
    
  } catch (err) {
    console.error("Load match list error:", err);
    listContainer.innerHTML = "<div class='error'>Maç listesi yüklenirken hata oluştu</div>";
  }
}

/**
 * Sıradaki maçı yükler
 */
async function loadNextMatch() {
  const nextMatchContainer = qs("next_match_info");
  if (!nextMatchContainer) return;
  
  try {
    const data = await apiGet("/api/match-control/next-match");
    const match = data.match;
    
    if (!match) {
      nextMatchContainer.innerHTML = "<div class='empty'>Sıradaki maç yok</div>";
      return;
    }
    
    nextMatchContainer.innerHTML = `
      <div class="next-match-card">
        <div class="next-match-header">
          <span class="next-match-number">Maç ${match.match_number}</span>
          <span class="next-match-type">${getMatchTypeLabel(match.match_type)}</span>
        </div>
        <div class="next-match-teams">
          <div class="alliance-red">K: ${match.red_alliance.join(", ")}</div>
          <div class="alliance-blue">M: ${match.blue_alliance.join(", ")}</div>
        </div>
        <div class="next-match-meta">
          <span>Saha ${match.field_number}</span>
          <span>${match.match_date} ${match.match_time}</span>
        </div>
        <button class="btn-primary btn-small" onclick="selectMatch(${match.id})">Bu Maçı Seç</button>
      </div>
    `;
    
  } catch (err) {
    console.error("Load next match error:", err);
    nextMatchContainer.innerHTML = "<div class='error'>Sıradaki maç yüklenirken hata oluştu</div>";
  }
}

/**
 * Aktif maçı kontrol eder
 */
async function checkActiveMatch() {
  try {
    const data = await apiGet("/api/match-control/active");
    if (data.match) {
      currentMatch = data.match;
      if (!currentMatch.source && currentMatch.match_source) {
        currentMatch.source = currentMatch.match_source;
      }
      if (!currentMatch.source) {
        currentMatch.source = "schedule";
      }
      renderMatchDisplay();
      startMatchTimer();
    }
  } catch (err) {
    console.error("Check active match error:", err);
  }
}

/**
 * Maç seçer
 */
async function selectMatch(matchId, matches = null) {
  if (!matches) {
    matches = await apiGet("/api/match-schedule");
  }
  
  const match = matches.find(m => m.id === matchId);
  if (!match) return;
  if (!match.source) {
    match.source = "schedule";
  }
  
  // Önceki gerçek zamanlı güncellemeleri durdur
  stopRealtimeScoreUpdates();
  
  currentMatch = match;
  renderMatchDisplay();
  applyScoringData(match.scoring_data || {});
  calculateScoreBreakdown();
  
  // Gerçek zamanlı skor güncellemelerini başlat
  startRealtimeScoreUpdates(matchId, match.source || "schedule");
  
  // Eğer maç aktifse, durumu yükle
  if (match.status === "in_progress") {
    await updateMatchStatus();
    startMatchTimer();
  } else {
    stopMatchTimer();
    currentState = "idle";
    timeRemaining = 0;
    updateStateDisplay();
  }
}

/**
 * Deneme maçını görüntülemek için yükler.
 * @param {Object} match
 */
function selectPracticeMatch(match) {
  if (!match) return;
  stopRealtimeScoreUpdates();
  currentMatch = {
    ...match,
    match_type: "practice",
    source: "practice",
  };
  currentState = "idle";
  timeRemaining = 0;
  stopMatchTimer();
  renderMatchDisplay();
  applyScoringData(match.scoring_data || {});
  calculateScoreBreakdown();
  startRealtimeScoreUpdates(match.id, "practice");
}

/**
 * Kaynaktan maçı bulur (practice/schedule).
 */
function getMatchBySource(matches, source, matchId) {
  return matches.find(m => (m.source || "schedule") === source && m.id === matchId);
}

/**
 * Maç görünümünü render eder
 */
function renderMatchDisplay() {
  if (!currentMatch) {
    qs("match_status_card").style.display = "none";
    const compactHeader = qs("compact_match_header");
    if (compactHeader) compactHeader.style.display = "none";
    qs("no_match_selected").style.display = "block";
    qs("loaded_match_info").textContent = "-";
    qs("active_match_info").textContent = "-";
    return;
  }
  
  qs("match_status_card").style.display = "block";
  qs("no_match_selected").style.display = "none";
  
  // Üst bar bilgileri
  qs("loaded_match_info").textContent = `Maç ${currentMatch.match_number} (${getMatchTypeLabel(currentMatch.match_type)})`;
  if (currentMatch.status === "in_progress") {
    qs("active_match_info").textContent = `Maç ${currentMatch.match_number} - ${MATCH_STATES[currentState]?.label || "Aktif"}`;
  } else {
    qs("active_match_info").textContent = "-";
  }
  
  // Maç başlığı (eski - gizli)
  qs("current_match_title").textContent = `Maç ${currentMatch.match_number}`;
  qs("current_match_number").textContent = `#${currentMatch.match_number}`;
  qs("current_match_type").textContent = getMatchTypeLabel(currentMatch.match_type);
  qs("current_field_number").textContent = `Saha ${currentMatch.field_number}`;
  
  // Kompakt maç başlığı
  const compactHeader = qs("compact_match_header");
  if (compactHeader) {
    compactHeader.style.display = "block";
    qs("compact_match_number").textContent = `Maç ${currentMatch.match_number}`;
    qs("compact_match_type_field").textContent = `${getMatchTypeLabel(currentMatch.match_type)} • Saha ${currentMatch.field_number}`;
  }
  
  // Merkezi match status
  if (currentMatch.status === "in_progress") {
    qs("central_match_status").textContent = `${MATCH_STATES[currentState]?.label || "Aktif"} - ${formatTime(timeRemaining)}`;
  } else if (currentMatch.source === "practice") {
    qs("central_match_status").textContent = "Deneme Maçı";
  } else if (currentMatch.status === "completed") {
    qs("central_match_status").textContent = "Tamamlandı";
  } else {
    qs("central_match_status").textContent = "Aktif Maç Yok";
  }
  
  // Merkezi skorlar
  qs("central_blue_score").textContent = currentMatch.blue_score || 0;
  qs("central_red_score").textContent = currentMatch.red_score || 0;
  
  // İttifaklar - Merkezi display için
  renderCentralAlliance("blue", currentMatch.blue_alliance);
  renderCentralAlliance("red", currentMatch.red_alliance);
  
  // Detaylı skorlama panellerinde takımları göster
  renderDetailedAllianceTeams("blue", currentMatch.blue_alliance);
  renderDetailedAllianceTeams("red", currentMatch.red_alliance);
  
  // Buton durumları
  const isActive = currentMatch.status === "in_progress";
  const isCompleted = currentMatch.status === "completed";
  
  qs("btn_start_match").style.display = (isActive || isCompleted) ? "none" : "inline-block";
  qs("btn_next_state").style.display = isActive ? "inline-block" : "none";
  qs("btn_stop_match").style.display = isActive ? "inline-block" : "none";
  qs("btn_show_results").style.display = (isActive || isCompleted) ? "inline-block" : "none";
  qs("btn_complete_match").style.display = isActive ? "inline-block" : "none";
  qs("btn_commit_post").style.display = isCompleted ? "inline-block" : "none";
  
  // Skor dökümünü hesapla
  calculateScoreBreakdown();
  
  updateStateDisplay();
}

/**
 * Zamanı formatlar (MM:SS)
 */
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Merkezi alliance görünümünü render eder
 */
function renderCentralAlliance(alliance, teams) {
  const teamsContainer = qs(`central_${alliance}_teams`);
  const statusContainer = qs(`central_${alliance}_status`);
  
  if (teamsContainer && teams && teams.length > 0) {
    // Takım numaralarını göster
    teamsContainer.innerHTML = teams.map((team, index) => {
      return `
        <div class="central-team-item">
          <div class="central-team-number">${team}</div>
          <div class="central-team-label">Robot ${index + 1}</div>
        </div>
      `;
    }).join("");
  } else if (teamsContainer) {
    teamsContainer.innerHTML = "<div class='no-teams'>Takım yok</div>";
  }
  
  // Status square'leri oluştur (her takım için)
  if (statusContainer && teams && teams.length > 0) {
    statusContainer.innerHTML = teams.map((team, index) => {
      return `
        <div class="status-square status-ready" data-team="${alliance}-${index + 1}" data-team-number="${team}" title="Takım ${team} - Hazır">
          <span class="status-team-number">${team}</span>
        </div>
      `;
    }).join("");
  } else if (statusContainer) {
    statusContainer.innerHTML = "";
  }
}

/**
 * Detaylı skorlama panellerinde takımları gösterir
 */
function renderDetailedAllianceTeams(alliance, teams) {
  const teamsContainer = qs(`detailed_${alliance}_teams`);
  const statusContainer = qs(`${alliance}_team_statuses`);
  
  if (teamsContainer && teams && teams.length > 0) {
    teamsContainer.innerHTML = `
      <div class="alliance-teams-list">
        ${teams.map((team, index) => `
          <div class="detailed-team-badge">
            <span class="team-number">${team}</span>
            <span class="team-robot-label">Robot ${index + 1}</span>
          </div>
        `).join("")}
      </div>
    `;
  } else if (teamsContainer) {
    teamsContainer.innerHTML = "<div class='no-teams'>Takım yok</div>";
  }
  
  // Takım durumları
  if (statusContainer && teams && teams.length > 0) {
    statusContainer.innerHTML = `
      <div class="team-status-grid">
        ${teams.map((team, index) => `
          <div class="team-status-item" data-team="${alliance}-${index + 1}" data-team-number="${team}">
            <div class="team-status-header">
              <span class="team-status-number">${team}</span>
              <span class="team-status-robot">R${index + 1}</span>
            </div>
            <div class="team-status-buttons">
              <button class="team-status-btn" data-status="ready" data-team="${alliance}-${index + 1}" title="Hazır">✓</button>
              <button class="team-status-btn" data-status="yellow" data-team="${alliance}-${index + 1}" title="Sarı Kart">🟡</button>
              <button class="team-status-btn" data-status="red" data-team="${alliance}-${index + 1}" title="Kırmızı Kart">🔴</button>
              <button class="team-status-btn" data-status="dq" data-team="${alliance}-${index + 1}" title="Diskalifiye">DQ</button>
              <button class="team-status-btn" data-status="ry" data-team="${alliance}-${index + 1}" title="Robot Yok">RY</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
    
    // Status butonları için event listener'lar
    statusContainer.querySelectorAll(".team-status-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const status = btn.dataset.status;
        const teamId = btn.dataset.team;
        toggleTeamStatus(alliance, teamId, status, btn);
      });
    });
  } else if (statusContainer) {
    statusContainer.innerHTML = "";
  }
}

/**
 * Takım durumunu değiştirir
 */
function toggleTeamStatus(alliance, teamId, status, button) {
  // Eğer aynı butona tekrar tıklanırsa, seçimi kaldır
  if (button.classList.contains("active")) {
    button.classList.remove("active");
    
    // Status square'i sıfırla
    const statusSquare = document.querySelector(`.status-square[data-team="${teamId}"]`);
    if (statusSquare) {
      statusSquare.className = `status-square status-ready`;
      const teamNumber = button.closest(".team-status-item").dataset.teamNumber;
      statusSquare.title = `Takım ${teamNumber} - Hazır`;
    }
    
    // Kırmızı kart checkbox'ını kaldır
    if (status === "red") {
      const robotIndex = teamId.split("-")[1];
      const checkboxId = `${alliance}_red_card_r${robotIndex}`;
      const checkbox = qs(checkboxId);
      if (checkbox) {
        checkbox.checked = false;
        calculateScoreBreakdown();
      }
    }
    return;
  }
  
  // Diğer butonları sıfırla
  const teamItem = button.closest(".team-status-item");
  const allButtons = teamItem.querySelectorAll(".team-status-btn");
  allButtons.forEach(btn => {
    btn.classList.remove("active");
  });
  
  // Seçilen butonu aktif yap
  button.classList.add("active");
  
  // Status square'i güncelle (merkezi display'de)
  const statusSquare = document.querySelector(`.status-square[data-team="${teamId}"]`);
  if (statusSquare) {
    statusSquare.className = `status-square status-${status}`;
    
    // Status'a göre title güncelle
    const statusLabels = {
      ready: "Hazır",
      yellow: "Sarı Kart",
      red: "Kırmızı Kart",
      dq: "Diskalifiye",
      ry: "Robot Yok"
    };
    const teamNumber = button.closest(".team-status-item").dataset.teamNumber;
    statusSquare.title = `Takım ${teamNumber} - ${statusLabels[status] || "Bilinmiyor"}`;
    
    // Status square içindeki takım numarasını güncelle
    const teamNumberSpan = statusSquare.querySelector(".status-team-number");
    if (teamNumberSpan) {
      teamNumberSpan.textContent = teamNumber;
    }
  }
  
  // Kırmızı kart durumunda özel işlem
  if (status === "red") {
    const robotIndex = teamId.split("-")[1];
    const checkboxId = `${alliance}_red_card_r${robotIndex}`;
    const checkbox = qs(checkboxId);
    if (checkbox) {
      checkbox.checked = true;
      calculateScoreBreakdown();
    }
  }
  
  // DQ durumunda bilgilendirme
  if (status === "dq") {
    console.log(`${alliance} ittifakı ${teamId} takımı diskalifiye edildi`);
  }
  
  // RY (Robot Yok) durumunda bilgilendirme
  if (status === "ry") {
    console.log(`${alliance} ittifakı ${teamId} takımı robot yok olarak işaretlendi`);
  }
}

/**
 * İttifak görünümünü render eder (eski sistem - geriye dönük uyumluluk için)
 */
function renderAlliance(alliance, teams, score) {
  const teamsContainer = qs(`${alliance}_alliance_teams`);
  const scoreDisplay = qs(`${alliance}_score_display`);
  const scoreInput = qs(`${alliance}_score_input`);
  
  if (teamsContainer) {
    teamsContainer.innerHTML = teams.map(team => 
      `<div class="team-badge">${team}</div>`
    ).join("");
  }
  
  if (scoreDisplay) {
    scoreDisplay.textContent = score;
  }
  
  if (scoreInput) {
    scoreInput.value = score;
  }
}

/**
 * Maçı başlatır
 */
async function startMatch() {
  if (!currentMatch) return;
  
  try {
    const data = await apiPost("/api/match-control/start", {
      match_id: currentMatch.id,
      field_number: currentMatch.field_number,
      match_source: currentMatch.source || "schedule"
    });
    currentMatch.status = "in_progress";
    currentState = data.match.current_state || "autonomous";
    timeRemaining = data.match.time_remaining || MATCH_STATES[currentState].duration;
    
    renderMatchDisplay();
    startMatchTimer();
    showToast("Maç başlatıldı", "success");
    
    // Maç listesini güncelle
    await loadMatchList();
    
  } catch (err) {
    console.error("Start match error:", err);
    showToast("Maç başlatılırken hata oluştu", "error");
  }
}

/**
 * Sonraki maç durumuna geçer
 */
async function nextMatchState() {
  if (!currentMatch) return;
  
  const stateOrder = ["autonomous", "prepare_teleop", "driver_controlled", "end_game", "post_match"];
  const currentIndex = stateOrder.indexOf(currentState);
  
  if (currentIndex === -1 || currentIndex >= stateOrder.length - 1) {
    showToast("Son aşamaya ulaşıldı", "warning");
    return;
  }
  
  const nextState = stateOrder[currentIndex + 1];
  
  try {
    const data = await apiPost("/api/match-control/state", {
      match_id: currentMatch.id,
      state: nextState,
      match_source: currentMatch.source || "schedule"
    });
    currentState = data.state;
    timeRemaining = data.time_remaining;
    
    updateStateDisplay();
    showToast(`${MATCH_STATES[currentState].label} başladı`, "success");
    
    // Önemli anları göster
    showImportantMoment(currentState);
    
  } catch (err) {
    console.error("Next state error:", err);
    showToast("Durum güncellenirken hata oluştu", "error");
  }
}

/**
 * Maçı durdurur
 */
async function stopMatch() {
  if (!currentMatch) return;
  
  if (!confirm("Maçı durdurmak istediğinizden emin misiniz?")) {
    return;
  }
  
  try {
    await apiPost("/api/match-control/stop", {
      match_id: currentMatch.id,
      match_source: currentMatch.source || "schedule"
    });
    
    currentMatch.status = "scheduled";
    currentState = "idle";
    timeRemaining = 0;
    
    stopMatchTimer();
    renderMatchDisplay();
    showToast("Maç durduruldu", "info");
    
    // Maç listesini güncelle
    await loadMatchList();
    
  } catch (err) {
    console.error("Stop match error:", err);
    showToast("Maç durdurulurken hata oluştu", "error");
  }
}

/**
 * Maçı tamamlar
 */
async function completeMatch() {
  if (!currentMatch) return;
  
  // Detaylı skorlama sisteminden skorları al
  calculateScoreBreakdown();
  const redScore = parseInt(qs("red_total_score")?.textContent || 0);
  const blueScore = parseInt(qs("blue_total_score")?.textContent || 0);
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
  
  if (!confirm(`Maçı tamamlamak istediğinizden emin misiniz?\nKırmızı: ${redScore} - Mavi: ${blueScore}`)) {
    return;
  }
  
  try {
    await apiPost("/api/match-control/complete", {
      match_id: currentMatch.id,
      red_score: redScore,
      blue_score: blueScore,
      match_source: currentMatch.source || "schedule"
    });
    
    currentMatch.status = "completed";
    currentMatch.red_score = redScore;
    currentMatch.blue_score = blueScore;
    currentState = "completed";
    timeRemaining = 0;
    
    stopMatchTimer();
    renderMatchDisplay();
    showToast("Maç tamamlandı", "success");
    
    // Maç listesini güncelle
    await loadMatchList();
    await loadNextMatch();
    
  } catch (err) {
    console.error("Complete match error:", err);
    showToast("Maç tamamlanırken hata oluştu", "error");
  }
}

/**
 * Skor günceller (detaylı skorlama sisteminden - modüler puanlama sistemi kullanır)
 */
async function updateScoreFromDetailedScoring() {
  if (!currentMatch) return;
  
  // Tüm puanlama verilerini topla
  const blueScoringData = collectScoringData("blue");
  const redScoringData = collectScoringData("red");
  
  try {
    // Modüler puanlama sistemi ile güncelle (her iki ittifak için)
    const [blueRes, redRes] = await Promise.all([
      fetch("/api/match-control/score/detailed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: currentMatch.id,
          alliance: "blue",
          scoring_data: blueScoringData,
          match_source: currentMatch.source || "schedule"
        })
      }),
      fetch("/api/match-control/score/detailed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: currentMatch.id,
          alliance: "red",
          scoring_data: redScoringData,
          match_source: currentMatch.source || "schedule"
        })
      })
    ]);
    
    if (!blueRes.ok || !redRes.ok) {
      const error = await blueRes.json().catch(() => ({}));
      showToast(error.error || "Skor güncellenemedi", "error");
      return;
    }
    
    const blueResult = await blueRes.json();
    const redResult = await redRes.json();
    
    // Hesaplanan skorları güncelle
    currentMatch.red_score = redResult.calculated_score;
    currentMatch.blue_score = blueResult.calculated_score;
    
    // Merkezi skorları güncelle
    qs("central_blue_score").textContent = blueResult.calculated_score;
    qs("central_red_score").textContent = redResult.calculated_score;
    
    // Breakdown'ı güncelle (backend'den gelen hesaplanmış değerler)
    updateBreakdownFromBackend("blue", blueResult.breakdown);
    updateBreakdownFromBackend("red", redResult.breakdown);
    
    showToast("Skorlar güncellendi", "success");
    
    // Maç listesini güncelle
    await loadMatchList();
    
  } catch (err) {
    console.error("Update score error:", err);
    showToast("Skor güncellenirken hata oluştu", "error");
  }
}

/**
 * Puanlama verilerini toplar (modüler sistem için)
 */
function collectScoringData(alliance) {
  return {
    // Otonom
    auto_leave_r1: qs(`${alliance}_auto_leave_r1`)?.checked || false,
    auto_leave_r2: qs(`${alliance}_auto_leave_r2`)?.checked || false,
    auto_bent1_own: parseInt(qs(`${alliance}_auto_bent1_own`)?.value || 0),
    auto_bent1_opponent: parseInt(qs(`${alliance}_auto_bent1_opponent`)?.value || 0),
    auto_bent2_correct: parseInt(qs(`${alliance}_auto_bent2_correct`)?.value || 0),
    auto_bent2_wrong: parseInt(qs(`${alliance}_auto_bent2_wrong`)?.value || 0),
    auto_bent2_opponent: parseInt(qs(`${alliance}_auto_bent2_opponent`)?.value || 0),
    auto_bent3_correct: parseInt(qs(`${alliance}_auto_bent3_correct`)?.value || 0),
    auto_bent3_wrong: parseInt(qs(`${alliance}_auto_bent3_wrong`)?.value || 0),
    auto_bent3_opponent: parseInt(qs(`${alliance}_auto_bent3_opponent`)?.value || 0),
    auto_tank_own: parseInt(qs(`${alliance}_auto_tank_own`)?.value || 0),
    auto_tank_opponent: parseInt(qs(`${alliance}_auto_tank_opponent`)?.value || 0),
    
    // Teleop
    teleop_bent1_own: parseInt(qs(`${alliance}_teleop_bent1_own`)?.value || 0),
    teleop_bent1_opponent: parseInt(qs(`${alliance}_teleop_bent1_opponent`)?.value || 0),
    teleop_bent2_correct: parseInt(qs(`${alliance}_teleop_bent2_correct`)?.value || 0),
    teleop_bent2_wrong: parseInt(qs(`${alliance}_teleop_bent2_wrong`)?.value || 0),
    teleop_bent2_opponent: parseInt(qs(`${alliance}_teleop_bent2_opponent`)?.value || 0),
    teleop_bent3_correct: parseInt(qs(`${alliance}_teleop_bent3_correct`)?.value || 0),
    teleop_bent3_wrong: parseInt(qs(`${alliance}_teleop_bent3_wrong`)?.value || 0),
    teleop_bent3_opponent: parseInt(qs(`${alliance}_teleop_bent3_opponent`)?.value || 0),
    teleop_tank_own: parseInt(qs(`${alliance}_teleop_tank_own`)?.value || 0),
    teleop_tank_opponent: parseInt(qs(`${alliance}_teleop_tank_opponent`)?.value || 0),
    teleop_source_entry: parseInt(qs(`${alliance}_teleop_source_entry`)?.value || 0),
    teleop_climb: parseInt(qs(`${alliance}_teleop_climb`)?.value || 0),
    
    // Cezalar
    yellow_card: parseInt(qs(`${alliance}_yellow_card`)?.value || 0),
    major_penalty: parseInt(qs(`${alliance}_major_penalty`)?.value || 0),
    red_card_r1: qs(`${alliance}_red_card_r1`)?.checked || false,
    red_card_r2: qs(`${alliance}_red_card_r2`)?.checked || false
  };
}

/**
 * Backend'den gelen breakdown'ı UI'a uygular
 */
function updateBreakdownFromBackend(alliance, breakdown) {
  // Bu fonksiyon backend'den gelen breakdown'ı kullanarak
  // UI'daki breakdown gösterimini güncelleyebilir
  // Şimdilik calculateScoreBreakdown() kullanılıyor, ama
  // backend hesaplamalarına güvenmek için bu fonksiyon kullanılabilir
  console.log(`${alliance} breakdown:`, breakdown);
}

/**
 * Skor günceller (eski basit sistem - geriye dönük uyumluluk için)
 */
async function updateScore(alliance) {
  if (!currentMatch) return;
  
  const scoreInput = qs(`${alliance}_score_input`);
  if (!scoreInput) return;
  
  const score = parseInt(scoreInput.value || 0);
  
  try {
    const payload = {
      match_id: currentMatch.id,
      [`${alliance}_score`]: score,
      match_source: currentMatch.source || "schedule"
    };
    
    await apiPost("/api/match-control/score", payload);
    
    currentMatch[`${alliance}_score`] = score;
    qs(`${alliance}_score_display`).textContent = score;
    showToast(`${alliance === "red" ? "Kırmızı" : "Mavi"} skor güncellendi`, "success");
    
    // Maç listesini güncelle (skorlar görünsün)
    await loadMatchList();
    
  } catch (err) {
    console.error("Update score error:", err);
    showToast("Skor güncellenirken hata oluştu", "error");
  }
}

// Global fonksiyon (HTML'den çağrılabilir)
window.updateScoreFromDetailedScoring = updateScoreFromDetailedScoring;

/**
 * Maç durumunu günceller
 */
async function updateMatchStatus() {
  if (!currentMatch) return;
  
  // Eğer maç tamamlandıysa, timer'ı durdur
  if (currentMatch.status === "completed") {
    stopMatchTimer();
    currentState = "completed";
    timeRemaining = 0;
    updateStateDisplay();
    return;
  }
  
  // Eğer maç aktif değilse, timer'ı durdur
  if (currentMatch.status !== "in_progress") {
    stopMatchTimer();
    return;
  }
  
  try {
    const data = await apiGet("/api/match-control/active");
    const activeSource = data.match?.match_source || data.match?.source || "schedule";
    if (data.match && data.match.id === currentMatch.id && activeSource === (currentMatch.source || "schedule")) {
      const newState = data.match.current_state || currentState;
      const newTimeRemaining = data.match.time_remaining || timeRemaining;
      
      // State değiştiyse timer'ı yeniden başlat
      if (newState !== currentState) {
        currentState = newState;
        timeRemaining = newTimeRemaining;
        // Timer'ı yeniden başlat (yeni state için)
        if (timeRemaining > 0) {
          startMatchTimer();
        }
      } else {
        // Sadece time_remaining'i güncelle (backend'den gelen gerçek değer)
        timeRemaining = newTimeRemaining;
      }
      
      updateStateDisplay();
    } else {
      // Maç artık aktif değil
      stopMatchTimer();
      currentMatch.status = "scheduled";
      renderMatchDisplay();
    }
  } catch (err) {
    console.error("Update match status error:", err);
  }
}

/**
 * Maç timer'ını başlatır
 */
function startMatchTimer() {
  stopMatchTimer();
  
  // Eğer süre yoksa timer başlatma
  if (timeRemaining <= 0) {
    return;
  }
  
  matchTimer = setInterval(() => {
    if (timeRemaining > 0) {
      timeRemaining--;
      updateStateDisplay();
    } else {
      // Süre doldu, otomatik olarak sonraki aşamaya geç
      if (currentState !== "post_match" && currentState !== "completed" && currentMatch && currentMatch.status === "in_progress") {
        // Backend'den güncel durumu kontrol et (otomatik geçiş backend'de yapılıyor olabilir)
        updateMatchStatus().then(() => {
          // Eğer hala aynı state'deyse ve süre dolmuşsa, manuel olarak sonraki state'e geç
          if (timeRemaining === 0 && currentState !== "post_match" && currentState !== "completed") {
            nextMatchState();
          }
        });
      } else {
        stopMatchTimer();
      }
    }
  }, NETWORK_CONSTANTS.TIMER_UPDATE_INTERVAL);
}

/**
 * Maç timer'ını durdurur
 */
function stopMatchTimer() {
  if (matchTimer) {
    clearInterval(matchTimer);
    matchTimer = null;
  }
}

/**
 * Durum görünümünü günceller
 */
function updateStateDisplay() {
  const stateLabel = qs("state_label");
  const stateTimer = qs("state_timer");
  const stateIndicator = qs("state_indicator");
  
  if (stateLabel) {
    stateLabel.textContent = MATCH_STATES[currentState]?.label || "Bilinmiyor";
  }
  
  if (stateTimer) {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const newContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    
    // Sadece içerik değiştiyse güncelle (gereksiz DOM manipülasyonunu önle)
    if (stateTimer.textContent !== newContent) {
      // requestAnimationFrame kullanarak daha smooth güncelleme
      requestAnimationFrame(() => {
        stateTimer.textContent = newContent;
      });
    }
  }
  
  // Kompakt timer güncelle
  const compactStateLabel = qs("compact_state_label");
  const compactTimer = qs("compact_timer");
  if (compactStateLabel) {
    compactStateLabel.textContent = MATCH_STATES[currentState]?.label || "Beklemede";
  }
  if (compactTimer) {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const newContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    if (compactTimer.textContent !== newContent) {
      requestAnimationFrame(() => {
        compactTimer.textContent = newContent;
      });
    }
  }
  
  if (stateIndicator) {
    const color = MATCH_STATES[currentState]?.color || "#666";
    stateIndicator.style.borderColor = color;
    stateIndicator.style.color = color;
  }
  
  // Kompakt header'a pulse efekti ekle
  const compactHeader = qs("compact_match_header");
  if (compactHeader) {
    if (currentState !== "idle" && currentState !== "completed" && currentState !== "post_match") {
      compactHeader.style.boxShadow = "0 2px 12px rgba(102, 126, 234, 0.4)";
    } else {
      compactHeader.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
    }
  }
}

/**
 * Önemli anları gösterir
 */
function showImportantMoment(state) {
  const messages = {
    autonomous: "Otonom süre başladı!",
    prepare_teleop: "Kontrol ünitelerinizi hazırlayınız!",
    driver_controlled: "Sürücü kontrollü süre başladı!",
    end_game: "Oyun sonu!",
    post_match: "Maç sonrası"
  };
  
  const message = messages[state];
  if (message) {
    showToast(message, "info", 3000);
  }
  if (state === "end_game") {
    playAlertTone();
  }
}

/**
 * Detaylı puanlama verilerini inputlara uygular
 */
function applyScoringData(scoringData) {
  resetScoringInputs();
  if (scoringData && typeof scoringData === "object") {
    applyScoringDataToInputs("blue", scoringData.blue || {});
    applyScoringDataToInputs("red", scoringData.red || {});
    applyTeamStatuses(scoringData.team_statuses || {});
  }
}

function applyScoringDataToInputs(alliance, data) {
  if (!data || typeof data !== "object") return;
  const numberFields = [
    "auto_bent1_own", "auto_bent1_opponent",
    "auto_bent2_correct", "auto_bent2_wrong", "auto_bent2_opponent",
    "auto_bent3_correct", "auto_bent3_wrong", "auto_bent3_opponent",
    "auto_tank_own", "auto_tank_opponent",
    "teleop_bent1_own", "teleop_bent1_opponent",
    "teleop_bent2_correct", "teleop_bent2_wrong", "teleop_bent2_opponent",
    "teleop_bent3_correct", "teleop_bent3_wrong", "teleop_bent3_opponent",
    "teleop_tank_own", "teleop_tank_opponent",
    "teleop_source_entry", "teleop_climb",
    "yellow_card", "major_penalty"
  ];
  const checkboxFields = ["auto_leave_r1", "auto_leave_r2", "red_card_r1", "red_card_r2"];
  numberFields.forEach((field) => {
    const input = qs(`${alliance}_${field}`);
    if (input) input.value = data[field] ?? 0;
  });
  checkboxFields.forEach((field) => {
    const input = qs(`${alliance}_${field}`);
    if (input) input.checked = !!data[field];
  });
}

function resetScoringInputs() {
  ["blue", "red"].forEach((alliance) => {
    applyScoringDataToInputs(alliance, {});
    const autoLeave1 = qs(`${alliance}_auto_leave_r1`);
    const autoLeave2 = qs(`${alliance}_auto_leave_r2`);
    const redCard1 = qs(`${alliance}_red_card_r1`);
    const redCard2 = qs(`${alliance}_red_card_r2`);
    if (autoLeave1) autoLeave1.checked = false;
    if (autoLeave2) autoLeave2.checked = false;
    if (redCard1) redCard1.checked = false;
    if (redCard2) redCard2.checked = false;
  });
}

function collectTeamStatuses() {
  const result = { red: {}, blue: {} };
  ["red", "blue"].forEach((alliance) => {
    document.querySelectorAll(`#${alliance}_team_statuses .team-status-item`).forEach((item) => {
      const teamId = item.dataset.team || "";
      const robotIndex = teamId.split("-")[1] || "1";
      const active = item.querySelector(".team-status-btn.active");
      result[alliance][`r${robotIndex}`] = active?.dataset.status || "ready";
    });
  });
  return result;
}

function applyTeamStatuses(statuses) {
  ["red", "blue"].forEach((alliance) => {
    document.querySelectorAll(`#${alliance}_team_statuses .team-status-item`).forEach((item) => {
      const teamId = item.dataset.team || "";
      const robotIndex = teamId.split("-")[1] || "1";
      const status = statuses?.[alliance]?.[`r${robotIndex}`] || "ready";
      // Sıfırla
      item.querySelectorAll(".team-status-btn").forEach((btn) => btn.classList.remove("active"));
      const statusSquare = document.querySelector(`.status-square[data-team="${teamId}"]`);
      if (statusSquare) {
        statusSquare.className = "status-square status-ready";
      }
      if (status !== "ready") {
        const btn = item.querySelector(`.team-status-btn[data-status="${status}"]`);
        if (btn) {
          toggleTeamStatus(alliance, teamId, status, btn);
        }
      }
    });
  });
}

/**
 * Sonuçları seyirci ekranına gönderir
 */
async function sendMatchResultsToScreens() {
  if (!currentMatch) return;
  try {
    const payload = buildMatchResultsPayloadForMatch(currentMatch);
    await apiPost("/api/screens/preview", {
      view: "match",
      mode: "preview",
      duration_seconds: 45,
      payload
    });
    showToast("Sonuçlar seyirci ekranına gönderildi", "success");
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
  calculateScoreBreakdown();
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

/**
 * Kısa uyarı tonu çalar (end game başlangıcı için)
 */
function playAlertTone() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
    oscillator.onended = () => {
      context.close().catch(() => {});
    };
  } catch (err) {
    console.error("Alert tone error:", err);
  }
}

/**
 * Yardımcı fonksiyonlar
 */
function getStatusLabel(status) {
  const labels = {
    scheduled: "Planlandı",
    in_progress: "Devam Ediyor",
    completed: "Tamamlandı",
    cancelled: "İptal"
  };
  return labels[status] || status;
}

function getMatchTypeLabel(type) {
  const labels = {
    practice: "Deneme",
    qualification: "Sıralama",
    elimination: "Eleme (Playoff)",
    final: "Final"
  };
  return labels[type] || type;
}

// Global fonksiyonlar (HTML'den çağrılabilir)
window.selectMatch = selectMatch;
