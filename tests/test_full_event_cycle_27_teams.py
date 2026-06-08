#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tam Etkinlik Döngüsü Testi – 27 takım, sıralama maçları, SP ve final eşleşmeleri.

Sunucu çalışırken: python -m tests.test_full_event_cycle_27_teams

Akış:
  1. Giriş, etkinlik oluştur, 27 dummy takım ekle
  2. Sıralama maç takvimi oluştur (takım başına 2 maç)
  3. Tüm sıralama maçlarını oynat (skorlar SP farklı olsun diye değişken)
  4. Maç tamamlamada scoring_data göndererek SP (ranking_points) kaydı sağla
  5. Final maçlarını SP sıralamasına göre oluştur (max 8 takım)
  6. Bracket eşleşmesini doğrula: 1–2 vs 8–7, 3–4 vs 6–5
  7. Birkaç final maçı oynat; kazanan/kaybeden sonuçlarını kontrol et

Not: SP (ranking_points) kaydı için maç tamamlanırken complete isteğinde
     scoring_data gönderilmeli (referee/score/get ile alınan red/blue verisi).
"""

# Kaç sıralama / final maçı oynanacak (isteğe bağlı kısıtlama)
MAX_QUAL_MATCHES_TO_PLAY = None  # None = tümü

import os
import sys
import io
from datetime import datetime, timedelta
from copy import deepcopy

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests

BASE_URL = os.environ.get("MEMSKOR_TEST_URL", "http://127.0.0.1:5000")
LOGIN_USER = os.environ.get("MEMSKOR_TEST_USER", "admin")
LOGIN_PASS = os.environ.get("MEMSKOR_TEST_PASS", "admin123")

NUM_TEAMS = 27
MAX_FINAL_TEAMS = 8
MATCHES_PER_TEAM_QUAL = 2
FINAL_MATCHES_TO_PLAY = 2

# 27 takım: 99001–99027
DUMMY_TEAMS = [
    {"number": f"99{i:03d}", "name": f"Test Takım {i}", "school": f"Test Okulu {i}", "city": "İstanbul"}
    for i in range(1, NUM_TEAMS + 1)
]

# Detaylı puanlama şablonları (skorları maça göre hafif değiştiriyoruz)
RED_BASE = {
    "auto_leave_r1": True,
    "auto_leave_r2": True,
    "auto_bent1_own": 2,
    "auto_bent2_correct": 1,
    "auto_bent2_wrong": 0,
    "auto_bent3_correct": 0,
    "auto_bent3_wrong": 0,
    "auto_tank_own": 1,
    "teleop_bent1_own": 3,
    "teleop_bent2_correct": 2,
    "teleop_bent2_wrong": 0,
    "teleop_bent3_correct": 1,
    "teleop_bent3_wrong": 0,
    "teleop_tank_own": 2,
    "teleop_source_entry": 1,
    "teleop_climb": 2,
    "yellow_card": 0,
    "major_penalty": 0,
}

BLUE_BASE = {
    "auto_leave_r1": True,
    "auto_leave_r2": False,
    "auto_bent1_own": 1,
    "auto_bent2_correct": 1,
    "auto_bent2_wrong": 0,
    "auto_bent3_correct": 0,
    "auto_bent3_wrong": 0,
    "auto_tank_own": 0,
    "teleop_bent1_own": 2,
    "teleop_bent2_correct": 1,
    "teleop_bent2_wrong": 0,
    "teleop_bent3_correct": 0,
    "teleop_bent3_wrong": 1,
    "teleop_tank_own": 1,
    "teleop_source_entry": 1,
    "teleop_climb": 1,
    "yellow_card": 0,
    "major_penalty": 0,
}


def log(msg: str, ok: bool | None = None) -> None:
    prefix = "[OK] " if ok is True else "[FAIL] " if ok is False else "[INFO] "
    print(prefix + msg)


def _ensure_json_headers(session: requests.Session) -> None:
    if "Content-Type" not in session.headers or session.headers["Content-Type"] != "application/json":
        session.headers["Content-Type"] = "application/json"


def play_one_qual_match(
    session: requests.Session,
    match_id: int,
    match_number: int,
    red_wins: bool,
) -> tuple[int, int]:
    """
    Tek bir sıralama maçını baştan sona oynatır.
    red_wins True ise kırmızı yüksek skor alır.
    SP kaydı için complete isteğinde scoring_data gönderilir.
    Returns: (red_score, blue_score)
    """
    _ensure_json_headers(session)
    team_statuses = {
        "red": {"r1": "ready", "r2": "ready"},
        "blue": {"r1": "ready", "r2": "ready"},
    }
    # Skorları maç numarasına göre hafif değiştir (SP çeşitliliği)
    red_bonus = (match_number % 5) * 2
    blue_bonus = ((match_number + 2) % 5) * 2
    if red_wins:
        red_data = deepcopy(RED_BASE)
        red_data["teleop_bent1_own"] = RED_BASE["teleop_bent1_own"] + red_bonus
        blue_data = deepcopy(BLUE_BASE)
    else:
        red_data = deepcopy(RED_BASE)
        blue_data = deepcopy(BLUE_BASE)
        blue_data["teleop_bent1_own"] = BLUE_BASE["teleop_bent1_own"] + blue_bonus

    r = session.post(
        BASE_URL + "/api/match-control/start",
        json={"match_id": match_id, "match_source": "schedule", "team_statuses": team_statuses},
        timeout=10,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Maç başlatılamadı: {r.status_code} – {r.text[:200]}")

    r = session.post(
        BASE_URL + "/api/match-control/score/detailed",
        json={"match_id": match_id, "alliance": "red", "scoring_data": red_data, "match_source": "schedule"},
        timeout=10,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Kırmızı skor: {r.status_code}")
    red_calc = r.json().get("calculated_score", 0)

    r = session.post(
        BASE_URL + "/api/match-control/score/detailed",
        json={"match_id": match_id, "alliance": "blue", "scoring_data": blue_data, "match_source": "schedule"},
        timeout=10,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Mavi skor: {r.status_code}")
    blue_calc = r.json().get("calculated_score", 0)

    if red_wins and red_calc <= blue_calc:
        red_calc, blue_calc = blue_calc + 10, red_calc
    if not red_wins and blue_calc <= red_calc:
        blue_calc, red_calc = red_calc + 10, blue_calc

    for alliance in ("red", "blue"):
        r = session.post(
            BASE_URL + "/api/referee/submit",
            json={"match_id": match_id, "alliance": alliance, "match_source": "schedule"},
            timeout=10,
        )
        if r.status_code != 200:
            raise RuntimeError(f"Submit {alliance}: {r.status_code}")

    r = session.post(
        BASE_URL + "/api/referee/approve",
        json={"match_id": match_id, "match_source": "schedule"},
        timeout=10,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Onay: {r.status_code}")

    # SP kaydı için mevcut skor verisini alıp complete ile gönder
    r = session.get(
        BASE_URL + f"/api/referee/score/get/{match_id}",
        params={"source": "schedule"},
        timeout=10,
    )
    scoring_data_for_complete = {}
    if r.status_code == 200:
        data = r.json()
        if data.get("red", {}).get("scoring_data"):
            scoring_data_for_complete["red"] = data["red"]["scoring_data"]
        if data.get("blue", {}).get("scoring_data"):
            scoring_data_for_complete["blue"] = data["blue"]["scoring_data"]

    r = session.post(
        BASE_URL + "/api/match-control/complete",
        json={
            "match_id": match_id,
            "red_score": red_calc,
            "blue_score": blue_calc,
            "match_source": "schedule",
            "scoring_data": scoring_data_for_complete if scoring_data_for_complete else None,
        },
        timeout=10,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Complete: {r.status_code} – {r.text[:200]}")

    return red_calc, blue_calc


def play_one_final_match(
    session: requests.Session,
    match_id: int,
    red_wins: bool,
) -> tuple[int, int]:
    """Tek bir final maçını oynatır (schedule yerine aynı API, match_type final)."""
    _ensure_json_headers(session)
    team_statuses = {"red": {"r1": "ready", "r2": "ready"}, "blue": {"r1": "ready", "r2": "ready"}}
    red_data = deepcopy(RED_BASE)
    blue_data = deepcopy(BLUE_BASE)
    if red_wins:
        red_data["teleop_climb"] = 2
        blue_data["teleop_climb"] = 0
    else:
        blue_data["teleop_climb"] = 2
        red_data["teleop_climb"] = 0

    r = session.post(
        BASE_URL + "/api/match-control/start",
        json={"match_id": match_id, "match_source": "schedule", "team_statuses": team_statuses},
        timeout=10,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Final maç başlatılamadı: {r.status_code}")

    red_calc = blue_calc = 0
    for alliance, data in (("red", red_data), ("blue", blue_data)):
        r = session.post(
            BASE_URL + "/api/match-control/score/detailed",
            json={"match_id": match_id, "alliance": alliance, "scoring_data": data, "match_source": "schedule"},
            timeout=10,
        )
        if r.status_code != 200:
            raise RuntimeError(f"Final skor {alliance}: {r.status_code}")
        if alliance == "red":
            red_calc = r.json().get("calculated_score", 0)
        else:
            blue_calc = r.json().get("calculated_score", 0)

    if red_wins and red_calc <= blue_calc:
        red_calc = blue_calc + 10
    if not red_wins and blue_calc <= red_calc:
        blue_calc = red_calc + 10

    for alliance in ("red", "blue"):
        session.post(
            BASE_URL + "/api/referee/submit",
            json={"match_id": match_id, "alliance": alliance, "match_source": "schedule"},
            timeout=10,
        )
    session.post(
        BASE_URL + "/api/referee/approve",
        json={"match_id": match_id, "match_source": "schedule"},
        timeout=10,
    )

    r = session.get(BASE_URL + f"/api/referee/score/get/{match_id}", params={"source": "schedule"}, timeout=10)
    scoring_data_for_complete = {}
    if r.status_code == 200:
        data = r.json()
        if data.get("red", {}).get("scoring_data"):
            scoring_data_for_complete["red"] = data["red"]["scoring_data"]
        if data.get("blue", {}).get("scoring_data"):
            scoring_data_for_complete["blue"] = data["blue"]["scoring_data"]

    r = session.post(
        BASE_URL + "/api/match-control/complete",
        json={
            "match_id": match_id,
            "red_score": red_calc,
            "blue_score": blue_calc,
            "match_source": "schedule",
            "scoring_data": scoring_data_for_complete or None,
        },
        timeout=10,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Final complete: {r.status_code}")

    return red_calc, blue_calc


def main() -> None:
    session = requests.Session()
    session.headers.update({"Accept": "application/json"})

    print("=" * 60)
    print("MEMSKOR – 27 Takım Tam Etkinlik Döngüsü (SP + Final Eşleşmeleri)")
    print("BASE_URL:", BASE_URL)
    print("=" * 60)

    # --- 1. Giriş ---
    log("1. Giriş yapılıyor...")
    try:
        r = session.post(
            BASE_URL + "/login",
            data={"username": LOGIN_USER, "password": LOGIN_PASS},
            allow_redirects=True,
            timeout=10,
        )
    except requests.exceptions.ConnectionError:
        log("Sunucuya bağlanılamadı. Önce sunucuyu başlatın.", ok=False)
        return
    if r.status_code not in (200, 302):
        log(f"Giriş başarısız: {r.status_code}", ok=False)
        return
    log("Giriş başarılı", ok=True)
    session.headers["Content-Type"] = "application/json"

    # --- 2. Etkinlik + aktif ---
    log("2. Etkinlik oluşturuluyor ve aktif yapılıyor...")
    event_name = f"Test 27 Takım {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    r = session.post(BASE_URL + "/api/events", json={"name": event_name, "code": "T27", "season": "2025-2026"}, timeout=10)
    if r.status_code not in (200, 201):
        log(f"Etkinlik oluşturulamadı: {r.status_code}", ok=False)
        return
    events = session.get(BASE_URL + "/api/events", timeout=10).json()
    if not events:
        log("Etkinlik listesi boş", ok=False)
        return
    event_id = events[-1]["id"]
    r = session.post(BASE_URL + "/api/events/active", json={"id": event_id}, timeout=10)
    if r.status_code != 200:
        log("Aktif etkinlik ayarlanamadı", ok=False)
        return
    log(f"Etkinlik id={event_id} aktif", ok=True)

    # --- 3. 27 takım ekle ---
    log("3. 27 dummy takım ekleniyor...")
    r = session.post(BASE_URL + "/api/teams", json=DUMMY_TEAMS, timeout=10)
    if r.status_code not in (200, 201):
        log(f"Takımlar eklenemedi: {r.status_code} – {r.text[:200]}", ok=False)
        return
    log("27 takım eklendi", ok=True)

    # --- 4. Sıralama maç takvimi (takım başına 2 maç) ---
    log("4. Sıralama maç takvimi oluşturuluyor...")
    start = datetime.now() + timedelta(minutes=5)
    r = session.post(
        BASE_URL + "/api/match-schedule/generate",
        json={
            "start_date": start.strftime("%Y-%m-%d"),
            "start_time": start.strftime("%H:%M"),
            "field_count": 1,
            "teams_per_alliance": 2,
            "match_cycle_minutes": 6,
            "matches_per_team": MATCHES_PER_TEAM_QUAL,
            "clear_existing": True,
        },
        timeout=30,
    )
    if r.status_code != 200:
        log(f"Maç takvimi oluşturulamadı: {r.status_code} – {r.text[:400]}", ok=False)
        return
    log("Sıralama maç takvimi oluşturuldu", ok=True)

    schedule = session.get(BASE_URL + "/api/match-schedule", timeout=10).json()
    qual_matches = [m for m in schedule if m.get("match_type") == "qualification"]
    log(f"Sıralama maç sayısı: {len(qual_matches)}", ok=True)

    # --- 5. Tüm sıralama maçlarını oynat (SP için scoring_data complete ile) ---
    log("5. Sıralama maçları oynatılıyor (SP kaydı için scoring_data complete ile)...")
    to_play = qual_matches
    if MAX_QUAL_MATCHES_TO_PLAY is not None:
        to_play = qual_matches[:MAX_QUAL_MATCHES_TO_PLAY]
    played = 0
    for i, m in enumerate(to_play):
        match_id = m["id"]
        match_number = m.get("match_number", i + 1)
        red_wins = (match_number % 2) == 1
        try:
            play_one_qual_match(session, match_id, match_number, red_wins=red_wins)
            played += 1
            if (played % 5) == 0 or played == len(to_play):
                log(f"  Oynanan sıralama maçı: {played}/{len(to_play)}", ok=True)
        except Exception as e:
            log(f"Maç {match_id} (No {match_number}) hata: {e}", ok=False)
            break
    if played == 0:
        log("Hiç sıralama maçı oynanamadı", ok=False)
        return
    log(f"Toplam {played} sıralama maçı tamamlandı", ok=True)

    # --- 6. Final maçlarını SP sıralamasına göre oluştur ---
    log("6. Final maçları SP sıralamasına göre oluşturuluyor (max_teams=8)...")
    final_start = datetime.now() + timedelta(minutes=10)
    r = session.post(
        BASE_URL + "/api/match-schedule/generate-finals",
        json={
            "start_date": final_start.strftime("%Y-%m-%d"),
            "start_time": final_start.strftime("%H:%M"),
            "field_number": 1,
            "teams_per_alliance": 2,
            "max_teams": MAX_FINAL_TEAMS,
            "match_cycle_minutes": 6,
            "clear_existing": True,
        },
        timeout=15,
    )
    if r.status_code != 200:
        log(f"Final maçları oluşturulamadı: {r.status_code} – {r.text[:400]}", ok=False)
        return
    resp = r.json()
    created_count = resp.get("created_count", 0)
    rankings = resp.get("rankings", [])
    log(f"Final maç sayısı: {created_count}, SP sıralaması (ilk 8): {[x.get('team') for x in rankings[:8]]}", ok=True)

    # --- 7. Bracket eşleşmesini doğrula (dengeli ittifak + standart seeding) ---
    # İttifaklar: (1,8),(2,7),(3,6),(4,5) — Eşleştirme: A=(1,8)v(4,5), B=(2,7)v(3,6)
    log("7. Bracket eşleşmesi doğrulanıyor (A: 1,8 vs 4,5 | B: 2,7 vs 3,6)...")
    schedule = session.get(BASE_URL + "/api/match-schedule", timeout=10).json()
    final_matches = [m for m in schedule if m.get("match_type") == "final"]
    final_matches.sort(key=lambda x: x.get("match_number", 0))
    expected_ranks = [(1, 8, 4, 5), (2, 7, 3, 6)]
    bracket_ok = True
    for idx, exp in enumerate(expected_ranks):
        if idx >= len(final_matches):
            break
        m = final_matches[idx]
        red = (m.get("red_alliance") or [])[:2]
        blue = (m.get("blue_alliance") or [])[:2]
        # Sıralama 1-based; rankings[0] = rank 1
        want_red = [rankings[i - 1]["team"] for i in exp[:2] if 1 <= i <= len(rankings)]
        want_blue = [rankings[i - 1]["team"] for i in exp[2:] if 1 <= i <= len(rankings)]
        if set(red) != set(want_red) or set(blue) != set(want_blue):
            log(f"  Maç {idx+1}: beklenen Kırmızı {want_red} Mavi {want_blue}, gelen Kırmızı {red} Mavi {blue}", ok=False)
            bracket_ok = False
        else:
            log(f"  Maç {idx+1}: Kırmızı {red} vs Mavi {blue} (SP eşleşmesi doğru)", ok=True)
    if bracket_ok and len(final_matches) >= 2:
        log("Bracket eşleşmesi SP sıralamasına uygun", ok=True)
    else:
        log("Bracket eşleşmesi beklenenle uyuşmuyor veya yetersiz final maçı", ok=False)

    # --- 8. Birkaç final maçı oynat (kazanan/kaybeden) ---
    log("8. Final maçları oynatılıyor (kazanan/kaybeden)...")
    for i in range(min(FINAL_MATCHES_TO_PLAY, len(final_matches))):
        m = final_matches[i]
        match_id = m["id"]
        match_number = m.get("match_number", i + 1)
        red_wins = (i % 2) == 0
        try:
            red_s, blue_s = play_one_final_match(session, match_id, red_wins=red_wins)
            winner = "Kırmızı" if red_wins else "Mavi"
            log(f"  Final maç {match_number} tamamlandı: {winner} kazandı (K:{red_s} – M:{blue_s})", ok=True)
        except Exception as e:
            log(f"  Final maç {match_number} hata: {e}", ok=False)

    # --- 9. Tamamlanan final maçlarını listele ---
    log("9. Tamamlanan final maçları kontrol ediliyor...")
    schedule = session.get(BASE_URL + "/api/match-schedule", timeout=10).json()
    completed_finals = [m for m in schedule if m.get("match_type") == "final" and m.get("status") == "completed"]
    log(f"Tamamlanan final maç sayısı: {len(completed_finals)}", ok=(len(completed_finals) >= 1))

    print("=" * 60)
    print("27 takım tam etkinlik döngüsü testi bitti.")
    print("Etkinlik ID:", event_id)
    print("Oynanan sıralama maçı:", played, "| Final oluşturulan:", created_count)
    print("=" * 60)


if __name__ == "__main__":
    main()
