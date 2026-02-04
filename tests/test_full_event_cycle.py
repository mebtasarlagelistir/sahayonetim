#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tam Etkinlik Döngüsü Testi – Dummy veriler ile uçtan uca test.

Sunucu çalışırken: python -m tests.test_full_event_cycle

Akış:
  1. Giriş (admin)
  2. Etkinlik oluştur ve aktif yap
  3. Dummy takımlar ekle
  4. Sıralama maç takvimi oluştur
  5. İlk maçı başlat
  6. Kırmızı/Mavi detaylı skor gir
  7. Hakem girişlerini tamamla (submit)
  8. Baş hakem onayı
  9. Maçı tamamla
  10. (Opsiyonel) Final maçları oluştur ve bir final maçı simüle et
"""
import os
import sys
import io
from datetime import datetime, timedelta

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests

BASE_URL = os.environ.get("MEMSKOR_TEST_URL", "http://127.0.0.1:5000")
LOGIN_USER = os.environ.get("MEMSKOR_TEST_USER", "admin")
LOGIN_PASS = os.environ.get("MEMSKOR_TEST_PASS", "admin123")

# Test için dummy takımlar (en az 4 gerekli, 2 kırmızı + 2 mavi)
DUMMY_TEAMS = [
    {"number": "99001", "name": "Test Takım 1", "school": "Test Okulu A", "city": "İstanbul"},
    {"number": "99002", "name": "Test Takım 2", "school": "Test Okulu B", "city": "İstanbul"},
    {"number": "99003", "name": "Test Takım 3", "school": "Test Okulu C", "city": "İstanbul"},
    {"number": "99004", "name": "Test Takım 4", "school": "Test Okulu D", "city": "İstanbul"},
]

# Detaylı puanlama – Kırmızı ittifak (İstanbul/Su oyunu alanları)
RED_SCORING_DATA = {
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

# Mavi ittifak – biraz daha düşük skor
BLUE_SCORING_DATA = {
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


def main() -> None:
    session = requests.Session()
    session.headers.update({"Accept": "application/json"})

    print("=" * 60)
    print("MEMSKOR – Tam Etkinlik Döngüsü Testi (Dummy Veriler)")
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
        log("Sunucuya bağlanılamadı. Önce sunucuyu başlatın: python app_web.py", ok=False)
        return
    except Exception as e:
        log(f"Giriş hatası: {e}", ok=False)
        return

    if r.status_code not in (200, 302):
        log(f"Giriş başarısız: {r.status_code}", ok=False)
        return
    # Redirect veya 200 ile session cookie alınır
    if "session" not in session.cookies.get_dict() and "Set-Cookie" not in str(r.headers):
        # Bazı sunucular farklı cookie ismi kullanabilir
        pass
    log("Giriş başarılı", ok=True)

    # JSON istekleri için Content-Type (login form'dan sonra tekrar set edelim)
    session.headers["Content-Type"] = "application/json"

    # --- 2. Etkinlik oluştur ---
    log("2. Etkinlik oluşturuluyor...")
    event_name = f"Test Etkinlik {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    r = session.post(
        BASE_URL + "/api/events",
        json={"name": event_name, "code": "TST", "season": "2025-2026"},
        timeout=10,
    )
    if r.status_code not in (200, 201):
        log(f"Etkinlik oluşturulamadı: {r.status_code} – {r.text[:200]}", ok=False)
        return
    events = session.get(BASE_URL + "/api/events", timeout=10).json()
    if not events:
        log("Etkinlik listesi boş", ok=False)
        return
    event_id = events[-1]["id"]
    log(f"Etkinlik oluşturuldu: id={event_id}", ok=True)

    # --- 3. Aktif etkinlik yap ---
    log("3. Etkinlik aktif yapılıyor...")
    r = session.post(BASE_URL + "/api/events/active", json={"id": event_id}, timeout=10)
    if r.status_code != 200:
        log(f"Aktif etkinlik ayarlanamadı: {r.status_code}", ok=False)
        return
    log("Aktif etkinlik ayarlandı", ok=True)

    # --- 4. Takımlar ekle ---
    log("4. Dummy takımlar ekleniyor...")
    r = session.post(BASE_URL + "/api/teams", json=DUMMY_TEAMS, timeout=10)
    if r.status_code not in (200, 201):
        log(f"Takımlar eklenemedi: {r.status_code} – {r.text[:200]}", ok=False)
        return
    log("Takımlar eklendi", ok=True)

    # --- 5. Sıralama maç takvimi oluştur ---
    log("5. Sıralama maç takvimi oluşturuluyor...")
    start = datetime.now() + timedelta(minutes=5)
    r = session.post(
        BASE_URL + "/api/match-schedule/generate",
        json={
            "start_date": start.strftime("%Y-%m-%d"),
            "start_time": start.strftime("%H:%M"),
            "match_type": "qualification",
            "field_count": 1,
            "teams_per_alliance": 2,
            "match_cycle_minutes": 8,
            "clear_existing": True,
        },
        timeout=15,
    )
    if r.status_code != 200:
        log(f"Maç takvimi oluşturulamadı: {r.status_code} – {r.text[:300]}", ok=False)
        return
    log("Maç takvimi oluşturuldu", ok=True)

    # --- 6. İlk sıralama maçını al ---
    log("6. İlk sıralama maçı alınıyor...")
    schedule = session.get(BASE_URL + "/api/match-schedule", timeout=10).json()
    qual_matches = [m for m in schedule if m.get("match_type") == "qualification"]
    if not qual_matches:
        log("Sıralama maçı bulunamadı", ok=False)
        return
    first_match = qual_matches[0]
    match_id = first_match["id"]
    log(f"İlk maç: id={match_id}, No={first_match.get('match_number')}", ok=True)

    # --- 7. Maçı başlat (robot hazırlık durumları zorunlu) ---
    log("7. Maç başlatılıyor...")
    team_statuses = {
        "red": {"r1": "ready", "r2": "ready"},
        "blue": {"r1": "ready", "r2": "ready"},
    }
    r = session.post(
        BASE_URL + "/api/match-control/start",
        json={"match_id": match_id, "match_source": "schedule", "team_statuses": team_statuses},
        timeout=10,
    )
    if r.status_code != 200:
        log(f"Maç başlatılamadı: {r.status_code} – {r.text[:200]}", ok=False)
        return
    log("Maç başlatıldı", ok=True)

    # --- 8. Detaylı skor – Kırmızı ---
    log("8. Kırmızı ittifak detaylı skor gönderiliyor...")
    r = session.post(
        BASE_URL + "/api/match-control/score/detailed",
        json={
            "match_id": match_id,
            "alliance": "red",
            "scoring_data": RED_SCORING_DATA,
            "match_source": "schedule",
        },
        timeout=10,
    )
    if r.status_code != 200:
        log(f"Kırmızı skor güncellenemedi: {r.status_code}", ok=False)
        return
    red_calc = r.json().get("calculated_score", 0)
    log(f"Kırmızı skor hesaplandı: {red_calc}", ok=True)

    # --- 9. Detaylı skor – Mavi ---
    log("9. Mavi ittifak detaylı skor gönderiliyor...")
    r = session.post(
        BASE_URL + "/api/match-control/score/detailed",
        json={
            "match_id": match_id,
            "alliance": "blue",
            "scoring_data": BLUE_SCORING_DATA,
            "match_source": "schedule",
        },
        timeout=10,
    )
    if r.status_code != 200:
        log(f"Mavi skor güncellenemedi: {r.status_code}", ok=False)
        return
    blue_calc = r.json().get("calculated_score", 0)
    log(f"Mavi skor hesaplandı: {blue_calc}", ok=True)

    # --- 10. Hakem submit – Kırmızı ---
    log("10. Kırmızı hakem girişi tamamlanıyor (submit)...")
    r = session.post(
        BASE_URL + "/api/referee/submit",
        json={"match_id": match_id, "alliance": "red", "match_source": "schedule"},
        timeout=10,
    )
    if r.status_code != 200:
        log(f"Kırmızı submit başarısız: {r.status_code} – {r.text[:200]}", ok=False)
        return
    log("Kırmızı submit tamamlandı", ok=True)

    # --- 11. Hakem submit – Mavi ---
    log("11. Mavi hakem girişi tamamlanıyor (submit)...")
    r = session.post(
        BASE_URL + "/api/referee/submit",
        json={"match_id": match_id, "alliance": "blue", "match_source": "schedule"},
        timeout=10,
    )
    if r.status_code != 200:
        log(f"Mavi submit başarısız: {r.status_code} – {r.text[:200]}", ok=False)
        return
    log("Mavi submit tamamlandı", ok=True)

    # --- 12. Baş hakem onayı ---
    log("12. Baş hakem onayı veriliyor...")
    r = session.post(
        BASE_URL + "/api/referee/approve",
        json={"match_id": match_id, "match_source": "schedule"},
        timeout=10,
    )
    if r.status_code != 200:
        log(f"Baş hakem onayı başarısız: {r.status_code} – {r.text[:200]}", ok=False)
        return
    log("Baş hakem onayı tamamlandı", ok=True)

    # --- 13. Maçı tamamla ---
    log("13. Maç tamamlanıyor...")
    r = session.post(
        BASE_URL + "/api/match-control/complete",
        json={
            "match_id": match_id,
            "red_score": red_calc,
            "blue_score": blue_calc,
            "match_source": "schedule",
        },
        timeout=10,
    )
    if r.status_code != 200:
        log(f"Maç tamamlanamadı: {r.status_code} – {r.text[:200]}", ok=False)
        return
    log("Maç tamamlandı", ok=True)

    # --- 14. Doğrulama: tamamlanan maç listede ---
    log("14. Doğrulama: tamamlanan maç kontrol ediliyor...")
    schedule_after = session.get(BASE_URL + "/api/match-schedule", timeout=10).json()
    completed = next((m for m in schedule_after if m.get("id") == match_id), None)
    if completed and completed.get("status") == "completed":
        log(f"Maç status=completed, red={completed.get('red_score')}, blue={completed.get('blue_score')}", ok=True)
    else:
        log("Maç listede completed olarak görünmüyor", ok=False)

    print("=" * 60)
    print("Tam etkinlik döngüsü testi bitti.")
    print("Etkinlik ID:", event_id, "| Maç ID:", match_id)
    print("Skor: Kırmızı", red_calc, "– Mavi", blue_calc)
    print("=" * 60)


if __name__ == "__main__":
    main()
