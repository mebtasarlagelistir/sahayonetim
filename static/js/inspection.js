/**
 * İnceleme Yönetimi Modülü
 * 
 * İnceleme slotları yönetimi, otomatik takvim oluşturma, grid görünümü vb.
 */

/**
 * İnceleme slotlarını yükler ve tabloya ekler
 * 
 * API: GET /api/inspection-slots?team=...&type=...&date=...&status=...
 */
async function loadInspectionSlots() {
  try {
    const team = qs("filter_inspection_team")?.value.trim() || "";
    const type = qs("filter_inspection_type")?.value || "";
    const date = qs("filter_inspection_date")?.value || "";
    const status = qs("filter_inspection_status")?.value || "";
    
    const params = new URLSearchParams();
    if (team) params.append("team", team);
    if (type) params.append("type", type);
    if (date) params.append("date", date);
    if (status) params.append("status", status);
    
    const res = await fetch(`/api/inspection-slots?${params.toString()}`);
    if (!res.ok) {
      showToast("İnceleme slotları yüklenirken hata oluştu", "error");
      return;
    }
    
    const slots = await res.json();
    const table = qs("inspection_slots_table");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    
    tbody.innerHTML = "";
    
    const typeNames = {
      hardware: "Donanım",
      size: "Boyut",
      safety: "Güvenlik",
      software: "Yazılım",
      weight: "Ağırlık",
      custom: "Özel",
    };
    
    const statusNames = {
      scheduled: "Planlandı",
      completed: "Tamamlandı",
      passed: "Geçti",
      failed: "Kaldı",
      cancelled: "İptal",
      no_show: "Gelmedi",
    };
    
    slots.forEach((slot) => {
           const tr = document.createElement("tr");
           tr.innerHTML = `
        <td><input type="checkbox" class="inspection-select" data-slot-id="${slot.id}" /></td>
             <td>${escapeHtml(slot.team_number)}</td>
             <td>${escapeHtml(typeNames[slot.inspection_type] || slot.inspection_type)}</td>
             <td>${escapeHtml(slot.slot_date)}</td>
             <td>${escapeHtml(slot.slot_time)}</td>
             <td>${slot.duration_minutes} dk</td>
             <td>${escapeHtml(slot.station_name || "")}</td>
             <td>${escapeHtml(slot.inspector_name || "")}</td>
             <td>
               <select data-slot-id="${slot.id}" data-field="status" class="status-select">
                 <option value="scheduled" ${slot.status === "scheduled" ? "selected" : ""}>Planlandı</option>
                 <option value="completed" ${slot.status === "completed" ? "selected" : ""}>Tamamlandı</option>
                 <option value="passed" ${slot.status === "passed" ? "selected" : ""}>Geçti</option>
                 <option value="failed" ${slot.status === "failed" ? "selected" : ""}>Kaldı</option>
                 <option value="cancelled" ${slot.status === "cancelled" ? "selected" : ""}>İptal</option>
                 <option value="no_show" ${slot.status === "no_show" ? "selected" : ""}>Gelmedi</option>
               </select>
             </td>
             <td>
               <input type="text" data-slot-id="${slot.id}" data-field="notes" 
                      value="${escapeHtml(slot.notes || "")}" placeholder="Notlar" />
             </td>
             <td class="no-print">
               <button class="btn-danger" data-slot-id="${slot.id}">Sil</button>
             </td>
           `;
      
      // Durum değişikliği
      tr.querySelector(".status-select").addEventListener("change", async (e) => {
        const slotId = e.target.dataset.slotId;
        const newStatus = e.target.value;
        await updateInspectionSlot(slotId, { status: newStatus });
      });
      
      // Notlar değişikliği
      tr.querySelector('input[data-field="notes"]').addEventListener("blur", async (e) => {
        const slotId = e.target.dataset.slotId;
        const notes = e.target.value.trim();
        await updateInspectionSlot(slotId, { notes });
      });
      
      // Sil butonu
      tr.querySelector("button").addEventListener("click", async () => {
        if (confirm("Bu slotu silmek istediğinize emin misiniz?")) {
          await deleteInspectionSlot(slot.id);
        }
      });
      
      tbody.appendChild(tr);
    });
    
    // Adım durumunu güncelle
    if (typeof setStepStatus === "function") {
      setStepStatus("step-inspection-schedule", slots.length > 0 ? "Done" : "Not Started");
      if (typeof setStepCount === "function") {
        setStepCount("step-inspection-schedule", slots.length > 0 ? slots.length : null);
      }
    }
  } catch (err) {
    console.error("Load inspection slots error:", err);
    showToast("İnceleme slotları yüklenirken hata oluştu", "error");
  }
}

