"""
İzole test (temp DB, Flask test client) — canlı sunucuya/veriye DOKUNMAZ:
  1. /api/public/teams girişsiz 200 döner (seyirci ekranı şifre istemeden açılır).
  2. /api/teams hâlâ giriş ister (401) — karşıtlık (public'in neden gerektiği).
  3. create_default_role_users çıktısı pit_yoneticisi içerir.
"""
import sys, io, tempfile
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

R = {"pass": 0, "fail": 0}
def chk(n, ok, d=""):
    print(f"  {'PASS' if ok else 'FAIL'}: {n}" + (f" — {d}" if d else ""))
    R["pass" if ok else "fail"] += 1
    if not ok: R["fail"] += 0

def build():
    import app_web
    from src.core.storage import DataStore
    tmp = Path(tempfile.mkdtemp(prefix="memskor_aud_"))
    real = app_web.DataStore
    app_web.DataStore = lambda base_path=None: real(base_path=tmp)
    try:
        app, _sio = app_web.create_app()
    finally:
        app_web.DataStore = real
    app.config["TESTING"] = True
    return app, DataStore(base_path=tmp)

def main():
    app, ds = build()
    eid = ds.create_event("Aud Test", {"code": "AUD", "format": {"teams_per_alliance": 2}})
    ds.set_active_event(eid)
    ds.save_teams([{"number": "1001", "name": "Alfa", "school": "X", "city": "Y"},
                   {"number": "1002", "name": "Beta", "school": "X", "city": "Y"}])
    client = app.test_client()

    # 1. /api/public/teams — GİRİŞSİZ 200 + takımlar
    r = client.get("/api/public/teams")
    ok = r.status_code == 200 and isinstance(r.get_json(), list) and len(r.get_json()) == 2
    chk("/api/public/teams girişsiz 200 + 2 takım", ok, f"HTTP {r.status_code}, n={len(r.get_json()) if r.status_code==200 else '-'}")
    names = {t.get("name") for t in (r.get_json() or [])}
    chk("Takım adları geliyor (Alfa/Beta)", {"Alfa", "Beta"} <= names, str(names))

    # 2. /api/teams hâlâ giriş ister (401) — bu yüzden public gerekti
    r2 = client.get("/api/teams")
    chk("/api/teams girişsiz 401 (login ister)", r2.status_code == 401, f"HTTP {r2.status_code}")

    # 3. Varsayılan rol hesapları pit_yoneticisi içerir
    created = ds.create_default_role_users()
    usernames = [u.get("username", "") for u in created]
    has_pit = any("pit_yoneticisi" in u for u in usernames)
    chk("Varsayılan hesaplarda pit_yoneticisi var", has_pit,
        f"örnek: {[u for u in usernames if 'pit' in u] or usernames[:3]}")

    print("\n" + "="*52)
    print(f"SONUC: {R['pass']} PASS / {R['fail']} FAIL")
    print("="*52)
    return 0 if R["fail"] == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
