/**
 * Deneme Maçları Yönetimi Modülü
 * 
 * Deneme maçları yönetimi, otomatik takvim oluşturma vb.
 */

/**
 * Deneme maçlarını yükler ve tabloya ekler
 * 
 * API: GET /api/practice-matches?date=...&field=...&status=...
 */
async function loadPracticeMatches() {
  try {
    const date = qs("filter_practice_date")?.value || "";
    const field = qs("filter_practice_field")?.value || "";
    
    const params = new URLSearchParams();
    if (date) params.append("date", date);
    if (field) params.append("field", field);
    
    const res = await fetch(`/api/practice-matches?${params.toString()}`);
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) {
      showToast("Deneme maçları yüklenirken hata oluştu", "error");
      return;
    }
    
    const matches = await res.json();
    const table = qs("practice_matches_table");
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
      const fieldLabel = match.field_name ? escapeHtml(match.field_name) : `Saha ${match.field_number}`;
      
      tr.innerHTML = `
        <td><input type="checkbox" class="practice-select" data-match-id="${match.id}" /></td>
        <td>${escapeHtml(match.match_number || "")}</td>
        <td>${escapeHtml(match.match_date)}</td>
        <td>${escapeHtml(match.match_time)}</td>
        <td>${fieldLabel}</td>
        <td>${redDisplay}</td>
        <td>${blueDisplay}</td>
        <td class="no-print">
          <button class="btn-danger" data-match-id="${match.id}">Sil</button>
        </td>
      `;
      
      // Sil butonu
      tr.querySelector("button").addEventListener("click", async () => {
        if (confirm("Bu maçı silmek istediğinize emin misiniz?")) {
          await deletePracticeMatch(match.id);
        }
      });
      
      tbody.appendChild(tr);
    });
    
    // Adım durumunu güncelle
    if (typeof setStepStatus === "function") {
      setStepStatus("step-practice-matches", matches.length > 0 ? "Done" : "Not Started");
      if (typeof setStepCount === "function") {
        setStepCount("step-practice-matches", matches.length > 0 ? matches.length : null);
      }
    }
  } catch (err) {
    console.error("Load practice matches error:", err);
    showToast("Deneme maçları yüklenirken hata oluştu", "error");
  }
}

/**
 * Deneme maçları ayarlarını etkinlikten yükler
 * 
 * API: GET /api/event
 */
async function loadPracticeSettings() {
  try {
    const res = await fetch("/api/event");
    if (!res.ok) return;
    const event = await res.json();
    const format = event.format || {};
    const schedule = event.schedule || {};
    const practiceSettings = event.practice_settings || {};
    const stageSettings = event.stages?.practice_matches || {};
    
    const fieldCount = Number(format.fields || 1);
    const teamsPerAlliance = Number(format.teams_per_alliance || 2);
    const matchCycleSeconds = Number(schedule.match_cycle_seconds || 150);
    const matchCycleMinutes = Math.max(1, Math.round(matchCycleSeconds / 60));
    const matchesPerTeam = Number(practiceSettings.matches_per_team || 1);
    
    if (qs("practice_field_count")) {
      qs("practice_field_count").value = fieldCount;
    }
    if (qs("practice_teams_per_alliance")) {
      qs("practice_teams_per_alliance").value = teamsPerAlliance;
    }
    if (qs("practice_match_cycle")) {
      qs("practice_match_cycle").value = matchCycleMinutes;
    }
    if (qs("practice_matches_per_team")) {
      qs("practice_matches_per_team").value = matchesPerTeam;
    }
    setPracticeStageButton(stageSettings.active !== false);

    // Saha isimlerini saha sayısına göre oluştur
    const container = qs("practice_fields_container");
    if (container) {
      const existing = Array.from(container.querySelectorAll(".field-name-input")).map((i) => i.value.trim());
      container.innerHTML = "";
      for (let i = 0; i < fieldCount; i++) {
        const name = existing[i] || `Saha ${i + 1}`;
        const group = document.createElement("div");
        group.className = "field-input-group";
        group.style.cssText = "display: flex; gap: 8px; margin-bottom: 8px; align-items: center;";
        group.innerHTML = `
          <input type="text" class="field-name-input" placeholder="Saha ${i + 1}" value="${escapeHtml(name)}" style="flex: 1;" />
          <button type="button" class="btn-danger remove-field-btn" style="padding: 4px 8px; font-size: 12px;">Sil</button>
        `;
        container.appendChild(group);
      }
    }

    // Saat aralıkları ve molaları yükle
    populatePracticeTimeWindows(practiceSettings.time_windows || [], event.dates?.start || "");
    populatePracticeBreaks(practiceSettings.breaks || [], event.dates?.start || "");
    renderPracticeBreaksList(practiceSettings.breaks || []);

    // Filtre seçeneklerini saha isimlerine göre güncelle
    updatePracticeFieldFilter(fieldCount, collectPracticeFieldNames());
    updatePracticeBulkFieldOptions(fieldCount, collectPracticeFieldNames());
    updatePracticeGridDefaults(event.dates?.start || "", practiceSettings.time_windows || []);
    togglePracticeStageUI(stageSettings.active !== false);
  } catch (err) {
    console.error("Load practice settings error:", err);
  }
}

