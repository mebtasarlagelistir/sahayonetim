/**
 * Maç Kontrol - Arayüz Görüntüleme Modülü
 * 
 * UI render fonksiyonları, formatlama ve yardımcı fonksiyonlar.
 * 
 * Bağımlılıklar: match_control_core.js, match_control_scoring.js, match_control_timer.js
 */

/** Takım durumu alanı sadece maç veya takım listesi değiştiğinde yeniden oluşturulur (seçimler silinmesin) */
let lastRenderedMatchId = null;
let lastRenderedRedKey = "";
let lastRenderedBlueKey = "";

/**
 * Maç görünümünü render eder
 */
function renderMatchDisplay() {
  if (!currentMatch) {
    lastRenderedMatchId = null;
    lastRenderedRedKey = "";
    lastRenderedBlueKey = "";
    // Maç yoksa tüm UI'ı temizle
    const matchStatusCard = qs("match_status_card");
    if (matchStatusCard) matchStatusCard.style.display = "none";
    const compactHeader = qs("compact_match_header");
    if (compactHeader) compactHeader.style.display = "none";
    const noMatchSelected = qs("no_match_selected");
    if (noMatchSelected) noMatchSelected.style.display = "block";
    const loadedMatchInfo = qs("loaded_match_info");
    if (loadedMatchInfo) loadedMatchInfo.textContent = "-";
    const activeMatchInfo = qs("active_match_info");
    if (activeMatchInfo) activeMatchInfo.textContent = "-";
    
    // Merkezi skorları temizle
    const centralBlueScore = qs("central_blue_score");
    if (centralBlueScore) centralBlueScore.textContent = "0";
    const centralRedScore = qs("central_red_score");
    if (centralRedScore) centralRedScore.textContent = "0";
    
    // Merkezi durum bilgisini temizle
    const centralMatchStatus = qs("central_match_status");
    if (centralMatchStatus) centralMatchStatus.textContent = "Aktif Maç Yok";
    
    // İttifak bilgilerini temizle
    const centralBlueTeams = qs("central_blue_teams");
    if (centralBlueTeams) centralBlueTeams.innerHTML = "";
    const centralRedTeams = qs("central_red_teams");
    if (centralRedTeams) centralRedTeams.innerHTML = "";
    
    // Detaylı skorlama alanlarını temizle
    const detailedBlueTeams = qs("detailed_blue_teams");
    if (detailedBlueTeams) detailedBlueTeams.innerHTML = "";
    const detailedRedTeams = qs("detailed_red_teams");
    if (detailedRedTeams) detailedRedTeams.innerHTML = "";
    
    return;
  }
  
  const matchStatusCard = qs("match_status_card");
  if (matchStatusCard) matchStatusCard.style.display = "block";
  const noMatchSelected = qs("no_match_selected");
  if (noMatchSelected) noMatchSelected.style.display = "none";
  
  // Üst bar bilgileri
  const loadedMatchInfo = qs("loaded_match_info");
  if (loadedMatchInfo) {
    loadedMatchInfo.textContent = `Maç ${currentMatch.match_number} (${getMatchTypeLabel(currentMatch.match_type)})`;
  }
  const activeMatchInfo = qs("active_match_info");
  if (activeMatchInfo) {
    if (currentMatch.status === "in_progress") {
      activeMatchInfo.textContent = `Maç ${currentMatch.match_number} - ${MATCH_STATES[currentState]?.label || "Aktif"}`;
    } else if (currentMatch.status === "scheduled") {
      activeMatchInfo.textContent = "-";
    } else if (currentMatch.status === "completed") {
      activeMatchInfo.textContent = `Maç ${currentMatch.match_number} - Tamamlandı`;
    } else {
      activeMatchInfo.textContent = "-";
    }
  }
  
  // Maç başlığı (eski - gizli)
  const currentMatchTitle = qs("current_match_title");
  if (currentMatchTitle) currentMatchTitle.textContent = `Maç ${currentMatch.match_number}`;
  const currentMatchNumber = qs("current_match_number");
  if (currentMatchNumber) currentMatchNumber.textContent = `#${currentMatch.match_number}`;
  const currentMatchType = qs("current_match_type");
  if (currentMatchType) currentMatchType.textContent = getMatchTypeLabel(currentMatch.match_type);
  const currentFieldNumber = qs("current_field_number");
  if (currentFieldNumber) currentFieldNumber.textContent = `Saha ${currentMatch.field_number}`;
  
  // Kompakt maç başlığı (her zaman göster - timer için önemli)
  const compactHeader = qs("compact_match_header");
  if (compactHeader) {
    compactHeader.style.display = "block";
    const compactMatchNumber = qs("compact_match_number");
    if (compactMatchNumber) compactMatchNumber.textContent = `Maç ${currentMatch.match_number}`;
    const compactMatchTypeField = qs("compact_match_type_field");
    if (compactMatchTypeField) {
      compactMatchTypeField.textContent = `${getMatchTypeLabel(currentMatch.match_type)} • Saha ${currentMatch.field_number}`;
    }
  }
  
  // Timer'ı her zaman güncelle (kompakt header'dan bağımsız)
  const compactStateLabel = qs("compact_state_label");
  const compactTimer = qs("compact_timer");
  if (compactStateLabel) {
    compactStateLabel.textContent = MATCH_STATES[currentState]?.label || "Beklemede";
  }
  if (compactTimer) {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const newContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    compactTimer.textContent = newContent;
  }
  
  // Eski timer elementini de güncelle (state_timer)
  const stateTimer = qs("state_timer");
  if (stateTimer) {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const newContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    stateTimer.textContent = newContent;
  }
  
  // Merkezi match status
  const centralMatchStatus = qs("central_match_status");
  if (centralMatchStatus) {
    if (currentMatch.status === "preview") {
      centralMatchStatus.textContent = "Önizleme";
    } else if (currentMatch.status === "in_progress") {
      centralMatchStatus.textContent = `${MATCH_STATES[currentState]?.label || "Aktif"} - ${formatTime(timeRemaining)}`;
    } else if (currentMatch.status === "scheduled") {
      centralMatchStatus.textContent = "Durduruldu";
    } else if (currentMatch.source === "practice") {
      centralMatchStatus.textContent = "Deneme Maçı";
    } else if (currentMatch.status === "completed") {
      centralMatchStatus.textContent = "Tamamlandı";
    } else {
      centralMatchStatus.textContent = "Aktif Maç Yok";
    }
  }
  
  // Merkezi skorlar
  const centralBlueScore = qs("central_blue_score");
  if (centralBlueScore) centralBlueScore.textContent = currentMatch.blue_score || 0;
  const centralRedScore = qs("central_red_score");
  if (centralRedScore) centralRedScore.textContent = currentMatch.red_score || 0;
  
  // İttifaklar - Merkezi display için
  renderCentralAlliance("blue", currentMatch.blue_alliance);
  renderCentralAlliance("red", currentMatch.red_alliance);
  
  // Detaylı skorlama: takım durumu alanını SADECE maç veya takım listesi değiştiğinde yeniden oluştur.
  // Her notify'da (timer vb.) yeniden oluşturmak kullanıcı seçimlerini siliyordu.
  const redKey = JSON.stringify(currentMatch.red_alliance || []);
  const blueKey = JSON.stringify(currentMatch.blue_alliance || []);
  const matchOrTeamsChanged =
    currentMatch.id !== lastRenderedMatchId ||
    redKey !== lastRenderedRedKey ||
    blueKey !== lastRenderedBlueKey;
  if (matchOrTeamsChanged) {
    renderDetailedAllianceTeams("blue", currentMatch.blue_alliance);
    renderDetailedAllianceTeams("red", currentMatch.red_alliance);
    lastRenderedMatchId = currentMatch.id;
    lastRenderedRedKey = redKey;
    lastRenderedBlueKey = blueKey;
  }
  
  // Buton durumları
  const isActive = currentMatch.status === "in_progress";
  const isCompleted = currentMatch.status === "completed";
  
  const btnStartMatch = qs("btn_start_match");
  if (btnStartMatch) {
    const showStart = !isActive && !isCompleted && !!currentMatch;
    btnStartMatch.style.display = showStart ? "inline-block" : "none";
    if (showStart) {
      const canStart = typeof canStartMatch === "function" ? canStartMatch() : false;
      btnStartMatch.disabled = !canStart;
      btnStartMatch.title = canStart ? "" : "Tüm robotlar için hazırlık durumu işaretleyin (Hazır, DQ, RY veya Bypass)";
    }
  }
  const btnNextState = qs("btn_next_state");
  if (btnNextState) btnNextState.style.display = isActive ? "inline-block" : "none";
  const btnStopMatch = qs("btn_stop_match");
  if (btnStopMatch) btnStopMatch.style.display = isActive ? "inline-block" : "none";
  // Sonuçları göster butonu - maç aktifken ve post_match'te veya timer bittiğinde göster
  // Maç süresi bittikten sonra hakemler düzenleme yapabilsin, sonra sonuçları göster
  const btnShowResults = qs("btn_show_results");
  if (btnShowResults) {
    // Post-match durumunda veya timer bittiğinde (maç hala aktif ama süre bitti)
    const showResults = isActive && (currentState === "post_match" || (timeRemaining === 0 && currentState !== "idle"));
    btnShowResults.style.display = showResults ? "inline-block" : "none";
  }
  // Maçı tamamla butonu - sadece match control'den yapılabilir
  // Post-match bitince veya timer bittiğinde göster (hakemler düzenleme yaptıktan sonra)
  const btnCompleteMatch = qs("btn_complete_match");
  if (btnCompleteMatch) {
    // Post-match durumunda veya timer bittiğinde (maç hala aktif ama süre bitti)
    const showComplete = isActive && (currentState === "post_match" || (timeRemaining === 0 && currentState !== "idle"));
    btnCompleteMatch.style.display = showComplete ? "inline-block" : "none";
  }
  const btnCommitPost = qs("btn_commit_post");
  if (btnCommitPost) btnCommitPost.style.display = isCompleted ? "inline-block" : "none";
  
  // Skor dökümünü hesapla
  if (typeof calculateScoreBreakdown === "function") {
    calculateScoreBreakdown();
  }
  
  // Durum görünümünü güncelle
  if (typeof updateStateDisplay === "function") {
    updateStateDisplay();
  }
}

