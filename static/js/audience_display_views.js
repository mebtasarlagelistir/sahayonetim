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
    // Maç tipi/kaynağına göre anlamlı etiket (match_number yoksa "-" yerine).
    const label = getMatchHeaderLabel(match) || "Sıradaki maç";
    const field = match.field_number ? `Saha ${match.field_number}` : "";
    const dateTime = [match.match_date, match.match_time].filter(Boolean).join(" ");
    setNextMatchText(`Sıradaki: ${label}${field ? " • " + field : ""}${dateTime ? " • " + dateTime : ""}`.trim() || "Sıradaki maç yok");
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
      
      const escI = (typeof escapeHtml === "function") ? escapeHtml : (s) => String(s);
      table.innerHTML = teamRows.map(({ team, status }) => {
        return `<div class="inspection-team-row ${status}">
          <span class="team-number">${escI(String(team.number ?? ""))}</span>
          <span class="team-name">${escI(team.name || '-')}</span>
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
      const escR = (typeof escapeHtml === "function") ? escapeHtml : (s) => String(s);
      return `<div class="rankings-row">
        <span class="rank-col">${r.rank || '-'}</span>
        <span class="team-col">
          <strong>${escR(String(teamNumber ?? ""))}</strong>
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

/**
 * ============================================================================
 * PLAYOFF BRACKET GÖRÜNÜMÜ (Seyirci) — 6 ittifak çift eleme
 * ============================================================================
 */

/**
 * /api/public/playoff-bracket verisini seyirci ekranında bracket olarak çizer.
 */
async function renderAudiencePlayoff() {
  const container = qs("audience_playoff_bracket");
  if (!container) return;
  try {
    const data = await apiGet("/api/public/playoff-bracket");
    if (!data || !data.ok) {
      container.innerHTML = `<div class="audience-empty">${escapeHtml((data && data.error) || "Playoff henüz hazır değil.")}</div>`;
      return;
    }
    const rounds = data.bracket_rounds || [];
    if (!rounds.length) {
      container.innerHTML = `<div class="audience-empty">Playoff eşleşmesi bulunamadı.</div>`;
      return;
    }

    const allianceHtml = (info, fallback) => {
      const list = (info && info.length) ? info : (fallback || []).map((t) => ({ team: t }));
      if (!list.length) {
        return `<span class="ap-team ap-waiting">Bekleniyor</span>`;
      }
      return list.map((t) => {
        const seed = t.rank ? `<span class="ap-seed">#${escapeHtml(String(t.rank))}</span>` : "";
        const name = t.name ? ` ${escapeHtml(t.name)}` : "";
        return `<span class="ap-team">${seed}${escapeHtml(String(t.team))}${name}</span>`;
      }).join("");
    };

    const columns = rounds.map((round) => {
      const cards = (round.matches || []).map((m) => {
        const empty = !(m.red_alliance && m.red_alliance.length) && !(m.blue_alliance && m.blue_alliance.length);
        const played = m.status === "completed";
        const live = m.status === "in_progress";
        const winCls = (side) => played && m.winner === side ? " ap-win"
          : (played && m.winner && m.winner !== "tie" ? " ap-lose" : "");
        const score = (side, val) => played ? `<span class="ap-score${m.winner === side ? " ap-score-win" : ""}">${escapeHtml(String(val ?? 0))}</span>` : "";
        const time = m.match_time ? `<span class="ap-time">${escapeHtml(m.match_time)}</span>` : "";
        const badge = live ? `<span class="ap-live">● CANLI</span>` : "";
        return `
          <div class="ap-match ${empty ? "ap-empty" : ""} ${live ? "ap-match-live" : ""}">
            <div class="ap-label">${escapeHtml(m.label || "")} ${time} ${badge}</div>
            <div class="ap-alliance ap-red${winCls("red")}">${allianceHtml(m.red_alliance_info, m.red_alliance)}${score("red", m.red_score)}</div>
            <div class="ap-vs">VS</div>
            <div class="ap-alliance ap-blue${winCls("blue")}">${allianceHtml(m.blue_alliance_info, m.blue_alliance)}${score("blue", m.blue_score)}</div>
          </div>
        `;
      }).join("");
      return `
        <div class="ap-column">
          <div class="ap-column-title">${escapeHtml(round.name || "")}</div>
          ${cards}
        </div>
      `;
    }).join("");

    container.innerHTML = `<div class="ap-shell">${columns}</div>`;
  } catch (err) {
    console.error("renderAudiencePlayoff error:", err);
    container.innerHTML = `<div class="audience-empty">Playoff verisi yüklenemedi.</div>`;
  }
}

let _audiencePlayoffTimer = null;

/**
 * Playoff görünümünü yükler ve aktifken periyodik (5sn) tazeler.
 * Panel gizlenince timer kendini durdurur.
 */
async function loadPlayoffView() {
  await renderAudiencePlayoff();
  if (_audiencePlayoffTimer) clearInterval(_audiencePlayoffTimer);
  _audiencePlayoffTimer = setInterval(() => {
    const el = qs("audience_playoff_view");
    if (!el || el.style.display === "none") {
      clearInterval(_audiencePlayoffTimer);
      _audiencePlayoffTimer = null;
      return;
    }
    renderAudiencePlayoff();
  }, 5000);
}

/**
 * ============================================================================
 * İTTİFAK SEÇİMİ TÖRENİ GÖRÜNÜMÜ (Seyirci)
 * ============================================================================
 */

// Son render imzası: içerik değişmediyse yeniden render edilmez (kaydırma sürsün).
let _aaLastSig = null;

/**
 * /api/public/playoff-alliances verisini ittifak kartları olarak çizer.
 */
async function renderAudienceAlliances() {
  const container = qs("audience_alliances_grid");
  if (!container) return;
  try {
    // İttifaklar + sıralama + takım adları birlikte: FRC tarzı "seçim tahtası" için.
    const [data, rankingPayload, teamsData] = await Promise.all([
      apiGet("/api/public/playoff-alliances").catch(() => ({})),
      apiGet("/api/public/rankings").catch(() => ({})),
      apiGet("/api/public/teams").catch(() => []),
    ]);
    const alliances = (data && data.alliances) || [];
    const rankings = (rankingPayload && rankingPayload.rankings) || [];
    const nameMap = {};
    (Array.isArray(teamsData) ? teamsData : []).forEach((t) => {
      if (t && t.number) nameMap[String(t.number)] = t.name || "";
    });
    const nameOf = (num) => nameMap[String(num)] || "";

    // Seçilen takımlar haritası: takım -> {rol, seed}
    const pickMap = {};
    alliances.forEach((a) => {
      if (a.captain && a.captain.team) pickMap[String(a.captain.team)] = { role: "captain", seed: a.seed };
      if (a.partner && a.partner.team) pickMap[String(a.partner.team)] = { role: "partner", seed: a.seed };
    });

    // SOL PANEL: 6 ittifak kartı (kaptan + partner)
    const memberHtml = (member, roleLabel, roleClass) => {
      const team = member && member.team ? escapeHtml(String(member.team)) : "—";
      const name = member ? (member.name || nameOf(member.team)) : "";
      return `
        <div class="aa-member ${roleClass}">
          <div class="aa-role">${roleLabel}</div>
          <div class="aa-team">${team}</div>
          ${name ? `<div class="aa-name">${escapeHtml(name)}</div>` : ""}
        </div>`;
    };
    const allianceCards = alliances.length
      ? alliances.map((a) => `
          <div class="aa-card">
            <div class="aa-seed">İttifak ${escapeHtml(String(a.seed))}</div>
            ${memberHtml(a.captain, "Kaptan", "aa-captain")}
            ${memberHtml(a.partner, "Partner", "aa-partner")}
          </div>`).join("")
      : `<div class="audience-empty" style="grid-column:1/-1;">Henüz ittifak seçimi yapılmadı.<br><span style="font-size:1rem;opacity:.8;">Sıralamadaki ilk 6 takım kaptan olacak.</span></div>`;

    // SAĞ PANEL: sıralı takım havuzu (seçim durumu)
    const poolRows = rankings.map((r) => {
      const team = String(r.team);
      const pick = pickMap[team];
      let cls = "ap-available", badge = "";
      if (pick && pick.role === "captain") { cls = "ap-captain"; badge = `Kaptan ${pick.seed}`; }
      else if (pick && pick.role === "partner") { cls = "ap-partner"; badge = `→ İttifak ${pick.seed}`; }
      const nm = nameOf(team);
      return `
        <div class="ap-row ${cls}">
          <span class="ap-rank">${escapeHtml(String(r.rank ?? ""))}</span>
          <span class="ap-team">${escapeHtml(team)}</span>
          <span class="ap-name">${escapeHtml(nm)}</span>
          <span class="ap-badge">${escapeHtml(badge)}</span>
        </div>`;
    }).join("");

    // İçerik değişmediyse yeniden render etme (otomatik kaydırma kesintisiz sürsün).
    const sig = JSON.stringify({
      a: alliances.map((x) => [x.seed, x.captain && x.captain.team, x.partner && x.partner.team]),
      r: rankings.map((x) => [String(x.team), x.rank]),
    });
    if (sig === _aaLastSig && container.querySelector(".aa-board")) return;
    _aaLastSig = sig;

    container.innerHTML = `
      <div class="aa-board">
        <div class="aa-left">${allianceCards}</div>
        <div class="aa-right">
          <div class="aa-pool-title">Sıralama / Seçim Durumu</div>
          <div class="aa-pool"><div class="aa-pool-scroll">${poolRows || `<div class="audience-empty">Sıralama yok.</div>`}</div></div>
          <div class="aa-legend">
            <span><i class="lg lg-cap"></i> Kaptan</span>
            <span><i class="lg lg-par"></i> Seçildi (partner)</span>
            <span><i class="lg lg-av"></i> Müsait</span>
          </div>
        </div>
      </div>`;

    // Havuz panele sığmıyorsa: içeriği kopyala + yavaş, kesintisiz DÖNGÜ kaydırma uygula.
    // (Sığıyorsa statik kalır.) requestAnimationFrame ile layout ölç.
    requestAnimationFrame(() => {
      const wrap = container.querySelector(".aa-pool");
      const scroll = container.querySelector(".aa-pool-scroll");
      if (!wrap || !scroll) return;
      if (scroll.scrollHeight > wrap.clientHeight + 6) {
        const oneHeight = scroll.scrollHeight;
        scroll.innerHTML += scroll.innerHTML; // kesintisiz döngü için ikinci kopya
        // Hız: ~her satır için sabit süre (yavaş). Min 24sn.
        const dur = Math.max(24, rankings.length * 2.2);
        scroll.style.setProperty("--aa-scroll-dist", `${oneHeight}px`);
        scroll.style.animation = `aa-pool-scroll ${dur}s linear infinite`;
      }
    });
  } catch (err) {
    console.error("renderAudienceAlliances error:", err);
    container.innerHTML = `<div class="audience-empty">İttifak verisi yüklenemedi.</div>`;
  }
}

let _audienceAlliancesTimer = null;

/**
 * İttifak seçimi görünümünü yükler ve aktifken periyodik (5sn) tazeler.
 */
async function loadAlliancesView() {
  await renderAudienceAlliances();
  if (_audienceAlliancesTimer) clearInterval(_audienceAlliancesTimer);
  _audienceAlliancesTimer = setInterval(() => {
    const el = qs("audience_alliances_view");
    if (!el || el.style.display === "none") {
      clearInterval(_audienceAlliancesTimer);
      _audienceAlliancesTimer = null;
      return;
    }
    renderAudienceAlliances();
  }, 5000);
}
