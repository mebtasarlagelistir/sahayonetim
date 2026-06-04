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
    if (raw === "practice") return "practice";
    return raw || "qualification";
  }

  /** Kademe/tip etiketini Türkçe döndürür (tablo ve CSV için). */
  function formatTypeLabel(value) {
    const normalized = normalizeType(value);
    if (normalized === "practice") return "Deneme";
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

  /**
   * Maçın scoring_data'sından puan kırılımı özeti döndürür.
   * calculated_scores: otonom, teleop, ceza, toplam; ranking_points: SP (result, climb, auto, total).
   */
  function getBreakdownSummary(match) {
    const sd = match.scoring_data;
    if (!sd || typeof sd !== "object") return null;
    const calc = sd.calculated_scores || {};
    const rp = sd.ranking_points || {};
    const redCalc = calc.red || {};
    const blueCalc = calc.blue || {};
    const redB = redCalc.breakdown || {};
    const blueB = blueCalc.breakdown || {};
    const sum = (obj) => (obj && typeof obj === "object" ? Object.values(obj).reduce((a, v) => a + (Number(v) || 0), 0) : 0);
    const redAuto = redCalc.autonomous_total ?? sum(redB.autonomous);
    const redTeleop = redCalc.teleop_total ?? sum(redB.teleop);
    const redPenalty = redCalc.penalty_total ?? sum(redB.penalties);
    const blueAuto = blueCalc.autonomous_total ?? sum(blueB.autonomous);
    const blueTeleop = blueCalc.teleop_total ?? sum(blueB.teleop);
    const bluePenalty = blueCalc.penalty_total ?? sum(blueB.penalties);
    const redRp = rp.red || {};
    const blueRp = rp.blue || {};
    return {
      red: {
        autonomous_total: redAuto,
        teleop_total: redTeleop,
        penalty_total: redPenalty,
        total_score: redCalc.total_score ?? match.red_score,
        sp_result: redRp.result ?? "",
        sp_climb: redRp.climb ?? "",
        sp_auto: redRp.auto ?? "",
        sp_total: redRp.total ?? ""
      },
      blue: {
        autonomous_total: blueAuto,
        teleop_total: blueTeleop,
        penalty_total: bluePenalty,
        total_score: blueCalc.total_score ?? match.blue_score,
        sp_result: blueRp.result ?? "",
        sp_climb: blueRp.climb ?? "",
        sp_auto: blueRp.auto ?? "",
        sp_total: blueRp.total ?? ""
      }
    };
  }

  /**
   * Hakem panelindeki alan sırası ve Türkçe etiketler (Seviye 1, Seviye 2 vb. aynı yapı).
   * Her öğe: [scoring_data anahtarı, etiket]
   */
  var REFEREE_BREAKDOWN_FIELDS = [
    ["auto_leave_r1", "Başlangıç terk R1"],
    ["auto_leave_r2", "Başlangıç terk R2"],
    ["auto_bent1_own", "Bent Seviye 1 (Kendi)"],
    ["auto_bent1_opponent", "Bent Seviye 1 (Rakip alan)"],
    ["auto_bent2_correct", "Bent Seviye 2 (Doğru)"],
    ["auto_bent2_wrong", "Bent Seviye 2 (Yanlış)"],
    ["auto_bent2_opponent", "Bent Seviye 2 (Rakip alan)"],
    ["auto_bent3_correct", "Bent Seviye 3 (Doğru)"],
    ["auto_bent3_wrong", "Bent Seviye 3 (Yanlış)"],
    ["auto_bent3_opponent", "Bent Seviye 3 (Rakip alan)"],
    ["auto_tank_own", "Sarnıçlar otonom (Kendi)"],
    ["auto_tank_opponent", "Sarnıçlar otonom (Rakip alan)"],
    ["teleop_bent1_own", "Bent Seviye 1 SKS (Kendi)"],
    ["teleop_bent1_opponent", "Bent Seviye 1 SKS (Rakip alan)"],
    ["teleop_bent2_correct", "Bent Seviye 2 SKS (Doğru)"],
    ["teleop_bent2_wrong", "Bent Seviye 2 SKS (Yanlış)"],
    ["teleop_bent2_opponent", "Bent Seviye 2 SKS (Rakip alan)"],
    ["teleop_bent3_correct", "Bent Seviye 3 SKS (Doğru)"],
    ["teleop_bent3_wrong", "Bent Seviye 3 SKS (Yanlış)"],
    ["teleop_bent3_opponent", "Bent Seviye 3 SKS (Rakip alan)"],
    ["teleop_tank_own", "Sarnıçlar SKS (Kendi)"],
    ["teleop_tank_opponent", "Sarnıçlar SKS (Rakip alan)"],
    ["teleop_source_entry", "Kaynaktan giriş"],
    ["teleop_climb", "Su kemerine tırmanma (robot sayısı)"],
    ["yellow_card", "Sarı kart"],
    ["major_penalty", "Major penalty"]
  ];

  function formatBreakdownValue(val, key) {
    if (val === undefined || val === null) return "-";
    if (key === "auto_leave_r1" || key === "auto_leave_r2") return val ? "Evet" : "Hayır";
    const n = Number(val);
    return Number.isFinite(n) ? String(n) : String(val);
  }

  /** İttifak verisinden (scoring_data.red/blue) hakem paneli detay satırlarını üretir. */
  function buildRefereeStyleLines(allianceData, breakdownPoints) {
    const lines = [];
    REFEREE_BREAKDOWN_FIELDS.forEach(function(item) {
      const key = item[0];
      const label = item[1];
      const val = allianceData[key];
      lines.push({ label: label, value: formatBreakdownValue(val, key), key: key });
    });
    if (breakdownPoints) {
      const b = breakdownPoints;
      lines.push({ label: "— Otonom toplam (puan)", value: (b.autonomous && typeof b.autonomous === "object" ? Object.values(b.autonomous).reduce((a, v) => a + (Number(v) || 0), 0) : "") || "-", key: "_auto_pts" });
      lines.push({ label: "— SKS toplam (puan)", value: (b.teleop && typeof b.teleop === "object" ? Object.values(b.teleop).reduce((a, v) => a + (Number(v) || 0), 0) : "") || "-", key: "_teleop_pts" });
      lines.push({ label: "— Cezalar (puan)", value: (b.penalties && typeof b.penalties === "object" ? Object.values(b.penalties).reduce((a, v) => a + (Number(v) || 0), 0) : "") || "-", key: "_penalty_pts" });
    }
    return lines;
  }

  /** Puan kırılımı detay satırı için HTML üretir (hakem paneliyle aynı detay: Seviye 1, Seviye 2 vb.). */
  function getBreakdownRowHtml(match, rowIndex) {
    const sd = match.scoring_data;
    const hasRaw = sd && (sd.red || sd.blue);
    const calc = (sd && sd.calculated_scores) || {};
    const redCalc = calc.red || {};
    const blueCalc = calc.blue || {};
    const summary = getBreakdownSummary(match);
    const hasSp = (normalizeType(match.match_type) === "qualification" || normalizeType(match.match_type) === "final") && summary && (summary.red.sp_total !== "" || summary.blue.sp_total !== "");

    let content;
    if (!hasRaw && !summary) {
      content = "<div class=\"report-breakdown-panel\"><p style=\"color:#888;margin:0;\">Puan kırılımı kayıtlı değil.</p></div>";
    } else {
      const line = (label, val) => "<div style=\"display:flex;justify-content:space-between;gap:12px;\"><span>" + escapeHtml(label) + "</span><span>" + escapeHtml(String(val)) + "</span></div>";
      const redData = (sd && sd.red) || {};
      const blueData = (sd && sd.blue) || {};
      const redB = redCalc.breakdown || {};
      const blueB = blueCalc.breakdown || {};
      const redLines = buildRefereeStyleLines(redData, redB.autonomous || redB.teleop || redB.penalties ? { autonomous: redB.autonomous, teleop: redB.teleop, penalties: redB.penalties } : null);
      const blueLines = buildRefereeStyleLines(blueData, blueB.autonomous || blueB.teleop || blueB.penalties ? { autonomous: blueB.autonomous, teleop: blueB.teleop, penalties: blueB.penalties } : null);
      const section = (title, items) => {
        if (!items.length) return "";
        return "<div style=\"margin-bottom:10px;\"><div style=\"font-weight:700;margin-bottom:4px;color:#444;\">" + escapeHtml(title) + "</div>" + items.map((i) => "<div style=\"margin:2px 0;font-size:12px;\">" + line(i.label, i.value) + "</div>").join("") + "</div>";
      };
      const redOtonom = redLines.filter((i) => i.key.startsWith("auto_"));
      const redSks = redLines.filter((i) => i.key.startsWith("teleop_"));
      const redCezalar = redLines.filter((i) => i.key === "yellow_card" || i.key === "major_penalty");
      const redPuan = redLines.filter((i) => i.key.startsWith("_"));
      const blueOtonom = blueLines.filter((i) => i.key.startsWith("auto_"));
      const blueSks = blueLines.filter((i) => i.key.startsWith("teleop_"));
      const blueCezalar = blueLines.filter((i) => i.key === "yellow_card" || i.key === "major_penalty");
      const bluePuan = blueLines.filter((i) => i.key.startsWith("_"));

      var redExtra = "";
      var blueExtra = "";
      if (summary) {
        redExtra = "<div style=\"margin:4px 0;\">" + line("Toplam skor", summary.red.total_score ?? "-") + "</div>";
        blueExtra = "<div style=\"margin:4px 0;\">" + line("Toplam skor", summary.blue.total_score ?? "-") + "</div>";
        if (hasSp) {
          redExtra += "<div style=\"margin:4px 0;\">" + line("SP Maç sonucu", summary.red.sp_result) + line("SP Tırmanış", summary.red.sp_climb) + line("SP Otonom", summary.red.sp_auto) + line("SP Toplam", summary.red.sp_total) + "</div>";
          blueExtra += "<div style=\"margin:4px 0;\">" + line("SP Maç sonucu", summary.blue.sp_result) + line("SP Tırmanış", summary.blue.sp_climb) + line("SP Otonom", summary.blue.sp_auto) + line("SP Toplam", summary.blue.sp_total) + "</div>";
        }
      }
      var redSections = section("OTONOM (OKS)", redOtonom) + section("SÜRÜCÜ KONTROLLÜ (SKS)", redSks) + section("CEZALAR", redCezalar) + section("Toplam puan (kırılım)", redPuan) + redExtra;
      var blueSections = section("OTONOM (OKS)", blueOtonom) + section("SÜRÜCÜ KONTROLLÜ (SKS)", blueSks) + section("CEZALAR", blueCezalar) + section("Toplam puan (kırılım)", bluePuan) + blueExtra;

      content =
        "<div class=\"report-breakdown-panel\" style=\"display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:12px;background:#f8f9fa;border-radius:6px;text-align:left;font-size:13px;max-height:70vh;overflow-y:auto;\">" +
        "<div><strong style=\"color:#c00;\">Kırmızı</strong><div style=\"margin-top:6px;\">" + redSections + "</div></div>" +
        "<div><strong style=\"color:#06c;\">Mavi</strong><div style=\"margin-top:6px;\">" + blueSections + "</div></div>" +
        "</div>";
    }
    return "<tr class=\"report-breakdown-row\" id=\"breakdown-row-" + rowIndex + "\" style=\"display:none;\"><td colspan=\"12\" style=\"padding:8px;border:1px solid #e1e4ee;vertical-align:top;\">" + content + "</td></tr>";
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

  /** Tarih, saat, saha, maç no ile sıralar; farklı kademeler tek listede kronolojik kalır. */
  function sortMatches(matches) {
    return matches.slice().sort((a, b) => {
      const dateA = a.match_date || "";
      const dateB = b.match_date || "";
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const timeA = a.match_time || "";
      const timeB = b.match_time || "";
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      const fieldA = a.field_number ?? 0;
      const fieldB = b.field_number ?? 0;
      if (Number(fieldA) !== Number(fieldB)) return Number(fieldA) - Number(fieldB);
      const numA = a.match_number;
      const numB = b.match_number;
      if (typeof numA === "number" && typeof numB === "number") return numA - numB;
      return String(numA || "").localeCompare(String(numB || ""), undefined, { numeric: true });
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
      resultsTbody.innerHTML = "<tr><td colspan=\"12\" style=\"padding: 24px; text-align: center; color: #666;\">Seçilen filtrelere uygun maç bulunamadı.</td></tr>";
      updateSummary([]);
      return;
    }

    const rowsHtml = matches.map((match, idx) => {
      const redTeams = (match.red_alliance || []).join(", ");
      const blueTeams = (match.blue_alliance || []).join(", ");
      const redScore = match.red_score != null ? match.red_score : "-";
      const blueScore = match.blue_score != null ? match.blue_score : "-";
      const note = match.notes || "";
      const kademe = formatTypeLabel(match.match_type);
      const mainRow =
        "<tr data-row-index=\"" + idx + "\">" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(kademe) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(String(match.match_number ?? "")) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee; text-align: center;\">" + escapeHtml(String(match.field_number ?? "")) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(formatDate(match.match_date)) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(formatTime(match.match_time)) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(redTeams) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee; text-align: center;\">" + escapeHtml(String(redScore)) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee; text-align: center;\">" + escapeHtml(String(blueScore)) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(blueTeams) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee; text-align: center;\">" + escapeHtml(getWinner(match)) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee;\">" + escapeHtml(note) + "</td>" +
        "<td style=\"padding: 8px; border: 1px solid #e1e4ee; text-align: center;\">" +
        "<button type=\"button\" class=\"btn-small report-breakdown-btn\" data-row-index=\"" + idx + "\" title=\"Puan kırılımını göster / gizle\">Detay</button>" +
        "</td></tr>";
      return mainRow + getBreakdownRowHtml(match, idx);
    }).join("");

    resultsTbody.innerHTML = rowsHtml;

    resultsTbody.querySelectorAll(".report-breakdown-btn").forEach((btn) => {
      btn.addEventListener("click", function() {
        const idx = this.getAttribute("data-row-index");
        const detailRow = document.getElementById("breakdown-row-" + idx);
        if (!detailRow) return;
        const isHidden = detailRow.style.display === "none";
        detailRow.style.display = isHidden ? "table-row" : "none";
        this.textContent = isHidden ? "Gizle" : "Detay";
      });
    });

    updateSummary(matches);
  }

  /**
   * Tek maç için CSV satırına eklenecek kırılım değerlerini döndürür (hakem paneli detayları).
   * Önce özet (Otonom/SKS/Cezalar/Toplam/SP), sonra REFEREE_BREAKDOWN_FIELDS sırasıyla Kırmızı, sonra Mavi.
   */
  function getBreakdownCsvValues(match) {
    const sd = match.scoring_data;
    const redData = (sd && sd.red) || {};
    const blueData = (sd && sd.blue) || {};
    const calc = (sd && sd.calculated_scores) || {};
    const rp = (sd && sd.ranking_points) || {};
    const s = getBreakdownSummary(match);
    const vals = [];
    if (s) {
      vals.push(
        s.red.autonomous_total ?? "",
        s.red.teleop_total ?? "",
        s.red.penalty_total ?? "",
        s.red.total_score ?? "",
        s.red.sp_total ?? "",
        s.blue.autonomous_total ?? "",
        s.blue.teleop_total ?? "",
        s.blue.penalty_total ?? "",
        s.blue.total_score ?? "",
        s.blue.sp_total ?? ""
      );
    } else {
      vals.push("", "", "", "", "", "", "", "", "", "");
    }
    REFEREE_BREAKDOWN_FIELDS.forEach(function(item) {
      const key = item[0];
      vals.push(formatBreakdownValue(redData[key], key));
    });
    REFEREE_BREAKDOWN_FIELDS.forEach(function(item) {
      const key = item[0];
      vals.push(formatBreakdownValue(blueData[key], key));
    });
    return vals;
  }

  function buildCsv(matches, includeBreakdown) {
    const headers = [
      "Kademe",
      "Maç No",
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
    if (includeBreakdown) {
      headers.push(
        "Kırmızı Otonom (puan)",
        "Kırmızı SKS (puan)",
        "Kırmızı Cezalar (puan)",
        "Kırmızı Toplam skor",
        "Kırmızı SP",
        "Mavi Otonom (puan)",
        "Mavi SKS (puan)",
        "Mavi Cezalar (puan)",
        "Mavi Toplam skor",
        "Mavi SP"
      );
      REFEREE_BREAKDOWN_FIELDS.forEach(function(item) {
        headers.push("Kırmızı - " + item[1]);
      });
      REFEREE_BREAKDOWN_FIELDS.forEach(function(item) {
        headers.push("Mavi - " + item[1]);
      });
    }

    const rows = matches.map((match) => {
      const base = [
        formatTypeLabel(match.match_type),
        match.match_number ?? "",
        match.field_number ?? "",
        match.match_date ?? "",
        match.match_time ?? "",
        (match.red_alliance || []).join(" "),
        match.red_score ?? "",
        match.blue_score ?? "",
        (match.blue_alliance || []).join(" "),
        getWinner(match),
        match.notes || ""
      ];
      if (includeBreakdown) {
        base.push.apply(base, getBreakdownCsvValues(match));
      }
      return base;
    });

    return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  }

  function downloadCsv(matches) {
    const includeBreakdown = !!qs("csv_include_breakdown")?.checked;
    const csvContent = buildCsv(matches, includeBreakdown);
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
    link.href = URL.createObjectURL(blob);
    link.download = `mac-sonuclari-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  /**
   * Resmi maçlar (sıralama, elimination, final) ve deneme maçlarını çeker, tek listede birleştirir.
   * Her kayıtta match_type/kademe alanı set edilir (practice | qualification | elimination | final).
   */
  async function fetchMatches() {
    const statusValue = (statusSelect?.value || "completed").trim();
    const typeValue = (typeSelect?.value || "").trim().toLowerCase();
    const fieldValue = (fieldInput?.value || "").trim();
    const dateFrom = (dateFromInput?.value || "").trim();
    const dateTo = (dateToInput?.value || "").trim();

    const scheduleParams = {};
    if (statusValue !== "all") scheduleParams.status = statusValue;
    if (typeValue && typeValue !== "practice") scheduleParams.type = typeValue;
    if (fieldValue) scheduleParams.field = fieldValue;
    if (dateFrom && dateTo && dateFrom === dateTo) scheduleParams.date = dateFrom;

    const practiceParams = {};
    if (statusValue !== "all") practiceParams.status = statusValue;
    if (fieldValue) practiceParams.field = fieldValue;
    if (dateFrom && dateTo && dateFrom === dateTo) practiceParams.date = dateFrom;

    const [scheduleList, practiceList] = await Promise.all([
      typeValue !== "practice" ? apiGet("/api/match-schedule", scheduleParams) : Promise.resolve([]),
      typeValue !== "qualification" && typeValue !== "elimination" && typeValue !== "final"
        ? apiGet("/api/practice-matches", practiceParams)
        : Promise.resolve([])
    ]);

    const schedule = Array.isArray(scheduleList) ? scheduleList : [];
    const practice = Array.isArray(practiceList) ? practiceList : [];

    const withKademe = (m, matchType) => ({ ...m, match_type: matchType });
    const scheduleNormalized = schedule.map((m) => withKademe(m, (m.match_type || "qualification").trim() || "qualification"));
    const practiceNormalized = practice.map((m) => withKademe(m, "practice"));

    return scheduleNormalized.concat(practiceNormalized);
  }

  async function loadReport() {
    if (!resultsTbody) return;
    resultsTbody.innerHTML = "<tr><td colspan=\"12\" style=\"padding: 24px; text-align: center; color: #888;\">Yükleniyor...</td></tr>";
    try {
      cachedMatches = await fetchMatches();
      const filtered = sortMatches(filterMatches(cachedMatches || []));
      renderTable(filtered);
      if (lastUpdateEl) {
        lastUpdateEl.textContent = "Son güncelleme: " + new Date().toLocaleTimeString("tr-TR");
      }
    } catch (error) {
      resultsTbody.innerHTML = "<tr><td colspan=\"12\" style=\"padding: 24px; text-align: center; color: #c00;\">Veri alınamadı.</td></tr>";
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
