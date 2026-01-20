/**
 * Hakem Paneli JavaScript Modülü
 * 
 * Bu modül hakemlerin tabletlerinden puanlama yapabilmesi için
 * optimize edilmiş bir arayüz sağlar.
 * 
 * Modüler yapı: Puanlama sistemi backend'den alınır,
 * gerçek zamanlı senkronizasyon ile tüm cihazlarda anlık güncelleme sağlanır.
 */

let currentMatch = null;
let assignedAlliance = null; // "red" veya "blue" - bu hakemin atandığı ittifak
let scoreEventSource = null;
let retryCount = 0; // SSE yeniden bağlanma sayacı
let refereeMeta = {};
// Retry sabitleri - constants modülünden al
const MAX_RETRY_COUNT = NETWORK_CONSTANTS.SSE_RETRY_MAX;
const RETRY_DELAY_BASE = NETWORK_CONSTANTS.SSE_RETRY_DELAY_BASE;

/**
 * Hakem panelini başlatır
 */
async function initializeRefereePanel() {
  // Kullanıcı bilgilerini yükle
  await loadUserRole();
  
  // Aktif maçı kontrol et
  await checkActiveMatch();
  
  // Periyodik olarak aktif maçı kontrol et - constants modülünden al
  setInterval(async () => {
    await checkActiveMatch();
  }, UI_CONSTANTS.REFEREE_PANEL_CHECK_INTERVAL);
  
  // Event listener'ları kur
  setupRefereeEventListeners();
}

/**
 * Aktif maçı kontrol eder ve yükler
 */
async function checkActiveMatch() {
  try {
    const data = await apiGet("/api/match-control/active");
    
    if (data.match) {
      // Yeni maç varsa veya değiştiyse
      if (!currentMatch || currentMatch.id !== data.match.id) {
        currentMatch = data.match;
        await loadMatchForReferee();
      }
    } else {
      // Aktif maç yok
      currentMatch = null;
      qs("active_match_card").style.display = "none";
      qs("scoring_panel").style.display = "none";
      qs("no_match_message").style.display = "block";
      
      // Gerçek zamanlı güncellemeleri durdur
      stopRealtimeUpdates();
    }
  } catch (err) {
    console.error("Check active match error:", err);
  }
}

/**
 * Hakem için maç bilgilerini yükler
 */
async function loadMatchForReferee() {
  if (!currentMatch) return;
  
  // Maç bilgilerini göster
  qs("current_match_info").textContent = 
    `Maç ${currentMatch.match_number} - ${getMatchTypeLabel(currentMatch.match_type)} - Saha ${currentMatch.field_number}`;
  
  // Hakem ataması
  assignedAlliance = determineAssignedAlliance();
  
  qs("assigned_alliance").textContent = 
    `Atanan İttifak: ${assignedAlliance === "red" ? "Kırmızı" : "Mavi"} İttifak`;
  qs("assigned_field").textContent = `Saha: ${currentMatch.field_number}`;
  const teamList = assignedAlliance === "red" ? currentMatch.red_alliance : currentMatch.blue_alliance;
  qs("assigned_teams").textContent = `Takımlar: ${(teamList || []).join(", ") || "-"}`;
  
  // Puanlama panelini göster
  qs("active_match_card").style.display = "block";
  qs("scoring_panel").style.display = "block";
  qs("no_match_message").style.display = "none";
  
  qs("alliance_title").textContent = 
    `${assignedAlliance === "red" ? "Kırmızı" : "Mavi"} İttifak Puanlama`;
  
  // Mevcut skorları yükle
  await loadCurrentScores();
  
  // Gerçek zamanlı güncellemeleri başlat
  startRealtimeUpdates(currentMatch.id, currentMatch.match_source || "schedule");
}

/**
 * Hakemin atandığı ittifakı belirler
 * 
 * Öncelik sırası:
 * 1. URL parametresinden (?alliance=red veya ?alliance=blue)
 * 2. Kullanıcı adına göre (ileride backend'den gelecek)
 * 3. Maç numarasına göre (geçici çözüm)
 * 
 * @returns {string} "red" veya "blue"
 */
function determineAssignedAlliance() {
  const mode = document.body?.dataset?.refereeMode;
  if (mode === "red" || mode === "blue") {
    return mode;
  }
  // URL parametresinden kontrol et
  const urlParams = new URLSearchParams(window.location.search);
  const allianceParam = urlParams.get("alliance");
  if (allianceParam === "red" || allianceParam === "blue") {
    return allianceParam;
  }
  
  // Kullanıcı adına göre belirle (örnek: hakem_1 -> red, hakem_2 -> blue)
  const username = sessionStorage.getItem("username") || "";
  const matchNumber = currentMatch?.match_number || 0;
  
  // Basit mantık: Maç numarasına göre değişken atama
  // İleride backend'den gelecek
  return (matchNumber % 2 === 0) ? "red" : "blue";
}

