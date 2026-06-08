/**
 * Dashboard Modülü
 *
 * Etkinlik yönetim sayfasındaki özet bilgileri ve link davranışlarını yönetir.
 */

/**
 * Etkinlik özet bilgilerini yükler ve dashboard'da gösterir
 * 
 * Yüklenen bilgiler:
 * - Etkinlik adı, kodu, tarihleri
 * - Konum bilgileri (venue, city, country)
 * - Saha sayısı
 * - Etkinlik fazı
 * - Takım sayısı ve maç istatistikleri
 * 
 * @returns {Promise<void>}
 */
async function loadEventSummary() {
  try {
    const data = await apiGet("/api/event");
    
    // Etkinlik verisini cache'le (saat güncellemesi için)
    window.cachedEventData = data;
    
    // Başlıkta etkinlik durumunu göster
    updateEventStatus(data);
    
    if (qs("dashboard_event_name")) {
      qs("dashboard_event_name").textContent = data.name || "Etkinlik seçilmedi";
    }
    if (qs("dashboard_event_code")) {
      qs("dashboard_event_code").textContent = data.code || "-";
    }
    if (qs("dashboard_event_dates")) {
      const start = data.dates?.start || "";
      const end = data.dates?.end || "";
      qs("dashboard_event_dates").textContent = start && end ? `${start} - ${end}` : start || end || "-";
    }
    if (qs("dashboard_event_location")) {
      const venue = data.location?.venue || "";
      const city = data.location?.city || "";
      const country = data.location?.country || "";
      const parts = [venue, city, country].filter(Boolean);
      qs("dashboard_event_location").textContent = parts.length ? parts.join(" / ") : "-";
    }
    
    // Saha sayısını göster
    if (qs("dashboard_field_count")) {
      const fieldCount = data.format?.fields || 1;
      qs("dashboard_field_count").textContent = fieldCount.toString();
    }
    
    // Etkinlik fazını yükle
    await loadEventPhase();
    
    // Takım sayısı ve maç özetlerini yükle
    await loadEventStatistics();
  } catch (err) {
    console.error("Load event summary error:", err);
    showToast("Etkinlik özeti yüklenirken hata oluştu", "error");
  }
}

/**
 * Başlıkta etkinlik durumunu günceller
 * 
 * @param {Object} eventData - Etkinlik verisi (name, dates, vb.)
 */
function updateEventStatus(eventData) {
  const statusIndicator = qs("status-indicator");
  const eventNameDisplay = qs("event-name-display");
  
  if (!statusIndicator || !eventNameDisplay) {
    console.warn("updateEventStatus: status-indicator veya event-name-display elementi bulunamadı");
    return;
  }
  
  // Etkinlik adını göster (null/undefined kontrolü)
  const eventName = (eventData && eventData.name) ? eventData.name : "Etkinlik seçilmedi";
  eventNameDisplay.textContent = eventName;
  
  // Aktif durumunu kontrol et (etkinlik varsa aktif sayılır)
  const isActive = eventData && eventData.name && eventData.name !== "Etkinlik seçilmedi";
  
  if (isActive) {
    statusIndicator.classList.add("active");
    statusIndicator.classList.remove("inactive");
    statusIndicator.title = "Aktif";
  } else {
    statusIndicator.classList.add("inactive");
    statusIndicator.classList.remove("active");
    statusIndicator.title = "Pasif";
  }
  
  // Etkinlik tarih ve saat bilgisini güncelle
  if (typeof updateEventDateTime === "function") {
    updateEventDateTime(eventData);
  }
  
  // Etkinlik fazını yükle
  if (typeof loadEventPhase === "function") {
    loadEventPhase();
  }
}

/**
 * Tarih formatını dönüştürür (YYYY-MM-DD -> DD.MM.YYYY)
 * 
 * @param {string} dateStr - ISO formatında tarih (YYYY-MM-DD)
 * @returns {string} Türkçe formatında tarih (DD.MM.YYYY)
 */
function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}

/**
 * Başlıkta etkinlik tarih ve saat bilgisini gösterir
 * 
 * @param {Object} eventData - Etkinlik verisi (dates: {start, end})
 */
