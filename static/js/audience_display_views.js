/**
 * Audience Display - Views Module
 * 
 * Bu modül farklı view'ların yüklenmesi ile ilgili fonksiyonları içerir:
 * - Match view yükleme
 * - Inspection view yükleme
 * - Awards view yükleme
 * - Next match preview yükleme
 */

/**
 * Maç türüne göre üst bar için kısa etiket (seyirci ekranında "hangi maç" doğrulaması).
 * @param {Object} match - match objesi (match_type, match_number)
 * @returns {string} Örn. "Maç P19", "Sıralama #12", "Maç 7"
 */
function getMatchHeaderLabel(match) {
  if (!match) return "";
  const type = (match.match_type || "qualification").toLowerCase();
  const num = match.match_number ?? "";
  if (type === "practice") return num ? `Maç ${num}` : "Deneme Maçı";
  if (type === "qualification") return num ? `Sıralama #${num}` : "Sıralama";
  if (type === "elimination" || type === "final") return num ? `Maç ${num}` : "Maç";
  return num ? `Maç ${num}` : "";
}

/**
 * Maç görünümünü günceller (WebSocket'ten gelen verilerle)
 * 
 * @param {Object} match - Maç objesi
 */
function updateMatchView(match, timeOffset = 0) {
  // Audience Core kullanılıyorsa, preview kontrolü Audience Core'da yapılıyor
  const hasPreview = typeof AudienceCore !== "undefined" 
    ? AudienceCore.previewState !== "none"
    : previewPayload;
  
  if (!match) {
    // Preview varsa normal görünümü gösterme
    if (hasPreview) {
      return;
    }
    
    // Güvenli DOM güncellemeleri (element kontrolü ile)
    const stateLabel = qs("audience_state_label");
    const timerValue = qs("audience_timer_value");
    const redScore = qs("audience_red_score");
    const blueScore = qs("audience_blue_score");
    const redTeams = qs("audience_red_teams");
    const blueTeams = qs("audience_blue_teams");
    const matchMeta = qs("audience_match_meta");
    
    if (stateLabel) stateLabel.textContent = "Beklemede";
    if (timerValue) timerValue.textContent = "--:--";
    if (redScore) redScore.textContent = "0";
    if (blueScore) blueScore.textContent = "0";
    if (redTeams) redTeams.textContent = "-";
    if (blueTeams) blueTeams.textContent = "-";
    if (matchMeta) matchMeta.textContent = "";
    const headerMatchEl = document.getElementById("audience_header_match");
    if (headerMatchEl) headerMatchEl.textContent = "";
    
    if (typeof hideResultsPanel === "function") {
      hideResultsPanel();
    }
    if (typeof hideVSPreview === "function") {
      hideVSPreview();
    }
    loadNextMatchPreview();
    return;
  }
  
  // ÖNEMLİ: Preview varsa normal görünümü güncelleme (preview korunmalı)
  if (hasPreview) {
    console.log("updateMatchView: Preview aktif, normal görünüm güncellenmiyor");
    return;
  }
  
  // VS Preview'ı gizle (normal maç görünümüne geçildiğinde)
  if (typeof hideVSPreview === "function") {
    hideVSPreview();
  }
  
  if (typeof hideResultsPanel === "function") {
    hideResultsPanel();
  }
  
  // Güvenli DOM güncellemeleri (element kontrolü ile)
  const stateLabel = qs("audience_state_label");
  const timerValue = qs("audience_timer_value");
  const redScore = qs("audience_red_score");
  const blueScore = qs("audience_blue_score");
  const redTeams = qs("audience_red_teams");
  const blueTeams = qs("audience_blue_teams");
  const matchMeta = qs("audience_match_meta");
  const nextMatch = qs("audience_next_match");
  
  if (stateLabel) {
    stateLabel.textContent = match.state_label || "Beklemede";
  }
  
  // Timer: her zaman yaz (görünsün)
  if (typeof updateTimerDisplay === "function") {
    updateTimerDisplay(match.time_remaining ?? 0, match.current_state || "idle", timeOffset);
  } else if (timerValue) {
    const sec = match.time_remaining ?? 0;
    const minutes = Math.floor(Number(sec) / 60);
    const seconds = Number(sec) % 60;
    timerValue.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  
  // Skor: her zaman yaz (görünsün)
  if (typeof updateScoreDisplay === "function") {
    updateScoreDisplay("red", match.red_score ?? 0);
    updateScoreDisplay("blue", match.blue_score ?? 0);
  } else {
    if (redScore) redScore.textContent = String(match.red_score ?? 0);
    if (blueScore) blueScore.textContent = String(match.blue_score ?? 0);
  }
  
  if (redTeams) {
    redTeams.textContent = typeof formatTeamsWithNames === "function"
      ? formatTeamsWithNames(match.red_alliance, typeof audienceTeamsMap !== "undefined" ? audienceTeamsMap : {})
      : ((match.red_alliance || []).join(", ") || "-");
  }
  if (blueTeams) {
    blueTeams.textContent = typeof formatTeamsWithNames === "function"
      ? formatTeamsWithNames(match.blue_alliance, typeof audienceTeamsMap !== "undefined" ? audienceTeamsMap : {})
      : ((match.blue_alliance || []).join(", ") || "-");
  }
  if (matchMeta) {
    matchMeta.textContent = `${match.match_type || ""} • Saha ${match.field_number || "-"}`;
  }
  // Üst bar ortası: hangi maç gösteriliyor (P19, Sıralama #12 vb.) – doğru etkinlik/maç kontrolü için
  const headerMatchEl = document.getElementById("audience_header_match");
  if (headerMatchEl) {
    headerMatchEl.textContent = getMatchHeaderLabel(match);
  }
  if (nextMatch) {
    nextMatch.textContent = "";
  }

  // State değişikliği kontrolü (ses efekti için)
  // State değişikliği kontrolü (ses efekti için)
  // Audience Core kullanılıyorsa, state değişikliği Audience Core'da takip ediliyor
  if (typeof AudienceCore === "undefined") {
    // Fallback: Eski yöntem
    if (match.id !== lastMatchId) {
      lastMatchId = match.id;
      lastMatchState = "";
    }
    if (match.current_state && match.current_state !== lastMatchState) {
      lastMatchState = match.current_state;
      if (typeof announceState === "function") {
        announceState(match.current_state);
      }
    }
  } else {
    // Audience Core kullanılıyorsa, state değişikliği Audience Core'da takip ediliyor
    // _stateChanged flag'i Audience Core'da set ediliyor, UI'da kontrol edilecek
  }
}

/**
 * Maç görünümünü yükler (API'den)
 */
async function loadMatchView() {
  try {
    // Audience Core kullanılıyorsa, maç görünümü Audience Core'da yönetiliyor
    if (typeof AudienceCore !== "undefined") {
      await AudienceCore.loadMatchView();
      return;
    }
    
    // Fallback: Eski yöntem
    // ÖNEMLİ: Preview aktifken normal maç görünümünü yükleme
    if (previewPayload) {
      console.log("loadMatchView: Preview aktif, normal görünüm yüklenmiyor");
      return;
    }
    // İlk yükleme için API'den al (WebSocket başlatılmadan önce)
    const data = await apiGet("/api/match-control/audience-display");
    updateMatchView(data.match);
  } catch (err) {
    console.error("Audience match error:", err);
  }
}

/**
 * Sıradaki maç satırını günceller (API'den sıradaki maç bilgisi veya bilgi mesajı).
 */
function setNextMatchText(text) {
  const el = qs("audience_next_match");
  if (el) el.textContent = text;
}

/**
 * Sıradaki maç önizlemesini yükler
 */
async function loadNextMatchPreview() {
  try {
    const data = await apiGet("/api/public/next-match");
    if (!data || !data.match) {
      setNextMatchText("Sıradaki maç yok");
      return;
    }
    const match = data.match;
    const num = match.match_number || "-";
    const field = match.field_number ? `Saha ${match.field_number}` : "";
    const dateTime = [match.match_date, match.match_time].filter(Boolean).join(" ");
    setNextMatchText(`Sıradaki: ${num}${field ? " • " + field : ""}${dateTime ? " • " + dateTime : ""}`.trim() || "Sıradaki maç yok");
  } catch (err) {
    console.warn("loadNextMatchPreview:", err);
    setNextMatchText("Sıradaki maç bilgisi alınamadı");
  }
}

/**
 * İnceleme görünümünü yükler (inspection-tracking stilinde)
 */
async function loadInspectionView() {
  try {
    const data = await apiGet("/api/public/inspection-status");
    const teams = data.teams || [];
    const slots = data.slots || [];
    
    // Her takım için en son slot durumunu al
    const teamStatuses = {};
    (slots || []).forEach((slot) => {
      const key = slot.team_number;
      const ts = `${slot.slot_date} ${slot.slot_time}`;
      if (!teamStatuses[key] || ts > teamStatuses[key].ts) {
        teamStatuses[key] = { 
          status: slot.status, 
          ts,
          notes: slot.notes || ''
        };
      }
    });
    
    // Durumları hesapla
    const mapStatus = (apiStatus) => {
      const statusMap = {
        'completed': 'passed',
        'passed': 'passed',
        'failed': 'failed',
        'pending': 'not-started',
        'in_progress': 'not-started',
        'scheduled': 'not-started',
        'planned': 'not-started',
        'not_started': 'not-started'
      };
      return statusMap[apiStatus] || 'not-started';
    };
    
    let passed = 0, failed = 0, notStarted = 0;
    const teamRows = [];
    
    teams.forEach(team => {
      const statusInfo = teamStatuses[team.number];
      let status = 'not-started';
      if (statusInfo) {
        status = mapStatus(statusInfo.status);
      }
      
      if (status === 'passed') passed++;
      else if (status === 'failed') failed++;
      else notStarted++;
      
      teamRows.push({ team, status });
    });
    
    const total = teams.length;
    
    // Summary kartlarını güncelle
    const totalEl = qs("insp_total");
    const passedEl = qs("insp_passed");
    const failedEl = qs("insp_failed");
    const notStartedEl = qs("insp_not_started");
    
    if (totalEl) totalEl.textContent = total;
    if (passedEl) passedEl.textContent = passed;
    if (failedEl) failedEl.textContent = failed;
    if (notStartedEl) notStartedEl.textContent = notStarted;
    
    // Progress bar güncelle
    const passedPct = total > 0 ? Math.round((passed / total) * 100) : 0;
    const failedPct = total > 0 ? Math.round((failed / total) * 100) : 0;
    const notStartedPct = 100 - passedPct - failedPct;
    
    const barPassed = qs("insp_bar_passed");
    const barFailed = qs("insp_bar_failed");
    const barNotStarted = qs("insp_bar_not_started");
    
    if (barPassed) {
      barPassed.style.width = passedPct + '%';
      barPassed.textContent = passedPct > 8 ? passedPct + '%' : '';
    }
    if (barFailed) {
      barFailed.style.width = failedPct + '%';
      barFailed.textContent = failedPct > 8 ? failedPct + '%' : '';
    }
    if (barNotStarted) {
      barNotStarted.style.width = notStartedPct + '%';
      barNotStarted.textContent = notStartedPct > 8 ? notStartedPct + '%' : '';
    }
    
    // Takım listesini render et (durum sırasına göre)
    const statusOrder = { 'not-started': 0, 'failed': 1, 'passed': 2 };
    teamRows.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return a.team.number - b.team.number;
    });
    
    const table = qs("audience_inspection_table");
    if (table) {
      const getStatusLabel = (status) => {
        switch(status) {
          case 'passed': return '<span class="status-badge passed">✅ Geçti</span>';
          case 'failed': return '<span class="status-badge failed">❌ Kaldı</span>';
          default: return '<span class="status-badge not-started">📋 Başlamadı</span>';
        }
      };
      
      table.innerHTML = teamRows.map(({ team, status }) => {
        return `<div class="inspection-team-row ${status}">
          <span class="team-number">${team.number}</span>
          <span class="team-name">${team.name || '-'}</span>
          <span class="team-status">${getStatusLabel(status)}</span>
        </div>`;
      }).join("");
    }
  } catch (err) {
    console.error("Inspection view error:", err);
  }
}