/**
 * Mevcut skorları yükler
 */
async function loadCurrentScores() {
  if (!currentMatch) return;
  
  try {
    const source = currentMatch.match_source || "schedule";
    const data = await apiGet(`/api/referee/score/get/${currentMatch.id}?source=${encodeURIComponent(source)}`);
    
    // Atanan ittifakın skorlarını uygula
    if (assignedAlliance && data[assignedAlliance]) {
      const scoringData = data[assignedAlliance].scoring_data;
      applyScoringDataToForm(scoringData);
    }

    refereeMeta = data.referee_meta || {};
    updateSubmitStatus();
  } catch (err) {
    console.error("Load current scores error:", err);
  }
}

/**
 * Puanlama verilerini forma uygular
 */
function applyScoringDataToForm(scoringData) {
  // Tüm alanları güncelle
  Object.keys(scoringData).forEach(key => {
    const element = qs(`ref_${key}`);
    if (element) {
      if (element.type === "checkbox") {
        element.checked = scoringData[key];
      } else {
        element.value = scoringData[key] || 0;
      }
    }
  });
}

/**
 * Formdan puanlama verilerini toplar
 */
function collectScoringDataFromForm() {
  const data = {};
  
  // Tüm puanlama alanlarını topla
  const fields = document.querySelectorAll("#scoring_panel input, #scoring_panel select");
  fields.forEach(field => {
    const id = field.id.replace("ref_", "");
    if (field.type === "checkbox") {
      data[id] = field.checked;
    } else if (field.type === "number") {
      data[id] = parseInt(field.value || 0);
    }
  });
  
  return data;
}

/**
 * Skorları kaydeder
 */
async function saveScore() {
  if (!currentMatch || !assignedAlliance) {
    showToast("Maç veya ittifak seçilmedi", "error");
    return;
  }
  
  const scoringData = collectScoringDataFromForm();
  
  try {
    const result = await apiPost("/api/referee/score/update", {
      match_id: currentMatch.id,
      alliance: assignedAlliance,
      scoring_data: scoringData,
      match_source: currentMatch.match_source || "schedule"
    });
    showToast(`Skorlar kaydedildi (Toplam: ${result.calculated_score} puan)`, "success");
    await loadCurrentScores();
  } catch (err) {
    console.error("Save score error:", err);
    showToast("Skor kaydedilirken hata oluştu", "error");
  }
}

/**
 * Skorları senkronize eder (backend'den çeker)
 */
async function syncScore() {
  await loadCurrentScores();
  showToast("Skorlar senkronize edildi", "success");
}

/**
 * Gerçek zamanlı güncellemeleri başlatır (SSE)
 * 
 * Server-Sent Events kullanarak baş hakem ve diğer hakemlerden
 * gelen skor güncellemelerini gerçek zamanlı olarak alır.
 * 
 * @param {number} matchId - Maç ID'si
 */
function startRealtimeUpdates(matchId) {
  // Önceki bağlantıyı kapat
  if (scoreEventSource) {
    scoreEventSource.close();
    scoreEventSource = null;
  }
  
  // Retry sayacını sıfırla (başarılı bağlantıda)
  retryCount = 0;
  
  // Yeni SSE bağlantısı aç
  scoreEventSource = new EventSource(`/api/match-control/score/realtime/${matchId}?source=${encodeURIComponent(currentMatch?.match_source || "schedule")}`);
  
  scoreEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Başarılı mesaj alındı, retry sayacını sıfırla
      retryCount = 0;
      
      if ((data.type === "update" || data.type === "initial") && assignedAlliance) {
        // Sadece atanan ittifakın skorlarını güncelle
        const scores = data.scores;
        if (scores[assignedAlliance]) {
          applyScoringDataToForm(scores[assignedAlliance]);
        }
        if (scores.referee_meta) {
          refereeMeta = scores.referee_meta;
          updateSubmitStatus();
        }
      }
    } catch (err) {
      console.error("Realtime update error:", err);
      showToast("Skor güncellemesi işlenirken hata oluştu", "error");
    }
  };
  
  scoreEventSource.onerror = (err) => {
    console.error("SSE connection error:", err);
    // Bağlantı hatası durumunda exponential backoff ile yeniden bağlanmayı dene
    if (retryCount < MAX_RETRY_COUNT && currentMatch) {
      const retryDelay = Math.min(30000, RETRY_DELAY_BASE * Math.pow(2, retryCount));
      retryCount++;
      setTimeout(() => {
        if (currentMatch) {
          startRealtimeUpdates(currentMatch.id);
        }
      }, retryDelay);
    } else {
      console.error("SSE bağlantısı kurulamadı, maksimum deneme sayısına ulaşıldı");
      showToast("Gerçek zamanlı güncellemeler bağlantı hatası nedeniyle durduruldu", "warning");
    }
  };
}

