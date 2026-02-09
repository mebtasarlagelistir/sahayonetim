/**
 * Maç Sonuçları Raporu
 *
 * Tamamlanan maç sonuçlarını filtreleyip listelemek ve raporlamak için kullanılır.
 * Filtreleme büyük ölçüde istemci tarafında yapılır; böylece modüler ve esnek kalır.
 */
(function() {
  const qs = window.qs;

  const resultsTbody = qs("results_tbody");
  const lastUpdateEl = qs("last_update");
  const statusSelect = qs("filter_status");
  const typeSelect = qs("filter_type");
  const dateFromInput = qs("filter_date_from");
  const dateToInput = qs("filter_date_to");
  const fieldInput = qs("filter_field");
  const teamInput = qs("filter_team");

  const summaryTotal = qs("summary_total");
  const summaryRed = qs("summary_red");
  const summaryBlue = qs("summary_blue");
  const summaryTie = qs("summary_tie");
  const summaryAvg = qs("summary_avg");

  let cachedMatches = [];

  function formatDate(value) {
    if (!value) return "-";
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text.split("-").reverse().join(".");
    }
    return text;
  }

  function formatTime(value) {
    if (!value) return "-";
    const parts = String(value).trim().split(":");
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`;
    }
    return value;
  }

  function normalizeType(value) {
    const raw = (value || "").toString().trim().toLowerCase();
    return raw || "qualification";
  }

  function formatTypeLabel(value) {
    const normalized = normalizeType(value);
    if (normalized === "qualification") return "Sıralama";
    if (normalized === "elimination") return "Elimination";
    if (normalized === "final") return "Final";
    return normalized;
  }

  function getWinner(match) {
    const redScore = Number(match.red_score);
    const blueScore = Number(match.blue_score);
    if (!Number.isFinite(redScore) || !Number.isFinite(blueScore)) {
      return "-";
    }
    if (redScore > blueScore) return "Kırmızı";
    if (blueScore > redScore) return "Mavi";
    return "Berabere";
  }

  function matchesTeam(match, keyword) {
    if (!keyword) return true;
    const safeKeyword = keyword.toLowerCase();
    const teams = []
      .concat(match.red_alliance || [])
      .concat(match.blue_alliance || [])
      .map((item) => String(item).toLowerCase());
    return teams.some((team) => team.includes(safeKeyword));
  }

  function filterMatches(matches) {
    const statusValue = (statusSelect?.value || "completed").trim();
    const typeValue = (typeSelect?.value || "").trim().toLowerCase();
    const dateFrom = (dateFromInput?.value || "").trim();
    const dateTo = (dateToInput?.value || "").trim();
    const fieldValue = (fieldInput?.value || "").trim();
    const teamValue = (teamInput?.value || "").trim();

    return matches.filter((match) => {
      if (statusValue !== "all" && match.status !== statusValue) return false;
      if (typeValue && normalizeType(match.match_type) !== typeValue) return false;
      if (fieldValue && String(match.field_number || "") !== fieldValue) return false;
      if (dateFrom && (!match.match_date || match.match_date < dateFrom)) return false;
      if (dateTo && (!match.match_date || match.match_date > dateTo)) return false;
      if (!matchesTeam(match, teamValue)) return false;
      return true;
    });
  }

  function sortMatches(matches) {
    return matches.slice().sort((a, b) => {
      const dateA = a.match_date || "";
      const dateB = b.match_date || "";
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const timeA = a.match_time || "";
      const timeB = b.match_time || "";
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      const fieldA = a.field_number || 0;
      const fieldB = b.field_number || 0;
      if (fieldA !== fieldB) return fieldA - fieldB;
      return (a.match_number || 0) - (b.match_number || 0);
    });
  }

  function updateSummary(matches) {
    let redWins = 0;
    let blueWins = 0;
    let ties = 0;
    let totalScore = 0;
    let counted = 0;

    matches.forEach((match) => {
      const redScore = Number(match.red_score);
      const blueScore = Number(match.blue_score);
      if (Number.isFinite(redScore) && Number.isFinite(blueScore)) {
        totalScore += redScore + blueScore;
        counted += 1;
        if (redScore > blueScore) redWins += 1;
        else if (blueScore > redScore) blueWins += 1;
        else ties += 1;
      }
    });

    if (summaryTotal) summaryTotal.textContent = String(matches.length);
    if (summaryRed) summaryRed.textContent = String(redWins);
    if (summaryBlue) summaryBlue.textContent = String(blueWins);
    if (summaryTie) summaryTie.textContent = String(ties);
    if (summaryAvg) {
      const avg = counted > 0 ? (totalScore / counted).toFixed(1) : "0";
      summaryAvg.textContent = avg;
    }
  }

  function renderTable(matches) {
    if (!resultsTbody) return;
    if (matches.length === 0) {
      resultsTbody.innerHTML = "<tr><td colspan=\"11\" style=\"padding: 24px; text-align: center; color: #666;\">Seçilen filtrelere uygun maç bulunamadı.</td></tr>";
      updateSummary([]);
      return;
    }

    resultsTbody.innerHTML = matches.map((match) => {
      const redTeams = (match.red_alliance || []).join(", ");
      const blueTeams = (match.blue_alliance || []).join(", ");
      const redScore = match.red_score != null ? match.red_score : "-";
      const blueScore = match.blue_score != null ? match.blue_score : "-";
      const note = match.notes || "";
      return "<tr>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(String(match.match_number || "")) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(formatTypeLabel(match.match_type)) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee; text-align: center;\">" + escapeHtml(String(match.field_number || "")) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(formatDate(match.match_date)) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(formatTime(match.match_time)) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(redTeams) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee; text-align: center;\">" + escapeHtml(String(redScore)) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee; text-align: center;\">" + escapeHtml(String(blueScore)) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(blueTeams) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee; text-align: center;\">" + escapeHtml(getWinner(match)) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(note) + "</td>" +
        "</tr>";
    }).join("");

    updateSummary(matches);
  }

  function buildCsv(matches) {
    const headers = [
      "Maç No",
      "Tip",
      "Saha",
      "Tarih",
      "Saat",
      "Kırmızı İttifak",
      "Kırmızı Skor",
      "Mavi Skor",
      "Mavi İttifak",
      "Kazanan",
      "Not"
    ];
    const rows = matches.map((match) => [
      match.match_number ?? "",
      formatTypeLabel(match.match_type),
      match.field_number ?? "",
      match.match_date ?? "",
      match.match_time ?? "",
      (match.red_alliance || []).join(" "),
      match.red_score ?? "",
      match.blue_score ?? "",
      (match.blue_alliance || []).join(" "),
      getWinner(match),
      match.notes || ""
    ]);

    return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  }

  function downloadCsv(matches) {
    const csvContent = buildCsv(matches);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
    link.href = URL.createObjectURL(blob);
    link.download = `mac-sonuclari-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  async function fetchMatches() {
    const statusValue = (statusSelect?.value || "completed").trim();
    const typeValue = (typeSelect?.value || "").trim().toLowerCase();
    const fieldValue = (fieldInput?.value || "").trim();
    const dateFrom = (dateFromInput?.value || "").trim();
    const dateTo = (dateToInput?.value || "").trim();

    const params = {};
    if (statusValue !== "all") params.status = statusValue;
    if (typeValue) params.type = typeValue;
    if (fieldValue) params.field = fieldValue;
    if (dateFrom && dateTo && dateFrom === dateTo) params.date = dateFrom;

    return apiGet("/api/match-schedule", params);
  }

  async function loadReport() {
    if (!resultsTbody) return;
    resultsTbody.innerHTML = "<tr><td colspan=\"11\" style=\"padding: 24px; text-align: center; color: #888;\">Yükleniyor...</td></tr>";
    try {
      cachedMatches = await fetchMatches();
      const filtered = sortMatches(filterMatches(cachedMatches || []));
      renderTable(filtered);
      if (lastUpdateEl) {
        lastUpdateEl.textContent = "Son güncelleme: " + new Date().toLocaleTimeString("tr-TR");
      }
    } catch (error) {
      resultsTbody.innerHTML = "<tr><td colspan=\"11\" style=\"padding: 24px; text-align: center; color: #c00;\">Veri alınamadı.</td></tr>";
      showToast(error.message || "Rapor yüklenemedi", "error");
      updateSummary([]);
    }
  }

  function resetFilters() {
    if (statusSelect) statusSelect.value = "completed";
    if (typeSelect) typeSelect.value = "";
    if (dateFromInput) dateFromInput.value = "";
    if (dateToInput) dateToInput.value = "";
    if (fieldInput) fieldInput.value = "";
    if (teamInput) teamInput.value = "";
  }

  const applyButton = qs("apply_filters");
  if (applyButton) {
    applyButton.addEventListener("click", () => {
      if (!validateDates(dateFromInput?.value, dateToInput?.value)) return;
      loadReport();
    });
  }

  const clearButton = qs("clear_filters");
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      resetFilters();
      loadReport();
    });
  }

  const exportButton = qs("export_csv");
  if (exportButton) {
    exportButton.addEventListener("click", () => {
      const filtered = sortMatches(filterMatches(cachedMatches || []));
      if (!filtered.length) {
        showToast("CSV için veri bulunamadı", "warning");
        return;
      }
      downloadCsv(filtered);
    });
  }

  const printButton = qs("print_report");
  if (printButton) {
    printButton.addEventListener("click", () => {
      window.print();
    });
  }

  loadReport();
})();