function addPracticeFieldName() {
  const container = qs("practice_fields_container");
  if (!container) return;
  const count = container.querySelectorAll(".field-name-input").length + 1;
  const group = document.createElement("div");
  group.className = "field-input-group";
  group.style.cssText = "display: flex; gap: 8px; margin-bottom: 8px; align-items: center;";
  group.innerHTML = `
    <input type="text" class="field-name-input" placeholder="Saha ${count}" value="Saha ${count}" style="flex: 1;" />
    <button type="button" class="btn-danger remove-field-btn" style="padding: 4px 8px; font-size: 12px;">Sil</button>
  `;
  container.appendChild(group);
}

function removePracticeFieldName(groupElement) {
  const container = qs("practice_fields_container");
  if (!container || !groupElement) return;
  const count = container.querySelectorAll(".field-name-input").length;
  if (count <= 1) {
    showToast("En az bir saha olmalıdır", "warning");
    return;
  }
  groupElement.remove();
}

function collectPracticeFieldNames() {
  const names = [];
  document.querySelectorAll(".field-name-input").forEach((input) => {
    const name = input.value.trim();
    if (name) names.push(name);
  });
  return names;
}

function updatePracticeFieldFilter(fieldCount, fieldNames) {
  const filter = qs("filter_practice_field");
  if (!filter) return;
  filter.innerHTML = `<option value="">Tümü</option>`;
  for (let i = 0; i < fieldCount; i++) {
    const label = fieldNames[i] || `Saha ${i + 1}`;
    const opt = document.createElement("option");
    opt.value = String(i + 1);
    opt.textContent = label;
    filter.appendChild(opt);
  }
}

function populatePracticeTimeWindows(windows, defaultDate) {
  const container = qs("practice_time_windows");
  if (!container) return;
  container.innerHTML = "";
  const items = windows.length ? windows : [{}];
  items.forEach((item, idx) => {
    const group = document.createElement("div");
    group.className = "time-window-group";
    group.style.cssText = "display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px;";
    group.innerHTML = `
      <input type="date" class="practice-window-date" value="${escapeHtml(item.date || defaultDate || "")}" />
      <input type="time" class="practice-window-start" value="${escapeHtml(item.start_time || "09:00")}" />
      <input type="time" class="practice-window-end" value="${escapeHtml(item.end_time || "18:00")}" />
      <button type="button" class="btn-danger remove-window-btn" style="padding: 4px 8px; font-size: 12px;">Sil</button>
    `;
    container.appendChild(group);
  });
}

