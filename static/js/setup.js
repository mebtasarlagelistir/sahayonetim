/**
 * Setup Sayfası Modülü
 * 
 * Setup sayfası yönetimi, adım yükleme, event listener'lar vb.
 */

// Setup adımları tanımları
const steps = [
  { id: "step-event", title: "Etkinlik Düzenle", status: "Not Started" },
  { id: "step-accounts", title: "Varsayılan Hesaplar", status: "Not Started" },
  { id: "step-teams", title: "Takım Ekle/Düzenle", status: "Not Started" },
  { id: "step-sponsors", title: "Sponsor Ekle/Düzenle", status: "Optional" },
  { id: "step-judging", title: "Jüri/İnceleme Takibi", status: "Optional" },
  { id: "step-inspection-schedule", title: "İnceleme Programı", status: "Not Started" },
  { id: "step-practice-matches", title: "Deneme Maçları", status: "Not Started" },
  { id: "step-match-schedule", title: "Sıralama Maç Takvimi", status: "Not Started" },
  { id: "step-wifi", title: "WiFi Kanal Atama", status: "Not Started" },
  { id: "step-pit-map", title: "Pit Haritası", status: "Optional" },
  { id: "step-awards", title: "Ödül Yönetimi", status: "Not Started" },
  { id: "step-advancement", title: "Yükselme Raporu", status: "Not Started" },
  { id: "step-send-results", title: "Sonuçları Gönder", status: "Not Started" },
  { id: "step-archive", title: "Arşiv İndir", status: "Not Started" },
];

/**
 * Adım içeriğini yükler
 * @param {string} step - Adım adı (event, teams, accounts, vb.)
 */
async function loadStep(step) {
  const contentContainer = qs("step-content");
  if (!contentContainer) return;
  
  try {
    const res = await fetch(`/api/setup/step/${step}`);
    if (!res.ok) {
      contentContainer.innerHTML = `<div class="card" style="padding: 32px; text-align: center; color: #f44336;">
        <p>Adım yüklenirken hata oluştu</p>
      </div>`;
      return;
    }
    
    const html = await res.text();
    contentContainer.innerHTML = html;
    
    // Adım yüklendikten sonra ilgili event listener'ları ve verileri yükle
    await initializeStep(step);
  } catch (err) {
    console.error("Load step error:", err);
    contentContainer.innerHTML = `<div class="card" style="padding: 32px; text-align: center; color: #f44336;">
      <p>Adım yüklenirken hata oluştu: ${err.message}</p>
    </div>`;
  }
}

/**
 * Adım yüklendikten sonra ilgili verileri ve event listener'ları başlatır
 * @param {string} step - Adım adı
 */
async function initializeStep(step) {
  switch (step) {
    case "event":
      if (typeof loadEvent === "function") await loadEvent();
      setupEventListeners();
      break;
    case "teams":
      if (typeof loadTeams === "function") await loadTeams();
      setupTeamsListeners();
      break;
    case "accounts":
      if (typeof loadUsers === "function") await loadUsers();
      setupAccountsListeners();
      break;
    case "inspection-schedule":
      if (typeof loadInspectionDurations === "function") await loadInspectionDurations();
      if (typeof loadInspectionSlots === "function") await loadInspectionSlots();
      setupInspectionListeners();
      // Grid görünümü için varsayılan tarihi ayarla
      if (qs("grid_view_date") && !qs("grid_view_date").value) {
        try {
          const event = await fetch("/api/event").then(r => r.ok ? r.json() : {}).catch(() => ({}));
          if (event.dates?.start) {
            qs("grid_view_date").value = event.dates.start;
          }
        } catch (err) {
          // Hata durumunda bugünün tarihini kullan
          const today = new Date().toISOString().split("T")[0];
          qs("grid_view_date").value = today;
        }
      }
      break;
    case "practice-matches":
      if (typeof loadPracticeSettings === "function") await loadPracticeSettings();
      if (typeof loadPracticeMatches === "function") await loadPracticeMatches();
      setupPracticeMatchesListeners();
      break;
    case "match-schedule":
      if (typeof loadMatchScheduleSettings === "function") await loadMatchScheduleSettings();
      if (typeof loadMatchSchedule === "function") await loadMatchSchedule();
      setupMatchScheduleListeners();
      break;
  }
}

