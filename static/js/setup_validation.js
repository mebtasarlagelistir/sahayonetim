/**
 * Setup Doğrulama ve Test Modülü
 * 
 * Setup adımlarının tamamlanıp tamamlanmadığını kontrol eder
 * ve test senaryoları sağlar.
 */

/**
 * Tüm zorunlu adımların tamamlanıp tamamlanmadığını kontrol eder
 * @returns {Promise<Object>} Doğrulama sonuçları
 */
async function validateSetupSteps() {
  const results = {
    valid: true,
    missing: [],
    warnings: [],
    details: {}
  };
  
  try {
    // 1. Etkinlik kontrolü
    try {
      const eventData = await apiGet("/api/event");
      const eventValid = !!(eventData.name && eventData.code && eventData.format?.fields);
      results.details.event = {
        valid: eventValid,
        name: eventData.name || "Eksik",
        code: eventData.code || "Eksik",
        fields: eventData.format?.fields || 0
      };
      if (!eventValid) {
        results.valid = false;
        results.missing.push("Etkinlik bilgileri (ad, kod, saha sayısı)");
      }
    } catch (err) {
      results.valid = false;
      results.missing.push("Etkinlik bilgileri");
    }
    
    // 2. Takımlar kontrolü
    try {
      const teams = await apiGet("/api/teams");
      const teamsValid = teams.length > 0;
      results.details.teams = {
        valid: teamsValid,
        count: teams.length
      };
      if (!teamsValid) {
        results.valid = false;
        results.missing.push("Takımlar (en az 1 takım gerekli)");
      }
    } catch (err) {
      results.valid = false;
      results.missing.push("Takımlar");
    }
    
    // 3. Kullanıcılar kontrolü
    try {
      const users = await apiGet("/api/users");
      const hasReferee = users.some(u => u.role && u.role.toLowerCase().includes("hakem"));
      results.details.accounts = {
        valid: hasReferee,
        totalUsers: users.length,
        hasReferee: hasReferee
      };
      if (!hasReferee) {
        results.valid = false;
        results.missing.push("Hakem hesapları (en az 1 hakem gerekli)");
      }
    } catch (err) {
      results.valid = false;
      results.missing.push("Kullanıcı hesapları");
    }
    
    // 4. Maç takvimi kontrolü
    try {
      const matches = await apiGet("/api/match-schedule");
      const qualificationMatches = matches.filter(m => m.match_type === "qualification");
      const matchValid = qualificationMatches.length > 0;
      results.details.matchSchedule = {
        valid: matchValid,
        totalMatches: matches.length,
        qualificationMatches: qualificationMatches.length
      };
      if (!matchValid) {
        results.valid = false;
        results.missing.push("Sıralama maç takvimi (en az 1 qualification maçı gerekli)");
      }
    } catch (err) {
      results.valid = false;
      results.missing.push("Maç takvimi");
    }
    
    // 5. WiFi kontrolü
    try {
      const wifiData = await apiGet("/api/wifi/settings");
      const wifiValid = !!(wifiData.assignments && Object.keys(wifiData.assignments).length > 0);
      results.details.wifi = {
        valid: wifiValid,
        assignedCount: wifiData.assignments ? Object.keys(wifiData.assignments).length : 0
      };
      if (!wifiValid) {
        results.valid = false;
        results.missing.push("WiFi kanal atamaları");
      }
    } catch (err) {
      results.valid = false;
      results.missing.push("WiFi ayarları");
    }
    
    // Opsiyonel uyarılar
    try {
      const slots = await apiGet("/api/inspection-slots");
      if (slots.length === 0) {
        results.warnings.push("İnceleme programı oluşturulmamış (opsiyonel)");
      }
    } catch (err) {
      // Opsiyonel, hata yok sayılır
    }
    
    try {
      const practiceMatches = await apiGet("/api/practice-matches");
      if (practiceMatches.length === 0) {
        results.warnings.push("Deneme maçları oluşturulmamış (opsiyonel)");
      }
    } catch (err) {
      // Opsiyonel, hata yok sayılır
    }
    
  } catch (err) {
    console.error("Validate setup steps error:", err);
    results.valid = false;
    results.missing.push("Doğrulama hatası: " + err.message);
  }
  
  return results;
}

/**
 * Doğrulama sonuçlarını gösterir
 * @param {Object} results - Doğrulama sonuçları
 */
function showValidationResults(results) {
  if (results.valid) {
    showToast("Tüm zorunlu ayarlar tamamlandı! Maç kontrol sayfasına geçebilirsiniz.", "success");
  } else {
    const missingList = results.missing.map(m => `• ${m}`).join("\n");
    const message = `Eksik ayarlar:\n${missingList}`;
    showToast(message, "error");
  }
  
  if (results.warnings.length > 0) {
    const warningsList = results.warnings.map(w => `• ${w}`).join("\n");
    showToast(`Uyarılar:\n${warningsList}`, "warning");
  }
}

/**
 * Maç kontrol sayfasına geçiş için doğrulama yapar
 * @returns {Promise<boolean>} Geçiş yapılabilir mi?
 */
async function canProceedToMatchControl() {
  const validation = await validateSetupSteps();
  if (!validation.valid) {
    showValidationResults(validation);
    return false;
  }
  return true;
}