/**
 * Toplu inceleme slotu güncelleme
 * 
 * API: POST /api/inspection-slots/bulk-update
 */
async function bulkUpdateInspectionSlots() {
  const selectedIds = Array.from(document.querySelectorAll(".inspection-select:checked"))
    .map((cb) => Number(cb.dataset.slotId))
    .filter(Boolean);
  
  if (selectedIds.length === 0) {
    showToast("Lütfen güncellenecek slotları seçin", "warning");
    return;
  }
  
  const slotDate = qs("bulk_inspection_date")?.value || "";
  const slotTime = qs("bulk_inspection_time")?.value || "";
  const status = qs("bulk_inspection_status")?.value || "";
  const stationName = qs("bulk_inspection_station")?.value.trim() || "";
  const inspectorName = qs("bulk_inspection_inspector")?.value.trim() || "";
  
  if (!slotDate && !slotTime && !status && !stationName && !inspectorName) {
    showToast("Lütfen en az bir alan seçin", "warning");
    return;
  }
  
  try {
    setButtonLoading(qs("apply_inspection_bulk_update"), true);
    
    const res = await fetch("/api/inspection-slots/bulk-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slot_ids: selectedIds,
        slot_date: slotDate || undefined,
        slot_time: slotTime || undefined,
        status: status || undefined,
        station_name: stationName || undefined,
        inspector_name: inspectorName || undefined,
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
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Toplu güncelleme sırasında hata oluştu", "error");
      return;
    }
    
    const data = await res.json();
    showToast(`${data.updated_count} slot güncellendi`, "success");
    await loadInspectionSlots();
    if (qs("inspection_grid_view")?.style.display !== "none") {
      await renderInspectionGrid();
    }
  } catch (err) {
    console.error("Bulk update error:", err);
    showToast("Toplu güncelleme sırasında hata oluştu", "error");
  } finally {
    setButtonLoading(qs("apply_inspection_bulk_update"), false);
  }
}

/**
 * Yeni inceleme slotu oluşturur
 * 
 * API: POST /api/inspection-slots
 */
async function createInspectionSlot() {
  const teamNumber = qs("new_inspection_team")?.value.trim();
  const inspectionType = qs("new_inspection_type")?.value;
  const slotDate = qs("new_inspection_date")?.value;
  const slotTime = qs("new_inspection_time")?.value;
  const duration = Number(qs("new_inspection_duration")?.value || 15);
  const stationName = qs("new_inspection_station")?.value.trim() || "";
  const inspectorName = qs("new_inspection_inspector")?.value.trim() || "";
  
  if (!teamNumber || !inspectionType || !slotDate || !slotTime) {
    showToast("Lütfen tüm gerekli alanları doldurun", "warning");
    return;
  }
  
  try {
    setButtonLoading(qs("add_inspection_slot"), true);
    
    const res = await fetch("/api/inspection-slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_number: teamNumber,
        inspection_type: inspectionType,
        slot_date: slotDate,
        slot_time: slotTime,
        duration_minutes: duration,
        station_name: stationName,
        inspector_name: inspectorName,
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
      showToast(data.error || "Slot oluşturulurken hata oluştu", "error");
      return;
    }
    
    showToast("İnceleme slotu oluşturuldu", "success");
    
    // Formu temizle
    if (qs("new_inspection_team")) qs("new_inspection_team").value = "";
    if (qs("new_inspection_date")) qs("new_inspection_date").value = "";
    if (qs("new_inspection_time")) qs("new_inspection_time").value = "";
    if (qs("new_inspection_station")) qs("new_inspection_station").value = "";
    if (qs("new_inspection_inspector")) qs("new_inspection_inspector").value = "";
    
    await loadInspectionSlots();
    // Grid görünümündeyse yeniden render et
    if (qs("inspection_grid_view")?.style.display !== "none") {
      await renderInspectionGrid();
    }
  } catch (err) {
    console.error("Create inspection slot error:", err);
    showToast("Slot oluşturulurken hata oluştu", "error");
  } finally {
    setButtonLoading(qs("add_inspection_slot"), false);
  }
}

