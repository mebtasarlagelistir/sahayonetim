"""
Skor yarış-durumu koruması testi (frontend, deterministik).

Doğrular:
  1. Operatör skor girerken gelen sunucu eko'su (applyRemoteScores) input'u EZMEZ.
  2. Düzenleme penceresi (2sn) bitince, beklemedeki uzak skor uygulanır (eventual consistency).
  3. Düzenleme yokken gelen eko normal şekilde uygulanır.
  4. Hakem panelinde aynı koruma fonksiyonları tanımlı.
"""
import asyncio
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

R = {"pass": 0, "fail": 0}
def check(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}: {name}" + (f"  [{detail}]" if detail else ""))
    R["pass" if ok else "fail"] += (1 if ok else 0) or 0
    if not ok: R["fail"] += 1

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(); errs = []
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await login(pg)
        await pg.goto(f"{BASE}/match-control"); await pg.wait_for_load_state("load")
        await asyncio.sleep(1.5)

        # Test edilecek bir skor input'u bul
        field_id = await pg.evaluate("""() => {
            const cands = ['red_teleop_bent1_own','red_teleop_climb','red_auto_bent1_own','blue_teleop_bent1_own'];
            for (const id of cands) if (document.getElementById(id)) return id;
            const any = document.querySelector("#detailed_scoring input[type=number], input[id^=red_], input[id^=blue_]");
            return any ? any.id : null;
        }""")
        check("Skor input'u mevcut", bool(field_id), f"id={field_id}")
        check("applyRemoteScores tanımlı", await pg.evaluate("() => typeof window.applyRemoteScores === 'function'"))
        check("markLocalScoreEdit tanımlı", await pg.evaluate("() => typeof window.markLocalScoreEdit === 'function'"))

        if field_id:
            alliance = "red" if field_id.startswith("red_") else "blue"
            fname = field_id[len(alliance)+1:]

            # 1) Düzenleme YOKKEN eko uygulanır
            await pg.evaluate("""([fid]) => {
                // düzenleme zaman damgasını eskit (grace dışı)
                window.__forceIdle = true;
            }""", [field_id])
            # grace'i geçmiş say: hiç edit yapmadık, lastLocalScoreEditAt=0 -> idle
            await pg.evaluate("""([al, fn, fid]) => {
                const o = {}; o[al] = {}; o[al][fn] = 9; o[al==='red'?'blue':'red'] = {};
                window.applyRemoteScores(o);
            }""", [alliance, fname, field_id])
            v1 = await pg.evaluate("([fid]) => document.getElementById(fid).value", [field_id])
            check("Düzenleme yokken eko uygulanır (=9)", str(v1) == "9", f"value={v1}")

            # 2) Düzenleme SIRASINDA eko EZMEZ
            await pg.evaluate("""([fid]) => {
                const el = document.getElementById(fid);
                el.value = 7;                      // yerel giriş
                window.markLocalScoreEdit();       // düzenleme işareti (scheduleAutoSaveScore'un yaptığı)
            }""", [field_id])
            await pg.evaluate("""([al, fn]) => {
                const o = {}; o[al] = {}; o[al][fn] = 2; o[al==='red'?'blue':'red'] = {};
                window.applyRemoteScores(o);       // gelen eko (farklı değer)
            }""", [alliance, fname])
            await asyncio.sleep(0.3)
            v2 = await pg.evaluate("([fid]) => document.getElementById(fid).value", [field_id])
            check("Düzenleme sırasında eko EZMEZ (hâlâ 7)", str(v2) == "7", f"value={v2}")
            check("isLocalScoreEditActive() = true", await pg.evaluate("() => window.isLocalScoreEditActive()"))

            # 3) Pencere (2sn) bitince beklemedeki uzak skor (2) uygulanır
            await asyncio.sleep(2.6)
            v3 = await pg.evaluate("([fid]) => document.getElementById(fid).value", [field_id])
            check("Pencere bitince beklemedeki eko uygulanır (=2)", str(v3) == "2", f"value={v3}")

        check("Match-control sayfasında JS hatası yok", len(errs) == 0, "; ".join(errs[:2]))

        # --- Hakem paneli: koruma fonksiyonları tanımlı mı ---
        rerrs = []
        rp = await ctx.new_page(); rp.on("pageerror", lambda e: rerrs.append(str(e)))
        await rp.goto(f"{BASE}/referee/red"); await rp.wait_for_load_state("load")
        await asyncio.sleep(1.2)
        check("Hakem: applyRemoteRefScores tanımlı", await rp.evaluate("() => typeof window.applyRemoteRefScores === 'function'"))
        check("Hakem: markRefScoreEdit tanımlı", await rp.evaluate("() => typeof window.markRefScoreEdit === 'function'"))
        check("Hakem panelinde JS hatası yok", len(rerrs) == 0, "; ".join(rerrs[:2]))

        await b.close()
    print("\n" + "="*56)
    print(f"SONUC: {R['pass']} PASS / {R['fail']} FAIL")
    print("="*56)
    return 0 if R["fail"] == 0 else 1

if __name__ == "__main__":
    import sys; sys.exit(asyncio.run(main()))
