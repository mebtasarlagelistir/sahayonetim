"""
Playoff İLERLEME testi — canlı sunucu, adım adım kazanan/kaybeden yönlendirmesi.
(KENDİNİ TEMİZLER)

Senin orada olmadan playoff'un otomatik ilerlemesi kritik: her maç tamamlandıkça
KAZANAN ve KAYBEDEN, çift-eleme şemasına göre doğru sonraki maç slotuna yazılmalı.

Bu test:
  A) 6 ittifak çift eleme üretir, M1→M10'u sırayla oynatır ve HER maçtan sonra
     - kazananın win_to hedef slotuna,
     - kaybedenin lose_to hedef slotuna
     doğru yazıldığını DOĞRULAR (bracket'i okunur şekilde basar). Şampiyonu kontrol eder.
  B) Ayrı bir bracket'te Büyük Final'i ALT KADEME şampiyonuna kazandırıp
     rövanş (M11) maçının otomatik dolduğunu (bracket reset) doğrular.
Sonunda final maçlarını + test etkinliğini siler, gerçek etkinliği geri yükler.
"""
import os, sys, io, json, time, re
from datetime import datetime, timedelta

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import requests

BASE = os.environ.get("MEMSKOR_TEST_URL", "http://127.0.0.1:5001")
REAL_EVENT_NAME = "İstanbul ve Su 2"
R = {"pass": [], "fail": []}

def rec(name, ok, detail=""):
    R["pass" if ok else "fail"].append(name)
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))

def parse_meta(notes):
    meta = {}
    for part in (notes or "").replace("[playoff]", "").split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            meta[k.strip()] = v.strip()
    return meta

