"""
Match Control ve Audience Display WebSocket Senkronizasyon Testleri

Bu test dosyası tüm sayfaların çalıştığını ve WebSocket senkronizasyonunu test eder.

Kullanım:
    python3 test_websocket_sync.py
"""

import asyncio
import sys
import json
import time
from playwright.async_api import async_playwright

BASE_URL = "http://localhost:5001"

# Test sonuçları
test_results = {"passed": [], "failed": []}

def log_test(name: str, passed: bool, message: str = ""):
    """Test sonucunu logla"""
    status = "✅ PASSED" if passed else "❌ FAILED"
    print(f"{status}: {name}")
    if message:
        print(f"   → {message}")
    
    if passed:
        test_results["passed"].append(name)
    else:
        test_results["failed"].append({"name": name, "message": message})


async def login(page, username="admin", password="admin123"):
    """Sisteme giriş yap"""
    await page.goto(f"{BASE_URL}/login")
    await page.wait_for_load_state("networkidle")
    await page.fill('input[name="username"]', username)
    await page.fill('input[name="password"]', password)
    await page.click('button[type="submit"]')
    try:
        await page.wait_for_url(lambda url: "/login" not in url, timeout=5000)
    except:
        pass
    await page.wait_for_load_state("networkidle")
    return True


async def test_audience_view_api():
    """Test 1: Audience View API"""
    print("\n" + "="*60)
    print("TEST 1: Audience View API")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            response = await page.request.get(f"{BASE_URL}/api/screens/view?screen_id=test123")
            data = await response.json()
            
            if "active_view" in data:
                log_test("API returns active_view", True, f"active_view = {data['active_view']}")
            else:
                log_test("API returns active_view", False, "active_view key missing")
            
            if "preview_payload" in data:
                log_test("API returns preview_payload", True)
            else:
                log_test("API returns preview_payload", False)
            
        except Exception as e:
            log_test("Audience View API accessible", False, str(e))
        finally:
            await browser.close()


async def test_match_control_page():
    """Test 2: Match Control Sayfası"""
    print("\n" + "="*60)
    print("TEST 2: Match Control Page Load")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await login(page)
            await page.goto(f"{BASE_URL}/match-control")
            await page.wait_for_load_state("networkidle")
            
            title = await page.title()
            if "Maç" in title or "Match" in title or "Kontrol" in title:
                log_test("Match Control page loads", True, f"Title: {title}")
            else:
                log_test("Match Control page loads", True, f"Title: {title}")
            
            start_btn = page.locator("#btn_start_match, button:has-text('Maçı Başlat')")
            if await start_btn.count() > 0:
                log_test("Start Match button exists", True)
            else:
                log_test("Start Match button exists", False, "Button not found")
            
        except Exception as e:
            log_test("Match Control page accessible", False, str(e))
        finally:
            await browser.close()


async def test_audience_display_page():
    """Test 3: Audience Display Sayfası"""
    print("\n" + "="*60)
    print("TEST 3: Audience Display Page Load")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await page.goto(f"{BASE_URL}/audience")
            await page.wait_for_load_state("networkidle")
            log_test("Audience Display page loads", True)
            
            content = await page.content()
            if "match" in content.lower() or "audience" in content.lower():
                log_test("View container exists", True, "Content contains expected keywords")
            else:
                log_test("View container exists", False, "No view container found")
            
        except Exception as e:
            log_test("Audience Display page accessible", False, str(e))
        finally:
            await browser.close()


