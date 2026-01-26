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
      // SSE'yi durdur (preview gösterilirken)
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
  
  qs("audience_state_label").textContent = "Önizleme";
  qs("audience_timer_value").textContent = "--:--";
  qs("audience_red_score").textContent = "0";
  qs("audience_blue_score").textContent = "0";
  qs("audience_red_teams").textContent = formatTeamsWithRank(match.red_alliance, rankings);
  qs("audience_blue_teams").textContent = formatTeamsWithRank(match.blue_alliance, rankings);
  qs("audience_match_meta").textContent = `${match.match_type || ""} • Saha ${match.field_number || "-"}`;
  const next = qs("audience_next_match");
  if (next) {
    next.textContent = `Sıradaki: ${match.match_number} • ${match.match_date} ${match.match_time}`;
  }
  
  // SSE'yi durdur (preview gösterilirken)
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
  
  // Maç adı (match name)
  const matchNameEl = qs("vs_match_name");
  if (matchNameEl) {
    const matchTypeLabel = matchTypeLabels[match.match_type] || match.match_type || "Maç";
    const matchNumber = match.match_number || "0";
    matchNameEl.textContent = `${matchTypeLabel} ${matchNumber}`;
  }
  
  // Maç türü
  const matchTypeEl = qs("vs_match_type");
  if (matchTypeEl) {
    matchTypeEl.textContent = matchTypeLabels[match.match_type] || match.match_type || "Maç";
  }
  
  // Maç numarası
  const matchNumberEl = qs("vs_match_number");
  if (matchNumberEl) {
    matchNumberEl.textContent = `#${match.match_number || "0"}`;
  }
  
  // Saha bilgisi
  const fieldSeparatorEl = qs("vs_field_separator");
  const fieldEl = qs("vs_match_field");
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
  if (redTeamsEl && match.red_alliance && Array.isArray(match.red_alliance)) {
    redTeamsEl.innerHTML = match.red_alliance.map(teamNum => {
      const team = teams[String(teamNum)] || {};
      return `
        <div class="vs-team-card">
          <div class="vs-team-number">${teamNum}</div>
          <div class="vs-team-name">${team.name || "Takım"}</div>
          <div class="vs-team-school">${team.school || ""}</div>
        </div>
      `;
    }).join("");
  } else {
    console.warn("Kırmızı ittifak takımları bulunamadı");
  }
  
  // Mavi ittifak takımlarını göster
  const blueTeamsEl = qs("vs_blue_teams");
  if (blueTeamsEl && match.blue_alliance && Array.isArray(match.blue_alliance)) {
    if (match.blue_alliance.length > 0) {
      blueTeamsEl.innerHTML = match.blue_alliance.map(teamNum => {
        const team = teams[String(teamNum)] || {};
        return `
          <div class="vs-team-card">
            <div class="vs-team-number">${teamNum}</div>
            <div class="vs-team-name">${team.name || "Takım"}</div>
            <div class="vs-team-school">${team.school || ""}</div>
          </div>
        `;
      }).join("");
    } else {
      blueTeamsEl.innerHTML = "<div class='vs-team-card'><div class='vs-team-number'>-</div><div class='vs-team-name'>Takım yok</div></div>";
      console.warn("Mavi ittifak takımları boş");
    }
  } else {
    console.warn("Mavi ittifak takımları bulunamadı - element veya alliance yok", { 
      blueTeamsEl: !!blueTeamsEl, 
      blue_alliance: match.blue_alliance 
    });
    if (blueTeamsEl) {
      blueTeamsEl.innerHTML = "<div class='vs-team-card'><div class='vs-team-number'>-</div><div class='vs-team-name'>Yükleniyor...</div></div>";
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
 * Results payload'ı uygular
 * 
 * @param {Object} payload - Results payload objesi
 * @returns {boolean} - Başarılı olursa true
 */
function applyResultsPayload(payload) {
  const match = payload?.match || null;
  const results = payload?.results || null;
  if (!match || !results) return false;
  
  qs("audience_state_label").textContent = "Maç Sonucu";
  qs("audience_timer_value").textContent = "BİTTİ";
  qs("audience_red_score").textContent = results.red_score ?? 0;
  qs("audience_blue_score").textContent = results.blue_score ?? 0;
  qs("audience_red_teams").textContent = (match.red_alliance || []).join(", ") || "-";
  qs("audience_blue_teams").textContent = (match.blue_alliance || []).join(", ") || "-";
  qs("audience_match_meta").textContent = `${match.match_type || ""} • Saha ${match.field_number || "-"}`;
  qs("audience_next_match").textContent = "";

  const panel = qs("audience_results");
  if (panel) panel.style.display = "block";
  qs("audience_results_winner").textContent = results.winner || "-";
  qs("audience_results_blue_total").textContent = results.blue_score ?? 0;
  qs("audience_results_blue_auto").textContent = results.blue_auto_total ?? 0;
  qs("audience_results_blue_teleop").textContent = results.blue_teleop_total ?? 0;
  qs("audience_results_blue_penalty").textContent = results.blue_penalty_total ?? 0;
  qs("audience_results_blue_sp").textContent = results.blue_sp_total ?? 0;
  qs("audience_results_blue_yellow").textContent = results.blue_yellow_cards ?? 0;
  qs("audience_results_blue_red").textContent = results.blue_red_cards ?? 0;
  qs("audience_results_red_total").textContent = results.red_score ?? 0;
  qs("audience_results_red_auto").textContent = results.red_auto_total ?? 0;
  qs("audience_results_red_teleop").textContent = results.red_teleop_total ?? 0;
  qs("audience_results_red_penalty").textContent = results.red_penalty_total ?? 0;
  qs("audience_results_red_sp").textContent = results.red_sp_total ?? 0;
  qs("audience_results_red_yellow").textContent = results.red_yellow_cards ?? 0;
  qs("audience_results_red_red").textContent = results.red_red_cards ?? 0;

  if (typeof announceResults === "function") {
    announceResults(results);
  }
  return true;
}
