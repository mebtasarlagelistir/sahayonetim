"""
Partner-dengeli fikstür üretici (paylaşılan çekirdek).

Bu modül, hem resmi sıralama maçları (routes/match_schedule.py) hem de deneme
maçları (routes/practice_matches.py) tarafından kullanılan adil maç eşleştirme
algoritmasını içerir. Saf bir fonksiyondur: takım listesi + format alır,
ittifak çiftlerinden oluşan bir takvim döndürür. Zaman/saha/persist işlemleri
çağıran tarafa aittir.

Hedeflenen kurallar:
- KESİN: Her takım mümkün olduğunca eşit sayıda maç yapar (matches_per_team).
- KESİN (hard_unique_partners=True): İki takım matematiksel olarak mümkünse
  yalnızca BİR KEZ partner (aynı ittifak) olur; imkânsızsa tekrar minimize edilir.
- YUMUŞAK: Kırmızı/mavi dağılımı dengeli olur.
- YUMUŞAK: Rakip çeşitliliği (opponent_penalty) gözetilir.
- Dinlenme: Ardışık maçlar min_gap_matches ile sınırlanır.

Üç katmanlı üretim (deadlock'a karşı kademeli yumuşatma):
  1) partner-dengeli (kombinasyon araması; hard_unique_partners burada uygulanır)
  2) relaxed (rastgele örnekleme, cezalar yarıya iner, tekrara izin verir)
  3) shuffle (yalnız eşit maç sayısını garanti eden basit havuz karıştırma)
"""

from __future__ import annotations

import itertools
import random
from typing import Dict, List, Optional