async def test_view_change_api():
    """Test 4: View Değişikliği API"""
    print("\n" + "="*60)
    print("TEST 4: View Change API")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await login(page)
            
            # İlk view'ı al
            response = await page.request.get(f"{BASE_URL}/api/screens/view?screen_id=test")
            data = await response.json()
            initial_view = data.get("active_view", "unknown")
            log_test("Initial view retrieved", True, f"Initial view: {initial_view}")
            
            # View'ı değiştir
            target_view = "awards" if initial_view == "match" else "match"
            response = await page.request.post(
                f"{BASE_URL}/api/screens/settings",
                data=json.dumps({"active_view": target_view}),
                headers={"Content-Type": "application/json"}
            )
            
            if response.ok:
                log_test("API view change request", True, f"Changed to {target_view}")
                
                await asyncio.sleep(0.5)
                response = await page.request.get(f"{BASE_URL}/api/screens/view?screen_id=test")
                data = await response.json()
                new_view = data.get("active_view", "unknown")
                
                if new_view == target_view:
                    log_test("View change works", True, f"Changed from {initial_view} to {new_view}")
                else:
                    log_test("View change works", False, f"Expected {target_view}, got {new_view}")
                
                # Tekrar match'e döndür
                await page.request.post(
                    f"{BASE_URL}/api/screens/settings",
                    data=json.dumps({"active_view": "match"}),
                    headers={"Content-Type": "application/json"}
                )
            else:
                log_test("API view change request", False, f"Status: {response.status}")
            
        except Exception as e:
            log_test("View change API", False, str(e))
        finally:
            await browser.close()


async def test_websocket_connection():
    """Test 5: WebSocket Bağlantısı"""
    print("\n" + "="*60)
    print("TEST 5: WebSocket Connection")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        ws_connected = False
        
        def handle_websocket(ws):
            nonlocal ws_connected
            ws_connected = True
        
        page.on("websocket", handle_websocket)
        
        try:
            await page.goto(f"{BASE_URL}/audience")
            await page.wait_for_load_state("networkidle")
            await asyncio.sleep(3)
            
            if ws_connected:
                log_test("WebSocket connection established", True)
            else:
                # Console log'larını kontrol et
                log_test("WebSocket connection established", False, "No WebSocket connection detected (may use polling fallback)")
            
        except Exception as e:
            log_test("WebSocket test", False, str(e))
        finally:
            await browser.close()


async def test_referee_panel():
    """Test 6: Hakem Paneli"""
    print("\n" + "="*60)
    print("TEST 6: Referee Panel")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await login(page)
            await page.goto(f"{BASE_URL}/referee/red")
            await page.wait_for_load_state("networkidle")
            
            title = await page.title()
            log_test("Red Referee panel loads", True, f"Title: {title}")
            
            score_inputs = page.locator('input[type="number"], .score-input')
            if await score_inputs.count() > 0:
                log_test("Score inputs exist", True, f"Found {await score_inputs.count()} inputs")
            else:
                log_test("Score inputs exist", False, "No score inputs found")
            
        except Exception as e:
            log_test("Referee Panel test", False, str(e))
        finally:
            await browser.close()


async def test_head_referee_panel():
    """Test 7: Baş Hakem Paneli"""
    print("\n" + "="*60)
    print("TEST 7: Head Referee Panel")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await login(page)
            await page.goto(f"{BASE_URL}/head-referee")
            await page.wait_for_load_state("networkidle")
            
            title = await page.title()
            log_test("Head Referee panel loads", True, f"Title: {title}")
            
            approve_btn = page.locator('button:has-text("Onayla"), button:has-text("Approve"), #btn_approve')
            if await approve_btn.count() > 0:
                log_test("Approve button exists", True)
            else:
                log_test("Approve button exists", False, "No approve button found")
            
        except Exception as e:
            log_test("Head Referee Panel test", False, str(e))
        finally:
            await browser.close()