/**
 * Ödüller görünümünü yükler (Tüm Kazananlar - Tam Ekran)
 */
async function loadAwardsView() {
  try {
    // Ödül kazananlarını yükle (sadece atanmış olanlar)
    const winners = await apiGet("/api/public/award-winners");
    const list = qs("audience_awards_list");
    const container = qs("audience_awards_view");
    if (!list) return;
    
    // Sadece takım atanmış ödülleri göster
    const assignedWinners = (winners || []).filter(w => w.winner_team_number);
    
    if (!assignedWinners.length) {
      list.innerHTML = "<div class='audience-placeholder'>Henüz ödül kazananı belirlenmemiş.</div>";
      if (container) container.removeAttribute("data-award-count");
      return;
    }
    
    // Ödül sayısına göre data-attribute ayarla (CSS için)
    const count = assignedWinners.length;
    if (container) {
      if (count <= 6) {
        container.setAttribute("data-award-count", count.toString());
      } else {
        container.setAttribute("data-award-count", "many");
      }
    }
    
    // Sunum sırasına göre sırala
    const sortedWinners = assignedWinners.sort((a, b) => 
      (a.presentation_order || 0) - (b.presentation_order || 0)
    );
    
    list.innerHTML = sortedWinners.map((winner) => {
      return `<div class="audience-table-row award-winner-row">
        <div class="award-winner-info">
          <span class="award-name">🏆 ${escapeHtml(winner.award_name || "Ödül")}</span>
          ${winner.jury_note ? `<span class="jury-note">${escapeHtml(winner.jury_note)}</span>` : ""}
        </div>
        <div class="winner-info">
          <span class="team-number">${escapeHtml(winner.winner_team_number)}</span>
          <span class="team-name">${escapeHtml(winner.winner_team_name || "")}</span>
        </div>
      </div>`;
    }).join("");
  } catch (err) {
    console.error("Awards view error:", err);
  }
}

