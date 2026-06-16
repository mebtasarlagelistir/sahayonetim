/**
 * Ödül Töreni Yönetimi Modülü
 * 
 * Bu modül ödül kazananlarının yönetimi ve tören sunumunu kontrol eder.
 * Match Control panelinde kullanılır.
 * 
 * Veriler /award-assignment sayfasından otomatik çekilir.
 * Sürükle-bırak ile sıralama değiştirilebilir.
 */

// State
let ceremonyState = {
  isActive: false,
  currentStep: "idle",
  currentAwardId: null,
  currentAward: null
};

let awardWinners = [];
let awardsForCeremony = [];
let teamsForCeremony = [];
let draggedItem = null;

/**
 * Tören modülünü başlatır
 */
async function initCeremony() {
  console.log("Ceremony module initializing...");
  
  // Event listener'ları ekle
  setupCeremonyEventListeners();
  
  // İlk verileri yükle
  await loadCeremonyData();
  
  // Tören durumunu kontrol et
  await checkCeremonyState();
}

/**
 * Event listener'ları ayarlar
 */
function setupCeremonyEventListeners() {
  // Tören kontrol butonları
  const btnStart = qs("btn_ceremony_start");
  const btnNext = qs("btn_ceremony_next");
  const btnStop = qs("btn_ceremony_stop");
  const btnShowScreen = qs("btn_ceremony_show_screen");
  const btnShowAllWinners = qs("btn_ceremony_show_all_winners");
  const btnRefresh = qs("btn_refresh_ceremony_data");
  const btnSaveOrder = qs("btn_save_ceremony_order");
  
  if (btnStart) btnStart.addEventListener("click", startCeremony);
  if (btnNext) btnNext.addEventListener("click", nextCeremonyStep);
  if (btnStop) btnStop.addEventListener("click", stopCeremony);
  if (btnShowScreen) btnShowScreen.addEventListener("click", showCeremonyOnScreen);
  if (btnShowAllWinners) btnShowAllWinners.addEventListener("click", showAllWinnersOnScreen);
  if (btnRefresh) btnRefresh.addEventListener("click", loadCeremonyData);
  if (btnSaveOrder) btnSaveOrder.addEventListener("click", saveCeremonyOrder);
  
  // SocketIO event listener
  if (typeof socket !== "undefined" && socket) {
    socket.on("ceremony_update", handleCeremonyUpdate);
  }
}

/**
 * Tören verilerini yükler (Ödül Atama sayfasından)
 */
async function loadCeremonyData() {
  try {
    // Takımları yükle
    teamsForCeremony = await apiGet("/api/teams").catch(() => []);
    
    // Ödül atamalarından kazananları yükle
    awardWinners = await apiGet("/api/award-winners").catch(() => []);
    
    // Ödül tanımlarını yükle
    awardsForCeremony = await apiGet("/api/awards").catch(() => []);
    
    // UI'ı güncelle
    renderAwardWinnersList();
    
    showToast("Veriler yüklendi", "info");
  } catch (err) {
    console.error("Ceremony data load error:", err);
    showToast("Veriler yüklenirken hata oluştu", "error");
  }
}

/**
 * Sıralamayı kaydet
 */
async function saveCeremonyOrder() {
  try {
    const container = qs("award_winners_list");
    if (!container) return;
    
    const cards = container.querySelectorAll(".award-winner-card");
    const orderedWinners = [];
    
    cards.forEach((card, index) => {
      const awardName = card.dataset.awardName;
      const winner = awardWinners.find(w => w.award_name === awardName);
      if (winner) {
        orderedWinners.push({
          ...winner,
          presentation_order: index
        });
      }
    });
    
    await apiPost("/api/award-winners", orderedWinners);
    awardWinners = orderedWinners;
    showToast("Sıralama kaydedildi", "success");
  } catch (err) {
    console.error("Save order error:", err);
    showToast("Sıralama kaydedilirken hata oluştu", "error");
  }
}

/**
 * Ödül kazananları listesini render eder (sürükle-bırak destekli)
 */