function updateEventDateTime(eventData) {
  const datetimeElement = qs("event-datetime");
  if (!datetimeElement) return;
  
  let html = "";
  
  // Etkinlik tarihleri
  const startDate = eventData.dates?.start || "";
  const endDate = eventData.dates?.end || "";
  
  if (startDate || endDate) {
    let dateText = "";
    if (startDate && endDate) {
      const formattedStart = formatDate(startDate);
      const formattedEnd = formatDate(endDate);
      dateText = formattedStart === formattedEnd ? formattedStart : `${formattedStart} - ${formattedEnd}`;
    } else {
      dateText = formatDate(startDate || endDate);
    }
    if (dateText) {
      html += `<span class="event-dates">${dateText}</span>`;
    }
  }
  
  // Mevcut tarih ve saat (canlı)
  const now = new Date();
  const dateStr = now.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  html += `<span class="current-time">${dateStr} ${timeStr}</span>`;
  
  datetimeElement.innerHTML = html;
}

/**
 * Canlı saati günceller (her saniye)
 * 
 * Etkinlik tarihlerini ve mevcut tarih/saati header'da gösterir.
 * Her saniye otomatik olarak güncellenir.
 */
function startClock() {
  // İlk güncelleme
  const eventData = { dates: {} };
  try {
    // Etkinlik verisini al
    apiGet("/api/event")
      .then(data => {
        eventData.dates = data.dates || {};
        updateEventDateTime(eventData);
      })
      .catch(() => {
        updateEventDateTime(eventData);
      });
  } catch (err) {
    updateEventDateTime(eventData);
  }
  
  // Her saniye güncelle
  setInterval(() => {
    const eventData = { dates: {} };
    // Etkinlik tarihlerini cache'den al (her saniye API çağrısı yapmamak için)
    const cachedEvent = window.cachedEventData || {};
    eventData.dates = cachedEvent.dates || {};
    updateEventDateTime(eventData);
  }, 1000);
}

/**
 * Etkinliğin hangi fazda olduğunu belirler ve gösterir
 * 
 * Fazlar (öncelik sırasına göre):
 * - setup: Kurulum (varsayılan)
 * - inspection: İnceleme
 * - practice: Deneme Maçları
 * - qualification: Sıralama Maçları
 * - playoff: Playoff Maçları
 * - awards: Ödüller
 * 
 * @returns {Promise<void>}
 */
async function loadEventPhase() {
  const phaseElement = qs("event-phase");
  if (!phaseElement) return;
  
  try {
    // Tüm faz verilerini paralel olarak kontrol et
    const [inspectionData, practiceData, matchData] = await Promise.allSettled([
      apiGet("/api/inspection-slots").catch(() => []),
      apiGet("/api/practice-matches").catch(() => []),
      apiGet("/api/match-schedule").catch(() => []),
    ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : []));
    
    let phase = "setup";
    let phaseLabel = "Kurulum";
    let phaseClass = "phase-setup";
    
    // İnceleme slotları var mı?
    if (inspectionData && inspectionData.length > 0) {
      if (inspectionData && inspectionData.length > 0) {
        phase = "inspection";
        phaseLabel = "İnceleme";
        phaseClass = "phase-inspection";
      }
    }
    
    // Deneme maçları var mı?
    if (practiceData && practiceData.length > 0) {
      phase = "practice";
      phaseLabel = "Deneme Maçları";
      phaseClass = "phase-practice";
    }
    
    // Sıralama maçları var mı ve aktif mi?
    if (matchData && matchData.length > 0) {
      // Sıralama maçları var
      const qualificationMatches = matchData.filter(m => m.match_type === "qualification");
      const playoffMatches = matchData.filter(m => m.match_type === "elimination" || m.match_type === "final");
      
      if (playoffMatches.length > 0) {
        phase = "playoff";
        phaseLabel = "Playoff";
        phaseClass = "phase-playoff";
      } else if (qualificationMatches.length > 0) {
        // Match schedule settings'ten aktif durumunu kontrol et
        try {
          const settings = await apiGet("/api/match-settings");
          if (settings.stage_active !== false) {
            phase = "qualification";
            phaseLabel = "Sıralama";
            phaseClass = "phase-qualification";
          }
        } catch {
          // Settings yoksa varsayılan olarak aktif say
          phase = "qualification";
          phaseLabel = "Sıralama";
          phaseClass = "phase-qualification";
        }
      }
    }
    
    // Ödüller kontrolü (awards API'si varsa)
    try {
      const awardsData = await apiGet("/api/awards").catch(() => []);
      if (awardsData && awardsData.length > 0) {
        // Ödüller verildiyse en yüksek faz
        phase = "awards";
        phaseLabel = "Ödüller";
        phaseClass = "phase-awards";
      }
    } catch (err) {
      // Awards API yoksa veya hata varsa devam et
    }
    
    // Faz bilgisini göster
    phaseElement.textContent = phaseLabel;
    phaseElement.className = `event-phase ${phaseClass}`;
    phaseElement.title = `Etkinlik Fazı: ${phaseLabel}`;
    
  } catch (err) {
    console.error("Load event phase error:", err);
    phaseElement.textContent = "";
    phaseElement.className = "event-phase";
  }
}

