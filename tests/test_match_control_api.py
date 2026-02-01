#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
Match-control sayfasi API testleri.
Sunucu calisirken: python -m tests.test_match_control_api
"""
import sys
import os
import io

# Windows konsol UTF-8
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Proje kökünü path'e ekle
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests

BASE_URL = os.environ.get("MEMSKOR_TEST_URL", "http://127.0.0.1:5000")

# Basit session - login gerekebilir
session = requests.Session()
session.headers.update({"Accept": "application/json", "Content-Type": "application/json"})


def log(msg: str, ok: bool | None = None):
    prefix = "[OK] " if ok is True else "[FAIL] " if ok is False else "[INFO] "
    print(prefix + msg)


def test_get(url: str, description: str) -> dict | list | None:
    """GET istegi atar, sonucu doner."""
    try:
        r = session.get(BASE_URL + url, timeout=5)
        if r.status_code == 200:
            log(f"{description} -> 200", ok=True)
            try:
                return r.json()
            except Exception:
                return None
        elif r.status_code == 401:
            log(f"{description} -> 401", ok=None)
            return None
        else:
            log(f"{description} -> {r.status_code}", ok=False)
            return None
    except requests.exceptions.ConnectionError:
        log(f"{description}: Sunucuya bağlanılamadı ({BASE_URL}). Sunucu çalışıyor mu?", ok=False)
        return None
    except Exception as e:
        log(f"{description}: Hata - {e}", ok=False)
        return None


def test_post(url: str, payload: dict, description: str) -> dict | None:
    """POST isteği atar."""
    try:
        r = session.post(BASE_URL + url, json=payload, timeout=5)
        if r.status_code in (200, 201):
            log(f"{description} -> {r.status_code}", ok=True)
            try:
                return r.json()
            except Exception:
                return r.text
        else:
            log(f"{description} -> {r.status_code}", ok=False)
            return None
    except requests.exceptions.ConnectionError:
        log(f"{description}: Sunucuya bağlanılamadı", ok=False)
        return None
    except Exception as e:
        log(f"{description}: Hata - {e}", ok=False)
        return None


def main():
    print("=" * 60)
    print("Match-Control API Testleri")
    print("BASE_URL:", BASE_URL)
    print("=" * 60)

    # 1. Sayfa erişimi (HTML döner)
    try:
        r = session.get(BASE_URL + "/match-control", timeout=5)
        if r.status_code == 200 and "match-control" in (r.text or "").lower():
            log("Match-control sayfasi yuklendi (GET /match-control)", ok=True)
        else:
            log("Match-control sayfasi: " + str(r.status_code) + " (login gerekebilir)", ok=(r.status_code == 200))
    except requests.exceptions.ConnectionError:
        log("Sunucuya baglanilamadi. Once sunucuyu baslatin: python app_web.py", ok=False)
        print("=" * 60)
        return

    # 2. Aktif mac
    data = test_get("/api/match-control/active", "Aktif mac")
    if data is not None and isinstance(data, dict):
        match = data.get("match")
        if match:
            log(f"  -> ID={match.get('id')} No={match.get('match_number')}", ok=True)
        else:
            log("  -> yok", ok=None)

    # 3. Siradaki mac
    data = test_get("/api/match-control/next-match", "Siradaki mac")
    if data is not None and isinstance(data, dict):
        match = data.get("match")
        if match:
            log(f"  -> ID={match.get('id')} No={match.get('match_number')}", ok=True)
        else:
            log("  -> yok", ok=None)

    # 4. Match-schedule
    data = test_get("/api/match-schedule", "Match-schedule")
    if data is not None:
        count = len(data) if isinstance(data, list) else 0
        log(f"  -> {count} mac", ok=(count >= 0))

    # 5. Practice-matches
    data = test_get("/api/practice-matches", "Practice-matches")
    if data is not None:
        count = len(data) if isinstance(data, list) else 0
        log(f"  -> {count} mac", ok=(count >= 0))

    # 6. Event
    data = test_get("/api/event", "Event")
    if data is not None and isinstance(data, dict):
        eid = data.get("id") or data.get("event_id")
        log(f"  -> event_id={eid}", ok=(eid is not None))

    print("=" * 60)
    print("401 = giris gerekli (normal). Tarayicida login olunca API'ler 200 doner.")
    print("=" * 60)
    print("=" * 60)


if __name__ == "__main__":
    main()
