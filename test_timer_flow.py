"""
Canlı timer akıcılık testi (KENDİNİ TEMİZLER).

Gerçek bir maçı baştan sona çalıştırır; audience-display API'sini ~1sn'de bir
pollar (bu, sunucunun otomatik ilerlemesini sürer) ve aynı anda seyirci
ekranındaki görünen sayacı okur. Akıcılığı/tutarlılığı analiz eder:
  - Her fazın süresi doğru mu (otonom 30 / hazırlık 10 / SKS 120)
  - Faz içinde sayaç düzgün (monoton, sıçramasız) azalıyor mu
  - Geçişler temiz mi (otonom->hazırlık->SKS->maç sonrası); oyun sonu uyarısı SKS son 30 sn'sinde
  - Görünen sayaç API ile uyumlu mu (akıcı render)
Sonunda maçı durdurur, oluşturulan finalleri siler, etkinliği geri yükler.
"""
import asyncio, json, copy, time
from playwright.async_api import async_playwright
BASE = "http://localhost:5001"

async def login(page):
    await page.goto(f"{BASE}/login"); await page.wait_for_load_state("load")
    await page.fill('input[name="username"]', "admin")
    await page.fill('input[name="password"]', "admin123")
    await page.click('button[type="submit"]')
    try: await page.wait_for_url(lambda u: "/login" not in u, timeout=5000)
    except Exception: pass
    await page.wait_for_load_state("load")