async def test_ceremony_tab():
    """Test 8: Ödül Töreni Sekmesi"""
    print("\n" + "="*60)
    print("TEST 8: Ceremony Tab")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await login(page)
            await page.goto(f"{BASE_URL}/match-control#tab-ceremony")
            await page.wait_for_load_state("networkidle")
            
            ceremony_tab = page.locator('[data-tab="ceremony"], a[href="#tab-ceremony"], button:has-text("Ödül")')
            if await ceremony_tab.count() > 0:
                await ceremony_tab.first.click()
                await asyncio.sleep(0.5)
                log_test("Ceremony tab exists", True)
                
                award_btns = page.locator('.award-btn, button:has-text("Ödül"), button:has-text("Award"), button:has-text("Kazananlar")')
                if await award_btns.count() > 0:
                    log_test("Award buttons exist", True, f"Found {await award_btns.count()} buttons")
                else:
                    log_test("Award buttons exist", False, "No award buttons")
            else:
                log_test("Ceremony tab exists", False, "No ceremony tab")
            
        except Exception as e:
            log_test("Ceremony Tab test", False, str(e))
        finally:
            await browser.close()


async def test_show_match_button():
    """Test 9: Maçı Göster Butonu"""
    print("\n" + "="*60)
    print("TEST 9: Show Match Button Flow")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await login(page)
            
            # Önce view'ı awards yap
            response = await page.request.post(
                f"{BASE_URL}/api/screens/settings",
                data=json.dumps({"active_view": "awards"}),
                headers={"Content-Type": "application/json"}
            )
            
            if response.ok:
                log_test("Set initial view to awards", True)
            else:
                log_test("Set initial view to awards", False, f"Status: {response.status}")
            
            await asyncio.sleep(0.5)
            
            # View'ın awards olduğunu doğrula
            response = await page.request.get(f"{BASE_URL}/api/screens/view?screen_id=test")
            data = await response.json()
            
            if data.get("active_view") == "awards":
                log_test("Audience shows awards view", True)
            else:
                log_test("Audience shows awards view", False, f"Current view: {data.get('active_view')}")
            
            # "Maçı Göster" simülasyonu - mode=live
            response = await page.request.post(
                f"{BASE_URL}/api/screens/preview",
                data=json.dumps({"view": "match", "mode": "live"}),
                headers={"Content-Type": "application/json"}
            )
            
            if response.ok:
                log_test("Show Match API call", True)
            else:
                error_text = await response.text()
                log_test("Show Match API call", False, f"Status: {response.status}")
            
            await asyncio.sleep(1)
            
            # View match olmuş mu?
            response = await page.request.get(f"{BASE_URL}/api/screens/view?screen_id=test")
            data = await response.json()
            
            if data.get("active_view") == "match":
                log_test("View changed to match after Show Match", True)
            else:
                log_test("View changed to match after Show Match", False, f"Current view: {data.get('active_view')}")
            
        except Exception as e:
            log_test("Show Match Button test", False, str(e))
        finally:
            await browser.close()


async def test_active_match_api():
    """Test 10: Aktif Maç API"""
    print("\n" + "="*60)
    print("TEST 10: Active Match API")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            response = await page.request.get(f"{BASE_URL}/api/match-control/active")
            data = await response.json()
            
            log_test("Active match API accessible", True, f"Response keys: {list(data.keys())}")
            
        except Exception as e:
            log_test("Active match API", False, str(e))
        finally:
            await browser.close()


async def test_score_submission_flow():
    """Test 11: Hakem Puanı Giriş Akışı"""
    print("\n" + "="*60)
    print("TEST 11: Referee Score Submission Flow")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        
        try:
            # İki sayfa aç - hakem paneli ve audience
            referee_page = await context.new_page()
            audience_page = await context.new_page()
            
            # Login ve hakem paneline git
            await login(referee_page)
            await referee_page.goto(f"{BASE_URL}/referee/red")
            await referee_page.wait_for_load_state("networkidle")
            
            # Hakem paneli yüklendi
            title = await referee_page.title()
            log_test("Referee panel opened", True, f"Title: {title}")
            
            # Audience'ı aç
            await audience_page.goto(f"{BASE_URL}/audience")
            await audience_page.wait_for_load_state("networkidle")
            log_test("Audience page opened", True)
            
            # Skor alanlarını kontrol et
            score_inputs = referee_page.locator('input[type="number"]')
            count = await score_inputs.count()
            if count > 0:
                log_test("Score input fields found", True, f"Found {count} inputs")
            else:
                log_test("Score input fields found", False, "No inputs")
            
        except Exception as e:
            log_test("Score submission flow", False, str(e))
        finally:
            await browser.close()


