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
 * İnceleme görünümünü yükler
 */
async function loadInspectionView() {
  try {
    const data = await apiGet("/api/public/inspection-status");
    const teams = data.teams || [];
    const slots = data.slots || [];
    const slotMap = {};
    (slots || []).forEach((slot) => {
      const key = slot.team_number;
      const ts = `${slot.slot_date} ${slot.slot_time}`;
      if (!slotMap[key] || ts > slotMap[key].ts) {
        slotMap[key] = { status: slot.status, ts };
      }
    });
    const completed = Object.values(slotMap).filter((item) => item.status === "completed").length;
    const total = teams.length;
    const summary = qs("audience_inspection_summary");
    if (summary) {
      summary.textContent = `Tamamlanan: ${completed} / ${total}`;
    }
    const table = qs("audience_inspection_table");
    if (table) {
      table.innerHTML = (teams || []).map((team) => {
        const status = slotMap[team.number]?.status || "planned";
        return `<div class="audience-table-row">
          <span>${team.number}</span>
          <span>${team.name || ""}</span>
          <span>${status}</span>
        </div>`;
      }).join("");
    }
  } catch (err) {
    console.error("Inspection view error:", err);
  }
}

/**
 * Ödüller görünümünü yükler
 */
async function loadAwardsView() {
  try {
    const awards = await apiGet("/api/public/awards");
    const list = qs("audience_awards_list");
    if (!list) return;
    if (!awards.length) {
      list.innerHTML = "<div class='audience-placeholder'>Ödül bulunamadı.</div>";
      return;
    }
    list.innerHTML = awards.map((award) => {
      const winner = award.winner || award.team || "";
      return `<div class="audience-table-row">
        <span>${award.name || "Ödül"}</span>
        <span>${winner || "-"}</span>
      </div>`;
    }).join("");
  } catch (err) {
    console.error("Awards view error:", err);
  }
}