/**
 * Event adımı için event listener'ları kurar
 */
function setupEventListeners() {
  if (qs("save-event")) {
    qs("save-event").addEventListener("click", saveEvent);
  }
  if (qs("auto_seconds")) {
    qs("auto_seconds").addEventListener("input", updateMatchCycle);
  }
  if (qs("teleop_seconds")) {
    qs("teleop_seconds").addEventListener("input", updateMatchCycle);
  }
  if (qs("endgame_seconds")) {
    qs("endgame_seconds").addEventListener("input", updateMatchCycle);
  }
  if (qs("add_custom")) {
    qs("add_custom").addEventListener("click", () => addCustomRow());
  }
  // Validasyon listener'ları
  if (qs("event_code")) {
    qs("event_code").addEventListener("input", (e) => {
      if (e.target.value.length > 4) {
        e.target.value = e.target.value.substring(0, 4);
        showToast("Etkinlik kodu en fazla 4 karakter olabilir", "warning");
      }
    });
  }
  if (qs("start_date") && qs("end_date")) {
    qs("start_date").addEventListener("change", () => {
      const startDate = qs("start_date").value;
      const endDate = qs("end_date").value;
      if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
        qs("end_date").classList.add("error");
        showToast("Bitiş tarihi başlangıç tarihinden önce olamaz", "warning");
      } else {
        qs("end_date").classList.remove("error");
      }
    });
    qs("end_date").addEventListener("change", () => {
      const startDate = qs("start_date").value;
      const endDate = qs("end_date").value;
      if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
        qs("end_date").classList.add("error");
        showToast("Bitiş tarihi başlangıç tarihinden önce olamaz", "warning");
      } else {
        qs("end_date").classList.remove("error");
      }
    });
  }
  if (qs("contact_email")) {
    qs("contact_email").addEventListener("blur", (e) => {
      const email = e.target.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        e.target.classList.add("error");
      } else {
        e.target.classList.remove("error");
      }
    });
  }
}

/**
 * Teams adımı için event listener'ları kurar
 */
function setupTeamsListeners() {
  if (qs("save-teams")) {
    qs("save-teams").addEventListener("click", saveTeams);
  }
  if (qs("add_team")) {
    qs("add_team").addEventListener("click", () => addTeamRow());
  }
  if (qs("seed_teams")) {
    qs("seed_teams").addEventListener("click", seedTeams);
  }
}

/**
 * Accounts adımı için event listener'ları kurar
 */
function setupAccountsListeners() {
  if (qs("add_user")) {
    qs("add_user").addEventListener("click", createUser);
  }
  if (qs("create_default_users")) {
    qs("create_default_users").addEventListener("click", createDefaultUsers);
  }
  if (qs("export_users")) {
    qs("export_users").addEventListener("click", exportUsers);
  }
  if (qs("print_users")) {
    qs("print_users").addEventListener("click", printUsers);
  }
  if (qs("delete_all_users")) {
    qs("delete_all_users").addEventListener("click", deleteAllUsers);
  }
}

/**
 * Practice matches adımı için event listener'ları kurar
 */
