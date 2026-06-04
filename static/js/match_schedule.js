/**
 * Resmi Maç Takvimi Yönetimi Modülü
 *
 * Resmi maç takvimi CRUD işlemleri ve otomatik planlama.
 */

/**
 * Etkinlik ayarlarından resmi maç varsayılanlarını yükler.
 */
async function loadMatchScheduleSettings() {
  try {
    const [event, settings] = await Promise.all([
      apiGet("/api/event"),
      apiGet("/api/match-settings").catch(() => ({}))
    ]);
    const format = event.format || {};
    const schedule = event.schedule || {};

    const fieldCount = Number(format.fields || 1);
    const teamsPerAlliance = Number(format.teams_per_alliance || 2);
    const matchCycleSeconds = Number(schedule.match_cycle_seconds || 150);
    const matchCycleMinutes = Math.max(1, Math.round(matchCycleSeconds / 60));

    if (qs("match_field_count")) qs("match_field_count").value = fieldCount;
    if (qs("match_teams_per_alliance")) qs("match_teams_per_alliance").value = teamsPerAlliance;
    if (qs("match_cycle_minutes")) qs("match_cycle_minutes").value = matchCycleMinutes;

    // Varsayılan başlangıç tarihi/saati
    updateMatchFieldOptions(fieldCount);
    setMatchStageButtons(settings.stage_active !== false);
    toggleMatchStageUI(settings.stage_active !== false);
    populateMatchTimeWindows(settings.time_windows || [], event.dates?.start || "");
    populateMatchBreaks(settings.breaks || [], event.dates?.start || "");
    renderMatchBreaksList(settings.breaks || []);
    updateMatchGridDefaults(event.dates?.start || "", settings.time_windows || []);
    if (qs("match_grid_view")?.style.display !== "none") {
      await renderMatchGrid();
    }
  } catch (err) {
    console.error("Load match schedule settings error:", err);
  }
}

function updateMatchFieldOptions(fieldCount) {
  const filter = qs("filter_match_field");
  const bulk = qs("bulk_match_field");
  if (filter) {
    filter.innerHTML = `<option value="">Tümü</option>`;
    for (let i = 0; i < fieldCount; i++) {
      const opt = document.createElement("option");
      opt.value = String(i + 1);
      opt.textContent = `Saha ${i + 1}`;
      filter.appendChild(opt);
    }
  }
  if (bulk) {
    bulk.innerHTML = `<option value="">Değiştirme</option>`;
    for (let i = 0; i < fieldCount; i++) {
      const opt = document.createElement("option");
      opt.value = String(i + 1);
      opt.textContent = `Saha ${i + 1}`;
      bulk.appendChild(opt);
    }
  }
}

/**
 * Resmi maçları yükler ve tabloya ekler.
 */
async function loadMatchSchedule() {
  try {
    const date = qs("filter_match_date")?.value || "";
    const field = qs("filter_match_field")?.value || "";

    const params = {};
    if (date) params.date = date;
    if (field) params.field = field;

    const matches = await apiGet("/api/match-schedule", params);
    const table = qs("match_schedule_table");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    matches.forEach((match) => {
      const tr = document.createElement("tr");
      const redTeams = match.red_alliance || [];
      const blueTeams = match.blue_alliance || [];
      const surrogateTeams = match.surrogate_teams || [];
      const redDisplay = redTeams
        .map((t) => `${escapeHtml(t)}${surrogateTeams.includes(t) ? " (S)" : ""}`)
        .join(", ");
      const blueDisplay = blueTeams
        .map((t) => `${escapeHtml(t)}${surrogateTeams.includes(t) ? " (S)" : ""}`)
        .join(", ");

      tr.innerHTML = `
        <td class="no-print"><input type="checkbox" class="match-select" data-match-id="${match.id}" /></td>
        <td>${escapeHtml(String(match.match_number || ""))}</td>
        <td>${escapeHtml(match.match_date)}</td>
        <td>${escapeHtml(match.match_time)}</td>
        <td>${escapeHtml(`Saha ${match.field_number}`)}</td>
        <td>${redDisplay}</td>
        <td>${blueDisplay}</td>
        <td class="no-print">
          <button class="btn-danger" data-match-id="${match.id}">Sil</button>
        </td>
      `;

      tr.querySelector("button").addEventListener("click", async () => {
        if (confirm("Bu maçı silmek istediğinize emin misiniz?")) {
          await deleteMatchSchedule(match.id);
        }
      });

      tbody.appendChild(tr);
    });

    if (typeof setStepStatus === "function") {
      setStepStatus("step-match-schedule", matches.length > 0 ? "Done" : "Not Started");
      if (typeof setStepCount === "function") {
        setStepCount("step-match-schedule", matches.length > 0 ? matches.length : null);
      }
    }

    if (qs("match_grid_view")?.style.display !== "none") {
      await renderMatchGrid();
    }
  } catch (err) {
    console.error("Load match schedule error:", err);
    showToast("Maç takvimi yüklenirken hata oluştu", "error");
  }
}

