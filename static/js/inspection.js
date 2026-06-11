/**
 * İnceleme Yönetimi Modülü
 * 
 * İnceleme slotları yönetimi, otomatik takvim oluşturma, grid görünümü vb.
 * 
 * Phase 1: FRC-Enhanced Inspection System
 * - 10 FRC-specific inspection types
 * - Checklist system for detailed inspections
 * - Status color coding (green/yellow/red)
 */

/**
 * FRC Inspection Types Configuration
 * 
 * Each type includes:
 * - id: Internal identifier (matches DB inspection_type field)
 * - name: Display name (Turkish)
 * - nameLatin: Latin/English name for reference
 * - icon: Emoji/icon for UI
 * - duration: Default duration in minutes
 * - order: Display/execution order (lower = earlier)
 * - optional: Whether this inspection is optional (e.g., pneumatics)
 * - color: Color code for grid view
 * - description: Brief description
 */
const FRC_INSPECTION_TYPES = {
  weight: {
    id: "weight",
    name: "Ağırlık",
    nameLatin: "Weight",
    icon: "⚖️",
    duration: 5,
    order: 1,
    optional: false,
    color: "#9b59b6", // Purple
    description: "Robot ağırlık ölçümü (batarya ile ≤56.7 kg)"
  },
  size: {
    id: "size",
    name: "Boyut",
    nameLatin: "Size",
    icon: "📏",
    duration: 10,
    order: 2,
    optional: false,
    color: "#3498db", // Blue
    description: "Robot boyut kontrolü (başlangıç: 120\" çevre)"
  },
  general_hardware: {
    id: "general_hardware",
    name: "Genel Donanım",
    nameLatin: "General Hardware",
    icon: "🔧",
    duration: 20,
    order: 3,
    optional: false,
    color: "#e74c3c", // Red
    description: "COTS parça uyumluluğu, malzeme kısıtlamaları, keskin kenarlar"
  },
  electrical: {
    id: "electrical",
    name: "Elektrik Sistemi",
    nameLatin: "Electrical",
    icon: "⚡",
    duration: 15,
    order: 4,
    optional: false,
    color: "#f39c12", // Orange
    description: "Ana devre kesici, batarya montajı, kablolama"
  },
  pneumatics: {
    id: "pneumatics",
    name: "Pnömatik Sistem",
    nameLatin: "Pneumatics",
    icon: "💨",
    duration: 10,
    order: 5,
    optional: true, // Only if robot uses pneumatics
    color: "#1abc9c", // Turquoise
    description: "Basınç emniyet valfi, regülatör, hortum yönlendirme (opsiyonel)"
  },
  radio: {
    id: "radio",
    name: "Radio/İletişim",
    nameLatin: "Radio/Communication",
    icon: "📡",
    duration: 10,
    order: 6,
    optional: false,
    color: "#34495e", // Dark gray
    description: "FRC Radio konfigürasyonu, bant genişliği uyumluluğu"
  },
  software: {
    id: "software",
    name: "Yazılım/Kontrol",
    nameLatin: "Software/Control",
    icon: "💻",
    duration: 15,
    order: 7,
    optional: false,
    color: "#16a085", // Green sea
    description: "RoboRIO yapılandırması, yazılım sürümleri, sürücü istasyonu"
  },
  bumpers: {
    id: "bumpers",
    name: "Tamponlar",
    nameLatin: "Bumpers",
    icon: "🛡️",
    duration: 5,
    order: 8,
    optional: false,
    color: "#c0392b", // Dark red
    description: "Tampon kuralları (renk, montaj, R-numarası)"
  },
  game_specific: {
    id: "game_specific",
    name: "Oyuna Özel",
    nameLatin: "Game-Specific",
    icon: "🎮",
    duration: 10,
    order: 9,
    optional: false,
    color: "#8e44ad", // Wisteria
    description: "Manipülatör uyumluluğu, başlangıç konfigürasyonu, yıla özel mekanizmalar"
  },
  safety: {
    id: "safety",
    name: "Güvenlik",
    nameLatin: "Safety",
    icon: "⚠️",
    duration: 15,
    order: 10,
    optional: false,
    color: "#2ecc71", // Green
    description: "Sıkışma noktaları güvenliği, acil durdurma işlevselliği"
  }
};

/**
 * Legacy type mappings for backward compatibility
 * Old type IDs → FRC type IDs
 */
const LEGACY_TYPE_MAPPINGS = {
  hardware: "general_hardware", // Renamed
  custom: "game_specific" // Mapped to game-specific
};