/**
 * Sıralama görünümünü yükler
 */
async function loadRankingsView() {
  try {
    const data = await apiGet("/api/public/rankings");
    const rankings = data.rankings || [];
    
    const container = qs("audience_rankings_view");
    const table = qs("audience_rankings_table");
    if (!table) return;
    
    if (!rankings.length) {
      table.innerHTML = "<div class='audience-placeholder'>Henüz sıralama verisi yok.</div>";
      return;
    }
    
    // Sıralamaya göre sırala
    const sortedRankings = [...rankings].sort((a, b) => (a.rank || 999) - (b.rank || 999));
    
    const rowsHtml = sortedRankings.map((r) => {
      const teamNumber = r.team_number || r.team;
      const avgScore = (typeof r.average_score === "number")
        ? r.average_score.toFixed(2)
        : (r.average_score != null ? String(r.average_score) : "0.00");
      return `<div class="rankings-row">
        <span class="rank-col">${r.rank || '-'}</span>
        <span class="team-col">
          <strong>${teamNumber}</strong>
        </span>
        <span class="wins-col">${r.wins || 0}</span>
        <span class="losses-col">${r.losses || 0}</span>
        <span class="ties-col">${r.ties || 0}</span>
        <span class="avg-col">${avgScore}</span>
        <span class="sp-col">${r.total_sp != null ? r.total_sp : 0}</span>
      </div>`;
    }).join("");

    table.innerHTML = `
      <div class="rankings-header">
        <span class="rank-col">Sıra</span>
        <span class="team-col">Takım</span>
        <span class="wins-col">G</span>
        <span class="losses-col">M</span>
        <span class="ties-col">B</span>
        <span class="avg-col">Ort</span>
        <span class="sp-col">SP</span>
      </div>
      <div class="rankings-scroll" id="audience_rankings_scroll">
        <div class="rankings-scroll-inner" id="audience_rankings_inner">
          ${rowsHtml}
          ${rowsHtml}
        </div>
      </div>
    `;
    
    startRankingsAutoScroll();
  } catch (err) {
    console.error("Rankings view error:", err);
  }
}