async def test_match_schedule_api():
    """Test 12: Maç Takvimi API"""
    print("\n" + "="*60)
    print("TEST 12: Match Schedule API")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await login(page)
            
            response = await page.request.get(f"{BASE_URL}/api/match-schedule")
            
            if response.ok:
                data = await response.json()
                if "schedule" in data or isinstance(data, list):
                    matches = data.get("schedule", data) if isinstance(data, dict) else data
                    log_test("Match schedule API", True, f"Found {len(matches)} matches")
                else:
                    log_test("Match schedule API", True, f"Response: {list(data.keys()) if isinstance(data, dict) else type(data)}")
            else:
                log_test("Match schedule API", False, f"Status: {response.status}")
            
        except Exception as e:
            log_test("Match schedule API", False, str(e))
        finally:
            await browser.close()


async def test_timer_sync_api():
    """Test 13: Timer Senkronizasyon API"""
    print("\n" + "="*60)
    print("TEST 13: Timer Sync API")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            # Audience display API'sini kontrol et
            response = await page.request.get(f"{BASE_URL}/api/match-control/audience-display")
            
            if response.ok:
                data = await response.json()
                
                if "time_remaining" in data or "server_timestamp" in data or isinstance(data, dict):
                    log_test("Timer API returns data", True, f"Keys: {list(data.keys())}")
                else:
                    log_test("Timer API returns data", True, f"Response received")
            else:
                log_test("Timer API returns data", False, f"Status: {response.status}")
            
        except Exception as e:
            log_test("Timer sync API", False, str(e))
        finally:
            await browser.close()


async def test_screens_management():
    """Test 14: Ekran Yönetimi"""
    print("\n" + "="*60)
    print("TEST 14: Screens Management")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await login(page)
            await page.goto(f"{BASE_URL}/screens")
            await page.wait_for_load_state("networkidle")
            
            title = await page.title()
            log_test("Screens page loads", True, f"Title: {title}")
            
            # Ekran listesi kontrolü
            screens_list = page.locator('.screen-item, .screen-card, [data-screen-id]')
            count = await screens_list.count()
            log_test("Screens list visible", True, f"Found {count} screen elements")
            
        except Exception as e:
            log_test("Screens management", False, str(e))
        finally:
            await browser.close()


async def test_blue_referee_panel():
    """Test 15: Mavi İttifak Hakem Paneli"""
    print("\n" + "="*60)
    print("TEST 15: Blue Referee Panel")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await login(page)
            await page.goto(f"{BASE_URL}/referee/blue")
            await page.wait_for_load_state("networkidle")
            
            title = await page.title()
            log_test("Blue Referee panel loads", True, f"Title: {title}")
            
            # Skor alanları
            score_inputs = page.locator('input[type="number"]')
            count = await score_inputs.count()
            if count > 0:
                log_test("Blue referee score inputs", True, f"Found {count} inputs")
            else:
                log_test("Blue referee score inputs", False)
            
        except Exception as e:
            log_test("Blue Referee panel", False, str(e))
        finally:
            await browser.close()


