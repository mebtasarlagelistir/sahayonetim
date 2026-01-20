/**
 * WiFi Kanal Atama Modülü
 *
 * ESP32 (2.4 GHz) kanallarını takımlara dengeli dağıtmak için kullanılır.
 */

async function loadWifiSettings() {
  const summaryEl = qs("wifi_assignment_summary");
  if (summaryEl) summaryEl.textContent = "Yükleniyor...";

  try {
    const [settings, teams] = await Promise.all([
      apiGet("/api/wifi/settings"),
      apiGet("/api/teams"),
    ]);

    if (qs("wifi_scan_notes")) {
      qs("wifi_scan_notes").value = settings.scan_notes || "";
    }
    if (qs("wifi_assignment_mode")) {
      qs("wifi_assignment_mode").value = settings.assignment_mode || "unique";
    }

    renderWifiChannels(settings.supported_channels || [], settings.allowed_channels || []);
    renderWifiAssignments(teams, settings.assignments || {}, settings);
  } catch (err) {
    console.error("Load WiFi settings error:", err);
    showToast("WiFi ayarları yüklenemedi", "error");
  }
}

function renderWifiChannels(supported, allowed) {
  const grid = qs("wifi_channels_grid");
  if (!grid) return;

  const allowedSet = new Set((allowed || []).map(String));
  const channels = (supported || []).map((ch) => Number(ch)).filter((ch) => Number.isFinite(ch));
  channels.sort((a, b) => a - b);

  grid.innerHTML = channels
    .map((channel) => {
      const checked = allowedSet.has(String(channel)) ? "checked" : "";
      return `
        <label style="display: flex; align-items: center; gap: 6px; background: #f5f6fb; padding: 6px 8px; border-radius: 6px;">
          <input type="checkbox" data-channel="${channel}" ${checked} />
          Kanal ${channel}
        </label>
      `;
    })
    .join("");
}

function collectAllowedChannels() {
  const grid = qs("wifi_channels_grid");
  if (!grid) return [];
  const selected = [];
  grid.querySelectorAll("input[type=checkbox][data-channel]").forEach((input) => {
    if (input.checked) {
      const value = Number(input.dataset.channel);
      if (Number.isFinite(value)) {
        selected.push(value);
      }
    }
  });
  return selected;
}

function getWifiAssignmentMode() {
  const modeSelect = qs("wifi_assignment_mode");
  if (!modeSelect) return "unique";
  return modeSelect.value || "unique";
}

async function saveWifiSettings() {
  const payload = {
    allowed_channels: collectAllowedChannels(),
    scan_notes: qs("wifi_scan_notes")?.value || "",
    assignment_mode: getWifiAssignmentMode(),
  };
  try {
    await apiPost("/api/wifi/settings", payload);
    showToast("WiFi ayarları kaydedildi", "success");
    // Adım durumunu güncelle
    if (typeof checkAllStepStatuses === "function") {
      await checkAllStepStatuses();
    }
  } catch (err) {
    console.error("Save WiFi settings error:", err);
    showToast("WiFi ayarları kaydedilemedi", "error");
  }
}

async function assignWifiChannels() {
  const btn = qs("wifi_assign_channels");
  try {
    setButtonLoading(btn, true);
    const payload = {
      allowed_channels: collectAllowedChannels(),
      assignment_mode: getWifiAssignmentMode(),
    };
    const data = await apiPost("/api/wifi/assign", payload);
    const teams = await apiGet("/api/teams");
    const assignments = {};
    data.assignments.forEach((item) => {
      assignments[item.team_number] = item.channel;
    });
    renderWifiAssignments(teams, assignments, {
      assignment_mode: data.summary?.assignment_mode,
      last_assigned_at: new Date().toISOString(),
      reused: data.summary?.reused,
    });
    if (data.summary?.reused) {
      showToast("Kanal sayısı sınırlı; bazı kanallar tekrarlandı", "warning");
    } else {
      showToast("WiFi kanalları atandı", "success");
    }
    // Adım durumunu güncelle
    if (typeof checkAllStepStatuses === "function") {
      await checkAllStepStatuses();
    }
  } catch (err) {
    console.error("Assign WiFi channels error:", err);
    showToast("Atama işlemi başarısız", "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

async function clearWifiAssignments() {
  try {
    await apiPost("/api/wifi/clear", {});
    const teams = await apiGet("/api/teams");
    renderWifiAssignments(teams, {}, {});
    showToast("Atamalar temizlendi", "success");
  } catch (err) {
    console.error("Clear WiFi assignments error:", err);
    showToast("Atamalar temizlenemedi", "error");
  }
}

function renderWifiAssignments(teams, assignments, settings) {
  const tbody = qs("wifi_assignments_table");
  const summary = qs("wifi_assignment_summary");
  if (!tbody) return;

  const sortedTeams = [...(teams || [])].sort((a, b) => {
    const aNum = Number(a.number);
    const bNum = Number(b.number);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
      return aNum - bNum;
    }
    return String(a.number || "").localeCompare(String(b.number || ""), "tr");
  });

  tbody.innerHTML = sortedTeams
    .map((team) => {
      const channel = assignments?.[team.number] ?? "";
      return `
        <tr>
          <td>${escapeHtml(team.number || "")}</td>
          <td>${escapeHtml(team.name || "")}</td>
          <td>${channel ? escapeHtml(String(channel)) : "-"}</td>
        </tr>
      `;
    })
    .join("");

  if (summary) {
    const assignedCount = Object.keys(assignments || {}).length;
    if (!assignedCount) {
      summary.textContent = "Henüz atama yapılmadı.";
    } else {
      const usage = {};
      Object.values(assignments || {}).forEach((channel) => {
        usage[channel] = (usage[channel] || 0) + 1;
      });
      const usageText = Object.keys(usage)
        .sort((a, b) => Number(a) - Number(b))
        .map((ch) => `Kanal ${ch}: ${usage[ch]} takım`)
        .join(" • ");
      summary.textContent = `Atanan takım: ${assignedCount}. ${usageText}`;
    }
  }
}

function setupWifiListeners() {
  if (qs("wifi_select_all")) {
    qs("wifi_select_all").addEventListener("click", () => {
      const grid = qs("wifi_channels_grid");
      if (!grid) return;
      grid.querySelectorAll("input[type=checkbox]").forEach((input) => {
        input.checked = true;
      });
    });
  }
  if (qs("wifi_clear_all")) {
    qs("wifi_clear_all").addEventListener("click", () => {
      const grid = qs("wifi_channels_grid");
      if (!grid) return;
      grid.querySelectorAll("input[type=checkbox]").forEach((input) => {
        input.checked = false;
      });
    });
  }
  if (qs("wifi_save_settings")) {
    qs("wifi_save_settings").addEventListener("click", saveWifiSettings);
  }
  if (qs("wifi_assign_channels")) {
    qs("wifi_assign_channels").addEventListener("click", assignWifiChannels);
  }
  if (qs("wifi_clear_assignments")) {
    qs("wifi_clear_assignments").addEventListener("click", clearWifiAssignments);
  }
}