/**
 * "Yakında" linklerini bağlar
 * 
 * data-coming-soon="true" attribute'u olan linklere tıklandığında
 * bilgilendirme mesajı gösterir.
 */
function bindComingSoonLinks() {
  document.querySelectorAll('[data-coming-soon="true"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showToast("Bu bölüm yakında eklenecek.", "info");
    });
  });
}

/**
 * Etkinlik seçici (dropdown) ve butonlarını yapılandırır
 * 
 * - Etkinlik değiştirme
 * - Yeni etkinlik oluşturma
 * - Etkinlik silme
 */
function setupEventSwitcher() {
  console.log("dashboard.js: setupEventSwitcher çağrıldı");
  const eventSelector = qs("event_selector");
  console.log("dashboard.js: event_selector bulundu mu?", !!eventSelector);
  console.log("dashboard.js: event_selector elementi:", eventSelector);
  
  // Global scope'a da ekle (match_control.js için)
  if (typeof window !== "undefined") {
    window.setupEventSwitcher = setupEventSwitcher;
  }
  if (eventSelector) {
    console.log("dashboard.js: Event selector'a change listener ekleniyor...");
    eventSelector.addEventListener("change", async (event) => {
      console.log("dashboard.js: Event selector change event tetiklendi, value:", event.target.value);
      const eventId = Number(event.target.value);
      if (!eventId) return;
      try {
        await apiPost("/api/events/active", { id: eventId });
        try {
          window.localStorage?.setItem("active_event_id", String(eventId));
        } catch (err) {
          console.warn("Active event localStorage set failed:", err);
        }
        await loadEventSummary();
        await updateEventStatusFromSelector();
        await loadEventStatistics();
      } catch (err) {
        console.error("Change event error:", err);
        showToast(err.message || "Etkinlik değiştirilirken hata oluştu", "error");
      }
    });
  }

  const newEventBtn = qs("new_event");
  console.log("dashboard.js: new_event butonu bulundu mu?", !!newEventBtn);
  if (newEventBtn) {
    console.log("dashboard.js: new_event butonuna click listener ekleniyor...");
    newEventBtn.addEventListener("click", async () => {
      console.log("dashboard.js: new_event butonuna tıklandı");
      // Çift tıklamayı engelle
      if (newEventBtn.disabled) return;
      newEventBtn.disabled = true;
      try {
        // Etkinliği varsayılan adla oluştur; backend otomatik aktif yapar.
        // Detaylı kurulum (ad, kod, tarih, konum) Kurulum sayfasında yapılır.
        await apiPost("/api/events", { name: "Yeni Etkinlik" });
        showToast("Yeni etkinlik oluşturuldu, kuruluma yönlendiriliyorsunuz...", "success");
        // Yeni etkinliği kurmak için Kurulum sayfasının Etkinlik adımına git
        window.location.href = "/setup#step-event";
      } catch (err) {
        console.error("Create event error:", err);
        showToast(`Hata: ${err.message}`, "error");
        newEventBtn.disabled = false;
      }
    });
  }

  const deleteEventBtn = qs("delete_event");
  console.log("dashboard.js: delete_event butonu bulundu mu?", !!deleteEventBtn);
  if (deleteEventBtn) {
    console.log("dashboard.js: delete_event butonuna click listener ekleniyor...");
    deleteEventBtn.addEventListener("click", async () => {
      console.log("dashboard.js: delete_event butonuna tıklandı");
      const selector = qs("event_selector");
      const eventId = Number(selector?.value);
      if (!eventId) {
        showToast("Silinecek etkinlik seçilmedi", "warning");
        return;
      }
      const eventName = selector.options[selector.selectedIndex]?.textContent || "Etkinlik";
      const confirmed = window.confirm(
        `"${eventName}" etkinliğini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz ve tüm takımlar silinecektir.`
      );
      if (!confirmed) return;
      try {
        await apiDelete(`/api/events/${eventId}`);
        showToast("Etkinlik başarıyla silindi", "success");
        if (typeof loadEvents === "function") await loadEvents();
        await loadEventSummary();
        await updateEventStatusFromSelector();
        await loadEventStatistics();
      } catch (err) {
        console.error("Delete event error:", err);
        showToast(`Hata: ${err.message}`, "error");
      }
    });
  }

  const clearAllEventsBtn = qs("clear_all_events");
  console.log("dashboard.js: clear_all_events butonu bulundu mu?", !!clearAllEventsBtn);
  if (clearAllEventsBtn) {
    console.log("dashboard.js: clear_all_events butonuna click listener ekleniyor...");
    clearAllEventsBtn.addEventListener("click", async () => {
      console.log("dashboard.js: clear_all_events butonuna tıklandı");
      const confirmed = window.confirm(
        "TÜM ETKİNLİKLERİ SİLMEK İSTEDİĞİNİZDEN EMİN MİSİNİZ?\n\nBu işlem geri alınamaz ve tüm etkinlikler, takımlar ve ilgili veriler silinecektir."
      );
      if (!confirmed) return;
      try {
        const data = await apiDelete("/api/events");
        showToast(`Tüm etkinlikler temizlendi (${data.deleted_count || 0} etkinlik)`, "success");
        if (typeof loadEvents === "function") await loadEvents();
        await loadEventSummary();
        await updateEventStatusFromSelector();
        await loadEventStatistics();
      } catch (err) {
        console.error("Clear all events error:", err);
        showToast(`Hata: ${err.message}`, "error");
      }
    });
  }
  
  console.log("dashboard.js: setupEventSwitcher tamamlandı - tüm event listener'lar kuruldu");
}