/**
 * Baş hakem onayı göstergesini günceller.
 * Baş hakem maçı onayladığında skor kontrol ekranında "Baş hakem onayı: Onaylandı" görünür.
 *
 * @param {Object} refereeMeta - state.scores.referee_meta (MatchCore'dan)
 */
function updateHeadRefereeApprovedIndicator(refereeMeta) {
  const el = typeof qs === "function" ? qs("head_referee_approved_indicator") : document.getElementById("head_referee_approved_indicator");
  const textEl = typeof qs === "function" ? qs("head_referee_approved_text") : document.getElementById("head_referee_approved_text");
  if (!el) return;
  const head = refereeMeta && refereeMeta.head;
  const approved = head && head.approved === true;
  if (approved) {
    el.style.display = "";
    if (textEl) {
      const by = head.approved_by ? ` (${head.approved_by})` : "";
      textEl.textContent = "Baş hakem onayı: Onaylandı" + by;
    }
  } else {
    el.style.display = "none";
  }
}

/**
 * Zamanı formatlar (MM:SS)
 */
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Merkezi alliance görünümünü render eder
 */
function renderCentralAlliance(alliance, teams) {
  const teamsContainer = qs(`central_${alliance}_teams`);
  const statusContainer = qs(`central_${alliance}_status`);
  
  if (teamsContainer && teams && teams.length > 0) {
    // Takım numaralarını göster
    teamsContainer.innerHTML = teams.map((team, index) => {
      return `
        <div class="central-team-item">
          <div class="central-team-number">${team}</div>
          <div class="central-team-label">Robot ${index + 1}</div>
        </div>
      `;
    }).join("");
  } else if (teamsContainer) {
    teamsContainer.innerHTML = "<div class='no-teams'>Takım yok</div>";
  }
  
  // Status square'leri oluştur (her takım için)
  if (statusContainer && teams && teams.length > 0) {
    statusContainer.innerHTML = teams.map((team, index) => {
      return `
        <div class="status-square status-ready" data-team="${alliance}-${index + 1}" data-team-number="${team}" title="Takım ${team} - Hazır">
          <span class="status-team-number">${team}</span>
        </div>
      `;
    }).join("");
  } else if (statusContainer) {
    statusContainer.innerHTML = "";
  }
}