function setupPracticeMatchesListeners() {
  if (qs("generate_practice_matches")) {
    qs("generate_practice_matches").addEventListener("click", generatePracticeMatches);
  }
  if (qs("add_practice_match")) {
    qs("add_practice_match").addEventListener("click", createPracticeMatch);
  }
  if (qs("apply_practice_filters")) {
    qs("apply_practice_filters").addEventListener("click", loadPracticeMatches);
  }
  if (qs("clear_practice_filters")) {
    qs("clear_practice_filters").addEventListener("click", () => {
      if (qs("filter_practice_date")) qs("filter_practice_date").value = "";
      if (qs("filter_practice_field")) qs("filter_practice_field").value = "";
      loadPracticeMatches();
    });
  }
  if (qs("practice_stage_toggle")) {
    qs("practice_stage_toggle").addEventListener("click", async () => {
      const isActive = qs("practice_stage_toggle").dataset.active !== "false";
      setPracticeStageButton(!isActive);
      togglePracticeStageUI(!isActive);
      await savePracticeSettings();
    });
  }
  if (qs("add_field_btn")) {
    const btn = qs("add_field_btn");
    if (!btn.dataset.bound) {
      btn.addEventListener("click", addPracticeFieldName);
      btn.dataset.bound = "true";
    }
  }
  const fieldsContainer = qs("practice_fields_container");
  if (fieldsContainer) {
    fieldsContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-field-btn")) {
        removePracticeFieldName(e.target.closest(".field-input-group"));
      }
    });
  }
  const windowsContainer = qs("practice_time_windows");
  if (windowsContainer) {
    windowsContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-window-btn")) {
        e.target.closest(".time-window-group")?.remove();
      }
    });
  }
  if (qs("add_window_btn")) {
    const btn = qs("add_window_btn");
    if (!btn.dataset.bound) {
      btn.addEventListener("click", () => {
        const container = qs("practice_time_windows");
        if (!container) return;
        const group = document.createElement("div");
        group.className = "time-window-group";
        group.style.cssText = "display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px;";
        group.innerHTML = `
          <input type="date" class="practice-window-date" />
          <input type="time" class="practice-window-start" value="09:00" />
          <input type="time" class="practice-window-end" value="18:00" />
          <button type="button" class="btn-danger remove-window-btn" style="padding: 4px 8px; font-size: 12px;">Sil</button>
        `;
        container.appendChild(group);
      });
      btn.dataset.bound = "true";
    }
  }
  const breaksContainer = qs("practice_breaks");
  if (breaksContainer) {
    breaksContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-break-btn")) {
        e.target.closest(".break-group")?.remove();
      }
    });
  }
  if (qs("add_break_btn")) {
    const btn = qs("add_break_btn");
    if (!btn.dataset.bound) {
      btn.addEventListener("click", () => {
        const container = qs("practice_breaks");
        if (!container) return;
        const group = document.createElement("div");
        group.className = "break-group";
        group.style.cssText = "display: grid; grid-template-columns: 1fr 1fr 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px;";
        group.innerHTML = `
          <input type="date" class="practice-break-date" />
          <input type="text" class="practice-break-label" placeholder="Örn: Öğle" />
          <input type="time" class="practice-break-start" value="12:00" />
          <input type="time" class="practice-break-end" value="13:00" />
          <button type="button" class="btn-danger remove-break-btn" style="padding: 4px 8px; font-size: 12px;">Sil</button>
        `;
        container.appendChild(group);
      });
      btn.dataset.bound = "true";
    }
  }
  if (qs("save_practice_settings")) {
    qs("save_practice_settings").addEventListener("click", savePracticeSettings);
  }
  if (qs("preview_practice_schedule")) {
    qs("preview_practice_schedule").addEventListener("click", previewPracticeSchedule);
  }
  if (qs("apply_practice_bulk_update")) {
    qs("apply_practice_bulk_update").addEventListener("click", bulkUpdatePracticeMatches);
  }
  if (qs("practice_select_all")) {
    qs("practice_select_all").addEventListener("change", (e) => {
      const checked = e.target.checked;
      document.querySelectorAll(".practice-select").forEach((cb) => {
        cb.checked = checked;
      });
    });
  }
  if (qs("print_practice_schedule")) {
    qs("print_practice_schedule").addEventListener("click", printPracticeSchedule);
  }
  if (qs("practice_view_list")) {
    qs("practice_view_list").addEventListener("click", () => switchPracticeView("list"));
  }
  if (qs("practice_view_grid")) {
    qs("practice_view_grid").addEventListener("click", () => switchPracticeView("grid"));
  }
  if (qs("practice_grid_date")) {
    qs("practice_grid_date").addEventListener("change", renderPracticeGrid);
  }
  if (qs("practice_grid_start_time")) {
    qs("practice_grid_start_time").addEventListener("change", renderPracticeGrid);
  }
  if (qs("practice_grid_end_time")) {
    qs("practice_grid_end_time").addEventListener("change", renderPracticeGrid);
  }
  if (qs("practice_grid_slot_width")) {
    qs("practice_grid_slot_width").addEventListener("change", renderPracticeGrid);
  }
}

