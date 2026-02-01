/**
 * Seyirci ekranları yönetimi
 */

async function loadScreenSettings() {
  try {
    const data = await apiGet("/api/screens/settings");
    if (qs("screen_active_view")) qs("screen_active_view").value = data.active_view || "match";
    if (qs("screen_overlay_enabled")) qs("screen_overlay_enabled").checked = !!data.overlay_enabled;
    if (qs("screen_overlay_text")) qs("screen_overlay_text").value = data.overlay_text || "";
  } catch (err) {
    console.error("Load screen settings error:", err);
    showToast("Ekran ayarları yüklenemedi", "error");
  }
}

async function saveScreenSettings() {
  const payload = {
    active_view: qs("screen_active_view")?.value || "match",
    overlay_enabled: !!qs("screen_overlay_enabled")?.checked,
    overlay_text: qs("screen_overlay_text")?.value || ""
  };
  try {
    await apiPost("/api/screens/settings", payload);
    showToast("Ekran ayarları güncellendi", "success");
  } catch (err) {
    console.error("Save screen settings error:", err);
    showToast("Ekran ayarları kaydedilemedi", "error");
  }
}

function formatLastSeen(secondsAgo) {
  if (secondsAgo < 5) return "Az önce";
  if (secondsAgo < 60) return `${Math.round(secondsAgo)} sn`;
  return `${Math.round(secondsAgo / 60)} dk`;
}

async function loadConnectedScreens() {
  const list = qs("connected_screens_list");
  if (!list) return;
  list.innerHTML = "<div class='loading'>Yükleniyor...</div>";
  try {
    const screens = await apiGet("/api/screens");
    if (!screens.length) {
      list.innerHTML = "<div class='empty'>Bağlı ekran yok</div>";
      return;
    }
    const now = Date.now() / 1000;
    list.innerHTML = screens.map((screen) => {
      const secondsAgo = now - (screen.last_seen || now);
      const desiredView = screen.desired_view || "match";
      const followGlobal = !!screen.follow_global;
      return `
        <div class="screen-item">
          <div>
            <div class="screen-name">${screen.screen_name || "Seyirci Ekranı"}</div>
            <div class="screen-meta">
              <span>${screen.ip || "-"}</span>
              <span>Görüntü: ${screen.view || "-"}</span>
              <span>${formatLastSeen(secondsAgo)}</span>
            </div>
            <div class="screen-controls">
              <select class="screen-view-select" data-screen-id="${screen.screen_id}">
                <option value="match" ${desiredView === "match" ? "selected" : ""}>Maç</option>
                <option value="inspection" ${desiredView === "inspection" ? "selected" : ""}>İnceleme</option>
                <option value="rankings" ${desiredView === "rankings" ? "selected" : ""}>Sıralama</option>
                <option value="awards" ${desiredView === "awards" ? "selected" : ""}>Ödüller</option>
                <option value="ceremony" ${desiredView === "ceremony" ? "selected" : ""}>Tören</option>
              </select>
              <label class="checkbox small">
                <input type="checkbox" class="screen-follow-toggle" data-screen-id="${screen.screen_id}" ${followGlobal ? "checked" : ""} />
                Global Takip
              </label>
              <button class="btn-small btn-primary screen-apply-btn" data-screen-id="${screen.screen_id}">Uygula</button>
            </div>
          </div>
          <a href="/audience?screen_id=${encodeURIComponent(screen.screen_id)}" target="_blank" class="btn-small btn-secondary">Aç</a>
        </div>
      `;
    }).join("");
    list.querySelectorAll(".screen-apply-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const screenId = btn.dataset.screenId;
        const viewSelect = list.querySelector(`.screen-view-select[data-screen-id="${screenId}"]`);
        const followToggle = list.querySelector(`.screen-follow-toggle[data-screen-id="${screenId}"]`);
        try {
          await apiPost("/api/screens/control", {
            screen_id: screenId,
            desired_view: viewSelect?.value || "match",
            follow_global: !!followToggle?.checked
          });
          showToast("Ekran ayarı güncellendi", "success");
        } catch (err) {
          console.error("Update screen control error:", err);
          showToast("Ekran ayarı kaydedilemedi", "error");
        }
      });
    });
  } catch (err) {
    console.error("Load connected screens error:", err);
    list.innerHTML = "<div class='error'>Ekranlar yüklenemedi</div>";
  }
}