/**
 * Get inspection type metadata by ID
 * Supports both FRC and legacy type IDs
 */
function getInspectionType(typeId) {
  // Check if it's a legacy type that needs mapping
  const mappedId = LEGACY_TYPE_MAPPINGS[typeId] || typeId;
  return FRC_INSPECTION_TYPES[mappedId] || null;
}

/**
 * Get all inspection types sorted by order
 */
function getAllInspectionTypes() {
  return Object.values(FRC_INSPECTION_TYPES).sort((a, b) => a.order - b.order);
}

/**
 * Get type display name (with fallback for unknown types)
 */
function getTypeName(typeId) {
  const type = getInspectionType(typeId);
  return type ? type.name : typeId;
}

/**
 * Get type icon (with fallback)
 */
function getTypeIcon(typeId) {
  const type = getInspectionType(typeId);
  return type ? type.icon : "📋";
}

/**
 * Get type color (with fallback)
 */
function getTypeColor(typeId) {
  const type = getInspectionType(typeId);
  return type ? type.color : "#95a5a6";
}

/**
 * Bir inceleme tipi anahtarının ekranda gösterilecek bilgilerini döndürür.
 *
 * Gruplanan slotlar composite anahtar taşır ("size+general_hardware"). Bu durumda
 * üye tiplerin ikon ve isimleri birleştirilerek tek etikette gösterilir.
 *
 * @param {string} typeId - Tek tip ("size") veya composite ("size+general_hardware")
 * @returns {{name: string, label: string, icon: string, color: string, isGroup: boolean}}
 */
function describeInspectionType(typeId) {
  const raw = String(typeId || "");
  if (raw.includes("+")) {
    const members = raw.split("+").filter(Boolean);
    const names = members.map((m) => getTypeName(m));
    const icons = members.map((m) => getTypeIcon(m)).join("");
    const name = names.join(" + ");
    // Grup rengi: ilk üyenin rengi
    const color = getTypeColor(members[0]);
    return { name, label: `${icons} ${name}`.trim(), icon: icons, color, isGroup: true };
  }
  const info = getInspectionType(raw);
  const name = info ? info.name : raw;
  const icon = info ? info.icon : "📋";
  const color = info ? info.color : "#95a5a6";
  return { name, label: info ? `${icon} ${name}` : name, icon, color, isGroup: false };
}

/**
 * Gruplanan inceleme tipleri.
 * Her grup tek bir slotta birleştirilir ve ortak süre alır.
 * Biçim: { types: ["size", "general_hardware"], duration: 25 }
 */
let inspectionGroups = [];

/** Herhangi bir gruba dahil olan tüm tiplerin kümesini döndürür. */
function getGroupedInspectionTypes() {
  const set = new Set();
  inspectionGroups.forEach((g) => (g.types || []).forEach((t) => set.add(t)));
  return set;
}

/** Bir inceleme tipinin güncel süre kutusundaki değerini döndürür. */
function getMemberDuration(type) {
  const inp = document.querySelector(
    `#inspection_duration_settings input[data-duration-input][data-inspection-type="${type}"]`
  );
  if (inp && Number(inp.value) > 0) return Number(inp.value);
  return getInspectionType(type)?.duration || 15;
}

/** "6 seçili" rozetini güncel checked sayısına göre yeniler. */
function updateInspectionTypeCount() {
  const count = document.querySelectorAll(
    '#inspection_duration_settings input[type="checkbox"][data-inspection-type]:checked'
  ).length;
  const el = document.getElementById("inspection_type_count");
  if (el) el.textContent = count + " seçili";
}

/**
 * Grup üyesi tiplerin tekil chip'lerini devre dışı bırakır ve işaretler;
 * gruptan çıkanları tekrar aktif eder.
 */
function applyGroupStateToChips() {
  const grouped = getGroupedInspectionTypes();
  document.querySelectorAll("#inspection_duration_settings .insp-chip").forEach((chip) => {
    const cb = chip.querySelector('input[type="checkbox"][data-inspection-type]');
    if (!cb) return;
    const dur = chip.querySelector("input[data-duration-input]");
    const type = cb.dataset.inspectionType;
    if (grouped.has(type)) {
      cb.checked = false;
      cb.disabled = true;
      if (dur) dur.disabled = true;
      chip.classList.add("insp-chip-grouped");
      chip.title = "Bu tip bir grupta — değiştirmek için grubu çözün";
    } else {
      cb.disabled = false;
      if (dur) dur.disabled = false;
      chip.classList.remove("insp-chip-grouped");
      chip.title = "";
    }
  });
}

