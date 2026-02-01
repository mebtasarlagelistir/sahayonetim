/**
 * Maç Kontrol - Veri Yükleme Modülü
 *
 * Maç listelerini yükleme, maç seçimi ve veri yönetimi işlemleri.
 *
 * Bağımlılıklar: match_control_core.js, match_control_ui.js, match_control_realtime.js
 */

(function () {
  // Script tamamlandıktan hemen sonra Takvim event listener ve window.loadScheduleMatches kaydı
  // (diğer kod hata verse bile bu çalışır; loadScheduleMatches bu noktada henüz tanımlı değil)
  function registerScheduleTabAPI() {
    if (typeof window === "undefined") return;
    if (typeof loadScheduleMatches !== "function") return;
    window.loadScheduleMatches = loadScheduleMatches;
    if (window._scheduleTabOpenRegistered) return;
    window._scheduleTabOpenRegistered = true;
    document.addEventListener("match-control-schedule-tab-open", function onScheduleTabOpen() {
      loadScheduleMatches().catch(function (err) {
        console.error("match-control-schedule-tab-open: loadScheduleMatches hatası:", err);
      });
    });
  }
  if (typeof queueMicrotask !== "undefined") queueMicrotask(registerScheduleTabAPI);
  else setTimeout(registerScheduleTabAPI, 0);
})();

/**
 * MatchCore instance'ını güvenli şekilde alır
 * @returns {Object|null} MatchCore instance veya null
 */
function getMatchCoreInstance() {
  return (typeof window !== "undefined" && window.MatchCore) || 
         (typeof MatchCore !== "undefined" && MatchCore) ||
         (typeof globalThis !== "undefined" && globalThis.MatchCore) ||
         null;
}

/**
 * Sıradaki maçı yükler ve seçer
 */
async function loadNextMatchAndSelect() {
  // Çift tıklamayı önle
  const btnLoadNext = qs("btn_load_next_match");
  if (btnLoadNext && btnLoadNext.disabled) {
    return; // Zaten işlem yapılıyor
  }
  
  // Buton loading state
  if (btnLoadNext && typeof setButtonLoading === "function") {
    setButtonLoading(btnLoadNext, true);
  }
  
  try {
    const data = await apiGet("/api/match-control/next-match");
    if (!data.match) {
      showToast("Sıradaki maç bulunamadı", "warning");
      return;
    }
    
    await selectMatch(data.match.id);
    if (typeof switchTab === "function") {
      switchTab("active-match");
    }
    showToast("Sıradaki maç yüklendi", "success");
  } catch (err) {
    console.error("Load next match error:", err);
    showToast("Maç yüklenirken hata oluştu", "error");
  } finally {
    // Buton loading state'i kaldır
    if (btnLoadNext && typeof setButtonLoading === "function") {
      setButtonLoading(btnLoadNext, false);
    }
  }
}

/**
 * Schedule tab için maçları yükler (Takvim sekmesi).
 */
/** Takvim maç listesi yüklemesinin devam edip etmediği (çift tetiklemeyi önlemek için) */
var scheduleLoadInProgress = false;
if (typeof window !== "undefined") {
  window.scheduleLoadInProgress = false;
}