function populatePracticeBreaks(breaks, defaultDate) {
  const container = qs("practice_breaks");
  if (!container) return;
  container.innerHTML = "";
  const items = breaks.length ? breaks : [{}];
  items.forEach((item) => {
    const group = document.createElement("div");
    group.className = "break-group";
    group.style.cssText = "display: grid; grid-template-columns: 1fr 1fr 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px;";
    group.innerHTML = `
      <input type="date" class="practice-break-date" value="${escapeHtml(item.date || defaultDate || "")}" />
      <input type="text" class="practice-break-label" value="${escapeHtml(item.label || "")}" placeholder="Örn: Öğle" />
      <input type="time" class="practice-break-start" value="${escapeHtml(item.start_time || "12:00")}" />
      <input type="time" class="practice-break-end" value="${escapeHtml(item.end_time || "13:00")}" />
      <button type="button" class="btn-danger remove-break-btn" style="padding: 4px 8px; font-size: 12px;">Sil</button>
    `;
    container.appendChild(group);
  });
}

function collectPracticeTimeWindows() {
  const windows = [];
  document.querySelectorAll(".time-window-group").forEach((group) => {
    const date = group.querySelector(".practice-window-date")?.value || "";
    const start = group.querySelector(".practice-window-start")?.value || "";
    const end = group.querySelector(".practice-window-end")?.value || "";
    if (date && start && end) {
      windows.push({ date, start_time: start, end_time: end });
    }
  });
  return windows;
}

function collectPracticeBreaks() {
  const breaks = [];
  document.querySelectorAll(".break-group").forEach((group) => {
    const date = group.querySelector(".practice-break-date")?.value || "";
    const label = group.querySelector(".practice-break-label")?.value || "";
    const start = group.querySelector(".practice-break-start")?.value || "";
    const end = group.querySelector(".practice-break-end")?.value || "";
    if (date && start && end) {
      breaks.push({ date, label, start_time: start, end_time: end });
    }
  });
  return breaks;
}

function getPracticeStartFallback() {
  const timeWindows = collectPracticeTimeWindows();
  if (timeWindows.length) {
    return {
      date: timeWindows[0].date,
      time: timeWindows[0].start_time,
    };
  }
  return { date: "", time: "" };
}

function updatePracticeBulkFieldOptions(fieldCount, fieldNames) {
  const select = qs("bulk_practice_field");
  if (!select) return;
  select.innerHTML = `<option value="">Değiştirme</option>`;
  for (let i = 0; i < fieldCount; i++) {
    const opt = document.createElement("option");
    opt.value = String(i + 1);
    opt.textContent = fieldNames[i] || `Saha ${i + 1}`;
    select.appendChild(opt);
  }
}

function updatePracticeGridDefaults(defaultDate, timeWindows) {
  if (qs("practice_grid_date") && !qs("practice_grid_date").value) {
    qs("practice_grid_date").value = defaultDate || "";
  }
  if (timeWindows && timeWindows.length) {
    const first = timeWindows[0];
    if (qs("practice_grid_start_time")) {
      qs("practice_grid_start_time").value = first.start_time || "09:00";
    }
    if (qs("practice_grid_end_time")) {
      qs("practice_grid_end_time").value = first.end_time || "18:00";
    }
  }
}

function togglePracticeStageUI(active) {
  const container = qs("step-practice-matches");
  if (!container) return;
  const inputs = container.querySelectorAll("input, select, button, textarea");
  inputs.forEach((el) => {
    if (el.id === "practice_stage_toggle") return;
    if (el.id === "save_practice_settings") return;
    if (el.id === "preview_practice_schedule") return;
    el.disabled = !active;
  });
  if (!active) {
    showToast("Pratik maçlar aşaması pasif", "warning");
  }
}

function setPracticeStageButton(active) {
  const btn = qs("practice_stage_toggle");
  if (!btn) return;
  btn.dataset.active = active ? "true" : "false";
  btn.setAttribute("aria-pressed", active ? "true" : "false");
  btn.textContent = active ? "Aşama: Aktif" : "Aşama: Pasif";
  btn.style.backgroundColor = active ? "#2e7d32" : "#c62828";
  btn.style.color = "#fff";
  btn.style.border = "none";
}