/** Gruplar listesini ekrana çizer. */
function renderInspectionGroups() {
  const container = document.getElementById("inspection_groups_list");
  if (!container) return;
  if (inspectionGroups.length === 0) {
    container.innerHTML =
      '<p style="color:#888;font-size:13px;margin:4px 0;">Henüz grup yok. Yukarıdan birden fazla tip seçip <strong>Seçilenleri Grupla</strong> deyin — grup tek slotta, ortak süreyle planlanır.</p>';
    return;
  }
  container.innerHTML = "";
  inspectionGroups.forEach((g, idx) => {
    const desc = describeInspectionType((g.types || []).join("+"));
    const defaultDur = g.duration || (g.types || []).reduce((s, t) => s + getMemberDuration(t), 0);
    g.duration = defaultDur;
    const pill = document.createElement("div");
    pill.className = "insp-group-pill";
    pill.innerHTML = `
      <span class="insp-group-label">${escapeHtml(desc.label)}</span>
      <label class="insp-group-dur">Ortak süre
        <input type="number" min="5" max="240" value="${defaultDur}" data-group-index="${idx}" /> dk
      </label>
      <button type="button" class="btn-danger insp-group-remove" data-group-index="${idx}">Çöz</button>
    `;
    container.appendChild(pill);
  });
  container.querySelectorAll("input[data-group-index]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const i = Number(inp.dataset.groupIndex);
      if (inspectionGroups[i]) inspectionGroups[i].duration = Number(inp.value) || undefined;
    });
  });
  container.querySelectorAll(".insp-group-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.groupIndex);
      inspectionGroups.splice(i, 1);
      applyGroupStateToChips();
      renderInspectionGroups();
      updateInspectionTypeCount();
    });
  });
}