// Rankings auto-scroll (audience) - CSS animasyon
function startRankingsAutoScroll() {
  const scrollEl = qs("audience_rankings_scroll");
  const innerEl = qs("audience_rankings_inner");
  if (!scrollEl || !innerEl) return;
  // İçerik sığmıyorsa animasyon uygulama
  if (scrollEl.scrollHeight <= scrollEl.clientHeight) {
    innerEl.style.animation = "none";
    return;
  }
  // Satır sayısına göre süreyi ayarla (daha çok takım = daha yavaş)
  const rowCount = innerEl.querySelectorAll(".rankings-row").length / 2;
  const duration = Math.max(12, rowCount * 1.2);
  innerEl.style.setProperty("--scroll-duration", `${duration}s`);
  innerEl.classList.add("is-scrolling");
}

/**
 * Ödül töreni görünümünü yükler
 */
async function loadCeremonyView() {
  try {
    // Audience Ceremony modülü varsa onu kullan
    if (typeof AudienceCeremony !== "undefined" && AudienceCeremony.loadState) {
      await AudienceCeremony.loadState();
      return;
    }
    
    // Fallback: Basit yükleme
    const data = await apiGet("/api/public/ceremony");
    console.log("Ceremony state loaded:", data);
  } catch (err) {
    console.error("Ceremony view error:", err);
  }
}

/**
 * Ödül töreni görünümünü gösterir
 */
function showCeremonyView() {
  // Tüm audience panellerini gizle
  document.querySelectorAll('.audience-panel').forEach(panel => {
    panel.style.display = 'none';
  });
  
  // Ceremony view'ı göster
  const ceremonyView = document.getElementById('audience_ceremony_view');
  if (ceremonyView) {
    ceremonyView.style.display = 'flex';
  }
  
  // State'i yükle
  loadCeremonyView();
}
