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
    const [eventRes, settingsRes] = await Promise.all([
      fetch("/api/event"),
      fetch("/api/match-settings"),
    ]);
    if (!eventRes.ok) return;
    const event = await eventRes.json();
    const format = event.format || {};
    const schedule = event.schedule || {};
    const settings = settingsRes.ok ? await settingsRes.json() : {};

    const fieldCount = Number(format.fields || 1);
    const teamsPerAlliance = Number(format.teams_per_alliance || 2);
    const matchCycleSeconds = Number(schedule.match_cycle_seconds || 150);
    const matchCycleMinutes = Math.max(1, Math.round(matchCycleSeconds / 60));

    if (qs("match_field_count")) qs("match_field_count").value = fieldCount;
    if (qs("match_teams_per_alliance")) qs("match_teams_per_alliance").value = teamsPerAlliance;
    if (qs("match_cycle_minutes")) qs("match_cycle_minutes").value = matchCycleMinutes;

    // Varsayılan başlangıç tarihi/saati
    if (qs("match_start_date") && !qs("match_start_date").value) {
      qs("match_start_date").value = event.dates?.start || "";
    }
    if (qs("match_start_time") && !qs("match_start_time").value) {
      qs("match_start_time").value = "09:00";
    }

    updateMatchFieldOptions(fieldCount);
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

    const params = new URLSearchParams();
    if (date) params.append("date", date);
    if (field) params.append("field", field);

    const res = await fetch(`/api/match-schedule?${params.toString()}`);
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) {
      showToast("Maç takvimi yüklenirken hata oluştu", "error");
      return;
    }

    const matches = await res.json();
    const table = qs("match_schedule_table");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    matches.forEach((match) => {
      const tr = document.createElement("tr");
      const redTeams = match.red_alliance || [];
      const blueTeams = match.blue_alliance || [];

      tr.innerHTML = `
        <td><input type="checkbox" class="match-select" data-match-id="${match.id}" /></td>
        <td>${escapeHtml(String(match.match_number || ""))}</td>
        <td>${escapeHtml(match.match_date)}</td>
        <td>${escapeHtml(match.match_time)}</td>
        <td>${escapeHtml(`Saha ${match.field_number}`)}</td>
        <td>${redTeams.map((t) => escapeHtml(t)).join(", ")}</td>
        <td>${blueTeams.map((t) => escapeHtml(t)).join(", ")}</td>
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
    const payload = {
      start_date: qs("match_start_date")?.value || "",
      start_time: qs("match_start_time")?.value || "",
      algorithm: qs("match_algorithm")?.value || "balanced",
      field_count: Number(qs("match_field_count")?.value || 1),
      teams_per_alliance: Number(qs("match_teams_per_alliance")?.value || 2),
      match_cycle_minutes: Number(qs("match_cycle_minutes")?.value || 3),
      matches_per_team: Number(qs("match_matches_per_team")?.value || 0) || null,
      num_matches: Number(qs("match_num_matches")?.value || 0) || null,
      clear_existing: qs("match_clear_existing")?.checked || false,
      time_windows: collectMatchTimeWindows(),
      breaks: collectMatchBreaks(),
    };

    if (!payload.start_date || !payload.start_time) {
      showToast("Başlangıç tarihi ve saati gerekli", "warning");
      return;
    }

    const res = await fetch("/api/match-schedule/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Otomatik takvim oluşturulamadı", "error");
      return;
    }
    showToast(`Oluşturulan maç sayısı: ${data.created_count}`, "success");
    await loadMatchSchedule();
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

    const res = await fetch("/api/match-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Maç eklenemedi", "error");
      return;
    }
    showToast("Maç eklendi", "success");
    await loadMatchSchedule();
  } catch (err) {
    console.error("Create match schedule error:", err);
    showToast("Maç eklenemedi", "error");
  }
}

async function deleteMatchSchedule(matchId) {
  try {
    const res = await fetch(`/api/match-schedule/${matchId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Maç silinemedi", "error");
      return;
    }
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

    const res = await fetch("/api/match-schedule/bulk-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Toplu güncelleme başarısız", "error");
      return;
    }
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

function setMatchView(mode) {
  const listView = qs("match_list_view");
  const gridView = qs("match_grid_view");
  const listBtn = qs("match_view_list");
  const gridBtn = qs("match_view_grid");
  if (!listView || !gridView || !listBtn || !gridBtn) return;

  if (mode === "grid") {
    listView.style.display = "none";
    gridView.style.display = "block";
    gridBtn.classList.add("active");
    listBtn.classList.remove("active");
    renderMatchGrid();
  } else {
    gridView.style.display = "none";
    listView.style.display = "block";
    listBtn.classList.add("active");
    gridBtn.classList.remove("active");
  }
}

async function saveMatchScheduleSettings() {
  const btn = qs("save_match_settings");
  try {
    setButtonLoading(btn, true);
    const payload = {
      time_windows: collectMatchTimeWindows(),
      breaks: collectMatchBreaks(),
    };
    const res = await fetch("/api/match-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Ayarlar kaydedilemedi", "error");
      return;
    }
    showToast("Ayarlar kaydedildi", "success");
    renderMatchBreaksList(payload.breaks);
    updateMatchGridDefaults(qs("match_start_date")?.value || "", payload.time_windows);
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
  const group = document.createElement("div");
  group.className = "break-group";
  group.style.cssText =
    "display: grid; grid-template-columns: 1fr 1fr 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px;";
  group.innerHTML = `
    <input type="date" class="match-break-date" />
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
  document.querySelectorAll("#match_breaks .break-group").forEach((group) => {
    const date = group.querySelector(".match-break-date")?.value || "";
    const label = group.querySelector(".match-break-label")?.value || "";
    const start = group.querySelector(".match-break-start")?.value || "";
    const end = group.querySelector(".match-break-end")?.value || "";
    if (date && start && end) {
      breaks.push({ date, label, start_time: start, end_time: end });
    }
  });
  return breaks;
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

async function renderMatchGrid() {
  const gridContainer = qs("match_schedule_grid");
  if (!gridContainer) return;

  const selectedDate = qs("match_grid_date")?.value;
  if (!selectedDate) return;

  const res = await fetch(`/api/match-schedule?date=${selectedDate}`);
  if (!res.ok) return;
  const matches = await res.json();

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
        if (mt.field_number !== field) return false;
        const [mh, mm] = mt.match_time.split(":").map(Number);
        const mtStart = mh * 60 + mm;
        return mtStart >= startMinutes && mtStart < startMinutes + slotWidth;
      });

      if (match) {
        const [mh, mm] = match.match_time.split(":").map(Number);
        const mtStart = mh * 60 + mm;
        const mtEnd = mtStart + matchCycleMinutes;
        const colspan = Math.max(1, Math.ceil(matchCycleMinutes / slotWidth));
        lastMatchEnd = mtEnd;
        const redTeams = (match.red_alliance || []).join(", ");
        const blueTeams = (match.blue_alliance || []).join(", ");
        html += `<td style="padding: 2px 4px; border: 1px solid #e1e4ee; background: #2D5AF0; color: white; text-align: center; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
          colspan="${colspan}"
          title="${escapeHtml(match.match_number || "")} • ${escapeHtml(redTeams)} / ${escapeHtml(blueTeams)}">
          ${escapeHtml(String(match.match_number || ""))} • ${escapeHtml(redTeams)} / ${escapeHtml(blueTeams)}
        </td>`;
      } else {
        html += `<td style="padding: 2px; border: 1px solid #e1e4ee; background: #ffffff;"></td>`;
      }
    });
    html += `</tr>`;
  }

  html += `</tbody></table>`;
  gridContainer.innerHTML = html;
}
