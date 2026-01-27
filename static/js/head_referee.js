/**
 * Baş Hakem ekranı
 * Hakem girişlerini izler ve onaylar.
 */

let currentMatch = null;
let headRefereeSocket = null; // WebSocket bağlantısı (SSE yerine WebSocket kullanılıyor)
let refereeMeta = {};
let retryCount = 0;
const MAX_RETRY_COUNT = NETWORK_CONSTANTS.SSE_RETRY_MAX || 5;
const RETRY_DELAY_BASE = NETWORK_CONSTANTS.SSE_RETRY_DELAY_BASE || 1000;

async function initializeHeadReferee() {
  if (typeof loadUserRole === "function") {
    await loadUserRole();
  }
  
  // Etkinlik bilgilerini yükle (header için)
  try {
    const eventData = await apiGet("/api/event");
    const eventNameEl = qs("event-name-display");
    const statusIndicator = qs("status-indicator");
    if (eventNameEl) {
      eventNameEl.textContent = eventData.name || "Etkinlik seçilmedi";
    }
    if (statusIndicator) {
      const isActive = eventData.name && eventData.name !== "Etkinlik seçilmedi";
      statusIndicator.classList.toggle("active", isActive);
      statusIndicator.classList.toggle("inactive", !isActive);
      statusIndicator.title = isActive ? "Aktif" : "Pasif";
    }
  } catch (err) {
    console.error("Head referee: Etkinlik bilgileri yüklenirken hata:", err);
  }
  
  // Tab switching
  document.querySelectorAll(".head-referee-tabs .tab-button").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.dataset.tab;
      switchHeadRefereeTab(tabName);
    });
  });
  
  // Geçmiş maçlar tab'ı için filtreler
  const fieldSelector = qs("head_history_field_selector");
  const matchTypeSelector = qs("head_history_match_type_selector");
  if (fieldSelector) {
    fieldSelector.addEventListener("change", loadHeadRefereeMatchHistory);
  }
  if (matchTypeSelector) {
    matchTypeSelector.addEventListener("change", loadHeadRefereeMatchHistory);
  }
  
  // Takım geçmişi arama
  const teamSearchBtn = qs("btn_head_search_team");
  const teamSearchInput = qs("head_team_search");
  if (teamSearchBtn) {
    teamSearchBtn.addEventListener("click", searchTeamHistory);
  }
  if (teamSearchInput) {
    teamSearchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        searchTeamHistory();
      }
    });
  }
  
  // Match Core'a subscribe ol (merkezi state yönetimi)
  let matchCoreUnsubscribe = null;
  let checkInterval = null; // Fallback interval için
  let matchCoreInstance = null; // Scope için dışarıda tanımla
  
  // Match Core'un yüklendiğinden emin ol (retry mekanizması)
  let matchCoreRetryCount = 0;
  const MAX_MATCHCORE_RETRY = 10;
  const MATCHCORE_RETRY_DELAY = 100;
  
  const waitForMatchCore = () => {
    return new Promise((resolve) => {
      const checkMatchCore = () => {
        // Önce window.MatchCore'u kontrol et (match_core.js'de window'a ekleniyor)
        const mc = (typeof window !== "undefined" && window.MatchCore) || 
                   (typeof MatchCore !== "undefined" && MatchCore) ||
                   (typeof globalThis !== "undefined" && globalThis.MatchCore);
        
        if (mc && typeof mc.loadActiveMatch === "function") {
          console.log("initializeHeadReferee: Match Core bulundu ve fonksiyonlar mevcut");
          resolve(mc);
        } else if (matchCoreRetryCount < MAX_MATCHCORE_RETRY) {
          matchCoreRetryCount++;
          setTimeout(checkMatchCore, MATCHCORE_RETRY_DELAY);
        } else {
          console.error("initializeHeadReferee: MatchCore yüklenemedi veya fonksiyonlar eksik, fallback kullanılıyor", {
            windowMatchCore: typeof window !== "undefined" && !!window.MatchCore,
            globalMatchCore: typeof MatchCore !== "undefined",
            hasLoadActiveMatch: mc && typeof mc.loadActiveMatch === "function"
          });
          resolve(null);
        }
      };
      checkMatchCore();
    });
  };
  
  matchCoreInstance = await waitForMatchCore();
  
  if (matchCoreInstance) {
    console.log("initializeHeadReferee: Match Core bulundu, subscribe olunuyor...");
    matchCoreUnsubscribe = matchCoreInstance.subscribe((state) => {
      // State değiştiğinde UI'ı güncelle
      if (state.match) {
        currentMatch = state.match;
        
        // match_source alanını ekle (geriye dönük uyumluluk için)
        if (!currentMatch.match_source && currentMatch.source) {
          currentMatch.match_source = currentMatch.source;
        } else if (!currentMatch.match_source) {
          currentMatch.match_source = "schedule";
        }
        if (!currentMatch.source && currentMatch.match_source) {
          currentMatch.source = currentMatch.match_source;
        } else if (!currentMatch.source) {
          currentMatch.source = "schedule";
        }
        
        // Maç bilgilerini yükle
        if (typeof loadHeadRefereeMatch === "function") {
          loadHeadRefereeMatch();
        }
        
          // Skorları güncelle
          if (state.scores.red || state.scores.blue) {
            // Skorları render et (head_referee.js'deki fonksiyonlar)
            if (typeof updateHeadRefereeDetailedScores === "function") {
              updateHeadRefereeDetailedScores(state.scores);
            }
          }
        
          // Referee meta güncelle
          if (state.scores.referee_meta) {
            refereeMeta = state.scores.referee_meta;
            // updateSubmitStatus fonksiyonu referee_panel'de var, head_referee'de farklı olabilir
            // Eğer yoksa loadCurrentScores çağrılabilir
            if (typeof updateSubmitStatus === "function") {
              updateSubmitStatus();
            } else if (typeof loadCurrentScores === "function") {
              loadCurrentScores();
            }
          }
        
        // Timer güncelle
        if (typeof updateHeadRefereeTimer === "function") {
          updateHeadRefereeTimer(state.currentState, state.timeRemaining);
        }
      } else {
        // Aktif maç yok
        currentMatch = null;
        if (typeof renderNoMatch === "function") {
          renderNoMatch("Aktif maç bulunmuyor. Maç kontrol sayfasından bir maç başlatın.");
        }
      }
    });
    
    // Aktif maçı yükle
    await matchCoreInstance.loadActiveMatch();
    
    // Periyodik kontrol başlat (Match Core'da)
    matchCoreInstance.startPeriodicCheck(5000);
  } else {
    console.warn("initializeHeadReferee: MatchCore tanımlı değil, eski yöntem kullanılıyor");
    // Fallback: Eski yöntem
    await checkActiveMatch();
    // Periyodik kontrol interval'i (cleanup için saklanmalı)
    checkInterval = setInterval(checkActiveMatch, UI_CONSTANTS.REFEREE_PANEL_CHECK_INTERVAL);
  }
  
  setupHeadRefereeEvents();
  
  // İlk yüklemede geçmiş maçları yükle
  await loadHeadRefereeMatchHistory();
  
  // Sayfa kapanırken cleanup (tek bir listener)
  window.addEventListener("beforeunload", () => {
    if (matchCoreUnsubscribe) {
      matchCoreUnsubscribe();
    }
    // Match Core cleanup
    if (matchCoreInstance) {
      matchCoreInstance.cleanup();
    } else if (typeof MatchCore !== "undefined" || (typeof window !== "undefined" && window.MatchCore)) {
      const mc = window.MatchCore || MatchCore;
      if (mc && typeof mc.cleanup === "function") {
        mc.cleanup();
      }
    }
    // Fallback interval cleanup
    if (checkInterval) {
      clearInterval(checkInterval);
    }
    // Eski WebSocket bağlantısını kapat (fallback için)
    if (typeof stopRealtimeUpdates === "function") {
      stopRealtimeUpdates();
    }
  });
}

