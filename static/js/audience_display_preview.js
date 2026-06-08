/**
 * Audience Display - Preview Module
 * 
 * Bu modül preview yönetimi ile ilgili tüm fonksiyonları içerir:
 * - Preview payload uygulama
 * - VS Preview gösterimi
 * - Results panel gösterimi
 * - Preview gizleme
 */

/**
 * Preview payload'ı uygular
 * 
 * @param {Object} payload - Preview payload objesi
 * @returns {boolean} - Başarılı olursa true
 */
function applyPreviewPayload(payload) {
  if (!payload) {
    console.warn("applyPreviewPayload: payload yok");
    return false;
  }
  
  const match = payload?.match || null;
  const rankings = payload?.rankings || {};
  if (!match) {
    console.warn("applyPreviewPayload: match yok");
    return false;
  }
  
  console.log("Preview payload uygulanıyor:", { type: payload.type, match });
  
  // VS Preview sayfası göster
  if (payload?.type === "vs_preview") {
    console.log("VS Preview tipi algılandı");
    const result = applyVSPreviewPayload(payload);
    if (result) {
      // WebSocket'i durdur (preview gösterilirken)
      if (typeof stopAudienceSSE === "function") {
        stopAudienceSSE();
      }
    }
    return result;
  }
  
  if (payload?.type === "results") {
    return applyResultsPayload(payload);
  }
  
  // Normal önizleme (VS preview değil)
  hideResultsPanel();
  // VS Preview'ı gizle (normal preview gösterilecek)
  const vsPreview = qs("audience_vs_preview");
  if (vsPreview) {
    vsPreview.style.display = "none";
  }
  // VS preview class'larını kaldır
  const container = document.querySelector(".audience-container");
  if (container) {
    container.classList.remove("vs-preview-active");
  }
  document.body.classList.remove("vs-preview-mode");
  
  // Normal maç görünümünü göster
  const matchView = qs("audience_match_view");
  if (matchView) {
    matchView.style.display = "block";
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
  
  if (stateLabel) stateLabel.textContent = "Önizleme";
  if (timerValue) timerValue.textContent = "--:--";
  if (redScore) redScore.textContent = "0";
  if (blueScore) blueScore.textContent = "0";
  if (redTeams) {
    redTeams.textContent = typeof formatTeamsWithRank === "function" 
      ? formatTeamsWithRank(match.red_alliance, rankings)
      : (match.red_alliance || []).join(", ");
  }
  if (blueTeams) {
    blueTeams.textContent = typeof formatTeamsWithRank === "function"
      ? formatTeamsWithRank(match.blue_alliance, rankings)
      : (match.blue_alliance || []).join(", ");
  }
  if (matchMeta) {
    matchMeta.textContent = `${match.match_type || ""} • Saha ${match.field_number || "-"}`;
  }
  if (nextMatch) {
    nextMatch.textContent = `Sıradaki: ${match.match_number} • ${match.match_date} ${match.match_time}`;
  }
  
  // WebSocket'i durdur (preview gösterilirken)
  if (typeof stopAudienceSSE === "function") {
    stopAudienceSSE();
  }
  
  return true;
}

/**
 * VS Preview payload'ı uygular
 * 
 * @param {Object} payload - VS Preview payload objesi
 * @returns {boolean} - Başarılı olursa true
 */
function applyVSPreviewPayload(payload) {
  const match = payload?.match || null;
  const teams = payload?.teams || {};
  if (!match) {
    console.warn("applyVSPreviewPayload: match yok");
    return false;
  }
  
  console.log("VS Preview uygulanıyor:", { 
    match, 
    teams, 
    red_alliance: match.red_alliance, 
    blue_alliance: match.blue_alliance 
  });
  
  // ÖNEMLİ: Normal maç görünümünü kesinlikle gizle (öncelikli)
  const matchView = qs("audience_match_view");
  if (matchView) {
    matchView.style.display = "none";
  }
  
  // Results panel'i de gizle
  hideResultsPanel();
  
  // Container'a class ekle (16:9 için padding kaldırma)
  const container = document.querySelector(".audience-container");
  if (container) {
    container.classList.add("vs-preview-active");
  }
  
  // Body'ye class ekle (16:9 için)
  document.body.classList.add("vs-preview-mode");
  
  // VS Preview sayfasını göster
  const vsPreview = qs("audience_vs_preview");
  if (!vsPreview) {
    console.error("VS Preview elementi bulunamadı");
    return false;
  }
  vsPreview.style.display = "block";
  
  // Maç bilgilerini göster
  const matchTypeLabels = {
    "qualification": "Sıralama Maçı",
    "elimination": "Eleme Maçı",
    "final": "Final Maçı",
    "practice": "Deneme Maçı"
  };
  
  // Üst bar: Sıradaki | Maç no / Sıralama #no | Etkinlik adı (görsel 1)
  const labelUpNext = document.getElementById("vs_label_up_next");
  if (labelUpNext) labelUpNext.textContent = "Sıradaki";

  const matchInfoEl = qs("vs_match_info");
  if (matchInfoEl) {
    const matchType = (match.match_type || "qualification").toLowerCase();
    const num = match.match_number || "0";
    if (matchType === "qualification") {
      matchInfoEl.textContent = `Sıralama #${num}`;
    } else if (matchType === "elimination" || matchType === "final") {
      matchInfoEl.textContent = `Maç ${num}`;
    } else {
      matchInfoEl.textContent = `Maç ${num}`;
    }
  }

  const eventNameEl = qs("vs_event_name");
  if (eventNameEl) {
    eventNameEl.textContent = payload.event_name || "Maç Önizlemesi";
  }
  
  // Bar içi takım satırları: numara | isim | skor (önizlemede "-")
  function renderBarTeams(alliance, teamsMap) {
    if (!alliance || !Array.isArray(alliance) || alliance.length === 0) {
      return "<div class='vs-bar-team-row'><span class='vs-bar-team-num'>-</span><span class='vs-bar-team-name'>Takım yok</span><span class='vs-bar-team-score'>-</span></div>";
    }
    return alliance.map(teamNum => {
      const team = teamsMap[String(teamNum)] || {};
      const name = (team.name || "Takım").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<div class="vs-bar-team-row"><span class="vs-bar-team-num">${teamNum}</span><span class="vs-bar-team-name">${name}</span><span class="vs-bar-team-score">-</span></div>`;
    }).join("");
  }
  
  const redTeamsEl = qs("vs_red_teams");
  if (redTeamsEl) {
    try {
      redTeamsEl.innerHTML = renderBarTeams(match.red_alliance, teams);
    } catch (err) {
      console.error("VS Preview: Kırmızı takımlar render hatası:", err);
      redTeamsEl.innerHTML = "<div class='vs-bar-team-row'><span class='vs-bar-team-name'>Hata</span></div>";
    }
  }
  
  const blueTeamsEl = qs("vs_blue_teams");
  if (blueTeamsEl) {
    try {
      blueTeamsEl.innerHTML = renderBarTeams(match.blue_alliance, teams);
    } catch (err) {
      console.error("VS Preview: Mavi takımlar render hatası:", err);
      blueTeamsEl.innerHTML = "<div class='vs-bar-team-row'><span class='vs-bar-team-name'>Hata</span></div>";
    }
  }
  
  console.log("VS Preview başarıyla uygulandı", {
    red_alliance: match.red_alliance,
    blue_alliance: match.blue_alliance,
    teams_count: Object.keys(teams).length,
    previewPayload: !!previewPayload
  });
  
  // ÖNEMLİ: Preview'ın kaybolmasını önlemek için bir flag set et
  // Bu flag, preview aktifken diğer fonksiyonların preview'ı temizlemesini engeller
  if (!previewPayload) {
    console.warn("applyVSPreviewPayload: previewPayload null! Bu bir hata olabilir.");
  }
  
  return true;
}

/**
 * VS Preview'ı gizler
 */
function hideVSPreview() {
  // ÖNEMLİ: Preview aktifken hideVSPreview çağrılmamalı
  // Ama eğer preview temizlendiyse (previewPayload null ise) gizle
  if (previewPayload) {
    console.log("hideVSPreview: Preview aktif, gizleme yapılmıyor");
    return;
  }
  
  const vsPreview = qs("audience_vs_preview");
  if (vsPreview) vsPreview.style.display = "none";
  
  // Container'dan class'ı kaldır
  const container = document.querySelector(".audience-container");
  if (container) {
    container.classList.remove("vs-preview-active");
  }
  
  // Body'den class'ı kaldır
  document.body.classList.remove("vs-preview-mode");
  
  const matchView = qs("audience_match_view");
  if (matchView) matchView.style.display = "block";
}

/**
 * Results panel'i gizler
 */
function hideResultsPanel() {
  const panel = qs("audience_results");
  if (panel) panel.style.display = "none";
}

/**
 * Maç türüne göre ekran başlık metnini döner (etkinlik aşamasına göre otomasyon).
 * @param {Object} match - match objesi (match_type, match_number)
 * @returns {string} Örn. "Sıralama #29" veya "Maç 7"
 */
function getResultsSubtitleForMatch(match) {
  if (!match) return "";
  const type = (match.match_type || "qualification").toLowerCase();
  const num = match.match_number ?? 0;
  if (type === "qualification") return `Sıralama #${num}`;
  if (type === "elimination" || type === "final") return `Maç ${num}`;
  return `Maç ${num}`;
}

/**
 * Results payload'ı uygular. Etkinlik aşamasına göre (sıralama / eleme-final) layout otomatik ayarlanır.
 *
 * @param {Object} payload - Results payload objesi (match, results; results içinde winner, skorlar, breakdown, advancement_red/blue)
 * @returns {boolean} - Başarılı olursa true
 */
function applyResultsPayload(payload) {
  const match = payload?.match || null;
  const results = payload?.results || null;
  if (!match || !results) {
    console.warn("applyResultsPayload: match veya results yok");
    return false;
  }

  const stateLabel = qs("audience_state_label");
  const timerValue = qs("audience_timer_value");
  const redScore = qs("audience_red_score");
  const blueScore = qs("audience_blue_score");
  const redTeams = qs("audience_red_teams");
  const blueTeams = qs("audience_blue_teams");
  const matchMeta = qs("audience_match_meta");
  const nextMatch = qs("audience_next_match");

  if (stateLabel) stateLabel.textContent = "Maç Sonucu";
  if (timerValue) timerValue.textContent = "BİTTİ";
  if (redScore) redScore.textContent = results.red_score ?? 0;
  if (blueScore) blueScore.textContent = results.blue_score ?? 0;
  if (redTeams) redTeams.textContent = (match.red_alliance || []).join(", ") || "-";
  if (blueTeams) blueTeams.textContent = (match.blue_alliance || []).join(", ") || "-";
  if (matchMeta) matchMeta.textContent = `${match.match_type || ""} • Saha ${match.field_number || "-"}`;
  if (nextMatch) nextMatch.textContent = "";

  const panel = qs("audience_results");
  if (!panel) {
    if (typeof announceResults === "function") announceResults(results);
    return true;
  }

  panel.style.display = "block";

  // Etkinlik aşaması: qualification -> sıralama ekranı, elimination/final -> eleme ekranı
  const matchType = (match.match_type || "qualification").toLowerCase();
  const stage = matchType === "elimination" || matchType === "final" ? "playoff" : "qualification";
  panel.setAttribute("data-stage", stage);

  const titleEl = qs("audience_results_title");
  const subtitleEl = qs("audience_results_subtitle");
  if (titleEl) titleEl.textContent = "Maç Sonucu";
  if (subtitleEl) subtitleEl.textContent = getResultsSubtitleForMatch(match);

  // Büyük skorlar
  const redTotalEl = qs("audience_results_red_total");
  const blueTotalEl = qs("audience_results_blue_total");
  if (redTotalEl) redTotalEl.textContent = results.red_score ?? 0;
  if (blueTotalEl) blueTotalEl.textContent = results.blue_score ?? 0;

  // KAZANAN rozeti: makine-okunur skor karşılaştırmasıyla (serbest metin yerine).
  // Beraberlikte hiçbir rozet gösterilmez.
  const winnerRedBadge = qs("audience_results_winner_red");
  const winnerBlueBadge = qs("audience_results_winner_blue");
  const rScore = Number(results.red_score ?? 0);
  const bScore = Number(results.blue_score ?? 0);
  if (winnerRedBadge) winnerRedBadge.style.display = rScore > bScore ? "block" : "none";
  if (winnerBlueBadge) winnerBlueBadge.style.display = bScore > rScore ? "block" : "none";

  // Kategori breakdown (otomatik payload'dan)
  const setEl = (id, value) => { const el = qs(id); if (el) el.textContent = value; };
  setEl("audience_results_red_auto", results.red_auto_total ?? 0);
  setEl("audience_results_red_teleop", results.red_teleop_total ?? 0);
  setEl("audience_results_red_penalty", results.red_penalty_total ?? 0);
  setEl("audience_results_red_sp", results.red_sp_total ?? 0);
  setEl("audience_results_red_cards", `${results.red_yellow_cards ?? 0} / ${results.red_red_cards ?? 0}`);
  setEl("audience_results_blue_auto", results.blue_auto_total ?? 0);
  setEl("audience_results_blue_teleop", results.blue_teleop_total ?? 0);
  setEl("audience_results_blue_penalty", results.blue_penalty_total ?? 0);
  setEl("audience_results_blue_sp", results.blue_sp_total ?? 0);
  setEl("audience_results_blue_cards", `${results.blue_yellow_cards ?? 0} / ${results.blue_red_cards ?? 0}`);

  // Takım rozetleri (match.red_alliance / blue_alliance)
  const redTeamsContainer = qs("audience_results_red_teams");
  const blueTeamsContainer = qs("audience_results_blue_teams");
  const esc = (typeof escapeHtml === "function") ? escapeHtml : (s) => String(s);
  if (redTeamsContainer) {
    const teams = match.red_alliance || [];
    redTeamsContainer.innerHTML = teams.map((t) => `<span class="team-badge">${esc(String(t))}</span>`).join("") || "-";
  }
  if (blueTeamsContainer) {
    const teams = match.blue_alliance || [];
    blueTeamsContainer.innerHTML = teams.map((t) => `<span class="team-badge">${esc(String(t))}</span>`).join("") || "-";
  }

  // Eleme/Final: "Bir sonraki maç" metinleri (payload'da varsa otomatik)
  const advRed = qs("audience_advancement_red");
  const advBlue = qs("audience_advancement_blue");
  if (advRed) {
    const text = results.advancement_red || payload.advancement_red || "";
    advRed.style.display = text ? "block" : "none";
    advRed.textContent = text ? `Bir sonraki: ${text}` : "";
  }
  if (advBlue) {
    const text = results.advancement_blue || payload.advancement_blue || "";
    advBlue.style.display = text ? "block" : "none";
    advBlue.textContent = text ? `Bir sonraki: ${text}` : "";
  }

  // QR / detaylı sonuç alanı (metin otomatik)
  const qrArea = qs("audience_qr_area");
  const qrLabel = qs("audience_qr_label");
  if (qrArea) qrArea.style.display = "block";
  if (qrLabel) qrLabel.textContent = `${getResultsSubtitleForMatch(match)} detaylı sonuçlar için tara`;

  if (typeof announceResults === "function") {
    announceResults(results);
  }
  return true;
}
