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
    const data = await apiGet("/api/event");

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

    if (typeof updateStepStatuses === "function") {
      updateStepStatuses(data);
    }
    updateMatchCycle();
    updateEventContextBanner(data);
  } catch (err) {
    console.error("Load event error:", err);
    showToast("Etkinlik bilgileri yüklenirken hata oluştu", "error");
  }
}

/**
 * Etkinlik seçimi bağlamını banner'da gösterir ve kaydetmeyi kontrol eder
 * @param {Object} eventData - Etkinlik verisi
 */
function updateEventContextBanner(eventData) {
  const banner = qs("event_context_banner");
  const nameEl = qs("event_context_name");
  const selector = qs("event_selector");
  const saveBtn = qs("save-event");
  const selectedName = selector?.selectedOptions?.[0]?.textContent?.trim() || "";
  const eventName = selectedName || eventData?.name || "";
  const hasEvent = eventName && eventName !== "Etkinlik yok - Yeni oluşturun";
  if (nameEl) {
    nameEl.textContent = eventName || "Etkinlik seçilmedi";
  }
  if (banner) {
    banner.classList.toggle("warning", !hasEvent);
    banner.classList.toggle("ok", hasEvent);
  }
  if (saveBtn) {
    saveBtn.disabled = !hasEvent;
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
  const divisionsRaw = qs("divisions")?.value || "";
  const divisions = divisionsRaw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  return {
    name: qs("event_name")?.value?.trim() || "",
    code: qs("event_code")?.value?.trim() || "",
    season: qs("season")?.value?.trim() || "",
    location: {
      venue: qs("venue")?.value?.trim() || "",
      city: qs("city")?.value?.trim() || "",
      country: qs("country")?.value?.trim() || "",
    },
    dates: {
      start: qs("start_date")?.value || "",
      end: qs("end_date")?.value || "",
      timezone: qs("timezone")?.value?.trim() || "Europe/Istanbul",
    },
    organizer: {
      organization: qs("org_name")?.value?.trim() || "",
      contact_name: qs("contact_name")?.value?.trim() || "",
      email: qs("contact_email")?.value?.trim() || "",
      phone: qs("contact_phone")?.value?.trim() || "",
    },
    format: {
      divisions: divisions.length ? divisions : ["Genel"],
      fields: Number(qs("fields")?.value || 1),
      teams_per_alliance: Number(qs("teams_per_alliance")?.value || 2),
      alliances: Number(qs("alliances")?.value || 2),
    },
    schedule: {
      auto_seconds: Number(qs("auto_seconds")?.value || 0),
      teleop_seconds: Number(qs("teleop_seconds")?.value || 120),
      endgame_seconds: Number(qs("endgame_seconds")?.value || 30),
      match_cycle_seconds: Number(qs("match_cycle_seconds")?.value || 150),
    },
    scoring: {},
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
  const selector = qs("event_selector");
  if (selector && !Number(selector.value || 0)) {
    showToast("Önce 'Yeni' ile etkinlik oluşturun ve seçin.", "warning");
    return;
  }
  
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
      if (qs("event_code")) {
        qs("event_code").value = originalEventCode;
      }
      return;
    }
  }
  
  const button = qs("save-event");
  setButtonLoading(button, true);
  
  try {
    await apiPost("/api/event", payload);
    originalEventCode = payload.code; // Update stored code
    showToast("Etkinlik başarıyla kaydedildi", "success");
    if (typeof loadEvents === "function") {
      await loadEvents();
    }
    updateEventContextBanner(payload);
    // Adım durumunu güncelle
    if (typeof setStepStatus === "function") {
      setStepStatus("step-event", "Done");
    }
    if (typeof checkAllStepStatuses === "function") {
      await checkAllStepStatuses();
    }
    if (typeof loadUsers === "function") {
      loadUsers(); // Refresh user list if event code changed
    }
  } catch (err) {
    console.error("Save event error:", err);
    showToast(`Kaydetme sırasında hata oluştu: ${err.message}`, "error");
  } finally {
    setButtonLoading(button, false);
  }
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
    const events = await apiGet("/api/events");
    const selector = qs("event_selector");
    if (!selector) return;
    selector.innerHTML = "";
    let hasActive = false;
    
    if (!events || events.length === 0) {
      // Etkinlik yoksa placeholder ekle
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Etkinlik yok - Yeni oluşturun";
      placeholder.disabled = true;
      placeholder.selected = true;
      selector.appendChild(placeholder);
      return;
    }
    
    events.forEach((event) => {
      const option = document.createElement("option");
      option.value = String(event.id);
      option.textContent = event.name || `Etkinlik ${event.id}`;
      if (event.active) {
        option.selected = true;
        hasActive = true;
      }
      selector.appendChild(option);
    });
    const storedId = window.localStorage?.getItem("active_event_id");
    if (!hasActive && storedId && selector.querySelector(`option[value="${storedId}"]`)) {
      selector.value = storedId;
      try {
        await apiPost("/api/events/active", { id: Number(storedId) });
        window.localStorage?.setItem("active_event_id", storedId);
      } catch (err) {
        console.error("Set active event from storage error:", err);
      }
    } else if (!hasActive && events.length > 0) {
      const fallbackId = String(events[0].id);
      selector.value = fallbackId;
      try {
        await apiPost("/api/events/active", { id: Number(fallbackId) });
        window.localStorage?.setItem("active_event_id", fallbackId);
      } catch (err) {
        console.error("Set active event fallback error:", err);
      }
    } else if (hasActive) {
      const activeOption = selector.selectedOptions?.[0];
      if (activeOption?.value) {
        window.localStorage?.setItem("active_event_id", activeOption.value);
      }
    }
  } catch (err) {
    console.error("Load events error:", err);
    showToast("Etkinlikler yüklenirken hata oluştu", "error");
    const selector = qs("event_selector");
    if (selector) {
      selector.innerHTML = "";
      const errorOption = document.createElement("option");
      errorOption.value = "";
      errorOption.textContent = "Hata: Etkinlikler yüklenemedi";
      errorOption.disabled = true;
      errorOption.selected = true;
      selector.appendChild(errorOption);
    }
  }
}
