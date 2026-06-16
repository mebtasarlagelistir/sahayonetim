"""
Ödül girişi + Tören (seyirci ekranından yayın) testi — uçtan uca (KENDİNİ TEMİZLER).

İzole test etkinliğinde:
  1. Ödül tanımları + kazanan atamaları girilir (API)
  2. Seyirci "Ödüller" görünümü tüm kazananları doğru listeliyor mu
  3. Tören yayını: start → adımlar (ödül adı → jüri notu → kazanan) → seyirci ekranı
     CANLI (WebSocket ceremony_update) güncelleniyor mu → sonraki ödül → stop(idle)
Sonunda: töreni durdur, kazananları+ödülleri+etkinliği sil, gerçek etkinliği geri yükle.
"""
import asyncio, json, time, sys, io
# Windows konsolunda emoji/Türkçe çıktısı için UTF-8 zorla (cp1252 çökmesini önler)
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
from playwright.async_api import async_playwright
BASE = "http://localhost:5001"

R = {"pass": [], "fail": [], "warn": []}
def rec(name, ok, detail="", warn=False):
    R["warn" if warn else ("pass" if ok else "fail")].append(name)
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

async def poll(fn, timeout=8.0, interval=0.4):
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        try:
            v = await fn()
            if v: return v
        except Exception: pass
        await asyncio.sleep(interval)
    return None

