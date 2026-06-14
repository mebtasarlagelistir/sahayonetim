#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MEMSKOR Etkinlik Süpervizörü (Watchdog)

Tek makineden etkinlik yönetiminde sunucunun sürekli ayakta kalmasını sağlar:
- `app_web.py`'yi alt süreç olarak çalıştırır.
- Süreç ÇÖKERSE (beklenmedik çıkış) ~2 sn içinde yeniden başlatır.
- Süreç ASKIDA kalırsa (HTTP'ye yanıt vermiyorsa) tespit edip yeniden başlatır.
- Crash-loop koruması: kısa sürede çok fazla yeniden başlatmada bekler.
- Tüm olaylar konsola ve `watchdog.log`'a yazılır.
- Ctrl+C ile temiz kapanır (sunucuyu da durdurur).

Kullanım:
    python run_event.py        (veya run_event.bat'a çift tıkla)

Ortam değişkenleri app_web.py'ye aktarılır (örn. MEMSKOR_BACKUP_INTERVAL_MIN).
Sağlık kontrolü URL'i: MEMSKOR_HEALTH_URL (vars. http://127.0.0.1:5001/login)
"""

import os
import sys
import time
import subprocess
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PYTHON = sys.executable
APP = str(ROOT / "app_web.py")
LOG_PATH = ROOT / "watchdog.log"

HEALTH_URL = os.environ.get("MEMSKOR_HEALTH_URL", "http://127.0.0.1:5001/login")
HEALTH_INTERVAL = int(os.environ.get("MEMSKOR_HEALTH_INTERVAL", "15"))   # sağlık kontrolü periyodu (sn)
HEALTH_FAIL_LIMIT = int(os.environ.get("MEMSKOR_HEALTH_FAILS", "4"))     # ardışık başarısızlık -> restart
START_GRACE = int(os.environ.get("MEMSKOR_START_GRACE", "25"))          # başlangıçta health'e başlamadan önce
POLL_SECONDS = 2                                                         # süreç-çıkışı kontrol sıklığı
CRASH_WINDOW = 120                                                       # crash-loop penceresi (sn)
CRASH_LIMIT = 5                                                          # pencere içinde bu kadar restart -> yavaşla


def log(msg: str) -> None:
    line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


def healthy() -> bool:
    try:
        req = urllib.request.Request(HEALTH_URL, method="GET")
        with urllib.request.urlopen(req, timeout=8) as r:
            return getattr(r, "status", 200) < 500
    except urllib.error.HTTPError as e:
        # HTTP yanıtı geldi (4xx/3xx) = sunucu ayakta
        return e.code < 500
    except Exception:
        return False


def terminate(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    try:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
    except Exception as e:
        log(f"Süreç sonlandırma hatası: {e}")


def main() -> int:
    log("=" * 60)
    log("MEMSKOR Etkinlik Süpervizörü başladı (çökme + askı izleme).")
    log(f"Sağlık URL: {HEALTH_URL} | kontrol: {HEALTH_INTERVAL}s | sınır: {HEALTH_FAIL_LIMIT}")
    restart_times: list[float] = []

    while True:
        log("Sunucu başlatılıyor: python app_web.py")
        proc = subprocess.Popen([PYTHON, APP], cwd=str(ROOT), env=os.environ.copy())
        start = time.time()
        last_health = start
        fails = 0
        reason = None

        try:
            while True:
                time.sleep(POLL_SECONDS)
                rc = proc.poll()
                if rc is not None:
                    reason = f"süreç beklenmedik şekilde sonlandı (exit={rc})"
                    break
                now = time.time()
                if now - start >= START_GRACE and now - last_health >= HEALTH_INTERVAL:
                    last_health = now
                    if healthy():
                        if fails:
                            log("Sunucu yeniden yanıt veriyor (sağlık OK).")
                        fails = 0
                    else:
                        fails += 1
                        log(f"Sağlık kontrolü başarısız ({fails}/{HEALTH_FAIL_LIMIT}).")
                        if fails >= HEALTH_FAIL_LIMIT:
                            reason = "sunucu yanıt vermiyor (askıda)"
                            terminate(proc)
                            break
        except KeyboardInterrupt:
            log("Ctrl+C alındı — sunucu durduruluyor, süpervizör çıkıyor.")
            terminate(proc)
            return 0

        log(f"Yeniden başlatma nedeni: {reason}")

        # Crash-loop koruması
        now = time.time()
        restart_times = [t for t in restart_times if now - t < CRASH_WINDOW]
        restart_times.append(now)
        if len(restart_times) >= CRASH_LIMIT:
            log(f"Kısa sürede çok fazla yeniden başlatma (>= {CRASH_LIMIT}). 30 sn bekleniyor (crash-loop koruması).")
            try:
                time.sleep(30)
            except KeyboardInterrupt:
                return 0
            restart_times = []
        else:
            time.sleep(3)


if __name__ == "__main__":
    sys.exit(main())