async function loadScheduleMatches() {
  const listContainer = qs("schedule_match_list");
  if (!listContainer) {
    console.warn("loadScheduleMatches: schedule_match_list elementi bulunamadı");
    return;
  }
  if (scheduleLoadInProgress) {
    return;
  }
  scheduleLoadInProgress = true;
  if (typeof window !== "undefined") {
    window.scheduleLoadInProgress = true;
  }
  listContainer.innerHTML = "<div class='loading'>Yükleniyor...</div>";

  try {
    const fieldNumber = qs("schedule_field_selector")?.value;
    const matchType = qs("schedule_match_type_selector")?.value;
    
    console.log("loadScheduleMatches: Maçlar yükleniyor...", { fieldNumber, matchType });
    const matches = await fetchScheduleMatches(fieldNumber, matchType);
    console.log("loadScheduleMatches: Maçlar yüklendi", { count: matches.length, matches });
    
    if (matches.length === 0) {
      let message = "Maç bulunamadı.";
      if (matchType === "elimination") {
        message = "Eleme (Playoff) maçları, ittifaklar belirlendikten sonra otomatik oluşur.";
      } else if (matchType === "practice") {
        message = "Deneme maçı bulunamadı. Setup sayfasından deneme maçları oluşturabilirsiniz.";
      } else if (matchType === "qualification") {
        message = "Sıralama maçı bulunamadı. Setup sayfasından maç takvimi oluşturabilirsiniz.";
      } else if (matchType === "final") {
        message = "Final maçı bulunamadı. Sıralama maçları tamamlandıktan sonra final maçları oluşturulur.";
      } else {
        const matchTypeLabel = (typeof getMatchTypeLabel === "function") 
          ? getMatchTypeLabel(matchType) 
          : (matchType || "seçilen");
        message = `Maç bulunamadı. ${fieldNumber ? `Saha ${fieldNumber} için ` : ""}${matchType ? `${matchTypeLabel} tipi için ` : ""}maç oluşturulmamış olabilir. Setup sayfasından maç takvimi oluşturabilirsiniz.`;
      }
      message += " Aktif etkinlik seçili değilse veya henüz maç oluşturulmadıysa liste boş olur.";
      listContainer.innerHTML = `<div class='empty'>${message}</div>`;
      console.warn("loadScheduleMatches: Maç bulunamadı", { fieldNumber, matchType });
      return;
    }
    
    // Saha listesini doldur
    const fieldSet = new Set(matches.map(m => m.field_number).filter(Boolean));
    const fieldSelector = qs("schedule_field_selector");
    if (fieldSelector) {
      const currentValue = fieldSelector.value;
      fieldSelector.innerHTML = '<option value="">Tüm Sahalar</option>';
      Array.from(fieldSet).sort().forEach(field => {
        const option = document.createElement("option");
        option.value = field;
        option.textContent = `Saha ${field}`;
        if (currentValue === String(field)) option.selected = true;
        fieldSelector.appendChild(option);
      });
    }
    
    listContainer.innerHTML = matches.map(match => {
      // ÖNEMLİ: Eğer skorlar varsa ama status "scheduled" ise, "completed" olarak işaretle
      const hasScores = (match.red_score !== null && match.red_score !== undefined) || 
                        (match.blue_score !== null && match.blue_score !== undefined);
      let effectiveStatus = match.status;
      if (hasScores && match.status === "scheduled") {
        // Skorlar var ama status "scheduled" - muhtemelen "completed" olmalı
        effectiveStatus = "completed";
      }
      
      const statusClass = effectiveStatus === "in_progress" ? "active" : 
                         effectiveStatus === "completed" ? "completed" : "";
      const scoreDisplay = hasScores ? 
        `<div class="match-item-score">
          <span class="score-red">K: ${match.red_score || 0}</span>
          <span class="score-separator">-</span>
          <span class="score-blue">M: ${match.blue_score || 0}</span>
        </div>` : "";
      // Her iki maç tipi için de "Yükle" butonu göster (tutarlılık için)
      const activateButton = `<button class="btn-small btn-primary schedule-load-btn" data-match-id="${match.id}" data-source="${match.source || 'schedule'}" type="button">Yükle</button>`;
      const redAlliance = Array.isArray(match.red_alliance) ? match.red_alliance.join(", ") : (match.red_alliance || "-");
      const blueAlliance = Array.isArray(match.blue_alliance) ? match.blue_alliance.join(", ") : (match.blue_alliance || "-");
      return `
        <div class="match-item ${statusClass}" data-match-id="${match.id}" data-source="${match.source}">
          <div class="match-item-header">
            <span class="match-number">${formatMatchNumber(match)}</span>
            <span class="match-status">${getStatusLabel(effectiveStatus)}</span>
          </div>
          <div class="match-item-info">
            <span>${getMatchTypeLabel(match.match_type)}</span>
            <span>Saha ${match.field_number}</span>
            <span>${match.match_date || ""} ${match.match_time || ""}</span>
          </div>
          <div class="match-item-teams">
            <span class="alliance-red">K: ${redAlliance}</span>
            <span class="alliance-blue">M: ${blueAlliance}</span>
          </div>
          ${scoreDisplay}
          ${activateButton}
          ${effectiveStatus === "in_progress" ? '<div class="match-item-active">Aktif</div>' : ''}
        </div>
      `;
    }).join("");
    
    // Maç seçim event listener'ları
    listContainer.querySelectorAll(".match-item").forEach(item => {
      item.addEventListener("click", () => {
        const source = item.dataset.source || "schedule";
        const matchId = parseInt(item.dataset.matchId);
        const match = getMatchBySource(matches, source, matchId);
        if (!match) return;
        if (source === "practice") {
          if (typeof selectPracticeMatch === "function") {
            selectPracticeMatch(match);
          }
        } else {
          selectMatch(matchId, matches);
        }
        if (typeof switchTab === "function") {
          switchTab("active-match");
        }
      });
    });
    
    // Tüm "Yükle" butonları için tek bir event listener (tutarlılık için)
    listContainer.querySelectorAll(".schedule-load-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const matchId = parseInt(btn.dataset.matchId);
        const source = btn.dataset.source || "schedule";
        const match = getMatchBySource(matches, source, matchId);
        if (!match) return;
        
        if (source === "practice") {
          if (typeof selectPracticeMatch === "function") {
            selectPracticeMatch(match);
          }
          showToast("Deneme maçı yüklendi", "success");
        } else {
          selectMatch(matchId, matches);
          showToast("Maç yüklendi", "success");
        }
        
        if (typeof switchTab === "function") {
          switchTab("active-match");
        }
      });
    });
    
  } catch (err) {
    console.error("Load schedule matches error:", err);
    console.error("Load schedule matches error details:", {
      message: err.message,
      stack: err.stack,
      fieldNumber,
      matchType
    });
    const errorMessage = err?.response?.error || err?.message || "Bilinmeyen hata";
    listContainer.innerHTML = `<div class='error'>
      <p><strong>Maç listesi yüklenirken hata oluştu:</strong></p>
      <p>${errorMessage}</p>
      <p style="margin-top: 10px; font-size: 0.9em; color: #666;">
        Lütfen sayfayı yenileyin (F5) veya console'u kontrol edin.
      </p>
    </div>`;
    // Kullanıcıya toast mesajı da göster
    if (typeof showToast === "function") {
      showToast(`Takvim maçları yüklenemedi: ${errorMessage}`, "error");
    }
  } finally {
    scheduleLoadInProgress = false;
    if (typeof window !== "undefined") {
      window.scheduleLoadInProgress = false;
    }
  }
}
if (typeof window !== "undefined") {
  window.loadScheduleMatches = loadScheduleMatches;
  if (!window._scheduleTabOpenRegistered) {
    window._scheduleTabOpenRegistered = true;
    document.addEventListener("match-control-schedule-tab-open", function onScheduleTabOpen() {
      loadScheduleMatches().catch(function (err) {
        console.error("match-control-schedule-tab-open: loadScheduleMatches hatası:", err);
      });
    });
  }
}