/**
 * Match schedule adımı için event listener'ları kurar
 */
function setupMatchScheduleListeners() {
  if (qs("generate_match_schedule")) {
    qs("generate_match_schedule").addEventListener("click", generateMatchSchedule);
  }
  if (qs("add_match_schedule")) {
    qs("add_match_schedule").addEventListener("click", createMatchSchedule);
  }
  if (qs("apply_match_filters")) {
    qs("apply_match_filters").addEventListener("click", loadMatchSchedule);
  }
  if (qs("clear_match_filters")) {
    qs("clear_match_filters").addEventListener("click", () => {
      if (qs("filter_match_date")) qs("filter_match_date").value = "";
      if (qs("filter_match_field")) qs("filter_match_field").value = "";
      loadMatchSchedule();
    });
  }
  if (qs("match_select_all")) {
    qs("match_select_all").addEventListener("change", (e) => {
      document.querySelectorAll(".match-select").forEach((cb) => {
        cb.checked = e.target.checked;
      });
    });
  }
  if (qs("apply_match_bulk_update")) {
    qs("apply_match_bulk_update").addEventListener("click", bulkUpdateMatchSchedule);
  }
  if (qs("print_match_schedule")) {
    qs("print_match_schedule").addEventListener("click", () => window.print());
  }
  if (qs("match_view_list")) {
    qs("match_view_list").addEventListener("click", () => setMatchView("list"));
  }
  if (qs("match_view_grid")) {
    qs("match_view_grid").addEventListener("click", () => setMatchView("grid"));
  }
  ["match_grid_date", "match_grid_start_time", "match_grid_end_time", "match_grid_slot_width"].forEach((id) => {
    const el = qs(id);
    if (el) {
      el.addEventListener("change", () => {
        if (qs("match_grid_view")?.style.display !== "none") {
          renderMatchGrid();
        }
      });
    }
  });
  if (qs("save_match_settings")) {
    qs("save_match_settings").addEventListener("click", saveMatchScheduleSettings);
  }
  if (qs("add_match_window_btn")) {
    const btn = qs("add_match_window_btn");
    if (!btn.dataset.bound) {
      btn.addEventListener("click", addMatchTimeWindow);
      btn.dataset.bound = "true";
    }
  }
  if (qs("add_match_break_btn")) {
    const btn = qs("add_match_break_btn");
    if (!btn.dataset.bound) {
      btn.addEventListener("click", addMatchBreak);
      btn.dataset.bound = "true";
    }
  }
  const windowsContainer = qs("match_time_windows");
  if (windowsContainer) {
    windowsContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-window-btn")) {
        e.target.closest(".time-window-group")?.remove();
      }
    });
  }
  const breaksContainer = qs("match_breaks");
  if (breaksContainer) {
    breaksContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-break-btn")) {
        e.target.closest(".break-group")?.remove();
      }
    });
  }
}

/**
 * Inspection schedule adımı için event listener'ları kurar
 */
