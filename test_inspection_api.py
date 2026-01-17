"""
İnceleme Programı API Test Dosyası

API endpoint'lerini test eder:
1. POST /api/inspection-slots/generate (sıralama ile)
2. DELETE /api/inspection-slots (tüm slotları sil)
"""

import requests
import json
import time

BASE_URL = "http://127.0.0.1:5000"

def login():
    """Giriş yap ve session al."""
    session = requests.Session()
    res = session.post(f"{BASE_URL}/login", data={
        "username": "admin",
        "password": "admin123"
    })
    return session if res.status_code == 200 else None

def test_generate_with_sorting(session, sort_order):
    """Sıralama ile program oluştur."""
    print(f"\n[TEST] Program oluşturma - Sıralama: {sort_order}")
    
    # Önce mevcut slotları sil
    session.delete(f"{BASE_URL}/api/inspection-slots")
    
    # Program oluştur
    res = session.post(f"{BASE_URL}/api/inspection-slots/generate", json={
        "start_date": "2026-02-06",
        "start_time": "09:00",
        "inspection_types": ["hardware"],
        "break_minutes": 5,
        "inspector_names": [],
        "station_count": 1,
        "sort_order": sort_order,
        "clear_existing": False
    })
    
    if res.status_code == 200:
        data = res.json()
        print(f"  ✓ {data.get('created_count', 0)} slot oluşturuldu")
        
        # Slotları al ve takım sırasını kontrol et
        slots_res = session.get(f"{BASE_URL}/api/inspection-slots")
        if slots_res.status_code == 200:
            slots = slots_res.json()
            team_numbers = [s['team_number'] for s in slots if s.get('inspection_type') == 'hardware']
            print(f"  Takım sırası: {team_numbers[:5]}...")  # İlk 5'i göster
            return True
    else:
        print(f"  ✗ Hata: {res.status_code} - {res.text}")
        return False

def test_delete_all(session):
    """Tüm slotları sil."""
    print(f"\n[TEST] Tüm programı silme")
    
    # Önce birkaç slot oluştur
    session.post(f"{BASE_URL}/api/inspection-slots/generate", json={
        "start_date": "2026-02-06",
        "start_time": "09:00",
        "inspection_types": ["hardware"],
        "break_minutes": 5,
        "inspector_names": [],
        "station_count": 1,
        "sort_order": "ascending",
        "clear_existing": False
    })
    
    # Slot sayısını kontrol et
    slots_res = session.get(f"{BASE_URL}/api/inspection-slots")
    slots_before = len(slots_res.json()) if slots_res.status_code == 200 else 0
    print(f"  Silmeden önce: {slots_before} slot")
    
    # Tüm slotları sil
    res = session.delete(f"{BASE_URL}/api/inspection-slots")
    
    if res.status_code == 200:
        data = res.json()
        print(f"  ✓ {data.get('deleted_count', 0)} slot silindi")
        
        # Slot sayısını tekrar kontrol et
        slots_res = session.get(f"{BASE_URL}/api/inspection-slots")
        slots_after = len(slots_res.json()) if slots_res.status_code == 200 else 0
        print(f"  Silmeden sonra: {slots_after} slot")
        
        return slots_after == 0
    else:
        print(f"  ✗ Hata: {res.status_code} - {res.text}")
        return False

def main():
    print("=" * 60)
    print("INCELEME PROGRAMI API TESTI")
    print("=" * 60)
    
    # Giriş yap
    print("\n[1] Giriş yapılıyor...")
    session = login()
    if not session:
        print("✗ Giriş başarısız!")
        return
    
    print("✓ Giriş başarılı")
    
    # Sıralama testleri
    print("\n[2] Sıralama seçenekleri test ediliyor...")
    test_generate_with_sorting(session, "ascending")
    time.sleep(1)
    test_generate_with_sorting(session, "descending")
    time.sleep(1)
    test_generate_with_sorting(session, "random")
    
    # Tüm programı silme testi
    print("\n[3] Tüm programı silme test ediliyor...")
    test_delete_all(session)
    
    print("\n" + "=" * 60)
    print("API TESTLERI TAMAMLANDI")
    print("=" * 60)
    print("\nTarayıcıda test etmek için:")
    print("1. http://127.0.0.1:5000/setup#step-inspection-schedule")
    print("2. 'Takım Sıralama' dropdown'unu test edin")
    print("3. 'Tüm Programı Sil' butonunu test edin")
    print("4. Farklı sıralamalarla program oluşturun")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n✗ TEST HATASI: {str(e)}")
        import traceback
        traceback.print_exc()
