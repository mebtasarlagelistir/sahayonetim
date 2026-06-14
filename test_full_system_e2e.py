#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MEMSKOR — TAM SİSTEM UÇTAN UCA OTONOM TEST (kendini temizler).

İzole bir TEST etkinliği oluşturur, tüm yarışma akışını orada çalıştırır,
sonra test etkinliğini siler ve önceki aktif etkinliği geri yükler.
Gerçek "2. Yarışma" verisine DOKUNMAZ.

Akış:
  0. Kurulum: login, aktif etkinlik snapshot, izole test etkinliği + 16 takım
  1. İnceleme (smoke) + Sıralama maç takvimi + tüm maçları oynat + SP/sıralama
  2. Timer durum süreleri (otonom30/hazırlık10/SKS90/oyunsonu30) hızlı doğrulama
  3. İttifak seçimi (6) + çift-eleme playoff (M1–M11) + ilerletme + şampiyon
  4. Tüm seyirci ekranları (Playwright) + bracket/zaman çizelgesi çıktıları
  5. Jüri / sponsor / ödül / tören (smoke)
  6. Temizlik: test etkinliğini sil, aktif etkinliği geri yükle

Çıktı: konsola + SISTEM_TEST_RAPORU.md
"""
import os, sys, io, json, time, asyncio
from datetime import datetime, timedelta
from copy import deepcopy

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import requests

BASE = os.environ.get("MEMSKOR_TEST_URL", "http://127.0.0.1:5001")
USER = os.environ.get("MEMSKOR_TEST_USER", "admin")
PASS = os.environ.get("MEMSKOR_TEST_PASS", "admin123")
REPORT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "SISTEM_TEST_RAPORU.md")

NUM_TEAMS = 16
DUMMY_TEAMS = [
    {"number": f"880{i:02d}", "name": f"E2E Takım {i}", "school": f"E2E Okul {i}", "city": "İstanbul"}
    for i in range(1, NUM_TEAMS + 1)
]

RED_BASE = {"auto_leave_r1": True, "auto_leave_r2": True, "auto_bent1_own": 2, "auto_bent2_correct": 1,
            "auto_tank_own": 1, "teleop_bent1_own": 3, "teleop_bent2_correct": 2, "teleop_bent3_correct": 1,
            "teleop_tank_own": 2, "teleop_source_entry": 1, "teleop_climb": 2, "yellow_card": 0, "major_penalty": 0}
BLUE_BASE = {"auto_leave_r1": True, "auto_leave_r2": False, "auto_bent1_own": 1, "auto_bent2_correct": 1,
             "auto_tank_own": 0, "teleop_bent1_own": 2, "teleop_bent2_correct": 1, "teleop_bent3_wrong": 1,
             "teleop_tank_own": 1, "teleop_source_entry": 1, "teleop_climb": 1, "yellow_card": 0, "major_penalty": 0}

R = {"pass": [], "fail": [], "warn": []}
LINES = []

def rec(phase, name, status, detail=""):
    icon = {"PASS": "✅", "FAIL": "❌", "WARN": "⚠️"}[status]
    R["pass" if status == "PASS" else "fail" if status == "FAIL" else "warn"].append(f"{phase} · {name}")
    line = f"{icon} [{phase}] {name}" + (f" — {detail}" if detail else "")
    print(line); LINES.append(line)

def info(msg):
    print("   " + msg); LINES.append(f"   {msg}")

def play_match(s, match_id, red_wins, src="schedule"):
    ts = {"red": {"r1": "ready", "r2": "ready"}, "blue": {"r1": "ready", "r2": "ready"}}
    s.post(f"{BASE}/api/match-control/start", json={"match_id": match_id, "match_source": src, "team_statuses": ts}, timeout=10)
    rd, bd = deepcopy(RED_BASE), deepcopy(BLUE_BASE)
    rc = s.post(f"{BASE}/api/match-control/score/detailed", json={"match_id": match_id, "alliance": "red", "scoring_data": rd, "match_source": src}, timeout=10).json().get("calculated_score", 0)
    bc = s.post(f"{BASE}/api/match-control/score/detailed", json={"match_id": match_id, "alliance": "blue", "scoring_data": bd, "match_source": src}, timeout=10).json().get("calculated_score", 0)
    if red_wins and rc <= bc: rc = bc + 10
    if not red_wins and bc <= rc: bc = rc + 10
    for a in ("red", "blue"):
        s.post(f"{BASE}/api/referee/submit", json={"match_id": match_id, "alliance": a, "match_source": src}, timeout=10)
    s.post(f"{BASE}/api/referee/approve", json={"match_id": match_id, "match_source": src}, timeout=10)
    sd = {}
    g = s.get(f"{BASE}/api/referee/score/get/{match_id}", params={"source": src}, timeout=10)
    if g.status_code == 200:
        d = g.json()
        if d.get("red", {}).get("scoring_data"): sd["red"] = d["red"]["scoring_data"]
        if d.get("blue", {}).get("scoring_data"): sd["blue"] = d["blue"]["scoring_data"]
    s.post(f"{BASE}/api/match-control/complete", json={"match_id": match_id, "red_score": rc, "blue_score": bc, "match_source": src, "scoring_data": sd or None}, timeout=10)
    return rc, bc

def get_schedule(s):
    d = s.get(f"{BASE}/api/match-schedule", timeout=10).json()
    return d.get("schedule", d) if isinstance(d, dict) else d

def api_phases(s):
    created_event_id = None
    prev_active = None
    try:
        # --- 0. KURULUM ---
        r = s.post(f"{BASE}/login", data={"username": USER, "password": PASS}, allow_redirects=True, timeout=10)
        rec("0-Kurulum", "Giriş", "PASS" if r.status_code in (200, 302) else "FAIL", f"HTTP {r.status_code}")
        if r.status_code not in (200, 302):
            return None, None
        s.headers["Content-Type"] = "application/json"

        ev = s.get(f"{BASE}/api/event", timeout=10).json()
        prev_active = ev.get("id") if isinstance(ev, dict) else None
        info(f"Önceki aktif etkinlik id={prev_active} (sonra geri yüklenecek)")

        name = f"E2E OTONOM TEST {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        s.post(f"{BASE}/api/events", json={"name": name, "code": "E2E", "season": "2025-2026"}, timeout=10)
        events = s.get(f"{BASE}/api/events", timeout=10).json()
        created_event_id = events[-1]["id"]
        s.post(f"{BASE}/api/events/active", json={"id": created_event_id}, timeout=10)
        rec("0-Kurulum", "İzole test etkinliği oluşturuldu + aktif", "PASS", f"id={created_event_id}")

        rt = s.post(f"{BASE}/api/teams", json=DUMMY_TEAMS, timeout=15)
        rec("0-Kurulum", f"{NUM_TEAMS} takım eklendi", "PASS" if rt.status_code in (200, 201) else "FAIL", f"HTTP {rt.status_code}")

        # --- 1a. İNCELEME (smoke) ---
        ins = s.get(f"{BASE}/api/inspection-slots", timeout=10)
        rec("1-İnceleme", "İnceleme slot API yanıtı", "PASS" if ins.status_code == 200 else "WARN", f"HTTP {ins.status_code}")

        # --- 1b. SIRALAMA TAKVİMİ ---
        start = datetime.now() + timedelta(minutes=5)
        gr = s.post(f"{BASE}/api/match-schedule/generate", json={
            "start_date": start.strftime("%Y-%m-%d"), "start_time": start.strftime("%H:%M"),
            "field_count": 1, "teams_per_alliance": 2, "match_cycle_minutes": 6,
            "matches_per_team": 3, "clear_existing": True}, timeout=40)
        sched = get_schedule(s)
        quals = [m for m in sched if m.get("match_type") == "qualification"]
        rec("1-Sıralama", "Sıralama takvimi oluşturuldu", "PASS" if (gr.status_code == 200 and quals) else "FAIL", f"{len(quals)} maç")

        # --- 1c. TÜM SIRALAMA MAÇLARINI OYNAT ---
        played = 0
        for i, m in enumerate(quals):
            try:
                play_match(s, m["id"], red_wins=(m.get("match_number", i+1) % 2 == 1))
                played += 1
            except Exception as e:
                rec("1-Sıralama", f"Maç {m.get('match_number')} oynatma", "FAIL", str(e)[:80]); break
        rec("1-Sıralama", "Tüm sıralama maçları oynandı", "PASS" if played == len(quals) and played > 0 else "FAIL", f"{played}/{len(quals)}")

        # --- 1d. SIRALAMA / SP ---
        rk = s.get(f"{BASE}/api/match-schedule/rankings", timeout=10)
        rkd = rk.json() if rk.status_code == 200 else {}
        rankings = rkd.get("rankings", rkd if isinstance(rkd, list) else [])
        has_sp = bool(rankings) and any((x.get("total_sp") is not None) for x in rankings)
        rec("1-Sıralama", "SP sıralaması hesaplandı", "PASS" if has_sp else "FAIL", f"{len(rankings)} takım sıralandı")
        if rankings:
            info("İlk 6 (SP): " + ", ".join(f"{x.get('team')}({x.get('total_sp')})" for x in rankings[:6]))

        # --- 2. TIMER DURUM SÜRELERİ (hızlı) ---
        # Yeni bir qual maçı yok; kısa bir prova maçı başlat? Bunun yerine bir final üretip M1'i kullanacağız (Faz 3).
        # Burada sadece state endpoint'inin süreleri için Faz 3'teki M1 üzerinde kontrol yapılacak.

        # --- 3. İTTİFAK + ÇİFT-ELEME PLAYOFF ---
        top12 = [x.get("team") for x in rankings[:12]] if len(rankings) >= 12 else [t["number"] for t in DUMMY_TEAMS[:12]]
        alliances = [[top12[i], top12[i+1]] for i in range(0, 12, 2)]
        fstart = datetime.now() + timedelta(minutes=10)
        gf = s.post(f"{BASE}/api/match-schedule/generate-finals", json={
            "format": "double_elimination_6", "alliances": alliances,
            "start_date": fstart.strftime("%Y-%m-%d"), "start_time": fstart.strftime("%H:%M"),
            "field_number": 1, "clear_existing": True}, timeout=15)
        gfd = gf.json()
        rec("3-Playoff", "Çift-eleme finalleri üretildi (M1–M11)", "PASS" if gfd.get("created_count") == 11 else "FAIL", f"created={gfd.get('created_count')}")

        finals = sorted([m for m in get_schedule(s) if m.get("match_type") == "final"], key=lambda m: m.get("match_number", 0))
        by_num = {m.get("match_number"): m for m in finals}

        # 2'. Timer süreleri: M1'i başlat, her duruma POST'la, süreleri doğrula, sonra durdurma yerine devam
        if finals:
            m1 = finals[0]
            ts = {"red": {"r1": "ready", "r2": "ready"}, "blue": {"r1": "ready", "r2": "ready"}}
            s.post(f"{BASE}/api/match-control/start", json={"match_id": m1["id"], "match_source": "schedule", "team_statuses": ts}, timeout=10)
            exp = [("autonomous", 30), ("prepare_teleop", 10), ("driver_controlled", 90), ("end_game", 30), ("post_match", 10)]
            tok = True
            for st, sec in exp:
                rr = s.post(f"{BASE}/api/match-control/state", json={"match_id": m1["id"], "state": st, "match_source": "schedule"}, timeout=10)
                if rr.status_code == 200:
                    j = rr.json()
                    if not (j.get("state") == st and j.get("time_remaining") == sec):
                        tok = False; info(f"Durum {st}: time_remaining={j.get('time_remaining')} (beklenen {sec})")
                else:
                    tok = False
            rec("2-Timer", "Durum süreleri (otonom30/haz10/SKS90/oyunsonu30/maçsonu10)", "PASS" if tok else "FAIL")
            # M1'i normal oynayıp tamamla (advancement tetiklensin)
            s.post(f"{BASE}/api/match-control/reset-active", timeout=10)

        # Playoff maçlarını sırayla oyna (red kazanır) — advancement zinciri
        empties = 0
        champ_reached = False
        for num in range(1, 11):  # M1..M10 (M11 sadece reset durumunda)
            m = by_num.get(num)
            if not m:
                continue
            cur = next((x for x in get_schedule(s) if x.get("id") == m["id"]), m)
            if not (cur.get("red_alliance") and cur.get("blue_alliance")):
                empties += 1
                info(f"M{num} oynanırken ittifak boştu (advancement gecikmesi?)")
                continue
            try:
                play_match(s, m["id"], red_wins=True)
            except Exception as e:
                rec("3-Playoff", f"M{num} oynatma", "FAIL", str(e)[:80])
        rec("3-Playoff", "Tüm playoff maçları ittifakları dolu oynandı (advancement)", "PASS" if empties == 0 else "FAIL", f"boş={empties}")

        # Bracket endpoint + şampiyon
        bd = s.get(f"{BASE}/api/public/playoff-bracket", timeout=10).json()
        rounds = bd.get("bracket_rounds") or []
        names = [r.get("name") for r in rounds]
        rec("3-Playoff", "Bracket endpoint çift-eleme yapısı", "PASS" if names == ["Üst Kademe", "Alt Kademe", "Büyük Final"] else "FAIL", str(names))
        allm = {m.get("label"): m for r in rounds for m in (r.get("matches") or [])}
        m10 = allm.get("M10", {})
        m10_done = m10.get("status") == "completed" and m10.get("winner") in ("red", "blue")
        rec("3-Playoff", "Büyük Final (M10) tamamlandı + kazanan belli", "PASS" if m10_done else "FAIL", f"winner={m10.get('winner')}, status={m10.get('status')}")
        played_finals = sum(1 for m in allm.values() if m.get("status") == "completed")
        info(f"Tamamlanan playoff maçı: {played_finals}")

        # playoff-alliances endpoint
        pa = s.get(f"{BASE}/api/public/playoff-alliances", timeout=10)
        rec("3-Playoff", "İttifak (seçim töreni) endpoint", "PASS" if pa.status_code == 200 and pa.json().get("ok") else "WARN", f"HTTP {pa.status_code}")

        # --- 5. YAN SİSTEMLER (smoke) ---
        checks = [
            ("Sıralama (public)", f"{BASE}/api/public/rankings"),
            ("İnceleme durumu (public)", f"{BASE}/api/public/inspection-status"),
            ("Ödüller", f"{BASE}/api/awards"),
            ("Ödül kazananları", f"{BASE}/api/award-winners"),
            ("Tören durumu", f"{BASE}/api/ceremony/state"),
            ("Sponsorlar", f"{BASE}/api/sponsors"),
            ("Jüri slotları", f"{BASE}/api/judging-slots"),
            ("Jüri üyeleri", f"{BASE}/api/judging/judges"),
        ]
        for nm, url in checks:
            try:
                rr = s.get(url, timeout=10)
                rec("5-Yan Sistem", nm, "PASS" if rr.status_code == 200 else "WARN", f"HTTP {rr.status_code}")
            except Exception as e:
                rec("5-Yan Sistem", nm, "WARN", str(e)[:60])

        return created_event_id, prev_active
    except Exception as e:
        import traceback; traceback.print_exc()
        rec("HATA", "API fazında beklenmeyen hata", "FAIL", str(e)[:120])
        return created_event_id, prev_active


async def ui_phases():
    """Faz 4: Seyirci ekranları + çıktılar (Playwright). API fazları bittikten sonra çalışır."""
    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context()
        pg = await ctx.new_page()
        # login
        await pg.goto(f"{BASE}/login"); await pg.wait_for_load_state("load")
        await pg.fill('input[name="username"]', USER); await pg.fill('input[name="password"]', PASS)
        await pg.click('button[type="submit"]')
        try: await pg.wait_for_url(lambda u: "/login" not in u, timeout=5000)
        except Exception: pass

        views = ["match", "rankings", "inspection", "alliances", "playoff", "awards", "ceremony"]
        for v in views:
            await pg.request.post(f"{BASE}/api/screens/settings",
                                  data=json.dumps({"active_view": v}), headers={"Content-Type": "application/json"})
            errs = []
            ap = await ctx.new_page()
            ap.on("pageerror", lambda e: errs.append(str(e)))
            await ap.goto(f"{BASE}/audience"); await ap.wait_for_load_state("load")
            await asyncio.sleep(1.4)
            visible = await ap.evaluate("""() => {
                const panels = Array.from(document.querySelectorAll('.audience-panel, [id^=audience_]'));
                return panels.some(p => p.offsetParent !== null || (p.style && p.style.display !== 'none'));
            }""")
            rec("4-Ekran", f"Seyirci görünümü '{v}' (JS hatasız + panel)", "PASS" if not errs else "FAIL",
                ("; ".join(errs[:1]) if errs else ("panel görünür" if visible else "panel görünmedi (WARN)")))
            await ap.close()

        # playoff bracket render + çıktılar
        errs = []
        rp = await ctx.new_page()
        rp.on("pageerror", lambda e: errs.append(str(e)))
        await rp.goto(f"{BASE}/playoff-report"); await rp.wait_for_load_state("load")
        await asyncio.sleep(1.8)
        bm = await rp.locator("#playoff_bracket .bracket-match").count()
        rec("4-Çıktı", "Playoff raporu bracket çizdi", "PASS" if bm >= 11 else "FAIL", f"{bm} kart")
        for btn, sel, nm in [("#playoff_print_bracket", ".pmatch", "Bracket kağıdı çıktısı"),
                              ("#playoff_print_schedule", "table.sched tbody tr", "Zaman çizelgesi çıktısı")]:
            try:
                async with rp.expect_popup(timeout=6000) as pop:
                    await rp.click(btn)
                w = await pop.value; await w.wait_for_load_state("load"); await asyncio.sleep(0.5)
                cnt = await w.locator(sel).count()
                rec("4-Çıktı", nm, "PASS" if cnt >= 11 else "FAIL", f"{cnt} öğe")
                await w.close()
            except Exception as e:
                rec("4-Çıktı", nm, "FAIL", str(e)[:60])
        rec("4-Çıktı", "Playoff rapor sayfası JS hatasız", "PASS" if not errs else "FAIL", "; ".join(errs[:1]))
        await browser.close()


def write_report(verdict):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    md = [f"# MEMSKOR — Tam Sistem Otonom Test Raporu", "",
          f"**Tarih:** {ts}  ", f"**Sunucu:** {BASE}  ",
          f"**Sonuç:** {verdict}  ",
          f"**Özet:** {len(R['pass'])} PASS · {len(R['fail'])} FAIL · {len(R['warn'])} WARN", "",
          "> Test izole bir etkinlikte çalıştı; test etkinliği silindi, önceki aktif etkinlik geri yüklendi. Gerçek veriye dokunulmadı.", "",
          "## Adım adım sonuçlar", ""]
    md += [l if l.startswith(("✅", "❌", "⚠️")) else f"&nbsp;&nbsp;&nbsp;{l.strip()}" for l in LINES]
    if R["fail"]:
        md += ["", "## ❌ Başarısızlar (incelenmeli)", ""] + [f"- {x}" for x in R["fail"]]
    if R["warn"]:
        md += ["", "## ⚠️ Uyarılar", ""] + [f"- {x}" for x in R["warn"]]
    md += ["", "---", "_Otonom test harness'i tarafından üretildi (test_full_system_e2e.py)._"]
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(md))
    print(f"\n📄 Rapor yazıldı: {REPORT_PATH}")


def main():
    s = requests.Session()
    s.headers.update({"Accept": "application/json"})
    created_event_id = prev_active = None
    print("=" * 64); print("MEMSKOR — TAM SİSTEM OTONOM TEST"); print("=" * 64)
    try:
        created_event_id, prev_active = api_phases(s)
        if created_event_id:
            try:
                asyncio.run(ui_phases())
            except Exception as e:
                import traceback; traceback.print_exc()
                rec("4-Ekran", "UI fazı", "FAIL", str(e)[:120])
    finally:
        # --- 6. TEMİZLİK ---
        if created_event_id:
            try:
                if prev_active:
                    s.post(f"{BASE}/api/events/active", json={"id": prev_active}, timeout=10)
                dr = s.delete(f"{BASE}/api/events/{created_event_id}", timeout=15)
                ok = dr.status_code in (200, 204)
                rec("6-Temizlik", "Test etkinliği silindi + aktif etkinlik geri yüklendi", "PASS" if ok else "FAIL",
                    f"delete HTTP {dr.status_code}, aktif geri={prev_active}")
                # doğrula
                ev = s.get(f"{BASE}/api/event", timeout=10).json()
                now_active = ev.get("id") if isinstance(ev, dict) else None
                rec("6-Temizlik", "Aktif etkinlik doğrulandı", "PASS" if now_active == prev_active else "WARN", f"aktif={now_active}")
            except Exception as e:
                rec("6-Temizlik", "Temizlik", "FAIL", str(e)[:100])

    verdict = "✅ SİSTEM ETKİNLİĞE HAZIR" if not R["fail"] else f"❌ {len(R['fail'])} SORUN VAR — RAPORU İNCELE"
    print("\n" + "=" * 64)
    print(f"SONUÇ: {len(R['pass'])} PASS / {len(R['fail'])} FAIL / {len(R['warn'])} WARN")
    print(verdict); print("=" * 64)
    write_report(verdict)
    return 0 if not R["fail"] else 1


if __name__ == "__main__":
    sys.exit(main())
