/**
 * Etkinlik Yönetimi Modülü
 * 
 * Etkinlik verilerini yükleme, kaydetme, özel alanlar yönetimi vb.
 */

// Sabitler
const eventFields = [
  "event_name",
  "event_code",
  "season",
  "start_date",
  "end_date",
  "timezone",
  "venue",
  "city",
  "country",
  "org_name",
  "contact_name",
  "contact_email",
  "contact_phone",
  "divisions",
  "fields",
  "teams_per_alliance",
  "alliances",
  "auto_seconds",
  "teleop_seconds",
  "endgame_seconds",
  "match_cycle_seconds",
  "allow_remote_scoring",
  "scoring_notes",
];

let originalEventCode = "";

/**
 * Aktif etkinliğin bilgilerini yükler ve form alanlarına doldurur
 * 
 * API: GET /api/event
 * 
 * Yüklenen veriler:
 * - Etkinlik bilgileri (ad, kod, sezon, tarihler)
 * - Konum bilgileri
 * - Organizasyon bilgileri
 * - Format ayarları
 * - Maç süreleri
 * - Skorlama ayarları
 * - Esnek alanlar
 */
async function loadEvent() {
  try {
    const res = await fetch("/api/event");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) {
      showToast("Etkinlik bilgileri yüklenemedi", "error");
      return;
    }
    const data = await res.json();

    // Null check'ler - element yoksa hata vermemesi için
    if (qs("event_name")) qs("event_name").value = data.name || "";
    if (qs("event_code")) qs("event_code").value = data.code || "";
    originalEventCode = data.code || ""; // Store original code for change detection
    if (qs("season")) qs("season").value = data.season || "";
    if (qs("start_date")) qs("start_date").value = data.dates?.start || "";
    if (qs("end_date")) qs("end_date").value = data.dates?.end || "";
    if (qs("timezone")) qs("timezone").value = data.dates?.timezone || "Europe/Istanbul";

    if (qs("venue")) qs("venue").value = data.location?.venue || "";
    if (qs("city")) qs("city").value = data.location?.city || "";
    if (qs("country")) qs("country").value = data.location?.country || "TR";

    if (qs("org_name")) qs("org_name").value = data.organizer?.organization || "";
    if (qs("contact_name")) qs("contact_name").value = data.organizer?.contact_name || "";
    if (qs("contact_email")) qs("contact_email").value = data.organizer?.email || "";
    if (qs("contact_phone")) qs("contact_phone").value = data.organizer?.phone || "";

    if (qs("divisions")) qs("divisions").value = (data.format?.divisions || ["Genel"]).join(", ");
    if (qs("fields")) qs("fields").value = data.format?.fields ?? 1;
    if (qs("teams_per_alliance")) qs("teams_per_alliance").value = data.format?.teams_per_alliance ?? 2;
    if (qs("alliances")) qs("alliances").value = data.format?.alliances ?? 2;

    if (qs("auto_seconds")) qs("auto_seconds").value = data.schedule?.auto_seconds ?? 0;
    if (qs("teleop_seconds")) qs("teleop_seconds").value = data.schedule?.teleop_seconds ?? 120;
    if (qs("endgame_seconds")) qs("endgame_seconds").value = data.schedule?.endgame_seconds ?? 30;
    if (qs("match_cycle_seconds")) qs("match_cycle_seconds").value = data.schedule?.match_cycle_seconds ?? 150;

    if (qs("allow_remote_scoring")) qs("allow_remote_scoring").checked = !!data.scoring?.allow_remote_scoring;
    if (qs("scoring_notes")) qs("scoring_notes").value = data.scoring?.notes || "";

    loadCustomFields(data.custom_fields || []);
    if (typeof updateStepStatuses === "function") {
      updateStepStatuses(data);
    }
    updateMatchCycle();
  } catch (err) {
    console.error("Load event error:", err);
    showToast("Etkinlik bilgileri yüklenirken hata oluştu", "error");
  }
}

/**
 * Form alanlarından etkinlik verisini toplar
 * 
 * @returns {Object} Etkinlik verisi (API'ye gönderilecek format)
 * 
 * Toplanan veriler:
 * - Etkinlik temel bilgileri
 * - Konum, organizasyon, format
 * - Maç süreleri ve skorlama ayarları
 * - Esnek alanlar (custom fields)
 */
function collectEvent() {
  const divisions = qs("divisions")
    .value.split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  return {
    name: qs("event_name").value.trim(),
    code: qs("event_code").value.trim(),
    season: qs("season").value.trim(),
    location: {
      venue: qs("venue").value.trim(),
      city: qs("city").value.trim(),
      country: qs("country").value.trim(),
    },
    dates: {
      start: qs("start_date").value,
      end: qs("end_date").value,
      timezone: qs("timezone").value.trim(),
    },
    organizer: {
      organization: qs("org_name").value.trim(),
      contact_name: qs("contact_name").value.trim(),
      email: qs("contact_email").value.trim(),
      phone: qs("contact_phone").value.trim(),
    },
    format: {
      divisions: divisions.length ? divisions : ["Genel"],
      fields: Number(qs("fields").value || 1),
      teams_per_alliance: Number(qs("teams_per_alliance").value || 2),
      alliances: Number(qs("alliances").value || 2),
    },
    schedule: {
      auto_seconds: Number(qs("auto_seconds").value || 0),
      teleop_seconds: Number(qs("teleop_seconds").value || 120),
      endgame_seconds: Number(qs("endgame_seconds").value || 30),
      match_cycle_seconds: Number(qs("match_cycle_seconds").value || 150),
    },
    scoring: {
      allow_remote_scoring: qs("allow_remote_scoring").checked,
      notes: qs("scoring_notes").value.trim(),
    },
    custom_fields: collectCustomFields(),
  };
}