/**
 * Schedule tab için maçları getirir (deneme + resmi)
 */
async function fetchScheduleMatches(fieldNumber, matchType) {
  if (matchType === "practice") {
    return await loadPracticeScheduleMatches(fieldNumber);
  }
  if (matchType) {
    return await loadOfficialScheduleMatches(fieldNumber, matchType);
  }
  const [practice, official] = await Promise.all([
    loadPracticeScheduleMatches(fieldNumber),
    loadOfficialScheduleMatches(fieldNumber, "")
  ]);
  return [...practice, ...official].sort(compareMatchDateTime);
}

/**
 * Deneme maçlarını Schedule formatında döndürür
 */
async function loadPracticeScheduleMatches(fieldNumber) {
  const params = {};
  if (fieldNumber) params.field = fieldNumber;
  console.log("loadPracticeScheduleMatches: API çağrısı yapılıyor", params);
  const matches = await apiGet("/api/practice-matches", params);
  console.log("loadPracticeScheduleMatches: API yanıtı alındı", { count: matches?.length || 0, matches });
  return (matches || []).map(match => ({
    ...match,
    match_type: "practice",
    source: "practice",
  }));
}

/**
 * Resmi maçları Schedule formatında döndürür
 */
async function loadOfficialScheduleMatches(fieldNumber, matchType) {
  // Backend /api/match-schedule beklediği parametreler: field, type (field_number/match_type değil)
  const params = {};
  if (fieldNumber) params.field = fieldNumber;
  if (matchType) params.type = matchType;
  console.log("loadOfficialScheduleMatches: API çağrısı yapılıyor", params);
  const matches = await apiGet("/api/match-schedule", params);
  console.log("loadOfficialScheduleMatches: API yanıtı alındı", { count: matches?.length || 0, matches });
  return (matches || []).map(match => ({
    ...match,
    source: "schedule",
  }));
}

/**
 * Maç numarasını görüntü formatına çevirir
 */
function formatMatchNumber(match) {
  if (match.match_type === "practice") {
    return `Deneme ${match.match_number || "-"}`;
  }
  return `Maç ${match.match_number}`;
}

/**
 * Tarih-saat sıralaması için karşılaştırma
 */
function compareMatchDateTime(a, b) {
  const aKey = `${a.match_date || ""} ${a.match_time || ""}`.trim();
  const bKey = `${b.match_date || ""} ${b.match_time || ""}`.trim();
  if (aKey === bKey) {
    return (a.field_number || 0) - (b.field_number || 0);
  }
  return aKey.localeCompare(bKey);
}

/**
 * Tamamlanmamış maçları yükler
 */
async function loadIncompleteMatches() {
  const listContainer = qs("incomplete_match_list");
  if (!listContainer) return;
  
  listContainer.innerHTML = "<div class='loading'>Yükleniyor...</div>";
  
  try {
    const matches = await apiGet("/api/match-schedule");
    const incomplete = matches.filter(m => m.status !== "completed");
    
    if (incomplete.length === 0) {
      listContainer.innerHTML = "<div class='empty'>Tamamlanmamış maç yok</div>";
      return;
    }
    
    listContainer.innerHTML = incomplete.map(match => {
      return `
        <div class="match-item" data-match-id="${match.id}">
          <div class="match-item-header">
            <span class="match-number">Maç ${match.match_number}</span>
            <span class="match-status">${getStatusLabel(match.status)}</span>
          </div>
          <div class="match-item-info">
            <span>${getMatchTypeLabel(match.match_type)}</span>
            <span>Saha ${match.field_number}</span>
          </div>
          <div class="match-item-teams">
            <span class="alliance-red">K: ${match.red_alliance.join(", ")}</span>
            <span class="alliance-blue">M: ${match.blue_alliance.join(", ")}</span>
          </div>
        </div>
      `;
    }).join("");
    
    listContainer.querySelectorAll(".match-item").forEach(item => {
      item.addEventListener("click", () => {
        const matchId = parseInt(item.dataset.matchId);
        selectMatch(matchId, incomplete);
        if (typeof switchTab === "function") {
          switchTab("active-match");
        }
      });
    });
    
  } catch (err) {
    console.error("Load incomplete matches error:", err);
    listContainer.innerHTML = "<div class='error'>Maç listesi yüklenirken hata oluştu</div>";
  }
}

/**
 * Maç listesini yükler
 */