function getPracticeStageActive() {
  const btn = qs("practice_stage_toggle");
  if (!btn) return true;
  return btn.dataset.active !== "false";
}

function renderPracticeBreaksList(breaks) {
  const container = qs("practice_breaks_list");
  if (!container) return;
  if (!breaks || !breaks.length) {
    container.textContent = "Tanımlı mola aralığı yok.";
    return;
  }
  const list = breaks
    .map((b) => {
      const label = b.label ? ` - ${escapeHtml(b.label)}` : "";
      return `<div>${escapeHtml(b.date)} ${escapeHtml(b.start_time)} - ${escapeHtml(b.end_time)}${label}</div>`;
    })
    .join("");
  container.innerHTML = list;
}
async function savePracticeSettings() {
  const fieldNames = collectPracticeFieldNames();
  const timeWindows = collectPracticeTimeWindows();
  const breaks = collectPracticeBreaks();
  const matchesPerTeam = Number(qs("practice_matches_per_team")?.value || 1);
  const stageActive = getPracticeStageActive();
  
  try {
    setButtonLoading(qs("save_practice_settings"), true);
    const res = await fetch("/api/practice-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field_names: fieldNames,
        time_windows: timeWindows,
        breaks,
        matches_per_team: matchesPerTeam,
        stage_active: stageActive,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Ayarlar kaydedilirken hata oluştu", "error");
      return;
    }
    showToast("Pratik maç ayarları kaydedildi", "success");
  } catch (err) {
    console.error("Save practice settings error:", err);
    showToast("Ayarlar kaydedilirken hata oluştu", "error");
  } finally {
    setButtonLoading(qs("save_practice_settings"), false);
  }
}

async function previewPracticeSchedule() {
  let startDate = qs("practice_start_date")?.value;
  let startTime = qs("practice_start_time")?.value;
  const fieldCount = Number(qs("practice_field_count")?.value || 1);
  const teamsPerAlliance = Number(qs("practice_teams_per_alliance")?.value || 2);
  const matchCycleMinutes = Number(qs("practice_match_cycle")?.value || 0);
  const matchesPerTeam = Number(qs("practice_matches_per_team")?.value || 0);
  const fieldNames = collectPracticeFieldNames();
  const timeWindows = collectPracticeTimeWindows();
  const breaks = collectPracticeBreaks();
  
  if (!startDate || !startTime) {
    const fallback = getPracticeStartFallback();
    startDate = startDate || fallback.date;
    startTime = startTime || fallback.time;
  }
  if (!startDate || !startTime) {
    showToast("Lütfen en az bir maç saat aralığı girin", "warning");
    return;
  }
  
  try {
    setButtonLoading(qs("preview_practice_schedule"), true);
    const res = await fetch("/api/practice-matches/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_date: startDate,
        start_time: startTime,
        field_count: fieldCount,
        teams_per_alliance: teamsPerAlliance,
        match_cycle_minutes: matchCycleMinutes || undefined,
        matches_per_team: matchesPerTeam || undefined,
        field_names: fieldNames,
        time_windows: timeWindows,
        breaks,
      }),
    });
    const target = qs("practice_preview_result");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (target) target.textContent = data.error || "Önizleme oluşturulamadı";
      return;
    }
    const data = await res.json();
    if (target) {
      const rows = data.preview_rows || [];
      const listHtml = rows
        .map((r) => {
          const fieldLabel = r.field_name || `Saha ${r.field_number}`;
          return `<li>${escapeHtml(r.match_number)} - ${escapeHtml(r.match_date)} ${escapeHtml(r.match_time)} (${escapeHtml(fieldLabel)})</li>`;
        })
        .join("");
      target.innerHTML = `
        <div><strong>Toplam maç:</strong> ${data.match_count}</div>
        <div><strong>Başlangıç:</strong> ${escapeHtml(data.start_time)}</div>
        <div><strong>Bitiş:</strong> ${escapeHtml(data.end_time)}</div>
        <div style="margin-top: 8px;"><strong>Örnek İlk Maçlar:</strong></div>
        <ul style="margin: 6px 0 0 18px;">${listHtml || "<li>—</li>"}</ul>
      `;
    }
  } catch (err) {
    console.error("Preview practice schedule error:", err);
    showToast("Önizleme sırasında hata oluştu", "error");
  } finally {
    setButtonLoading(qs("preview_practice_schedule"), false);
  }
}