/**
 * Detaylı skorlama panellerinde takımları gösterir
 */
function renderDetailedAllianceTeams(alliance, teams) {
  const teamsContainer = qs(`detailed_${alliance}_teams`);
  const statusContainer = qs(`${alliance}_team_statuses`);
  
  if (teamsContainer && teams && teams.length > 0) {
    teamsContainer.innerHTML = `
      <div class="alliance-teams-list">
        ${teams.map((team, index) => `
          <div class="detailed-team-badge">
            <span class="team-number">${team}</span>
            <span class="team-robot-label">Robot ${index + 1}</span>
          </div>
        `).join("")}
      </div>
    `;
  } else if (teamsContainer) {
    teamsContainer.innerHTML = "<div class='no-teams'>Takım yok</div>";
  }
  
  // Takım durumları
  if (statusContainer && teams && teams.length > 0) {
    statusContainer.innerHTML = `
      <div class="team-status-grid">
        ${teams.map((team, index) => `
          <div class="team-status-item" data-team="${alliance}-${index + 1}" data-team-number="${team}">
            <div class="team-status-header">
              <span class="team-status-number">${team}</span>
              <span class="team-status-robot">R${index + 1}</span>
            </div>
            <div class="team-status-buttons">
              <button class="team-status-btn" data-status="ready" data-team="${alliance}-${index + 1}" title="Hazır">✓</button>
              <button class="team-status-btn" data-status="yellow" data-team="${alliance}-${index + 1}" title="Sarı Kart">🟡</button>
              <button class="team-status-btn" data-status="red" data-team="${alliance}-${index + 1}" title="Kırmızı Kart">🔴</button>
              <button class="team-status-btn" data-status="dq" data-team="${alliance}-${index + 1}" title="Diskalifiye">DQ</button>
              <button class="team-status-btn" data-status="ry" data-team="${alliance}-${index + 1}" title="Robot Yok">RY</button>
              <button class="team-status-btn" data-status="bypass" data-team="${alliance}-${index + 1}" title="Bypass">⏭️</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
    
    // Status butonları için event listener'lar
    statusContainer.querySelectorAll(".team-status-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const status = btn.dataset.status;
        const teamId = btn.dataset.team;
        toggleTeamStatus(alliance, teamId, status, btn);
      });
    });
  } else if (statusContainer) {
    statusContainer.innerHTML = "";
  }
}

