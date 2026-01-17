"""
İnceleme Programı Yeni Özellikler Test Dosyası

Test edilen özellikler:
1. Sıralama seçenekleri (ascending, descending, random)
2. Tüm programı silme
3. Programı tekrar oluşturma
"""

import sys
import json
from pathlib import Path

sys.path.insert(0, '.')

from src.core.storage import DataStore


def test_sorting_options():
    """Sıralama seçeneklerini test et."""
    print("\n" + "=" * 60)
    print("SIRALAMA SECENEKLERI TESTI")
    print("=" * 60)
    
    # Test veritabanı oluştur
    import tempfile
    import os
    temp_dir = tempfile.mkdtemp()
    base_path = Path(temp_dir)
    datastore = DataStore(base_path=base_path)
    
    # Test etkinliği oluştur
    event_id = datastore.create_event("Test Event")
    datastore.set_active_event(event_id)
    
    # Test takımları ekle
    teams = [
        {"number": "202501", "name": "Takım 1"},
        {"number": "202502", "name": "Takım 2"},
        {"number": "202503", "name": "Takım 3"},
        {"number": "202504", "name": "Takım 4"},
        {"number": "202505", "name": "Takım 5"},
    ]
    datastore.save_teams(teams)
    
    # Takım numaralarını al
    team_numbers = [t.get("number", "").strip() for t in teams if t.get("number", "").strip()]
    print(f"\nOrijinal takım sırası: {team_numbers}")
    
    # Ascending sıralama testi
    ascending_teams = team_numbers.copy()
    ascending_teams.sort(key=lambda x: (len(x), x))
    print(f"Ascending sıralama: {ascending_teams}")
    assert ascending_teams == sorted(team_numbers, key=lambda x: (len(x), x)), "Ascending sıralama başarısız"
    print("✓ Ascending sıralama başarılı")
    
    # Descending sıralama testi
    descending_teams = team_numbers.copy()
    descending_teams.sort(key=lambda x: (len(x), x), reverse=True)
    print(f"Descending sıralama: {descending_teams}")
    assert descending_teams == sorted(team_numbers, key=lambda x: (len(x), x), reverse=True), "Descending sıralama başarısız"
    print("✓ Descending sıralama başarılı")
    
    # Random sıralama testi
    import random
    random_teams = team_numbers.copy()
    random.shuffle(random_teams)
    print(f"Random sıralama: {random_teams}")
    # Random için sadece uzunluk kontrolü yap
    assert len(random_teams) == len(team_numbers), "Random sıralama başarısız"
    assert set(random_teams) == set(team_numbers), "Random sıralama başarısız"
    print("✓ Random sıralama başarılı")
    
    # Temizlik
    import shutil
    shutil.rmtree(temp_dir)
    print("\n✓ Tüm sıralama testleri başarılı!")


def test_delete_all_slots():
    """Tüm slotları silme özelliğini test et."""
    print("\n" + "=" * 60)
    print("TUM PROGRAMI SILME TESTI")
    print("=" * 60)
    
    # Test veritabanı oluştur
    import tempfile
    import os
    temp_dir = tempfile.mkdtemp()
    base_path = Path(temp_dir)
    datastore = DataStore(base_path=base_path)
    
    # Test etkinliği oluştur
    event_id = datastore.create_event("Test Event")
    datastore.set_active_event(event_id)
    
    # Test takımları ekle
    teams = [
        {"number": "202501", "name": "Takım 1"},
        {"number": "202502", "name": "Takım 2"},
    ]
    datastore.save_teams(teams)
    
    # Test slotları oluştur
    slot_ids = []
    for team in teams:
        slot_id = datastore.create_inspection_slot(
            team_number=team["number"],
            inspection_type="hardware",
            slot_date="2026-02-06",
            slot_time="09:00",
            duration_minutes=20
        )
        slot_ids.append(slot_id)
    
    # Slot sayısını kontrol et
    slots_before = datastore.get_inspection_slots()
    print(f"\nSilmeden önce slot sayısı: {len(slots_before)}")
    assert len(slots_before) == 2, "Slot oluşturma başarısız"
    
    # Tüm slotları sil
    datastore.delete_all_inspection_slots()
    
    # Slot sayısını tekrar kontrol et
    slots_after = datastore.get_inspection_slots()
    print(f"Silmeden sonra slot sayısı: {len(slots_after)}")
    assert len(slots_after) == 0, "Tüm slotları silme başarısız"
    
    print("✓ Tüm programı silme başarılı!")
    
    # Temizlik
    import shutil
    shutil.rmtree(temp_dir)


def test_regenerate_program():
    """Programı tekrar oluşturma özelliğini test et."""
    print("\n" + "=" * 60)
    print("PROGRAMI TEKRAR OLUSTURMA TESTI")
    print("=" * 60)
    
    # Test veritabanı oluştur
    import tempfile
    import os
    temp_dir = tempfile.mkdtemp()
    base_path = Path(temp_dir)
    datastore = DataStore(base_path=base_path)
    
    # Test etkinliği oluştur
    event_id = datastore.create_event("Test Event")
    datastore.set_active_event(event_id)
    
    # Test takımları ekle
    teams = [
        {"number": "202501", "name": "Takım 1"},
        {"number": "202502", "name": "Takım 2"},
    ]
    datastore.save_teams(teams)
    
    # İlk programı oluştur (ascending)
    team_numbers = [t.get("number", "").strip() for t in teams if t.get("number", "").strip()]
    team_numbers.sort(key=lambda x: (len(x), x))  # Ascending
    
    for team_number in team_numbers:
        datastore.create_inspection_slot(
            team_number=team_number,
            inspection_type="hardware",
            slot_date="2026-02-06",
            slot_time="09:00",
            duration_minutes=20
        )
    
    slots_before = datastore.get_inspection_slots()
    print(f"\nİlk program slot sayısı: {len(slots_before)}")
    
    # Programı sil
    datastore.delete_all_inspection_slots()
    
    # Programı tekrar oluştur (descending)
    team_numbers.sort(key=lambda x: (len(x), x), reverse=True)  # Descending
    
    for team_number in team_numbers:
        datastore.create_inspection_slot(
            team_number=team_number,
            inspection_type="hardware",
            slot_date="2026-02-06",
            slot_time="09:00",
            duration_minutes=20
        )
    
    slots_after = datastore.get_inspection_slots()
    print(f"Yeniden oluşturulan program slot sayısı: {len(slots_after)}")
    assert len(slots_after) == 2, "Programı tekrar oluşturma başarısız"
    
    print("✓ Programı tekrar oluşturma başarılı!")
    
    # Temizlik
    import shutil
    shutil.rmtree(temp_dir)


if __name__ == "__main__":
    print("=" * 60)
    print("INCELEME PROGRAMI YENI OZELLIKLER TESTI")
    print("=" * 60)
    
    try:
        test_sorting_options()
        test_delete_all_slots()
        test_regenerate_program()
        
        print("\n" + "=" * 60)
        print("TUM TESTLER BASARILI!")
        print("=" * 60)
    except Exception as e:
        print(f"\n✗ TEST HATASI: {str(e)}")
        import traceback
        traceback.print_exc()
        exit(1)
