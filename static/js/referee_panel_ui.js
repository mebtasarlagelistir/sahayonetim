/**
 * Referee Panel - UI Module
 * 
 * Bu modül UI güncellemeleri ile ilgili tüm fonksiyonları içerir:
 * - Maç bilgilerini yükleme ve görüntüleme
 * - Timer güncellemeleri
 * - Submit durumu güncellemeleri
 * - UI temizleme
 */

/**
 * Hakem için maç bilgilerini yükler
 */
async function loadMatchForReferee() {
  if (!currentMatch) {
    console.warn("loadMatchForReferee: currentMatch yok");
    return;
  }
  
  try {
    // Maç bilgilerini göster
    const matchInfoEl = qs("current_match_info");
    if (matchInfoEl) {
      matchInfoEl.textContent = 
        `Maç ${currentMatch.match_number || "?"} - ${getMatchTypeLabel(currentMatch.match_type)} - Saha ${currentMatch.field_number || "?"}`;
    }
    
    // Hakem ataması
    assignedAlliance = determineAssignedAlliance();
    
    const allianceEl = qs("assigned_alliance");
    if (allianceEl) {
      allianceEl.textContent = 
        `Atanan İttifak: ${assignedAlliance === "red" ? "Kırmızı" : "Mavi"} İttifak`;
    }
    
    const fieldEl = qs("assigned_field");
    if (fieldEl) {
      fieldEl.textContent = `Saha: ${currentMatch.field_number || "?"}`;
    }
    
    const teamsEl = qs("assigned_teams");
    if (teamsEl) {
      const teamList = assignedAlliance === "red" ? currentMatch.red_alliance : currentMatch.blue_alliance;
      teamsEl.textContent = `Takımlar: ${(teamList || []).join(", ") || "-"}`;
    }
    
    // Puanlama panelini göster
    const matchCard = qs("active_match_card");
    if (matchCard) matchCard.style.display = "block";
    
    const scoringPanel = qs("scoring_panel");
    if (scoringPanel) scoringPanel.style.display = "block";
    
    const noMatchMsg = qs("no_match_message");
    if (noMatchMsg) noMatchMsg.style.display = "none";
    
    const allianceTitle = qs("alliance_title");
    if (allianceTitle) {
      allianceTitle.textContent = 
        `${assignedAlliance === "red" ? "Kırmızı" : "Mavi"} İttifak Puanlama`;
    }
    
    // Robot durum butonlarını oluştur
    if (typeof renderRefereeRobotStatus === "function") {
      renderRefereeRobotStatus();
    }
    
    // Mevcut skorları yükle
    if (typeof loadCurrentScores === "function") {
      await loadCurrentScores();
    }
    
    // Timer'ı başlat (eğer maç aktifse)
    if (currentMatch.current_state && currentMatch.time_remaining !== undefined) {
      updateRefereeTimer(currentMatch.current_state, currentMatch.time_remaining);
    }
    
    // Gerçek zamanlı güncellemeleri başlat
    if (currentMatch.id) {
      if (typeof startRealtimeUpdates === "function") {
        startRealtimeUpdates(currentMatch.id, currentMatch.match_source || "schedule");
      }
    } else {
      console.error("loadMatchForReferee: currentMatch.id yok");
    }
  } catch (err) {
    console.error("loadMatchForReferee error:", err);
    if (typeof showToast === "function") {
      showToast("Maç bilgileri yüklenirken hata oluştu", "error");
    }
  }
}

/**
 * Hakem ekranını temizler ve bekleme mesajı gösterir
 */
function clearRefereeUI(message = "Aktif maç yok. Maç kontrol sayfasından başlatın.") {
  currentMatch = null;
  if (typeof stopRealtimeUpdates === "function") {
    stopRealtimeUpdates();
  }
  
  // Otomatik kaydetme timer'ını temizle
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  isAutoSaving = false;
  
  const matchCard = qs("active_match_card");
  if (matchCard) matchCard.style.display = "none";
  
  const scoringPanel = qs("scoring_panel");
  if (scoringPanel) scoringPanel.style.display = "none";
  
  // Timer'ı gizle
  const timerEl = qs("referee_match_timer");
  if (timerEl) timerEl.style.display = "none";
  
  // Robot durum bölümünü gizle
  const robotStatusEl = qs("referee_robot_status");
  if (robotStatusEl) robotStatusEl.style.display = "none";
  
  const noMatchMsg = qs("no_match_message");
  if (noMatchMsg) {
    noMatchMsg.style.display = "block";
    noMatchMsg.textContent = message;
  }
}

/**
 * Timer'ı günceller (referee panel için)
 */
function updateRefereeTimer(currentState, timeRemaining) {
  const timerEl = qs("referee_match_timer");
  const timerDisplayEl = qs("referee_timer_display");
  const timerStateEl = qs("referee_timer_state");
  
  if (!timerEl || !timerDisplayEl || !timerStateEl) return;
  
  // Timer'ı göster
  timerEl.style.display = "block";
  
  // Zamanı formatla (MM:SS)
  const minutes = Math.floor((timeRemaining || 0) / 60);
  const seconds = (timeRemaining || 0) % 60;
  timerDisplayEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  
  // Durum etiketini güncelle
  const stateLabels = {
    idle: "Beklemede",
    autonomous: "Otonom",
    prepare_teleop: "Hazırlık",
    driver_controlled: "Sürücü Kontrollü",
    end_game: "Oyun Sonu",
    post_match: "Maç Sonrası",
    completed: "Tamamlandı"
  };
  
  timerStateEl.textContent = stateLabels[currentState] || currentState || "-";
}

/**
 * Submit durumunu günceller
 */
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

/**
 * Local draft olarak işaretler (submit durumunu sıfırlar)
 */
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
  if (typeof updateSubmitStatus === "function") {
    updateSubmitStatus();
  }
}