/**
 * Etkinlik verisini kaydeder
 * 
 * API: POST /api/event
 * 
 * Validasyonlar:
 * - Etkinlik kodu (max 4 karakter)
 * - Tarih aralığı (bitiş >= başlangıç)
 * - E-posta formatı
 */
async function saveEvent() {
  const payload = collectEvent();
  
  // Validations
  if (!validateEventCode(payload.code)) {
    qs("event_code").focus();
    return;
  }
  
  if (!validateDates(payload.dates.start, payload.dates.end)) {
    qs("end_date").focus();
    return;
  }
  
  if (!validateEmail(payload.organizer.email)) {
    qs("contact_email").focus();
    return;
  }
  
  // Check if event code changed
  if (originalEventCode && payload.code !== originalEventCode) {
    const confirmed = window.confirm(
      "Etkinlik kodu değiştirildi. Bu değişiklik varsayılan kullanıcı hesaplarını etkileyebilir. Devam etmek istiyor musunuz?"
    );
    if (!confirmed) {
      qs("event_code").value = originalEventCode;
      return;
    }
  }
  
  const button = qs("save-event");
  setButtonLoading(button, true);
  
  try {
    const res = await fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
    
    if (res.ok) {
      originalEventCode = payload.code; // Update stored code
      showToast("Etkinlik başarıyla kaydedildi", "success");
      if (typeof loadUsers === "function") {
        loadUsers(); // Refresh user list if event code changed
      }
    } else {
      const error = await res.json().catch(() => ({ error: "Bilinmeyen hata" }));
      showToast(`Kaydetme başarısız: ${error.error || res.statusText}`, "error");
    }
  } catch (err) {
    console.error("Save event error:", err);
    showToast(`Kaydetme sırasında hata oluştu: ${err.message}`, "error");
  } finally {
    setButtonLoading(button, false);
  }
}

/**
 * Özel alanları yükler ve tabloya ekler
 * @param {Array} fields - Özel alan listesi [{key, value}, ...]
 */
function loadCustomFields(fields) {
  const table = qs("custom_table");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  fields.forEach((field) => addCustomRow(field.key || "", field.value || ""));
}

/**
 * Özel alanları formdan toplar
 * @returns {Array} Özel alan listesi [{key, value}, ...]
 */
function collectCustomFields() {
  const table = qs("custom_table");
  if (!table) return [];
  const tbody = table.querySelector("tbody");
  if (!tbody) return [];
  const rows = tbody.querySelectorAll("tr");
  const fields = [];
  rows.forEach((row) => {
    const key = row.querySelector('input[data-field="key"]')?.value.trim() || "";
    const value = row.querySelector('input[data-field="value"]')?.value.trim() || "";
    if (key || value) {
      fields.push({ key, value });
    }
  });
  return fields;
}

/**
 * Özel alan satırı ekler
 * @param {string} key - Alan anahtarı
 * @param {string} value - Alan değeri
 */
function addCustomRow(key = "", value = "") {
  const table = qs("custom_table");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" data-field="key" value="${escapeHtml(key)}" placeholder="Anahtar" /></td>
    <td><input type="text" data-field="value" value="${escapeHtml(value)}" placeholder="Değer" /></td>
    <td><button type="button">Sil</button></td>
  `;
  tbody.appendChild(tr);
  tr.querySelector("button").addEventListener("click", () => tr.remove());
}

/**
 * Toplam döngü süresini günceller (otomatik hesaplama)
 */
function updateMatchCycle() {
  const autoSeconds = Number(qs("auto_seconds")?.value || 0);
  const teleopSeconds = Number(qs("teleop_seconds")?.value || 0);
  const total = autoSeconds + teleopSeconds;
  if (qs("match_cycle_seconds")) {
    qs("match_cycle_seconds").value = total;
  }
}

/**
 * Tüm etkinlikleri yükler ve dropdown'a ekler
 * 
 * API: GET /api/events
 */
async function loadEvents() {
  try {
    const res = await fetch("/api/events");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) {
      showToast("Etkinlikler yüklenemedi", "error");
      return;
    }
    const events = await res.json();
    const selector = qs("event_selector");
    if (!selector) return;
    selector.innerHTML = "";
    events.forEach((event) => {
      const option = document.createElement("option");
      option.value = String(event.id);
      option.textContent = event.name || `Etkinlik ${event.id}`;
      if (event.active) {
        option.selected = true;
      }
      selector.appendChild(option);
    });
  } catch (err) {
    console.error("Load events error:", err);
    showToast("Etkinlikler yüklenirken hata oluştu", "error");
  }
}