async function loadMatchList(filter = 'all') {
  const listContainer = qs("match_list");
  if (!listContainer) {
    // Element yoksa sessizce çık (bu sayfa için gerekli değil)
    return;
  }
  
  try {
    const fieldNumber = qs("field_selector")?.value;
    const matchType = qs("match_type_selector")?.value;
    
    const params = {};
    if (fieldNumber) params.field_number = fieldNumber;
    if (matchType) params.match_type = matchType;
    
    const matches = await apiGet("/api/match-schedule", params);
    
    if (matches.length === 0) {
      listContainer.innerHTML = "<div class='empty'>Maç bulunamadı</div>";
      return;
    }
    
    // Saha listesini doldur
    const fieldSet = new Set(matches.map(m => m.field_number).filter(Boolean));
    const fieldSelector = qs("field_selector");
    if (fieldSelector) {
      const currentValue = fieldSelector.value;
      fieldSelector.innerHTML = '<option value="">Tüm Sahalar</option>';
      Array.from(fieldSet).sort().forEach(field => {
        const option = document.createElement("option");
        option.value = field;
        option.textContent = `Saha ${field}`;
        if (currentValue === String(field)) option.selected = true;
        fieldSelector.appendChild(option);
      });
    }
    
    listContainer.innerHTML = matches.map(match => {
      const statusClass = match.status === "in_progress" ? "active" : 
                         match.status === "completed" ? "completed" : "";
      const hasScores = match.red_score !== null && match.blue_score !== null;
      const scoreDisplay = hasScores ? 
        `<div class="match-item-score">
          <span class="score-red">K: ${match.red_score || 0}</span>
          <span class="score-separator">-</span>
          <span class="score-blue">M: ${match.blue_score || 0}</span>
        </div>` : "";
      return `
        <div class="match-item ${statusClass}" data-match-id="${match.id}">
          <div class="match-item-header">
            <span class="match-number">Maç ${match.match_number}</span>
            <span class="match-status">${getStatusLabel(match.status)}</span>
          </div>
          <div class="match-item-info">
            <span>${getMatchTypeLabel(match.match_type)}</span>
            <span>Saha ${match.field_number}</span>
          </div>
          <div class="match-item-teams">
            <span class="alliance-red">K: ${match.red_alliance.join(", ")}</span>
            <span class="alliance-blue">M: ${match.blue_alliance.join(", ")}</span>
          </div>
          ${scoreDisplay}
          ${match.status === "in_progress" ? '<div class="match-item-active">Aktif</div>' : ''}
        </div>
      `;
    }).join("");
    
    // Maç seçim event listener'ları
    listContainer.querySelectorAll(".match-item").forEach(item => {
      item.addEventListener("click", () => {
        const matchId = parseInt(item.dataset.matchId);
        selectMatch(matchId, matches);
      });
    });
    
  } catch (err) {
    console.error("Load match list error:", err);
    listContainer.innerHTML = "<div class='error'>Maç listesi yüklenirken hata oluştu</div>";
  }
}

/**
 * Sıradaki maçı yükler
 */
async function loadNextMatch() {
  const nextMatchContainer = qs("next_match_info");
  if (!nextMatchContainer) {
    // Element yoksa sessizce çık (bu sayfa için gerekli değil)
    return;
  }
  
  try {
    const data = await apiGet("/api/match-control/next-match");
    const match = data.match;
    
    if (!match) {
      nextMatchContainer.innerHTML = "<div class='empty'>Sıradaki maç yok</div>";
      return;
    }
    
    nextMatchContainer.innerHTML = `
      <div class="next-match-card">
        <div class="next-match-header">
          <span class="next-match-number">Maç ${match.match_number}</span>
          <span class="next-match-type">${getMatchTypeLabel(match.match_type)}</span>
        </div>
        <div class="next-match-teams">
          <div class="alliance-red">K: ${match.red_alliance.join(", ")}</div>
          <div class="alliance-blue">M: ${match.blue_alliance.join(", ")}</div>
        </div>
        <div class="next-match-meta">
          <span>Saha ${match.field_number}</span>
          <span>${match.match_date} ${match.match_time}</span>
        </div>
        <button class="btn-primary btn-small" onclick="selectMatch(${match.id})">Bu Maçı Seç</button>
      </div>
    `;
    
  } catch (err) {
    console.error("Load next match error:", err);
    nextMatchContainer.innerHTML = "<div class='error'>Sıradaki maç yüklenirken hata oluştu</div>";
  }
}

/**
 * Aktif maçı kontrol eder
 * 
 * ÖNEMLİ: Match Core kullanılıyor - bu fonksiyon artık Match Core üzerinden çalışıyor.
 * Manuel seçim kontrolü Match Core'da yapılıyor.
 * 
 * NOT: Bu fonksiyon geriye dönük uyumluluk için korunuyor.
 * Match Core kullanılıyorsa, bu fonksiyon sadece manuel seçim yönetimi için kullanılır.
 */
