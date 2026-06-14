"""
Otomatik veritabanı yedekleme testi.

Doğrular:
  1. Manuel "şimdi yedekle" endpoint'i (POST /api/admin/backup) yedek üretir.
  2. Periyodik yedekleme arka planda çalışır (sunucu 1 dk aralıkla başlatılmış olmalı).
  3. Eski yedekler budanır (keep sınırı aşılmaz).
  4. Yedek dosyaları geçerli (boyut > 0).

NOT: Sunucu MEMSKOR_BACKUP_INTERVAL_MIN=1 MEMSKOR_BACKUP_KEEP=10 ile çalışmalı.
"""
import os, sys, io, time, glob, json
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import requests

BASE = "http://127.0.0.1:5001"
AUTO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backups", "auto")
KEEP = 10
R = {"pass": [], "fail": []}
def rec(n, ok, d=""):
    R["pass" if ok else "fail"].append(n)
    print(f"  {'✅' if ok else '❌'} {n}" + (f" — {d}" if d else ""))

def listing():
    return sorted(glob.glob(os.path.join(AUTO_DIR, "data_*.db")))

def main():
    s = requests.Session(); s.headers.update({"Accept": "application/json"})
    s.post(f"{BASE}/login", data={"username": "admin", "password": "admin123"}, timeout=10)
    s.headers["Content-Type"] = "application/json"

    # 1) Manuel yedek
    r = s.post(f"{BASE}/api/admin/backup", timeout=15)
    jd = r.json() if r.ok else {}
    rec("Manuel '/api/admin/backup' yedek üretti", r.ok and jd.get("ok") and jd.get("file"), f"file={jd.get('file')}, toplam={jd.get('total_auto_backups')}")
    files_after_manual = listing()
    rec("Yedek dizininde dosya var (backups/auto)", len(files_after_manual) >= 1, f"{len(files_after_manual)} dosya")
    if files_after_manual:
        sz = os.path.getsize(files_after_manual[-1])
        rec("Yedek dosyası geçerli (boyut > 0)", sz > 0, f"{sz} bayt")

    # 2) Periyodik: 70 sn bekle, MANUEL çağırmadan yeni dosya oluşmalı (1 dk aralık)
    mark = time.time()
    print("  ⏳ Periyodik yedek için ~70 sn bekleniyor (manuel çağrı yok)...")
    time.sleep(70)
    new_files = [f for f in listing() if os.path.getmtime(f) > mark + 1]
    rec("Periyodik yedek arka planda çalıştı (yeni dosya oluştu)", len(new_files) >= 1, f"{len(new_files)} yeni dosya")

    # 3) Budama: keep sınırı
    total = len(listing())
    rec(f"Budama çalışıyor (toplam ≤ keep={KEEP})", total <= KEEP, f"{total} dosya")

    print("\n" + "=" * 56)
    print(f"SONUC: {len(R['pass'])} PASS / {len(R['fail'])} FAIL")
    print("✅ OTOMATİK YEDEK HAZIR" if not R["fail"] else f"❌ {len(R['fail'])} SORUN")
    print("=" * 56)
    return 0 if not R["fail"] else 1

if __name__ == "__main__":
    sys.exit(main())