/**
 * Baş hakem tab'larını yönetir
 */
function switchHeadRefereeTab(tabName) {
  // Tüm tab içeriklerini gizle
  document.querySelectorAll(".tab-content").forEach(content => {
    content.style.display = "none";
  });
  
  // Tüm tab butonlarını pasif yap
  document.querySelectorAll(".head-referee-tabs .tab-button").forEach(btn => {
    btn.classList.remove("active");
    btn.dataset.active = "false";
  });
  
  // Seçilen tab'ı göster
  const selectedTab = qs(`tab-${tabName}`);
  if (selectedTab) {
    selectedTab.style.display = "block";
  }
  
  // Seçilen tab butonunu aktif yap
  const selectedBtn = document.querySelector(`.head-referee-tabs .tab-button[data-tab="${tabName}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add("active");
    selectedBtn.dataset.active = "true";
  }
  
  // Tab'a özel yükleme
  if (tabName === "match-history") {
    loadHeadRefereeMatchHistory();
  }
}

/**
 * Geçmiş maçları yükler (baş hakem için)
 */
async function loadHeadRefereeMatchHistory() {
  const listContainer = qs("head_match_history_list");
  if (!listContainer) return;
  
  listContainer.innerHTML = "<div class='loading'>Yükleniyor...</div>";
  
  try {
    const fieldNumber = qs("head_history_field_selector")?.value;
    const matchType = qs("head_history_match_type_selector")?.value;
    
    const params = {};
    if (fieldNumber) params.field_number = fieldNumber;
    if (matchType) params.match_type = matchType;
    params.status = "completed"; // Sadece tamamlanan maçlar
    
    // Hem schedule hem practice maçlarını al
    const [scheduleMatches, practiceMatches] = await Promise.all([
      apiGet("/api/match-schedule", params),
      apiGet("/api/practice-matches", { ...params, status: "completed" })
    ]);
    
    const allMatches = [
      ...(scheduleMatches || []).map(m => ({ ...m, source: "schedule" })),
      ...(practiceMatches || []).map(m => ({ ...m, source: "practice", match_type: "practice" }))
    ].sort((a, b) => {
      // Tarih ve saate göre sırala (en yeni önce)
      const aKey = `${a.match_date || ""} ${a.match_time || ""}`.trim();
      const bKey = `${b.match_date || ""} ${b.match_time || ""}`.trim();
      if (aKey === bKey) {
        return (b.match_number || 0) - (a.match_number || 0);
      }
      return bKey.localeCompare(aKey);
    });
    
    if (allMatches.length === 0) {
      listContainer.innerHTML = "<div class='empty'>Tamamlanan maç bulunamadı</div>";
      return;
    }
    
    // Saha listesini doldur
    const fieldSet = new Set(allMatches.map(m => m.field_number).filter(Boolean));
    const fieldSelector = qs("head_history_field_selector");
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
    
    listContainer.innerHTML = allMatches.map(match => {
      const matchTypeLabel = match.match_type === "practice" ? "Deneme" : 
                            match.match_type === "qualification" ? "Sıralama" :
                            match.match_type === "elimination" ? "Eleme" :
                            match.match_type === "final" ? "Final" : "Maç";
      const matchNumber = match.match_type === "practice" ? 
                         `Deneme ${match.match_number || "-"}` : 
                         `Maç ${match.match_number || "-"}`;
      
      const redScore = match.red_score || 0;
      const blueScore = match.blue_score || 0;
      const winner = redScore > blueScore ? "Kırmızı" : 
                    blueScore > redScore ? "Mavi" : "Berabere";
      
      // Kart bilgilerini al
      const scoringData = match.scoring_data || {};
      const redData = scoringData.red || {};
      const blueData = scoringData.blue || {};
      const redYellow = redData.yellow_card || 0;
      const blueYellow = blueData.yellow_card || 0;
      const redRed = (redData.red_card_r1 ? 1 : 0) + (redData.red_card_r2 ? 1 : 0);
      const blueRed = (blueData.red_card_r1 ? 1 : 0) + (blueData.red_card_r2 ? 1 : 0);
      
      return `
        <div class="match-item completed" data-match-id="${match.id}" data-source="${match.source || 'schedule'}">
          <div class="match-item-header">
            <span class="match-number">${matchNumber}</span>
            <span class="match-status">Tamamlandı</span>
          </div>
          <div class="match-item-info">
            <span>${matchTypeLabel}</span>
            <span>Saha ${match.field_number || "-"}</span>
            <span>${match.match_date || ""} ${match.match_time || ""}</span>
          </div>
          <div class="match-item-teams">
            <span class="alliance-red">K: ${(match.red_alliance || []).join(", ")}</span>
            <span class="alliance-blue">M: ${(match.blue_alliance || []).join(", ")}</span>
          </div>
          <div class="match-item-score">
            <span class="score-red">K: ${redScore}</span>
            <span class="score-separator">-</span>
            <span class="score-blue">M: ${blueScore}</span>
            <span class="score-winner">Kazanan: ${winner}</span>
          </div>
          <div class="match-item-cards">
            <span class="cards-red">K: 🟡${redYellow} 🔴${redRed}</span>
            <span class="cards-blue">M: 🟡${blueYellow} 🔴${blueRed}</span>
          </div>
          <button class="btn-small btn-secondary head-view-match-btn" data-match-id="${match.id}" data-source="${match.source || 'schedule'}">Detayları Gör</button>
        </div>
      `;
    }).join("");
    
    // Detayları gör butonları
    listContainer.querySelectorAll(".head-view-match-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const matchId = parseInt(btn.dataset.matchId);
        const source = btn.dataset.source || "schedule";
        await viewHeadRefereeMatchDetails(matchId, source);
      });
    });
    
  } catch (err) {
    console.error("Load head referee match history error:", err);
    listContainer.innerHTML = "<div class='error'>Geçmiş maçlar yüklenirken hata oluştu</div>";
  }
}

/**
 * Maç detaylarını görüntüler (baş hakem için)
 */
async function viewHeadRefereeMatchDetails(matchId, source) {
  try {
    let match = null;
    if (source === "practice") {
      const matches = await apiGet("/api/practice-matches");
      match = matches?.find(m => m.id === matchId);
    } else {
      const matches = await apiGet("/api/match-schedule");
      match = matches?.find(m => m.id === matchId);
    }
    
    if (!match) {
      showToast("Maç bulunamadı", "error");
      return;
    }
    
    // Detaylı bilgileri göster (modal veya yeni tab)
    const details = `
Maç Bilgileri:
- ${match.match_type === "practice" ? "Deneme" : "Maç"} ${match.match_number}
- Saha: ${match.field_number}
- Tarih: ${match.match_date} ${match.match_time}
- Kırmızı İttifak: ${(match.red_alliance || []).join(", ")}
- Mavi İttifak: ${(match.blue_alliance || []).join(", ")}
- Skor: Kırmızı ${match.red_score || 0} - Mavi ${match.blue_score || 0}
    `;
    
    alert(details); // Geçici olarak alert, daha sonra modal'a çevrilebilir
    
  } catch (err) {
    console.error("View match details error:", err);
    showToast("Maç detayları yüklenirken hata oluştu", "error");
  }
}

/**
 * Takım geçmişini arar (baş hakem için)
 */
async function searchTeamHistory() {
  const teamNumber = parseInt(qs("head_team_search")?.value);
  if (!teamNumber || teamNumber < 1) {
    showToast("Geçerli bir takım numarası girin", "warning");
    return;
  }
  
  const resultsContainer = qs("head_team_history_results");
  const titleEl = qs("head_team_history_title");
  const matchesEl = qs("head_team_history_matches");
  const cardsEl = qs("head_team_history_cards");
  
  if (!resultsContainer || !titleEl || !matchesEl || !cardsEl) return;
  
  resultsContainer.style.display = "none";
  matchesEl.innerHTML = "<div class='loading'>Yükleniyor...</div>";
  cardsEl.innerHTML = "";
  
  try {
    // Takım bilgisini al
    const teams = await apiGet("/api/teams");
    const team = teams?.find(t => t.number === teamNumber);
    
    if (!team) {
      showToast("Takım bulunamadı", "error");
      return;
    }
    
    titleEl.textContent = `Takım ${teamNumber}: ${team.name || ""} - ${team.school || ""}`;
    
    // Tüm tamamlanan maçları al
    const [scheduleMatches, practiceMatches] = await Promise.all([
      apiGet("/api/match-schedule", { status: "completed" }),
      apiGet("/api/practice-matches", { status: "completed" })
    ]);
    
    const allMatches = [
      ...(scheduleMatches || []).map(m => ({ ...m, source: "schedule" })),
      ...(practiceMatches || []).map(m => ({ ...m, source: "practice", match_type: "practice" }))
    ];
    
    // Bu takımın yer aldığı maçları filtrele
    const teamMatches = allMatches.filter(m => {
      const redAlliance = m.red_alliance || [];
      const blueAlliance = m.blue_alliance || [];
      return redAlliance.includes(teamNumber) || blueAlliance.includes(teamNumber);
    });
    
    if (teamMatches.length === 0) {
      matchesEl.innerHTML = "<div class='empty'>Bu takımın yer aldığı maç bulunamadı</div>";
      resultsContainer.style.display = "block";
      return;
    }
    
    // Maç listesini göster
    matchesEl.innerHTML = teamMatches.map(match => {
      const alliance = (match.red_alliance || []).includes(teamNumber) ? "Kırmızı" : "Mavi";
      const matchTypeLabel = match.match_type === "practice" ? "Deneme" : 
                            match.match_type === "qualification" ? "Sıralama" :
                            match.match_type === "elimination" ? "Eleme" :
                            match.match_type === "final" ? "Final" : "Maç";
      const matchNumber = match.match_type === "practice" ? 
                         `Deneme ${match.match_number || "-"}` : 
                         `Maç ${match.match_number || "-"}`;
      
      const scoringData = match.scoring_data || {};
      const allianceData = alliance === "Kırmızı" ? (scoringData.red || {}) : (scoringData.blue || {});
      const yellowCards = allianceData.yellow_card || 0;
      const redCards = (allianceData.red_card_r1 ? 1 : 0) + (allianceData.red_card_r2 ? 1 : 0);
      
      return `
        <div class="match-item">
          <div class="match-item-header">
            <span class="match-number">${matchNumber}</span>
            <span class="match-alliance">${alliance} İttifak</span>
          </div>
          <div class="match-item-info">
            <span>${matchTypeLabel}</span>
            <span>Saha ${match.field_number || "-"}</span>
            <span>${match.match_date || ""} ${match.match_time || ""}</span>
          </div>
          <div class="match-item-score">
            <span>Skor: Kırmızı ${match.red_score || 0} - Mavi ${match.blue_score || 0}</span>
          </div>
          <div class="match-item-cards">
            <span>Kartlar: 🟡${yellowCards} 🔴${redCards}</span>
          </div>
        </div>
      `;
    }).join("");
    
    // Toplam kart istatistikleri
    let totalYellow = 0;
    let totalRed = 0;
    teamMatches.forEach(match => {
      const alliance = (match.red_alliance || []).includes(teamNumber) ? "red" : "blue";
      const scoringData = match.scoring_data || {};
      const allianceData = scoringData[alliance] || {};
      totalYellow += allianceData.yellow_card || 0;
      totalRed += (allianceData.red_card_r1 ? 1 : 0) + (allianceData.red_card_r2 ? 1 : 0);
    });
    
    cardsEl.innerHTML = `
      <h4>Toplam Kart İstatistikleri</h4>
      <div class="team-cards-summary">
        <div class="card-stat">
          <span class="card-label">Sarı Kart:</span>
          <span class="card-value">${totalYellow}</span>
        </div>
        <div class="card-stat">
          <span class="card-label">Kırmızı Kart:</span>
          <span class="card-value">${totalRed}</span>
        </div>
        <div class="card-stat">
          <span class="card-label">Toplam Maç:</span>
          <span class="card-value">${teamMatches.length}</span>
        </div>
      </div>
    `;
    
    resultsContainer.style.display = "block";
    
  } catch (err) {
    console.error("Search team history error:", err);
    showToast("Takım geçmişi aranırken hata oluştu", "error");
  }
}

async function checkActiveMatch() {
  try {
    const data = await apiGet("/api/match-control/active");
    if (data.match) {
      // ÖNEMLİ: Preview durumundaki maçları da göster (sadece başlatılmamış olarak işaretle)
      const isPreview = data.match.is_preview || data.match.status === "preview";
      
      if (!currentMatch || currentMatch.id !== data.match.id || currentMatch.match_source !== data.match.match_source) {
        currentMatch = data.match;
        await loadHeadRefereeMatch();
        // Preview durumundaysa bilgi ver ama maçı göster
        if (isPreview) {
          console.log("Baş hakem: Preview maçı yüklendi - maç başlatılmayı bekliyor");
        }
      } else {
        // Aynı maç, sadece durumu güncelle
        currentMatch = data.match;
        // Preview durumundaki maçları da göster, sadece gizleme
        // (Maç başlatılmadığı için timer ve skorlar olmayabilir ama maç bilgileri görünebilir)
      }
    } else {
      // Backend'den maç dönmedi - eğer önceden bir maç varsa, onu koru (geçici network hatası olabilir)
      if (!currentMatch) {
        // Hiç maç yoksa, "aktif maç yok" mesajı göster
        currentMatch = null;
        renderNoMatch("Aktif maç bulunmuyor. Maç kontrol sayfasından bir maç başlatın.");
        stopRealtimeUpdates();
      } else {
        // Önceden maç vardı ama şimdi backend'den dönmüyor
        // Bu geçici bir durum olabilir (network hatası, backend gecikmesi vb.)
        // Maçı koru, sadece log'la
        console.warn("Baş hakem: Backend'den maç dönmedi ama currentMatch mevcut - maç korunuyor (ID:", currentMatch.id + ")");
      }
    }
  } catch (err) {
    console.error("Head referee active match error:", err);
    // Hata durumunda, eğer önceden bir maç varsa onu koru
    if (!currentMatch) {
      renderNoMatch("Aktif maç kontrol edilirken hata oluştu. Lütfen sayfayı yenileyin.");
    } else {
      console.warn("Baş hakem: Hata oluştu ama currentMatch mevcut - maç korunuyor (ID:", currentMatch.id + ")");
    }
  }
}

async function loadHeadRefereeMatch() {
  if (!currentMatch || !currentMatch.id) {
    console.warn("loadHeadRefereeMatch: currentMatch veya currentMatch.id yok");
    return;
  }
  
  try {
    const matchInfoEl = qs("head_match_info");
    if (matchInfoEl) {
      matchInfoEl.textContent =
        `Maç ${currentMatch.match_number || "?"} - ${getMatchTypeLabel(currentMatch.match_type)} - Saha ${currentMatch.field_number || "?"}`;
    }
    
    const fieldEl = qs("head_match_field");
    if (fieldEl) {
      fieldEl.textContent = `Saha: ${currentMatch.field_number || "?"}`;
    }
    
    const teamsEl = qs("head_match_teams");
    if (teamsEl) {
      const teams = [
        `Kırmızı: ${(currentMatch.red_alliance || []).join(", ") || "-"}`,
        `Mavi: ${(currentMatch.blue_alliance || []).join(", ") || "-"}`
      ];
      teamsEl.textContent = `Takımlar: ${teams.join(" | ")}`;
    }

    const matchCard = qs("head_referee_match_card");
    if (matchCard) matchCard.style.display = "block";
    
    const scoresEl = qs("head_referee_scores");
    if (scoresEl) scoresEl.style.display = "block";
    
    const noMatchEl = qs("head_no_match");
    if (noMatchEl) noMatchEl.style.display = "none";

    // Timer'ı başlat (eğer maç aktifse)
    if (currentMatch.current_state && currentMatch.time_remaining !== undefined) {
      updateHeadRefereeTimer(currentMatch.current_state, currentMatch.time_remaining);
    }

    await loadCurrentScores();
    // Gerçek zamanlı güncellemeler Match Core'da yapılıyor (WebSocket gerek yok)
    if (typeof MatchCore === "undefined") {
      // Fallback: Eski yöntem (Match Core yoksa)
      startRealtimeUpdates(currentMatch.id, currentMatch.match_source || "schedule");
    }
  } catch (err) {
    console.error("loadHeadRefereeMatch error:", err);
    showToast("Maç bilgileri yüklenirken hata oluştu", "error");
  }
}

async function loadCurrentScores() {
  if (!currentMatch || !currentMatch.id) {
    console.warn("loadCurrentScores: currentMatch veya currentMatch.id yok");
    return;
  }
  
  try {
    const source = currentMatch.match_source || "schedule";
    const data = await apiGet(`/api/referee/score/get/${currentMatch.id}?source=${encodeURIComponent(source)}`);
    
    const redScore = (data && data.red && data.red.calculated_score !== undefined) ? data.red.calculated_score : 0;
    const blueScore = (data && data.blue && data.blue.calculated_score !== undefined) ? data.blue.calculated_score : 0;
    
    const redScoreEl = qs("head_red_score");
    if (redScoreEl) redScoreEl.textContent = redScore;
    
    const blueScoreEl = qs("head_blue_score");
    if (blueScoreEl) blueScoreEl.textContent = blueScore;
    
    refereeMeta = (data && data.referee_meta) ? data.referee_meta : {};
    updateHeadRefereeStatus();
    
    // Detaylı skorları yükle
    loadDetailedScores(data);
  } catch (err) {
    console.error("Head referee load scores error:", err);
    showToast("Skorlar yüklenirken hata oluştu", "warning");
  }
}

/**
 * Timer'ı günceller (baş hakem için)
 */
/**
 * Timer'ı günceller (WebSocket ile server_timestamp senkronizasyonu destekler)
 * 
 * @param {string} currentState - Mevcut maç durumu
 * @param {number} timeRemaining - Kalan süre (saniye)
 * @param {number} timeOffset - Client-server zaman farkı (ms) - opsiyonel, timer senkronizasyonu için
 */
function updateHeadRefereeTimer(currentState, timeRemaining, timeOffset = 0) {
  const timerEl = qs("head_referee_timer");
  const timerDisplayEl = qs("head_timer_display");
  const timerStateEl = qs("head_timer_state");
  
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
 * Detaylı skorları yükler ve formları doldurur
 */
function loadDetailedScores(data) {
  if (!data) return;
  
  const detailedScoresEl = qs("head_referee_detailed_scores");
  if (!detailedScoresEl) return;
  
  // Detaylı skorlama bölümünü göster
  detailedScoresEl.style.display = "block";
  
  // Kırmızı ittifak skorları
  if (data.red && data.red.scoring_data) {
    applyScoringDataToHeadRefereeForm("red", data.red.scoring_data);
  }
  
  // Mavi ittifak skorları
  if (data.blue && data.blue.scoring_data) {
    applyScoringDataToHeadRefereeForm("blue", data.blue.scoring_data);
  }
}

/**
 * Skorlama verilerini baş hakem formuna uygular (kompakt, yan yana görünüm için)
 */
function applyScoringDataToHeadRefereeForm(alliance, scoringData) {
  if (!scoringData || typeof scoringData !== "object") return;
  
  const formEl = qs(`head_${alliance}_scoring_form`);
  if (!formEl) return;
  
  // Kompakt form oluştur (yan yana görünüm için)
  let html = '<div class="scoring-section auto-section">';
  html += '<h5>OTONOM (OKS)</h5>';
  
  // Başlangıç Alanını Terk Etme
  html += '<div class="scoring-group compact-group"><div class="group-header">Başlangıç (3/Robot)</div>';
  html += '<div class="robot-leave-grid">';
  html += `<label class="robot-checkbox"><input type="checkbox" id="head_${alliance}_auto_leave_r1" data-points="3" ${scoringData.auto_leave_r1 ? 'checked' : ''} /><span>R1</span></label>`;
  html += `<label class="robot-checkbox"><input type="checkbox" id="head_${alliance}_auto_leave_r2" data-points="3" ${scoringData.auto_leave_r2 ? 'checked' : ''} /><span>R2</span></label>`;
  html += '</div></div>';
  
  // Bent Seviye 1
  html += '<div class="scoring-group compact-group"><div class="group-header">Bent 1 (4/Küre)</div>';
  html += '<div class="scoring-input-compact">';
  html += `<div class="score-control-compact"><span class="score-label-compact">K</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_auto_bent1_own" data-points="4">−</button>`;
  html += `<input type="number" id="head_${alliance}_auto_bent1_own" value="${scoringData.auto_bent1_own || 0}" min="0" data-points="4" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_auto_bent1_own" data-points="4">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">R</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_auto_bent1_opponent" data-points="4">−</button>`;
  html += `<input type="number" id="head_${alliance}_auto_bent1_opponent" value="${scoringData.auto_bent1_opponent || 0}" min="0" data-points="4" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_auto_bent1_opponent" data-points="4">+</button></div>`;
  html += '</div></div>';
  
  // Bent Seviye 2
  html += '<div class="scoring-group compact-group"><div class="group-header">Bent 2</div>';
  html += '<div class="scoring-input-compact">';
  html += `<div class="score-control-compact"><span class="score-label-compact">D(6)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_auto_bent2_correct" data-points="6">−</button>`;
  html += `<input type="number" id="head_${alliance}_auto_bent2_correct" value="${scoringData.auto_bent2_correct || 0}" min="0" data-points="6" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_auto_bent2_correct" data-points="6">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">Y(3)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_auto_bent2_wrong" data-points="3">−</button>`;
  html += `<input type="number" id="head_${alliance}_auto_bent2_wrong" value="${scoringData.auto_bent2_wrong || 0}" min="0" data-points="3" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_auto_bent2_wrong" data-points="3">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">R(6)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_auto_bent2_opponent" data-points="6">−</button>`;
  html += `<input type="number" id="head_${alliance}_auto_bent2_opponent" value="${scoringData.auto_bent2_opponent || 0}" min="0" data-points="6" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_auto_bent2_opponent" data-points="6">+</button></div>`;
  html += '</div></div>';
  
  // Bent Seviye 3
  html += '<div class="scoring-group compact-group"><div class="group-header">Bent 3</div>';
  html += '<div class="scoring-input-compact">';
  html += `<div class="score-control-compact"><span class="score-label-compact">D(8)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_auto_bent3_correct" data-points="8">−</button>`;
  html += `<input type="number" id="head_${alliance}_auto_bent3_correct" value="${scoringData.auto_bent3_correct || 0}" min="0" data-points="8" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_auto_bent3_correct" data-points="8">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">Y(4)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_auto_bent3_wrong" data-points="4">−</button>`;
  html += `<input type="number" id="head_${alliance}_auto_bent3_wrong" value="${scoringData.auto_bent3_wrong || 0}" min="0" data-points="4" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_auto_bent3_wrong" data-points="4">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">R(8)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_auto_bent3_opponent" data-points="8">−</button>`;
  html += `<input type="number" id="head_${alliance}_auto_bent3_opponent" value="${scoringData.auto_bent3_opponent || 0}" min="0" data-points="8" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_auto_bent3_opponent" data-points="8">+</button></div>`;
  html += '</div></div>';
  
  // Sarnıçlar
  html += '<div class="scoring-group compact-group"><div class="group-header">Sarnıç (7/Küre)</div>';
  html += '<div class="scoring-input-compact">';
  html += `<div class="score-control-compact"><span class="score-label-compact">K</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_auto_tank_own" data-points="7">−</button>`;
  html += `<input type="number" id="head_${alliance}_auto_tank_own" value="${scoringData.auto_tank_own || 0}" min="0" data-points="7" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_auto_tank_own" data-points="7">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">R</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_auto_tank_opponent" data-points="7">−</button>`;
  html += `<input type="number" id="head_${alliance}_auto_tank_opponent" value="${scoringData.auto_tank_opponent || 0}" min="0" data-points="7" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_auto_tank_opponent" data-points="7">+</button></div>`;
  html += '</div></div>';
  
  html += '</div>'; // auto-section kapanış
  
  // Teleop Bölümü
  html += '<div class="scoring-section teleop-section">';
  html += '<h5>SÜRÜCÜ KONTROLLÜ (SKS)</h5>';
  
  // Teleop Bent 1
  html += '<div class="scoring-group compact-group"><div class="group-header">Bent 1 (2/Küre)</div>';
  html += '<div class="scoring-input-compact">';
  html += `<div class="score-control-compact"><span class="score-label-compact">K</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_teleop_bent1_own" data-points="2">−</button>`;
  html += `<input type="number" id="head_${alliance}_teleop_bent1_own" value="${scoringData.teleop_bent1_own || 0}" min="0" data-points="2" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_teleop_bent1_own" data-points="2">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">R</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_teleop_bent1_opponent" data-points="2">−</button>`;
  html += `<input type="number" id="head_${alliance}_teleop_bent1_opponent" value="${scoringData.teleop_bent1_opponent || 0}" min="0" data-points="2" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_teleop_bent1_opponent" data-points="2">+</button></div>`;
  html += '</div></div>';
  
  // Teleop Bent 2
  html += '<div class="scoring-group compact-group"><div class="group-header">Bent 2</div>';
  html += '<div class="scoring-input-compact">';
  html += `<div class="score-control-compact"><span class="score-label-compact">D(4)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_teleop_bent2_correct" data-points="4">−</button>`;
  html += `<input type="number" id="head_${alliance}_teleop_bent2_correct" value="${scoringData.teleop_bent2_correct || 0}" min="0" data-points="4" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_teleop_bent2_correct" data-points="4">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">Y(3)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_teleop_bent2_wrong" data-points="3">−</button>`;
  html += `<input type="number" id="head_${alliance}_teleop_bent2_wrong" value="${scoringData.teleop_bent2_wrong || 0}" min="0" data-points="3" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_teleop_bent2_wrong" data-points="3">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">R(4)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_teleop_bent2_opponent" data-points="4">−</button>`;
  html += `<input type="number" id="head_${alliance}_teleop_bent2_opponent" value="${scoringData.teleop_bent2_opponent || 0}" min="0" data-points="4" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_teleop_bent2_opponent" data-points="4">+</button></div>`;
  html += '</div></div>';
  
  // Teleop Bent 3
  html += '<div class="scoring-group compact-group"><div class="group-header">Bent 3</div>';
  html += '<div class="scoring-input-compact">';
  html += `<div class="score-control-compact"><span class="score-label-compact">D(6)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_teleop_bent3_correct" data-points="6">−</button>`;
  html += `<input type="number" id="head_${alliance}_teleop_bent3_correct" value="${scoringData.teleop_bent3_correct || 0}" min="0" data-points="6" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_teleop_bent3_correct" data-points="6">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">Y(3)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_teleop_bent3_wrong" data-points="3">−</button>`;
  html += `<input type="number" id="head_${alliance}_teleop_bent3_wrong" value="${scoringData.teleop_bent3_wrong || 0}" min="0" data-points="3" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_teleop_bent3_wrong" data-points="3">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">R(6)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_teleop_bent3_opponent" data-points="6">−</button>`;
  html += `<input type="number" id="head_${alliance}_teleop_bent3_opponent" value="${scoringData.teleop_bent3_opponent || 0}" min="0" data-points="6" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_teleop_bent3_opponent" data-points="6">+</button></div>`;
  html += '</div></div>';
  
  // Teleop Sarnıçlar
  html += '<div class="scoring-group compact-group"><div class="group-header">Sarnıç (5/Küre)</div>';
  html += '<div class="scoring-input-compact">';
  html += `<div class="score-control-compact"><span class="score-label-compact">K</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_teleop_tank_own" data-points="5">−</button>`;
  html += `<input type="number" id="head_${alliance}_teleop_tank_own" value="${scoringData.teleop_tank_own || 0}" min="0" data-points="5" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_teleop_tank_own" data-points="5">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">R</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_teleop_tank_opponent" data-points="5">−</button>`;
  html += `<input type="number" id="head_${alliance}_teleop_tank_opponent" value="${scoringData.teleop_tank_opponent || 0}" min="0" data-points="5" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_teleop_tank_opponent" data-points="5">+</button></div>`;
  html += '</div></div>';
  
  // Özel Aksiyonlar
  html += '<div class="scoring-group compact-group"><div class="group-header">Özel</div>';
  html += '<div class="scoring-input-compact">';
  html += `<div class="score-control-compact"><span class="score-label-compact">Kaynak(5)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_teleop_source_entry" data-points="5">−</button>`;
  html += `<input type="number" id="head_${alliance}_teleop_source_entry" value="${scoringData.teleop_source_entry || 0}" min="0" data-points="5" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_teleop_source_entry" data-points="5">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">Tırmanış(20)</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_teleop_climb" data-points="20">−</button>`;
  html += `<input type="number" id="head_${alliance}_teleop_climb" value="${scoringData.teleop_climb || 0}" min="0" data-points="20" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_teleop_climb" data-points="20">+</button></div>`;
  html += '</div></div>';
  
  // Cezalar
  html += '<div class="scoring-group compact-group"><div class="group-header">Cezalar</div>';
  html += '<div class="scoring-input-compact">';
  html += `<div class="score-control-compact"><span class="score-label-compact">Sarı</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_yellow_card" data-points="0">−</button>`;
  html += `<input type="number" id="head_${alliance}_yellow_card" value="${scoringData.yellow_card || 0}" min="0" data-points="0" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_yellow_card" data-points="0">+</button></div>`;
  html += `<div class="score-control-compact"><span class="score-label-compact">Büyük</span>`;
  html += `<button class="btn-score-minus" data-field="head_${alliance}_major_penalty" data-points="0">−</button>`;
  html += `<input type="number" id="head_${alliance}_major_penalty" value="${scoringData.major_penalty || 0}" min="0" data-points="0" class="score-field-compact" />`;
  html += `<button class="btn-score-plus" data-field="head_${alliance}_major_penalty" data-points="0">+</button></div>`;
  html += '</div></div>';
  
  // Kırmızı Kart
  html += '<div class="scoring-group compact-group"><div class="group-header">Kırmızı Kart</div>';
  html += '<div class="robot-checkbox-grid">';
  html += `<label class="robot-checkbox"><input type="checkbox" id="head_${alliance}_red_card_r1" ${scoringData.red_card_r1 ? 'checked' : ''} /><span>R1</span></label>`;
  html += `<label class="robot-checkbox"><input type="checkbox" id="head_${alliance}_red_card_r2" ${scoringData.red_card_r2 ? 'checked' : ''} /><span>R2</span></label>`;
  html += '</div></div>';
  
  html += '</div>'; // teleop-section kapanış
  
  formEl.innerHTML = html;
  
  // Event listener'ları ekle
  setupHeadRefereeFormEvents(alliance);
}

/**
 * Anlık skor güncellemelerini uygular (WebSocket'ten gelen güncellemeler için)
 */
function updateHeadRefereeDetailedScores(scores) {
  if (!scores) return;
  
  // Kırmızı ittifak skorlarını güncelle
  if (scores.red && scores.red.scoring_data) {
    updateHeadRefereeFormFields("red", scores.red.scoring_data);
  }
  
  // Mavi ittifak skorlarını güncelle
  if (scores.blue && scores.blue.scoring_data) {
    updateHeadRefereeFormFields("blue", scores.blue.scoring_data);
  }
}

/**
 * Baş hakem formundaki alanları günceller (anlık güncelleme için)
 */
function updateHeadRefereeFormFields(alliance, scoringData) {
  if (!scoringData || typeof scoringData !== "object") return;
  
  // Tüm alanları güncelle
  Object.keys(scoringData).forEach(key => {
    try {
      const element = qs(`head_${alliance}_${key}`);
      if (element) {
        if (element.type === "checkbox") {
          element.checked = !!scoringData[key];
        } else if (element.type === "number") {
          const value = parseInt(scoringData[key]) || 0;
          element.value = value;
        }
      }
    } catch (err) {
      console.warn(`updateHeadRefereeFormFields: Alan güncellenirken hata (${key}):`, err);
    }
  });
}

function startRealtimeUpdates(matchId, matchSource) {
  // Match Core kullanılıyorsa, WebSocket bağlantısı Match Core'da yapılıyor
  if (typeof MatchCore !== "undefined") {
    console.log("startRealtimeUpdates: Match Core kullanılıyor, bu fonksiyon çağrılmamalı");
    return;
  }
  
  stopRealtimeUpdates();
  retryCount = 0;
  
  const source = matchSource || "schedule";
  
  try {
    // Socket.IO bağlantısı oluştur
    headRefereeSocket = io("/match", {
      transports: ["websocket", "polling"],  // WebSocket öncelikli, polling fallback
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: MAX_RETRY_COUNT,
      timeout: 20000
    });
    
    console.log(`Head Referee WebSocket bağlantısı açılıyor: match_id=${matchId}, source=${source}`);
    
    // Bağlantı kurulduğunda
    headRefereeSocket.on("connect", () => {
      console.log("Head Referee WebSocket bağlantısı kuruldu");
      retryCount = 0;
      
      // Maça abone ol
      headRefereeSocket.emit("subscribe_match", {
        match_id: matchId,
        match_source: source
      });
    });
    
    // Maç durumu güncellemesi
    headRefereeSocket.on("match_state", (data) => {
      try {
        const matchData = data.match;
        
        if (!matchData || !currentMatch || currentMatch.id !== matchId) return;
        
        // Timer senkronizasyonu için server_timestamp kullan
        if (matchData.server_timestamp) {
          const serverTime = matchData.server_timestamp * 1000; // ms'ye çevir
          const clientTime = Date.now();
          const timeOffset = clientTime - serverTime; // Client-server zaman farkı
          
          // Maç bilgilerini güncelle
          currentMatch.current_state = matchData.current_state;
          currentMatch.time_remaining = matchData.time_remaining;
          currentMatch.status = matchData.status;
          
          // Timer'ı güncelle (server_timestamp ile senkronize)
          if (typeof updateHeadRefereeTimer === "function") {
            updateHeadRefereeTimer(matchData.current_state, matchData.time_remaining, timeOffset);
          }
        } else {
          // Eski format (server_timestamp yok)
          currentMatch.current_state = matchData.current_state;
          currentMatch.time_remaining = matchData.time_remaining;
          currentMatch.status = matchData.status;
          if (typeof updateHeadRefereeTimer === "function") {
            updateHeadRefereeTimer(matchData.current_state, matchData.time_remaining);
          }
        }
      } catch (err) {
        console.error("Head Referee WebSocket match_state error:", err);
      }
    });
    
    // Skor güncellemesi
    headRefereeSocket.on("scores", (data) => {
      try {
        if (!data || !currentMatch || currentMatch.id !== matchId) return;
        
        // Skorları güncelle
        if (typeof loadCurrentScores === "function") {
          loadCurrentScores();
        }
        
        // Detaylı skorları da güncelle (anlık görüntüleme için)
        if (data.scores && typeof updateHeadRefereeDetailedScores === "function") {
          updateHeadRefereeDetailedScores(data.scores);
        }
      } catch (err) {
        console.error("Head Referee WebSocket scores error:", err);
      }
    });
    
    // Hata mesajı
    headRefereeSocket.on("error", (error) => {
      console.error("Head Referee WebSocket error:", error);
    });
    
    // Bağlantı kesildiğinde
    headRefereeSocket.on("disconnect", (reason) => {
      console.warn("Head Referee WebSocket bağlantısı kesildi:", reason);
      
      // Eğer beklenmeyen bir kesilme ise (reconnect değilse) yeniden bağlanmayı dene
      if (reason === "io server disconnect" || reason === "transport close") {
        if (retryCount < MAX_RETRY_COUNT && currentMatch && currentMatch.id === matchId) {
          const retryDelay = Math.min(30000, RETRY_DELAY_BASE * Math.pow(2, retryCount));
          retryCount++;
          
          setTimeout(() => {
            if (currentMatch && currentMatch.id === matchId) {
              console.log(`Head Referee WebSocket yeniden bağlanma denemesi ${retryCount}/${MAX_RETRY_COUNT}...`);
              startRealtimeUpdates(matchId, source);
            }
          }, retryDelay);
        } else {
          console.error("Head Referee WebSocket bağlantısı kurulamadı, maksimum deneme sayısına ulaşıldı");
        }
      }
    });
    
    // Yeniden bağlanma denemesi
    headRefereeSocket.on("reconnect_attempt", (attemptNumber) => {
      console.log(`Head Referee WebSocket yeniden bağlanma denemesi: ${attemptNumber}`);
    });
    
    // Yeniden bağlanma başarılı
    headRefereeSocket.on("reconnect", (attemptNumber) => {
      console.log(`Head Referee WebSocket yeniden bağlandı (deneme: ${attemptNumber})`);
      retryCount = 0;
      
      // Maça tekrar abone ol
      if (currentMatch && currentMatch.id === matchId) {
        headRefereeSocket.emit("subscribe_match", {
          match_id: matchId,
          match_source: source
        });
      }
    });
    
  } catch (err) {
    console.error("Head Referee WebSocket bağlantısı oluşturulamadı:", err);
  }
}

function stopRealtimeUpdates() {
  if (headRefereeSocket) {
    // Abonelikten çık
    if (headRefereeSocket.connected) {
      headRefereeSocket.emit("unsubscribe_match", {});
    }
    
    // Bağlantıyı kapat
    headRefereeSocket.disconnect();
    headRefereeSocket = null;
  }
  retryCount = 0;
}

function updateHeadRefereeStatus() {
  const redMeta = refereeMeta?.red || {};
  const blueMeta = refereeMeta?.blue || {};
  const headMeta = refereeMeta?.head || {};

  const redStatusEl = qs("head_red_status");
  if (redStatusEl) {
    redStatusEl.textContent = redMeta.submitted
      ? `Giriş tamamlandı (${redMeta.submitted_by || "?"})`
      : "Giriş bekleniyor";
  }
  
  const blueStatusEl = qs("head_blue_status");
  if (blueStatusEl) {
    blueStatusEl.textContent = blueMeta.submitted
      ? `Giriş tamamlandı (${blueMeta.submitted_by || "?"})`
      : "Giriş bekleniyor";
  }

  const approveStatus = qs("head_approve_status");
  const approveBtn = qs("btn_head_approve");
  const canApprove = redMeta.submitted && blueMeta.submitted && !headMeta.approved;
  
  if (approveStatus) {
    if (headMeta.approved) {
      approveStatus.style.display = "block";
      approveStatus.textContent = `Onaylandı (${headMeta.approved_by || "?"})`;
    } else {
      approveStatus.style.display = "none";
    }
  }
  
  if (approveBtn) {
    approveBtn.disabled = !canApprove;
  }
}

async function approveMatch() {
  if (!currentMatch) return;
  try {
    await apiPost("/api/referee/approve", {
      match_id: currentMatch.id,
      match_source: currentMatch.match_source || "schedule"
    });
    await loadCurrentScores();
    showToast("Maç onaylandı", "success");
  } catch (err) {
    console.error("Head referee approve error:", err);
    showToast("Onay sırasında hata oluştu", "error");
  }
}

function renderNoMatch(message) {
  qs("head_referee_match_card").style.display = "none";
  qs("head_referee_scores").style.display = "none";
  const detailedScoresEl = qs("head_referee_detailed_scores");
  if (detailedScoresEl) detailedScoresEl.style.display = "none";
  const timerEl = qs("head_referee_timer");
  if (timerEl) timerEl.style.display = "none";
  const noMatchEl = qs("head_no_match");
  if (noMatchEl) {
    noMatchEl.style.display = "block";
    if (message) {
      const p = noMatchEl.querySelector("p");
      if (p) {
        p.textContent = message;
      }
    }
  }
}

function setupHeadRefereeEvents() {
  const approveBtn = qs("btn_head_approve");
  if (approveBtn) {
    approveBtn.addEventListener("click", approveMatch);
  }
  
  // Detaylı skor kaydetme butonları
  const saveRedBtn = qs("btn_head_save_red");
  if (saveRedBtn) {
    saveRedBtn.addEventListener("click", () => saveHeadRefereeScore("red"));
  }
  
  const saveBlueBtn = qs("btn_head_save_blue");
  if (saveBlueBtn) {
    saveBlueBtn.addEventListener("click", () => saveHeadRefereeScore("blue"));
  }
}

/**
 * Baş hakem form event listener'larını kurar
 */
function setupHeadRefereeFormEvents(alliance) {
  // Plus/minus butonları
  const formEl = qs(`head_${alliance}_scoring_form`);
  if (!formEl) return;
  
  formEl.querySelectorAll(".btn-score-plus, .btn-score-minus").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const fieldId = btn.dataset.field;
      const field = qs(fieldId);
      if (field) {
        const currentValue = parseInt(field.value || 0);
        if (btn.classList.contains("btn-score-plus")) {
          field.value = currentValue + 1;
        } else {
          field.value = Math.max(0, currentValue - 1);
        }
        // Değişiklik olduğunu işaretle
        field.dispatchEvent(new Event("change"));
      }
    });
  });
}