async function checkActiveMatch() {
  // Match Core kullanılıyorsa, aktif maç kontrolü Match Core'da yapılıyor
  const matchCoreInstance = getMatchCoreInstance();
  if (matchCoreInstance && typeof matchCoreInstance.setManualSelection === "function") {
    // Sadece manuel seçim yönetimi için kullan
    if (manuallySelectedMatchId && manuallySelectedMatchSource) {
      matchCoreInstance.setManualSelection(manuallySelectedMatchId, manuallySelectedMatchSource);
    }
    // Aktif maç yükleme Match Core'da otomatik yapılıyor (periyodik kontrol ile)
    return;
  }
  
  // Fallback: Eski yöntem (Match Core yoksa)
  try {
    // DEBUG: Fonksiyon çağrıldığını logla
    console.log(`checkActiveMatch: ÇAĞRILDI - currentMatch: ${currentMatch?.id || "null"}, manuallySelectedMatchId: ${manuallySelectedMatchId || "null"}`);
    
    // Eğer manuel olarak seçilmiş bir maç varsa, sadece o maçın durumunu kontrol et
    if (manuallySelectedMatchId && manuallySelectedMatchSource) {
      console.log(`checkActiveMatch: Manuel seçim var - ID: ${manuallySelectedMatchId}, Source: ${manuallySelectedMatchSource}`);
      
      const data = await apiGet("/api/match-control/active");
      
      // Seçilen maç hala preview veya aktif durumundaysa, onu koru
      if (data.match && data.match.id === manuallySelectedMatchId) {
        console.log(`checkActiveMatch: Seçilen maç backend'de bulundu - ID: ${manuallySelectedMatchId}, Status: ${data.match.status}`);
        
        // currentMatch'i backend'den gelen güncel bilgilerle güncelle
        currentMatch = data.match;
        if (!currentMatch.source && currentMatch.match_source) {
          currentMatch.source = currentMatch.match_source;
        }
        
        // Sadece state ve time_remaining güncelle (eğer aktif maç olduysa)
        if (data.match.status === "in_progress") {
          currentState = data.match.current_state || currentState;
          timeRemaining = data.match.time_remaining || timeRemaining;
          if (typeof updateStateDisplay === "function") {
            updateStateDisplay();
          }
          if (typeof renderMatchDisplay === "function") {
            renderMatchDisplay();
          }
        } else if (data.match.status === "preview") {
          // Preview durumundaysa, sadece UI'ı güncelle
          if (typeof renderMatchDisplay === "function") {
            renderMatchDisplay();
          }
        }
        return; // Manuel seçilen maçı koru - BAŞKA MAÇ YÜKLEME
      } else if (data.match && data.match.id !== manuallySelectedMatchId) {
        // Backend'den aktif maç farklı döndü (başka bir maç aktif)
        // Ama manuel seçilen maçı KORU (preview olarak)
        console.log(`checkActiveMatch: Aktif maç (${data.match.id}) farklı, manuel seçilen maç (${manuallySelectedMatchId}) KORUNUYOR`);
        
        // currentMatch'i koru, sadece status'u preview yap (eğer yoksa)
        if (currentMatch && currentMatch.id === manuallySelectedMatchId) {
          currentMatch.status = "preview";
          if (typeof renderMatchDisplay === "function") {
            renderMatchDisplay();
          }
        } else if (!currentMatch || currentMatch.id !== manuallySelectedMatchId) {
          // currentMatch yoksa veya farklıysa, manuel seçilen maçı yükle
          console.log(`checkActiveMatch: currentMatch (${currentMatch?.id}) manuel seçilen maç (${manuallySelectedMatchId}) ile eşleşmiyor, manuel seçilen maç yükleniyor`);
          
          // Manuel seçilen maçı backend'den yükle
          // Önce schedule'dan dene, sonra practice'dan
          try {
            let match = null;
            if (manuallySelectedMatchSource === "practice") {
              const practiceMatches = await apiGet("/api/practice-matches");
              match = practiceMatches?.find(m => m.id === manuallySelectedMatchId);
            } else {
              const scheduleMatches = await apiGet("/api/match-schedule");
              match = scheduleMatches?.find(m => m.id === manuallySelectedMatchId);
            }
            
            if (match) {
              currentMatch = {
                ...match,
                source: manuallySelectedMatchSource,
                match_source: manuallySelectedMatchSource,
                status: "preview"
              };
              if (typeof renderMatchDisplay === "function") {
                renderMatchDisplay();
              }
              console.log(`checkActiveMatch: Manuel seçilen maç yüklendi - ID: ${currentMatch.id}, Number: ${currentMatch.match_number}`);
            } else {
              console.warn(`checkActiveMatch: Manuel seçilen maç bulunamadı - ID: ${manuallySelectedMatchId}, Source: ${manuallySelectedMatchSource}`);
            }
          } catch (err) {
            console.error("checkActiveMatch: Manuel seçilen maç yüklenirken hata:", err);
          }
        }
        return; // Manuel seçilen maçı koru - BAŞKA MAÇ YÜKLEME
      } else {
        // Backend'den maç dönmedi (null) - preview maç artık yok
        console.log(`checkActiveMatch: Backend'den maç dönmedi, manuel seçim temizleniyor - ID: ${manuallySelectedMatchId}`);
        manuallySelectedMatchId = null;
        manuallySelectedMatchSource = null;
        // currentMatch'i temizleme, sadece manuel seçimi temizle
        // (currentMatch hala görünebilir, ama artık manuel seçim değil)
      }
    }
    
    // Manuel seçim yoksa, backend'den aktif maçı yükle
    console.log("checkActiveMatch: Manuel seçim yok, backend'den aktif maç kontrol ediliyor");
    const data = await apiGet("/api/match-control/active");
    if (data.match) {
      // Eğer manuel seçilmiş bir maç varsa ve backend'den gelen maç farklıysa,
      // sadece aktif maçın durumunu logla ama currentMatch'i değiştirme
      if (manuallySelectedMatchId && data.match.id !== manuallySelectedMatchId) {
        console.log(`checkActiveMatch: Aktif maç (${data.match.id}) farklı, manuel seçilen maç (${manuallySelectedMatchId}) korunuyor`);
        return;
      }
      
      console.log(`checkActiveMatch: Aktif maç yüklendi - ID: ${data.match.id}, Status: ${data.match.status}`);
      currentMatch = data.match;
      // Eksik kaynak bilgisi varsa tamamla
      if (!currentMatch.source && currentMatch.match_source) {
        currentMatch.source = currentMatch.match_source;
      }
      if (!currentMatch.source) {
        currentMatch.source = "schedule";
      }

      // Backend'den gelen state + süreyi uygula
      currentState = currentMatch.current_state || "idle";
      timeRemaining = currentMatch.time_remaining || MATCH_STATES[currentState]?.duration || 0;

      // Skor verilerini ve breakdown'u uygula
      if (typeof applyScoringData === "function") {
        applyScoringData(currentMatch.scoring_data || {});
      }
      if (typeof calculateScoreBreakdown === "function") {
        calculateScoreBreakdown();
      }

      if (typeof renderMatchDisplay === "function") {
        renderMatchDisplay();
      }

      // ÖNEMLİ: Timer'ı sadece maç aktifse (in_progress) başlat
      // Sayfa refresh edildiğinde maçı tekrar başlatmamak için
      if (currentMatch.status === "in_progress") {
        // Timer'ı doğru yerden devam ettir (maç zaten aktif)
        if (typeof startMatchTimer === "function") {
          startMatchTimer();
        }
      } else {
        // Maç aktif değilse timer'ı durdur
        if (typeof stopMatchTimer === "function") {
          stopMatchTimer();
        }
      }

      // Gerçek zamanlı skor WebSocket bağlantısını yeniden kur
      if (typeof startRealtimeScoreUpdates === "function" && currentMatch.id) {
        startRealtimeScoreUpdates(currentMatch.id, currentMatch.source || "schedule");
      }
    }
  } catch (err) {
    // Bu hata kritik değil - aktif maç yoksa devam edebiliriz
    // Sessizce devam et
  }
}