def generate_partner_balanced_fixture(
    team_numbers: List[str],
    teams_per_alliance: int,
    matches_per_team: int,
    num_matches: int,
    *,
    min_gap_matches: int = 1,
    partner_penalty: int = 120,
    opponent_penalty: int = 80,
    hard_unique_partners: bool = True,
    max_attempts: int = 100,
    relaxed_attempts: int = 20,
    rng: Optional[random.Random] = None,
) -> Optional[List[Dict[str, List[str]]]]:
    """
    Partner-dengeli bir maç takvimi üretir.

    Args:
        team_numbers: Takım numaraları listesi (tekilleştirilmiş olmalı).
        teams_per_alliance: İttifak başına takım (genelde 2).
        matches_per_team: Her takımın hedef maç sayısı.
        num_matches: Üretilecek toplam maç sayısı.
        min_gap_matches: Aynı takımın iki maçı arasında istenen minimum boşluk.
        partner_penalty / opponent_penalty: Tekrar cezaları.
        hard_unique_partners: True ise partner tekrarı mümkün olduğunca yasaklanır
            (uygun bölünme yoksa o denemede başarısız olunur, üst katmana düşülür).
        max_attempts: 1. katman (partner-dengeli) deneme sayısı.
        relaxed_attempts: 2. katman (relaxed) deneme sayısı.
        rng: random.Random örneği (test/tekrarlanabilirlik için); None ise global.

    Returns:
        [{"red_alliance": [...], "blue_alliance": [...]}, ...] veya üretilemezse None.
    """
    _rng = rng or random
    required_count = teams_per_alliance * 2

    if len(team_numbers) < required_count:
        return None
    if not matches_per_team or matches_per_team < 1:
        return None
    if not num_matches or num_matches < 1:
        return None

    # --- 1. katman: partner-dengeli (kombinasyon araması) ---
    def _partner_balanced() -> Optional[List[Dict[str, List[str]]]]:
        match_counts = {team: 0 for team in team_numbers}
        partner_history = {team: set() for team in team_numbers}
        opponent_history = {team: set() for team in team_numbers}
        last_match_index = {team: None for team in team_numbers}
        schedule_pairs: List[Dict[str, List[str]]] = []

        def _team_priority(team, match_index):
            remaining = matches_per_team - match_counts[team]
            if remaining <= 0:
                # Kapasite üstü: normalde havuza girmez (yalnız kapasite tükenince
                # tolerans doldurmasıyla girer). En az oynamış takım tercih edilsin
                # diye sonlu ve caydırıcı bir öncelik döndürülür (eskiden -inf idi;
                # -inf, combo skorlarını eşitleyip seçimi bozuyordu).
                return -10000 - match_counts[team] * 100
            expected = (match_index / max(1, num_matches)) * matches_per_team
            behind = max(0, expected - match_counts[team])
            last_idx = last_match_index.get(team)
            if last_idx is None:
                gap_matches = 999
            else:
                gap_matches = match_index - last_idx - 1
            rest_bonus = min(50, max(0, gap_matches) * 10)
            urgency = remaining * 50 + behind * 120
            return urgency + rest_bonus

        def _combo_score(combo, match_index):
            base_score = sum(_team_priority(t, match_index) for t in combo)
            consecutive_penalty = 0
            for team in combo:
                last_idx = last_match_index.get(team)
                if last_idx is None:
                    continue
                gap_matches = match_index - last_idx - 1
                if gap_matches < min_gap_matches:
                    consecutive_penalty += 250
                elif gap_matches == 1:
                    consecutive_penalty += 80
            return base_score - consecutive_penalty

        def _best_split_for_combo(combo, match_index):
            best = None
            best_score = float("-inf")
            combo_list = list(combo)
            for red_alliance in itertools.combinations(combo_list, teams_per_alliance):
                red_alliance = list(red_alliance)
                blue_alliance = [t for t in combo_list if t not in red_alliance]
                if len(blue_alliance) != teams_per_alliance:
                    continue

                partner_repeat_count = 0
                for alliance in (red_alliance, blue_alliance):
                    for i in range(len(alliance)):
                        for j in range(i + 1, len(alliance)):
                            if alliance[j] in partner_history[alliance[i]]:
                                partner_repeat_count += 1

                # Hard kural: partner tekrarı içeren bölünmeleri ele (uygun bölünme
                # bulunamazsa bu combo atlanır, gerekirse üst katmana düşülür).
                if hard_unique_partners and partner_repeat_count > 0:
                    continue

                partner_pen = partner_repeat_count * partner_penalty

                opponent_pen = 0
                for blue_team in blue_alliance:
                    for red_team in red_alliance:
                        if red_team in opponent_history[blue_team]:
                            opponent_pen += opponent_penalty

                # Eşit skorlu bölünmelerde kırmızı/mavi atamasının hep aynı (sıralı)
                # çıkmaması için küçük jitter eklenir (adalet farklarını ezmeyecek kadar).
                total = (
                    _combo_score(combo_list, match_index)
                    - partner_pen
                    - opponent_pen
                    + _rng.random() * 0.001
                )
                if total > best_score:
                    best_score = total
                    best = (red_alliance[:], blue_alliance[:])
            return best, best_score

        for _match_index in range(1, num_matches + 1):
            eligible = [t for t, c in match_counts.items() if c < matches_per_team]
            if len(eligible) < required_count:
                # Kapasite tükendi (num_matches * required > matches_per_team * n).
                # Bu, takım sayısının ittifak boyutuna tam bölünmediği durumlarda olur
                # (ör. 26 takım, tek matches_per_team). Herkesin oynaması için en az
                # oynamış takımlarla doldur; bazı takımlar matches_per_team + 1 oynar.
                extra = sorted(
                    (t for t in team_numbers if t not in eligible),
                    key=lambda t: match_counts[t],
                )
                eligible = eligible + extra
                if len(eligible) < required_count:
                    return None

            # Eşit önceliklerde takım-numarası sırasına saplanmamak için önce karıştır;
            # stable sort sayesinde yalnız eşit-öncelikli takımların sırası rastgelelenir.
            shuffled_eligible = list(eligible)
            _rng.shuffle(shuffled_eligible)
            eligible_sorted = sorted(
                shuffled_eligible,
                key=lambda t: _team_priority(t, _match_index),
                reverse=True,
            )
            top_k = min(len(eligible_sorted), max(required_count * 2, 10))
            candidate_pool = eligible_sorted[:top_k]

            best_combo = None
            best_split = None
            best_score = float("-inf")

            for combo in itertools.combinations(candidate_pool, required_count):
                split, score = _best_split_for_combo(combo, _match_index)
                if split is None:
                    continue
                # Eşit skorlu kombinasyonlar arasında rastgele seçim (mekanik sırayı kır).
                score += _rng.random() * 0.01
                if score > best_score:
                    best_score = score
                    best_combo = combo
                    best_split = split

            if best_split is None:
                return None

            red_alliance, blue_alliance = best_split
            candidates = list(best_combo)

            for alliance in (blue_alliance, red_alliance):
                for i in range(len(alliance)):
                    for j in range(i + 1, len(alliance)):
                        a = alliance[i]
                        b = alliance[j]
                        partner_history[a].add(b)
                        partner_history[b].add(a)

            for blue_team in blue_alliance:
                opponent_history[blue_team].update(red_alliance)
            for red_team in red_alliance:
                opponent_history[red_team].update(blue_alliance)

            for team in candidates:
                match_counts[team] += 1
                last_match_index[team] = _match_index

            schedule_pairs.append(
                {"blue_alliance": blue_alliance[:], "red_alliance": red_alliance[:]}
            )

        return schedule_pairs

    # --- 2. katman: relaxed (tekrara izin verir, cezalar yarıda) ---
    def _relaxed() -> Optional[List[Dict[str, List[str]]]]:
        match_counts = {team: 0 for team in team_numbers}
        partner_history = {team: set() for team in team_numbers}
        opponent_history = {team: set() for team in team_numbers}
        last_match_index = {team: None for team in team_numbers}
        schedule_pairs: List[Dict[str, List[str]]] = []

        for _match_index in range(1, num_matches + 1):
            eligible = [t for t, c in match_counts.items() if c < matches_per_team]
            if len(eligible) < required_count:
                # Tolerans: kapasite tükendiğinde en az oynamışlarla doldur (±1).
                extra = sorted(
                    (t for t in team_numbers if t not in eligible),
                    key=lambda t: match_counts[t],
                )
                eligible = eligible + extra
                if len(eligible) < required_count:
                    return None

            match_found = False
            best_candidates = None
            best_score = float("-inf")

            for _ in range(2000):
                _rng.shuffle(eligible)
                candidates = eligible[:required_count]
                blue_alliance = candidates[:teams_per_alliance]
                red_alliance = candidates[teams_per_alliance:required_count]

                valid_gap = True
                for team in candidates:
                    last_idx = last_match_index.get(team)
                    if last_idx is None:
                        continue
                    gap_matches = _match_index - last_idx - 1
                    if gap_matches < max(0, min_gap_matches - 1):
                        valid_gap = False
                        break
                if not valid_gap:
                    continue

                partner_repeat_penalty = 0
                for alliance in (blue_alliance, red_alliance):
                    for i in range(len(alliance)):
                        for j in range(i + 1, len(alliance)):
                            if alliance[j] in partner_history[alliance[i]]:
                                partner_repeat_penalty += partner_penalty // 2

                opponent_repeat_penalty = 0
                for blue_team in blue_alliance:
                    for red_team in red_alliance:
                        if red_team in opponent_history[blue_team]:
                            opponent_repeat_penalty += opponent_penalty // 2

                rest_score = 0
                for team in candidates:
                    last_idx = last_match_index.get(team)
                    if last_idx is None:
                        rest_score += 8
                        continue
                    gap_matches = _match_index - last_idx - 1
                    if gap_matches <= 0:
                        rest_score -= 40
                    elif gap_matches == 1:
                        rest_score -= 10
                    else:
                        rest_score += min(40, gap_matches * 6)

                total_score = rest_score - partner_repeat_penalty - opponent_repeat_penalty
                if total_score > best_score:
                    best_score = total_score
                    best_candidates = {
                        "blue_alliance": blue_alliance[:],
                        "red_alliance": red_alliance[:],
                        "candidates": candidates[:],
                    }
                    match_found = True

            if not match_found:
                return None

            chosen = best_candidates
            blue_alliance = chosen["blue_alliance"]
            red_alliance = chosen["red_alliance"]
            candidates = chosen["candidates"]

            for alliance in (blue_alliance, red_alliance):
                for i in range(len(alliance)):
                    for j in range(i + 1, len(alliance)):
                        a = alliance[i]
                        b = alliance[j]
                        partner_history[a].add(b)
                        partner_history[b].add(a)

            for blue_team in blue_alliance:
                opponent_history[blue_team].update(red_alliance)
            for red_team in red_alliance:
                opponent_history[red_team].update(blue_alliance)

            for team in candidates:
                match_counts[team] += 1
                last_match_index[team] = _match_index

            schedule_pairs.append(
                {"blue_alliance": blue_alliance[:], "red_alliance": red_alliance[:]}
            )

        return schedule_pairs

    # --- 3. katman: shuffle (yalnız eşit maç sayısını garanti eder) ---
    def _shuffle() -> Optional[List[Dict[str, List[str]]]]:
        base_pool = []
        for team in team_numbers:
            base_pool.extend([team] * matches_per_team)
        # Kapasite, gereken toplam slottan azsa (tam bölünmeyen takım sayısı)
        # en az temsil edilenlerle pad'le ki tüm maçlar dolabilsin (±1 tolerans).
        needed_total = num_matches * required_count
        pad_idx = 0
        while len(base_pool) < needed_total and team_numbers:
            base_pool.append(team_numbers[pad_idx % len(team_numbers)])
            pad_idx += 1

        for _ in range(200):
            pool = base_pool[:]
            _rng.shuffle(pool)
            matches = []
            ok = True
            for _match_index in range(1, num_matches + 1):
                selected = []
                idx = 0
                while len(selected) < required_count and idx < len(pool):
                    team = pool[idx]
                    if team not in selected:
                        selected.append(team)
                        pool.pop(idx)
                    else:
                        idx += 1
                if len(selected) < required_count:
                    ok = False
                    break
                matches.append(
                    {
                        "blue_alliance": selected[:teams_per_alliance],
                        "red_alliance": selected[teams_per_alliance:],
                    }
                )
            if ok:
                return matches
        return None

    for _ in range(max_attempts):
        result = _partner_balanced()
        if result is not None:
            return result

    for _ in range(relaxed_attempts):
        result = _relaxed()
        if result is not None:
            return result

    return _shuffle()