/**
 * Event selector'dan etkinlik durumunu günceller
 */
async function updateEventStatusFromSelector() {
  try {
    const eventData = await apiGet("/api/event");
    updateEventStatus(eventData);
  } catch (err) {
    console.error("Update event status error:", err);
  }
}

/**
 * Etkinlik istatistiklerini yükler (takım sayısı, maç sayıları)
 */
async function loadEventStatistics() {
  try {
    // Takım sayısını yükle
    try {
      const teams = await apiGet("/api/teams");
      if (qs("dashboard_team_count")) {
        qs("dashboard_team_count").textContent = teams.length.toString();
      }
    } catch {
      if (qs("dashboard_team_count")) {
        qs("dashboard_team_count").textContent = "0";
      }
    }
    
    // Maç sayılarını yükle
    const [practiceMatches, matches] = await Promise.allSettled([
      apiGet("/api/practice-matches").catch(() => []),
      apiGet("/api/match-schedule").catch(() => []),
    ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : []));
    
    // Deneme maçları
    if (practiceMatches && practiceMatches.length > 0) {
      if (qs("dashboard_practice_count")) {
        qs("dashboard_practice_count").textContent = practiceMatches.length.toString();
      }
    } else {
      if (qs("dashboard_practice_count")) {
        qs("dashboard_practice_count").textContent = "0";
      }
    }
    
    // Resmi maçlar (qualification, elimination, final)
    if (matches && matches.length > 0) {
      const qualificationMatches = matches.filter(m => m.match_type === "qualification");
      const eliminationMatches = matches.filter(m => m.match_type === "elimination");
      const finalMatches = matches.filter(m => m.match_type === "final");
      
      if (qs("dashboard_qualification_count")) {
        qs("dashboard_qualification_count").textContent = qualificationMatches.length.toString();
      }
      if (qs("dashboard_elimination_count")) {
        qs("dashboard_elimination_count").textContent = eliminationMatches.length.toString();
      }
      if (qs("dashboard_final_count")) {
        qs("dashboard_final_count").textContent = finalMatches.length.toString();
      }
    } else {
      if (qs("dashboard_qualification_count")) {
        qs("dashboard_qualification_count").textContent = "0";
      }
      if (qs("dashboard_elimination_count")) {
        qs("dashboard_elimination_count").textContent = "0";
      }
      if (qs("dashboard_final_count")) {
        qs("dashboard_final_count").textContent = "0";
      }
    }
  } catch (err) {
    console.error("Load event statistics error:", err);
  }
}

/**
 * Kullanıcı rolüne göre dashboard bölümlerini göster/gizle
 *
 * - Hakem (hakem_1, hakem_2, vb.): Sadece "Hakem Skorlama" bölümü görünür.
 * - Baş hakem: İnceleme, Hakem Skorlama, FTA/CSA Araçları görünür.
 * - Admin / etkinlik yöneticisi: Tüm bölümler görünür.
 *
 * Hakem ve baş hakem için event switcher ile Kurulum linki gizlenir.
 */
