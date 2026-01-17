# -*- coding: utf-8 -*-
"""
Kapsamli Storage Modulleri Test Dosyasi

Bu dosya tum storage modullerini test eder:
- BaseStorage: Temel DB işlemleri
- EventsStorage: Etkinlik yönetimi
- TeamsStorage: Takım yönetimi
- UsersStorage: Kullanıcı yönetimi
- InspectionStorage: İnceleme slotları
- PracticeMatchesStorage: Deneme maçları

Test Senaryoları:
1. Veritabanı başlatma ve şema oluşturma
2. Etkinlik CRUD işlemleri
3. Takım CRUD işlemleri
4. Kullanıcı CRUD işlemleri ve kimlik doğrulama
5. İnceleme slotları CRUD işlemleri
6. Deneme maçları CRUD işlemleri
7. Çakışma kontrolleri
8. Migrasyon testleri
"""

import json
import os
import sqlite3
import tempfile
from pathlib import Path
from datetime import datetime, timedelta

# Test için geçici veritabanı kullanacağız
import sys
sys.path.insert(0, '.')

from src.core.storage import DataStore


class TestStorageModules:
    """Storage modüllerini test eden sınıf."""
    
    def __init__(self):
        """Test ortamını hazırla."""
        self.temp_dir = tempfile.mkdtemp()
        self.base_path = Path(self.temp_dir)
        self.db_path = self.base_path / "src" / "resources" / "data.db"
        self.datastore = None
        self.test_results = []
        
    def setup(self):
        """Test veritabanını oluştur."""
        print("=" * 60)
        print("TEST ORTAMI HAZIRLANIYOR...")
        print("=" * 60)
        self.datastore = DataStore(base_path=self.base_path)
        print(f"[OK] Veritabani olusturuldu: {self.db_path}")
        
    def teardown(self):
        """Test veritabanını temizle."""
        # DataStore bağlantısını kapat
        if self.datastore:
            self.datastore = None
        
        # Kısa bir bekleme (Windows'ta dosya kilidi için)
        import time
        time.sleep(0.1)
        
        if self.db_path.exists():
            try:
                os.remove(self.db_path)
            except PermissionError:
                # Dosya hala kilitliyse, geçici dizini olduğu gibi bırak
                pass
        if self.temp_dir and os.path.exists(self.temp_dir):
            try:
                import shutil
                shutil.rmtree(self.temp_dir)
            except PermissionError:
                # Dizin hala kilitliyse, geçici dizini olduğu gibi bırak
                pass
        print("\n[OK] Test ortami temizlendi")
    
    def run_test(self, test_name: str, test_func):
        """Tek bir testi calistir ve sonucu kaydet."""
        try:
            print(f"\n[TEST] {test_name}")
            result = test_func()
            if result:
                print(f"[OK] {test_name} - BASARILI")
                self.test_results.append((test_name, True, None))
                return True
            else:
                print(f"[FAIL] {test_name} - BASARISIZ")
                self.test_results.append((test_name, False, "Test False dondu"))
                return False
        except Exception as e:
            print(f"[FAIL] {test_name} - HATA: {str(e)}")
            self.test_results.append((test_name, False, str(e)))
            return False
    
    # ========== BASE STORAGE TESTS ==========
    
    def test_database_initialization(self):
        """Veritabanı şemasının doğru oluşturulduğunu test et."""
        with sqlite3.connect(self.db_path) as conn:
            tables = {row[0] for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()}
        
        required_tables = {'events', 'teams', 'users', 'inspection_slots', 'practice_matches'}
        return required_tables.issubset(tables)
    
    def test_default_admin_created(self):
        """Varsayılan admin kullanıcısının oluşturulduğunu test et."""
        users = self.datastore.list_users()
        admin_users = [u for u in users if u['username'] == 'admin']
        return len(admin_users) > 0
    
    # ========== EVENTS STORAGE TESTS ==========
    
    def test_create_event(self):
        """Yeni etkinlik oluşturma testi."""
        event_id = self.datastore.create_event("Test Etkinlik", {"code": "TEST"})
        return event_id > 0
    
    def test_get_event(self):
        """Etkinlik bilgilerini getirme testi."""
        event = self.datastore.get_event()
        return isinstance(event, dict) and 'name' in event
    
    def test_save_event(self):
        """Etkinlik kaydetme testi."""
        data = {"name": "Güncellenmiş Etkinlik", "code": "UPDT"}
        self.datastore.save_event(data)
        event = self.datastore.get_event()
        return event.get('name') == "Güncellenmiş Etkinlik"
    
    def test_get_events(self):
        """Tüm etkinlikleri listeleme testi."""
        events = self.datastore.get_events()
        return isinstance(events, list) and len(events) > 0
    
    def test_set_active_event(self):
        """Aktif etkinlik ayarlama testi."""
        event_id = self.datastore.create_event("İkinci Etkinlik")
        self.datastore.set_active_event(event_id)
        active_id = self.datastore.get_active_event_id()
        return active_id == event_id
    
    def test_delete_event(self):
        """Etkinlik silme testi."""
        event_id = self.datastore.create_event("Silinecek Etkinlik")
        self.datastore.delete_event(event_id)
        events = self.datastore.get_events()
        return not any(e['id'] == event_id for e in events)
    
    # ========== TEAMS STORAGE TESTS ==========
    
    def test_save_teams(self):
        """Takım kaydetme testi."""
        teams = [
            {"number": "202501", "name": "Test Takım 1", "school": "Test Okul", "city": "İstanbul", "category": "Rookie"},
            {"number": "202502", "name": "Test Takım 2", "school": "Test Okul 2", "city": "Ankara", "category": "Veteran"},
        ]
        self.datastore.save_teams(teams)
        saved_teams = self.datastore.get_teams()
        return len(saved_teams) == 2
    
    def test_get_teams(self):
        """Takım listeleme testi."""
        teams = self.datastore.get_teams()
        return isinstance(teams, list)
    
    # ========== USERS STORAGE TESTS ==========
    
    def test_create_user(self):
        """Kullanıcı oluşturma testi."""
        token = self.datastore.create_user("test_user", "test123", "admin")
        return token is not None and len(token) > 0
    
    def test_authenticate_user(self):
        """Kullanıcı kimlik doğrulama testi."""
        self.datastore.create_user("auth_user", "auth123", "admin")
        result = self.datastore.authenticate_user("auth_user", "auth123")
        return result is True
    
    def test_authenticate_token(self):
        """Token ile kimlik doğrulama testi."""
        token = self.datastore.create_user("token_user", "token123", "admin")
        username = self.datastore.authenticate_token(token)
        return username == "token_user"
    
    def test_get_user_role(self):
        """Kullanıcı rolü getirme testi."""
        self.datastore.create_user("role_user", "role123", "hakem")
        role = self.datastore.get_user_role("role_user")
        return role == "hakem"
    
    def test_delete_user(self):
        """Kullanıcı silme testi."""
        self.datastore.create_user("delete_user", "delete123", "admin")
        self.datastore.delete_user("delete_user")
        users = self.datastore.list_users()
        return not any(u['username'] == "delete_user" for u in users)
    
    def test_create_default_role_users(self):
        """Varsayılan rol kullanıcıları oluşturma testi."""
        event_id = self.datastore.get_active_event_id()
        if event_id is None:
            event_id = self.datastore.create_event("Test Event")
        created = self.datastore.create_default_role_users(event_id)
        return len(created) > 0
    
    # ========== INSPECTION STORAGE TESTS ==========
    
    def test_create_inspection_slot(self):
        """İnceleme slotu oluşturma testi."""
        slot_id = self.datastore.create_inspection_slot(
            team_number="202501",
            inspection_type="Donanım",
            slot_date="2026-02-06",
            slot_time="09:00",
            duration_minutes=20
        )
        return slot_id > 0
    
    def test_get_inspection_slots(self):
        """İnceleme slotlarını listeleme testi."""
        self.datastore.create_inspection_slot(
            team_number="202502",
            inspection_type="Boyut",
            slot_date="2026-02-06",
            slot_time="10:00",
            duration_minutes=10
        )
        slots = self.datastore.get_inspection_slots()
        return len(slots) > 0
    
    def test_update_inspection_slot(self):
        """İnceleme slotu güncelleme testi."""
        slot_id = self.datastore.create_inspection_slot(
            team_number="202503",
            inspection_type="Güvenlik",
            slot_date="2026-02-06",
            slot_time="11:00",
            duration_minutes=15
        )
        self.datastore.update_inspection_slot(slot_id, status="Tamamlandı")
        slots = self.datastore.get_inspection_slots()
        updated = next((s for s in slots if s['id'] == slot_id), None)
        return updated and updated['status'] == "Tamamlandı"
    
    def test_check_inspection_conflict(self):
        """İnceleme çakışması kontrolü testi."""
        self.datastore.create_inspection_slot(
            team_number="202504",
            inspection_type="Donanım",
            slot_date="2026-02-06",
            slot_time="12:00",
            duration_minutes=20
        )
        # Aynı takım, aynı zaman - çakışma olmalı
        conflict = self.datastore.check_inspection_conflict(
            team_number="202504",
            slot_date="2026-02-06",
            slot_time="12:10",
            duration_minutes=20
        )
        return conflict is True
    
    def test_delete_inspection_slot(self):
        """İnceleme slotu silme testi."""
        slot_id = self.datastore.create_inspection_slot(
            team_number="202505",
            inspection_type="Yazılım",
            slot_date="2026-02-06",
            slot_time="13:00",
            duration_minutes=15
        )
        self.datastore.delete_inspection_slot(slot_id)
        slots = self.datastore.get_inspection_slots()
        return not any(s['id'] == slot_id for s in slots)
    
    # ========== PRACTICE MATCHES STORAGE TESTS ==========
    
    def test_create_practice_match(self):
        """Deneme maçı oluşturma testi."""
        match_id = self.datastore.create_practice_match(
            match_number="P1",
            field_number=1,
            match_date="2026-02-06",
            match_time="14:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        return match_id > 0
    
    def test_get_practice_matches(self):
        """Deneme maçlarını listeleme testi."""
        self.datastore.create_practice_match(
            match_number="P2",
            field_number=1,
            match_date="2026-02-06",
            match_time="15:00",
            red_alliance=["202505", "202506"],
            blue_alliance=["202507", "202508"]
        )
        matches = self.datastore.get_practice_matches()
        return len(matches) > 0
    
    def test_update_practice_match(self):
        """Deneme maçı güncelleme testi."""
        match_id = self.datastore.create_practice_match(
            match_number="P3",
            field_number=1,
            match_date="2026-02-06",
            match_time="16:00",
            red_alliance=["202509", "202510"],
            blue_alliance=["202511", "202512"]
        )
        self.datastore.update_practice_match(match_id, status="Tamamlandı", red_score=100, blue_score=95)
        matches = self.datastore.get_practice_matches()
        updated = next((m for m in matches if m['id'] == match_id), None)
        return updated and updated['status'] == "Tamamlandı" and updated['red_score'] == 100
    
    def test_check_practice_match_conflict(self):
        """Deneme maçı çakışması kontrolü testi."""
        # Önce event'e maç süresi ekle
        event = self.datastore.get_event()
        event["schedule"] = event.get("schedule", {})
        event["schedule"]["match_cycle_seconds"] = 150  # 2.5 dakika
        self.datastore.save_event(event)
        
        self.datastore.create_practice_match(
            match_number="P4",
            field_number=1,
            match_date="2026-02-06",
            match_time="17:00",
            red_alliance=["202513", "202514"],
            blue_alliance=["202515", "202516"]
        )
        # Aynı takım, çakışan zaman - çakışma olmalı
        # Maç süresi 2.5 dakika, 17:05'te başlayan maç 17:00'deki maçla çakışmalı
        conflict = self.datastore.check_practice_match_conflict(
            team_number="202513",
            match_date="2026-02-06",
            match_time="17:01",  # 17:00'deki maçla çakışmalı
            duration_minutes=3  # 3 dakika süren bir maç
        )
        return conflict is True
    
    def test_delete_practice_match(self):
        """Deneme maçı silme testi."""
        match_id = self.datastore.create_practice_match(
            match_number="P5",
            field_number=1,
            match_date="2026-02-06",
            match_time="18:00",
            red_alliance=["202517", "202518"],
            blue_alliance=["202519", "202520"]
        )
        self.datastore.delete_practice_match(match_id)
        matches = self.datastore.get_practice_matches()
        return not any(m['id'] == match_id for m in matches)
    
    # ========== INTEGRATION TESTS ==========
    
    def test_event_team_cascade_delete(self):
        """Etkinlik silindiğinde takımların da silindiğini test et."""
        event_id = self.datastore.create_event("Cascade Test Event")
        self.datastore.set_active_event(event_id)
        self.datastore.save_teams([{"number": "999999", "name": "Test Takım"}])
        
        teams_before = len(self.datastore.get_teams())
        self.datastore.delete_event(event_id)
        
        # Yeni aktif etkinlik seç
        events = self.datastore.get_events()
        if events:
            self.datastore.set_active_event(events[0]['id'])
        
        teams_after = len(self.datastore.get_teams())
        return teams_before > 0 and teams_after == 0
    
    def test_multiple_events_isolation(self):
        """Çoklu etkinlik izolasyonu testi."""
        event1_id = self.datastore.create_event("Event 1")
        event2_id = self.datastore.create_event("Event 2")
        
        # Event 1'e takım ekle
        self.datastore.set_active_event(event1_id)
        self.datastore.save_teams([{"number": "111111", "name": "Event 1 Takım"}])
        
        # Event 2'ye takım ekle
        self.datastore.set_active_event(event2_id)
        self.datastore.save_teams([{"number": "222222", "name": "Event 2 Takım"}])
        
        # Event 1'e geri dön
        self.datastore.set_active_event(event1_id)
        teams = self.datastore.get_teams()
        
        return len(teams) == 1 and teams[0]['number'] == "111111"
    
    # ========== RUN ALL TESTS ==========
    
    def run_all_tests(self):
        """Tüm testleri çalıştır."""
        print("\n" + "=" * 60)
        print("KAPSAMLI STORAGE MODULLERI TESTI BASLIYOR")
        print("=" * 60)
        
        self.setup()
        
        # Test listesi
        tests = [
            # Base Storage
            ("Veritabanı Başlatma", self.test_database_initialization),
            ("Varsayılan Admin Oluşturma", self.test_default_admin_created),
            
            # Events Storage
            ("Etkinlik Olusturma", self.test_create_event),
            ("Etkinlik Getirme", self.test_get_event),
            ("Etkinlik Kaydetme", self.test_save_event),
            ("Etkinlik Listeleme", self.test_get_events),
            ("Aktif Etkinlik Ayarlama", self.test_set_active_event),
            ("Etkinlik Silme", self.test_delete_event),
            
            # Teams Storage
            ("Takim Kaydetme", self.test_save_teams),
            ("Takim Listeleme", self.test_get_teams),
            
            # Users Storage
            ("Kullanici Olusturma", self.test_create_user),
            ("Kullanici Kimlik Dogrulama", self.test_authenticate_user),
            ("Token Kimlik Dogrulama", self.test_authenticate_token),
            ("Kullanici Rol Getirme", self.test_get_user_role),
            ("Kullanici Silme", self.test_delete_user),
            ("Varsayilan Rol Kullanicilari", self.test_create_default_role_users),
            
            # Inspection Storage
            ("Inceleme Slotu Olusturma", self.test_create_inspection_slot),
            ("Inceleme Slotlari Listeleme", self.test_get_inspection_slots),
            ("Inceleme Slotu Guncelleme", self.test_update_inspection_slot),
            ("Inceleme Cakisma Kontrolu", self.test_check_inspection_conflict),
            ("Inceleme Slotu Silme", self.test_delete_inspection_slot),
            
            # Practice Matches Storage
            ("Deneme Maci Olusturma", self.test_create_practice_match),
            ("Deneme Maclari Listeleme", self.test_get_practice_matches),
            ("Deneme Maci Guncelleme", self.test_update_practice_match),
            ("Deneme Maci Cakisma Kontrolu", self.test_check_practice_match_conflict),
            ("Deneme Maci Silme", self.test_delete_practice_match),
            
            # Integration Tests
            ("Cascade Delete (Event-Teams)", self.test_event_team_cascade_delete),
            ("Coklu Etkinlik Izolasyonu", self.test_multiple_events_isolation),
        ]
        
        # Testleri çalıştır
        passed = 0
        failed = 0
        
        for test_name, test_func in tests:
            if self.run_test(test_name, test_func):
                passed += 1
            else:
                failed += 1
        
        # Sonuçları göster
        print("\n" + "=" * 60)
        print("TEST SONUÇLARI")
        print("=" * 60)
        print(f"Toplam Test: {len(tests)}")
        print(f"Basarili: {passed}")
        print(f"Basarisiz: {failed}")
        print(f"Basari Orani: {(passed/len(tests)*100):.1f}%")
        
        if failed > 0:
            print("\nBasarisiz Testler:")
            for test_name, success, error in self.test_results:
                if not success:
                    print(f"  - {test_name}: {error}")
        
        self.teardown()
        
        return failed == 0


if __name__ == "__main__":
    tester = TestStorageModules()
    success = tester.run_all_tests()
    exit(0 if success else 1)