/**
 * Yeni deneme maçı oluşturur
 * 
 * API: POST /api/practice-matches
 */
async function createPracticeMatch() {
  const matchNumber = qs("new_practice_match_number")?.value.trim() || null;
  const fieldNumber = Number(qs("new_practice_field")?.value || 1);
  const matchDate = qs("new_practice_date")?.value;
  const matchTime = qs("new_practice_time")?.value;
  const redAlliance = qs("new_practice_red")?.value.split(",").map(s => s.trim()).filter(Boolean) || [];
  const blueAlliance = qs("new_practice_blue")?.value.split(",").map(s => s.trim()).filter(Boolean) || [];
  
  if (!matchDate || !matchTime) {
    showToast("Lütfen tarih ve saat girin", "warning");
    return;
  }
  if (redAlliance.length === 0 || blueAlliance.length === 0) {
    showToast("Her iki ittifak için en az bir takım gerekli", "warning");
    return;
  }
  
  try {
    setButtonLoading(qs("add_practice_match"), true);
    
    const res = await fetch("/api/practice-matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_number: matchNumber,
        field_number: fieldNumber,
        match_date: matchDate,
        match_time: matchTime,
        red_alliance: redAlliance,
        blue_alliance: blueAlliance,
        status: "scheduled",
      }),
    });
    
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (res.status === 403) {
      const error = await res.json().catch(() => ({ message: "Bu işlem için yetkiniz yok" }));
      showToast(error.message || "Bu işlem için yetkiniz yok", "error");
      return;
    }
    
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Maç oluşturulurken hata oluştu", "error");
      return;
    }
    
    showToast("Deneme maçı oluşturuldu", "success");
    
    // Formu temizle
    if (qs("new_practice_match_number")) qs("new_practice_match_number").value = "";
    if (qs("new_practice_date")) qs("new_practice_date").value = "";
    if (qs("new_practice_time")) qs("new_practice_time").value = "";
    if (qs("new_practice_red")) qs("new_practice_red").value = "";
    if (qs("new_practice_blue")) qs("new_practice_blue").value = "";
    
    await loadPracticeMatches();
  } catch (err) {
    console.error("Create practice match error:", err);
    showToast("Maç oluşturulurken hata oluştu", "error");
  } finally {
    setButtonLoading(qs("add_practice_match"), false);
  }
}

/**
 * Deneme maçı günceller
 * 
 * API: PUT /api/practice-matches/<match_id>
 */