AWARDS = [
    {"name": "En İyi Tasarım Ödülü", "category": "juri", "type": "juri", "sponsor": "", "description": "Üstün robot tasarımı"},
    {"name": "Takım Ruhu Ödülü", "category": "juri", "type": "juri", "sponsor": "", "description": "Örnek takım çalışması"},
    {"name": "Şampiyonluk Ödülü", "category": "performans", "type": "performans", "sponsor": "", "description": "Turnuva birincisi"},
]

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context()
        big = await browser.new_context(viewport={"width": 1920, "height": 1080})  # seyirci ekranı
        api = await ctx.new_page(); await login(api)
        created_event_id = None; prev_active = None; winner_ids = []
        try:
            # --- Kurulum ---
            ev = await (await api.request.get(f"{BASE}/api/event")).json(); prev_active = ev.get("id")
            await api.request.post(f"{BASE}/api/events", data=json.dumps({"name": f"ODUL TEST {time.strftime('%H:%M:%S')}", "code": "ODL", "season": "2025-2026"}), headers={"Content-Type": "application/json"})
            events = await (await api.request.get(f"{BASE}/api/events")).json()
            created_event_id = events[-1]["id"]
            await api.request.post(f"{BASE}/api/events/active", data=json.dumps({"id": created_event_id}), headers={"Content-Type": "application/json"})
            teams = [{"number": f"660{i:02d}", "name": f"Ödül Takım {i}", "school": f"Okul {i}", "city": "İstanbul"} for i in range(1, 7)]
            await api.request.post(f"{BASE}/api/teams", data=json.dumps(teams), headers={"Content-Type": "application/json"})

            # --- 1. Ödül tanımları ---
            ar = await api.request.post(f"{BASE}/api/awards", data=json.dumps(AWARDS), headers={"Content-Type": "application/json"})
            rec("Ödül tanımları kaydedildi", ar.ok and (await ar.json()).get("count") == 3, f"HTTP {ar.status}")

            # --- 1b. Kazanan atamaları ---
            winners_payload = [
                {"award_name": AWARDS[0]["name"], "award_category": "juri", "award_description": AWARDS[0]["description"],
                 "winner_team_number": "66001", "winner_team_name": "Ödül Takım 1", "jury_note": "Yenilikçi mekanizma tasarımı", "presentation_order": 1},
                {"award_name": AWARDS[1]["name"], "award_category": "juri", "award_description": AWARDS[1]["description"],
                 "winner_team_number": "66003", "winner_team_name": "Ödül Takım 3", "jury_note": "Örnek dayanışma", "presentation_order": 2},
                {"award_name": AWARDS[2]["name"], "award_category": "performans", "award_description": AWARDS[2]["description"],
                 "winner_team_number": "66005", "winner_team_name": "Ödül Takım 5", "jury_note": "", "presentation_order": 3},
            ]
            wr = await api.request.post(f"{BASE}/api/award-winners", data=json.dumps(winners_payload), headers={"Content-Type": "application/json"})
            rec("Ödül kazananları kaydedildi (3)", wr.ok and (await wr.json()).get("count") == 3, f"HTTP {wr.status}")

            pub = await (await api.request.get(f"{BASE}/api/public/award-winners")).json()
            assigned = [w for w in pub if w.get("winner_team_number")]
            rec("Public ödül kazananları listeleniyor (3, public)", len(assigned) == 3, f"{len(assigned)} kazanan")
            winner_ids = [w["id"] for w in pub if w.get("id") is not None]

            # --- 2. Seyirci 'Ödüller' görünümü ---
            # Seyirci ekranı oturum açık + açık (heartbeat ile kayıtlı). Görünüm,
            # operatörün GERÇEKTE kullandığı PER-SCREEN kontrol ile değiştirilir
            # (/api/screens/control → ekran-hedefli view_change WS).
            aud = await big.new_page(); aud_err = []
            aud.on("pageerror", lambda e: aud_err.append(str(e)))
            await login(aud)
            await aud.goto(f"{BASE}/audience"); await aud.wait_for_load_state("load")
            await asyncio.sleep(2.5)  # heartbeat ile registry'ye kaydolsun
            screen_id = await poll(lambda: aud.evaluate("() => (window.AudienceCore && window.AudienceCore.screenId) || ''"), timeout=8)
            rec("Seyirci ekranı kayıt oldu (screenId)", bool(screen_id), f"id={str(screen_id)[:18]}")

            async def screen_view(view):
                return await api.request.post(f"{BASE}/api/screens/control", data=json.dumps({"screen_id": screen_id, "desired_view": view}), headers={"Content-Type": "application/json"})

            cv = await screen_view("awards")
            rec("Operatör seyirci ekranını 'Ödüller' görünümüne aldı (per-screen)", cv.ok, f"HTTP {cv.status}")
            rows = await poll(lambda: aud.locator("#audience_awards_list .award-winner-row").count(), timeout=10)
            rec("Seyirci 'Ödüller' görünümü 3 kazananı listeledi", rows == 3, f"{rows} satır")
            shows_team = await aud.evaluate("() => (document.getElementById('audience_awards_list')?.innerText||'').includes('66001')")
            rec("Ödüller görünümü kazanan takımı gösteriyor (66001)", bool(shows_team))
            rec("Seyirci ekranında JS hatası yok (ödüller)", len(aud_err) == 0, "; ".join(aud_err[:2]))

            # --- 3. TÖREN YAYINI (seyirci canlı güncelleme) ---
            cvc = await screen_view("ceremony")
            rec("Operatör seyirci ekranını 'Tören' görünümüne aldı (per-screen)", cvc.ok, f"HTTP {cvc.status}")
            await asyncio.sleep(1.5)
            panel_vis = await poll(lambda: aud.evaluate("() => { const c=document.getElementById('audience_ceremony_view'); return !!c && c.offsetParent!==null; }"), timeout=6)
            rec("Seyirci 'Tören' paneli görünür", bool(panel_vis))

            async def cer_award_title():
                return await aud.evaluate("() => { const el=document.querySelector('#ceremony-award-name .award-title'); return el?el.textContent.trim():''; }")
            async def cer_winner_visible_num():
                return await aud.evaluate("""() => {
                    const w=document.getElementById('ceremony-winner');
                    if(!w || w.classList.contains('hidden')) return '';
                    const n=w.querySelector('.winner-team-number'); return n?n.textContent.trim():'';
                }""")
            async def cer_idle_visible():
                return await aud.evaluate("() => { const i=document.getElementById('ceremony-idle'); return i && !i.classList.contains('hidden'); }")

            # start → ilk ödül (showing_award)
            sr = await api.request.post(f"{BASE}/api/ceremony/start")
            srd = await sr.json()
            rec("Tören başlatıldı (is_active, showing_award)", sr.ok and srd.get("is_active") and srd.get("current_step") == "showing_award", f"award={srd.get('current_award',{}).get('award_name')}")
            t1 = await poll(lambda: cer_award_title(), timeout=8)
            rec("Seyirci tören ekranı 1. ödül adını CANLI gösterdi (WS)", t1 == AWARDS[0]["name"], f"ekranda='{t1}'")

            # next → showing_note
            await api.request.post(f"{BASE}/api/ceremony/next"); await asyncio.sleep(1.0)
            note_shown = await poll(lambda: aud.evaluate("() => { const j=document.getElementById('ceremony-jury-note'); return (j && !j.classList.contains('hidden')) ? (j.querySelector('.jury-note-text')?.textContent||'').trim() : ''; }"), timeout=6)
            rec("Tören 'jüri notu' adımı seyircide göründü", bool(note_shown), f"not='{note_shown}'")

            # next → showing_winner
            await api.request.post(f"{BASE}/api/ceremony/next")
            wnum = await poll(lambda: cer_winner_visible_num(), timeout=8)
            rec("Tören 'kazanan' adımı seyircide göründü (66001)", wnum == "66001", f"ekranda kazanan='{wnum}'")

            # next → 2. ödüle geç (showing_award)
            await api.request.post(f"{BASE}/api/ceremony/next")
            async def is_award2():
                return (await cer_award_title()) == AWARDS[1]["name"]
            await poll(is_award2, timeout=8)
            t2 = await cer_award_title()
            # 2. ödüle geçtiğini doğrula (başlık 2. ödül VE kazanan tekrar gizli)
            win_hidden_again = await aud.evaluate("() => { const w=document.getElementById('ceremony-winner'); return !w || w.classList.contains('hidden'); }")
            rec("Tören sonraki ödüle geçti (2. ödül adı + kazanan gizlendi)", t2 == AWARDS[1]["name"] and win_hidden_again, f"ekranda='{t2}', kazanan_gizli={win_hidden_again}")

            # stop → idle
            await api.request.post(f"{BASE}/api/ceremony/stop")
            idle = await poll(lambda: cer_idle_visible(), timeout=8)
            rec("Tören durduruldu → seyirci ekranı 'idle' gösterdi", bool(idle))

            # public ceremony state idle/inactive
            cs = await (await api.request.get(f"{BASE}/api/public/ceremony")).json()
            rec("Public tören durumu pasif (is_active=false)", not cs.get("is_active"), f"state={cs.get('current_step')}")
            rec("Seyirci ekranında JS hatası yok (tören)", len(aud_err) == 0, "; ".join(aud_err[:2]))

            # --- 4. GLOBAL "Aktif Ekran" artık tüm (bireysel sabitlenmemiş) ekranları değiştirir ---
            big2 = await browser.new_context(viewport={"width": 1600, "height": 900})
            bl2 = await big2.new_page(); await login(bl2); await bl2.close()
            aud2 = await big2.new_page()
            await aud2.goto(f"{BASE}/audience"); await aud2.wait_for_load_state("load")
            await asyncio.sleep(2.5)  # taze ekran → follow_global=True (varsayılan)
            fg = await aud2.evaluate("() => !!(window.AudienceCore && window.AudienceCore.followGlobal)")
            rec("Yeni seyirci ekranı global'i takip ediyor (follow_global=True)", bool(fg))
            await api.request.post(f"{BASE}/api/screens/settings", data=json.dumps({"active_view": "rankings"}), headers={"Content-Type": "application/json"})
            switched = await poll(lambda: aud2.evaluate("() => (window.AudienceCore && window.AudienceCore.currentView) === 'rankings'"), timeout=8)
            rec("Global 'Aktif Ekran' yeni ekranı CANLI değiştirdi (rankings)", bool(switched))

        except Exception as e:
            import traceback; traceback.print_exc()
            rec("Beklenmeyen hata", False, str(e)[:140])
        finally:
            # --- TEMİZLİK ---
            try:
                await api.request.post(f"{BASE}/api/ceremony/stop")
                for wid in winner_ids:
                    await api.request.delete(f"{BASE}/api/award-winners/{wid}")
                await api.request.post(f"{BASE}/api/awards", data=json.dumps([]), headers={"Content-Type": "application/json"})
                # Önceki aktif etkinliği id ile geri yükle (etkinlik adına bağlı kalma — yeniden adlandırmaya dayanıklı)
                if prev_active and prev_active != created_event_id:
                    await api.request.post(f"{BASE}/api/events/active", data=json.dumps({"id": prev_active}), headers={"Content-Type": "application/json"})
                restored = ((await (await api.request.get(f"{BASE}/api/event")).json()) or {}).get("id")
                if created_event_id:
                    dr = await api.request.delete(f"{BASE}/api/events/{created_event_id}")
                    ok = dr.ok and (prev_active is None or restored == prev_active)
                    rec("Temizlik: kazananlar/ödüller silindi, test etkinliği silindi, gerçek etkinlik aktif", ok, f"delete HTTP {dr.status}, aktif={restored}")
            except Exception as e:
                rec("Temizlik", False, str(e)[:80])
        await browser.close()

    print("\n" + "="*60)
    verdict = "✅ ÖDÜL + TÖREN YAYINI HAZIR" if not R["fail"] else f"❌ {len(R['fail'])} SORUN"
    print(f"SONUC: {len(R['pass'])} PASS / {len(R['fail'])} FAIL / {len(R['warn'])} WARN")
    print(verdict); print("="*60)
    return 0 if not R["fail"] else 1

if __name__ == "__main__":
    import sys; sys.exit(asyncio.run(main()))