function setupInspectionListeners() {
  if (qs("generate_inspection_slots")) {
    qs("generate_inspection_slots").addEventListener("click", generateInspectionSlots);
  }
  if (qs("delete_all_inspection_slots")) {
    qs("delete_all_inspection_slots").addEventListener("click", deleteAllInspectionSlots);
  }
  if (qs("add_inspection_slot")) {
    qs("add_inspection_slot").addEventListener("click", createInspectionSlot);
  }
  if (qs("new_inspection_type")) {
    qs("new_inspection_type").addEventListener("change", updateInspectionDuration);
  }
  if (qs("apply_inspection_filters")) {
    qs("apply_inspection_filters").addEventListener("click", loadInspectionSlots);
  }
  if (qs("clear_inspection_filters")) {
    qs("clear_inspection_filters").addEventListener("click", () => {
      if (qs("filter_inspection_team")) qs("filter_inspection_team").value = "";
      if (qs("filter_inspection_type")) qs("filter_inspection_type").value = "";
      if (qs("filter_inspection_date")) qs("filter_inspection_date").value = "";
      if (qs("filter_inspection_status")) qs("filter_inspection_status").value = "";
      loadInspectionSlots();
    });
  }
  if (qs("save_inspection_durations")) {
    qs("save_inspection_durations").addEventListener("click", saveInspectionDurations);
  }
  if (qs("view_list")) {
    qs("view_list").addEventListener("click", () => switchInspectionView("list"));
  }
  if (qs("view_grid")) {
    qs("view_grid").addEventListener("click", () => switchInspectionView("grid"));
  }
  if (qs("grid_view_date")) {
    qs("grid_view_date").addEventListener("change", renderInspectionGrid);
  }
  if (qs("grid_start_time")) {
    qs("grid_start_time").addEventListener("change", renderInspectionGrid);
  }
  if (qs("grid_end_time")) {
    qs("grid_end_time").addEventListener("change", renderInspectionGrid);
  }
  if (qs("grid_slot_width")) {
    qs("grid_slot_width").addEventListener("change", renderInspectionGrid);
  }
  // İstasyon yönetimi
  if (qs("add_station_btn")) {
    qs("add_station_btn").addEventListener("click", addInspectionStation);
  }
  // Mevcut istasyon silme butonları için event delegation
  const stationsContainer = qs("inspection_stations_container");
  if (stationsContainer) {
    stationsContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-station-btn")) {
        removeInspectionStation(e.target.closest(".station-input-group"));
      }
    });
  }
  // Yazdırma
  if (qs("print_inspection_schedule")) {
    qs("print_inspection_schedule").addEventListener("click", printInspectionSchedule);
  }
  // Toplu güncelleme
  if (qs("apply_inspection_bulk_update")) {
    qs("apply_inspection_bulk_update").addEventListener("click", bulkUpdateInspectionSlots);
  }
  if (qs("inspection_select_all")) {
    qs("inspection_select_all").addEventListener("change", (e) => {
      const checked = e.target.checked;
      document.querySelectorAll(".inspection-select").forEach((cb) => {
        cb.checked = checked;
      });
    });
  }
}

/**
 * Setup adımlarını sidebar'da render eder
 */
function renderSteps() {
  const list = qs("setup-steps");
  if (!list) return;
  list.innerHTML = "";
  steps.forEach((step, index) => {
    const li = document.createElement("li");
    li.className = "step-item";
    li.innerHTML = `
      <div>${index + 1}</div>
      <div>
        <a href="#${step.id}">${step.title}</a>
        <div class="step-meta">
          <span class="step-status" data-step="${step.id}">${step.status}</span>
          <span class="step-count is-hidden" data-count="${step.id}">0</span>
        </div>
      </div>
    `;
    list.appendChild(li);
  });
}

/**
 * Adım durumunu günceller
 * @param {string} stepId - Adım ID'si (step-event, step-teams, vb.)
 * @param {string} status - Durum (Done, Not Started, Optional)
 */
function setStepStatus(stepId, status) {
  const statusEl = document.querySelector(`[data-step="${stepId}"]`);
  if (statusEl) {
    statusEl.textContent = status;
    statusEl.className = `step-status ${status.toLowerCase().replace(" ", "-")}`;
  }
}

/**
 * Adım durumlarını etkinlik verilerine göre günceller
 * @param {Object} eventData - Etkinlik verisi
 */
function updateStepStatuses(eventData) {
  // Etkinlik durumu
  if (eventData.name && eventData.code) {
    setStepStatus("step-event", "Done");
  }
  
  // Takım durumu
  if (eventData.teams && eventData.teams.length > 0) {
    updateTeamStatus(eventData.teams.length);
  }
  
  // Diğer adımlar için durum güncellemeleri buraya eklenebilir
}