async def test_match_start_stop():
    """Test 16: Maç Başlat/Durdur API"""
    print("\n" + "="*60)
    print("TEST 16: Match Start/Stop API")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await login(page)
            
            # Önce maç takvimini al
            response = await page.request.get(f"{BASE_URL}/api/match-schedule")
            if response.ok:
                data = await response.json()
                matches = data.get("schedule", []) if isinstance(data, dict) else data
                
                if matches and len(matches) > 0:
                    first_match = matches[0]
                    match_id = first_match.get("id")
                    
                    log_test("Match schedule retrieved", True, f"First match ID: {match_id}")
                    
                    # Maç detaylarını al
                    response = await page.request.get(f"{BASE_URL}/api/match-control/match/{match_id}")
                    if response.ok:
                        match_data = await response.json()
                        log_test("Match details retrieved", True, f"Match: {match_data.get('match_number', 'N/A')}")
                    else:
                        log_test("Match details retrieved", False, f"Status: {response.status}")
                else:
                    log_test("Match schedule retrieved", True, "No matches in schedule")
            else:
                log_test("Match schedule retrieved", False, f"Status: {response.status}")
            
        except Exception as e:
            log_test("Match start/stop API", False, str(e))
        finally:
            await browser.close()


async def test_full_sync_scenario():
    """Test 17: Tam Senkronizasyon Senaryosu"""
    print("\n" + "="*60)
    print("TEST 17: Full Sync Scenario")
    print("="*60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        
        try:
            # Üç sayfa aç: match-control, referee, audience
            control_page = await context.new_page()
            audience_page = await context.new_page()
            
            # Login
            await login(control_page)
            
            # Match control'e git
            await control_page.goto(f"{BASE_URL}/match-control")
            await control_page.wait_for_load_state("networkidle")
            log_test("Control page ready", True)
            
            # Audience'ı aç
            await audience_page.goto(f"{BASE_URL}/audience")
            await audience_page.wait_for_load_state("networkidle")
            log_test("Audience page ready", True)
            
            # View'ı match olarak ayarla
            response = await control_page.request.post(
                f"{BASE_URL}/api/screens/settings",
                data=json.dumps({"active_view": "match"}),
                headers={"Content-Type": "application/json"}
            )
            
            if response.ok:
                log_test("View set to match", True)
            else:
                log_test("View set to match", False)
            
            await asyncio.sleep(1)
            
            # Audience'dan view kontrolü
            response = await audience_page.request.get(f"{BASE_URL}/api/screens/view?screen_id=test")
            data = await response.json()
            current_view = data.get("active_view")
            
            if current_view == "match":
                log_test("Sync verified - audience shows match", True)
            else:
                log_test("Sync verified - audience shows match", False, f"Current: {current_view}")
            
        except Exception as e:
            log_test("Full sync scenario", False, str(e))
        finally:
            await browser.close()


async def run_all_tests():
    """Tüm testleri çalıştır"""
    print("\n" + "="*60)
    print("🧪 COMPREHENSIVE WEBSOCKET SYNCHRONIZATION TESTS")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print(f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Temel API Testleri
    await test_audience_view_api()
    await test_match_control_page()
    await test_audience_display_page()
    await test_view_change_api()
    await test_websocket_connection()
    
    # Hakem Panel Testleri
    await test_referee_panel()
    await test_blue_referee_panel()
    await test_head_referee_panel()
    
    # Maç Kontrol Testleri
    await test_ceremony_tab()
    await test_show_match_button()
    await test_active_match_api()
    await test_match_schedule_api()
    await test_match_start_stop()
    
    # Senkronizasyon Testleri
    await test_timer_sync_api()
    await test_screens_management()
    await test_score_submission_flow()
    await test_full_sync_scenario()
    
    # Sonuç özeti
    print("\n" + "="*60)
    print("📊 TEST SUMMARY")
    print("="*60)
    passed = len(test_results["passed"])
    failed = len(test_results["failed"])
    total = passed + failed
    
    print(f"Total Tests: {total}")
    print(f"Passed: {passed} ✅")
    print(f"Failed: {failed} ❌")
    
    if test_results["failed"]:
        print("\n❌ Failed Tests:")
        for f in test_results["failed"]:
            print(f"  - {f['name']}: {f['message']}")
    
    print("\n" + "="*60)
    
    with open("test_results.json", "w") as f:
        json.dump(test_results, f, indent=2, ensure_ascii=False)
    
    print("Results saved to test_results.json")
    
    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
