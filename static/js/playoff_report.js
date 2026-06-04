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
      const label = match.label ? `<div class="bracket-match-label">${escapeHtml(match.label)}</div>` : "";
      const redInfo = (match.red_alliance_info && match.red_alliance_info.length)
        ? match.red_alliance_info
        : (match.red_alliance || []).map((team) => ({ team }));
      const blueInfo = (match.blue_alliance_info && match.blue_alliance_info.length)
        ? match.blue_alliance_info
        : (match.blue_alliance || []).map((team) => ({ team }));
      const redTeams = redInfo.map((t) => {
        const seed = t.rank ? `#${t.rank}` : "";
        return `<div class="bracket-team"><span class="seed">${escapeHtml(seed)}</span>${escapeHtml(formatTeamLabel(t))}</div>`;
      }).join("");
      const blueTeams = blueInfo.map((t) => {
        const seed = t.rank ? `#${t.rank}` : "";
        return `<div class="bracket-team"><span class="seed">${escapeHtml(seed)}</span>${escapeHtml(formatTeamLabel(t))}</div>`;
      }).join("");
      return `
        <div class="bracket-match" data-index="${index}">
          ${label}
          ${redTeams || '<div class="bracket-team">-</div>'}
          <div class="bracket-vs">VS</div>
          ${blueTeams || '<div class="bracket-team">-</div>'}
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

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => loadPlayoffReport());
  }

  loadPlayoffReport();
  setInterval(loadPlayoffReport, REFRESH_INTERVAL_MS);
})();
