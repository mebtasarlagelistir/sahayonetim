"""
Oyun Sonu (end_game) akışı + sesler + "Maçı Göster" testi.

Bu test, son değişiklikleri doğrular:
  1) Maç akışına end_game eklendi: autonomous -> prepare_teleop -> driver_controlled -> end_game -> post_match
  2) SKS 90 sn, Oyun Sonu 30 sn (sürücü dönemi 120 sn)
  3) Seyirci ekranında announceState tüm durumlar için (yeni prepare_teleop + end_game dahil) hatasız çalışıyor
  4) Frontend MATCH_CONSTANTS.DRIVER_CONTROLLED_DURATION == 90
  5) "Maçı Göster" seyirci ekranını canlı maç görünümüne alıyor

Kullanım: python test_endgame_sounds_flow.py
"""

import asyncio
import json
import time
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:5001"

EXPECTED = [
    ("autonomous", 30),
    ("prepare_teleop", 10),
    ("driver_controlled", 90),
    ("end_game", 30),
    ("post_match", 10),
]


async def login(page, username="admin", password="admin123"):
    await page.goto(f"{BASE_URL}/login")
    await page.wait_for_load_state("load")
    await page.fill('input[name="username"]', username)
    await page.fill('input[name="password"]', password)
    await page.click('button[type="submit"]')
    try:
        await page.wait_for_url(lambda url: "/login" not in url, timeout=5000)
    except Exception:
        pass
    await page.wait_for_load_state("load")


