"""
Sonuçları Göster Kalıcılık Testi

Bu test "Sonuçları Göster" butonuna tıkladıktan sonra 
skorların geri dönüp dönmediğini kontrol eder.

Kullanım:
    python3 test_results_persistence.py
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


async def test_results_persistence():
    """Sonuçları Göster sonrası skor kalıcılık testi"""
    
    print("\n" + "="*70)
    print("🏆 SONUÇLARI GÖSTER KALICILIK TESTİ")
    print("="*70)
    print(f"Zaman: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        
        match_control = await context.new_page()
        audience = await context.new_page()
        
        try:
            # === 1. LOGIN VE SAYFALARI AÇ ===
            print("\n📱 [1/6] Sayfalar açılıyor...")
            
            await login(match_control)
            await match_control.goto(f"{BASE_URL}/match-control")
            await match_control.wait_for_load_state("load")
            print("  ✅ Match Control açıldı")
            
            await audience.goto(f"{BASE_URL}/audience")
            await audience.wait_for_load_state("load")
            print("  ✅ Audience Display açıldı")
            
            # === 2. AKTİF MAÇ KONTROLÜ ===
            print("\n🔍 [2/6] Aktif maç kontrol ediliyor...")
            
            response = await match_control.request.get(f"{BASE_URL}/api/match-control/active")
            active_data = await response.json()
            
            if active_data.get("match"):
                match_info = active_data["match"]
                print(f"  ✅ Aktif maç bulundu: Maç #{match_info.get('match_number', 'N/A')}")
            else:
                # Maç yok - başlat
                print("  ℹ️ Aktif maç yok, yeni maç başlatılıyor...")
                
                # Reset
                await match_control.request.post(f"{BASE_URL}/api/match-control/reset-active")
                await asyncio.sleep(0.5)
                
                # Maç schedule al
                response = await match_control.request.get(f"{BASE_URL}/api/match-schedule")
                schedule = await response.json()
                matches = schedule.get("schedule", []) if isinstance(schedule, dict) else schedule
                
                if matches:
                    first_match = matches[0]
                    match_id = first_match.get("id")
                    
                    # Maçı başlat
                    team_statuses = {
                        "red": {"r1": "ready", "r2": "ready"},
                        "blue": {"r1": "ready", "r2": "ready"}
                    }
                    
                    response = await match_control.request.post(
                        f"{BASE_URL}/api/match-control/start",
                        data=json.dumps({
                            "match_id": match_id,
                            "match_source": "schedule",
                            "team_statuses": team_statuses
                        }),
                        headers={"Content-Type": "application/json"}
                    )
                    
                    if response.ok:
                        print(f"  ✅ Maç #{first_match.get('match_number')} başlatıldı")
                    else:
                        data = await response.json()
                        print(f"  ⚠️ Maç başlatma: {data}")
                else:
                    print("  ❌ Maç takvimi boş!")
                    return False
            
            await asyncio.sleep(1)
            
            # === 3. SKOR API KONTROLÜ ===
            print("\n📊 [3/6] Mevcut skorlar kontrol ediliyor...")
            
            response = await audience.request.get(f"{BASE_URL}/api/match-control/audience-display")
            data = await response.json()
            
            if data.get("match"):
                initial_red = data["match"].get("red_score", 0)
                initial_blue = data["match"].get("blue_score", 0)
                print(f"  🔴 Kırmızı: {initial_red}")
                print(f"  🔵 Mavi: {initial_blue}")
            else:
                initial_red = 0
                initial_blue = 0
                print("  ⚠️ Maç verisi yok")
            
            # === 4. SONUÇLARI GÖSTER API ===
            print("\n🏆 [4/6] 'Sonuçları Göster' API çağrılıyor...")
            
            # API ile sonuçları göster (butona tıklamak yerine)
            # buildMatchResultsPayloadForMatch fonksiyonunun yaptığını simüle ediyoruz
            payload = {
                "type": "results",
                "match": {
                    "match_number": 1,
                    "match_type": "qualification",
                    "field_number": 1,
                    "red_alliance": ["202524", "202507"],
                    "blue_alliance": ["202519", "202504"]
                },
                "results": {
                    "winner": "Berabere",
                    "red_score": initial_red,
                    "blue_score": initial_blue,
                    "red_auto_total": 10,
                    "red_teleop_total": 21,
                    "red_penalty_total": 0,
                    "blue_auto_total": 10,
                    "blue_teleop_total": 21,
                    "blue_penalty_total": 0
                }
            }
            
            response = await match_control.request.post(
                f"{BASE_URL}/api/screens/preview",
                data=json.dumps({
                    "view": "match",
                    "mode": "preview",
                    "duration_seconds": 15,  # 15 saniye - test süresi için
                    "payload": payload
                }),
                headers={"Content-Type": "application/json"}
            )
            
            if response.ok:
                print("  ✅ 'Sonuçları Göster' API çağrıldı (15sn preview)")
            else:
                data = await response.json()
                print(f"  ⚠️ API hatası: {data}")
            
            await asyncio.sleep(2)
            
            # === 5. SKOR KALICILIĞI TESTİ (Preview süresi dolana kadar + sonrası) ===
            print("\n⏱️ [5/6] Skor kalıcılığı test ediliyor...")
            print("     Preview 15sn - Test 25sn (preview sonrası dahil)")
            
            scores_stable = True
            score_changes = []
            
            for i in range(8):  # 24 saniye boyunca (15sn preview + 9sn sonrası)
                await asyncio.sleep(3)
                
                response = await audience.request.get(f"{BASE_URL}/api/match-control/audience-display")
                data = await response.json()
                
                if data.get("match"):
                    current_red = data["match"].get("red_score", 0)
                    current_blue = data["match"].get("blue_score", 0)
                    
                    score_changes.append({
                        "time": (i+1) * 3,
                        "red": current_red,
                        "blue": current_blue
                    })
                    
                    status = "📺 Preview" if (i+1)*3 <= 15 else "🔄 Normal"
                    print(f"  {status} {(i+1)*3}s: Kırmızı={current_red}, Mavi={current_blue}")
                    
                    # Skor değişti mi kontrol et
                    if i > 0:
                        prev = score_changes[-2]
                        if current_red != prev["red"] or current_blue != prev["blue"]:
                            scores_stable = False
                            print(f"    ⚠️ SKOR DEĞİŞTİ! Önceki: {prev['red']}-{prev['blue']}")
            
            # === 6. SONUÇ ===
            print("\n" + "="*70)
            print("📊 TEST SONUCU")
            print("="*70)
            
            if scores_stable:
                print("✅ BAŞARILI: Skorlar 15 saniye boyunca tutarlı kaldı")
                print(f"   Son skor: Kırmızı={score_changes[-1]['red']}, Mavi={score_changes[-1]['blue']}")
            else:
                print("❌ BAŞARISIZ: Skorlar değişti!")
                print("   Skor geçmişi:")
                for sc in score_changes:
                    print(f"   - {sc['time']}s: {sc['red']}-{sc['blue']}")
            
            print("="*70)
            
            return scores_stable
            
        except Exception as e:
            print(f"\n❌ Test hatası: {e}")
            import traceback
            traceback.print_exc()
            return False
            
        finally:
            await browser.close()


async def main():
    """Ana test fonksiyonu"""
    print("\n" + "="*70)
    print("🧪 SKOR KALICILIK TESTLERİ")
    print("="*70)
    
    result = await test_results_persistence()
    
    print("\n" + "="*70)
    print("📋 GENEL ÖZET")
    print("="*70)
    
    if result:
        print("🎉 TEST BAŞARILI!")
        return 0
    else:
        print("⚠️ TEST BAŞARISIZ")
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