/**
 * Maç seçer
 */
/**
 * Sıralama maçını görüntülemek için yükler
 * 
 * Bu fonksiyon:
 * 1. currentMatch'i hemen set eder ve render eder
 * 2. Preview yapılır (backend'e bildirilir)
 * 3. Manuel seçim kaydedilir (checkActiveMatch bunu override etmemeli)
 * 
 * NOT: Backend'den aktif maç farklı dönse bile, seçilen maç korunur.
 */
async function selectMatch(matchId, matches = null) {
  if (!matchId) {
    console.warn("selectMatch: matchId parametresi yok");
    return;
  }
  
  if (!matches) {
    matches = await apiGet("/api/match-schedule");
  }
  
  const match = matches.find(m => m.id === matchId);
  if (!match) {
    console.warn(`selectMatch: Maç bulunamadı - ID: ${matchId}`);
    return;
  }
  
  if (!match.source) {
    match.source = "schedule";
  }
  
  console.log(`selectMatch: Sıralama maçı seçiliyor - ID: ${matchId}, Number: ${match.match_number}`);
  
  // Önceki gerçek zamanlı güncellemeleri durdur
  if (typeof stopRealtimeScoreUpdates === "function") {
    stopRealtimeScoreUpdates();
  }
  
  // ÖNEMLİ: Maçın mevcut durumunu kontrol et
  // Eğer skorlar varsa ama status "scheduled" ise, durumu düzelt
  let matchStatus = match.status || "preview";
  const hasScores = (match.red_score !== null && match.red_score !== undefined) || 
                    (match.blue_score !== null && match.blue_score !== undefined);
  
  if (hasScores && matchStatus === "scheduled") {
    // Skorlar var ama status "scheduled" - muhtemelen "completed" olmalı
    console.log(`selectMatch: Maçın skorları var (K: ${match.red_score}, M: ${match.blue_score}) ama status "scheduled" - "completed" olarak işaretleniyor`);
    matchStatus = "completed";
  }
  
  // currentMatch'i hemen set et (kullanıcı seçimini hemen göster)
  currentMatch = {
    ...match,
    status: matchStatus
  };
  
  console.log(`selectMatch: Maç yüklendi - ID: ${matchId}, Status: ${matchStatus}, Skorlar: K: ${match.red_score || 0}, M: ${match.blue_score || 0}`);
  
  // UI'ı hemen render et (kullanıcı seçimini hemen görsün)
  if (typeof renderMatchDisplay === "function") {
    renderMatchDisplay();
  }
  
  // Skorlama verilerini uygula
  if (typeof applyScoringData === "function") {
    applyScoringData(match.scoring_data || {});
  }
  if (typeof calculateScoreBreakdown === "function") {
    calculateScoreBreakdown();
  }
  
  // Match Core kullanılıyorsa, manuel seçimi Match Core'a bildir ve maçı set et
  const matchCoreInstance = getMatchCoreInstance();
  if (matchCoreInstance && typeof matchCoreInstance.setManualSelection === "function") {
    matchCoreInstance.setManualSelection(matchId, match.source || "schedule");
    // Preview maçlar için Match Core'a maç bilgisini set et (WebSocket bağlantısı olmadan)
    // skipWebSocket=true ile preview maçlar için WebSocket başlatılmaz
    if (typeof matchCoreInstance.setMatch === "function") {
      const matchToSet = {
        ...currentMatch,
        match_source: match.source || "schedule",
        source: match.source || "schedule"
      };
      matchCoreInstance.setMatch(matchToSet, true); // skipWebSocket=true
    }
  }
  
  // Gerçek zamanlı skor güncellemelerini başlat (Match Core kullanılıyorsa gerek yok)
  // matchCoreInstance zaten yukarıda tanımlı (satır 688)
  if (!matchCoreInstance && typeof startRealtimeScoreUpdates === "function") {
    startRealtimeScoreUpdates(matchId, match.source || "schedule");
  }
  
  // Eğer maç aktifse, durumu yükle
  if (matchStatus === "in_progress") {
    console.log(`selectMatch: Maç zaten aktif - ID: ${matchId}`);
    // Aktif maç seçildi, manuel seçimi temizle (artık aktif maç olacak)
    manuallySelectedMatchId = null;
    manuallySelectedMatchSource = null;
    const matchCoreInstance = getMatchCoreInstance();
    if (matchCoreInstance && typeof matchCoreInstance.clearManualSelection === "function") {
      matchCoreInstance.clearManualSelection();
    }
    
    // Match Core kullanılıyorsa, aktif maçı Match Core'dan yükle
    if (matchCoreInstance && typeof matchCoreInstance.loadActiveMatch === "function") {
      await matchCoreInstance.loadActiveMatch(true); // force=true ile manuel seçimi yok say
    } else {
      // Fallback: Eski yöntem
      if (typeof updateMatchStatus === "function") {
        await updateMatchStatus();
      }
      if (typeof startMatchTimer === "function") {
        startMatchTimer();
      }
    }
  } else if (matchStatus === "completed") {
    // Maç tamamlanmış - skorları göster, preview yapma
    console.log(`selectMatch: Maç tamamlanmış - ID: ${matchId}, Skorlar: K: ${match.red_score || 0}, M: ${match.blue_score || 0}`);
    
    // Manuel seçimi kaydet (tamamlanmış maçı görüntülemek için)
    manuallySelectedMatchId = matchId;
    manuallySelectedMatchSource = match.source || "schedule";
    const matchCoreInstance = getMatchCoreInstance();
    if (matchCoreInstance && typeof matchCoreInstance.setManualSelection === "function") {
      matchCoreInstance.setManualSelection(matchId, match.source || "schedule");
    }
    
    // Status'u "completed" olarak koru
    if (currentMatch && currentMatch.id === matchId) {
      currentMatch.status = "completed";
      if (typeof renderMatchDisplay === "function") {
        renderMatchDisplay();
      }
    }
    
    // Timer'ı durdur ve state'i sıfırla
    if (typeof stopMatchTimer === "function") {
      stopMatchTimer();
    }
    currentState = "idle";
    timeRemaining = 0;
    if (typeof updateStateDisplay === "function") {
      updateStateDisplay();
    }
  } else {
    // Maç aktif değil ve tamamlanmamış - preview durumuna al (hakem sayfalarında görünsün)
    try {
      // Backend'e preview bildir
      await apiPost("/api/match-control/preview", {
        match_id: matchId,
        match_source: match.source || "schedule"
      });
      
      console.log(`selectMatch: Preview yapıldı - ID: ${matchId}`);
      
      // Manuel seçimi kaydet - checkActiveMatch ve updateMatchStatus bunu override etmemeli
      manuallySelectedMatchId = matchId;
      manuallySelectedMatchSource = match.source || "schedule";
      const matchCoreInstance = getMatchCoreInstance();
      if (matchCoreInstance && typeof matchCoreInstance.setManualSelection === "function") {
        matchCoreInstance.setManualSelection(matchId, match.source || "schedule");
      }
      
      console.log(`selectMatch: Manuel seçim kaydedildi - ID: ${matchId}, Source: ${match.source || "schedule"}`);
      
      // currentMatch'in status'unu preview olarak işaretle (sadece skorlar yoksa)
      if (currentMatch && currentMatch.id === matchId && !hasScores) {
        currentMatch.status = "preview";
        if (typeof renderMatchDisplay === "function") {
          renderMatchDisplay();
        }
      }
      
    } catch (err) {
      console.error("selectMatch: Preview hatası:", err);
      // Hata olsa bile manuel seçimi kaydet (kullanıcı seçimini koru)
      manuallySelectedMatchId = matchId;
      manuallySelectedMatchSource = match.source || "schedule";
    }
    
    // Timer'ı durdur ve state'i sıfırla
    if (typeof stopMatchTimer === "function") {
      stopMatchTimer();
    }
    currentState = "idle";
    timeRemaining = 0;
    if (typeof updateStateDisplay === "function") {
      updateStateDisplay();
    }
  }
  
  console.log(`selectMatch: Tamamlandı - currentMatch ID: ${currentMatch?.id}, manuallySelectedMatchId: ${manuallySelectedMatchId}`);
}