/**
 * Takım durumunu değiştirir
 */
function toggleTeamStatus(alliance, teamId, status, button) {
  // Eğer aynı butona tekrar tıklanırsa, seçimi kaldır
  if (button.classList.contains("active")) {
    button.classList.remove("active");
    
    // Status square'i sıfırla
    const statusSquare = document.querySelector(`.status-square[data-team="${teamId}"]`);
    if (statusSquare) {
      statusSquare.className = `status-square status-ready`;
      const teamNumber = button.closest(".team-status-item").dataset.teamNumber;
      statusSquare.title = `Takım ${teamNumber} - Hazır`;
    }
    
    // Kırmızı kart checkbox'ını kaldır
    if (status === "red") {
      const robotIndex = teamId.split("-")[1];
      const checkboxId = `${alliance}_red_card_r${robotIndex}`;
      const checkbox = qs(checkboxId);
      if (checkbox) {
        checkbox.checked = false;
        if (typeof calculateScoreBreakdown === "function") {
          calculateScoreBreakdown();
        }
      }
    }
    if (typeof renderMatchDisplay === "function") {
      renderMatchDisplay();
    }
    persistTeamStatusesToBackend();
    return;
  }
  
  // Diğer butonları sıfırla
  const teamItem = button.closest(".team-status-item");
  const allButtons = teamItem.querySelectorAll(".team-status-btn");
  allButtons.forEach(btn => {
    btn.classList.remove("active");
  });
  
  // Seçilen butonu aktif yap
  button.classList.add("active");
  
  // Maç başlat butonunun aktif/pasif durumunu güncelle (robot hazırlık zorunluluğu)
  if (typeof renderMatchDisplay === "function") {
    renderMatchDisplay();
  }
  
  // Status square'i güncelle (merkezi display'de)
  const statusSquare = document.querySelector(`.status-square[data-team="${teamId}"]`);
  if (statusSquare) {
    statusSquare.className = `status-square status-${status}`;
    
    // Status'a göre title güncelle
    const statusLabels = {
      ready: "Hazır",
      yellow: "Sarı Kart",
      red: "Kırmızı Kart",
      dq: "Diskalifiye",
      ry: "Robot Yok",
      bypass: "Bypass"
    };
    const teamNumber = button.closest(".team-status-item").dataset.teamNumber;
    statusSquare.title = `Takım ${teamNumber} - ${statusLabels[status] || "Bilinmiyor"}`;
    
    // Status square içindeki takım numarasını güncelle
    const teamNumberSpan = statusSquare.querySelector(".status-team-number");
    if (teamNumberSpan) {
      teamNumberSpan.textContent = teamNumber;
    }
  }
  
  // Kırmızı kart durumunda özel işlem
  if (status === "red") {
    const robotIndex = teamId.split("-")[1];
    const checkboxId = `${alliance}_red_card_r${robotIndex}`;
    const checkbox = qs(checkboxId);
    if (checkbox) {
      checkbox.checked = true;
      if (typeof calculateScoreBreakdown === "function") {
        calculateScoreBreakdown();
      }
    }
  }
  
  // Maç kontrolünden yapılan seçim backend'e kaydedilir; hakem panelleri ile senkron kalır
  persistTeamStatusesToBackend();
}

