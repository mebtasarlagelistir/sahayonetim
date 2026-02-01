/**
 * Maç Kontrol - Puanlama Modülü
 * 
 * Skor hesaplamaları, puanlama verilerini toplama ve skor düzenleme işlemleri.
 * 
 * Bağımlılıklar: match_control_core.js, constants.js
 */

/**
 * Skor dökümünü hesaplar (İstanbul ve Su oyununa özel)
 */
function calculateScoreBreakdown() {
  const rankingData = {};
  ["blue", "red"].forEach(alliance => {
    // OTONOM (OKS) Hesaplamaları - constants modülünden al
    // Başlangıç alanını terk etme
    const autoLeaveR1 = qs(`${alliance}_auto_leave_r1`)?.checked ? SCORING_CONSTANTS.AUTO_LEAVE_POINTS : 0;
    const autoLeaveR2 = qs(`${alliance}_auto_leave_r2`)?.checked ? SCORING_CONSTANTS.AUTO_LEAVE_POINTS : 0;
    const autoLeavePoints = autoLeaveR1 + autoLeaveR2;
    
    // Bent Seviye 1
    const autoBent1OwnCount = parseInt(qs(`${alliance}_auto_bent1_own`)?.value || 0);
    const autoBent1OpponentCount = parseInt(qs(`${alliance}_auto_bent1_opponent`)?.value || 0);
    const autoBent1Own = autoBent1OwnCount * SCORING_CONSTANTS.AUTO_BENT1_POINTS;
    const autoBent1Opponent = autoBent1OpponentCount * SCORING_CONSTANTS.AUTO_BENT1_POINTS;
    const autoBent1Points = autoBent1Own;
    const autoBent1OpponentPoints = autoBent1Opponent;
    
    // Bent Seviye 2
    const autoBent2CorrectCount = parseInt(qs(`${alliance}_auto_bent2_correct`)?.value || 0);
    const autoBent2WrongCount = parseInt(qs(`${alliance}_auto_bent2_wrong`)?.value || 0);
    const autoBent2OpponentCount = parseInt(qs(`${alliance}_auto_bent2_opponent`)?.value || 0);
    const autoBent2Correct = autoBent2CorrectCount * SCORING_CONSTANTS.AUTO_BENT2_CORRECT_POINTS;
    const autoBent2Wrong = autoBent2WrongCount * SCORING_CONSTANTS.AUTO_BENT2_WRONG_POINTS;
    const autoBent2Opponent = autoBent2OpponentCount * SCORING_CONSTANTS.AUTO_BENT2_CORRECT_POINTS; // Rakip alana verilen
    const autoBent2Points = autoBent2Correct + autoBent2Wrong;
    const autoBent2OpponentPoints = autoBent2Opponent;
    
    // Bent Seviye 3
    const autoBent3CorrectCount = parseInt(qs(`${alliance}_auto_bent3_correct`)?.value || 0);
    const autoBent3WrongCount = parseInt(qs(`${alliance}_auto_bent3_wrong`)?.value || 0);
    const autoBent3OpponentCount = parseInt(qs(`${alliance}_auto_bent3_opponent`)?.value || 0);
    const autoBent3Correct = autoBent3CorrectCount * SCORING_CONSTANTS.AUTO_BENT3_CORRECT_POINTS;
    const autoBent3Wrong = autoBent3WrongCount * SCORING_CONSTANTS.AUTO_BENT3_WRONG_POINTS;
    const autoBent3Opponent = autoBent3OpponentCount * SCORING_CONSTANTS.AUTO_BENT3_CORRECT_POINTS; // Rakip alana verilen
    const autoBent3Points = autoBent3Correct + autoBent3Wrong;
    const autoBent3OpponentPoints = autoBent3Opponent;
    
    // Sarnıçlar
    const autoTankOwnCount = parseInt(qs(`${alliance}_auto_tank_own`)?.value || 0);
    const autoTankOpponentCount = parseInt(qs(`${alliance}_auto_tank_opponent`)?.value || 0);
    const autoTankOwn = autoTankOwnCount * SCORING_CONSTANTS.AUTO_TANK_POINTS;
    const autoTankOpponent = autoTankOpponentCount * SCORING_CONSTANTS.AUTO_TANK_POINTS; // Rakip alana verilen
    const autoTankPoints = autoTankOwn;
    const autoTankOpponentPoints = autoTankOpponent;
    
    // Otonom toplam
    const autoTotal = autoLeavePoints + autoBent1Points + autoBent2Points + autoBent3Points + autoTankPoints;
    const autoOpponentTotal = autoBent1OpponentPoints + autoBent2OpponentPoints + autoBent3OpponentPoints + autoTankOpponentPoints;
    
    // SÜRÜCÜ KONTROLLÜ (SKS) Hesaplamaları - constants modülünden al
    // Bent Seviye 1
    const teleopBent1OwnCount = parseInt(qs(`${alliance}_teleop_bent1_own`)?.value || 0);
    const teleopBent1OpponentCount = parseInt(qs(`${alliance}_teleop_bent1_opponent`)?.value || 0);
    const teleopBent1Own = teleopBent1OwnCount * SCORING_CONSTANTS.TELEOP_BENT1_POINTS;
    const teleopBent1Opponent = teleopBent1OpponentCount * SCORING_CONSTANTS.TELEOP_BENT1_POINTS;
    const teleopBent1Points = teleopBent1Own;
    const teleopBent1OpponentPoints = teleopBent1Opponent;
    
    // Bent Seviye 2
    const teleopBent2CorrectCount = parseInt(qs(`${alliance}_teleop_bent2_correct`)?.value || 0);
    const teleopBent2WrongCount = parseInt(qs(`${alliance}_teleop_bent2_wrong`)?.value || 0);
    const teleopBent2OpponentCount = parseInt(qs(`${alliance}_teleop_bent2_opponent`)?.value || 0);
    const teleopBent2Correct = teleopBent2CorrectCount * SCORING_CONSTANTS.TELEOP_BENT2_CORRECT_POINTS;
    const teleopBent2Wrong = teleopBent2WrongCount * SCORING_CONSTANTS.TELEOP_BENT2_WRONG_POINTS;
    const teleopBent2Opponent = teleopBent2OpponentCount * SCORING_CONSTANTS.TELEOP_BENT2_CORRECT_POINTS; // Rakip alana verilen
    const teleopBent2Points = teleopBent2Correct + teleopBent2Wrong;
    const teleopBent2OpponentPoints = teleopBent2Opponent;
    
    // Bent Seviye 3
    const teleopBent3CorrectCount = parseInt(qs(`${alliance}_teleop_bent3_correct`)?.value || 0);
    const teleopBent3WrongCount = parseInt(qs(`${alliance}_teleop_bent3_wrong`)?.value || 0);
    const teleopBent3OpponentCount = parseInt(qs(`${alliance}_teleop_bent3_opponent`)?.value || 0);
    const teleopBent3Correct = teleopBent3CorrectCount * SCORING_CONSTANTS.TELEOP_BENT3_CORRECT_POINTS;
    const teleopBent3Wrong = teleopBent3WrongCount * SCORING_CONSTANTS.TELEOP_BENT3_WRONG_POINTS;
    const teleopBent3Opponent = teleopBent3OpponentCount * SCORING_CONSTANTS.TELEOP_BENT3_CORRECT_POINTS; // Rakip alana verilen
    const teleopBent3Points = teleopBent3Correct + teleopBent3Wrong;
    const teleopBent3OpponentPoints = teleopBent3Opponent;
    
    // Sarnıçlar
    const teleopTankOwnCount = parseInt(qs(`${alliance}_teleop_tank_own`)?.value || 0);
    const teleopTankOpponentCount = parseInt(qs(`${alliance}_teleop_tank_opponent`)?.value || 0);
    const teleopTankOwn = teleopTankOwnCount * SCORING_CONSTANTS.TELEOP_TANK_POINTS;
    const teleopTankOpponent = teleopTankOpponentCount * SCORING_CONSTANTS.TELEOP_TANK_POINTS; // Rakip alana verilen
    const teleopTankPoints = teleopTankOwn;
    const teleopTankOpponentPoints = teleopTankOpponent;
    
    // Özel Aksiyonlar
    const teleopSourceEntryCount = parseInt(qs(`${alliance}_teleop_source_entry`)?.value || 0);
    const teleopClimbCount = parseInt(qs(`${alliance}_teleop_climb`)?.value || 0);
    const teleopSourceEntry = teleopSourceEntryCount * SCORING_CONSTANTS.TELEOP_SOURCE_ENTRY_POINTS;
    const teleopClimb = teleopClimbCount * SCORING_CONSTANTS.TELEOP_CLIMB_POINTS;
    
    // Sürücü kontrollü toplam
    const teleopTotal = teleopBent1Points + teleopBent2Points + teleopBent3Points + teleopTankPoints + teleopSourceEntry + teleopClimb;
    const teleopOpponentTotal = teleopBent1OpponentPoints + teleopBent2OpponentPoints + teleopBent3OpponentPoints + teleopTankOpponentPoints;
    
    // CEZALAR - constants modülünden al
    const yellowCard = parseInt(qs(`${alliance}_yellow_card`)?.value || 0);
    const majorPenalty = parseInt(qs(`${alliance}_major_penalty`)?.value || 0);
    const yellowCardPoints = yellowCard * SCORING_CONSTANTS.YELLOW_CARD_POINTS_TO_OPPONENT; // Rakip takıma verilen puan
    const majorPenaltyPoints = majorPenalty * SCORING_CONSTANTS.MAJOR_PENALTY_POINTS_TO_OPPONENT; // Rakip takıma verilen puan
    const penaltyTotal = yellowCardPoints + majorPenaltyPoints;
    
    // Rakip takımın cezalarından gelen puanlar (diğer ittifakın cezaları)
    const opponentAlliance = alliance === "blue" ? "red" : "blue";
    const opponentYellowCard = parseInt(qs(`${opponentAlliance}_yellow_card`)?.value || 0);
    const opponentMajorPenalty = parseInt(qs(`${opponentAlliance}_major_penalty`)?.value || 0);
    const receivedFromPenalties = (opponentYellowCard * SCORING_CONSTANTS.YELLOW_CARD_POINTS_TO_OPPONENT) + (opponentMajorPenalty * SCORING_CONSTANTS.MAJOR_PENALTY_POINTS_TO_OPPONENT);
    
    // Rakip takımın bu ittifakın alanına verdiği puanlar (rakip takımdan gelir, bu ittifaka eklenir)
    // Örnek: Kırmızı takım mavi bentine küre bırakırsa, mavi takıma puan eklenir
    const opponentAutoPoints = alliance === "blue" ? 
      (parseInt(qs("red_auto_bent1_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_BENT1_POINTS +
       parseInt(qs("red_auto_bent2_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_BENT2_CORRECT_POINTS +
       parseInt(qs("red_auto_bent3_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_BENT3_CORRECT_POINTS +
       parseInt(qs("red_auto_tank_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_TANK_POINTS) :
      (parseInt(qs("blue_auto_bent1_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_BENT1_POINTS +
       parseInt(qs("blue_auto_bent2_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_BENT2_CORRECT_POINTS +
       parseInt(qs("blue_auto_bent3_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_BENT3_CORRECT_POINTS +
       parseInt(qs("blue_auto_tank_opponent")?.value || 0) * SCORING_CONSTANTS.AUTO_TANK_POINTS);
    
    const opponentTeleopPoints = alliance === "blue" ?
      (parseInt(qs("red_teleop_bent1_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_BENT1_POINTS +
       parseInt(qs("red_teleop_bent2_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_BENT2_CORRECT_POINTS +
       parseInt(qs("red_teleop_bent3_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_BENT3_CORRECT_POINTS +
       parseInt(qs("red_teleop_tank_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_TANK_POINTS) :
      (parseInt(qs("blue_teleop_bent1_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_BENT1_POINTS +
       parseInt(qs("blue_teleop_bent2_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_BENT2_CORRECT_POINTS +
       parseInt(qs("blue_teleop_bent3_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_BENT3_CORRECT_POINTS +
       parseInt(qs("blue_teleop_tank_opponent")?.value || 0) * SCORING_CONSTANTS.TELEOP_TANK_POINTS);
    
    // Toplam skor = Kendi alanına verilen puanlar + Rakip cezalarından gelen puanlar + Rakip takımın bu alana verdiği puanlar
    const totalScore = autoTotal + teleopTotal + receivedFromPenalties + opponentAutoPoints + opponentTeleopPoints;

    // Saha özeti (OKS + SKS toplamları)
    const fieldBent1El = qs(`${alliance}_field_bent1`);
    const fieldBent2El = qs(`${alliance}_field_bent2_correct`);
    const fieldBent3El = qs(`${alliance}_field_bent3_correct`);
    const fieldTankEl = qs(`${alliance}_field_tank`);
    const fieldSourceEl = qs(`${alliance}_field_source`);
    const fieldClimbEl = qs(`${alliance}_field_climb`);
    
    if (fieldBent1El) fieldBent1El.textContent = autoBent1OwnCount + teleopBent1OwnCount;
    if (fieldBent2El) fieldBent2El.textContent = autoBent2CorrectCount + teleopBent2CorrectCount;
    if (fieldBent3El) fieldBent3El.textContent = autoBent3CorrectCount + teleopBent3CorrectCount;
    if (fieldTankEl) fieldTankEl.textContent = autoTankOwnCount + teleopTankOwnCount;
    if (fieldSourceEl) fieldSourceEl.textContent = teleopSourceEntryCount;
    if (fieldClimbEl) fieldClimbEl.textContent = teleopClimbCount;
    
    // Breakdown güncellemeleri
    const breakdownEls = {
      [`${alliance}_auto_leave_points`]: autoLeavePoints,
      [`${alliance}_auto_bent1_points`]: autoBent1Points,
      [`${alliance}_auto_bent2_correct_points`]: autoBent2Correct,
      [`${alliance}_auto_bent2_wrong_points`]: autoBent2Wrong,
      [`${alliance}_auto_bent3_correct_points`]: autoBent3Correct,
      [`${alliance}_auto_bent3_wrong_points`]: autoBent3Wrong,
      [`${alliance}_auto_tank_points`]: autoTankPoints,
      [`${alliance}_auto_opponent_points`]: `${autoOpponentTotal} (Rakip takıma eklendi)`,
      [`${alliance}_auto_total`]: autoTotal,
      [`${alliance}_teleop_bent1_points`]: teleopBent1Points,
      [`${alliance}_teleop_bent2_correct_points`]: teleopBent2Correct,
      [`${alliance}_teleop_bent2_wrong_points`]: teleopBent2Wrong,
      [`${alliance}_teleop_bent3_correct_points`]: teleopBent3Correct,
      [`${alliance}_teleop_bent3_wrong_points`]: teleopBent3Wrong,
      [`${alliance}_teleop_tank_points`]: teleopTankPoints,
      [`${alliance}_teleop_source_points`]: teleopSourceEntry,
      [`${alliance}_teleop_climb_points`]: teleopClimb,
      [`${alliance}_teleop_opponent_points`]: `${teleopOpponentTotal} (Rakip takıma eklendi)`,
      [`${alliance}_teleop_total`]: teleopTotal,
      [`${alliance}_yellow_card_points`]: yellowCardPoints,
      [`${alliance}_major_penalty_points`]: majorPenaltyPoints,
      [`${alliance}_penalty_total`]: penaltyTotal,
      [`${alliance}_total_score`]: totalScore
    };
    
    Object.entries(breakdownEls).forEach(([id, value]) => {
      const el = qs(id);
      if (el) el.textContent = value;
    });
    
    // Merkezi skorları güncelle
    const centralScoreEl = qs(`central_${alliance === "blue" ? "blue" : "red"}_score`);
    if (centralScoreEl) centralScoreEl.textContent = totalScore;
    
    // Eğer kırmızı kart varsa, skor 0 olabilir (kurallara göre)
    const redCardR1 = qs(`${alliance}_red_card_r1`)?.checked;
    const redCardR2 = qs(`${alliance}_red_card_r2`)?.checked;
    if (redCardR1 || redCardR2) {
      // Kırmızı kart durumunda skor 0 olabilir veya özel işlem yapılabilir
      // Şimdilik uyarı göster
      if (totalScore > 0) {
        console.warn(`${alliance} ittifakında kırmızı kart var, skor kontrol edilmeli`);
      }
    }

    rankingData[alliance] = {
      totalScore,
      teleopClimbCount,
      autoBent1OwnCount,
      autoBent2CorrectCount,
      autoBent3CorrectCount
    };
  });

  updateRankingPoints(rankingData);
}

/**
 * Ranking puanlarını günceller (Sıralama Puanları - SP)
 * 
 * ÖNEMLİ: Deneme maçları (practice) SP'ye etki etmez.
 * Sadece sıralama maçları (qualification) için SP hesaplanır.
 * 
 * SP Kuralları:
 * - Galibiyet: +2 SP
 * - Beraberlik: +1 SP
 * - Kemere Yükselme (2 robot): +2 SP
 * - Otonom 4 Küre: +2 SP
 */
function updateRankingPoints(data) {
  // Maç tipini kontrol et (deneme maçları SP'ye etki etmez)
  const matchType = currentMatch?.match_type || "qualification";
  const isPractice = matchType === "practice";
  
  const redScore = data.red?.totalScore ?? 0;
  const blueScore = data.blue?.totalScore ?? 0;
  const resultPoints = { red: 0, blue: 0 };
  
  // Deneme maçları SP'ye etki etmez
  if (!isPractice) {
    // Maç Sonucu SP'si
    if (redScore > blueScore) {
      resultPoints.red = 2; // Galibiyet
    } else if (blueScore > redScore) {
      resultPoints.blue = 2; // Galibiyet
    } else if (redScore === blueScore && redScore > 0) {
      resultPoints.red = 1; // Beraberlik
      resultPoints.blue = 1; // Beraberlik
    }
  }

  ["red", "blue"].forEach((alliance) => {
    let climbPoints = 0;
    let autoBonus = 0;
    
    // Deneme maçları SP'ye etki etmez
    if (!isPractice) {
      // Kemere Yükselme SP'si (2 robot kemere yükselirse +2 SP)
      const climbCount = data[alliance]?.teleopClimbCount || 0;
      climbPoints = climbCount >= 2 ? 2 : 0;
      
      // Otonom 4 Küre SP'si
      // Otonom dönemde ittifakın kendi renklerine 4 küre bırakması gerekiyor
      const autoBent1Own = data[alliance]?.autoBent1OwnCount || 0;
      const autoBent2Correct = data[alliance]?.autoBent2CorrectCount || 0;
      const autoBent3Correct = data[alliance]?.autoBent3CorrectCount || 0;
      const autoTankOwn = data[alliance]?.autoTankOwnCount || 0;
      const autoTotal = autoBent1Own + autoBent2Correct + autoBent3Correct + autoTankOwn;
      autoBonus = autoTotal >= 4 ? 2 : 0;
    }
    
    const total = resultPoints[alliance] + climbPoints + autoBonus;
    
    const rankingEls = {
      [`${alliance}_ranking_result`]: resultPoints[alliance],
      [`${alliance}_ranking_climb`]: climbPoints,
      [`${alliance}_ranking_auto`]: autoBonus,
      [`${alliance}_ranking_total`]: total
    };
    
    Object.entries(rankingEls).forEach(([id, value]) => {
      const el = qs(id);
      if (el) el.textContent = value;
    });
  });
}

/**
 * Puanlama verilerini toplar (modüler sistem için)
 */
function collectScoringData(alliance) {
  return {
    // Otonom
    auto_leave_r1: qs(`${alliance}_auto_leave_r1`)?.checked || false,
    auto_leave_r2: qs(`${alliance}_auto_leave_r2`)?.checked || false,
    auto_bent1_own: parseInt(qs(`${alliance}_auto_bent1_own`)?.value || 0),
    auto_bent1_opponent: parseInt(qs(`${alliance}_auto_bent1_opponent`)?.value || 0),
    auto_bent2_correct: parseInt(qs(`${alliance}_auto_bent2_correct`)?.value || 0),
    auto_bent2_wrong: parseInt(qs(`${alliance}_auto_bent2_wrong`)?.value || 0),
    auto_bent2_opponent: parseInt(qs(`${alliance}_auto_bent2_opponent`)?.value || 0),
    auto_bent3_correct: parseInt(qs(`${alliance}_auto_bent3_correct`)?.value || 0),
    auto_bent3_wrong: parseInt(qs(`${alliance}_auto_bent3_wrong`)?.value || 0),
    auto_bent3_opponent: parseInt(qs(`${alliance}_auto_bent3_opponent`)?.value || 0),
    auto_tank_own: parseInt(qs(`${alliance}_auto_tank_own`)?.value || 0),
    auto_tank_opponent: parseInt(qs(`${alliance}_auto_tank_opponent`)?.value || 0),
    
    // Teleop
    teleop_bent1_own: parseInt(qs(`${alliance}_teleop_bent1_own`)?.value || 0),
    teleop_bent1_opponent: parseInt(qs(`${alliance}_teleop_bent1_opponent`)?.value || 0),
    teleop_bent2_correct: parseInt(qs(`${alliance}_teleop_bent2_correct`)?.value || 0),
    teleop_bent2_wrong: parseInt(qs(`${alliance}_teleop_bent2_wrong`)?.value || 0),
    teleop_bent2_opponent: parseInt(qs(`${alliance}_teleop_bent2_opponent`)?.value || 0),
    teleop_bent3_correct: parseInt(qs(`${alliance}_teleop_bent3_correct`)?.value || 0),
    teleop_bent3_wrong: parseInt(qs(`${alliance}_teleop_bent3_wrong`)?.value || 0),
    teleop_bent3_opponent: parseInt(qs(`${alliance}_teleop_bent3_opponent`)?.value || 0),
    teleop_tank_own: parseInt(qs(`${alliance}_teleop_tank_own`)?.value || 0),
    teleop_tank_opponent: parseInt(qs(`${alliance}_teleop_tank_opponent`)?.value || 0),
    teleop_source_entry: parseInt(qs(`${alliance}_teleop_source_entry`)?.value || 0),
    teleop_climb: parseInt(qs(`${alliance}_teleop_climb`)?.value || 0),
    
    // Cezalar
    yellow_card: parseInt(qs(`${alliance}_yellow_card`)?.value || 0),
    major_penalty: parseInt(qs(`${alliance}_major_penalty`)?.value || 0),
    red_card_r1: qs(`${alliance}_red_card_r1`)?.checked || false,
    red_card_r2: qs(`${alliance}_red_card_r2`)?.checked || false
  };
}

/**
 * Backend'den gelen breakdown'ı UI'a uygular
 */
function updateBreakdownFromBackend(alliance, breakdown) {
  // Bu fonksiyon backend'den gelen breakdown'ı kullanarak
  // UI'daki breakdown gösterimini güncelleyebilir
  // Şimdilik calculateScoreBreakdown() kullanılıyor, ama
  // backend hesaplamalarına güvenmek için bu fonksiyon kullanılabilir
}

/**
 * Skor günceller (eski basit sistem - geriye dönük uyumluluk için)
 */
async function updateScore(alliance) {
  if (!currentMatch) return;
  
  const scoreInput = qs(`${alliance}_score_input`);
  if (!scoreInput) return;
  
  const score = parseInt(scoreInput.value || 0);
  
  try {
    const payload = {
      match_id: currentMatch.id,
      [`${alliance}_score`]: score,
      match_source: currentMatch.source || "schedule"
    };
    
    await apiPost("/api/match-control/score", payload);
    
    currentMatch[`${alliance}_score`] = score;
    const scoreDisplayEl = qs(`${alliance}_score_display`);
    if (scoreDisplayEl) scoreDisplayEl.textContent = score;
    showToast(`${alliance === "red" ? "Kırmızı" : "Mavi"} skor güncellendi`, "success");
    
    // Maç listesini güncelle (skorlar görünsün)
    if (typeof loadMatchList === "function") {
      await loadMatchList();
    }
    
  } catch (err) {
    console.error("Update score error:", err);
    showToast("Skor güncellenirken hata oluştu", "error");
  }
}

/**
 * Detaylı skorlama sisteminden skorları günceller
 */
async function updateScoreFromDetailedScoring() {
  if (!currentMatch) return;
  
  // Tüm puanlama verilerini topla
  const blueScoringData = collectScoringData("blue");
  const redScoringData = collectScoringData("red");
  
  try {
    // Modüler puanlama sistemi ile güncelle (her iki ittifak için)
    const [blueRes, redRes] = await Promise.all([
      fetch("/api/match-control/score/detailed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: currentMatch.id,
          alliance: "blue",
          scoring_data: blueScoringData,
          match_source: currentMatch.source || "schedule"
        })
      }),
      fetch("/api/match-control/score/detailed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: currentMatch.id,
          alliance: "red",
          scoring_data: redScoringData,
          match_source: currentMatch.source || "schedule"
        })
      })
    ]);
    
    if (!blueRes.ok || !redRes.ok) {
      const error = await blueRes.json().catch(() => ({}));
      showToast(error.error || "Skor güncellenemedi", "error");
      return;
    }
    
    const blueResult = await blueRes.json();
    const redResult = await redRes.json();
    
    // Hesaplanan skorları güncelle
    currentMatch.red_score = redResult.calculated_score;
    currentMatch.blue_score = blueResult.calculated_score;
    
    // Breakdown'ı hesapla ve tüm skorları güncelle (merkezi + detaylı)
    if (typeof calculateScoreBreakdown === "function") {
      calculateScoreBreakdown();
    }
    
    // Merkezi skorları da güncelle (backend'den gelen değerlerle - daha güvenilir)
    const centralBlueEl = qs("central_blue_score");
    const centralRedEl = qs("central_red_score");
    if (centralBlueEl) centralBlueEl.textContent = blueResult.calculated_score;
    if (centralRedEl) centralRedEl.textContent = redResult.calculated_score;
    
    // Detaylı skor gösterimlerini de güncelle (red_total_score, blue_total_score)
    const redTotalScoreEl = qs("red_total_score");
    const blueTotalScoreEl = qs("blue_total_score");
    if (redTotalScoreEl) redTotalScoreEl.textContent = redResult.calculated_score;
    if (blueTotalScoreEl) blueTotalScoreEl.textContent = blueResult.calculated_score;
    
    showToast("Skorlar güncellendi", "success");
    
    // Maç listesini güncelle
    if (typeof loadMatchList === "function") {
      await loadMatchList();
    }
    
  } catch (err) {
    console.error("Update score error:", err);
    showToast("Skor güncellenirken hata oluştu", "error");
  }
}

/**
 * Puanlama verilerini UI'a uygular
 */
function applyScoringData(scoringData) {
  resetScoringInputs();
  if (scoringData && typeof scoringData === "object") {
    applyScoringDataToInputs("blue", scoringData.blue || {});
    applyScoringDataToInputs("red", scoringData.red || {});
    if (typeof applyTeamStatuses === "function") {
      applyTeamStatuses(scoringData.team_statuses || {});
    }
  }
}

/**
 * Puanlama verilerini input alanlarına uygular
 */
function applyScoringDataToInputs(alliance, data) {
  if (!data || typeof data !== "object") return;
  const numberFields = [
    "auto_bent1_own", "auto_bent1_opponent",
    "auto_bent2_correct", "auto_bent2_wrong", "auto_bent2_opponent",
    "auto_bent3_correct", "auto_bent3_wrong", "auto_bent3_opponent",
    "auto_tank_own", "auto_tank_opponent",
    "teleop_bent1_own", "teleop_bent1_opponent",
    "teleop_bent2_correct", "teleop_bent2_wrong", "teleop_bent2_opponent",
    "teleop_bent3_correct", "teleop_bent3_wrong", "teleop_bent3_opponent",
    "teleop_tank_own", "teleop_tank_opponent",
    "teleop_source_entry", "teleop_climb",
    "yellow_card", "major_penalty"
  ];
  const checkboxFields = ["auto_leave_r1", "auto_leave_r2", "red_card_r1", "red_card_r2"];
  numberFields.forEach((field) => {
    const input = qs(`${alliance}_${field}`);
    if (input) input.value = data[field] ?? 0;
  });
  checkboxFields.forEach((field) => {
    const input = qs(`${alliance}_${field}`);
    if (input) input.checked = !!data[field];
  });
}

/**
 * Puanlama input alanlarını sıfırlar
 */
function resetScoringInputs() {
  ["blue", "red"].forEach((alliance) => {
    applyScoringDataToInputs(alliance, {});
    const autoLeave1 = qs(`${alliance}_auto_leave_r1`);
    const autoLeave2 = qs(`${alliance}_auto_leave_r2`);
    const redCard1 = qs(`${alliance}_red_card_r1`);
    const redCard2 = qs(`${alliance}_red_card_r2`);
    if (autoLeave1) autoLeave1.checked = false;
    if (autoLeave2) autoLeave2.checked = false;
    if (redCard1) redCard1.checked = false;
    if (redCard2) redCard2.checked = false;
  });
}

/** Maç başlatılabilmesi için robotların sahip olması gereken geçerli durumlar */
const ALLOWED_ROBOT_STATUSES_FOR_START = ["ready", "dq", "ry", "bypass"];

/**
 * Tüm robotlar için hazırlık durumu işaretli mi kontrol eder.
 * Maç sadece her robot için "Hazır", "DQ", "RY" veya "Bypass" seçiliyse başlatılabilir.
 */
function canStartMatch() {
  if (!currentMatch) return false;
  const redTeams = currentMatch.red_alliance || [];
  const blueTeams = currentMatch.blue_alliance || [];
  if (redTeams.length === 0 && blueTeams.length === 0) return false;
  const statuses = getTeamStatusesForValidation();
  for (const alliance of ["red", "blue"]) {
    const teams = alliance === "red" ? redTeams : blueTeams;
    for (let i = 1; i <= teams.length; i++) {
      const key = `r${i}`;
      const status = statuses[alliance][key];
      if (!status || !ALLOWED_ROBOT_STATUSES_FOR_START.includes(status)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Takım durumlarını doğrulama için toplar (seçili değilse değer yok).
 * Sadece #red_team_statuses ve #blue_team_statuses içindeki .team-status-item kullanılır.
 */
function getTeamStatusesForValidation() {
  const result = { red: {}, blue: {} };
  ["red", "blue"].forEach((alliance) => {
    const container = document.getElementById(alliance + "_team_statuses");
    if (!container) return;
    container.querySelectorAll(".team-status-item").forEach((item) => {
      const teamId = item.dataset.team || "";
      const robotIndex = teamId.split("-")[1] || "1";
      const active = item.querySelector(".team-status-btn.active");
      const status = active ? (active.getAttribute("data-status") || null) : null;
      if (status) result[alliance][`r${robotIndex}`] = status;
    });
  });
  return result;
}

/**
 * Takım durumlarını toplar (maç başlatma isteğinde backend'e gönderilir)
 */
function collectTeamStatuses() {
  const result = { red: {}, blue: {} };
  ["red", "blue"].forEach((alliance) => {
    document.querySelectorAll(`#${alliance}_team_statuses .team-status-item`).forEach((item) => {
      const teamId = item.dataset.team || "";
      const robotIndex = teamId.split("-")[1] || "1";
      const active = item.querySelector(".team-status-btn.active");
      result[alliance][`r${robotIndex}`] = active?.dataset.status || "ready";
    });
  });
  return result;
}

/**
 * Takım durumlarını UI'a uygular
 */
function applyTeamStatuses(statuses) {
  const statusLabels = { ready: "Hazır", yellow: "Sarı Kart", red: "Kırmızı Kart", dq: "Diskalifiye", ry: "Robot Yok", bypass: "Bypass" };
  ["red", "blue"].forEach((alliance) => {
    document.querySelectorAll(`#${alliance}_team_statuses .team-status-item`).forEach((item) => {
      const teamId = item.dataset.team || "";
      const robotIndex = teamId.split("-")[1] || "1";
      const status = statuses?.[alliance]?.[`r${robotIndex}`] || "ready";
      item.querySelectorAll(".team-status-btn").forEach((btn) => btn.classList.remove("active"));
      const btn = item.querySelector(`.team-status-btn[data-status="${status}"]`);
      if (btn) btn.classList.add("active");
      const statusSquare = document.querySelector(`.status-square[data-team="${teamId}"]`);
      if (statusSquare) {
        statusSquare.className = `status-square status-${status}`;
        const teamNumber = item.dataset.teamNumber || "";
        statusSquare.title = `Takım ${teamNumber} - ${statusLabels[status] || "Hazır"}`;
      }
    });
  });
}

/**
 * Skor düzenleme için tamamlanmış maçları yükler
 */
async function loadScoreEditMatches() {
  const listContainer = qs("score_edit_match_list");
  if (!listContainer) return;
  const form = qs("score_edit_form");
  
  listContainer.innerHTML = "<div class='loading'>Yükleniyor...</div>";
  if (form) {
    form.style.display = "none";
  }
  resetScoringInputs();
  
  try {
    const scheduleMatches = await apiGet("/api/match-schedule");
    const practiceMatches = await apiGet("/api/practice-matches");
    const merged = [
      ...(Array.isArray(scheduleMatches) ? scheduleMatches : []).map((m) => ({ ...m, source: "schedule" })),
      ...(Array.isArray(practiceMatches) ? practiceMatches : []).map((m) => ({
        ...m,
        source: "practice",
        match_type: m.match_type || "practice"
      }))
    ];
    const completed = merged.filter(m => m.status === "completed");
    scoreEditMatches = completed;
    
    if (completed.length === 0) {
      listContainer.innerHTML = "<div class='empty'>Tamamlanmış maç yok</div>";
      return;
    }
    
    // Filtreleme için tarih formatı
    const formatDate = (dateStr) => {
      if (!dateStr) return "";
      const date = new Date(dateStr);
      return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
    };
    
    // Takımları formatla
    const formatTeams = (alliance) => {
      if (!alliance || !Array.isArray(alliance)) return "-";
      return alliance.join(", ");
    };
    
    listContainer.innerHTML = completed.map(match => {
      const hasScores = match.red_score !== null && match.blue_score !== null;
      const isSelected = scoreEditSelected && scoreEditSelected.id === match.id && (scoreEditSelected.source || "schedule") === (match.source || "schedule");
      const matchDate = match.match_date || "";
      const matchTime = match.match_time || "";
      
      return `
        <div class="score-edit-match-card ${isSelected ? "selected" : ""}" data-match-id="${match.id}" data-match-source="${match.source || "schedule"}">
          <div class="score-edit-card-header">
            <div class="score-edit-card-title">
              <span class="score-edit-match-number">${match.match_type === "practice" ? "Deneme" : "Maç"} ${match.match_number || "-"}</span>
              <span class="score-edit-match-type">${getMatchTypeLabel(match.match_type)}</span>
            </div>
            <div class="score-edit-card-meta">
              <span class="score-edit-field">Saha ${match.field_number || "-"}</span>
              ${matchDate ? `<span class="score-edit-date">${formatDate(matchDate)} ${matchTime || ""}</span>` : ""}
            </div>
          </div>
          
          <div class="score-edit-card-teams">
            <div class="score-edit-alliance score-edit-red">
              <span class="alliance-label">Kırmızı</span>
              <span class="team-numbers">${formatTeams(match.red_alliance)}</span>
            </div>
            <div class="score-edit-alliance score-edit-blue">
              <span class="alliance-label">Mavi</span>
              <span class="team-numbers">${formatTeams(match.blue_alliance)}</span>
            </div>
          </div>
          
          ${hasScores ? `
            <div class="score-edit-card-scores">
              <div class="score-display-large">
                <div class="score-display-item score-red-large">
                  <span class="score-label">Kırmızı</span>
                  <span class="score-value">${match.red_score || 0}</span>
                </div>
                <div class="score-separator-large">-</div>
                <div class="score-display-item score-blue-large">
                  <span class="score-label">Mavi</span>
                  <span class="score-value">${match.blue_score || 0}</span>
                </div>
              </div>
            </div>
          ` : `
            <div class="score-edit-card-scores">
              <div class="score-display-large no-scores">
                <span>Skor girilmemiş</span>
              </div>
            </div>
          `}
          
          <div class="score-edit-card-actions">
            <button class="btn-primary btn-medium" data-action="edit">
              ${isSelected ? "✓ Seçili" : "Düzenle"}
            </button>
          </div>
        </div>
      `;
    }).join("");

    listContainer.querySelectorAll(".score-edit-match-card [data-action='edit']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const card = event.currentTarget.closest(".score-edit-match-card");
        const matchId = parseInt(card?.dataset.matchId || 0);
        const matchSource = card?.dataset.matchSource || "schedule";
        selectScoreEditMatch(matchId, matchSource);
      });
    });
    
    // Kartın tamamına tıklanabilirlik ekle
    listContainer.querySelectorAll(".score-edit-match-card").forEach((card) => {
      card.addEventListener("click", (event) => {
        // Butona tıklama değilse
        if (!event.target.closest("[data-action='edit']")) {
          const matchId = parseInt(card?.dataset.matchId || 0);
          const matchSource = card?.dataset.matchSource || "schedule";
          selectScoreEditMatch(matchId, matchSource);
        }
      });
    });
    
  } catch (err) {
    console.error("Load score edit matches error:", err);
    listContainer.innerHTML = "<div class='error'>Maç listesi yüklenirken hata oluştu</div>";
  }
}

/**
 * Skor düzenleme için maç seçer
 */
function selectScoreEditMatch(matchId, matchSource) {
  const form = qs("score_edit_form");
  const info = qs("score_edit_match_info");
  const redInput = qs("score_edit_red_score");
  const blueInput = qs("score_edit_blue_score");
  const notesInput = qs("score_edit_notes");
  const match = scoreEditMatches.find((m) => m.id === matchId && (m.source || "schedule") === (matchSource || "schedule"));
  
  // Önceki seçili kartı temizle
  const listContainer = qs("score_edit_match_list");
  if (listContainer) {
    listContainer.querySelectorAll(".score-edit-match-card").forEach(card => {
      card.classList.remove("selected");
      const btn = card.querySelector("[data-action='edit']");
      if (btn) btn.textContent = "Düzenle";
    });
    
    // Yeni seçili kartı vurgula
    const selectedCard = listContainer.querySelector(`[data-match-id="${matchId}"][data-match-source="${matchSource}"]`);
    if (selectedCard) {
      selectedCard.classList.add("selected");
      const btn = selectedCard.querySelector("[data-action='edit']");
      if (btn) btn.textContent = "✓ Seçili";
    }
  }
  if (!match || !form || !info || !redInput || !blueInput) return;

  scoreEditSelected = match;
  info.textContent = `Maç ${match.match_number} • ${getMatchTypeLabel(match.match_type)} • Saha ${match.field_number}`;
  redInput.value = match.red_score ?? 0;
  blueInput.value = match.blue_score ?? 0;
  if (notesInput) {
    notesInput.value = match.notes || "";
  }
  form.style.display = "block";
  if (typeof moveDetailedScoringTo === "function") {
    moveDetailedScoringTo("score_edit_detailed_slot");
  }
  if (typeof renderDetailedAllianceTeams === "function") {
    renderDetailedAllianceTeams("blue", match.blue_alliance);
    renderDetailedAllianceTeams("red", match.red_alliance);
  }
  applyScoringData(match.scoring_data || {});
  calculateScoreBreakdown();
}

/**
 * Skor düzenleme kaydı
 */
async function saveScoreEdit() {
  if (!scoreEditSelected) {
    showToast("Önce bir maç seçin", "warning");
    return;
  }
  const redInput = qs("score_edit_red_score");
  const blueInput = qs("score_edit_blue_score");
  const notesInput = qs("score_edit_notes");
  if (!redInput || !blueInput) return;
  const redScore = parseInt(redInput.value || 0);
  const blueScore = parseInt(blueInput.value || 0);
  if (Number.isNaN(redScore) || Number.isNaN(blueScore)) {
    showToast("Geçerli skor girin", "warning");
    return;
  }
  try {
    const scoringData = {
      blue: collectScoringData("blue"),
      red: collectScoringData("red"),
      team_statuses: collectTeamStatuses()
    };
    await apiPost("/api/match-control/score", {
      match_id: scoreEditSelected.id,
      red_score: redScore,
      blue_score: blueScore,
      match_source: scoreEditSelected.source || "schedule",
      scoring_data: scoringData,
      notes: notesInput?.value || ""
    });
    scoreEditSelected.red_score = redScore;
    scoreEditSelected.blue_score = blueScore;
    scoreEditSelected.scoring_data = scoringData;
    scoreEditSelected.notes = notesInput?.value || "";
    showToast("Skor güncellendi", "success");
    await loadScoreEditMatches();
  } catch (err) {
    console.error("Score edit save error:", err);
    showToast("Skor kaydedilemedi", "error");
  }
}

/**
 * Skor düzenlemeden sonuç gönderir
 */
async function showScoreEditResults() {
  if (!scoreEditSelected) {
    showToast("Önce bir maç seçin", "warning");
    return;
  }
  try {
    if (typeof buildMatchResultsPayloadForMatch === "function") {
      const payload = buildMatchResultsPayloadForMatch(scoreEditSelected);
      await apiPost("/api/screens/preview", {
        view: "match",
        mode: "preview",
        duration_seconds: 45,
        payload
      });
      showToast("Sonuçlar seyirci ekranına gönderildi", "success");
    }
  } catch (err) {
    console.error("Score edit results error:", err);
    showToast("Sonuçlar gönderilemedi", "error");
  }
}

/**
 * Maçı kaydeder ve yayınlar
 */
async function commitAndPostMatch() {
  if (!currentMatch) {
    showToast("Önce bir maç seçin", "warning");
    return;
  }
  
  if (currentMatch.status !== "completed") {
    showToast("Önce maçı tamamlayın", "warning");
    return;
  }
  
  // Çift tıklamayı önle
  const btnCommit = qs("btn_commit_post");
  if (btnCommit && btnCommit.disabled) {
    return; // Zaten işlem yapılıyor
  }
  
  // Buton loading state
  if (btnCommit && typeof setButtonLoading === "function") {
    setButtonLoading(btnCommit, true);
  }
  
  // Skorları hesapla ve güncelle
  calculateScoreBreakdown();
  
  const redScore = parseInt(qs("red_total_score")?.textContent || 0);
  const blueScore = parseInt(qs("blue_total_score")?.textContent || 0);
  
  try {
    await apiPost("/api/match-control/score", {
      match_id: currentMatch.id,
      red_score: redScore,
      blue_score: blueScore,
      match_source: currentMatch.source || "schedule"
    });
    
    // Skorları güncelle
    currentMatch.red_score = redScore;
    currentMatch.blue_score = blueScore;
    
    showToast("Maç kaydedildi ve yayınlandı", "success");
    
    // Maç listelerini güncelle
    if (typeof loadMatchList === "function") {
      await loadMatchList();
    }
    if (typeof loadScheduleMatches === "function") {
      await loadScheduleMatches();
    }
    
  } catch (err) {
    console.error("Commit match error:", err);
    showToast("Maç kaydedilirken hata oluştu", "error");
  } finally {
    // Buton loading state'i kaldır
    if (btnCommit && typeof setButtonLoading === "function") {
      setButtonLoading(btnCommit, false);
    }
  }
}

/**
 * Otomatik skor kaydetme için debounce timer
 */
let autoSaveScoreTimer = null;
const AUTO_SAVE_SCORE_DELAY = 800; // 800ms debounce - kullanıcı yazmayı bitirdikten sonra kaydet
let isAutoSavingScore = false; // Çakışmayı önlemek için

/**
 * Skorları otomatik olarak kaydeder (kullanıcıya bildirim göstermez)
 * Hakem panelleri ile aynı mantık - debounce ile otomatik kaydetme
 */
async function autoSaveScoreFromMatchControl() {
  if (isAutoSavingScore) return; // Zaten kaydediliyorsa bekle
  if (!currentMatch || !currentMatch.id) return;
  
  // Sadece aktif maçlar için otomatik kaydet (preview veya completed maçlar için gerek yok)
  if (currentMatch.status !== "in_progress") {
    return;
  }
  
  const blueScoringData = collectScoringData("blue");
  const redScoringData = collectScoringData("red");
  
  // Eğer hiçbir skor girişi yoksa kaydetme
  const hasData = Object.values(blueScoringData).some(v => v !== 0 && v !== false) ||
                  Object.values(redScoringData).some(v => v !== 0 && v !== false);
  if (!hasData) {
    return;
  }
  
  isAutoSavingScore = true;
  try {
    // Her iki ittifak için de skorları kaydet (paralel)
    await Promise.all([
      apiPost("/api/match-control/score/detailed", {
        match_id: currentMatch.id,
        alliance: "blue",
        scoring_data: blueScoringData,
        match_source: currentMatch.source || "schedule"
      }).catch(err => {
        console.warn("Auto save blue score error:", err);
        return null;
      }),
      apiPost("/api/match-control/score/detailed", {
        match_id: currentMatch.id,
        alliance: "red",
        scoring_data: redScoringData,
        match_source: currentMatch.source || "schedule"
      }).catch(err => {
        console.warn("Auto save red score error:", err);
        return null;
      })
    ]);
    
    // Otomatik kaydetmede toast gösterme (kullanıcıyı rahatsız etmemek için)
    // Sadece console'da log
    console.log("Match-control: Skorlar otomatik olarak kaydedildi", {
      matchId: currentMatch.id,
      matchNumber: currentMatch.match_number
    });
    
    // Breakdown'ı güncelle (UI'da görünsün)
    if (typeof calculateScoreBreakdown === "function") {
      calculateScoreBreakdown();
    }
  } catch (err) {
    console.error("Auto save score error:", err);
    // Hata durumunda sessizce devam et (kullanıcı manuel kaydetmeyi deneyebilir)
  } finally {
    isAutoSavingScore = false;
  }
}

/**
 * Otomatik skor kaydetmeyi planlar (debounce)
 */
function scheduleAutoSaveScore() {
  if (autoSaveScoreTimer) {
    clearTimeout(autoSaveScoreTimer);
  }
  autoSaveScoreTimer = setTimeout(() => {
    autoSaveScoreFromMatchControl().catch(err => {
      console.error("Scheduled auto save error:", err);
    });
  }, AUTO_SAVE_SCORE_DELAY);
}

// Global fonksiyonlar (HTML'den çağrılabilir)
window.updateScoreFromDetailedScoring = updateScoreFromDetailedScoring;
