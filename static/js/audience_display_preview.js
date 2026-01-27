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
  
  // Güvenli DOM güncellemeleri (element kontrolü ile)
  const matchNameEl = qs("vs_match_name");
  const matchTypeEl = qs("vs_match_type");
  const matchNumberEl = qs("vs_match_number");
  const fieldSeparatorEl = qs("vs_field_separator");
  const fieldEl = qs("vs_match_field");
  
  if (matchNameEl) {
    const matchTypeLabel = matchTypeLabels[match.match_type] || match.match_type || "Maç";
    const matchNumber = match.match_number || "0";
    matchNameEl.textContent = `${matchTypeLabel} ${matchNumber}`;
  }
  
  if (matchTypeEl) {
    matchTypeEl.textContent = matchTypeLabels[match.match_type] || match.match_type || "Maç";
  }
  
  if (matchNumberEl) {
    matchNumberEl.textContent = `#${match.match_number || "0"}`;
  }
  
  // Saha bilgisi
  if (match.field_number) {
    if (fieldSeparatorEl) fieldSeparatorEl.style.display = "inline";
    if (fieldEl) {
      fieldEl.style.display = "inline";
      fieldEl.textContent = `Saha ${match.field_number}`;
    }
  } else {
    if (fieldSeparatorEl) fieldSeparatorEl.style.display = "none";
    if (fieldEl) fieldEl.style.display = "none";
  }
  
  // Kırmızı ittifak takımlarını göster
  const redTeamsEl = qs("vs_red_teams");
  if (redTeamsEl) {
    if (match.red_alliance && Array.isArray(match.red_alliance) && match.red_alliance.length > 0) {
      try {
        redTeamsEl.innerHTML = match.red_alliance.map(teamNum => {
          const team = teams[String(teamNum)] || {};
          const teamName = (team.name || "Takım").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const teamSchool = (team.school || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          return `
            <div class="vs-team-card">
              <div class="vs-team-number">${teamNum}</div>
              <div class="vs-team-name">${teamName}</div>
              <div class="vs-team-school">${teamSchool}</div>
            </div>
          `;
        }).join("");
      } catch (err) {
        console.error("VS Preview: Kırmızı takımlar render hatası:", err);
        redTeamsEl.innerHTML = "<div class='vs-team-card'><div class='vs-team-name'>Hata</div></div>";
      }
    } else {
      redTeamsEl.innerHTML = "<div class='vs-team-card'><div class='vs-team-number'>-</div><div class='vs-team-name'>Takım yok</div></div>";
      console.warn("VS Preview: Kırmızı ittifak takımları bulunamadı veya boş");
    }
  } else {
    console.error("VS Preview: vs_red_teams elementi bulunamadı");
  }
  
  // Mavi ittifak takımlarını göster
  const blueTeamsEl = qs("vs_blue_teams");
  if (blueTeamsEl) {
    if (match.blue_alliance && Array.isArray(match.blue_alliance) && match.blue_alliance.length > 0) {
      try {
        blueTeamsEl.innerHTML = match.blue_alliance.map(teamNum => {
          const team = teams[String(teamNum)] || {};
          const teamName = (team.name || "Takım").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const teamSchool = (team.school || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          return `
            <div class="vs-team-card">
              <div class="vs-team-number">${teamNum}</div>
              <div class="vs-team-name">${teamName}</div>
              <div class="vs-team-school">${teamSchool}</div>
            </div>
          `;
        }).join("");
      } catch (err) {
        console.error("VS Preview: Mavi takımlar render hatası:", err);
        blueTeamsEl.innerHTML = "<div class='vs-team-card'><div class='vs-team-name'>Hata</div></div>";
      }
    } else {
      blueTeamsEl.innerHTML = "<div class='vs-team-card'><div class='vs-team-number'>-</div><div class='vs-team-name'>Takım yok</div></div>";
      console.warn("VS Preview: Mavi ittifak takımları bulunamadı veya boş");
    }
  } else {
    console.error("VS Preview: vs_blue_teams elementi bulunamadı");
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
 * Results payload'ı uygular
 * 
 * @param {Object} payload - Results payload objesi
 * @returns {boolean} - Başarılı olursa true
 */
function applyResultsPayload(payload) {
  const match = payload?.match || null;
  const results = payload?.results || null;
  if (!match || !results) {
    console.warn("applyResultsPayload: match veya results yok");
    return false;
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
  
  if (stateLabel) stateLabel.textContent = "Maç Sonucu";
  if (timerValue) timerValue.textContent = "BİTTİ";
  if (redScore) redScore.textContent = results.red_score ?? 0;
  if (blueScore) blueScore.textContent = results.blue_score ?? 0;
  if (redTeams) redTeams.textContent = (match.red_alliance || []).join(", ") || "-";
  if (blueTeams) blueTeams.textContent = (match.blue_alliance || []).join(", ") || "-";
  if (matchMeta) matchMeta.textContent = `${match.match_type || ""} • Saha ${match.field_number || "-"}`;
  if (nextMatch) nextMatch.textContent = "";

  const panel = qs("audience_results");
  if (panel) {
    panel.style.display = "block";
    
    // Results panel elementleri (güvenli güncelleme)
    const winner = qs("audience_results_winner");
    const blueTotal = qs("audience_results_blue_total");
    const blueAuto = qs("audience_results_blue_auto");
    const blueTeleop = qs("audience_results_blue_teleop");
    const bluePenalty = qs("audience_results_blue_penalty");
    const blueSp = qs("audience_results_blue_sp");
    const blueYellow = qs("audience_results_blue_yellow");
    const blueRed = qs("audience_results_blue_red");
    const redTotal = qs("audience_results_red_total");
    const redAuto = qs("audience_results_red_auto");
    const redTeleop = qs("audience_results_red_teleop");
    const redPenalty = qs("audience_results_red_penalty");
    const redSp = qs("audience_results_red_sp");
    const redYellow = qs("audience_results_red_yellow");
    const redRed = qs("audience_results_red_red");
    
    if (winner) winner.textContent = results.winner || "-";
    if (blueTotal) blueTotal.textContent = results.blue_score ?? 0;
    if (blueAuto) blueAuto.textContent = results.blue_auto_total ?? 0;
    if (blueTeleop) blueTeleop.textContent = results.blue_teleop_total ?? 0;
    if (bluePenalty) bluePenalty.textContent = results.blue_penalty_total ?? 0;
    if (blueSp) blueSp.textContent = results.blue_sp_total ?? 0;
    if (blueYellow) blueYellow.textContent = results.blue_yellow_cards ?? 0;
    if (blueRed) blueRed.textContent = results.blue_red_cards ?? 0;
    if (redTotal) redTotal.textContent = results.red_score ?? 0;
    if (redAuto) redAuto.textContent = results.red_auto_total ?? 0;
    if (redTeleop) redTeleop.textContent = results.red_teleop_total ?? 0;
    if (redPenalty) redPenalty.textContent = results.red_penalty_total ?? 0;
    if (redSp) redSp.textContent = results.red_sp_total ?? 0;
    if (redYellow) redYellow.textContent = results.red_yellow_cards ?? 0;
    if (redRed) redRed.textContent = results.red_red_cards ?? 0;
  }

  if (typeof announceResults === "function") {
    announceResults(results);
  }
  return true;
}
