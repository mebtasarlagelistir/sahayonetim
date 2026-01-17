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
    const res = await fetch("/api/event");
    if (!res.ok) return;
    const event = await res.json();
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
    if (qs("match_start_date") && !qs("match_start_date").value) {
      qs("match_start_date").value = event.dates?.start || "";
    }
    if (qs("match_start_time") && !qs("match_start_time").value) {
      qs("match_start_time").value = "09:00";
    }

    updateMatchFieldOptions(fieldCount);
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
    const matchType = qs("filter_match_type")?.value || "";

    const params = new URLSearchParams();
    if (date) params.append("date", date);
    if (field) params.append("field", field);
    if (matchType) params.append("type", matchType);

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
        <td>${escapeHtml(match.match_type || "")}</td>
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
      match_type: qs("match_type")?.value || "qualification",
      algorithm: qs("match_algorithm")?.value || "balanced",
      field_count: Number(qs("match_field_count")?.value || 1),
      teams_per_alliance: Number(qs("match_teams_per_alliance")?.value || 2),
      match_cycle_minutes: Number(qs("match_cycle_minutes")?.value || 3),
      matches_per_team: Number(qs("match_matches_per_team")?.value || 0) || null,
      num_matches: Number(qs("match_num_matches")?.value || 0) || null,
      clear_existing: qs("match_clear_existing")?.checked || false,
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
      match_type: qs("new_match_type")?.value || "qualification",
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
      match_type: qs("bulk_match_type")?.value || "",
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
