/**
 * Jüri Görüşme Kurulum Modülü (Setup → Jüri Görüşme Takvimi adımı)
 *
 * API: /api/judging-settings, /api/judging-slots, /api/judging-slots/generate
 */

/** Ayarları yükler (oda/süre) ve slot listesini çizer. */
async function loadJudgingSetup() {
  try {
    const settings = await apiGet("/api/judging-settings");
    if (qs("judging_duration") && settings.duration_minutes) {
      qs("judging_duration").value = settings.duration_minutes;
    }
    renderJudgingRooms(settings.rooms && settings.rooms.length ? settings.rooms : ["Oda 1"]);
  } catch (err) {
    renderJudgingRooms(["Oda 1"]);
  }
  // Başlangıç tarihini etkinlik başlangıcına ayarla (boşsa)
  if (qs("judging_start_date") && !qs("judging_start_date").value) {
    try {
      const event = await apiGet("/api/event").catch(() => ({}));
      if (event.dates?.start) qs("judging_start_date").value = event.dates.start;
    } catch (e) { /* yoksay */ }
  }
  await loadJudgingSlots();
}

/** Oda giriş satırlarını çizer. */
function renderJudgingRooms(rooms) {
  const container = qs("judging_rooms_container");
  if (!container) return;
  container.innerHTML = rooms
    .map(
      (r) =>
        '<div class="room-input-group" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">' +
        '<input type="text" class="room-name-input" value="' + escapeHtml(r) + '" placeholder="Oda" style="flex:1;" />' +
        '<button type="button" class="btn-danger remove-room-btn" style="padding:6px 10px;">Sil</button>' +
        "</div>"
    )
    .join("");
}

/** Formdaki oda isimlerini toplar. */
function collectJudgingRooms() {
  const rooms = [];
  document.querySelectorAll("#judging_rooms_container .room-name-input").forEach((inp) => {
    const v = inp.value.trim();
    if (v) rooms.push(v);
  });
  return rooms.length ? rooms : ["Oda 1"];
}

/** Slot listesini yükler ve tabloya çizer. */
async function loadJudgingSlots() {
  let slots = [];
  try {
    slots = (await apiGet("/api/judging-slots")) || [];
  } catch (err) {
    slots = [];
  }
  const tbody = qs("judging_slots_table")?.querySelector("tbody");
  if (!tbody) return;
  const countEl = qs("judging_slot_count");
  if (countEl) countEl.textContent = slots.length + " görüşme";
  if (!slots.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:#999;">Henüz görüşme takvimi oluşturulmadı.</td></tr>';
    return;
  }
  tbody.innerHTML = slots
    .map((s) => {
      const date = s.slot_date ? s.slot_date.split("-").reverse().join("/") : "";
      return (
        "<tr>" +
        '<td data-label="Takım"><strong>' + escapeHtml(s.team_number) + "</strong></td>" +
        '<td data-label="Tarih">' + date + "</td>" +
        '<td data-label="Saat">' + escapeHtml(s.slot_time || "") + "</td>" +
        '<td data-label="Süre">' + (s.duration_minutes || "") + " dk</td>" +
        '<td data-label="Oda">' + escapeHtml(s.room || "—") + "</td>" +
        '<td data-label="Jüri">' + escapeHtml(s.judge_name || s.judge_username || "—") + "</td>" +
        "</tr>"
      );
    })
    .join("");
}

/** Otomatik takvim üretir. */
async function generateJudgingSlots() {
  const startDate = qs("judging_start_date")?.value;
  const startTime = qs("judging_start_time")?.value;
  if (!startDate || !startTime) {
    showToast("Başlangıç tarihi ve saati gerekli", "warning");
    return;
  }
  const rooms = collectJudgingRooms();
  if (!confirm(`Tüm takımlar için ${rooms.length} odada jüri görüşme takvimi oluşturulsun mu?`)) return;
  try {
    setButtonLoading(qs("generate_judging_slots"), true);
    // Oda/süre ayarını da kaydet (sonradan panelde kullanılır)
    await apiPost("/api/judging-settings", {
      duration_minutes: Number(qs("judging_duration")?.value || 10),
      rooms,
    });
    const res = await apiPost("/api/judging-slots/generate", {
      start_date: startDate,
      start_time: startTime,
      duration_minutes: Number(qs("judging_duration")?.value || 10),
      break_minutes: Number(qs("judging_break")?.value || 0),
      rooms,
      sort_order: qs("judging_sort_order")?.value || "ascending",
      clear_existing: qs("judging_clear_existing")?.checked || false,
    });
    showToast(`${res.created_count} görüşme slotu oluşturuldu`, "success");
    await loadJudgingSlots();
    if (typeof checkAllStepStatuses === "function") await checkAllStepStatuses();
  } catch (err) {
    showToast("Jüri takvimi oluşturulamadı", "error");
  } finally {
    setButtonLoading(qs("generate_judging_slots"), false);
  }
}

/** Tüm jüri takvimini siler. */
async function deleteAllJudgingSlots() {
  if (!confirm("Tüm jüri görüşme takvimini silmek istediğinize emin misiniz?")) return;
  try {
    setButtonLoading(qs("delete_all_judging_slots"), true);
    await apiDelete("/api/judging-slots");
    showToast("Jüri takvimi silindi", "success");
    await loadJudgingSlots();
  } catch (err) {
    showToast("Silinemedi", "error");
  } finally {
    setButtonLoading(qs("delete_all_judging_slots"), false);
  }
}

/** Jüri görüşme adımı için event listener'ları kurar. */
function setupJudgingSetupListeners() {
  if (qs("generate_judging_slots")) qs("generate_judging_slots").addEventListener("click", generateJudgingSlots);
  if (qs("delete_all_judging_slots")) qs("delete_all_judging_slots").addEventListener("click", deleteAllJudgingSlots);
  if (qs("add_judging_room")) {
    qs("add_judging_room").addEventListener("click", () => {
      const container = qs("judging_rooms_container");
      if (!container) return;
      const div = document.createElement("div");
      div.className = "room-input-group";
      div.style.cssText = "display:flex;gap:8px;margin-bottom:8px;align-items:center;";
      const n = container.querySelectorAll(".room-name-input").length + 1;
      div.innerHTML =
        '<input type="text" class="room-name-input" placeholder="Oda" value="Oda ' + n + '" style="flex:1;" />' +
        '<button type="button" class="btn-danger remove-room-btn" style="padding:6px 10px;">Sil</button>';
      container.appendChild(div);
    });
  }
  const roomsContainer = qs("judging_rooms_container");
  if (roomsContainer) {
    roomsContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-room-btn")) {
        const groups = roomsContainer.querySelectorAll(".room-input-group");
        if (groups.length > 1) e.target.closest(".room-input-group").remove();
      }
    });
  }
}