/**
 * Otomatik resmi maç takvimi oluşturur.
 */
async function generateMatchSchedule() {
  const btn = qs("generate_match_schedule");
  try {
    setButtonLoading(btn, true);
    let startDate = "";
    let startTime = "";
    const windows = collectMatchTimeWindows();
    if (windows.length) {
      startDate = windows[0].date || "";
      startTime = windows[0].start_time || "";
    }
    const payload = {
      start_date: startDate,
      start_time: startTime,
      algorithm: qs("match_algorithm")?.value || "balanced",
      field_count: Number(qs("match_field_count")?.value || 1),
      teams_per_alliance: Number(qs("match_teams_per_alliance")?.value || 2),
      match_cycle_minutes: Number(qs("match_cycle_minutes")?.value || 3),
      matches_per_team: Number(qs("match_matches_per_team")?.value || 0) || null,
      num_matches: Number(qs("match_num_matches")?.value || 0) || null,
      clear_existing: qs("match_clear_existing")?.checked || false,
      time_windows: windows,
      breaks: collectMatchBreaks(),
    };

    if (!payload.start_date || !payload.start_time) {
      showToast("Lütfen en az bir maç saat aralığı girin", "warning");
      return;
    }

    const data = await apiPost("/api/match-schedule/generate", payload);
    showToast(`Oluşturulan maç sayısı: ${data.created_count}`, "success");
    await loadMatchSchedule();
    // Adım durumunu güncelle
    if (typeof checkAllStepStatuses === "function") {
      await checkAllStepStatuses();
    }
  } catch (err) {
    console.error("Generate match schedule error:", err);
    showToast("Otomatik takvim oluşturulamadı", "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

/**
 * Manuel resmi maç oluşturur.
 */
async function createMatchSchedule() {
  try {
    const matchNumberRaw = qs("new_match_number")?.value;
    const payload = {
      match_number: matchNumberRaw ? Number(matchNumberRaw) : null,
      field_number: Number(qs("new_match_field")?.value || 1),
      match_date: qs("new_match_date")?.value || "",
      match_time: qs("new_match_time")?.value || "",
      red_alliance: parseTeamList(qs("new_match_red")?.value || ""),
      blue_alliance: parseTeamList(qs("new_match_blue")?.value || ""),
    };

    if (!payload.match_date || !payload.match_time) {
      showToast("Tarih ve saat gerekli", "warning");
      return;
    }
    if (!payload.red_alliance.length || !payload.blue_alliance.length) {
      showToast("Her iki ittifak için takım girin", "warning");
      return;
    }

    await apiPost("/api/match-schedule", payload);
    showToast("Maç eklendi", "success");
    await loadMatchSchedule();
  } catch (err) {
    console.error("Create match schedule error:", err);
    showToast("Maç eklenemedi", "error");
  }
}

async function deleteMatchSchedule(matchId) {
  try {
    await apiDelete(`/api/match-schedule/${matchId}`);
    showToast("Maç silindi", "success");
    await loadMatchSchedule();
  } catch (err) {
    console.error("Delete match schedule error:", err);
    showToast("Maç silinemedi", "error");
  }
}

async function bulkUpdateMatchSchedule() {
  try {
    const ids = Array.from(document.querySelectorAll(".match-select:checked")).map((cb) =>
      Number(cb.dataset.matchId)
    );
    if (!ids.length) {
      showToast("Güncellenecek maç seçilmedi", "warning");
      return;
    }

    const payload = {
      match_ids: ids,
      match_date: qs("bulk_match_date")?.value || "",
      match_time: qs("bulk_match_time")?.value || "",
      field_number: qs("bulk_match_field")?.value || "",
    };

    const data = await apiPost("/api/match-schedule/bulk-update", payload);
    showToast(`Güncellenen maç sayısı: ${data.updated_count}`, "success");
    await loadMatchSchedule();
  } catch (err) {
    console.error("Bulk update match schedule error:", err);
    showToast("Toplu güncelleme başarısız", "error");
  }
}

function parseTeamList(rawValue) {
  return rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function setMatchStageButtons(active) {
  const container = qs("match_stage_controls");
  const activateBtn = qs("match_stage_activate");
  const deactivateBtn = qs("match_stage_deactivate");
  if (!container || !activateBtn || !deactivateBtn) return;
  container.dataset.active = active ? "true" : "false";
  activateBtn.classList.toggle("active", active);
  deactivateBtn.classList.toggle("active", !active);
  activateBtn.style.backgroundColor = active ? "#2e7d32" : "";
  activateBtn.style.color = active ? "#fff" : "";
  activateBtn.style.border = active ? "none" : "";
  deactivateBtn.style.backgroundColor = !active ? "#c62828" : "";
  deactivateBtn.style.color = !active ? "#fff" : "";
  deactivateBtn.style.border = !active ? "none" : "";
}

function getMatchStageActive() {
  const container = qs("match_stage_controls");
  if (!container) return true;
  return container.dataset.active !== "false";
}

function toggleMatchStageUI(active) {
  const container = qs("step-match-schedule");
  if (!container) return;
  const inputs = container.querySelectorAll("input, select, button, textarea");
  inputs.forEach((el) => {
    if (el.id === "match_stage_activate") return;
    if (el.id === "match_stage_deactivate") return;
    if (el.id === "save_match_settings") return;
    if (el.id === "match_view_list") return;
    if (el.id === "match_view_grid") return;
    if (el.id === "match_grid_date") return;
    if (el.id === "match_grid_start_time") return;
    if (el.id === "match_grid_end_time") return;
    if (el.id === "match_grid_slot_width") return;
    el.disabled = !active;
  });
  if (!active) {
    showToast("Sıralama maçları aşaması pasif", "warning");
  }
}

function setMatchView(mode) {
  const listView = qs("match_list_view");
  const gridView = qs("match_grid_view");
  const listBtn = qs("match_view_list");
  const gridBtn = qs("match_view_grid");

  if (mode === "grid") {
    if (listView) listView.style.display = "none";
    if (gridView) gridView.style.display = "block";
    listBtn?.classList.remove("active");
    gridBtn?.classList.add("active");
    // Grid tarihi boşsa, ilk saat aralığından veya bugünden set et
    const gridDate = qs("match_grid_date");
    if (gridDate && !gridDate.value) {
      const windows = collectMatchTimeWindows();
      if (windows.length && windows[0].date) {
        gridDate.value = windows[0].date;
      } else {
        gridDate.value = new Date().toISOString().split("T")[0];
      }
    }
    renderMatchGrid();
  } else {
    if (gridView) gridView.style.display = "none";
    if (listView) listView.style.display = "block";
    listBtn?.classList.add("active");
    gridBtn?.classList.remove("active");
  }
}

async function saveMatchScheduleSettings() {
  const btn = qs("save_match_settings");
  try {
    setButtonLoading(btn, true);
    const payload = {
      time_windows: collectMatchTimeWindows(),
      breaks: collectMatchBreaks(),
      stage_active: getMatchStageActive(),
    };
    await apiPost("/api/match-settings", payload);
    showToast("Ayarlar kaydedildi", "success");
    renderMatchBreaksList(payload.breaks);
    updateMatchGridDefaults("", payload.time_windows);
    // Adım durumunu güncelle
    if (typeof checkAllStepStatuses === "function") {
      await checkAllStepStatuses();
    }
  } catch (err) {
    console.error("Save match settings error:", err);
    showToast("Ayarlar kaydedilemedi", "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

function addMatchTimeWindow() {
  const container = qs("match_time_windows");
  if (!container) return;
  const group = document.createElement("div");
  group.className = "time-window-group";
  group.style.cssText =
    "display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px;";
  group.innerHTML = `
    <input type="date" class="match-window-date" />
    <input type="time" class="match-window-start" value="09:00" />
    <input type="time" class="match-window-end" value="18:00" />
    <button type="button" class="btn-danger remove-window-btn" style="padding: 4px 8px; font-size: 12px;">Sil</button>
  `;
  container.appendChild(group);
}

function addMatchBreak() {
  const container = qs("match_breaks");
  if (!container) return;
  const defaultDate = getFirstMatchWindowDate();
  const group = document.createElement("div");
  group.className = "break-group";
  group.style.cssText =
    "display: grid; grid-template-columns: 1fr 1fr 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px;";
  group.innerHTML = `
    <input type="date" class="match-break-date" value="${defaultDate}" />
    <input type="text" class="match-break-label" placeholder="Örn: Öğle" />
    <input type="time" class="match-break-start" value="12:00" />
    <input type="time" class="match-break-end" value="13:00" />
    <button type="button" class="btn-danger remove-break-btn" style="padding: 4px 8px; font-size: 12px;">Sil</button>
  `;
  container.appendChild(group);
}

function collectMatchTimeWindows() {
  const windows = [];
  document.querySelectorAll("#match_time_windows .time-window-group").forEach((group) => {
    const date = group.querySelector(".match-window-date")?.value || "";
    const start = group.querySelector(".match-window-start")?.value || "";
    const end = group.querySelector(".match-window-end")?.value || "";
    if (date && start && end) {
      windows.push({ date, start_time: start, end_time: end });
    }
  });
  return windows;
}

function collectMatchBreaks() {
  const breaks = [];
  const fallbackDate = getFirstMatchWindowDate();
  document.querySelectorAll("#match_breaks .break-group").forEach((group) => {
    const date = group.querySelector(".match-break-date")?.value || fallbackDate;
    const label = group.querySelector(".match-break-label")?.value || "";
    const start = group.querySelector(".match-break-start")?.value || "";
    const end = group.querySelector(".match-break-end")?.value || "";
    if (date && start && end) {
      breaks.push({ date, label, start_time: start, end_time: end });
    }
  });
  return breaks;
}

/**
 * İlk zaman penceresinin tarihini döndürür (mola için varsayılan).
 * @returns {string} Tarih (YYYY-MM-DD) veya boş string
 */
function getFirstMatchWindowDate() {
  const firstWindow = document.querySelector("#match_time_windows .time-window-group");
  if (!firstWindow) return "";
  return firstWindow.querySelector(".match-window-date")?.value || "";
}

function populateMatchTimeWindows(windows, defaultDate) {
  const container = qs("match_time_windows");
  if (!container) return;
  container.innerHTML = "";
  const items = windows.length ? windows : [{}];
  items.forEach((item) => {
    const group = document.createElement("div");
    group.className = "time-window-group";
    group.style.cssText =
      "display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px;";
    group.innerHTML = `
      <input type="date" class="match-window-date" value="${escapeHtml(item.date || defaultDate || "")}" />
      <input type="time" class="match-window-start" value="${escapeHtml(item.start_time || "09:00")}" />
      <input type="time" class="match-window-end" value="${escapeHtml(item.end_time || "18:00")}" />
      <button type="button" class="btn-danger remove-window-btn" style="padding: 4px 8px; font-size: 12px;">Sil</button>
    `;
    container.appendChild(group);
  });
}

function populateMatchBreaks(breaks, defaultDate) {
  const container = qs("match_breaks");
  if (!container) return;
  container.innerHTML = "";
  const items = breaks.length ? breaks : [{}];
  items.forEach((item) => {
    const group = document.createElement("div");
    group.className = "break-group";
    group.style.cssText =
      "display: grid; grid-template-columns: 1fr 1fr 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px;";
    group.innerHTML = `
      <input type="date" class="match-break-date" value="${escapeHtml(item.date || defaultDate || "")}" />
      <input type="text" class="match-break-label" value="${escapeHtml(item.label || "")}" placeholder="Örn: Öğle" />
      <input type="time" class="match-break-start" value="${escapeHtml(item.start_time || "12:00")}" />
      <input type="time" class="match-break-end" value="${escapeHtml(item.end_time || "13:00")}" />
      <button type="button" class="btn-danger remove-break-btn" style="padding: 4px 8px; font-size: 12px;">Sil</button>
    `;
    container.appendChild(group);
  });
}

function renderMatchBreaksList(breaks) {
  const container = qs("match_breaks_list");
  if (!container) return;
  if (!breaks || breaks.length === 0) {
    container.textContent = "Mola tanımı yok.";
    return;
  }
  const sorted = [...breaks].sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
  container.innerHTML = sorted
    .map((item) => {
      const label = item.label ? ` (${escapeHtml(item.label)})` : "";
      return `<div>${escapeHtml(item.date)} ${escapeHtml(item.start_time)} - ${escapeHtml(item.end_time)}${label}</div>`;
    })
    .join("");
}

function updateMatchGridDefaults(defaultDate, timeWindows) {
  if (qs("match_grid_date") && !qs("match_grid_date").value) {
    qs("match_grid_date").value = defaultDate || "";
  }
  if (timeWindows && timeWindows.length) {
    const first = timeWindows[0];
    if (qs("match_grid_start_time")) {
      qs("match_grid_start_time").value = first.start_time || "09:00";
    }
    if (qs("match_grid_end_time")) {
      qs("match_grid_end_time").value = first.end_time || "18:00";
    }
  }
}

async function renderMatchGrid(allowFallback = true) {
  const gridContainer = qs("match_schedule_grid");
  if (!gridContainer) return;

  const selectedDateRaw = qs("match_grid_date")?.value;
  const selectedDate = normalizeGridDate(selectedDateRaw);
  if (!selectedDate) return;
  if (qs("match_grid_date") && qs("match_grid_date").value !== selectedDate) {
    qs("match_grid_date").value = selectedDate;
  }

  try {
    const matches = await apiGet("/api/match-schedule", { date: selectedDate });
    if (!matches.length) {
      if (allowFallback) {
        try {
          const allMatches = await apiGet("/api/match-schedule");
          const firstDate = allMatches?.[0]?.match_date;
          if (firstDate && firstDate !== selectedDate && qs("match_grid_date")) {
            qs("match_grid_date").value = firstDate;
            await renderMatchGrid(false);
            return;
          }
        } catch (err) {
          console.error("Match grid fallback error:", err);
        }
      }
      gridContainer.textContent = "Seçilen tarih için maç bulunamadı.";
      return;
    }

    const fieldCount = Number(qs("match_field_count")?.value || 1);
    const startTime = qs("match_grid_start_time")?.value || "09:00";
    const endTime = qs("match_grid_end_time")?.value || "18:00";
    const slotWidth = Number(qs("match_grid_slot_width")?.value || 10);
    const matchCycleMinutes = Number(qs("match_cycle_minutes")?.value || 10);

    const timeSlots = [];
    const [startHour, startMin] = startTime.split(":").map(Number);
    const [endHour, endMin] = endTime.split(":").map(Number);
    let currentTime = new Date(2000, 0, 1, startHour, startMin);
    const endDateTime = new Date(2000, 0, 1, endHour, endMin);
    while (currentTime <= endDateTime) {
      const timeStr = `${String(currentTime.getHours()).padStart(2, "0")}:${String(currentTime.getMinutes()).padStart(2, "0")}`;
      timeSlots.push(timeStr);
      currentTime = new Date(currentTime.getTime() + slotWidth * 60000);
    }

    let html = `<table style="width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed;">
      <thead><tr>
        <th style="position: sticky; left: 0; background: #f5f6fa; z-index: 5; padding: 6px; border: 1px solid #e1e4ee; width: 80px; text-align: left;">Saha</th>`;

    timeSlots.forEach((t) => {
      html += `<th style="padding: 6px; border: 1px solid #e1e4ee; width: 60px; text-align: center; background: #f5f6fa; font-size: 10px;">${t}</th>`;
    });
    html += `</tr></thead><tbody>`;

    for (let field = 1; field <= fieldCount; field += 1) {
      html += `<tr data-field-number="${field}">`;
      html += `<td style="position: sticky; left: 0; background: #ffffff; z-index: 4; padding: 6px; border: 1px solid #e1e4ee; font-weight: 600; width: 80px; font-size: 11px;">Saha ${field}</td>`;

      let lastMatchEnd = -1;
      timeSlots.forEach((timeSlot) => {
        const [h, m] = timeSlot.split(":").map(Number);
        const startMinutes = h * 60 + m;
        if (startMinutes < lastMatchEnd) return;
        lastMatchEnd = -1;

        const match = matches.find((mt) => {
          const mtField = Number(mt.field_number);
          if (!Number.isFinite(mtField) || mtField !== field) return false;
          const parts = String(mt.match_time || "").split(":");
          if (parts.length < 2) return false;
          const mh = Number(parts[0]);
          const mm = Number(parts[1]);
          if (!Number.isFinite(mh) || !Number.isFinite(mm)) return false;
          const mtStart = mh * 60 + mm;
          return mtStart >= startMinutes && mtStart < startMinutes + slotWidth;
        });

        if (match) {
          const [mh, mm] = match.match_time.split(":").map(Number);
          const mtStart = mh * 60 + mm;
          const mtEnd = mtStart + matchCycleMinutes;
          const colspan = Math.max(1, Math.ceil(matchCycleMinutes / slotWidth));
          lastMatchEnd = mtEnd;
          const surrogateTeams = match.surrogate_teams || [];
          const redTeams = (match.red_alliance || [])
            .map((t) => `${t}${surrogateTeams.includes(t) ? " (S)" : ""}`)
            .join(", ");
          const blueTeams = (match.blue_alliance || [])
            .map((t) => `${t}${surrogateTeams.includes(t) ? " (S)" : ""}`)
            .join(", ");
          const matchLabel = escapeHtml(String(match.match_number || ""));
          html += `<td style="padding: 2px 4px; border: 1px solid #e1e4ee; background: #2D5AF0; color: white; text-align: center; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
            colspan="${colspan}"
            title="${matchLabel} • ${escapeHtml(redTeams)} / ${escapeHtml(blueTeams)}">
            ${matchLabel} • ${escapeHtml(redTeams)} / ${escapeHtml(blueTeams)}
          </td>`;
        } else {
          html += `<td style="padding: 2px; border: 1px solid #e1e4ee; background: #ffffff;"></td>`;
        }
      });
      html += `</tr>`;
    }

    html += `</tbody></table>`;
    gridContainer.innerHTML = html;
  } catch (err) {
    console.error("Render match grid error:", err);
    gridContainer.textContent = "Maç takvimi yüklenemedi.";
  }
}

function normalizeGridDate(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (trimmed.includes("-")) {
    const parts = trimmed.split("-");
    if (parts.length === 3) {
      const [y, m, d] = parts.map((p) => p.trim());
      if (y && m && d) {
        return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
    }
    return trimmed;
  }
  if (trimmed.includes("/")) {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [p1, p2, p3] = parts.map((p) => p.trim());
      if (p1 && p2 && p3) {
        // TR format: DD/MM/YYYY
        return `${p3.padStart(4, "0")}-${p2.padStart(2, "0")}-${p1.padStart(2, "0")}`;
      }
    }
  }
  if (trimmed.includes(".")) {
    const parts = value.split(".");
    if (parts.length === 3) {
      const [p1, p2, p3] = parts.map((p) => p.trim());
      if (p1 && p2 && p3) {
        // TR format with dots: DD.MM.YYYY
        return `${p3.padStart(4, "0")}-${p2.padStart(2, "0")}-${p1.padStart(2, "0")}`;
      }
    }
  }
  return trimmed;
}

/**
 * Final maçlarını otomatik oluşturur (SP puanlarına göre).
 */
async function generateFinalMatches() {
  const btn = qs("generate_final_matches");
  try {
    setButtonLoading(btn, true);
    
    const startDate = qs("final_start_date")?.value || "";
    const startTime = qs("final_start_time")?.value || "";
    const fieldNumber = Number(qs("final_field_number")?.value || 1);
    const teamsPerAlliance = Number(qs("final_teams_per_alliance")?.value || 2);
    const maxTeams = qs("final_max_teams")?.value ? Number(qs("final_max_teams").value) : null;
    const cycleMinutes = Number(qs("final_cycle_minutes")?.value || 5);
    const clearExisting = qs("final_clear_existing")?.checked || false;
    
    if (!startDate || !startTime) {
      showToast("Lütfen başlangıç tarihi ve saati girin", "warning");
      return;
    }
    
    const payload = {
      start_date: startDate,
      start_time: startTime,
      field_number: fieldNumber,
      teams_per_alliance: teamsPerAlliance,
      match_cycle_minutes: cycleMinutes,
      clear_existing: clearExisting
    };
    
    if (maxTeams) {
      payload.max_teams = maxTeams;
    }
    
    const data = await apiPost("/api/match-schedule/generate-finals", payload);
    
    if (data.ok) {
      showToast(
        `${data.created_count} final maçı oluşturuldu. Bracket bilgileri: ${data.bracket_info.num_matches} maç, ${data.bracket_info.total_teams} takım`,
        "success"
      );
      
      // Maç listesini yenile
      await loadMatchSchedule();
      if (typeof loadPlayoffMatchSchedule === "function") {
        await loadPlayoffMatchSchedule();
      }
      
      // Adım durumunu güncelle
      if (typeof checkAllStepStatuses === "function") {
        await checkAllStepStatuses();
      }
    } else {
      showToast(data.error || "Final maçları oluşturulamadı", "error");
    }
  } catch (err) {
    console.error("Generate final matches error:", err);
    const errorMsg = err.response?.data?.error || err.message || "Final maçları oluşturulamadı";
    showToast(errorMsg, "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

/**
 * Playoff maçlarını yükler ve tabloya ekler (setup -> playoff).
 */
async function loadPlayoffMatchSchedule() {
  const tbody = qs("playoff_match_tbody");
  if (!tbody) return;
  try {
    const [matches, bracketData] = await Promise.all([
      apiGet("/api/match-schedule", { type: "final" }),
      apiGet("/api/public/playoff-bracket").catch(() => ({})),
    ]);
    if (!matches || matches.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="padding: 20px; text-align: center; color: #666;">Playoff maçı bulunamadı.</td></tr>`;
      return;
    }
    const roundMap = {};
    (bracketData.bracket_rounds || []).forEach((round) => {
      (round.matches || []).forEach((match) => {
        if (!match || match.match_number == null) return;
        roundMap[String(match.match_number)] = {
          roundName: round.name || "",
          label: match.label || "",
          redAllianceInfo: match.red_alliance_info || [],
          blueAllianceInfo: match.blue_alliance_info || [],
        };
      });
    });

    const buildAllianceNumber = (infoList) => {
      const ranks = (infoList || [])
        .map((item) => item?.rank)
        .filter((rank) => Number.isFinite(Number(rank)))
        .map((rank) => String(rank));
      return ranks.length ? ranks.join("-") : "-";
    };

    tbody.innerHTML = matches.map((match) => {
      const extra = roundMap[String(match.match_number || "")] || {};
      const roundName = extra.roundName || "-";
      const label = extra.label || "-";
      const redAllianceNo = buildAllianceNumber(extra.redAllianceInfo);
      const blueAllianceNo = buildAllianceNumber(extra.blueAllianceInfo);
      const redTeams = (match.red_alliance || []).join(", ");
      const blueTeams = (match.blue_alliance || []).join(", ");
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #f1f2f6;">${escapeHtml(roundName)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f2f6;">${escapeHtml(label)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f2f6;">${escapeHtml(String(match.match_number || ""))}</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f2f6;">${escapeHtml(match.match_date || "")}</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f2f6;">${escapeHtml(match.match_time || "")}</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f2f6;">${escapeHtml(`Saha ${match.field_number || "-"}`)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f2f6;">${escapeHtml(redAllianceNo)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f2f6;">${escapeHtml(redTeams)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f2f6;">${escapeHtml(blueAllianceNo)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f2f6;">${escapeHtml(blueTeams)}</td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Load playoff match schedule error:", err);
    tbody.innerHTML = `<tr><td colspan="10" style="padding: 20px; text-align: center; color: #c00;">Playoff maçları yüklenemedi.</td></tr>`;
  }
}

/**
 * SP sıralamasını görüntüler (final maçları oluşturmadan önce kontrol için).
 */
async function viewFinalRankings() {
  const display = qs("final_rankings_display");
  const content = qs("final_rankings_content");
  const btn = qs("view_final_rankings");
  
  try {
    setButtonLoading(btn, true);
    
    // Backend sıralama algoritmasını kullan
    const rankingPayload = await apiGet("/api/match-schedule/rankings");
    const rankings = rankingPayload?.rankings || [];
    
    if (!rankings || rankings.length === 0) {
      content.innerHTML = `
        <div style="padding: 16px; text-align: center; color: #666;">
          <p>Henüz tamamlanmış sıralama maçı bulunamadı.</p>
          <p style="font-size: 12px; margin-top: 8px;">SP sıralaması için en az bir tamamlanmış sıralama maçı gerekli.</p>
        </div>
      `;
      display.style.display = "block";
      return;
    }
    
    // Sıralamayı göster
    let html = `
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #e1e4ee; font-weight: 600;">
            <th style="padding: 8px; text-align: left; border: 1px solid #d0d5e0;">Sıra</th>
            <th style="padding: 8px; text-align: left; border: 1px solid #d0d5e0;">Takım</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #d0d5e0;">Toplam SP</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #d0d5e0;">G</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #d0d5e0;">Ort</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #d0d5e0;">B</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #d0d5e0;">M</th>
            <th style="padding: 8px; text-align: center; border: 1px solid #d0d5e0;">Maç</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    rankings.forEach((team, index) => {
      const isTop = index < 4; // İlk 4 takım vurgulanır
      const avgScore = (typeof team.average_score === "number")
        ? team.average_score.toFixed(2)
        : (team.average_score != null ? String(team.average_score) : "0.00");
      html += `
        <tr style="${isTop ? 'background: #fff8e1;' : ''}">
          <td style="padding: 8px; border: 1px solid #e1e4ee; font-weight: ${isTop ? '600' : '400'};">
            ${team.rank}
          </td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; font-weight: ${isTop ? '600' : '400'};">
            ${escapeHtml(team.team)}
          </td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; text-align: center; font-weight: 600; color: #4a90e2;">
            ${team.total_sp}
          </td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; text-align: center;">${team.wins}</td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; text-align: center;">${avgScore}</td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; text-align: center;">${team.ties}</td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; text-align: center;">${team.losses}</td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; text-align: center;">${team.matches_played}</td>
        </tr>
      `;
    });
    
    html += `
        </tbody>
      </table>
      <div style="margin-top: 12px; padding: 8px; background: #e8f4f8; border-radius: 4px; font-size: 12px; color: #2c5f7c;">
        <strong>Not:</strong> Bu önizleme, backend'deki güncel sıralama algoritması ile hesaplanır.
      </div>
    `;
    
    content.innerHTML = html;
    display.style.display = "block";
  } catch (err) {
    console.error("View final rankings error:", err);
    showToast("SP sıralaması yüklenemedi", "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

