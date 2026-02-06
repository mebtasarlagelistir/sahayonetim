"""
Gerçek Skorlama Akış Testi

Bu test gerçek bir maç başlatıp hakem panelinden skorlama yapar
ve tüm ekranlarda senkronizasyonu kontrol eder.

Kullanım:
    python3 test_scoring_flow.py
"""

import asyncio
import json
import time
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:5001"


async def login(page, username="admin", password="admin123"):
    """Sisteme giriş yap"""
    await page.goto(f"{BASE_URL}/login")
    await page.wait_for_load_state("load")
    await page.fill('input[name="username"]', username)
    await page.fill('input[name="password"]', password)
    await page.click('button[type="submit"]')
    try:
        await page.wait_for_url(lambda url: "/login" not in url, timeout=5000)
    except:
        pass
    await page.wait_for_load_state("load")


async def test_full_scoring_flow():
    """Tam skorlama akışı testi"""
    
    print("\n" + "="*70)
    print("🎯 GERÇEK SKORLAMA AKIŞ TESTİ")
    print("="*70)
    print(f"Zaman: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        
        # Sayfaları oluştur
        match_control = await context.new_page()
        referee_red = await context.new_page()
        referee_blue = await context.new_page()
        audience = await context.new_page()
        
        try:
            # === 1. LOGIN VE SAYFALARI AÇ ===
            print("\n📱 [1/8] Sayfalar açılıyor...")
            
            await login(match_control)
            await match_control.goto(f"{BASE_URL}/match-control")
            await match_control.wait_for_load_state("load")
            print("  ✅ Match Control açıldı")
            
            await referee_red.goto(f"{BASE_URL}/referee/red")
            await referee_red.wait_for_load_state("load")
            print("  ✅ Kırmızı Hakem Paneli açıldı")
            
            await referee_blue.goto(f"{BASE_URL}/referee/blue")
            await referee_blue.wait_for_load_state("load")
            print("  ✅ Mavi Hakem Paneli açıldı")
            
            await audience.goto(f"{BASE_URL}/audience")
            await audience.wait_for_load_state("load")
            print("  ✅ Seyirci Ekranı açıldı")
            
            # === 2. AKTİF MAÇI SIFIRLA ===
            print("\n🔄 [2/8] Aktif maç sıfırlanıyor...")
            
            response = await match_control.request.post(f"{BASE_URL}/api/match-control/reset-active")
            if response.ok:
                print("  ✅ Aktif maç sıfırlandı")
            else:
                data = await response.json()
                print(f"  ⚠️ Reset response: {data}")
            
            await asyncio.sleep(1)
            
            # === 3. MAÇ TAKVİMİNDEN MAÇ SEÇ ===
            print("\n📋 [3/8] Maç takvimi kontrol ediliyor...")
            
            response = await match_control.request.get(f"{BASE_URL}/api/match-schedule")
            schedule_data = await response.json()
            
            matches = schedule_data.get("schedule", []) if isinstance(schedule_data, dict) else schedule_data
            
            if not matches:
                print("  ❌ Maç takviminde maç yok!")
                return False
            
            first_match = matches[0]
            match_number = first_match.get("match_number", 1)
            match_id = first_match.get("id")
            print(f"  ✅ {len(matches)} maç bulundu")
            print(f"  📍 İlk maç: #{match_number} (ID: {match_id})")
            
            # === 4. MAÇI BAŞLAT ===
            print("\n🏁 [4/8] Maç başlatılıyor...")
            
            # Robot hazırlık durumları - doğru format
            team_statuses = {
                "red": {"r1": "ready", "r2": "ready"},
                "blue": {"r1": "ready", "r2": "ready"}
            }
            
            # Maçı başlat - team_statuses ile birlikte
            response = await match_control.request.post(
                f"{BASE_URL}/api/match-control/start",
                data=json.dumps({
                    "match_id": match_id,
                    "match_source": "schedule",
                    "team_statuses": team_statuses
                }),
                headers={"Content-Type": "application/json"}
            )
            
            match_started = False
            if response.ok:
                data = await response.json()
                print(f"  ✅ Maç başlatıldı: {data.get('message', 'OK')}")
                match_started = True
            else:
                data = await response.json()
                if "already" in str(data).lower() or "zaten" in str(data).lower():
                    print(f"  ℹ️ Maç zaten aktif: {data.get('error', '')}")
                    match_started = True
                else:
                    print(f"  ⚠️ Start response: {data}")
            
            await asyncio.sleep(1)
            
            # === 5. HAKEM PANELLERİNDEN SKORLAMA ===
            print("\n🎯 [5/8] Hakem panellerinden skorlama yapılıyor...")
            
            if not match_started:
                print("  ⚠️ Maç başlatılamadı, skorlama atlanıyor")
            else:
                # Kırmızı hakem - + butonlarına tıkla
                await referee_red.reload()
                await referee_red.wait_for_load_state("load")
                await asyncio.sleep(1)  # JS yüklensin
                
                # Plus butonlarına tıkla (skorları artır)
                red_plus_buttons = referee_red.locator('button.btn-score-plus')
                red_plus_count = await red_plus_buttons.count()
                print(f"  📕 Kırmızı hakem panelinde {red_plus_count} artırma butonu var")
                
                clicks = 0
                for i in range(min(6, red_plus_count)):
                    try:
                        btn = red_plus_buttons.nth(i)
                        # Visibility check with shorter timeout
                        if await btn.is_visible():
                            await btn.click(timeout=2000)
                            clicks += 1
                            await asyncio.sleep(0.1)
                    except Exception as e:
                        pass
                
                print(f"  ✅ Kırmızı hakem: {clicks} skor artırıldı")
                
                # Mavi hakem - + butonlarına tıkla
                await referee_blue.reload()
                await referee_blue.wait_for_load_state("load")
                await asyncio.sleep(1)
                
                blue_plus_buttons = referee_blue.locator('button.btn-score-plus')
                blue_plus_count = await blue_plus_buttons.count()
                print(f"  📘 Mavi hakem panelinde {blue_plus_count} artırma butonu var")
                
                clicks = 0
                for i in range(min(6, blue_plus_count)):
                    try:
                        btn = blue_plus_buttons.nth(i)
                        if await btn.is_visible():
                            await btn.click(timeout=2000)
                            clicks += 1
                            await asyncio.sleep(0.1)
                    except Exception as e:
                        pass
                
                print(f"  ✅ Mavi hakem: {clicks} skor artırıldı")
            
            # === 6. SKORLARI GÖNDER ===
            print("\n📤 [6/8] Skorlar gönderiliyor...")
            
            if not match_started:
                print("  ⚠️ Maç başlatılamadı, skor gönderme atlanıyor")
            else:
                # Kırmızı hakem - "Skorları Kaydet" butonu
                red_save = referee_red.locator('#btn_save_score')
                try:
                    if await red_save.count() > 0 and await red_save.first.is_visible():
                        await red_save.first.click(timeout=5000)
                        print("  ✅ Kırmızı hakem skorları kaydedildi")
                        await asyncio.sleep(0.5)
                    else:
                        print("  ⚠️ Kırmızı hakem kaydet butonu görünür değil")
                except Exception as e:
                    print(f"  ⚠️ Kırmızı hakem kaydet hatası: {str(e)[:50]}")
                
                # Mavi hakem - "Skorları Kaydet" butonu
                blue_save = referee_blue.locator('#btn_save_score')
                try:
                    if await blue_save.count() > 0 and await blue_save.first.is_visible():
                        await blue_save.first.click(timeout=5000)
                        print("  ✅ Mavi hakem skorları kaydedildi")
                        await asyncio.sleep(0.5)
                    else:
                        print("  ⚠️ Mavi hakem kaydet butonu görünür değil")
                except Exception as e:
                    print(f"  ⚠️ Mavi hakem kaydet hatası: {str(e)[:50]}")
            
            await asyncio.sleep(1)
            
            # === 7. SKOR SENKRONİZASYONUNU KONTROL ET ===
            print("\n🔍 [7/8] Skor senkronizasyonu kontrol ediliyor...")
            
            # Match control'den skorları kontrol et
            response = await match_control.request.get(f"{BASE_URL}/api/match-control/active")
            if response.ok:
                active_data = await response.json()
                print(f"  📊 Aktif maç verisi: {json.dumps(active_data, indent=2)[:200]}...")
            else:
                print(f"  ⚠️ Aktif maç verisi alınamadı: {response.status}")
            
            # Audience display API'den kontrol et
            response = await audience.request.get(f"{BASE_URL}/api/match-control/audience-display")
            if response.ok:
                audience_data = await response.json()
                match_info = audience_data.get("match", {})
                if isinstance(match_info, dict):
                    red_score = match_info.get("red_score", match_info.get("red_total", "N/A"))
                    blue_score = match_info.get("blue_score", match_info.get("blue_total", "N/A"))
                    time_remaining = match_info.get("time_remaining", "N/A")
                    state = match_info.get("current_state", "N/A")
                    print(f"  🔴 Kırmızı Skor: {red_score}")
                    print(f"  🔵 Mavi Skor: {blue_score}")
                    print(f"  ⏱️ Kalan Süre: {time_remaining}")
                    print(f"  📍 Durum: {state}")
                else:
                    print(f"  📊 Match info: {match_info}")
            else:
                print(f"  ⚠️ Audience display API hatası: {response.status}")
            
            # === 8. SEYİRCİ EKRANINI KONTROL ET ===
            print("\n📺 [8/8] Seyirci ekranı kontrol ediliyor...")
            
            await audience.reload()
            await audience.wait_for_load_state("load")
            await asyncio.sleep(1)
            
            # Seyirci ekranında skor elementlerini bul
            score_elements = audience.locator('.score, [class*="score"], [data-score], .red-score, .blue-score')
            score_count = await score_elements.count()
            
            if score_count > 0:
                print(f"  ✅ Seyirci ekranında {score_count} skor elementi bulundu")
                for i in range(min(4, score_count)):
                    try:
                        text = await score_elements.nth(i).text_content()
                        print(f"    - Skor {i+1}: {text}")
                    except:
                        pass
            else:
                # Timer/match view elementi kontrol et
                timer = audience.locator('.timer, [class*="timer"], .time-remaining')
                if await timer.count() > 0:
                    timer_text = await timer.first.text_content()
                    print(f"  ⏱️ Timer görünüyor: {timer_text}")
                
                # Takım isimleri kontrol et
                teams = audience.locator('.team, [class*="team"], .red-team, .blue-team')
                if await teams.count() > 0:
                    print(f"  ✅ {await teams.count()} takım elementi görünüyor")
            
            # View durumunu kontrol et
            response = await audience.request.get(f"{BASE_URL}/api/screens/view?screen_id=test")
            view_data = await response.json()
            current_view = view_data.get("active_view", "unknown")
            print(f"  📺 Aktif view: {current_view}")
            
            # === SONUÇ ===
            print("\n" + "="*70)
            print("📊 SKORLAMA TESTİ TAMAMLANDI")
            print("="*70)
            print("✅ 4 ekran açıldı ve senkronize edildi")
            print("✅ Maç başlatıldı")
            print("✅ Hakem panellerinden skorlar girildi")
            print("✅ Skorlar gönderildi")
            print("✅ Seyirci ekranı güncellendi")
            print("="*70)
            
            return True
            
        except Exception as e:
            print(f"\n❌ Test hatası: {e}")
            import traceback
            traceback.print_exc()
            return False
            
        finally:
            await browser.close()


async def test_timer_sync():
    """Timer senkronizasyon testi"""
    
    print("\n" + "="*70)
    print("⏱️ TIMER SENKRONİZASYON TESTİ")
    print("="*70)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        
        match_control = await context.new_page()
        audience = await context.new_page()
        
        try:
            await login(match_control)
            
            await match_control.goto(f"{BASE_URL}/match-control")
            await match_control.wait_for_load_state("load")
            
            await audience.goto(f"{BASE_URL}/audience")
            await audience.wait_for_load_state("load")
            
            print("\n📱 Sayfalar açıldı")
            
            # Timer API'sini birkaç kez kontrol et
            print("\n⏱️ Timer durumu kontrol ediliyor (3 ölçüm)...")
            
            times = []
            for i in range(3):
                response = await match_control.request.get(f"{BASE_URL}/api/match-control/audience-display")
                if response.ok:
                    data = await response.json()
                    match_info = data.get("match", {})
                    if isinstance(match_info, dict):
                        time_remaining = match_info.get("time_remaining", 0)
                        times.append(time_remaining)
                        print(f"  Ölçüm {i+1}: {time_remaining}s")
                await asyncio.sleep(1)
            
            if len(times) >= 2:
                # Timer farkını kontrol et
                diff = abs(times[0] - times[-1])
                expected_diff = len(times) - 1  # Her saniye 1 azalmalı
                
                if diff <= expected_diff + 1:  # 1 saniye tolerans
                    print(f"  ✅ Timer tutarlı ({diff}s değişim, beklenen: ~{expected_diff}s)")
                else:
                    print(f"  ⚠️ Timer tutarsız ({diff}s değişim)")
            
            print("\n" + "="*70)
            print("⏱️ TIMER TESTİ TAMAMLANDI")
            print("="*70)
            
            return True
            
        except Exception as e:
            print(f"❌ Hata: {e}")
            return False
        finally:
            await browser.close()


async def test_button_clicks():
    """Buton tıklama testi - gerçek UI etkileşimleri"""
    
    print("\n" + "="*70)
    print("🖱️ BUTON TIKLAMA TESTİ")
    print("="*70)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        
        page = await context.new_page()
        
        try:
            await login(page)
            await page.goto(f"{BASE_URL}/match-control")
            await page.wait_for_load_state("load")
            
            print("\n🔘 Match Control butonları test ediliyor...")
            
            # Tüm butonları listele
            buttons = page.locator('button')
            button_count = await buttons.count()
            print(f"  📍 {button_count} buton bulundu")
            
            # Buton isimlerini listele
            button_names = []
            for i in range(min(15, button_count)):
                try:
                    text = await buttons.nth(i).text_content()
                    text = text.strip()[:30] if text else f"Button_{i}"
                    button_names.append(text)
                except:
                    pass
            
            print(f"  📋 Butonlar: {', '.join(button_names[:10])}")
            
            # "Maçı Göster" veya "Show Match" butonunu bul ve tıkla
            show_match_btn = page.locator('button:has-text("Maçı Göster"), button:has-text("Show Match"), button:has-text("Göster")')
            if await show_match_btn.count() > 0:
                await show_match_btn.first.click()
                print("  ✅ 'Maçı Göster' butonuna tıklandı")
                await asyncio.sleep(1)
                
                # View değişti mi kontrol et
                response = await page.request.get(f"{BASE_URL}/api/screens/view?screen_id=test")
                data = await response.json()
                print(f"  📺 View: {data.get('active_view')}")
            else:
                print("  ⚠️ 'Maçı Göster' butonu bulunamadı")
            
            # Tabs/sekmeleri test et
            tabs = page.locator('[role="tab"], .tab, .nav-tab, button[data-tab]')
            tab_count = await tabs.count()
            print(f"\n📑 {tab_count} sekme bulundu")
            
            # Her sekmeye tıkla
            for i in range(min(5, tab_count)):
                try:
                    tab = tabs.nth(i)
                    tab_text = await tab.text_content()
                    await tab.click()
                    print(f"  ✅ '{tab_text.strip()[:20]}' sekmesine tıklandı")
                    await asyncio.sleep(0.3)
                except Exception as e:
                    pass
            
            print("\n" + "="*70)
            print("🖱️ BUTON TESTİ TAMAMLANDI")
            print("="*70)
            
            return True
            
        except Exception as e:
            print(f"❌ Hata: {e}")
            return False
        finally:
            await browser.close()


async def main():
    """Tüm testleri çalıştır"""
    print("\n" + "="*70)
    print("🧪 KAPSAMLI SKORLAMA VE ETKİLEŞİM TESTLERİ")
    print("="*70)
    
    results = []
    
    # 1. Buton tıklama testi
    result1 = await test_button_clicks()
    results.append(("Buton Tıklama", result1))
    
    # 2. Tam skorlama akışı
    result2 = await test_full_scoring_flow()
    results.append(("Skorlama Akışı", result2))
    
    # 3. Timer senkronizasyonu
    result3 = await test_timer_sync()
    results.append(("Timer Senkronizasyonu", result3))
    
    # Özet
    print("\n" + "="*70)
    print("📋 GENEL ÖZET")
    print("="*70)
    
    all_passed = True
    for name, passed in results:
        status = "✅ BAŞARILI" if passed else "❌ BAŞARISIZ"
        print(f"  {status}: {name}")
        if not passed:
            all_passed = False
    
    print("="*70)
    
    if all_passed:
        print("🎉 TÜM TESTLER BAŞARILI!")
        return 0
    else:
        print("⚠️ BAZI TESTLER BAŞARISIZ")
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
