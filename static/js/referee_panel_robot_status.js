/**
 * Referee Panel - Robot Status Module
 * 
 * Bu modül robot durumu yönetimi ile ilgili tüm fonksiyonları içerir:
 * - Robot durum butonlarını render etme
 * - Robot durumunu toggle etme
 * - Robot durumunu backend'e kaydetme
 * - Mevcut robot durumlarını yükleme
 */

/**
 * Robot durum butonlarını render eder (referee panel için)
 */
function renderRefereeRobotStatus() {
  if (!currentMatch || !assignedAlliance) {
    const robotStatusEl = qs("referee_robot_status");
    if (robotStatusEl) robotStatusEl.style.display = "none";
    return;
  }
  
  const robotStatusEl = qs("referee_robot_status");
  const robotStatusGrid = qs("referee_robot_status_grid");
  
  if (!robotStatusEl || !robotStatusGrid) return;
  
  // Atanan ittifakın takımlarını al
  const teams = assignedAlliance === "red" ? currentMatch.red_alliance : currentMatch.blue_alliance;
  if (!teams || teams.length === 0) {
    robotStatusEl.style.display = "none";
    return;
  }
  
  // Robot durum bölümünü göster
  robotStatusEl.style.display = "block";
  
  // Robot durum butonlarını oluştur
  robotStatusGrid.innerHTML = teams.map((team, index) => {
    const robotIndex = index + 1;
    return `
      <div class="referee-robot-status-item">
        <div class="referee-robot-status-header">
          <span class="referee-robot-team-number">${team}</span>
          <span class="referee-robot-label">R${robotIndex}</span>
        </div>
        <div class="referee-robot-status-buttons">
          <button class="referee-robot-status-btn" data-status="ready" data-robot="${robotIndex}" data-team="${team}" title="Hazır">✓</button>
          <button class="referee-robot-status-btn" data-status="yellow" data-robot="${robotIndex}" data-team="${team}" title="Sarı Kart">🟡</button>
          <button class="referee-robot-status-btn" data-status="red" data-robot="${robotIndex}" data-team="${team}" title="Kırmızı Kart">🔴</button>
          <button class="referee-robot-status-btn" data-status="dq" data-robot="${robotIndex}" data-team="${team}" title="Diskalifiye">DQ</button>
          <button class="referee-robot-status-btn" data-status="ry" data-robot="${robotIndex}" data-team="${team}" title="Robot Yok">RY</button>
          <button class="referee-robot-status-btn" data-status="bypass" data-robot="${robotIndex}" data-team="${team}" title="Bypass">⏭️</button>
        </div>
      </div>
    `;
  }).join("");
  
  // Event listener'ları ekle
  robotStatusGrid.querySelectorAll(".referee-robot-status-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const status = btn.dataset.status;
      const robotIndex = btn.dataset.robot;
      toggleRefereeRobotStatus(robotIndex, status, btn);
    });
  });
  
  // Mevcut robot durumlarını yükle (eğer varsa)
  if (typeof loadRefereeRobotStatuses === "function") {
    loadRefereeRobotStatuses();
  }
}

/**
 * Robot durumunu toggle eder (referee panel için)
 */
function toggleRefereeRobotStatus(robotIndex, status, button) {
  // Eğer aynı butona tekrar tıklanırsa, seçimi kaldır
  if (button.classList.contains("active")) {
    button.classList.remove("active");
    updateRobotStatus(robotIndex, null); // Durumu temizle
    return;
  }
  
  // Diğer butonları sıfırla (aynı robot için)
  const robotItem = button.closest(".referee-robot-status-item");
  if (robotItem) {
    robotItem.querySelectorAll(".referee-robot-status-btn").forEach(btn => {
      btn.classList.remove("active");
    });
  }
  
  // Seçilen butonu aktif yap
  button.classList.add("active");
  
  // Durumu kaydet
  updateRobotStatus(robotIndex, status);
}

/**
 * Robot durumunu backend'e kaydeder
 * 
 * ÖNEMLİ: Robot durumları team_statuses formatında saklanır (match control ile tutarlılık için)
 * Format: team_statuses: { red: { r1: "ready", r2: "yellow" }, blue: {...} }
 */