def main():
    s = requests.Session(); s.headers.update({"Accept": "application/json"})
    r = s.post(f"{BASE}/login", data={"username": "admin", "password": "admin123"}, allow_redirects=True, timeout=10)
    if r.status_code not in (200, 302):
        print("Giriş başarısız"); return 1
    s.headers["Content-Type"] = "application/json"

    ev = s.get(f"{BASE}/api/event", timeout=10).json()
    prev_active = ev.get("id")
    created_event_id = None
    try:
        # Kurulum
        s.post(f"{BASE}/api/events", json={"name": f"PLAYOFF TEST {time.strftime('%H:%M:%S')}", "code": "PLF", "season": "2025-2026"}, timeout=10)
        events = s.get(f"{BASE}/api/events", timeout=10).json()
        created_event_id = events[-1]["id"]
        s.post(f"{BASE}/api/events/active", json={"id": created_event_id}, timeout=10)
        teams = [{"number": str(900 + i), "name": f"PF Takım {i}", "school": "X", "city": "İstanbul"} for i in range(12)]
        s.post(f"{BASE}/api/teams", json=teams, timeout=10)
        # 6 ittifak (seed sırası): A1=[900,901], A2=[902,903], ...
        alliances = [[str(900 + 2 * i), str(900 + 2 * i + 1)] for i in range(6)]
        seed_of = {}
        for i, pair in enumerate(alliances):
            for tn in pair:
                seed_of[tn] = i + 1

        def gen_finals():
            return s.post(f"{BASE}/api/match-schedule/generate-finals", json={
                "start_date": "2026-06-16", "start_time": "14:00", "format": "double_elimination_6",
                "alliances": alliances, "clear_existing": True}, timeout=15)

        def finals_by_label():
            fs = s.get(f"{BASE}/api/match-schedule", timeout=10).json()
            fs = fs.get("schedule", fs) if isinstance(fs, dict) else fs
            out = {}
            for m in fs:
                if m.get("match_type") != "final":
                    continue
                meta = parse_meta(m.get("notes"))
                lbl = meta.get("label")
                if lbl:
                    m["_meta"] = meta
                    out[lbl] = m
            return out

        def slot(match, s_):
            return match.get("red_alliance" if s_ == "red" else "blue_alliance") or []

        def complete(m, red_wins):
            rs, bs = (100, 50) if red_wins else (50, 100)
            return s.post(f"{BASE}/api/match-control/complete", json={
                "match_id": m["id"], "red_score": rs, "blue_score": bs, "match_source": "schedule"}, timeout=10)

        def alabel(teams):
            sd = min((seed_of.get(t, 9) for t in teams), default=9)
            return f"A{sd}"

        # ===================== SENARYO A: adım adım yönlendirme =====================
        print("\n--- SENARYO A: Her maç sonrası kazanan/kaybeden yönlendirmesi ---")
        gr = gen_finals()
        rec("Çift-eleme finalleri üretildi (M1–M11)", gr.ok and gr.json().get("created_count") == 11, f"created={gr.json().get('created_count')}")
        routing = {lbl: m["_meta"] for lbl, m in finals_by_label().items()}

        all_ok = True
        for i in range(1, 11):  # M1..M10
            lbl = f"M{i}"
            by = finals_by_label()
            m = by.get(lbl)
            if not m:
                continue
            red, blue = slot(m, "red"), slot(m, "blue")
            if not red or not blue:
                rec(f"{lbl}: ittifaklar dolu (oynanabilir)", False, f"red={red} blue={blue}")
                all_ok = False
                continue
            winner, loser = red, blue  # kırmızı kazanacak
            cr = complete(m, red_wins=True)
            if not cr.ok:
                rec(f"{lbl} tamamlandı", False, f"HTTP {cr.status_code}")
                all_ok = False
                continue
            meta = routing.get(lbl, {})
            after = finals_by_label()
            line = f"{lbl}: {alabel(winner)} ({alabel(red)} vs {alabel(blue)}) kazandı"
            step_ok = True
            # win_to doğrula
            if meta.get("win_to"):
                tl, ts = meta["win_to"].split(":")
                got = slot(after.get(tl, {}), ts)
                ok = got == winner
                step_ok = step_ok and ok
                line += f" → kazanan {tl}:{ts}={alabel(got) if got else '∅'}{'' if ok else ' ✗'}"
            # lose_to doğrula
            if meta.get("lose_to"):
                tl, ts = meta["lose_to"].split(":")
                got = slot(after.get(tl, {}), ts)
                ok = got == loser
                step_ok = step_ok and ok
                line += f", kaybeden {tl}:{ts}={alabel(got) if got else '∅'}{'' if ok else ' ✗'}"
            print("    " + line)
            if not step_ok:
                all_ok = False
        rec("A) Her maçta kazanan+kaybeden doğru sonraki slota yazıldı", all_ok)

        # Şampiyon: M10 kırmızı (üst kademe şampiyonu) kazandı → M11 boş
        by = finals_by_label()
        m10 = by.get("M10", {})
        champ = slot(m10, "red")
        rec("A) Büyük Final tamamlandı, şampiyon belirlendi", (m10.get("status") == "completed") and bool(champ), f"şampiyon={alabel(champ)}")
        m11 = by.get("M11", {})
        rec("A) Üst şampiyonu kazandı → rövanş (M11) oynanmadı (boş)", not slot(m11, "red") and not slot(m11, "blue"))

        # ===================== SENARYO B: bracket reset (M11) =====================
        print("\n--- SENARYO B: Büyük Final'i ALT KADEME şampiyonu kazanır → M11 reset ---")
        gen_finals()
        for i in range(1, 10):  # M1..M9 kırmızı kazanır
            by = finals_by_label(); m = by.get(f"M{i}")
            if m and slot(m, "red") and slot(m, "blue"):
                complete(m, red_wins=True)
        by = finals_by_label(); m10 = by.get("M10")
        m10_red, m10_blue = slot(m10, "red"), slot(m10, "blue")
        complete(m10, red_wins=False)  # mavi (alt kademe şampiyonu) kazanır
        time.sleep(0.3)
        by = finals_by_label(); m11 = by.get("M11", {})
        m11_red, m11_blue = slot(m11, "red"), slot(m11, "blue")
        rec("B) M10'u alt şampiyonu kazandı → M11 iki ittifakla doldu (reset)",
            bool(m11_red) and bool(m11_blue), f"M11: {alabel(m11_red) if m11_red else '∅'} vs {alabel(m11_blue) if m11_blue else '∅'}")
        rec("B) M11 ittifakları M10'unkilerle aynı (rövanş)",
            set(m11_red) == set(m10_red) and set(m11_blue) == set(m10_blue))

    except Exception as e:
        import traceback; traceback.print_exc()
        rec("Beklenmeyen hata", False, str(e)[:140])
    finally:
        try:
            s.post(f"{BASE}/api/match-control/reset-active", timeout=10)
            fs = s.get(f"{BASE}/api/match-schedule", timeout=10).json()
            fs = fs.get("schedule", fs) if isinstance(fs, dict) else fs
            for m in fs:
                if m.get("match_type") == "final":
                    s.delete(f"{BASE}/api/match-schedule/{m['id']}", timeout=10)
            events = s.get(f"{BASE}/api/events", timeout=10).json()
            real = [e for e in events if e.get("name") == REAL_EVENT_NAME]
            if real:
                s.post(f"{BASE}/api/events/active", json={"id": real[0]["id"]}, timeout=10)
            if created_event_id:
                dr = s.delete(f"{BASE}/api/events/{created_event_id}", timeout=10)
                rec("Temizlik: finaller + test etkinliği silindi, gerçek etkinlik aktif", dr.ok and bool(real))
        except Exception as e:
            rec("Temizlik", False, str(e)[:80])

    print("\n" + "=" * 60)
    verdict = "✅ PLAYOFF İLERLEMESİ DOĞRU ÇALIŞIYOR" if not R["fail"] else f"❌ {len(R['fail'])} SORUN"
    print(f"SONUC: {len(R['pass'])} PASS / {len(R['fail'])} FAIL")
    print(verdict); print("=" * 60)
    return 0 if not R["fail"] else 1

if __name__ == "__main__":
    sys.exit(main())