/** Seçili (işaretli) tipleri tek bir gruba birleştirir. */
function groupSelectedInspectionTypes() {
  const selected = [];
  document
    .querySelectorAll('#inspection_duration_settings input[type="checkbox"][data-inspection-type]:checked')
    .forEach((cb) => {
      if (!cb.disabled) selected.push(cb.dataset.inspectionType);
    });
  if (selected.length < 2) {
    showToast("Gruplamak için en az 2 tip seçin", "warning");
    return;
  }
  const duration = selected.reduce((s, t) => s + getMemberDuration(t), 0);
  inspectionGroups.push({ types: selected, duration });
  applyGroupStateToChips();
  renderInspectionGroups();
  updateInspectionTypeCount();
  showToast(`${selected.length} tip tek slotta gruplandı`, "success");
}

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
    
    const params = {};
    if (team) params.team = team;
    if (type) params.type = type;
    if (date) params.date = date;
    if (status) params.status = status;
    
    const slots = await apiGet("/api/inspection-slots", params);
    const table = qs("inspection_slots_table");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    
    tbody.innerHTML = "";
    
    // DEPRECATED: Old hardcoded type names - Now using FRC_INSPECTION_TYPES
    // Kept for reference during migration
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
      in_progress: "Devam Ediyor",
      passed: "Geçti",
      passed_with_conditions: "Şartlı Geçti",
      failed: "Kaldı",
      pending_reinspection: "Yeniden İnceleme",
      cancelled: "İptal",
      no_show: "Gelmedi",
    };
    
    slots.forEach((slot) => {
           const tr = document.createElement("tr");
           
           // Get type metadata (composite/group anahtarlarını da çözer)
           const typeName = describeInspectionType(slot.inspection_type).label;

           // Apply status color class
           const statusClass = `status-${slot.status}`;
           tr.className = statusClass;
           
           tr.innerHTML = `
        <td><input type="checkbox" class="inspection-select" data-slot-id="${slot.id}" /></td>
             <td>${escapeHtml(slot.team_number)}</td>
             <td>${escapeHtml(typeName)}</td>
             <td>${escapeHtml(slot.slot_date)}</td>
             <td>${escapeHtml(slot.slot_time)}</td>
             <td>${slot.duration_minutes} dk</td>
             <td>${escapeHtml(slot.station_name || "")}</td>
             <td class="print-hide">${escapeHtml(slot.inspector_name || "")}</td>
             <td class="print-hide">
               <select data-slot-id="${slot.id}" data-field="status" class="status-select">
                 <option value="scheduled" ${slot.status === "scheduled" ? "selected" : ""}>Planlandı</option>
                 <option value="in_progress" ${slot.status === "in_progress" ? "selected" : ""}>Devam Ediyor</option>
                 <option value="passed" ${slot.status === "passed" ? "selected" : ""}>✓ Geçti</option>
                 <option value="passed_with_conditions" ${slot.status === "passed_with_conditions" ? "selected" : ""}>⚠ Şartlı Geçti</option>
                 <option value="failed" ${slot.status === "failed" ? "selected" : ""}>✗ Kaldı</option>
                 <option value="pending_reinspection" ${slot.status === "pending_reinspection" ? "selected" : ""}>🔄 Yeniden İnceleme</option>
                 <option value="cancelled" ${slot.status === "cancelled" ? "selected" : ""}>İptal</option>
                 <option value="no_show" ${slot.status === "no_show" ? "selected" : ""}>Gelmedi</option>
               </select>
             </td>
             <td class="print-hide">
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
    
    await apiPost("/api/inspection-slots/bulk-update", {
      slot_ids: selectedIds,
      slot_date: slotDate || undefined,
      slot_time: slotTime || undefined,
      status: status || undefined,
      station_name: stationName || undefined,
      inspector_name: inspectorName || undefined,
    });
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
    
    await apiPost("/api/inspection-slots", {
      team_number: teamNumber,
      inspection_type: inspectionType,
      slot_date: slotDate,
      slot_time: slotTime,
      duration_minutes: duration,
      station_name: stationName,
      inspector_name: inspectorName,
      status: "scheduled",
    });
    
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
    await apiPost(`/api/inspection-slots/${slotId}`, updates);
    
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
    await apiDelete(`/api/inspection-slots/${slotId}`);
    
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
  
  // İnceleme birimlerini (units) topla: önce gruplar (tek slot, ortak süre),
  // sonra gruba dahil olmayan tekil seçili tipler.
  const inspectionUnits = [];
  inspectionGroups.forEach((g) => {
    const duration = g.duration || g.types.reduce((s, t) => s + getMemberDuration(t), 0);
    inspectionUnits.push({ types: g.types.slice(), duration });
  });
  // Tekil seçili tipler (devre dışı = gruba dahil olanlar hariç)
  const inspectionTypes = [];
  document.querySelectorAll('#inspection_duration_settings input[type="checkbox"][data-inspection-type]:checked').forEach((cb) => {
    if (cb.disabled) return;
    inspectionTypes.push(cb.dataset.inspectionType);
    inspectionUnits.push({ types: [cb.dataset.inspectionType], duration: getMemberDuration(cb.dataset.inspectionType) });
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
  
  if (inspectionUnits.length === 0) {
    showToast("Lütfen en az bir inceleme tipi seçin", "warning");
    return;
  }

  const groupCount = inspectionGroups.length;
  const groupNote = groupCount > 0 ? ` (${groupCount} grup dahil)` : "";
  if (!confirm(`Tüm takımlar için ${inspectionUnits.length} inceleme bloğu${groupNote} için otomatik takvim oluşturulsun mu?`)) {
    return;
  }
  
  try {
    setButtonLoading(qs("generate_inspection_slots"), true);
    
    const data = await apiPost("/api/inspection-slots/generate", {
      start_date: startDate,
      start_time: startTime,
      inspection_types: inspectionTypes,
      inspection_units: inspectionUnits,
      break_minutes: breakMinutes,
      inspector_names: inspectorNames,
      station_names: stationNames,
      sort_order: sortOrder,
      clear_existing: qs("inspection_clear_existing")?.checked || false,
    });
    showToast(`${data.created_count} inceleme slotu oluşturuldu`, "success");
    await loadInspectionSlots();
    // Grid görünümündeyse yeniden render et
    if (qs("inspection_grid_view")?.style.display !== "none") {
      await renderInspectionGrid();
    }
    // Adım durumunu güncelle
    if (typeof checkAllStepStatuses === "function") {
      await checkAllStepStatuses();
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
    
    const data = await apiDelete("/api/inspection-slots");
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
    const data = await apiGet("/api/inspection-settings");
    const durationInput = qs("new_inspection_duration");
    if (durationInput) {
      durationInput.value = data.type_durations[type] || 15;
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
    const data = await apiGet("/api/inspection-settings");
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

    // Grupları yükle ve UI'a uygula
    inspectionGroups = (data.inspection_groups || [])
      .filter((g) => Array.isArray(g.types) && g.types.length >= 2)
      .map((g) => ({ types: g.types.slice(), duration: g.duration }));
    applyGroupStateToChips();
    renderInspectionGroups();
    updateInspectionTypeCount();

    if (qs("inspection_print_note")) {
      qs("inspection_print_note").value = data.print_note || "";
    }
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
    
    await apiPost("/api/inspection-settings", {
      type_durations: durations,
      selected_types: selectedTypes,
      inspection_groups: inspectionGroups.map((g) => ({ types: g.types, duration: g.duration })),
    });

    showToast("İnceleme tipi süreleri kaydedildi", "success");
    await loadInspectionDurations(); // UI'ı güncelle
    // Adım durumunu güncelle
    if (typeof checkAllStepStatuses === "function") {
      await checkAllStepStatuses();
    }
  } catch (err) {
    console.error("Save inspection durations error:", err);
    showToast("Süreler kaydedilirken hata oluştu", "error");
  } finally {
    setButtonLoading(qs("save_inspection_durations"), false);
  }
}

/**
 * Yazdırma notunu kaydeder
 */
async function saveInspectionPrintNote() {
  const printNote = qs("inspection_print_note")?.value || "";
  try {
    setButtonLoading(qs("save_inspection_print_note"), true);
    await apiPost("/api/inspection-settings", {
      print_note: printNote
    });
    showToast("Yazdırma notu kaydedildi", "success");
  } catch (err) {
    console.error("Save inspection print note error:", err);
    showToast("Yazdırma notu kaydedilirken hata oluştu", "error");
  } finally {
    setButtonLoading(qs("save_inspection_print_note"), false);
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
      const event = await apiGet("/api/event");
      if (event.dates?.start) {
        selectedDate = event.dates.start;
        if (qs("grid_view_date")) {
          qs("grid_view_date").value = selectedDate;
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
  try {
    const slots = await apiGet("/api/inspection-slots", { date: selectedDate });
    
    // Takımları al
    const teams = await apiGet("/api/teams");
  
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
      const timeStr = `${String(currentTime.getHours()).padStart(2, "0")}:${String(currentTime.getMinutes()).padStart(2, "0")}`;
      timeSlots.push(timeStr);
      currentTime = new Date(currentTime.getTime() + slotWidth * 60000);
    }
    
    // DEPRECATED: Old type colors - Now using FRC_INSPECTION_TYPES
    // Kept for backward compatibility during migration
    const typeColors = {
      hardware: "#e74c3c",    // Kırmızı
      size: "#3498db",        // Mavi
    safety: "#2ecc71",      // Yeşil
    software: "#f39c12",    // Turuncu
    weight: "#9b59b6",      // Mor
    custom: "#95a5a6",      // Gri
  };
  
  // DEPRECATED: Old type names - Now using FRC_INSPECTION_TYPES
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
        // Use FRC type system for color and name (composite/group anahtarları dahil)
        const typeDesc = describeInspectionType(slot.inspection_type);
        const color = typeDesc.color;
        const typeName = typeDesc.name;
        const typeIcon = typeDesc.icon;
        
        const inspector = slot.inspector_name ? ` (${escapeHtml(slot.inspector_name)})` : "";
        const stationName = slot.station_name ? slot.station_name : "";
        const stationInfo = stationName ? ` - İstasyon: ${escapeHtml(stationName)}` : "";
        const cellLabel = stationName ? `${typeIcon} ${stationName}` : typeIcon || typeName.charAt(0);
        
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
        const typeName = describeInspectionType(slot.inspection_type).label;
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
  } catch (err) {
    console.error("Render inspection grid error:", err);
    gridContainer.innerHTML =
      "<p style='padding: 16px; text-align: center; color: #666;'>İnceleme takvimi yüklenemedi</p>";
  }
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
async function printInspectionSchedule() {
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
  
  try {
    const [event, settings] = await Promise.all([
      apiGet("/api/event").catch(() => ({})),
      apiGet("/api/inspection-settings").catch(() => ({})),
    ]);
    const eventName = event.name || "Etkinlik";
    const eventCode = event.code || "";
    const note = settings.print_note || "";
      
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
              .print-hide {
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
          ${note ? `<p style="margin: 0 0 12px 0; font-size: 11px; color: #333;">${escapeHtml(note)}</p>` : ""}
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
  } catch (err) {
    console.error("Print error:", err);
    showToast("Yazdırma sırasında hata oluştu", "error");
    printWindow.close();
  }
}