function renderAwardWinnersList() {
  const container = qs("award_winners_list");
  if (!container) return;
  
  // Sadece atanılmış ödülleri göster (backend alan adı: winner_team_number)
  const assignedWinners = awardWinners.filter(w => w.winner_team_number);
  
  if (assignedWinners.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Henüz ödül ataması yapılmamış.</p>
        <p class="hint"><a href="/award-assignment" target="_blank">Ödül Atama</a> sayfasından ödül atayın.</p>
      </div>
    `;
    return;
  }
  
  // Sunum sırasına göre sırala
  const sortedWinners = [...assignedWinners].sort((a, b) => 
    (a.presentation_order || 0) - (b.presentation_order || 0)
  );
  
  let html = "";
  
  sortedWinners.forEach((winner, index) => {
    const isAnnounced = winner.announced;
    const statusClass = isAnnounced ? "announced" : "ready";
    const statusText = isAnnounced ? "✅ Duyuruldu" : "🎯 Hazır";
    
    // Takım adını bul (backend alan adları: winner_team_number, winner_team_name)
    const team = teamsForCeremony.find(t => t.number === winner.winner_team_number);
    const teamName = team ? team.name : winner.winner_team_name || "";
    
    html += `
      <div class="award-winner-card ${statusClass}" 
           draggable="true"
           data-award-name="${escapeHtml(winner.award_name)}"
           data-index="${index}">
        <div class="drag-handle">☰</div>
        <div class="award-winner-content">
          <div class="award-winner-header">
            <div class="award-order-badge">${index + 1}</div>
            <div class="award-info">
              <h4 class="award-name">${escapeHtml(winner.award_name)}</h4>
              <span class="award-category">${escapeHtml(winner.award_category || "")}</span>
            </div>
            <div class="award-status">
              <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
          </div>
          <div class="award-winner-body">
            <div class="winner-info">
              <div class="winner-team">
                <span class="label">🏆 Kazanan:</span>
                <span class="team-number">${escapeHtml(winner.winner_team_number)}</span>
                <span class="team-name">${escapeHtml(teamName)}</span>
              </div>
              ${winner.jury_note ? `
              <div class="jury-notes">
                <span class="label">📝 Jüri Notu:</span>
                <span class="note-text">${escapeHtml(winner.jury_note)}</span>
              </div>
              ` : ""}
            </div>
          </div>
        </div>
        <div class="award-winner-actions">
          <button class="btn-small btn-secondary" onclick="showSpecificAward('${escapeHtml(winner.award_name)}')">
            👁️ Göster
          </button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Sürükle-bırak event'lerini ekle
  setupDragAndDrop(container);
}

/**
 * Sürükle-bırak kurulumu
 */
function setupDragAndDrop(container) {
  const cards = container.querySelectorAll(".award-winner-card");
  
  cards.forEach(card => {
    card.addEventListener("dragstart", handleDragStart);
    card.addEventListener("dragend", handleDragEnd);
    card.addEventListener("dragover", handleDragOver);
    card.addEventListener("drop", handleDrop);
    card.addEventListener("dragenter", handleDragEnter);
    card.addEventListener("dragleave", handleDragLeave);
  });
}

function handleDragStart(e) {
  draggedItem = this;
  this.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/html", this.innerHTML);
}

function handleDragEnd(e) {
  this.classList.remove("dragging");
  document.querySelectorAll(".award-winner-card").forEach(card => {
    card.classList.remove("drag-over");
  });
  draggedItem = null;
  updateOrderBadges();
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function handleDragEnter(e) {
  this.classList.add("drag-over");
}

function handleDragLeave(e) {
  this.classList.remove("drag-over");
}

function handleDrop(e) {
  e.preventDefault();
  if (draggedItem !== this) {
    const container = this.parentNode;
    const allCards = [...container.querySelectorAll(".award-winner-card")];
    const draggedIndex = allCards.indexOf(draggedItem);
    const targetIndex = allCards.indexOf(this);
    
    if (draggedIndex < targetIndex) {
      this.parentNode.insertBefore(draggedItem, this.nextSibling);
    } else {
      this.parentNode.insertBefore(draggedItem, this);
    }
  }
  this.classList.remove("drag-over");
}

function updateOrderBadges() {
  const container = qs("award_winners_list");
  if (!container) return;
  
  const badges = container.querySelectorAll(".award-order-badge");
  badges.forEach((badge, index) => {
    badge.textContent = index + 1;
  });
}

/**
 * Tören durumunu kontrol eder
 */
async function checkCeremonyState() {
  try {
    const state = await apiGet("/api/ceremony/state");
    ceremonyState = {
      isActive: state.is_active || false,
      currentStep: state.current_step || "idle",
      currentAwardId: state.current_award_id,
      currentAward: state.current_award
    };
    updateCeremonyUI();
  } catch (err) {
    console.error("Check ceremony state error:", err);
  }
}

/**
 * Tören UI'ını günceller
 */
function updateCeremonyUI() {
  const statusIndicator = document.querySelector("#ceremony_status .status-indicator");
  const statusText = qs("ceremony_status_text");
  const currentAwardSection = qs("ceremony_current_award");
  const currentAwardName = qs("ceremony_current_award_name");
  const currentStepEl = qs("ceremony_current_step");
  const btnStart = qs("btn_ceremony_start");
  const btnNext = qs("btn_ceremony_next");
  const btnStop = qs("btn_ceremony_stop");
  
  if (ceremonyState.isActive) {
    // Tören aktif
    if (statusIndicator) statusIndicator.className = "status-indicator status-active";
    if (statusText) statusText.textContent = "Tören Devam Ediyor";
    if (currentAwardSection) currentAwardSection.style.display = "block";
    
    if (ceremonyState.currentAward) {
      if (currentAwardName) currentAwardName.textContent = ceremonyState.currentAward.award_name;
      if (currentStepEl) {
        // Adım sırası: award -> note -> winner
        const stepLabels = {
          "showing_award": "1️⃣ Ödül Gösteriliyor",
          "showing_note": "2️⃣ Jüri Notu Gösteriliyor",
          "showing_winner": "3️⃣ Kazanan Gösteriliyor"
        };
        currentStepEl.textContent = stepLabels[ceremonyState.currentStep] || ceremonyState.currentStep;
      }
    }
    
    if (btnStart) btnStart.disabled = true;
    if (btnNext) btnNext.disabled = false;
    if (btnStop) btnStop.disabled = false;
  } else {
    // Tören pasif
    if (statusIndicator) statusIndicator.className = "status-indicator status-inactive";
    if (statusText) statusText.textContent = "Tören Başlatılmadı";
    if (currentAwardSection) currentAwardSection.style.display = "none";
    
    if (btnStart) btnStart.disabled = false;
    if (btnNext) btnNext.disabled = true;
    if (btnStop) btnStop.disabled = true;
  }
}

/**
 * Töreni başlatır
 */
async function startCeremony() {
  try {
    // ÖNEMLİ: Önce seyirci ekranını ceremony moduna al
    // Bu sayede WebSocket bağlantısı kurulur ve ceremony_update event'leri alınabilir
    await showCeremonyOnScreen();
    
    // Kısa bir gecikme ile ekranın hazır olmasını bekle
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Şimdi töreni başlat (ceremony_update event'i gönderilecek)
    const result = await apiPost("/api/ceremony/start");
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    
    ceremonyState = {
      isActive: true,
      currentStep: "showing_award",
      currentAwardId: result.current_award?.id,
      currentAward: result.current_award
    };
    
    updateCeremonyUI();
    showToast("Tören başlatıldı", "success");
  } catch (err) {
    console.error("Start ceremony error:", err);
    showToast("Tören başlatılamadı", "error");
  }
}

/**
 * Sonraki adıma geçer
 */
async function nextCeremonyStep() {
  try {
    const result = await apiPost("/api/ceremony/next");
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    
    ceremonyState = {
      isActive: result.is_active !== false,
      currentStep: result.current_step || "idle",
      currentAwardId: result.current_award?.id,
      currentAward: result.current_award
    };
    
    updateCeremonyUI();
    
    // Kazananları listesini yenile (duyuruldu durumu değişmiş olabilir)
    await loadCeremonyData();
    
    // Tören bittiyse (is_active: false) tüm kazananları göster
    if (result.is_active === false) {
      showToast("Tören tamamlandı! Tüm kazananlar gösteriliyor...", "success");
      await showAllWinnersOnScreen();
    }
  } catch (err) {
    console.error("Next ceremony step error:", err);
    showToast("Adım geçişi başarısız", "error");
  }
}

/**
 * Töreni durdurur
 */
async function stopCeremony() {
  if (!confirm("Töreni durdurmak istediğinize emin misiniz?")) return;
  
  try {
    await apiPost("/api/ceremony/stop");
    
    ceremonyState = {
      isActive: false,
      currentStep: "idle",
      currentAwardId: null,
      currentAward: null
    };
    
    updateCeremonyUI();
    showToast("Tören durduruldu", "info");
    
    // Tüm kazananları göster (kullanıcı isterse)
    if (confirm("Tüm kazananları göstermek ister misiniz?")) {
      await showAllWinnersOnScreen();
    } else {
      // Seyirci ekranını maç moduna geri al
      await apiPost("/api/screens/settings", {
        active_view: "match"
      });
    }
  } catch (err) {
    console.error("Stop ceremony error:", err);
    showToast("Tören durdurulamadı", "error");
  }
}

/**
 * Belirli bir ödülü gösterir
 */
async function showSpecificAward(awardName) {
  try {
    const winner = awardWinners.find(w => w.award_name === awardName);
    if (!winner) {
      showToast("Ödül bulunamadı", "error");
      return;
    }
    
    const result = await apiPost(`/api/ceremony/show-by-name`, { award_name: awardName });
    if (result.error) {
      showToast(result.error, "error");
      return;
    }
    
    ceremonyState = {
      isActive: true,
      currentStep: "showing_award",
      currentAwardId: result.current_award?.id,
      currentAward: result.current_award
    };
    
    updateCeremonyUI();
    showToast(`"${awardName}" gösteriliyor`, "success");
  } catch (err) {
    console.error("Show specific award error:", err);
    showToast("Ödül gösterilemedi", "error");
  }
}

/**
 * Seyirci ekranında töreni gösterir
 */
/**
 * TÜM bağlı seyirci ekranlarını belirtilen görünüme zorlar (per-screen kontrol).
 * Global active_view, per-screen kontrol edilmiş (follow_global=false) ekranlara
 * ULAŞMAZ; bu yüzden tören/ödül gösterimi her ekrana tek tek uygulanır.
 */
async function _forceAllScreensToView(view) {
  try {
    const screens = await apiGet("/api/screens");
    if (Array.isArray(screens) && screens.length) {
      await Promise.all(screens.map((s) =>
        apiPost("/api/screens/control", {
          screen_id: s.screen_id,
          desired_view: view,
          follow_global: false,
        }).catch(() => {})
      ));
    }
  } catch (err) {
    console.warn("_forceAllScreensToView:", err);
  }
}

async function showCeremonyOnScreen() {
  try {
    // Ekran view'ını ceremony olarak ayarla (global)
    const screenSelect = qs("mc_screen_active_view");
    if (screenSelect) {
      screenSelect.value = "ceremony";
    }
    if (typeof saveScreenSettings === "function") {
      await saveScreenSettings();
    } else {
      await apiPost("/api/screens/settings", { active_view: "ceremony" });
    }
    // GLOBAL'i takip etmeyen (per-screen kontrol edilmiş) ekranlara da uygula
    await _forceAllScreensToView("ceremony");

    showToast("Seyirci ekranı tören moduna alındı", "success");
  } catch (err) {
    console.error("Show ceremony on screen error:", err);
    showToast("Ekran ayarı değiştirilemedi", "error");
  }
}

/**
 * Tüm kazananları seyirci ekranında gösterir
 */
async function showAllWinnersOnScreen() {
  try {
    // Ekran view'ını awards olarak ayarla (tüm kazananlar listesi)
    const screenSelect = qs("mc_screen_active_view");
    if (screenSelect) {
      screenSelect.value = "awards";
    }
    if (typeof saveScreenSettings === "function") {
      await saveScreenSettings();
    } else {
      await apiPost("/api/screens/settings", { active_view: "awards" });
    }
    // GLOBAL'i takip etmeyen ekranlara da uygula
    await _forceAllScreensToView("awards");

    showToast("Tüm kazananlar gösteriliyor", "success");
  } catch (err) {
    console.error("Show all winners error:", err);
    showToast("Ekran ayarı değiştirilemedi", "error");
  }
}

/**
 * SocketIO üzerinden gelen tören güncellemelerini işler
 */
function handleCeremonyUpdate(data) {
  console.log("Ceremony update received:", data);
  
  ceremonyState = {
    isActive: data.is_active !== false,
    currentStep: data.current_step || "idle",
    currentAwardId: data.current_award?.id,
    currentAward: data.current_award
  };
  
  updateCeremonyUI();
}

// Sayfa yüklendiğinde başlat
document.addEventListener("DOMContentLoaded", () => {
  // Tab değişikliğinde ceremony sekmesi açılırsa verileri yükle
  const ceremonyTab = document.querySelector('[data-tab="ceremony"]');
  if (ceremonyTab) {
    ceremonyTab.addEventListener("click", () => {
      initCeremony();
    });
  }
  
  // Sayfa doğrudan #tab-ceremony hash ile açıldıysa init et
  setTimeout(() => {
    if (window.location.hash === "#tab-ceremony") {
      initCeremony();
    }
  }, 200);
});

// Global fonksiyonları dışa aktar
window.initCeremony = initCeremony;
window.showSpecificAward = showSpecificAward;