/**
 * İnceleme slotu günceller
 * 
 * API: PUT /api/inspection-slots/<slot_id>
 */
async function updateInspectionSlot(slotId, updates) {
  try {
    const res = await fetch(`/api/inspection-slots/${slotId}`, {
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
      showToast(data.error || "Slot güncellenirken hata oluştu", "error");
      return;
    }
    
    // Sessizce güncelle (toast gösterme)
    await loadInspectionSlots();
    // Grid görünümündeyse yeniden render et
    if (qs("inspection_grid_view")?.style.display !== "none") {
      await renderInspectionGrid();
    }
  } catch (err) {
    console.error("Update inspection slot error:", err);
    showToast("Slot güncellenirken hata oluştu", "error");
  }
}

/**
 * İnceleme slotu siler
 * 
 * API: DELETE /api/inspection-slots/<slot_id>
 */
async function deleteInspectionSlot(slotId) {
  try {
    const res = await fetch(`/api/inspection-slots/${slotId}`, {
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
      showToast(data.error || "Slot silinirken hata oluştu", "error");
      return;
    }
    
    showToast("İnceleme slotu silindi", "success");
    await loadInspectionSlots();
    // Grid görünümündeyse yeniden render et
    if (qs("inspection_grid_view")?.style.display !== "none") {
      await renderInspectionGrid();
    }
  } catch (err) {
    console.error("Delete inspection slot error:", err);
    showToast("Slot silinirken hata oluştu", "error");
  }
}

/**
 * Otomatik inceleme takvimi oluşturur
 * 
 * API: POST /api/inspection-slots/generate
 */
async function generateInspectionSlots() {
  const startDate = qs("inspection_start_date")?.value;
  const startTime = qs("inspection_start_time")?.value;
  const breakMinutes = Number(qs("inspection_break_minutes")?.value || 5);
  const inspectorNames = qs("inspection_inspectors")?.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  
  // Seçilen inceleme tiplerini topla (sadece süre ayarları bölümündeki checkbox'ları kullan)
  const inspectionTypes = [];
  document.querySelectorAll('#inspection_duration_settings input[type="checkbox"][data-inspection-type]:checked').forEach((cb) => {
    inspectionTypes.push(cb.dataset.inspectionType);
  });
  
  // İstasyon isimlerini topla
  const stationNames = [];
  document.querySelectorAll('.station-name-input').forEach((input) => {
    const name = input.value.trim();
    if (name) {
      stationNames.push(name);
    }
  });
  
  if (stationNames.length === 0) {
    showToast("Lütfen en az bir istasyon ismi girin", "warning");
    return;
  }
  
  const sortOrder = qs("inspection_sort_order")?.value || "ascending";
  
  if (!startDate || !startTime) {
    showToast("Lütfen başlangıç tarihi ve saatini girin", "warning");
    return;
  }
  
  if (inspectionTypes.length === 0) {
    showToast("Lütfen en az bir inceleme tipi seçin", "warning");
    return;
  }
  
  if (!confirm(`Tüm takımlar için ${inspectionTypes.length} inceleme tipi için otomatik takvim oluşturulsun mu?`)) {
    return;
  }
  
  try {
    setButtonLoading(qs("generate_inspection_slots"), true);
    
    const res = await fetch("/api/inspection-slots/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_date: startDate,
        start_time: startTime,
        inspection_types: inspectionTypes,
        break_minutes: breakMinutes,
        inspector_names: inspectorNames,
        station_names: stationNames,
        sort_order: sortOrder,
        clear_existing: qs("inspection_clear_existing")?.checked || false,
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
    showToast(`${data.created_count} inceleme slotu oluşturuldu`, "success");
    await loadInspectionSlots();
    // Grid görünümündeyse yeniden render et
    if (qs("inspection_grid_view")?.style.display !== "none") {
      await renderInspectionGrid();
    }
  } catch (err) {
    console.error("Generate inspection slots error:", err);
    showToast("Takvim oluşturulurken hata oluştu", "error");
  } finally {
    setButtonLoading(qs("generate_inspection_slots"), false);
  }
}

/**
 * Tüm inceleme slotlarını siler
 * 
 * API: DELETE /api/inspection-slots
 */
async function deleteAllInspectionSlots() {
  if (!confirm("Tüm inceleme slotlarını silmek istediğinize emin misiniz? Bu işlem geri alınamaz!")) {
    return;
  }
  
  try {
    setButtonLoading(qs("delete_all_inspection_slots"), true);
    
    const res = await fetch("/api/inspection-slots", {
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
      showToast(data.error || "Slotlar silinirken hata oluştu", "error");
      return;
    }
    
    const data = await res.json();
    showToast(`${data.deleted_count} inceleme slotu silindi`, "success");
    await loadInspectionSlots();
    // Grid görünümündeyse yeniden render et
    if (qs("inspection_grid_view")?.style.display !== "none") {
      await renderInspectionGrid();
    }
  } catch (err) {
    console.error("Delete all inspection slots error:", err);
    showToast("Slotlar silinirken hata oluştu", "error");
  } finally {
    setButtonLoading(qs("delete_all_inspection_slots"), false);
  }
}

/**
 * İnceleme tipi seçildiğinde süreyi otomatik doldur
 */
async function updateInspectionDuration() {
  const type = qs("new_inspection_type")?.value;
  if (!type) return;
  
  // Süreleri API'den al
  try {
    const res = await fetch("/api/inspection-settings");
    if (res.ok) {
      const data = await res.json();
      const durationInput = qs("new_inspection_duration");
      if (durationInput) {
        durationInput.value = data.type_durations[type] || 15;
      }
    }
  } catch (err) {
    console.error("Load inspection settings error:", err);
  }
}

/**
 * İnceleme tipi sürelerini yükler ve UI'da gösterir
 * 
 * API: GET /api/inspection-settings
 */
async function loadInspectionDurations() {
  try {
    const res = await fetch("/api/inspection-settings");
    if (!res.ok) return;
    
    const data = await res.json();
    const durations = data.type_durations || {
      hardware: 20,
      size: 10,
      safety: 15,
      software: 15,
      weight: 5,
      custom: 15,
    };
    
    // Seçili tipleri yükle (varsayılan olarak hardware, size, safety seçili)
    const selectedTypes = data.selected_types || ["hardware", "size", "safety"];
    
    // Süre input'larını güncelle
    document.querySelectorAll('#inspection_duration_settings input[data-duration-input]').forEach((input) => {
      const type = input.dataset.inspectionType;
      if (durations[type] !== undefined) {
        input.value = durations[type];
      }
    });
    
    // Checkbox'ları güncelle (seçili tipler)
    document.querySelectorAll('#inspection_duration_settings input[type="checkbox"][data-inspection-type]').forEach((checkbox) => {
      const type = checkbox.dataset.inspectionType;
      checkbox.checked = selectedTypes.includes(type);
    });
  } catch (err) {
    console.error("Load inspection durations error:", err);
    showToast("İnceleme süreleri yüklenirken hata oluştu", "error");
  }
}

/**
 * İnceleme tipi sürelerini kaydeder
 * 
 * API: POST /api/inspection-settings
 */
async function saveInspectionDurations() {
  const durations = {};
  const selectedTypes = [];
  
  // Süre input'larını topla
  document.querySelectorAll('#inspection_duration_settings input[data-duration-input]').forEach((input) => {
    const type = input.dataset.inspectionType;
    durations[type] = Number(input.value) || 15;
  });
  
  // Seçili checkbox'ları topla
  document.querySelectorAll('#inspection_duration_settings input[type="checkbox"][data-inspection-type]:checked').forEach((checkbox) => {
    selectedTypes.push(checkbox.dataset.inspectionType);
  });
  
  try {
    setButtonLoading(qs("save_inspection_durations"), true);
    
    const res = await fetch("/api/inspection-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        type_durations: durations,
        selected_types: selectedTypes 
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
      showToast(data.error || "Süreler kaydedilirken hata oluştu", "error");
      return;
    }
    
    showToast("İnceleme tipi süreleri kaydedildi", "success");
    await loadInspectionDurations(); // UI'ı güncelle
  } catch (err) {
    console.error("Save inspection durations error:", err);
    showToast("Süreler kaydedilirken hata oluştu", "error");
  } finally {
    setButtonLoading(qs("save_inspection_durations"), false);
  }
}

/**
 * Grid takvim görünümünü oluşturur
 */
async function renderInspectionGrid() {
  const gridContainer = qs("inspection_schedule_grid");
  if (!gridContainer) return;
  
  let selectedDate = qs("grid_view_date")?.value;
  // Eğer tarih seçilmemişse, varsayılan olarak bugünün tarihini veya etkinliğin başlangıç tarihini kullan
  if (!selectedDate) {
    try {
      const eventRes = await fetch("/api/event");
      if (eventRes.ok) {
        const event = await eventRes.json();
        if (event.dates?.start) {
          selectedDate = event.dates.start;
          if (qs("grid_view_date")) {
            qs("grid_view_date").value = selectedDate;
          }
        }
      }
    } catch (err) {
      // Hata durumunda bugünün tarihini kullan
    }
    if (!selectedDate) {
      const today = new Date().toISOString().split("T")[0];
      selectedDate = today;
      if (qs("grid_view_date")) {
        qs("grid_view_date").value = selectedDate;
      }
    }
  }
  if (!selectedDate) {
    gridContainer.innerHTML = "<p style='padding: 16px; text-align: center; color: #666;'>Lütfen bir tarih seçin</p>";
    return;
  }
  
  // Slotları yükle
  const res = await fetch(`/api/inspection-slots?date=${selectedDate}`);
  if (!res.ok) {
    gridContainer.innerHTML = "<p style='padding: 16px; text-align: center; color: #f44336;'>Slotlar yüklenirken hata oluştu</p>";
    return;
  }
  
  const slots = await res.json();
  
  // Takımları al
  const teamsRes = await fetch("/api/teams");
  const teams = teamsRes.ok ? await teamsRes.json() : [];
  
  // Zaman aralığını belirle
  const startTime = qs("grid_start_time")?.value || "08:00";
  const endTime = qs("grid_end_time")?.value || "20:00";
  const slotWidth = Number(qs("grid_slot_width")?.value || 15);
  
  // Zaman slotlarını oluştur
  const timeSlots = [];
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);
  let currentTime = new Date(2000, 0, 1, startHour, startMin);
  const endDateTime = new Date(2000, 0, 1, endHour, endMin);
  
  while (currentTime <= endDateTime) {
    const timeStr = `${String(currentTime.getHours()).padStart(2, '0')}:${String(currentTime.getMinutes()).padStart(2, '0')}`;
    timeSlots.push(timeStr);
    currentTime = new Date(currentTime.getTime() + slotWidth * 60000);
  }
  
  // İnceleme tipi renkleri
  const typeColors = {
    hardware: "#e74c3c",    // Kırmızı
    size: "#3498db",        // Mavi
    safety: "#2ecc71",      // Yeşil
    software: "#f39c12",    // Turuncu
    weight: "#9b59b6",      // Mor
    custom: "#95a5a6",      // Gri
  };
  
  const typeNames = {
    hardware: "Donanım",
    size: "Boyut",
    safety: "Güvenlik",
    software: "Yazılım",
    weight: "Ağırlık",
    custom: "Özel",
  };
  
  // Grid container genişliğini al ve slot genişliğini dinamik olarak ayarla
  const containerWidth = gridContainer.clientWidth || 1200; // Varsayılan genişlik
  const availableWidth = containerWidth - 120; // Takım sütunu için alan bırak
  const timeSlotCount = timeSlots.length;
  const calculatedSlotWidth = Math.max(40, Math.floor(availableWidth / timeSlotCount)); // Minimum 40px
  
  // Grid HTML'i oluştur
  let html = `
    <table style="width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed;">
      <thead>
        <tr>
          <th style="position: sticky; left: 0; background: #f5f6fa; z-index: 5; padding: 6px; border: 1px solid #e1e4ee; width: 100px; text-align: left;">Takım</th>
  `;
  
  timeSlots.forEach((time) => {
    html += `<th style="padding: 6px; border: 1px solid #e1e4ee; width: ${calculatedSlotWidth}px; text-align: center; background: #f5f6fa; font-size: 10px;">${time}</th>`;
  });
  
  html += `</tr></thead><tbody>`;
  
  // Takım bazlı slotları grupla
  const teamSlots = {};
  slots.forEach((slot) => {
    if (slot.slot_date !== selectedDate) return;
    if (!teamSlots[slot.team_number]) {
      teamSlots[slot.team_number] = [];
    }
    teamSlots[slot.team_number].push(slot);
  });
  
  // Her takım için satır
  teams.forEach((team) => {
    const teamNumber = team.number || "";
    if (!teamNumber) return;
    
    html += `<tr data-team-number="${escapeHtml(teamNumber)}">`;
    html += `<td style="position: sticky; left: 0; background: #ffffff; z-index: 4; padding: 6px; border: 1px solid #e1e4ee; font-weight: 600; width: 100px; font-size: 11px;">${escapeHtml(teamNumber)}</td>`;
    
    // Bu takımın slotlarını al
    const teamSlotList = teamSlots[teamNumber] || [];
    
    // Her zaman slotu için hücre
    let lastSlotEnd = -1; // Son slot'un bitiş zamanı (dakika cinsinden)
    timeSlots.forEach((timeSlot, timeIndex) => {
      const [timeHour, timeMin] = timeSlot.split(":").map(Number);
      const timeStart = timeHour * 60 + timeMin;
      const timeEnd = timeStart + slotWidth;
      
      // Eğer bu hücre önceki bir slot tarafından kaplanmışsa, atla
      if (timeStart < lastSlotEnd) {
        return; // Bu hücreyi oluşturma, colspan ile zaten kaplandı
      }
      lastSlotEnd = -1; // Reset
      
      // Bu zaman slotunda başlayan slot var mı?
      const slot = teamSlotList.find((s) => {
        const [slotHour, slotMin] = s.slot_time.split(":").map(Number);
        const slotStart = slotHour * 60 + slotMin;
        // Slot bu zaman slotunda başlıyor mu?
        return slotStart >= timeStart && slotStart < timeEnd;
      });
      
      if (slot) {
        const color = typeColors[slot.inspection_type] || "#95a5a6";
        const typeName = typeNames[slot.inspection_type] || slot.inspection_type;
        const inspector = slot.inspector_name ? ` (${escapeHtml(slot.inspector_name)})` : "";
        const stationName = slot.station_name ? slot.station_name : "";
        const stationInfo = stationName ? ` - İstasyon: ${escapeHtml(stationName)}` : "";
        const cellLabel = stationName ? `${typeName.charAt(0)} ${stationName}` : typeName.charAt(0);
        
        // Slot kaç hücre kaplıyor?
        const slotDuration = slot.duration_minutes;
        const [slotHour, slotMin] = slot.slot_time.split(":").map(Number);
        const slotStart = slotHour * 60 + slotMin;
        const slotEnd = slotStart + slotDuration;
        const colspan = Math.max(1, Math.ceil(slotDuration / slotWidth));
        
        lastSlotEnd = slotEnd; // Son slot'un bitiş zamanını kaydet
        
        html += `<td style="padding: 2px 4px; border: 1px solid #e1e4ee; background: ${color}; color: white; text-align: center; cursor: pointer; position: relative; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" 
                     title="${escapeHtml(typeName)}${stationInfo}${inspector} - ${slot.duration_minutes} dk - ${slot.slot_time}"
                     data-slot-id="${slot.id}"
                     data-team-number="${escapeHtml(teamNumber)}"
                     data-slot-time="${escapeHtml(slot.slot_time)}"
                     colspan="${colspan}">${escapeHtml(cellLabel)}</td>`;
      } else {
        html += `<td style="padding: 2px; border: 1px solid #e1e4ee; background: #ffffff; min-width: ${calculatedSlotWidth}px;"
                     data-team-number="${escapeHtml(teamNumber)}"
                     data-slot-time="${escapeHtml(timeSlot)}"></td>`;
      }
    });
    
    html += `</tr>`;
  });
  
  html += `</tbody></table>`;
  
  gridContainer.innerHTML = html;
  
  // Slot'a tıklama ile düzenleme (opsiyonel)
  gridContainer.querySelectorAll('td[data-slot-id]').forEach((cell) => {
    // Drag & drop desteği
    cell.setAttribute("draggable", "true");
    cell.addEventListener("dragstart", (e) => {
      const slotId = cell.dataset.slotId;
      const teamNumber = cell.dataset.teamNumber;
      if (!slotId || !teamNumber) return;
      e.dataTransfer.setData("text/plain", JSON.stringify({ slotId, teamNumber }));
    });
    
    cell.addEventListener('click', () => {
      const slotId = cell.dataset.slotId;
      // Slot detaylarını göster veya düzenle
      const slot = slots.find(s => s.id == slotId);
      if (slot) {
        const typeName = typeNames[slot.inspection_type] || slot.inspection_type;
        alert(`Slot Detayları:\nTakım: ${slot.team_number}\nTip: ${typeName}\nTarih: ${slot.slot_date}\nSaat: ${slot.slot_time}\nSüre: ${slot.duration_minutes} dk\nMüfettiş: ${slot.inspector_name || "Atanmamış"}\nDurum: ${slot.status}`);
      }
    });
  });
  
  // Drop hedefleri (boş hücreler)
  gridContainer.querySelectorAll('td[data-slot-time]:not([data-slot-id])').forEach((cell) => {
    cell.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    cell.addEventListener("drop", async (e) => {
      e.preventDefault();
      try {
        const payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
        if (!payload.slotId || !payload.teamNumber) return;
        
        const targetTeam = cell.dataset.teamNumber;
        const targetTime = cell.dataset.slotTime;
        if (!targetTeam || !targetTime) return;
        
        // Sadece aynı takım satırında sürüklemeye izin ver
        if (targetTeam !== payload.teamNumber) {
          showToast("Slot sadece kendi takım satırında taşınabilir", "warning");
          return;
        }
        
        const selectedDate = qs("grid_view_date")?.value;
        if (!selectedDate) return;
        
        await updateInspectionSlot(payload.slotId, {
          slot_date: selectedDate,
          slot_time: targetTime,
        });
      } catch (err) {
        console.error("Drag drop error:", err);
        showToast("Slot taşınırken hata oluştu", "error");
      }
    });
  });
}

/**
 * Görünüm değiştirme (Liste/Grid)
 */
function switchInspectionView(view) {
  const listView = qs("inspection_list_view");
  const gridView = qs("inspection_grid_view");
  const listBtn = qs("view_list");
  const gridBtn = qs("view_grid");
  
  if (view === "grid") {
    if (listView) listView.style.display = "none";
    if (gridView) gridView.style.display = "block";
    listBtn?.classList.remove("active");
    gridBtn?.classList.add("active");
    renderInspectionGrid();
  } else {
    if (listView) listView.style.display = "block";
    if (gridView) gridView.style.display = "none";
    listBtn?.classList.add("active");
    gridBtn?.classList.remove("active");
  }
}

/**
 * İstasyon ekleme fonksiyonu
 */
function addInspectionStation() {
  const container = qs("inspection_stations_container");
  if (!container) return;
  
  const stationCount = container.querySelectorAll(".station-input-group").length + 1;
  const newGroup = document.createElement("div");
  newGroup.className = "station-input-group";
  newGroup.style.cssText = "display: flex; gap: 8px; margin-bottom: 8px; align-items: center;";
  newGroup.innerHTML = `
    <input type="text" class="station-name-input" placeholder="İstasyon ${stationCount}" value="İstasyon ${stationCount}" style="flex: 1;" />
    <button type="button" class="btn-danger remove-station-btn" style="padding: 4px 8px; font-size: 12px;">Sil</button>
  `;
  container.appendChild(newGroup);
}

/**
 * İstasyon silme fonksiyonu
 */
function removeInspectionStation(groupElement) {
  const container = qs("inspection_stations_container");
  if (!container || !groupElement) return;
  
  const stationCount = container.querySelectorAll(".station-input-group").length;
  if (stationCount <= 1) {
    showToast("En az bir istasyon olmalıdır", "warning");
    return;
  }
  
  groupElement.remove();
}

/**
 * İnceleme programını yazdırır
 */
function printInspectionSchedule() {
  const printArea = qs("inspection_slots_print_area");
  if (!printArea) {
    showToast("Yazdırılacak içerik bulunamadı", "error");
    return;
  }
  
  // Yazdırma için yeni pencere aç
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("Pop-up engelleyici nedeniyle yazdırma penceresi açılamadı", "error");
    return;
  }
  
  // Etkinlik bilgilerini al
  fetch("/api/event")
    .then(res => res.ok ? res.json() : {})
    .then(event => {
      const eventName = event.name || "Etkinlik";
      const eventCode = event.code || "";
      
      // Yazdırma için HTML oluştur
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>İnceleme Programı - ${escapeHtml(eventName)}</title>
          <style>
            @page {
              margin: 1cm;
            }
            body {
              font-family: Arial, sans-serif;
              font-size: 12px;
              margin: 0;
              padding: 16px;
            }
            h1 {
              font-size: 18px;
              margin: 0 0 8px 0;
            }
            h2 {
              font-size: 14px;
              margin: 16px 0 8px 0;
              color: #333;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 16px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 6px 8px;
              text-align: left;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
            }
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            .print-header {
              margin-bottom: 16px;
              padding-bottom: 8px;
              border-bottom: 2px solid #333;
            }
            .print-footer {
              margin-top: 16px;
              padding-top: 8px;
              border-top: 1px solid #ddd;
              font-size: 10px;
              color: #666;
              text-align: center;
            }
            @media print {
              body {
                padding: 0;
              }
              .no-print {
                display: none !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <h1>İnceleme Programı</h1>
            <p><strong>Etkinlik:</strong> ${escapeHtml(eventName)} ${eventCode ? `(${escapeHtml(eventCode)})` : ""}</p>
            <p><strong>Tarih:</strong> ${new Date().toLocaleDateString("tr-TR")}</p>
          </div>
          ${printArea.innerHTML}
          <div class="print-footer">
            <p>Bu belge ${new Date().toLocaleString("tr-TR")} tarihinde yazdırılmıştır.</p>
          </div>
        </body>
        </html>
      `);
      
      printWindow.document.close();
      
      // Yazdırma penceresini aç ve yazdır
      setTimeout(() => {
        printWindow.print();
      }, 250);
    })
    .catch(err => {
      console.error("Print error:", err);
      showToast("Yazdırma sırasında hata oluştu", "error");
      printWindow.close();
    });
}
