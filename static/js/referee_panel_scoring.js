/**
 * Referee Panel - Scoring Module
 * 
 * Bu modül skorlama işlemleri ile ilgili tüm fonksiyonları içerir:
 * - Skor yükleme ve uygulama
 * - Otomatik kaydetme (debounce)
 * - Manuel kaydetme
 * - Skor senkronizasyonu
 */

/**
 * Mevcut skorları yükler
 * 
 * @param {boolean} applyScores - Skorları forma uygula mı? (varsayılan: true)
 *                                false ise sadece referee meta'yı günceller
 */
async function loadCurrentScores(applyScores = true) {
  if (!currentMatch || !currentMatch.id) {
    console.warn("loadCurrentScores: currentMatch veya currentMatch.id yok");
    return;
  }
  
  try {
    const source = currentMatch.match_source || "schedule";
    const data = await apiGet(`/api/referee/score/get/${currentMatch.id}?source=${encodeURIComponent(source)}`);
    
    // Atanan ittifakın skorlarını uygula (sadece applyScores=true ise ve kullanıcı input yapmıyorsa)
    if (applyScores && !isUserEditing && assignedAlliance && data && data[assignedAlliance]) {
      const scoringData = data[assignedAlliance].scoring_data || data[assignedAlliance];
      if (scoringData) {
        console.log("loadCurrentScores: Skorlar forma uygulanıyor");
        applyScoringDataToForm(scoringData); // Bu fonksiyon içinde loadRefereeRobotStatuses çağrılır
      }
    } else if (applyScores && isUserEditing) {
      console.log("loadCurrentScores: Kullanıcı input yapıyor, skorlar uygulanmıyor");
    }

    // Referee meta'yı her zaman güncelle (submit durumu için)
    refereeMeta = (data && data.referee_meta) ? data.referee_meta : {};
    if (typeof updateSubmitStatus === "function") {
      updateSubmitStatus();
    }
  } catch (err) {
    console.error("Load current scores error:", err);
    // Hata durumunda kullanıcıya bilgi ver
    if (typeof showToast === "function") {
      showToast("Skorlar yüklenirken hata oluştu. Lütfen tekrar deneyin.", "warning");
    }
  }
}

/**
 * Puanlama verilerini forma uygular
 */
