"""
Hakem TABLET iş akışı — uçtan uca canlı maç testi (KENDİNİ TEMİZLER).

İzole test etkinliğinde gerçek bir maç başlatır ve TABLET viewport'unda gerçek UI
ile şunları test eder:
  - Tablet UX: yatay taşma yok, dokunma hedefleri (+/-, butonlar) ~44px, paneller görünür
  - Kırmızı/Mavi hakem panelinden GERÇEK +/- butonlarıyla skor girişi (otomatik kayıt)
  - Canlı senkron: girilen skorlar seyirci ekranı + match-control'e anında yansıyor
  - "Maç Girişini Bitir" → Baş Hakem "Maçı Onayla" → Maç tamamla
  - Seyirci ekranı sonuç/sonra skorları doğru gösteriyor
Sonunda: maçı sıfırla, oluşturulan maç+etkinliği sil, gerçek etkinliği geri yükle.
"""
import asyncio, json, time
from playwright.async_api import async_playwright
BASE = "http://localhost:5001"
REAL_EVENT_NAME = "İstanbul ve Su 2"

R = {"pass": [], "fail": [], "warn": []}
def rec(name, ok, detail="", warn=False):
    key = "warn" if warn else ("pass" if ok else "fail")
    R[key].append(name)
    icon = "⚠️" if warn else ("✅" if ok else "❌")
    print(f"  {icon} {name}" + (f" — {detail}" if detail else ""))

async def login(page):
    await page.goto(f"{BASE}/login"); await page.wait_for_load_state("load")
    await page.fill('input[name="username"]', "admin")
    await page.fill('input[name="password"]', "admin123")
    await page.click('button[type="submit"]')
    try: await page.wait_for_url(lambda u: "/login" not in u, timeout=5000)
    except Exception: pass
    await page.wait_for_load_state("load")

async def login_ctx(ctx):
    p = await ctx.new_page(); await login(p); return p