function updateDashboardSectionsForRole() {
  if (typeof currentUserRole === "undefined" || !currentUserRole) return;

  const roleLower = String(currentUserRole).toLowerCase();
  const isHeadReferee =
    roleLower.includes("baş_hakem") ||
    roleLower.includes("bas_hakem") ||
    roleLower.includes("head_referee") ||
    roleLower === "baş hakem" ||
    roleLower === "bas hakem";

  // Normal hakem: sadece hakem_1, hakem_2 gibi (baş hakem değil)
  const isReferee =
    (roleLower.includes("hakem") && !isHeadReferee) ||
    roleLower.startsWith("hakem_");

  const isAdminOrManager =
    roleLower === "admin" ||
    roleLower.includes("etkinlik_yoneticisi") ||
    roleLower.includes("yonetici");

  if (isAdminOrManager) {
    // Admin / etkinlik yöneticisi: tüm bölümler
    document.querySelectorAll(".dashboard-section").forEach((section) => {
      section.style.display = "";
    });
    const summary = document.querySelector(".dashboard-summary");
    if (summary) summary.style.display = "";
    const eventSwitcher = document.querySelector(".event-switcher");
    if (eventSwitcher) eventSwitcher.style.display = "";
    const setupLink = document.querySelector('a[href="/setup"]');
    if (setupLink) setupLink.style.display = "";
    return;
  }

  if (isReferee) {
    // Hakem: sadece "Hakem Skorlama" bölümü
    const sections = document.querySelectorAll(".dashboard-section");
    sections.forEach((section) => {
      const heading = section.querySelector("h2");
      if (!heading) {
        section.style.display = "none";
        return;
      }
      const headingText = heading.textContent.trim();
      section.style.display = headingText === "Hakem Skorlama" ? "" : "none";
    });
    const summary = document.querySelector(".dashboard-summary");
    if (summary) summary.style.display = "none";
    const eventSwitcher = document.querySelector(".event-switcher");
    if (eventSwitcher) eventSwitcher.style.display = "none";
    const setupLink = document.querySelector('a[href="/setup"]');
    if (setupLink) setupLink.style.display = "none";
    return;
  }

  if (isHeadReferee) {
    // Baş hakem: İnceleme, Hakem Skorlama, FTA/CSA Araçları
    const allowedSections = ["İnceleme", "Hakem Skorlama", "FTA/CSA Araçları"];
    const sections = document.querySelectorAll(".dashboard-section");
    sections.forEach((section) => {
      const heading = section.querySelector("h2");
      if (!heading) {
        section.style.display = "none";
        return;
      }
      const headingText = heading.textContent.trim();
      section.style.display = allowedSections.includes(headingText) ? "" : "none";
    });
    const summary = document.querySelector(".dashboard-summary");
    if (summary) summary.style.display = "";
    const eventSwitcher = document.querySelector(".event-switcher");
    if (eventSwitcher) eventSwitcher.style.display = "none";
    const setupLink = document.querySelector('a[href="/setup"]');
    if (setupLink) setupLink.style.display = "none";
    return;
  }

  // Diğer roller (müfettiş, seremoni vb.): şimdilik tüm bölümler
  document.querySelectorAll(".dashboard-section").forEach((section) => {
    section.style.display = "";
  });
  const summary = document.querySelector(".dashboard-summary");
  if (summary) summary.style.display = "";
  const eventSwitcher = document.querySelector(".event-switcher");
  if (eventSwitcher) eventSwitcher.style.display = "";
}

/**
 * Dashboard'u başlatır ve tüm gerekli verileri yükler
 * 
 * Yapılan işlemler:
 * - Kullanıcı rolünü yükler
 * - Etkinlik listesini yükler
 * - Etkinlik özetini yükler
 * - Etkinlik seçiciyi yapılandırır
 * - "Yakında" linklerini bağlar
 * - Canlı saati başlatır
 * - Rol bazlı bölüm görünürlüğünü ayarlar
 * 
 * @returns {Promise<void>}
 */
async function initializeDashboard() {
  if (typeof loadUserRole === "function") {
    await loadUserRole();
  }
  if (typeof loadEvents === "function") {
    await loadEvents();
  }
  await loadEventSummary();
  setupEventSwitcher();
  bindComingSoonLinks();
  
  // Rol bazlı bölüm görünürlüğünü ayarla
  updateDashboardSectionsForRole();
  
  // Canlı saati başlat
  startClock();
}