async function setupScreensEventSwitcher() {
  const eventSelector = qs("event_selector");
  if (eventSelector) {
    eventSelector.addEventListener("change", async (event) => {
      const eventId = Number(event.target.value);
      if (!eventId) return;
      try {
        await apiPost("/api/events/active", { id: eventId });
        try {
          window.localStorage?.setItem("active_event_id", String(eventId));
        } catch (err) {
          console.warn("Active event localStorage set failed:", err);
        }
        const eventData = await apiGet("/api/event");
        if (typeof updateEventStatus === "function") {
          updateEventStatus(eventData);
        }
        if (typeof loadEventPhase === "function") {
          await loadEventPhase();
        }
        await loadScreenSettings();
        await loadConnectedScreens();
      } catch (err) {
        console.error("Change event error:", err);
        showToast("Etkinlik değiştirilirken hata oluştu", "error");
      }
    });
  }

  const newEventBtn = qs("new_event");
  if (newEventBtn) {
    newEventBtn.addEventListener("click", async () => {
      const name = window.prompt("Etkinlik adı", "Yeni Etkinlik");
      if (!name) return;
      try {
        await apiPost("/api/events", { name });
        showToast("Yeni etkinlik oluşturuldu", "success");
        if (typeof loadEvents === "function") await loadEvents();
        const eventData = await apiGet("/api/event");
        if (typeof updateEventStatus === "function") {
          updateEventStatus(eventData);
        }
        await loadScreenSettings();
      } catch (err) {
        console.error("Create event error:", err);
        showToast(`Hata: ${err.message}`, "error");
      }
    });
  }

  const deleteEventBtn = qs("delete_event");
  if (deleteEventBtn) {
    deleteEventBtn.addEventListener("click", async () => {
      const selector = qs("event_selector");
      const eventId = Number(selector?.value || 0);
      if (!eventId) {
        showToast("Silinecek etkinlik seçilmedi", "warning");
        return;
      }
      const confirmed = window.confirm("Seçili etkinliği silmek istiyor musunuz?");
      if (!confirmed) return;
      try {
        await apiDelete(`/api/events/${eventId}`);
        showToast("Etkinlik silindi", "success");
        if (typeof loadEvents === "function") await loadEvents();
        const eventData = await apiGet("/api/event");
        if (typeof updateEventStatus === "function") {
          updateEventStatus(eventData);
        }
        await loadScreenSettings();
        await loadConnectedScreens();
      } catch (err) {
        console.error("Delete event error:", err);
        showToast(`Hata: ${err.message}`, "error");
      }
    });
  }
}

async function initializeScreensPage() {
  if (typeof loadUserRole === "function") {
    await loadUserRole();
  }
  if (typeof loadEvents === "function") {
    await loadEvents();
  }
  try {
    const eventData = await apiGet("/api/event");
    if (typeof updateEventStatus === "function") {
      updateEventStatus(eventData);
    }
    if (typeof loadEventPhase === "function") {
      await loadEventPhase();
    }
    if (typeof startClock === "function") {
      startClock();
    }
  } catch (err) {
    console.error("Screens header init error:", err);
  }
  await setupScreensEventSwitcher();
  loadScreenSettings();
  loadConnectedScreens();
  setInterval(loadConnectedScreens, 5000);
}

function setupScreensPage() {
  if (qs("save_screen_settings")) {
    qs("save_screen_settings").addEventListener("click", saveScreenSettings);
  }
  // initializeScreensPage handles data loading
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.body?.dataset?.page === "screens") {
    setupScreensPage();
  }
});