/**
 * Robot hazırlık durumlarını backend'e kaydeder (maç kontrol ↔ hakem panelleri senkronu).
 */
function persistTeamStatusesToBackend() {
  if (!currentMatch || !currentMatch.id) return;
  if (typeof collectTeamStatuses !== "function" || typeof apiPost !== "function") return;
  const team_statuses = collectTeamStatuses();
  apiPost("/api/match-control/team-status", {
    match_id: currentMatch.id,
    match_source: currentMatch.match_source || "schedule",
    team_statuses
  }).catch((err) => {
    console.error("Robot durumu kaydedilirken hata:", err);
  });
}

/**
 * İttifak görünümünü render eder (eski sistem - geriye dönük uyumluluk için)
 */
function renderAlliance(alliance, teams, score) {
  const teamsContainer = qs(`${alliance}_alliance_teams`);
  const scoreDisplay = qs(`${alliance}_score_display`);
  const scoreInput = qs(`${alliance}_score_input`);
  
  if (teamsContainer) {
    teamsContainer.innerHTML = teams.map(team => 
      `<div class="team-badge">${team}</div>`
    ).join("");
  }
  
  if (scoreDisplay) {
    scoreDisplay.textContent = score;
  }
  
  if (scoreInput) {
    scoreInput.value = score;
  }
}

/**
 * Önemli anları gösterir
 */
function showImportantMoment(state) {
  const messages = {
    autonomous: "Otonom süre başladı!",
    prepare_teleop: "Kontrol ünitelerinizi hazırlayınız!",
    driver_controlled: "Sürücü kontrollü süre başladı!",
    end_game: "Oyun sonu!",
    post_match: "Maç sonrası"
  };
  
  const message = messages[state];
  if (message) {
    showToast(message, "info", 3000);
  }
  if (state === "end_game") {
    playAlertTone();
  }
}

/**
 * Kısa uyarı tonu çalar (end game başlangıcı için)
 */
function playAlertTone() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
    oscillator.onended = () => {
      context.close().catch(() => {});
    };
  } catch (err) {
    console.error("Alert tone error:", err);
  }
}

/**
 * Durum etiketini döndürür
 */
function getStatusLabel(status) {
  const labels = {
    scheduled: "Planlandı",
    in_progress: "Devam Ediyor",
    completed: "Tamamlandı",
    cancelled: "İptal"
  };
  return labels[status] || status;
}

/**
 * Maç tipi etiketini döndürür
 */
function getMatchTypeLabel(type) {
  const labels = {
    practice: "Deneme",
    qualification: "Sıralama",
    elimination: "Eleme (Playoff)",
    final: "Final"
  };
  return labels[type] || type;
}

/**
 * Detaylı skorlama container'ını başka bir yere taşır
 */
function moveDetailedScoringTo(targetId) {
  const container = qs("detailed_scoring_container");
  const target = qs(targetId);
  if (!container || !target) return;
  if (!detailedScoringHome) {
    detailedScoringHome = container.parentElement;
  }
  if (targetId === "detailed_scoring_home" && detailedScoringHome) {
    detailedScoringHome.appendChild(container);
  } else {
    target.appendChild(container);
  }
}