/**
 * Deneme maçını görüntülemek için yükler
 * 
 * Bu fonksiyon:
 * 1. currentMatch'i hemen set eder ve render eder
 * 2. Preview yapılır (backend'e bildirilir)
 * 3. Manuel seçim kaydedilir (checkActiveMatch bunu override etmemeli)
 * 
 * NOT: Backend'den aktif maç farklı dönse bile, seçilen maç korunur.
 */
async function selectPracticeMatch(match) {
  if (!match) {
    console.warn("selectPracticeMatch: match parametresi yok");
    return;
  }
  
  console.log(`selectPracticeMatch: Deneme maçı seçiliyor - ID: ${match.id}, Number: ${match.match_number}`);
  
  // Önceki gerçek zamanlı güncellemeleri durdur
  if (typeof stopRealtimeScoreUpdates === "function") {
    stopRealtimeScoreUpdates();
  }
  
  // ÖNEMLİ: Maçın mevcut durumunu kontrol et
  // Eğer skorlar varsa ama status "scheduled" ise, durumu düzelt
  let matchStatus = match.status || "preview";
  const hasScores = (match.red_score !== null && match.red_score !== undefined) || 
                    (match.blue_score !== null && match.blue_score !== undefined);
  
  if (hasScores && matchStatus === "scheduled") {
    // Skorlar var ama status "scheduled" - muhtemelen "completed" olmalı
    console.log(`selectPracticeMatch: Maçın skorları var (K: ${match.red_score}, M: ${match.blue_score}) ama status "scheduled" - "completed" olarak işaretleniyor`);
    matchStatus = "completed";
  }
  
  // currentMatch'i hemen set et (kullanıcı seçimini hemen göster)
  currentMatch = {
    ...match,
    match_type: "practice",
    source: "practice",
    status: matchStatus
  };
  
  console.log(`selectPracticeMatch: Maç yüklendi - ID: ${match.id}, Status: ${matchStatus}, Skorlar: K: ${match.red_score || 0}, M: ${match.blue_score || 0}`);
  
  // State'i sıfırla
  currentState = "idle";
  timeRemaining = 0;
  
  // Timer'ı durdur
  if (typeof stopMatchTimer === "function") {
    stopMatchTimer();
  }
  
  // UI'ı hemen render et (kullanıcı seçimini hemen görsün)
  if (typeof renderMatchDisplay === "function") {
    renderMatchDisplay();
  }
  
  // Skorlama verilerini uygula
  if (typeof applyScoringData === "function") {
    applyScoringData(match.scoring_data || {});
  }
  if (typeof calculateScoreBreakdown === "function") {
    calculateScoreBreakdown();
  }
  
    // Match Core kullanılıyorsa, manuel seçimi Match Core'a bildir ve maçı set et
    const matchCoreInstance = getMatchCoreInstance();
    if (matchCoreInstance && typeof matchCoreInstance.setManualSelection === "function") {
      matchCoreInstance.setManualSelection(match.id, "practice");
      // Preview maçlar için Match Core'a maç bilgisini set et (WebSocket bağlantısı olmadan)
      if (typeof matchCoreInstance.setMatch === "function") {
        const matchToSet = {
          ...currentMatch,
          match_source: "practice",
          source: "practice"
        };
        matchCoreInstance.setMatch(matchToSet, true); // skipWebSocket=true
      }
    }
    
  // Gerçek zamanlı skor güncellemelerini başlat (Match Core kullanılıyorsa gerek yok)
  if (!matchCoreInstance && typeof startRealtimeScoreUpdates === "function") {
      startRealtimeScoreUpdates(match.id, "practice");
    }
  
  // Eğer maç aktifse, durumu yükle
  if (matchStatus === "in_progress") {
    console.log(`selectPracticeMatch: Maç zaten aktif - ID: ${match.id}`);
    // Aktif maç seçildi, manuel seçimi temizle (aktif maç zaten gösterilecek)
    manuallySelectedMatchId = null;
    manuallySelectedMatchSource = null;
    const matchCoreInstance = getMatchCoreInstance();
    if (matchCoreInstance) {
      if (typeof matchCoreInstance.clearManualSelection === "function") {
        matchCoreInstance.clearManualSelection();
      }
      if (typeof matchCoreInstance.loadActiveMatch === "function") {
        await matchCoreInstance.loadActiveMatch(true); // force=true ile manuel seçimi yok say
      }
    }
  } else if (matchStatus === "completed") {
    // Maç tamamlanmış - skorları göster, preview yapma
    console.log(`selectPracticeMatch: Maç tamamlanmış - ID: ${match.id}, Skorlar: K: ${match.red_score || 0}, M: ${match.blue_score || 0}`);
    
    // Manuel seçimi kaydet (tamamlanmış maçı görüntülemek için)
    manuallySelectedMatchId = match.id;
    manuallySelectedMatchSource = "practice";
    const matchCoreInstance = getMatchCoreInstance();
    if (matchCoreInstance && typeof matchCoreInstance.setManualSelection === "function") {
      matchCoreInstance.setManualSelection(match.id, "practice");
    }
    
    // Status'u "completed" olarak koru
    if (currentMatch && currentMatch.id === match.id) {
      currentMatch.status = "completed";
      if (typeof renderMatchDisplay === "function") {
        renderMatchDisplay();
      }
    }
  } else {
    // Maç aktif değil ve tamamlanmamış - preview durumuna al (hakem sayfalarında görünsün)
    try {
      // Backend'e preview bildir
      await apiPost("/api/match-control/preview", {
        match_id: match.id,
        match_source: "practice"
      });
      
      console.log(`selectPracticeMatch: Preview yapıldı - ID: ${match.id}`);
      
      // Manuel seçimi kaydet - checkActiveMatch ve updateMatchStatus bunu override etmemeli
      manuallySelectedMatchId = match.id;
      manuallySelectedMatchSource = "practice";
      const matchCoreInstance = getMatchCoreInstance();
      if (matchCoreInstance && typeof matchCoreInstance.setManualSelection === "function") {
        matchCoreInstance.setManualSelection(match.id, "practice");
      }
      
      console.log(`selectPracticeMatch: Manuel seçim kaydedildi - ID: ${match.id}, Source: practice`);
      
      // currentMatch'in status'unu preview olarak işaretle (sadece skorlar yoksa)
      if (currentMatch && currentMatch.id === match.id && !hasScores) {
        currentMatch.status = "preview";
        if (typeof renderMatchDisplay === "function") {
          renderMatchDisplay();
        }
      }
      
    } catch (err) {
      console.error("selectPracticeMatch: Preview hatası:", err);
      // Hata olsa bile manuel seçimi kaydet (kullanıcı seçimini koru)
      manuallySelectedMatchId = match.id;
      manuallySelectedMatchSource = "practice";
    }
  }
  
  console.log(`selectPracticeMatch: Tamamlandı - currentMatch ID: ${currentMatch?.id}, manuallySelectedMatchId: ${manuallySelectedMatchId}`);
}

/**
 * Kaynaktan maçı bulur (practice/schedule)
 */
function getMatchBySource(matches, source, matchId) {
  return matches.find(m => (m.source || "schedule") === source && m.id === matchId);
}

// Global fonksiyonlar (HTML ve diğer scriptlerden erişilebilir olsun diye window'a yazıyoruz)
window.selectMatch = selectMatch;
window.loadScheduleMatches = loadScheduleMatches;
window.loadPracticeScheduleMatches = loadPracticeScheduleMatches;
window.loadOfficialScheduleMatches = loadOfficialScheduleMatches;
window.fetchScheduleMatches = fetchScheduleMatches;