/**
 * Takım durumunu günceller
 * @param {number} count - Takım sayısı
 */
function updateTeamStatus(count) {
  const status = count > 0 ? "Done" : "Not Started";
  setStepStatus("step-teams", status);
  setStepCount("step-teams", count > 0 ? count : null);
}

/**
 * Adım sayısını günceller (badge için)
 * @param {string} stepId - Adım ID'si
 * @param {number|null} count - Sayı (null ise gizle)
 */
function setStepCount(stepId, count) {
  const countEl = document.querySelector(`[data-count="${stepId}"]`);
  if (countEl) {
    if (count !== null && count > 0) {
      countEl.textContent = count;
      countEl.classList.remove("is-hidden");
    } else {
      countEl.classList.add("is-hidden");
    }
  }
}

/**
 * Setup sayfasını başlatır (DOMContentLoaded event handler)
 */
async function initializeSetup() {
  renderSteps();
  if (typeof loadUserRole === "function") {
    await loadUserRole(); // Önce kullanıcı rolünü yükle
  }
  if (typeof loadEvents === "function") {
    await loadEvents();
  }
  
  // URL hash'inden veya varsayılan olarak 'event' adımını yükle
  const hash = window.location.hash.replace("#", "");
  let step = "event";
  if (hash) {
    // step- prefix'ini kaldır ve route formatına çevir
    const stepName = hash.replace("step-", "");
    const stepMap = {
      "event": "event",
      "teams": "teams",
      "accounts": "accounts",
      "sponsors": "sponsors",
      "judging": "judging",
      "inspection-schedule": "inspection-schedule",
      "practice-matches": "practice-matches",
      "match-schedule": "match-schedule",
      "wifi": "wifi",
      "pit-map": "pit-map",
      "awards": "awards",
      "advancement": "advancement",
      "send-results": "send-results",
      "archive": "archive",
    };
    step = stepMap[stepName] || "event";
  }
  await loadStep(step);
  
  // Sidebar'daki adım linklerine tıklama event listener'ı ekle
  document.addEventListener("click", async (e) => {
    if (e.target.closest("#setup-steps a")) {
      e.preventDefault();
      const href = e.target.closest("a").getAttribute("href");
      if (href && href.startsWith("#")) {
        const stepId = href.substring(1);
        // step- prefix'ini kaldır
        const stepName = stepId.replace("step-", "");
        // Adım adını route formatına çevir
        const stepMap = {
          "event": "event",
          "teams": "teams",
          "accounts": "accounts",
          "sponsors": "sponsors",
          "judging": "judging",
          "inspection-schedule": "inspection-schedule",
          "practice-matches": "practice-matches",
          "match-schedule": "match-schedule",
          "wifi": "wifi",
          "pit-map": "pit-map",
          "awards": "awards",
          "advancement": "advancement",
          "send-results": "send-results",
          "archive": "archive",
        };
        const routeStep = stepMap[stepName] || stepName;
        window.location.hash = `#${stepId}`;
        await loadStep(routeStep);
      }
    }
  });
  
  // Hash değişikliklerini dinle
  window.addEventListener("hashchange", async () => {
    const hash = window.location.hash.replace("#", "");
    if (hash) {
      const stepName = hash.replace("step-", "");
      const stepMap = {
        "event": "event",
        "teams": "teams",
        "accounts": "accounts",
        "sponsors": "sponsors",
        "judging": "judging",
        "inspection-schedule": "inspection-schedule",
        "match-schedule": "match-schedule",
        "wifi": "wifi",
        "pit-map": "pit-map",
        "awards": "awards",
        "advancement": "advancement",
        "send-results": "send-results",
        "archive": "archive",
      };
      const routeStep = stepMap[stepName] || stepName;
      await loadStep(routeStep);
    }
  });
  
  if (typeof loadUsers === "function") {
    await loadUsers();
  }

  if (typeof ensureUserActionsUI === "function") {
    ensureUserActionsUI();
  }
  
  // Event selector listener
  const eventSelector = qs("event_selector");
  if (eventSelector) {
    eventSelector.addEventListener("change", async (event) => {
      const eventId = Number(event.target.value);
      if (eventId) {
        try {
          const res = await fetch("/api/events/active", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: eventId }),
          });
          if (res.ok) {
            if (typeof loadEvent === "function") await loadEvent();
            if (typeof loadTeams === "function") await loadTeams();
            if (typeof loadUsers === "function") await loadUsers();
          } else {
            showToast("Etkinlik değiştirilemedi", "error");
          }
        } catch (err) {
          console.error("Change event error:", err);
          showToast("Etkinlik değiştirilirken hata oluştu", "error");
        }
      }
    });
  }
  
  // New event button
  const newEventBtn = qs("new_event");
  if (newEventBtn) {
    newEventBtn.addEventListener("click", async () => {
      const name = window.prompt("Etkinlik adı", "Yeni Etkinlik");
      if (!name) return;
      try {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (res.ok) {
          showToast("Yeni etkinlik oluşturuldu", "success");
          if (typeof loadEvents === "function") await loadEvents();
          if (typeof loadEvent === "function") await loadEvent();
          if (typeof loadTeams === "function") await loadTeams();
          if (typeof loadUsers === "function") await loadUsers();
        } else {
          const error = await res.json().catch(() => ({ error: "Bilinmeyen hata" }));
          showToast(`Etkinlik oluşturulamadı: ${error.error || res.statusText}`, "error");
        }
      } catch (err) {
        showToast(`Hata: ${err.message}`, "error");
      }
    });
  }
  
  // Delete event button
  const deleteEventBtn = qs("delete_event");
  if (deleteEventBtn) {
    deleteEventBtn.addEventListener("click", async () => {
      const selector = qs("event_selector");
      const eventId = Number(selector?.value);
      if (!eventId) {
        showToast("Silinecek etkinlik seçilmedi", "warning");
        return;
      }
      
      const eventName = selector.options[selector.selectedIndex]?.textContent || "Etkinlik";
      const confirmed = window.confirm(
        `"${eventName}" etkinliğini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz ve tüm takımlar silinecektir.`
      );
      if (!confirmed) return;
      
      try {
        const res = await fetch(`/api/events/${eventId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          showToast("Etkinlik başarıyla silindi", "success");
          if (typeof loadEvents === "function") await loadEvents();
          if (typeof loadEvent === "function") await loadEvent();
          if (typeof loadTeams === "function") await loadTeams();
          if (typeof loadUsers === "function") await loadUsers();
        } else {
          const error = await res.json().catch(() => ({ error: "Bilinmeyen hata" }));
          showToast(`Silme başarısız: ${error.error || res.statusText}`, "error");
        }
      } catch (err) {
        console.error("Delete event error:", err);
        showToast(`Hata: ${err.message}`, "error");
      }
    });
  }
}

/**
 * Kullanıcı aksiyon butonlarını UI'a ekler (eğer yoksa)
 */
function ensureUserActionsUI() {
  const actions = document.querySelector("#step-accounts .actions-row");
  if (actions && !qs("print_users")) {
    const printButton = document.createElement("button");
    printButton.id = "print_users";
    printButton.textContent = "Listeyi Yazdır";
    actions.appendChild(printButton);
    printButton.addEventListener("click", printUsers);
  }
  if (actions && !qs("delete_all_users")) {
    const deleteButton = document.createElement("button");
    deleteButton.id = "delete_all_users";
    deleteButton.className = "danger";
    deleteButton.textContent = "Tüm Kullanıcıları Sil";
    actions.appendChild(deleteButton);
    deleteButton.addEventListener("click", deleteAllUsers);
  }

  const headerRow = document.querySelector("#users_table thead tr");
  if (headerRow && headerRow.children.length < 5) {
    const th = document.createElement("th");
    th.textContent = "";
    headerRow.appendChild(th);
  }
}
