"""
Maç Kontrol Sistemi Test Modülü

Bu modül maç kontrol API endpoint'lerinin testlerini içerir.
"""

import unittest
import json
from pathlib import Path
import sys

# Proje kök dizinini path'e ekle
sys.path.insert(0, str(Path(__file__).parent))

from app_web import create_app
from src.core.storage import DataStore


class TestMatchControlAPI(unittest.TestCase):
    """Maç kontrol API endpoint'lerinin testleri"""
    
    @classmethod
    def setUpClass(cls):
        """Test sınıfı başlatıldığında Flask uygulamasını oluştur"""
        cls.app = create_app()
        cls.app.config["TESTING"] = True
        cls.client = cls.app.test_client()
        
        # Test veritabanı oluştur
        cls.datastore = DataStore(base_path=Path(__file__).parent)
        
        # Test etkinliği oluştur
        cls.test_event_id = cls.datastore.create_event(
            "Test Etkinlik",
            {"code": "TEST"}
        )
        cls.datastore.set_active_event(cls.test_event_id)
        
        # Test takımları oluştur
        cls.test_teams = [
            {"number": "202501", "name": "Test Takım 1"},
            {"number": "202502", "name": "Test Takım 2"},
            {"number": "202503", "name": "Test Takım 3"},
            {"number": "202504", "name": "Test Takım 4"}
        ]
        cls.datastore.save_teams(cls.test_teams)
        
        # Test kullanıcısı ile giriş yap
        cls.datastore.create_user("test_admin", "test123", "admin", cls.test_event_id)
        # Session'ı test client için ayarla (decorator "user" anahtarını bekliyor)
        with cls.client.session_transaction() as sess:
            sess["user"] = "test_admin"  # Decorator için gerekli
            sess["user_id"] = cls.datastore.authenticate_user("test_admin", "test123", cls.test_event_id)
            sess["username"] = "test_admin"
            sess["role"] = "admin"
            sess["event_id"] = cls.test_event_id
    
    def setUp(self):
        """Her test öncesi çalışır - aktif maçları temizle"""
        # Aktif maçları tamamla (testler arası izolasyon için)
        active_matches = self.datastore.get_match_schedule(status="in_progress")
        for match in active_matches:
            self.datastore.update_match(match_id=match["id"], status="completed")
    
    def test_get_active_match_no_match(self):
        """Aktif maç yokken test"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"  # Decorator "user" anahtarını bekliyor
            sess["user_id"] = self.datastore.authenticate_user("test_admin", "test123", self.test_event_id)
            sess["username"] = "test_admin"
            sess["role"] = "admin"
            sess["event_id"] = self.test_event_id
        
        response = self.client.get("/api/match-control/active")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIsNone(data.get("match"))
    
    def test_start_match(self):
        """Maç başlatma testi"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"  # Decorator "user" anahtarını bekliyor
            sess["user_id"] = self.datastore.authenticate_user("test_admin", "test123", self.test_event_id)
            sess["username"] = "test_admin"
            sess["role"] = "admin"
            sess["event_id"] = self.test_event_id
        
        # Önce bir maç oluştur
        match_id = self.datastore.create_match(
            match_number=1,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # Maçı başlat
        response = self.client.post(
            "/api/match-control/start",
            data=json.dumps({"match_id": match_id}),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get("ok"))
    
    def test_start_match_already_active(self):
        """Aktif maç varken yeni maç başlatma testi (409 Conflict)"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"  # Decorator için gerekli
            sess["user_id"] = self.datastore.authenticate_user("test_admin", "test123", self.test_event_id)
            sess["username"] = "test_admin"
            sess["role"] = "admin"
            sess["event_id"] = self.test_event_id
        
        # İlk maçı başlat
        match_id_1 = self.datastore.create_match(
            match_number=200,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # Session'ı tekrar ayarla (her request için gerekli)
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"
        
        response1 = self.client.post(
            "/api/match-control/start",
            data=json.dumps({"match_id": match_id_1}),
            content_type="application/json"
        )
        self.assertEqual(response1.status_code, 200, f"Response: {response1.data}")
        
        # İkinci maçı başlatmaya çalış (409 Conflict bekleniyor)
        match_id_2 = self.datastore.create_match(
            match_number=201,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:05",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # Session'ı tekrar ayarla (her request için gerekli)
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"
        
        response2 = self.client.post(
            "/api/match-control/start",
            data=json.dumps({"match_id": match_id_2}),
            content_type="application/json"
        )
        
        self.assertEqual(response2.status_code, 409)
        data = json.loads(response2.data)
        self.assertIn("error", data)
    
    def test_update_match_state(self):
        """Maç durumu güncelleme testi"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"  # Decorator için gerekli
            sess["user_id"] = self.datastore.authenticate_user("test_admin", "test123", self.test_event_id)
            sess["username"] = "test_admin"
            sess["role"] = "admin"
            sess["event_id"] = self.test_event_id
        
        # Maç oluştur ve başlat
        match_id = self.datastore.create_match(
            match_number=300,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # Session'ı tekrar ayarla (her request için gerekli)
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"
        
        # Maçı başlat
        start_response = self.client.post(
            "/api/match-control/start",
            data=json.dumps({"match_id": match_id}),
            content_type="application/json"
        )
        self.assertEqual(start_response.status_code, 200, f"Start response: {start_response.data}")
        
        # Durumu güncelle (autonomous -> driver_controlled)
        # Session'ı tekrar ayarla (her request için gerekli)
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"
        
        response = self.client.post(
            "/api/match-control/state",
            data=json.dumps({
                "match_id": match_id,
                "state": "driver_controlled"  # API "state" bekliyor
            }),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 200, f"State response: {response.data}")
        data = json.loads(response.data)
        self.assertEqual(data.get("state"), "driver_controlled")
    
    def test_update_score_detailed(self):
        """Detaylı skor güncelleme testi"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"  # Decorator için gerekli
            sess["user_id"] = self.datastore.authenticate_user("test_admin", "test123", self.test_event_id)
            sess["username"] = "test_admin"
            sess["role"] = "admin"
            sess["event_id"] = self.test_event_id
        
        # Maç oluştur
        match_id = self.datastore.create_match(
            match_number=400,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # Detaylı skor güncelle
        scoring_data = {
            "auto_leave_r1": True,
            "auto_leave_r2": True,
            "auto_bent1_own": 5,
            "auto_bent2_correct": 3
        }
        
        response = self.client.post(
            "/api/match-control/score/detailed",
            data=json.dumps({
                "match_id": match_id,
                "alliance": "red",
                "scoring_data": scoring_data
            }),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get("ok"))
        self.assertIn("calculated_score", data)
        self.assertIn("breakdown", data)
    
    def test_complete_match(self):
        """Maç tamamlama testi"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"  # Decorator için gerekli
            sess["user_id"] = self.datastore.authenticate_user("test_admin", "test123", self.test_event_id)
            sess["username"] = "test_admin"
            sess["role"] = "admin"
            sess["event_id"] = self.test_event_id
        
        # Maç oluştur ve başlat
        match_id = self.datastore.create_match(
            match_number=500,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        self.client.post(
            "/api/match-control/start",
            data=json.dumps({"match_id": match_id}),
            content_type="application/json"
        )
        
        # Maçı tamamla
        response = self.client.post(
            "/api/match-control/complete",
            data=json.dumps({
                "match_id": match_id,
                "red_score": 45,
                "blue_score": 38
            }),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get("ok"))
        
        # Veritabanında durumun "completed" olduğunu kontrol et
        matches = self.datastore.get_match_schedule()
        match = next((m for m in matches if m["id"] == match_id), None)
        if match:
            self.assertEqual(match["status"], "completed")
            self.assertEqual(match["red_score"], 45)
            self.assertEqual(match["blue_score"], 38)
    
    def test_get_next_match(self):
        """Sıradaki maç getirme testi"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"  # Decorator için gerekli
            sess["user_id"] = self.datastore.authenticate_user("test_admin", "test123", self.test_event_id)
            sess["username"] = "test_admin"
            sess["role"] = "admin"
            sess["event_id"] = self.test_event_id
        
        # Birkaç maç oluştur
        match_id_1 = self.datastore.create_match(
            match_number=600,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        match_id_2 = self.datastore.create_match(
            match_number=601,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:05",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # İlk maçı tamamla
        self.datastore.update_match(match_id=match_id_1, status="completed")
        
        # Sıradaki maçı getir
        response = self.client.get("/api/match-control/next-match")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIsNotNone(data.get("match"))
        self.assertEqual(data["match"]["id"], match_id_2)
    
    def test_preview_match(self):
        """Maç önizleme modu testi"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"
            sess["user_id"] = self.datastore.authenticate_user("test_admin", "test123", self.test_event_id)
            sess["username"] = "test_admin"
            sess["role"] = "admin"
            sess["event_id"] = self.test_event_id
        
        # Maç oluştur
        match_id = self.datastore.create_match(
            match_number=700,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # Önizleme moduna al
        response = self.client.post(
            "/api/match-control/preview",
            data=json.dumps({
                "match_id": match_id,
                "match_source": "schedule"
            }),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get("ok"))
        
        # Aktif maç olarak görünmeli (preview durumunda)
        response = self.client.get("/api/match-control/active")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIsNotNone(data.get("match"))
        self.assertEqual(data["match"]["id"], match_id)
    
    def test_preview_match_with_active_match(self):
        """Aktif maç varken önizleme yapma testi (409 Conflict)"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"
        
        # İlk maçı başlat
        match_id_1 = self.datastore.create_match(
            match_number=800,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        self.client.post(
            "/api/match-control/start",
            data=json.dumps({"match_id": match_id_1}),
            content_type="application/json"
        )
        
        # İkinci maçı önizleme moduna almaya çalış (409 Conflict bekleniyor)
        match_id_2 = self.datastore.create_match(
            match_number=801,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:05",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"
        
        response = self.client.post(
            "/api/match-control/preview",
            data=json.dumps({
                "match_id": match_id_2,
                "match_source": "schedule"
            }),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 409)
        data = json.loads(response.data)
        self.assertIn("error", data)
    
    def test_complete_match_with_source(self):
        """Match source ile maç tamamlama testi"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"
            sess["user_id"] = self.datastore.authenticate_user("test_admin", "test123", self.test_event_id)
            sess["username"] = "test_admin"
            sess["role"] = "admin"
            sess["event_id"] = self.test_event_id
        
        # Practice match oluştur
        practice_match_id = self.datastore.create_practice_match(
            match_number=1,
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # Maçı başlat
        with self.client.session_transaction() as sess:
            sess["user"] = "test_admin"
        
        self.client.post(
            "/api/match-control/start",
            data=json.dumps({
                "match_id": practice_match_id,
                "match_source": "practice"
            }),
            content_type="application/json"
        )
        
        # Maçı tamamla (match_source ile)
        response = self.client.post(
            "/api/match-control/complete",
            data=json.dumps({
                "match_id": practice_match_id,
                "red_score": 45,
                "blue_score": 38,
                "match_source": "practice"
            }),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get("ok"))


if __name__ == "__main__":
    unittest.main()