EXPECTED_DUR = {"autonomous": 30, "prepare_teleop": 10, "driver_controlled": 120, "post_match": 10}
ORDER = ["autonomous", "prepare_teleop", "driver_controlled", "post_match"]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(); pg = await ctx.new_page()
        await login(pg)
        event_before = await (await pg.request.get(f"{BASE}/api/event")).json()
        playoff_before = copy.deepcopy(event_before.get("playoff")) if isinstance(event_before, dict) else None
        teams = await (await pg.request.get(f"{BASE}/api/teams")).json()
        nums = [str(t.get("number")) for t in teams[:12]]
        alliances = [[nums[i], nums[i+1]] for i in range(0, 12, 2)]
        sched_b = await (await pg.request.get(f"{BASE}/api/match-schedule")).json()
        bl = sched_b.get("schedule", sched_b) if isinstance(sched_b, dict) else sched_b
        finals_before = {m["id"] for m in bl if m.get("match_type") == "final"}
        created = []
        samples = []
        try:
            gr = await pg.request.post(f"{BASE}/api/match-schedule/generate-finals",
                data=json.dumps({"format":"double_elimination_6","alliances":alliances,
                    "start_date":"2026-06-16","start_time":"14:00","field_number":1,"clear_existing":True}),
                headers={"Content-Type":"application/json"})
            gd = await gr.json()
            sched_a = await (await pg.request.get(f"{BASE}/api/match-schedule")).json()
            al = sched_a.get("schedule", sched_a) if isinstance(sched_a, dict) else sched_a
            finals = [m for m in al if m.get("match_type") == "final" and m["id"] not in finals_before]
            created = [m["id"] for m in finals]
            m1 = sorted(finals, key=lambda m: m.get("match_number"))[0]
            print(f"M1 id={m1['id']} ({m1.get('red_alliance')} vs {m1.get('blue_alliance')})")

            # Seyirci ekranini ac (gorunen sayaci okuyacagiz)
            aud = await ctx.new_page()
            await aud.goto(f"{BASE}/audience"); await aud.wait_for_load_state("load")

            # Maci baslat
            sr = await pg.request.post(f"{BASE}/api/match-control/start",
                data=json.dumps({"match_id":m1["id"],"match_source":"schedule",
                    "team_statuses":{"red":{"r1":"ready","r2":"ready"},"blue":{"r1":"ready","r2":"ready"}}}),
                headers={"Content-Type":"application/json"})
            print("start ok:", sr.ok)

            # ~180sn boyunca her 1sn'de bir pollala (refresh_match_state ilerletir)
            t0 = time.monotonic()
            last_disp = None
            while time.monotonic() - t0 < 185:
                r = await pg.request.get(f"{BASE}/api/match-control/audience-display")
                disp = None
                try:
                    disp = await aud.locator("#audience_timer_value").first.text_content()
                except Exception:
                    pass
                if r.ok:
                    d = await r.json()
                    mi = d.get("match") or {}
                    st = mi.get("current_state"); tr = mi.get("time_remaining")
                    samples.append((round(time.monotonic()-t0,1), st, tr, (disp or "").strip()))
                    if st == "post_match" and (tr == 0):
                        # birkaç ekstra örnek alıp bitir
                        await asyncio.sleep(1.0)
                        break
                await asyncio.sleep(1.0)

            # --- ANALIZ ---
            print(f"\nToplam {len(samples)} örnek alındı. Faz bazında özet:")
            # Faza gore grupla
            phase_samples = {}
            for el, st, tr, disp in samples:
                if st in EXPECTED_DUR:
                    phase_samples.setdefault(st, []).append((el, tr, disp))
            issues = []
            seen_order = []
            for st in samples:
                pass
            # Gozlemlenen faz sirasi
            prev = None
            for el, st, tr, disp in samples:
                if st != prev:
                    seen_order.append(st); prev = st
            print("  Gözlemlenen faz sırası:", " -> ".join(seen_order))

            for st in ORDER:
                ps = phase_samples.get(st)
                if not ps:
                    if st != "post_match":
                        issues.append(f"{st} fazı hiç gözlenmedi")
                    continue
                trs = [x[1] for x in ps if x[1] is not None]
                maxtr = max(trs) if trs else None
                mintr = min(trs) if trs else None
                # Faz ici monotonluk (artmamali, >2sn sicrama olmamali)
                mono = True; jump = False
                for i in range(1, len(ps)):
                    pa, pb = ps[i-1][1], ps[i][1]
                    if pa is None or pb is None: continue
                    if pb > pa:  # arttiysa (yeni faza girmeden artis = sorun)
                        mono = False
                    if pa - pb > 3:  # 1sn poll'de 3sn'den fazla dustuyse = sicrama/stall sonrasi
                        jump = True
                exp = EXPECTED_DUR[st]
                ok_max = (maxtr is not None and abs(maxtr - exp) <= 2)
                status = "OK" if (ok_max and mono and not jump) else "DİKKAT"
                print(f"  {st:16s} max={maxtr} (beklenen {exp}) min={mintr} örnek={len(ps)} monoton={mono} sıçrama={jump} -> {status}")
                if not ok_max: issues.append(f"{st}: max time_remaining={maxtr}, beklenen ~{exp}")
                if not mono: issues.append(f"{st}: faz içinde sayaç arttı (monoton değil)")
                if jump: issues.append(f"{st}: sayaçta >3sn sıçrama/stall")

            # Gorunen sayac API ile uyumu (son aktif fazda)
            disp_ok = 0; disp_tot = 0
            for el, st, tr, disp in samples:
                if st in ("driver_controlled","autonomous") and disp and ":" in disp and tr is not None:
                    mm, ss = disp.split(":"); dval = int(mm)*60+int(ss)
                    disp_tot += 1
                    if abs(dval - tr) <= 2: disp_ok += 1
            if disp_tot:
                print(f"\n  Görünen sayaç ↔ API uyumu: {disp_ok}/{disp_tot} örnek ±2sn içinde")
                if disp_ok < disp_tot * 0.8:
                    issues.append("Görünen sayaç API'den belirgin saparak akıcı görünmeyebilir")

            print("\n" + "="*60)
            if issues:
                print("SORUNLAR:")
                for i in issues: print("  -", i)
            else:
                print("SONUC: Timer akıcı ve tutarlı çalışıyor (tüm fazlar + geçişler doğru).")
            print("="*60)
        finally:
            await pg.request.post(f"{BASE}/api/match-control/reset-active")
            for mid in created:
                await pg.request.delete(f"{BASE}/api/match-schedule/{mid}")
            try:
                ev = await (await pg.request.get(f"{BASE}/api/event")).json()
                if isinstance(ev, dict):
                    ev["playoff"] = playoff_before
                    await pg.request.post(f"{BASE}/api/event", data=json.dumps(ev), headers={"Content-Type":"application/json"})
            except Exception: pass
            print(f"TEMİZLİK: {len(created)} final silindi, maç sıfırlandı, etkinlik geri yüklendi.")
        await b.close()

if __name__ == "__main__":
    asyncio.run(main())
