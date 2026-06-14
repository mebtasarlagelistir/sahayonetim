"""
Pit Admin testi — sayfa + API + tablet UI (KENDİNİ TEMİZLER).

İzole etkinlikte: takım listesi + check-in, sertifika, kayıp eşya, not akışları;
özet sayımlar; /pit-admin sayfasının tablet'te render'ı + bir aksiyon.
Sonunda test etkinliğini siler, gerçek etkinliği geri yükler.
"""
import asyncio, json, time
from playwright.async_api import async_playwright
BASE = "http://localhost:5001"
REAL_EVENT_NAME = "İstanbul ve Su 2"
R = {"pass": [], "fail": []}
def rec(n, ok, d=""):
    R["pass" if ok else "fail"].append(n)
    print(f"  {'✅' if ok else '❌'} {n}" + (f" — {d}" if d else ""))

async def login(page):
    await page.goto(f"{BASE}/login"); await page.wait_for_load_state("load")
    await page.fill('input[name="username"]', "admin")
    await page.fill('input[name="password"]', "admin123")
    await page.click('button[type="submit"]')
    try: await page.wait_for_url(lambda u: "/login" not in u, timeout=5000)
    except Exception: pass

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        # Tablet viewport (pit yöneticisi tablet kullanır)
        ctx = await b.new_context(viewport={"width": 1024, "height": 768}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); await login(pg)
        created_event_id = None; prev_active = None
        try:
            ev = await (await pg.request.get(f"{BASE}/api/event")).json(); prev_active = ev.get("id")
            await pg.request.post(f"{BASE}/api/events", data=json.dumps({"name": f"PIT TEST {time.strftime('%H:%M:%S')}", "code": "PIT", "season": "2025-2026"}), headers={"Content-Type": "application/json"})
            events = await (await pg.request.get(f"{BASE}/api/events")).json()
            created_event_id = events[-1]["id"]
            await pg.request.post(f"{BASE}/api/events/active", data=json.dumps({"id": created_event_id}), headers={"Content-Type": "application/json"})
            teams = [{"number": f"550{i:02d}", "name": f"Pit Takım {i}", "school": f"Okul {i}", "city": "İstanbul"} for i in range(1, 6)]
            await pg.request.post(f"{BASE}/api/teams", data=json.dumps(teams), headers={"Content-Type": "application/json"})
            T = "55001"

            async def get_teams():
                d = await (await pg.request.get(f"{BASE}/api/pit/teams")).json()
                return d
            async def team(d, tn):
                return next((x for x in d.get("teams", []) if x["team_number"] == tn), None)
            async def post(url, body):
                return await pg.request.post(f"{BASE}{url}", data=json.dumps(body), headers={"Content-Type": "application/json"})

            # Sayfa render (yetki: admin geçer)
            pr = await pg.request.get(f"{BASE}/pit-admin")
            rec("/pit-admin sayfası açılıyor (admin)", pr.ok, f"HTTP {pr.status}")

            d = await get_teams()
            rec("GET /api/pit/teams 5 takım döndü", d.get("ok") and len(d.get("teams", [])) == 5, f"{len(d.get('teams', []))} takım")
            t0 = await team(d, T)
            rec("Başlangıç: check-in kapalı, sertifika bekliyor", t0 and not t0["checked_in"] and t0["certificate_status"] == "pending")

            # Check-in
            await post("/api/pit/status", {"team_number": T, "checked_in": True})
            t1 = await team(await get_teams(), T)
            rec("Check-in açıldı + saat damgalandı", t1 and t1["checked_in"] and bool(t1["checked_in_at"]), f"at={t1 and t1['checked_in_at']}")

            # Sertifika
            await post("/api/pit/status", {"team_number": T, "certificate_status": "received"})
            t2 = await team(await get_teams(), T)
            rec("Sertifika 'received' yapıldı", t2 and t2["certificate_status"] == "received")

            # Not
            await post("/api/pit/status", {"team_number": T, "notes": "Pil şarjı düşük, uyarıldı."})
            t3 = await team(await get_teams(), T)
            rec("Takım notu kaydedildi", t3 and "Pil şarjı" in (t3.get("notes") or ""))

            # Kayıp eşya ekle + çöz
            await post("/api/pit/lost-item", {"team_number": T, "description": "Sürücü kontrol kablosu"})
            t4 = await team(await get_teams(), T)
            li = t4.get("lost_items", []) if t4 else []
            rec("Kayıp eşya eklendi (open)", len(li) == 1 and li[0]["status"] == "open", f"{li}")
            await post("/api/pit/lost-item/resolve", {"team_number": T, "index": 0, "resolved": True})
            t5 = await team(await get_teams(), T)
            rec("Kayıp eşya 'resolved' yapıldı", t5 and t5["lost_items"][0]["status"] == "resolved")

            # Özet sayımlar
            d2 = await get_teams()
            sm = d2.get("summary", {})
            rec("Özet doğru (1 giriş, 1 sertifika, 0 açık kayıp)",
                sm.get("checked_in") == 1 and sm.get("certificate_received") == 1 and sm.get("open_lost_items") == 0, f"{sm}")

            # --- Tablet UI render + aksiyon ---
            errs = []
            page = await ctx.new_page()
            page.on("pageerror", lambda e: errs.append(str(e)))
            await page.goto(f"{BASE}/pit-admin"); await page.wait_for_load_state("load")
            await asyncio.sleep(1.5)
            cards = await page.locator("#pit_list .pit-card").count()
            rec("Tablet: 5 takım kartı render edildi", cards == 5, f"{cards} kart")
            overflow = await page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            rec("Tablet: yatay taşma yok", overflow is not None and overflow <= 4, f"taşma={overflow}px")
            # 2. takımın check-in butonuna bas → kalıcı mı
            btn = page.locator('#pit_list [data-action="checkin"][data-team="55002"]')
            await btn.first.click(timeout=4000)
            await asyncio.sleep(1.0)
            t_after = await team(await get_teams(), "55002")
            rec("Tablet UI: check-in butonu kalıcı çalıştı (55002)", bool(t_after and t_after["checked_in"]))
            rec("Pit Admin sayfasında JS hatası yok", len(errs) == 0, "; ".join(errs[:2]))

        except Exception as e:
            import traceback; traceback.print_exc()
            rec("Beklenmeyen hata", False, str(e)[:140])
        finally:
            try:
                events = await (await pg.request.get(f"{BASE}/api/events")).json()
                real = [e for e in events if e.get("name") == REAL_EVENT_NAME]
                if real:
                    await pg.request.post(f"{BASE}/api/events/active", data=json.dumps({"id": real[0]["id"]}), headers={"Content-Type": "application/json"})
                if created_event_id:
                    dr = await pg.request.delete(f"{BASE}/api/events/{created_event_id}")
                    rec("Temizlik: test etkinliği silindi, gerçek etkinlik aktif", dr.ok and bool(real))
            except Exception as e:
                rec("Temizlik", False, str(e)[:80])
        await b.close()

    print("\n" + "=" * 58)
    print(f"SONUC: {len(R['pass'])} PASS / {len(R['fail'])} FAIL")
    print("✅ PIT ADMIN HAZIR" if not R["fail"] else f"❌ {len(R['fail'])} SORUN")
    print("=" * 58)
    return 0 if not R["fail"] else 1

if __name__ == "__main__":
    import sys; sys.exit(asyncio.run(main()))