async function updateRobotStatus(robotIndex, status) {
  if (!currentMatch || !currentMatch.id || !assignedAlliance) return;
  
  try {
    // Mevcut scoring_data'yı al
    const scoringData = collectScoringDataFromForm();
    
    // team_statuses formatını kullan (match control ile tutarlılık)
    if (!scoringData.team_statuses) {
      scoringData.team_statuses = {};
    }
    if (!scoringData.team_statuses[assignedAlliance]) {
      scoringData.team_statuses[assignedAlliance] = {};
    }
    
    // Robot durumunu ekle/güncelle (r1, r2 formatında)
    const robotKey = `r${robotIndex}`;
    if (status) {
      scoringData.team_statuses[assignedAlliance][robotKey] = status;
    } else {
      // Durum temizleniyorsa, key'i kaldır
      delete scoringData.team_statuses[assignedAlliance][robotKey];
      // Eğer ittifakın hiç durumu kalmadıysa, ittifak objesini de kaldır
      if (Object.keys(scoringData.team_statuses[assignedAlliance]).length === 0) {
        delete scoringData.team_statuses[assignedAlliance];
      }
    }
    
    // Backend'e kaydet
    await apiPost("/api/referee/score/update", {
      match_id: currentMatch.id,
      alliance: assignedAlliance,
      scoring_data: scoringData,
      match_source: currentMatch.match_source || "schedule"
    });
    
    console.log(`Robot ${robotIndex} durumu kaydedildi (${assignedAlliance}): ${status || "temizlendi"}`);
  } catch (err) {
    console.error("Robot durumu kaydedilirken hata:", err);
    if (typeof showToast === "function") {
      showToast("Robot durumu kaydedilirken hata oluştu", "error");
    }
  }
}

/**
 * Mevcut robot durumlarını yükler ve butonlara uygular
 * 
 * ÖNEMLİ: Robot durumları team_statuses formatından okunur (match control ile tutarlılık)
 * Format: team_statuses: { red: { r1: "ready", r2: "yellow" }, blue: {...} }
 * 
 * NOT: Bu fonksiyon scoring_data'dan robot durumlarını okur ve butonlara uygular.
 * scoring_data parametresi olarak verilmelidir (loadCurrentScores'dan gelir).
 */
function loadRefereeRobotStatuses(scoringData = null) {
  if (!currentMatch || !assignedAlliance) return;
  
  // Eğer scoringData verilmemişse, formdan topla (ama bu genelde backend'den gelir)
  if (!scoringData) {
    // Backend'den yüklenen veriyi kullanmak için bu fonksiyon applyScoringDataToForm'dan çağrılmalı
    return;
  }
  
  // team_statuses formatından robot durumlarını oku
  const teamStatuses = scoringData.team_statuses || {};
  const allianceStatuses = teamStatuses[assignedAlliance] || {};
  const teams = assignedAlliance === "red" ? (currentMatch.red_alliance || []) : (currentMatch.blue_alliance || []);
  const robotCount = Math.max(teams.length, 2);
  
  // Robot durumlarını butonlara uygula (maçtaki tüm robotlar için)
  for (let robotIndex = 1; robotIndex <= robotCount; robotIndex++) {
    const robotKey = `r${robotIndex}`;
    const status = allianceStatuses[robotKey];
    
    if (status) {
      const robotItem = document.querySelector(`.referee-robot-status-item:nth-child(${robotIndex})`);
      if (robotItem) {
        const btn = robotItem.querySelector(`.referee-robot-status-btn[data-status="${status}"]`);
        if (btn) {
          // Diğer butonları sıfırla
          robotItem.querySelectorAll(".referee-robot-status-btn").forEach(b => b.classList.remove("active"));
          // Seçili butonu aktif yap
          btn.classList.add("active");
        }
      }
    } else {
      // Durum yoksa, tüm butonları temizle
      const robotItem = document.querySelector(`.referee-robot-status-item:nth-child(${robotIndex})`);
      if (robotItem) {
        robotItem.querySelectorAll(".referee-robot-status-btn").forEach(b => b.classList.remove("active"));
      }
    }
  }
}