function applyScoringDataToForm(scoringData) {
  if (!scoringData || typeof scoringData !== "object") {
    console.warn("applyScoringDataToForm: Geçersiz scoringData", scoringData);
    return;
  }
  
  // Tüm alanları güncelle
  Object.keys(scoringData).forEach(key => {
    try {
      // team_statuses için özel işlem (robot durumları butonlar için)
      if (key === "team_statuses") {
        // Robot durumları loadRefereeRobotStatuses ile işlenecek
        return;
      }
      
      // Eski format desteği: robot_X_status (geriye dönük uyumluluk)
      if (key.startsWith("robot_") && key.endsWith("_status")) {
        // Eski formatı team_statuses formatına çevir (migration)
        if (!scoringData.team_statuses) {
          scoringData.team_statuses = {};
        }
        if (!scoringData.team_statuses[assignedAlliance]) {
          scoringData.team_statuses[assignedAlliance] = {};
        }
        const robotIndex = key.replace("robot_", "").replace("_status", "");
        scoringData.team_statuses[assignedAlliance][`r${robotIndex}`] = scoringData[key];
        // Eski key'i kaldırma (geriye dönük uyumluluk için bırakıyoruz)
        return;
      }
      
      const element = qs(`ref_${key}`);
      if (element) {
        if (element.type === "checkbox") {
          element.checked = !!scoringData[key];
        } else if (element.type === "number") {
          const value = parseInt(scoringData[key]) || 0;
          element.value = value;
        } else {
          element.value = scoringData[key] || 0;
        }
      }
    } catch (err) {
      console.warn(`applyScoringDataToForm: Alan güncellenirken hata (${key}):`, err);
    }
  });
  
  // Robot durumlarını yükle (butonlara uygula)
  if (typeof loadRefereeRobotStatuses === "function") {
    loadRefereeRobotStatuses(scoringData);
  }
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
 * Otomatik kaydetme için zamanlayıcı ayarlar (debounce)
 */
function scheduleAutoSave() {
  // Önceki timer'ı iptal et
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  
  // Yeni timer başlat
  autoSaveTimer = setTimeout(() => {
    autoSaveScore();
  }, AUTO_SAVE_DELAY);
}

/**
 * Skorları otomatik olarak kaydeder (kullanıcıya bildirim göstermez)
 */
async function autoSaveScore() {
  if (isAutoSaving) return; // Zaten kaydediliyorsa bekle
  if (!currentMatch || !currentMatch.id) return;
  if (!assignedAlliance) return;
  
  const scoringData = collectScoringDataFromForm();
  if (!scoringData || Object.keys(scoringData).length === 0) return;
  
  isAutoSaving = true;
  try {
    const result = await apiPost("/api/referee/score/update", {
      match_id: currentMatch.id,
      alliance: assignedAlliance,
      scoring_data: scoringData,
      match_source: currentMatch.match_source || "schedule"
    });
    
    // Otomatik kaydetmede toast gösterme (kullanıcıyı rahatsız etmemek için)
    // Sadece console'da log
    console.log("Skorlar otomatik olarak kaydedildi", {
      matchId: currentMatch.id,
      alliance: assignedAlliance,
      calculatedScore: result?.calculated_score
    });
    
    // Kaydetme başarılı olduktan sonra kısa bir süre daha "editing" modunda kal
    // (WebSocket'ten gelen güncellemeleri ignore etmek için)
    if (typeof isUserEditing !== "undefined") {
      isUserEditing = true;
      if (typeof userEditingTimeout !== "undefined" && userEditingTimeout) {
        clearTimeout(userEditingTimeout);
      }
      if (typeof USER_EDITING_TIMEOUT !== "undefined") {
        userEditingTimeout = setTimeout(() => {
          isUserEditing = false;
          console.log("autoSaveScore: Kaydetme sonrası bekleme süresi doldu, skor güncellemeleri tekrar aktif");
        }, USER_EDITING_TIMEOUT);
      }
    }
  } catch (err) {
    console.error("Auto save score error:", err);
    // Hata durumunda sessizce devam et (kullanıcı manuel kaydetmeyi deneyebilir)
  } finally {
    isAutoSaving = false;
  }
}

/**
 * Skorları kaydeder (manuel kaydetme - toast gösterir)
 */
async function saveScore() {
  if (!currentMatch || !currentMatch.id) {
    if (typeof showToast === "function") {
      showToast("Aktif maç bulunamadı", "error");
    }
    return;
  }
  
  if (!assignedAlliance) {
    if (typeof showToast === "function") {
      showToast("İttifak seçilmedi", "error");
    }
    return;
  }
  
  // Otomatik kaydetme timer'ını iptal et (manuel kaydetme öncelikli)
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  
  const scoringData = collectScoringDataFromForm();
  
  if (!scoringData || Object.keys(scoringData).length === 0) {
    if (typeof showToast === "function") {
      showToast("Kaydedilecek skor verisi bulunamadı", "warning");
    }
    return;
  }
  
  try {
    const result = await apiPost("/api/referee/score/update", {
      match_id: currentMatch.id,
      alliance: assignedAlliance,
      scoring_data: scoringData,
      match_source: currentMatch.match_source || "schedule"
    });
    
    if (result && result.calculated_score !== undefined) {
      if (typeof showToast === "function") {
        showToast(`Skorlar kaydedildi (Toplam: ${result.calculated_score} puan)`, "success");
      }
    } else {
      if (typeof showToast === "function") {
        showToast("Skorlar kaydedildi", "success");
      }
    }
    
    // Kaydetme başarılı olduktan sonra kısa bir süre daha "editing" modunda kal
    // (WebSocket'ten gelen güncellemeleri ignore etmek için)
    if (typeof isUserEditing !== "undefined") {
      isUserEditing = true;
      if (typeof userEditingTimeout !== "undefined" && userEditingTimeout) {
        clearTimeout(userEditingTimeout);
      }
      if (typeof USER_EDITING_TIMEOUT !== "undefined") {
        userEditingTimeout = setTimeout(() => {
          isUserEditing = false;
          console.log("saveScore: Kaydetme sonrası bekleme süresi doldu, skor güncellemeleri tekrar aktif");
        }, USER_EDITING_TIMEOUT);
      }
    }
    
    // loadCurrentScores çağrılmasın - kullanıcının girdileri korunmalı
    // Sadece referee meta'yı güncelle (submit durumu için)
    await loadCurrentScores(false); // applyScores=false: Sadece referee meta güncellenir, skorlar uygulanmaz
  } catch (err) {
    console.error("Save score error:", err);
    const errorMsg = err?.response?.error || err?.message || "Skor kaydedilirken hata oluştu";
    if (typeof showToast === "function") {
      showToast(errorMsg, "error");
    }
  }
}

/**
 * Skorları senkronize eder (backend'den çeker)
 * 
 * Kullanıcı tarafından manuel olarak çağrıldığında skorları uygular.
 * Ancak kullanıcı input yapıyorsa uyarı verir.
 */
async function syncScore() {
  if (isUserEditing) {
    if (typeof showToast === "function") {
      showToast("Input yaparken senkronizasyon yapılamaz. Lütfen önce kaydedin veya bekleyin.", "warning");
    }
    return;
  }
  
  // Kullanıcı açıkça senkronize etmek istiyor, skorları uygula
  await loadCurrentScores(true); // applyScores=true: Skorları uygula
  if (typeof showToast === "function") {
    showToast("Skorlar senkronize edildi", "success");
  }
}