async def main():
    print("\n" + "=" * 70)
    print("OYUN SONU AKISI + SESLER + MACI GOSTER TESTI")
    print(time.strftime("%Y-%m-%d %H:%M:%S"))
    print("=" * 70)

    results = {"passed": [], "failed": []}

    def check(name, ok, detail=""):
        (results["passed"] if ok else results["failed"]).append(name)
        print(f"  {'PASS' if ok else 'FAIL'}: {name}" + (f"  [{detail}]" if detail else ""))

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        mc = await context.new_page()
        audience = await context.new_page()

        # Seyirci ekranindan konsol + sayfa hatalarini topla
        console_msgs = []
        page_errors = []
        audience.on("console", lambda m: console_msgs.append(m.text))
        audience.on("pageerror", lambda e: page_errors.append(str(e)))

        try:
            await login(mc)
            await mc.goto(f"{BASE_URL}/match-control")
            await mc.wait_for_load_state("load")
            await audience.goto(f"{BASE_URL}/audience")
            await audience.wait_for_load_state("load")
            await asyncio.sleep(1)

            # --- Frontend sabiti: SKS 90 ---
            sks = await audience.evaluate("() => (window.MATCH_CONSTANTS||{}).DRIVER_CONTROLLED_DURATION")
            eg = await audience.evaluate("() => (window.MATCH_CONSTANTS||{}).END_GAME_DURATION")
            check("Frontend MATCH_CONSTANTS.DRIVER_CONTROLLED_DURATION == 90", sks == 90, f"geldi: {sks}")
            check("Frontend MATCH_CONSTANTS.END_GAME_DURATION == 30", eg == 30, f"geldi: {eg}")

            # --- Ses fonksiyonlari hatasiz calisiyor mu (yeni prepare_teleop + end_game dahil) ---
            print("\n[Sesler] announceState tum durumlar icin cagriliyor...")
            sound_states = ["autonomous", "prepare_teleop", "driver_controlled", "end_game", "post_match"]
            for st in sound_states:
                err = await audience.evaluate(
                    """(st) => { try { if (typeof announceState !== 'function') return 'announceState YOK';
                       announceState(st); return null; } catch(e){ return String(e); } }""",
                    st,
                )
                check(f"announceState('{st}') hatasiz", err is None, err or "")
            # announceResults
            err = await audience.evaluate(
                """() => { try { if (typeof announceResults !== 'function') return 'announceResults YOK';
                   announceResults({red_score:10, blue_score:8}); return null; } catch(e){ return String(e); } }"""
            )
            check("announceResults hatasiz", err is None, err or "")

            # --- Mac akisi: start + her duruma gecir, sureleri dogrula ---
            print("\n[Akis] Mac baslatiliyor ve durumlar gecirilıyor...")
            await mc.request.post(f"{BASE_URL}/api/match-control/reset-active")
            await asyncio.sleep(0.5)
            resp = await mc.request.get(f"{BASE_URL}/api/match-schedule")
            sched = await resp.json()
            matches = sched.get("schedule", []) if isinstance(sched, dict) else sched

            if not matches:
                check("Maç takviminde maç var", False, "maç yok - akış testi atlandı")
            else:
                m = matches[0]
                mid = m.get("id")
                src = m.get("source") or m.get("match_source") or "schedule"
                team_statuses = {"red": {"r1": "ready", "r2": "ready"},
                                 "blue": {"r1": "ready", "r2": "ready"}}
                r = await mc.request.post(
                    f"{BASE_URL}/api/match-control/start",
                    data=json.dumps({"match_id": mid, "match_source": src, "team_statuses": team_statuses}),
                    headers={"Content-Type": "application/json"},
                )
                started = r.ok or "zaten" in (await r.text()).lower() or "already" in (await r.text()).lower()
                check("Maç başlatıldı", started, f"status {r.status}")

                # Her durumu acikca POST et ve donen time_remaining'i dogrula
                for state, expected_secs in EXPECTED:
                    rs = await mc.request.post(
                        f"{BASE_URL}/api/match-control/state",
                        data=json.dumps({"match_id": mid, "state": state, "match_source": src}),
                        headers={"Content-Type": "application/json"},
                    )
                    ok = rs.ok
                    detail = f"status {rs.status}"
                    if ok:
                        d = await rs.json()
                        got_state = d.get("state", d.get("current_state"))
                        got_time = d.get("time_remaining")
                        ok = (got_state == state) and (got_time == expected_secs)
                        detail = f"state={got_state}, time_remaining={got_time} (beklenen {expected_secs})"
                    check(f"Durum '{state}' kabul + süre {expected_secs}s", ok, detail)

                # Audience-display API son durumu (post_match) gosteriyor mu
                rd = await audience.request.get(f"{BASE_URL}/api/match-control/audience-display")
                if rd.ok:
                    dd = await rd.json()
                    mi = dd.get("match", {}) or {}
                    check("Audience-display API maç durumu döndürüyor",
                          isinstance(mi, dict) and mi.get("current_state") is not None,
                          f"current_state={mi.get('current_state')}")

            # --- "Maçı Göster": canli moda al ---
            print("\n[Maçı Göster] Seyirci ekranı canlı moda alınıyor...")
            rv = await mc.request.post(
                f"{BASE_URL}/api/screens/preview",
                data=json.dumps({"view": "match", "mode": "live"}),
                headers={"Content-Type": "application/json"},
            )
            check("Maçı Göster (mode=live) isteği OK", rv.ok, f"status {rv.status}")
            await asyncio.sleep(0.5)
            view_resp = await audience.request.get(f"{BASE_URL}/api/screens/view?screen_id=test")
            vd = await view_resp.json()
            check("Maçı Göster sonrası active_view == 'match'", vd.get("active_view") == "match",
                  f"active_view={vd.get('active_view')}")

            # --- Seyirci ekraninda JS hatasi olmamali ---
            real_errors = [e for e in page_errors]
            check("Seyirci ekranında JS sayfa hatası yok", len(real_errors) == 0,
                  "; ".join(real_errors[:3]))

            # Ses loglarini goster (kanit)
            sound_logs = [c for c in console_msgs if "ses efekti" in c.lower() or "ses efekti çalındı" in c.lower()]
            print(f"\n  [kanıt] Seyirci konsolunda {len(sound_logs)} ses-efekti logu yakalandı:")
            for sl in sound_logs[:8]:
                print(f"    - {sl}")

        finally:
            await browser.close()

    print("\n" + "=" * 70)
    print(f"SONUC: {len(results['passed'])} PASS / {len(results['failed'])} FAIL")
    if results["failed"]:
        print("BASARISIZ:")
        for f in results["failed"]:
            print(f"  - {f}")
    print("=" * 70)
    return 0 if not results["failed"] else 1


if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