/**
 * Baş hakem skor kaydetme
 */
async function saveHeadRefereeScore(alliance) {
  if (!currentMatch || !currentMatch.id) {
    showToast("Aktif maç bulunamadı", "error");
    return;
  }
  
  try {
    const scoringData = collectHeadRefereeScoringData(alliance);
    
    await apiPost("/api/referee/score/update", {
      match_id: currentMatch.id,
      alliance: alliance,
      scoring_data: scoringData,
      match_source: currentMatch.match_source || "schedule"
    });
    
    showToast(`${alliance === "red" ? "Kırmızı" : "Mavi"} ittifak skorları kaydedildi`, "success");
    await loadCurrentScores(); // Skorları yeniden yükle
  } catch (err) {
    console.error("Head referee save score error:", err);
    showToast("Skor kaydedilirken hata oluştu", "error");
  }
}

/**
 * Baş hakem formundan skorlama verilerini toplar
 */
function collectHeadRefereeScoringData(alliance) {
  const data = {};
  const formEl = qs(`head_${alliance}_scoring_form`);
  if (!formEl) return data;
  
  // Tüm input alanlarını topla
  formEl.querySelectorAll("input").forEach(input => {
    const id = input.id.replace(`head_${alliance}_`, "");
    if (input.type === "checkbox") {
      data[id] = input.checked;
    } else if (input.type === "number") {
      data[id] = parseInt(input.value || 0);
    }
  });
  
  return data;
}

/**
 * Yardımcı fonksiyonlar
 * 
 * NOT: qs() fonksiyonu utils.js'de tanımlı, burada tekrar tanımlamaya gerek yok.
 */
// qs() fonksiyonu utils.js'den geliyor, burada tanımlamaya gerek yok

function getMatchTypeLabel(type) {
  const labels = {
    qualification: "Sıralama",
    elimination: "Eleme (Playoff)",
    final: "Final",
    practice: "Deneme"
  };
  return labels[type] || type;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeHeadReferee);
} else {
  initializeHeadReferee();
}