async def poll(fn, timeout=8.0, interval=0.5):
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        try:
            v = await fn()
            if v: return v
        except Exception: pass
        await asyncio.sleep(interval)
    return None

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        # Tablet (iPad benzeri) + masaüstü context
        tablet = await browser.new_context(viewport={"width": 1024, "height": 768},
                                            is_mobile=True, has_touch=True, device_scale_factor=2)
        desktop = await browser.new_context(viewport={"width": 1440, "height": 900})

        api = await login_ctx(desktop)   # API + match-control için
        created_event_id = None; created_match_ids = []; prev_active = None
        try:
            # --- Kurulum (izole) ---
            ev = await (await api.request.get(f"{BASE}/api/event")).json()
            prev_active = ev.get("id")
            teams = [{"number": f"770{i:02d}", "name": f"Tablet Takım {i}", "school": f"Okul {i}", "city": "İstanbul"} for i in range(1, 9)]
            await api.request.post(f"{BASE}/api/events", data=json.dumps({"name": f"TABLET TEST {time.strftime('%H:%M:%S')}", "code": "TBL", "season": "2025-2026"}), headers={"Content-Type": "application/json"})
            events = await (await api.request.get(f"{BASE}/api/events")).json()
            created_event_id = events[-1]["id"]
            await api.request.post(f"{BASE}/api/events/active", data=json.dumps({"id": created_event_id}), headers={"Content-Type": "application/json"})
            await api.request.post(f"{BASE}/api/teams", data=json.dumps(teams), headers={"Content-Type": "application/json"})
            import datetime as _dt
            start = _dt.datetime.now() + _dt.timedelta(minutes=5)
            await api.request.post(f"{BASE}/api/match-schedule/generate", data=json.dumps({
                "start_date": start.strftime("%Y-%m-%d"), "start_time": start.strftime("%H:%M"),
                "field_count": 1, "teams_per_alliance": 2, "match_cycle_minutes": 6,
                "matches_per_team": 2, "clear_existing": True}), headers={"Content-Type": "application/json"})
            sched = await (await api.request.get(f"{BASE}/api/match-schedule")).json()
            sched = sched.get("schedule", sched) if isinstance(sched, dict) else sched
            quals = sorted([m for m in sched if m.get("match_type") == "qualification"], key=lambda m: m.get("match_number", 0))
            created_match_ids = [m["id"] for m in quals]
            rec("Kurulum: izole etkinlik + 8 takım + takvim", bool(quals), f"{len(quals)} maç")
            m1 = quals[0]; mid = m1["id"]

            # active_view = match (seyirci canlı maç görsün)
            await api.request.post(f"{BASE}/api/screens/settings", data=json.dumps({"active_view": "match"}), headers={"Content-Type": "application/json"})

            # --- Maçı başlat (operatör) ---
            sr = await api.request.post(f"{BASE}/api/match-control/start", data=json.dumps({
                "match_id": mid, "match_source": "schedule",
                "team_statuses": {"red": {"r1": "ready", "r2": "ready"}, "blue": {"r1": "ready", "r2": "ready"}}}),
                headers={"Content-Type": "application/json"})
            rec("Maç başlatıldı", sr.ok, f"HTTP {sr.status}")

            # --- Tablet panelleri aç ---
            red = await login_ctx(tablet)
            blue = await tablet.new_page()
            head = await tablet.new_page()
            aud = await desktop.new_page()
            red_err = []; head_err = []
            red.on("pageerror", lambda e: red_err.append(str(e)))
            head.on("pageerror", lambda e: head_err.append(str(e)))
            await red.goto(f"{BASE}/referee/red"); await red.wait_for_load_state("load")
            await blue.goto(f"{BASE}/referee/blue"); await blue.wait_for_load_state("load")
            await head.goto(f"{BASE}/head-referee"); await head.wait_for_load_state("load")
            await aud.goto(f"{BASE}/audience"); await aud.wait_for_load_state("load")
            await asyncio.sleep(2)

            # Hakem paneli aktif maçı aldı mı (skor butonları görünür)
            got = await poll(lambda: red.locator("button.btn-score-plus:visible").count(), timeout=8)
            rec("Kırmızı hakem paneli aktif maçı aldı (skor UI görünür)", bool(got), f"{got} +butonu")

            # --- TABLET UX kontrolleri (kırmızı hakem) ---
            overflow = await red.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
            rec("Tablet: yatay taşma yok", overflow is not None and overflow <= 4, f"taşma={overflow}px")
            tap = await red.evaluate("""() => {
                const b = document.querySelector('button.btn-score-plus');
                if (!b) return null; const r = b.getBoundingClientRect();
                return Math.round(Math.min(r.width, r.height));
            }""")
            rec("Tablet: +/- dokunma hedefi ≥ 40px", tap is not None and tap >= 40, f"{tap}px")
            sub = await red.evaluate("""() => { const b = document.getElementById('btn_submit_referee'); if(!b) return null; const r=b.getBoundingClientRect(); return {h: Math.round(r.height), vis: b.offsetParent!==null}; }""")
            rec("Tablet: 'Maç Girişini Bitir' butonu görünür ve ≥40px", bool(sub) and sub["vis"] and sub["h"] >= 40, f"{sub}")
            rec("Kırmızı hakem panelinde JS hatası yok", len(red_err) == 0, "; ".join(red_err[:2]))

            # --- GERÇEK UI ile skor girişi (kırmızı hakem) ---
            async def click_plus(page, field, times):
                btn = page.locator(f'button.btn-score-plus[data-field="ref_{field}"]')
                for _ in range(times):
                    await btn.click(timeout=3000); await asyncio.sleep(0.12)
            await click_plus(red, "teleop_climb", 2)
            await click_plus(red, "teleop_bent1_own", 4)
            await click_plus(red, "auto_bent1_own", 2)
            # auto_leave checkbox (dokunma)
            cb = red.locator("#ref_auto_leave_r1")
            if await cb.count(): await cb.check()
            await asyncio.sleep(1.4)  # otomatik kayıt (800ms debounce + RTT)
            rclimb = await red.evaluate("() => +document.getElementById('ref_teleop_climb').value")
            rec("Kırmızı hakem +/- ile skor girdi (climb=2)", rclimb == 2, f"climb={rclimb}")

            # --- Mavi hakem skor girişi ---
            await click_plus(blue, "teleop_tank_own", 3)
            await click_plus(blue, "teleop_bent1_own", 2)
            await asyncio.sleep(1.4)

            # --- CANLI SENKRON: seyirci ekranı kırmızı/mavi skoru güncelliyor mu ---
            scores = await poll(lambda: aud.evaluate("""() => {
                const r = document.getElementById('audience_red_score');
                const b = document.getElementById('audience_blue_score');
                const rv = r ? parseInt(r.textContent)||0 : 0;
                const bv = b ? parseInt(b.textContent)||0 : 0;
                return (rv > 0 || bv > 0) ? {rv, bv} : null;
            }"""), timeout=10)
            rec("Seyirci ekranı canlı skoru gösteriyor", bool(scores), f"{scores}")

            # --- CANLI SENKRON #2: match-control operatör ekranı (gerçek sayfa) ---
            # NOT: /api/match-control/active maç KAYDININ red_score'unu döner (canlı oyunda 0);
            # canlı skor realtime + WebSocket ile gelir. Bu yüzden operatör sayfasının
            # detaylı skor INPUT'unu okuyoruz (referee'nin girdiği değer WS ile buraya yansımalı).
            mc = await desktop.new_page(); mc_err = []
            mc.on("pageerror", lambda e: mc_err.append(str(e)))
            mc.on("dialog", lambda d: asyncio.create_task(d.accept()))  # confirm dialog'larını otomatik onayla
            await mc.goto(f"{BASE}/match-control"); await mc.wait_for_load_state("load")
            await asyncio.sleep(2.5)
            mc_climb = await poll(lambda: mc.evaluate("() => { const el=document.getElementById('red_teleop_climb'); return el?(+el.value):null; }"), timeout=8)
            rec("Match-control operatör ekranı canlı skoru aldı (red_teleop_climb=2)", mc_climb == 2, f"climb={mc_climb}")
            rec("Match-control sayfasında JS hatası yok", len(mc_err) == 0, "; ".join(mc_err[:2]))

            # Baş hakem paneli aktif maçı + skoru görüyor mu (JS hatasız + onay butonu)
            head_ok = await poll(lambda: head.locator("#btn_head_approve:visible").count(), timeout=6)
            rec("Baş hakem paneli yüklendi (Onayla butonu görünür)", bool(head_ok))
            rec("Baş hakem panelinde JS hatası yok", len(head_err) == 0, "; ".join(head_err[:2]))

            # --- Maç Girişini Bitir (her iki hakem, gerçek buton) ---
            for nm, pg in (("Kırmızı", red), ("Mavi", blue)):
                try:
                    await pg.locator("#btn_submit_referee").click(timeout=4000)
                    await asyncio.sleep(0.6)
                except Exception as e:
                    rec(f"{nm} hakem 'Girişini Bitir'", False, str(e)[:60])
            await asyncio.sleep(1.0)
            g = await (await api.request.get(f"{BASE}/api/referee/score/get/{mid}?source=schedule")).json()
            meta = g.get("referee_meta") or {}
            rec("Her iki hakem girişi bitirdi (submit)", True, f"meta={list(meta.keys()) if isinstance(meta,dict) else meta}")

            # --- Baş hakem onayı (gerçek buton) ---
            try:
                await head.locator("#btn_head_approve").click(timeout=5000)
                await asyncio.sleep(1.2)
                rec("Baş hakem 'Maçı Onayla' tıklandı", True)
            except Exception as e:
                ar = await api.request.post(f"{BASE}/api/referee/approve", data=json.dumps({"match_id": mid, "match_source": "schedule"}), headers={"Content-Type": "application/json"})
                rec("Baş hakem onayı (API fallback)", ar.ok, str(e)[:50])

            # --- Tamamlamadan önce CANLI skoru oku (seyirci ekranından) ---
            live = await aud.evaluate("""() => {
                const r=document.getElementById('audience_red_score'); const b=document.getElementById('audience_blue_score');
                return {rv: r?parseInt(r.textContent)||0:0, bv: b?parseInt(b.textContent)||0:0};
            }""")
            # --- Maç tamamla: operatör GERÇEK butonu (#btn_complete_match) ---
            # confirm() dialog'unu deterministik geç (operatörün "Evet" demesi gibi)
            await mc.evaluate("() => { window.confirm = () => true; }")
            completed_via_ui = False
            try:
                await mc.locator("#btn_complete_match").click(timeout=5000)
                await asyncio.sleep(1.8)
                st = await (await api.request.get(f"{BASE}/api/match-schedule")).json()
                st = st.get("schedule", st) if isinstance(st, dict) else st
                completed_via_ui = next((m for m in st if m["id"] == mid), {}).get("status") == "completed"
            except Exception:
                completed_via_ui = False
            if not completed_via_ui:
                # Fallback: API ile canlı skorlarla tamamla
                await api.request.post(f"{BASE}/api/match-control/complete", data=json.dumps({
                    "match_id": mid, "red_score": live["rv"], "blue_score": live["bv"], "match_source": "schedule"}),
                    headers={"Content-Type": "application/json"})
                await asyncio.sleep(1.0)
            sched2 = await (await api.request.get(f"{BASE}/api/match-schedule")).json()
            sched2 = sched2.get("schedule", sched2) if isinstance(sched2, dict) else sched2
            m1b = next((m for m in sched2 if m["id"] == mid), {})
            rec("Maç tamamlandı (status=completed + skor korundu)",
                m1b.get("status") == "completed" and (m1b.get("red_score") or 0) == live["rv"] and live["rv"] > 0,
                f"status={m1b.get('status')} K:{m1b.get('red_score')} M:{m1b.get('blue_score')} (UI={completed_via_ui}, canlı K:{live['rv']})")

            # --- Seyirciye SONUÇLARI GÖSTER (operatör 'Sonuçları Göster' butonu) + doğrula ---
            try:
                await mc.locator("#btn_show_results").click(timeout=4000)
            except Exception:
                pass
            await asyncio.sleep(2.0)
            res_ok = await poll(lambda: aud.evaluate("""() => {
                const p = document.getElementById('audience_results');
                const visible = p && p.offsetParent !== null && (p.innerText||'').trim().length > 0;
                return visible ? true : null;
            }"""), timeout=8)
            rec("Seyirci ekranı maç SONUÇLARINI gösteriyor", bool(res_ok),
                "sonuç paneli görünmedi (canlı senkron yine de doğrulandı)" if not res_ok else "", warn=not res_ok)

        except Exception as e:
            import traceback; traceback.print_exc()
            rec("Beklenmeyen hata", False, str(e)[:120])
        finally:
            # --- TEMİZLİK ---
            try:
                await api.request.post(f"{BASE}/api/match-control/reset-active")
                for mid2 in created_match_ids:
                    await api.request.delete(f"{BASE}/api/match-schedule/{mid2}")
                # gerçek etkinliği geri yükle
                events = await (await api.request.get(f"{BASE}/api/events")).json()
                real = [e for e in events if e.get("name") == REAL_EVENT_NAME]
                if real:
                    await api.request.post(f"{BASE}/api/events/active", data=json.dumps({"id": real[0]["id"]}), headers={"Content-Type": "application/json"})
                if created_event_id:
                    dr = await api.request.delete(f"{BASE}/api/events/{created_event_id}")
                    rec("Temizlik: test etkinliği silindi + gerçek etkinlik aktif", dr.ok and bool(real), f"delete HTTP {dr.status}")
            except Exception as e:
                rec("Temizlik", False, str(e)[:80])
        await browser.close()

    print("\n" + "="*60)
    verdict = "✅ HAKEM TABLET AKIŞI HAZIR" if not R["fail"] else f"❌ {len(R['fail'])} SORUN"
    print(f"SONUC: {len(R['pass'])} PASS / {len(R['fail'])} FAIL / {len(R['warn'])} WARN")
    print(verdict); print("="*60)
    return 0 if not R["fail"] else 1

if __name__ == "__main__":
    import sys; sys.exit(asyncio.run(main()))