/**
 * Gerçek zamanlı güncellemeleri durdurur
 */
function stopRealtimeUpdates() {
  if (scoreEventSource) {
    scoreEventSource.close();
    scoreEventSource = null;
  }
}

/**
 * Event listener'ları kurar
 */
function setupRefereeEventListeners() {
  const saveBtn = qs("btn_save_score");
  const syncBtn = qs("btn_sync_score");
  
  if (saveBtn) {
    saveBtn.addEventListener("click", saveScore);
  }
  
  if (syncBtn) {
    syncBtn.addEventListener("click", syncScore);
  }

  const submitBtn = qs("btn_submit_referee");
  if (submitBtn) {
    submitBtn.addEventListener("click", submitRefereeEntry);
  }

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-score-plus") || e.target.classList.contains("btn-score-minus")) {
      e.preventDefault();
      const fieldId = e.target.dataset.field;
      const field = qs(fieldId);
      if (field) {
        const currentValue = parseInt(field.value) || 0;
        const maxValue = field.hasAttribute("max") ? parseInt(field.getAttribute("max")) : null;
        const newValue = e.target.classList.contains("btn-score-plus")
          ? (maxValue !== null ? Math.min(maxValue, currentValue + 1) : currentValue + 1)
          : Math.max(0, currentValue - 1);
        field.value = newValue;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.matches("#scoring_panel input, #scoring_panel select")) {
      markLocalDraft();
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches("#scoring_panel input, #scoring_panel select")) {
      markLocalDraft();
    }
  });
}

async function submitRefereeEntry() {
  if (!currentMatch || !assignedAlliance) {
    showToast("Maç veya ittifak seçilmedi", "error");
    return;
  }
  try {
    await apiPost("/api/referee/submit", {
      match_id: currentMatch.id,
      alliance: assignedAlliance,
      match_source: currentMatch.match_source || "schedule"
    });
    showToast("Maç girişi tamamlandı", "success");
    await loadCurrentScores();
  } catch (err) {
    console.error("Submit referee entry error:", err);
    const message = err?.response?.error || "Maç girişi tamamlanamadı";
    showToast(message, "error");
  }
}

function updateSubmitStatus() {
  const statusEl = qs("referee_submit_status");
  const submitBtn = qs("btn_submit_referee");
  if (!statusEl || !submitBtn || !assignedAlliance) return;
  const allianceMeta = refereeMeta?.[assignedAlliance] || {};
  const headMeta = refereeMeta?.head || {};
  const submitted = !!allianceMeta.submitted;
  const approved = !!headMeta.approved;
  if (submitted) {
    statusEl.style.display = "block";
    statusEl.textContent = approved
      ? "Baş hakem onayı: Onaylandı"
      : "Durum: Giriş tamamlandı (Baş hakem onayı bekleniyor)";
    submitBtn.textContent = "Giriş Tamamlandı";
    submitBtn.disabled = true;
  } else {
    statusEl.style.display = "none";
    submitBtn.textContent = "Maç Girişini Bitir";
    submitBtn.disabled = false;
  }
}

function markLocalDraft() {
  if (!assignedAlliance || !refereeMeta?.[assignedAlliance]?.submitted) {
    return;
  }
  refereeMeta = {
    ...refereeMeta,
    [assignedAlliance]: {
      ...refereeMeta[assignedAlliance],
      submitted: false
    }
  };
  updateSubmitStatus();
}

/**
 * Yardımcı fonksiyonlar
 */
function qs(id) {
  return document.getElementById(id);
}

function getMatchTypeLabel(type) {
  const labels = {
    "qualification": "Sıralama",
    "elimination": "Elimination",
    "final": "Final",
    "practice": "Deneme"
  };
  return labels[type] || type;
}

function showToast(message, type = "info") {
  // Toast mesajı göster (utils.js'den veya kendi implementasyonunuz)
  if (window.showToast) {
    window.showToast(message, type);
  } else {
    alert(message);
  }
}

// Sayfa yüklendiğinde başlat
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeRefereePanel);
} else {
  initializeRefereePanel();
}
