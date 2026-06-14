"""
Playoff bracket/çıktı entegrasyon testi (KENDİNİ TEMİZLER).

Aktif etkinlikte 6 ittifak çift-eleme finalleri üretir, bracket endpoint'ini +
render'ı + yazdırma çıktılarını + seyirci görünümünü doğrular, ardından
oluşturduğu final maçlarını siler ve etkinlik playoff konfigürasyonunu geri
yükler. (İlerletme motoru ayrıca tests/test_double_elimination.py ile doğrulanır.)
"""
import asyncio, json, copy
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

def check(results, name, ok, detail=""):
    (results["pass"] if ok else results["fail"]).append(name)
    print(f"  {'PASS' if ok else 'FAIL'}: {name}" + (f"  [{detail}]" if detail else ""))

async def main():
    results = {"pass": [], "fail": []}
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(); pg = await ctx.new_page()
        await login(pg)

        # --- Snapshot ---
        event_before = await (await pg.request.get(f"{BASE}/api/event")).json()
        playoff_before = copy.deepcopy(event_before.get("playoff")) if isinstance(event_before, dict) else None
        teams = await (await pg.request.get(f"{BASE}/api/teams")).json()
        if not isinstance(teams, list) or len(teams) < 12:
            print("Yeterli takım yok (>=12 gerekli). Test atlandı."); await b.close(); return
        nums = [str(t.get("number")) for t in teams[:12]]
        alliances = [[nums[i], nums[i+1]] for i in range(0, 12, 2)]  # 6 ittifak

        sched_before = await (await pg.request.get(f"{BASE}/api/match-schedule")).json()
        before_list = sched_before.get("schedule", sched_before) if isinstance(sched_before, dict) else sched_before
        finals_before_ids = {m["id"] for m in before_list if (m.get("match_type") == "final")}

        created_final_ids = []
        try:
            # --- Finalleri üret ---
            gr = await pg.request.post(f"{BASE}/api/match-schedule/generate-finals",
                data=json.dumps({"format": "double_elimination_6", "alliances": alliances,
                                 "start_date": "2026-06-16", "start_time": "14:00",
                                 "field_number": 1, "clear_existing": True}),
                headers={"Content-Type": "application/json"})
            gd = await gr.json()
            check(results, "generate-finals 11 maç üretti", gd.get("created_count") == 11,
                  f"created_count={gd.get('created_count')}, err={gd.get('error')}")

            # --- Endpoint yapısı + zenginleştirilmiş alanlar ---
            bd = await (await pg.request.get(f"{BASE}/api/public/playoff-bracket")).json()
            rounds = bd.get("bracket_rounds") or []
            names = [r.get("name") for r in rounds]
            check(results, "Endpoint çift-eleme round'larını döndürüyor",
                  names == ["Üst Kademe", "Alt Kademe", "Büyük Final"], f"{names}")
            allm = [m for r in rounds for m in (r.get("matches") or [])]
            check(results, "11 playoff maçı", len(allm) == 11, f"{len(allm)}")
            # M1-M4 başlangıç ittifakları dolu
            by_label = {m.get("label"): m for m in allm}
            filled = all((by_label.get(f"M{i}", {}).get("red_alliance") for i in (1,2,3,4)))
            check(results, "M1–M4 başlangıç ittifakları dolu", filled)
            # Zenginleştirilmiş alanlar mevcut
            m1 = by_label.get("M1", {})
            has_fields = all(k in m1 for k in ("status","red_score","blue_score","winner","match_time"))
            check(results, "Maç başına status/skor/kazanan/saat alanları var", has_fields,
                  f"M1={ {k:m1.get(k) for k in ('status','winner','match_time')} }")
            check(results, "M1'e saat atanmış", bool(m1.get("match_time")), f"time={m1.get('match_time')}")

            # --- Rapor sayfası render + yazdırma çıktıları ---
            rep = await ctx.new_page(); rep_errs = []
            rep.on("pageerror", lambda e: rep_errs.append(str(e)))
            await rep.goto(f"{BASE}/playoff-report"); await rep.wait_for_load_state("load")
            await asyncio.sleep(1.8)
            bm = await rep.locator("#playoff_bracket .bracket-match").count()
            check(results, "Rapor bracket'ı maç kartlarını çizdi (>=11)", bm >= 11, f"bracket-match={bm}")
            # Yazdırma: bracket kağıdı (popup açılmalı, hatasız)
            try:
                async with rep.expect_popup(timeout=5000) as pop1:
                    await rep.click("#playoff_print_bracket")
                w1 = await pop1.value
                await w1.wait_for_load_state("load"); await asyncio.sleep(0.5)
                ok1 = (await w1.locator(".pmatch").count()) > 0
                check(results, "Bracket kağıdı çıktısı içerik üretti", ok1,
                      f"pmatch={await w1.locator('.pmatch').count()}")
                await w1.close()
            except Exception as e:
                check(results, "Bracket kağıdı çıktısı içerik üretti", False, str(e)[:60])
            # Yazdırma: zaman çizelgesi
            try:
                async with rep.expect_popup(timeout=5000) as pop2:
                    await rep.click("#playoff_print_schedule")
                w2 = await pop2.value
                await w2.wait_for_load_state("load"); await asyncio.sleep(0.5)
                rows = await w2.locator("table.sched tbody tr").count()
                check(results, "Zaman çizelgesi çıktısı satır üretti (>=11)", rows >= 11, f"rows={rows}")
                await w2.close()
            except Exception as e:
                check(results, "Zaman çizelgesi çıktısı satır üretti", False, str(e)[:60])
            check(results, "Rapor sayfasında JS hatası yok", len(rep_errs) == 0, "; ".join(rep_errs[:2]))
            await rep.close()

            # --- Seyirci playoff görünümü ---
            aud = await ctx.new_page(); aud_errs = []
            aud.on("pageerror", lambda e: aud_errs.append(str(e)))
            await aud.goto(f"{BASE}/audience"); await aud.wait_for_load_state("load")
            await asyncio.sleep(1)
            # Paneli görünür yap + render fonksiyonunu çağır
            await aud.evaluate("""() => { const v=document.getElementById('audience_playoff_view'); if(v) v.style.display='block'; }""")
            await aud.evaluate("() => (typeof renderAudiencePlayoff==='function') ? renderAudiencePlayoff() : null")
            await asyncio.sleep(1.2)
            apm = await aud.locator("#audience_playoff_bracket .ap-match").count()
            check(results, "Seyirci playoff görünümü maç kartlarını çizdi (>=11)", apm >= 11, f"ap-match={apm}")
            check(results, "Seyirci ekranında JS hatası yok", len(aud_errs) == 0, "; ".join(aud_errs[:2]))
            await aud.close()

            # Temizlik için oluşturulan final ID'lerini topla
            sched_after = await (await pg.request.get(f"{BASE}/api/match-schedule")).json()
            after_list = sched_after.get("schedule", sched_after) if isinstance(sched_after, dict) else sched_after
            created_final_ids = [m["id"] for m in after_list
                                 if m.get("match_type") == "final" and m["id"] not in finals_before_ids]
        finally:
            # --- TEMİZLİK ---
            deleted = 0
            for mid in created_final_ids:
                dr = await pg.request.delete(f"{BASE}/api/match-schedule/{mid}")
                if dr.ok: deleted += 1
            # Etkinlik playoff konfigürasyonunu geri yükle
            try:
                ev_now = await (await pg.request.get(f"{BASE}/api/event")).json()
                if isinstance(ev_now, dict):
                    ev_now["playoff"] = playoff_before
                    await pg.request.post(f"{BASE}/api/event",
                        data=json.dumps(ev_now), headers={"Content-Type": "application/json"})
            except Exception as e:
                print("  (uyarı) etkinlik geri yüklenemedi:", str(e)[:60])
            # Doğrula: finaller temizlendi
            sched_fin = await (await pg.request.get(f"{BASE}/api/match-schedule")).json()
            fin_list = sched_fin.get("schedule", sched_fin) if isinstance(sched_fin, dict) else sched_fin
            remaining = [m for m in fin_list if m.get("match_type") == "final" and m["id"] not in finals_before_ids]
            print(f"\n  TEMİZLİK: {deleted} final maçı silindi, kalan artık={len(remaining)}")
            check(results, "Temizlik: oluşturulan finaller silindi", len(remaining) == 0)
        await b.close()

    print("\n" + "="*60)
    print(f"SONUC: {len(results['pass'])} PASS / {len(results['fail'])} FAIL")
    for f in results["fail"]:
        print("  FAIL -", f)
    print("="*60)
    return 0 if not results["fail"] else 1

if __name__ == "__main__":
    import sys; sys.exit(asyncio.run(main()))
