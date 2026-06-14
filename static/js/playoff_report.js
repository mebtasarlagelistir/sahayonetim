/**
 * Playoff Eşleşme Raporu Modülü
 *
 * Seyirci ve takımlar için playoff eşleşmelerini gösterir.
 * Public endpoint üzerinden veri çeker ve periyodik günceller.
 */

(function() {
  const REFRESH_INTERVAL_MS = 30000;

  const summaryEl = qs("playoff_summary");
  const bracketEl = qs("playoff_bracket");
  const rankingsTbody = qs("playoff_rankings_tbody");
  const lastUpdateEl = qs("playoff_last_update");
  const completedCountEl = qs("playoff_completed_count");
  const eventNameEl = qs("playoff_event_name");
  const refreshBtn = qs("playoff_refresh");
  const printBracketBtn = qs("playoff_print_bracket");
  const printScheduleBtn = qs("playoff_print_schedule");

  // Yazdırma çıktıları (canlı anlık görüntü) için son veriyi sakla
  let latestData = null;

  function formatTeamLabel(teamInfo) {
    if (!teamInfo) return "-";
    const number = teamInfo.team || "";
    const name = teamInfo.name || "";
    if (name) {
      return `${number} - ${name}`;
    }
    return String(number || "-");
  }

  function renderSummary(data) {
    if (!summaryEl) return;
    if (!data?.ok) {
      summaryEl.textContent = data?.error || "Rapor hazır değil.";
      return;
    }
    const info = data.bracket_info || {};
    const format = info.format || "single_elimination";
    const totalTeams = info.total_teams ?? 0;
    const teamsPerAlliance = info.teams_per_alliance ?? data.teams_per_alliance ?? 2;
    const teamsPerMatch = info.teams_per_match ?? (teamsPerAlliance * 2);
    const numMatches = info.num_matches ?? 0;
    const eventCode = data.event?.code ? ` • ${data.event.code}` : "";
    summaryEl.textContent = `Format: ${format} • Takım: ${totalTeams} • İttifak: ${teamsPerAlliance} • Maç: ${numMatches}${eventCode}`;
    if (eventNameEl) {
      eventNameEl.textContent = data.event?.name || "Etkinlik";
    }
  }

  function renderBracket(data) {
    if (!bracketEl) return;
    if (!data?.ok) {
      bracketEl.innerHTML = `<div class="empty-state">${escapeHtml(data?.error || "Eşleşmeler hazır değil.")}</div>`;
      return;
    }
    const rounds = data.bracket_rounds || [];
    const matches = data.bracket_matches || [];
    if ((rounds.length === 0) && matches.length === 0) {
      bracketEl.innerHTML = `<div class="empty-state">Eşleşme bulunamadı. Yeterli takım olmayabilir.</div>`;
      return;
    }

    const buildMatchCard = (match, index, isPlaceholder = false) => {
      if (isPlaceholder) {
        const phLabel = (match && match.label) ? `<div class="bracket-match-label">${escapeHtml(match.label)}</div>` : "";
        return `
          <div class="bracket-match is-placeholder">
            ${phLabel}
            <div class="bracket-team muted">Kazanan Bekleniyor</div>
            <div class="bracket-vs">VS</div>
            <div class="bracket-team muted">Kazanan Bekleniyor</div>
          </div>
        `;
      }
      const time = match.match_time ? `<span class="bracket-match-time">${escapeHtml(match.match_time)}</span>` : "";
      const label = (match.label || time)
        ? `<div class="bracket-match-label">${escapeHtml(match.label || "")}${time}</div>` : "";
      const redInfo = (match.red_alliance_info && match.red_alliance_info.length)
        ? match.red_alliance_info
        : (match.red_alliance || []).map((team) => ({ team }));
      const blueInfo = (match.blue_alliance_info && match.blue_alliance_info.length)
        ? match.blue_alliance_info
        : (match.blue_alliance || []).map((team) => ({ team }));
      const played = (match.status === "completed");
      const winCls = (side) => played && match.winner === side ? " is-winner"
        : (played && match.winner && match.winner !== "tie" ? " is-loser" : "");
      const scoreTag = (side, val) =>
        played ? `<span class="bracket-score${match.winner === side ? " win" : ""}">${escapeHtml(String(val ?? 0))}</span>` : "";
      const redTeams = redInfo.map((t) => {
        const seed = t.rank ? `#${t.rank}` : "";
        return `<div class="bracket-team"><span class="seed">${escapeHtml(seed)}</span>${escapeHtml(formatTeamLabel(t))}</div>`;
      }).join("");
      const blueTeams = blueInfo.map((t) => {
        const seed = t.rank ? `#${t.rank}` : "";
        return `<div class="bracket-team"><span class="seed">${escapeHtml(seed)}</span>${escapeHtml(formatTeamLabel(t))}</div>`;
      }).join("");
      const statusBadge = played
        ? `<div class="bracket-status done">${match.winner === "tie" ? "Berabere" : "Tamamlandı"}</div>`
        : (match.status === "in_progress" ? `<div class="bracket-status live">● Canlı</div>` : "");
      return `
        <div class="bracket-match${played ? " is-played" : ""}" data-index="${index}">
          ${label}
          <div class="bracket-side red${winCls("red")}">
            <div class="bracket-side-teams">${redTeams || '<div class="bracket-team">-</div>'}</div>
            ${scoreTag("red", match.red_score)}
          </div>
          <div class="bracket-vs">VS</div>
          <div class="bracket-side blue${winCls("blue")}">
            <div class="bracket-side-teams">${blueTeams || '<div class="bracket-team">-</div>'}</div>
            ${scoreTag("blue", match.blue_score)}
          </div>
          ${statusBadge}
        </div>
      `;
    };

    let roundColumns = [];
    if (rounds.length > 0) {
      roundColumns = rounds.map((round, roundIndex) => {
        const cards = (round.matches || []).map((match, index) => {
          const isPlaceholder = !match.red_alliance?.length && !match.blue_alliance?.length;
          return buildMatchCard(match, index, isPlaceholder);
        });
        return `
          <div class="bracket-round" data-round="${roundIndex + 1}">
            <div class="bracket-round-title">${escapeHtml(round.name || `${roundIndex + 1}. Tur`)}</div>
            <div class="bracket-round-body">
              ${cards.join("")}
            </div>
          </div>
        `;
      });
    } else {
      // Fallback: Eski veri formatı
      const totalMatches = matches.length;
      let roundsCount = 1;
      let tmp = totalMatches;
      while (tmp > 1) {
        roundsCount += 1;
        tmp = Math.floor(tmp / 2);
      }
      const roundTitles = ["1. Tur", "2. Tur", "Yarı Final", "Final"];
      for (let roundIndex = 0; roundIndex < roundsCount; roundIndex += 1) {
        const isFirst = roundIndex === 0;
        const matchCount = Math.max(1, Math.ceil(totalMatches / Math.pow(2, roundIndex)));
        const title = roundTitles[roundIndex] || `${roundIndex + 1}. Tur`;
        const cards = [];
        if (isFirst) {
          matches.forEach((match, index) => {
            cards.push(buildMatchCard(match, index, false));
          });
        } else {
          for (let i = 0; i < matchCount; i += 1) {
            cards.push(buildMatchCard({}, i, true));
          }
        }
        roundColumns.push(`
          <div class="bracket-round" data-round="${roundIndex + 1}">
            <div class="bracket-round-title">${escapeHtml(title)}</div>
            <div class="bracket-round-body">
              ${cards.join("")}
            </div>
          </div>
        `);
      }
    }

    bracketEl.innerHTML = `
      <div class="playoff-bracket-shell">
        ${roundColumns.join("")}
      </div>
    `;
  }

  function renderRankings(data) {
    if (!rankingsTbody) return;
    if (!data?.ok) {
      rankingsTbody.innerHTML = `<tr><td colspan="9" style="padding: 24px; text-align: center; color: #c00;">${escapeHtml(data?.error || "Veri alınamadı.")}</td></tr>`;
      return;
    }
    const rankings = data.rankings || [];
    const teamsPerAlliance = data.teams_per_alliance ?? 2;
    const numMatches = data.bracket_info?.num_matches ?? 0;
    const maxTeams = numMatches * teamsPerAlliance * 2;
    const shownRankings = maxTeams ? rankings.slice(0, maxTeams) : rankings;

    if (!shownRankings.length) {
      rankingsTbody.innerHTML = `<tr><td colspan="9" style="padding: 24px; text-align: center; color: #666;">Henüz sıralama verisi yok.</td></tr>`;
      return;
    }
    rankingsTbody.innerHTML = shownRankings.map((r) => {
      const detail = r.ranking_points_detail || {};
      return `
        <tr>
          <td style="padding: 8px; border: 1px solid #e1e4ee;">${escapeHtml(String(r.rank || ""))}</td>
          <td style="padding: 8px; border: 1px solid #e1e4ee;"><strong>${escapeHtml(String(r.team || ""))}</strong></td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; text-align: center;">${escapeHtml(String(r.total_sp ?? ""))}</td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; text-align: center;">${escapeHtml(String(detail.result ?? ""))}</td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; text-align: center;">${escapeHtml(String(detail.climb ?? ""))}</td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; text-align: center;">${escapeHtml(String(detail.auto ?? ""))}</td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; text-align: center;">${escapeHtml(String(r.wins ?? ""))}</td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; text-align: center;">${escapeHtml(String(r.ties ?? ""))}</td>
          <td style="padding: 8px; border: 1px solid #e1e4ee; text-align: center;">${escapeHtml(String(r.matches_played ?? ""))}</td>
        </tr>
      `;
    }).join("");
  }

  async function loadPlayoffReport() {
    try {
      const data = await apiGet("/api/public/playoff-bracket");
      latestData = data;
      renderSummary(data);
      renderBracket(data);
      renderRankings(data);
      if (lastUpdateEl) {
        lastUpdateEl.textContent = `Son güncelleme: ${new Date().toLocaleTimeString("tr-TR")}`;
      }
      if (completedCountEl) {
        completedCountEl.textContent = `Tamamlanan maç: ${data?.completed_count ?? 0}`;
      }
    } catch (err) {
      const fallback = { ok: false, error: "Rapor yüklenemedi." };
      renderSummary(fallback);
      renderBracket(fallback);
      renderRankings(fallback);
    }
  }

  // ==========================================================================
  // YAZDIRMA ÇIKTILARI (canlı anlık görüntü)
  // ==========================================================================

  function openPrintWindow(title, bodyHtml) {
    const w = window.open("", "_blank");
    if (!w) {
      if (typeof showToast === "function") showToast("Yazdırma penceresi açılamadı (popup engellenmiş olabilir)", "warning");
      return;
    }
    const eventName = (latestData && latestData.event && latestData.event.name) || "Etkinlik";
    const stamp = new Date().toLocaleString("tr-TR");
    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, "Segoe UI", sans-serif; color: #111; margin: 0; }
        .ph { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #111; padding-bottom:6px; margin-bottom:12px; }
        .ph h1 { font-size: 18px; margin: 0; }
        .ph .meta { font-size: 11px; color:#444; text-align:right; }
        h2.round-title { font-size: 13px; margin: 14px 0 6px; background:#111; color:#fff; padding:4px 8px; }
        .pcols { display:flex; gap:16px; align-items:flex-start; }
        .pcol { flex:1; }
        .pmatch { border:1.5px solid #111; border-radius:6px; margin-bottom:10px; padding:6px 8px; page-break-inside: avoid; }
        .pmatch .lbl { font-weight:bold; font-size:12px; display:flex; justify-content:space-between; margin-bottom:4px; }
        .pmatch .lbl .t { font-weight:normal; color:#444; }
        .side { display:flex; justify-content:space-between; align-items:center; padding:3px 6px; border-radius:4px; margin:2px 0; font-size:12px; }
        .side.red { background:#fdecec; border-left:5px solid #dc3545; }
        .side.blue { background:#e9f1ff; border-left:5px solid #0d6efd; }
        .side.win { outline:2px solid #1a9e3a; font-weight:bold; }
        .side .sc { font-weight:bold; min-width:28px; text-align:right; }
        .side.win .sc { color:#1a9e3a; }
        .seed { color:#666; font-size:10px; margin-right:4px; }
        table.sched { width:100%; border-collapse:collapse; font-size:12px; }
        table.sched th, table.sched td { border:1px solid #333; padding:6px 8px; text-align:left; }
        table.sched th { background:#111; color:#fff; }
        table.sched tr.done { background:#f0f7f0; }
        table.sched .win { font-weight:bold; color:#1a9e3a; }
        .legend { font-size:10px; color:#555; margin-top:10px; }
        @media print { .noprint { display:none; } }
      </style></head><body>
      <div class="ph"><h1>${escapeHtml(title)}</h1>
        <div class="meta">${escapeHtml(eventName)}<br/>${escapeHtml(stamp)}</div></div>
      ${bodyHtml}
      <div class="legend">🟩 Kalın çerçeve = kazanan ittifak · Skorlar tamamlanan maçlardan alınmıştır.</div>
      <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };<\/script>
      </body></html>`);
    w.document.close();
  }

  function allianceLine(info, fallback) {
    const list = (info && info.length) ? info : (fallback || []).map((t) => ({ team: t }));
    if (!list.length) return '<span style="color:#888;">— Bekleniyor —</span>';
    return list.map((t) => {
      const seed = t.rank ? `<span class="seed">#${escapeHtml(String(t.rank))}</span>` : "";
      return `${seed}${escapeHtml(formatTeamLabel(t))}`;
    }).join(" &nbsp;+&nbsp; ");
  }

  function printBracketSheet() {
    const data = latestData;
    if (!data || !data.ok || !(data.bracket_rounds || []).length) {
      if (typeof showToast === "function") showToast("Yazdırılacak bracket verisi yok", "warning");
      return;
    }
    const cols = (data.bracket_rounds || []).map((round) => {
      const matches = (round.matches || []).map((m) => {
        const played = m.status === "completed";
        const redWin = played && m.winner === "red" ? " win" : "";
        const blueWin = played && m.winner === "blue" ? " win" : "";
        const time = m.match_time ? `<span class="t">${escapeHtml(m.match_time)}</span>` : "";
        return `<div class="pmatch">
          <div class="lbl"><span>${escapeHtml(m.label || ("M" + (m.match_number || "")))}</span>${time}</div>
          <div class="side red${redWin}"><span>${allianceLine(m.red_alliance_info, m.red_alliance)}</span><span class="sc">${played ? escapeHtml(String(m.red_score ?? 0)) : ""}</span></div>
          <div class="side blue${blueWin}"><span>${allianceLine(m.blue_alliance_info, m.blue_alliance)}</span><span class="sc">${played ? escapeHtml(String(m.blue_score ?? 0)) : ""}</span></div>
        </div>`;
      }).join("");
      return `<div class="pcol"><h2 class="round-title">${escapeHtml(round.name || "")}</h2>${matches}</div>`;
    }).join("");
    openPrintWindow("Playoff Bracket — Çift Eleme", `<div class="pcols">${cols}</div>`);
  }

  function printSchedule() {
    const data = latestData;
    if (!data || !data.ok || !(data.bracket_rounds || []).length) {
      if (typeof showToast === "function") showToast("Yazdırılacak çizelge verisi yok", "warning");
      return;
    }
    const roundNameByMatch = {};
    const all = [];
    (data.bracket_rounds || []).forEach((round) => {
      (round.matches || []).forEach((m) => {
        roundNameByMatch[m.match_number] = round.name || "";
        all.push(m);
      });
    });
    all.sort((a, b) => {
      const ta = a.match_time || "", tb = b.match_time || "";
      if (ta && tb && ta !== tb) return ta < tb ? -1 : 1;
      return (a.match_number || 0) - (b.match_number || 0);
    });
    const rows = all.map((m) => {
      const played = m.status === "completed";
      const redWin = played && m.winner === "red" ? "win" : "";
      const blueWin = played && m.winner === "blue" ? "win" : "";
      const scoreCell = played ? `${escapeHtml(String(m.red_score ?? 0))} - ${escapeHtml(String(m.blue_score ?? 0))}` : "—";
      return `<tr class="${played ? "done" : ""}">
        <td>${escapeHtml(m.match_time || "—")}</td>
        <td><strong>${escapeHtml(m.label || ("M" + (m.match_number || "")))}</strong></td>
        <td>${escapeHtml(roundNameByMatch[m.match_number] || "")}</td>
        <td class="${redWin}">${allianceLine(m.red_alliance_info, m.red_alliance)}</td>
        <td class="${blueWin}">${allianceLine(m.blue_alliance_info, m.blue_alliance)}</td>
        <td>${scoreCell}</td>
        <td>${m.field_number != null ? escapeHtml(String(m.field_number)) : ""}</td>
      </tr>`;
    }).join("");
    const body = `<table class="sched">
      <thead><tr><th>Saat</th><th>Maç</th><th>Tur</th><th>Kırmızı İttifak</th><th>Mavi İttifak</th><th>Skor</th><th>Saha</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    openPrintWindow("Playoff Zaman Çizelgesi", body);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => loadPlayoffReport());
  }
  if (printBracketBtn) {
    printBracketBtn.addEventListener("click", printBracketSheet);
  }
  if (printScheduleBtn) {
    printScheduleBtn.addEventListener("click", printSchedule);
  }

  loadPlayoffReport();
  setInterval(loadPlayoffReport, REFRESH_INTERVAL_MS);
})();