async function updatePracticeMatch(matchId, updates) {
  try {
    const res = await fetch(`/api/practice-matches/${matchId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (res.status === 403) {
      const error = await res.json().catch(() => ({ message: "Bu işlem için yetkiniz yok" }));
      showToast(error.message || "Bu işlem için yetkiniz yok", "error");
      return;
    }
    
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Maç güncellenirken hata oluştu", "error");
      return;
    }
    
    // Sessizce güncelle (toast gösterme)
    await loadPracticeMatches();
  } catch (err) {
    console.error("Update practice match error:", err);
    showToast("Maç güncellenirken hata oluştu", "error");
  }
}

/**
 * Deneme maçı siler
 * 
 * API: DELETE /api/practice-matches/<match_id>
 */
async function deletePracticeMatch(matchId) {
  try {
    const res = await fetch(`/api/practice-matches/${matchId}`, {
      method: "DELETE",
    });
    
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (res.status === 403) {
      const error = await res.json().catch(() => ({ message: "Bu işlem için yetkiniz yok" }));
      showToast(error.message || "Bu işlem için yetkiniz yok", "error");
      return;
    }
    
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Maç silinirken hata oluştu", "error");
      return;
    }
    
    showToast("Deneme maçı silindi", "success");
    await loadPracticeMatches();
  } catch (err) {
    console.error("Delete practice match error:", err);
    showToast("Maç silinirken hata oluştu", "error");
  }
}

/**
 * Toplu deneme maçı güncelleme
 * 
 * API: POST /api/practice-matches/bulk-update
 */
async function bulkUpdatePracticeMatches() {
  const selectedIds = Array.from(document.querySelectorAll(".practice-select:checked"))
    .map((cb) => Number(cb.dataset.matchId))
    .filter(Boolean);
  
  if (selectedIds.length === 0) {
    showToast("Lütfen güncellenecek maçları seçin", "warning");
    return;
  }
  
  const matchDate = qs("bulk_practice_date")?.value || "";
  const matchTime = qs("bulk_practice_time")?.value || "";
  const fieldNumber = qs("bulk_practice_field")?.value || "";
  
  if (!matchDate && !matchTime && !fieldNumber) {
    showToast("Lütfen en az bir alan seçin", "warning");
    return;
  }
  
  try {
    setButtonLoading(qs("apply_practice_bulk_update"), true);
    
    const res = await fetch("/api/practice-matches/bulk-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_ids: selectedIds,
        match_date: matchDate || undefined,
        match_time: matchTime || undefined,
        field_number: fieldNumber ? Number(fieldNumber) : undefined,
      }),
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Toplu güncelleme sırasında hata oluştu", "error");
      return;
    }
    
    const data = await res.json();
    showToast(`${data.updated_count} maç güncellendi`, "success");
    await loadPracticeMatches();
    if (qs("practice_grid_view")?.style.display !== "none") {
      await renderPracticeGrid();
    }
  } catch (err) {
    console.error("Bulk update practice error:", err);
    showToast("Toplu güncelleme sırasında hata oluştu", "error");
  } finally {
    setButtonLoading(qs("apply_practice_bulk_update"), false);
  }
}

/**
 * Deneme maçlarını yazdırır
 */
function printPracticeSchedule() {
  const printArea = qs("practice_matches_print_area");
  if (!printArea) {
    showToast("Yazdırılacak içerik bulunamadı", "error");
    return;
  }
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("Pop-up engelleyici nedeniyle yazdırma penceresi açılamadı", "error");
    return;
  }
  fetch("/api/event")
    .then(res => res.ok ? res.json() : {})
    .then(event => {
      const eventName = event.name || "Etkinlik";
      const eventCode = event.code || "";
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Deneme Maçları - ${escapeHtml(eventName)}</title>
          <style>
            @page { margin: 1cm; }
            body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 16px; }
            h1 { font-size: 18px; margin: 0 0 8px 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .print-header { margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #333; }
          </style>
        </head>
        <body>
          <div class="print-header">
            <h1>Deneme Maçları</h1>
            <p><strong>Etkinlik:</strong> ${escapeHtml(eventName)} ${eventCode ? `(${escapeHtml(eventCode)})` : ""}</p>
          </div>
          ${printArea.innerHTML}
        </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 250);
    })
    .catch(() => {
      showToast("Yazdırma sırasında hata oluştu", "error");
      printWindow.close();
    });
}

/**
 * Pratik maç takvim görünümü
 */
async function renderPracticeGrid() {
  const gridContainer = qs("practice_schedule_grid");
  if (!gridContainer) return;
  
  const selectedDate = qs("practice_grid_date")?.value;
  if (!selectedDate) return;
  
  const res = await fetch(`/api/practice-matches?date=${selectedDate}`);
  if (!res.ok) return;
  const matches = await res.json();
  
  const teamsRes = await fetch("/api/teams");
  const teams = teamsRes.ok ? await teamsRes.json() : [];
  const teamNumbers = teams
    .map((t) => t.number)
    .filter(Boolean)
    .sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isNaN(na) || Number.isNaN(nb)) {
        return String(a).localeCompare(String(b));
      }
      return na - nb;
    });
  
  if (teamNumbers.length === 0) {
    gridContainer.textContent = "Takım bulunamadı.";
    return;
  }
  const startTime = qs("practice_grid_start_time")?.value || "09:00";
  const endTime = qs("practice_grid_end_time")?.value || "18:00";
  const slotWidth = Number(qs("practice_grid_slot_width")?.value || 10);
  const matchCycleMinutes = Number(qs("practice_match_cycle")?.value || 10);
  
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
      <th style="position: sticky; left: 0; background: #f5f6fa; z-index: 5; padding: 6px; border: 1px solid #e1e4ee; width: 100px; text-align: left;">Takım</th>`;
  
  timeSlots.forEach((t) => {
    html += `<th style="padding: 6px; border: 1px solid #e1e4ee; width: 60px; text-align: center; background: #f5f6fa; font-size: 10px;">${t}</th>`;
  });
  html += `</tr></thead><tbody>`;
  
  teamNumbers.forEach((teamNumber) => {
    html += `<tr data-team-number="${escapeHtml(teamNumber)}">`;
    html += `<td style="position: sticky; left: 0; background: #ffffff; z-index: 4; padding: 6px; border: 1px solid #e1e4ee; font-weight: 600; width: 100px; font-size: 11px;">${escapeHtml(teamNumber)}</td>`;
    
    let lastMatchEnd = -1;
    timeSlots.forEach((timeSlot) => {
      const [h, m] = timeSlot.split(":").map(Number);
      const startMinutes = h * 60 + m;
      if (startMinutes < lastMatchEnd) return;
      lastMatchEnd = -1;
      
      const match = matches.find((mt) => {
        const [mh, mm] = mt.match_time.split(":").map(Number);
        const mtStart = mh * 60 + mm;
        const inTime = mtStart >= startMinutes && mtStart < startMinutes + slotWidth;
        const inTeam = (mt.red_alliance || []).includes(teamNumber) || (mt.blue_alliance || []).includes(teamNumber);
        return inTime && inTeam;
      });
      
      if (match) {
        const [mh, mm] = match.match_time.split(":").map(Number);
        const mtStart = mh * 60 + mm;
        const mtEnd = mtStart + matchCycleMinutes;
        const colspan = Math.max(1, Math.ceil(matchCycleMinutes / slotWidth));
        lastMatchEnd = mtEnd;
        const isRed = (match.red_alliance || []).includes(teamNumber);
        const bg = isRed ? "#c62828" : "#1565c0";
        const fieldLabel = match.field_name || `Saha ${match.field_number}`;
        
        html += `<td style="padding: 2px 4px; border: 1px solid #e1e4ee; background: ${bg}; color: white; text-align: center; cursor: pointer; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
          data-match-id="${match.id}" data-team-number="${escapeHtml(teamNumber)}" data-slot-time="${match.match_time}" colspan="${colspan}"
          title="${escapeHtml(match.match_number || "")} - ${escapeHtml(fieldLabel)}">
          ${escapeHtml(match.match_number || "")} • ${escapeHtml(fieldLabel)}
        </td>`;
      } else {
        html += `<td style="padding: 2px; border: 1px solid #e1e4ee; background: #ffffff;" data-team-number="${escapeHtml(teamNumber)}" data-slot-time="${timeSlot}"></td>`;
      }
    });
    html += `</tr>`;
  });
  
  html += `</tbody></table>`;
  gridContainer.innerHTML = html;
  
  // Drag & drop
  gridContainer.querySelectorAll('td[data-match-id]').forEach((cell) => {
    cell.setAttribute("draggable", "true");
    cell.addEventListener("dragstart", (e) => {
      const matchId = cell.dataset.matchId;
      const teamNumber = cell.dataset.teamNumber;
      e.dataTransfer.setData("text/plain", JSON.stringify({ matchId, teamNumber }));
    });
  });
  
  gridContainer.querySelectorAll('td[data-slot-time]:not([data-match-id])').forEach((cell) => {
    cell.addEventListener("dragover", (e) => e.preventDefault());
    cell.addEventListener("drop", async (e) => {
      e.preventDefault();
      const payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
      const targetTeam = cell.dataset.teamNumber;
      const targetTime = cell.dataset.slotTime;
      if (!payload.matchId || !targetTeam || !targetTime) return;
      if (payload.teamNumber !== targetTeam) {
        showToast("Maç sadece aynı takım satırında taşınabilir", "warning");
        return;
      }
      await updatePracticeMatch(payload.matchId, {
        match_date: selectedDate,
        match_time: targetTime,
      });
      await loadPracticeMatches();
      await renderPracticeGrid();
    });
  });
}

/**
 * Otomatik deneme maçları takvimi oluşturur
 * 
 * API: POST /api/practice-matches/generate
 */
async function generatePracticeMatches() {
  let startDate = qs("practice_start_date")?.value;
  let startTime = qs("practice_start_time")?.value;
  const fieldCount = Number(qs("practice_field_count")?.value || 1);
  const numMatches = qs("practice_num_matches")?.value ? Number(qs("practice_num_matches").value) : null;
  const teamsPerAlliance = Number(qs("practice_teams_per_alliance")?.value || 2);
  const matchCycleMinutes = Number(qs("practice_match_cycle")?.value || 0);
  const matchesPerTeam = Number(qs("practice_matches_per_team")?.value || 0);
  const fieldNames = collectPracticeFieldNames();
  const timeWindows = collectPracticeTimeWindows();
  const breaks = collectPracticeBreaks();
  const clearExisting = qs("practice_clear_existing")?.checked || false;
  
  if (!startDate || !startTime) {
    const fallback = getPracticeStartFallback();
    startDate = startDate || fallback.date;
    startTime = startTime || fallback.time;
  }
  if (!startDate || !startTime) {
    showToast("Lütfen en az bir maç saat aralığı girin", "warning");
    return;
  }
  
  if (!confirm(`Otomatik deneme maçları takvimi oluşturulsun mu?`)) {
    return;
  }
  
  try {
    setButtonLoading(qs("generate_practice_matches"), true);
    
    const res = await fetch("/api/practice-matches/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_date: startDate,
        start_time: startTime,
        field_count: fieldCount,
        teams_per_alliance: teamsPerAlliance,
        num_matches: numMatches,
        match_cycle_minutes: matchCycleMinutes || undefined,
        matches_per_team: matchesPerTeam || undefined,
        field_names: fieldNames,
        time_windows: timeWindows,
        breaks,
        clear_existing: clearExisting,
      }),
    });
    
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (res.status === 403) {
      const error = await res.json().catch(() => ({ message: "Bu işlem için yetkiniz yok" }));
      showToast(error.message || "Bu işlem için yetkiniz yok", "error");
      return;
    }
    
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || "Takvim oluşturulurken hata oluştu", "error");
      return;
    }
    
    const data = await res.json();
    showToast(`${data.created_count} deneme maçı oluşturuldu`, "success");
    await loadPracticeMatches();
  } catch (err) {
    console.error("Generate practice matches error:", err);
    showToast("Takvim oluşturulurken hata oluştu", "error");
  } finally {
    setButtonLoading(qs("generate_practice_matches"), false);
  }
}

/**
 * Görünüm değiştirme (Liste/Grid)
 */
function switchPracticeView(view) {
  const listView = qs("practice_list_view");
  const gridView = qs("practice_grid_view");
  const listBtn = qs("practice_view_list");
  const gridBtn = qs("practice_view_grid");
  
  if (view === "grid") {
    if (listView) listView.style.display = "none";
    if (gridView) gridView.style.display = "block";
    listBtn?.classList.remove("active");
    gridBtn?.classList.add("active");
    renderPracticeGrid();
  } else {
    if (listView) listView.style.display = "block";
    if (gridView) gridView.style.display = "none";
    listBtn?.classList.add("active");
    gridBtn?.classList.remove("active");
  }
}
