"""
Hakem Paneli Test Modülü

Bu modül hakem paneli API endpoint'lerinin testlerini içerir.
"""

import unittest
import json
from pathlib import Path
import sys

# Proje kök dizinini path'e ekle
sys.path.insert(0, str(Path(__file__).parent))

from app_web import create_app
from src.core.storage import DataStore


class TestRefereePanelAPI(unittest.TestCase):
    """Hakem paneli API endpoint'lerinin testleri"""
    
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
        
        # Test hakem kullanıcısı oluştur
        cls.datastore.create_user("test_hakem", "test123", "hakem_1", cls.test_event_id)
        with cls.client.session_transaction() as sess:
            sess["user"] = "test_hakem"  # Decorator için gerekli
            sess["user_id"] = cls.datastore.authenticate_user("test_hakem", "test123", cls.test_event_id)
            sess["username"] = "test_hakem"
            sess["role"] = "hakem_1"
            sess["event_id"] = cls.test_event_id
    
    def test_get_active_match_no_match(self):
        """Aktif maç yokken test"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_hakem"  # Decorator için gerekli
        
        response = self.client.get("/api/referee/active-match")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIsNone(data.get("match"))
    
    def test_get_active_match_with_match(self):
        """Aktif maç varken test"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_hakem"  # Decorator için gerekli
        
        # Maç oluştur ve başlat
        match_id = self.datastore.create_match(
            match_number=700,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # Maçı başlat (başka bir client ile)
        self.datastore.update_match(match_id=match_id, status="in_progress")
        
        # Aktif maçı getir
        response = self.client.get("/api/referee/active-match")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIsNotNone(data.get("match"))
        self.assertEqual(data["match"]["id"], match_id)
    
    def test_referee_update_score(self):
        """Hakem skor güncelleme testi"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_hakem"  # Decorator için gerekli
        
        # Maç oluştur
        match_id = self.datastore.create_match(
            match_number=800,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # Hakem skor güncelle
        scoring_data = {
            "auto_leave_r1": True,
            "auto_leave_r2": False,
            "auto_bent1_own": 5,
            "auto_bent2_correct": 3,
            "auto_bent3_correct": 2,
            "teleop_bent1_own": 3,
            "teleop_climb": 1,
            "yellow_card": 0,
            "major_penalty": 0
        }
        
        response = self.client.post(
            "/api/referee/score/update",
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
    
    def test_referee_get_score(self):
        """Hakem skor getirme testi"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_hakem"  # Decorator için gerekli
        
        # Maç oluştur
        match_id = self.datastore.create_match(
            match_number=900,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # Önce skor güncelle
        scoring_data = {
            "auto_leave_r1": True,
            "auto_bent1_own": 5
        }
        
        self.client.post(
            "/api/referee/score/update",
            data=json.dumps({
                "match_id": match_id,
                "alliance": "red",
                "scoring_data": scoring_data
            }),
            content_type="application/json"
        )
        
        # Skorları getir
        response = self.client.get(f"/api/referee/score/get/{match_id}")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        # API response formatı: {"red": {...}, "blue": {...}}
        self.assertIn("red", data)
        self.assertIn("blue", data)
        self.assertIn("scoring_data", data["red"])
        self.assertIn("calculated_score", data["red"])
        self.assertIn("breakdown", data["red"])
    
    def test_referee_update_score_invalid_alliance(self):
        """Geçersiz ittifak ile skor güncelleme testi"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_hakem"  # Decorator için gerekli
        
        match_id = self.datastore.create_match(
            match_number=1,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        response = self.client.post(
            "/api/referee/score/update",
            data=json.dumps({
                "match_id": match_id,
                "alliance": "invalid",
                "scoring_data": {}
            }),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("error", data)
    
    def test_referee_update_score_missing_match_id(self):
        """Maç ID eksikken skor güncelleme testi"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_hakem"  # Decorator için gerekli
        
        response = self.client.post(
            "/api/referee/score/update",
            data=json.dumps({
                "alliance": "red",
                "scoring_data": {}
            }),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("error", data)
    
    def test_referee_submit_match(self):
        """Hakem maç girişini tamamlama testi"""
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_hakem"  # Decorator için gerekli
        
        # Maç oluştur
        match_id = self.datastore.create_match(
            match_number=1000,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # Önce skor güncelle
        self.client.post(
            "/api/referee/score/update",
            data=json.dumps({
                "match_id": match_id,
                "alliance": "red",
                "scoring_data": {"auto_leave_r1": True}
            }),
            content_type="application/json"
        )
        
        # Submit yap
        response = self.client.post(
            "/api/referee/submit",
            data=json.dumps({
                "match_id": match_id,
                "alliance": "red",
                "match_source": "schedule"
            }),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get("ok"))
        self.assertIn("referee_meta", data)
        self.assertTrue(data["referee_meta"]["red"]["submitted"])
    
    def test_head_referee_approve_match(self):
        """Baş hakem maç onaylama testi"""
        # Baş hakem kullanıcısı oluştur
        self.datastore.create_user("test_bas_hakem", "test123", "bas_hakem", self.test_event_id)
        
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_bas_hakem"
            sess["user_id"] = self.datastore.authenticate_user("test_bas_hakem", "test123", self.test_event_id)
            sess["username"] = "test_bas_hakem"
            sess["role"] = "bas_hakem"
            sess["event_id"] = self.test_event_id
        
        # Maç oluştur
        match_id = self.datastore.create_match(
            match_number=1100,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # Her iki hakem de submit yapmalı
        # Kırmızı hakem
        with self.client.session_transaction() as sess:
            sess["user"] = "test_hakem"
        
        self.client.post(
            "/api/referee/score/update",
            data=json.dumps({
                "match_id": match_id,
                "alliance": "red",
                "scoring_data": {"auto_leave_r1": True}
            }),
            content_type="application/json"
        )
        
        self.client.post(
            "/api/referee/submit",
            data=json.dumps({
                "match_id": match_id,
                "alliance": "red",
                "match_source": "schedule"
            }),
            content_type="application/json"
        )
        
        # Mavi hakem (başka bir kullanıcı)
        self.datastore.create_user("test_hakem_2", "test123", "hakem_2", self.test_event_id)
        with self.client.session_transaction() as sess:
            sess["user"] = "test_hakem_2"
            sess["user_id"] = self.datastore.authenticate_user("test_hakem_2", "test123", self.test_event_id)
            sess["username"] = "test_hakem_2"
            sess["role"] = "hakem_2"
        
        self.client.post(
            "/api/referee/score/update",
            data=json.dumps({
                "match_id": match_id,
                "alliance": "blue",
                "scoring_data": {"auto_leave_r1": True}
            }),
            content_type="application/json"
        )
        
        self.client.post(
            "/api/referee/submit",
            data=json.dumps({
                "match_id": match_id,
                "alliance": "blue",
                "match_source": "schedule"
            }),
            content_type="application/json"
        )
        
        # Baş hakem onayı
        with self.client.session_transaction() as sess:
            sess["user"] = "test_bas_hakem"
        
        response = self.client.post(
            "/api/referee/approve",
            data=json.dumps({
                "match_id": match_id,
                "match_source": "schedule"
            }),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data.get("ok"))
        self.assertIn("referee_meta", data)
        self.assertTrue(data["referee_meta"]["head"]["approved"])
    
    def test_head_referee_approve_before_submit(self):
        """Her iki hakem submit etmeden önce onaylama testi (409 Conflict)"""
        # Baş hakem kullanıcısı oluştur
        self.datastore.create_user("test_bas_hakem_2", "test123", "bas_hakem", self.test_event_id)
        
        # Session ile istek yap
        with self.client.session_transaction() as sess:
            sess["user"] = "test_bas_hakem_2"
            sess["user_id"] = self.datastore.authenticate_user("test_bas_hakem_2", "test123", self.test_event_id)
            sess["username"] = "test_bas_hakem_2"
            sess["role"] = "bas_hakem"
            sess["event_id"] = self.test_event_id
        
        # Maç oluştur
        match_id = self.datastore.create_match(
            match_number=1200,
            match_type="qualification",
            field_number=1,
            match_date="2025-01-20",
            match_time="10:00",
            red_alliance=["202501", "202502"],
            blue_alliance=["202503", "202504"]
        )
        
        # Sadece kırmızı hakem submit yaptı
        with self.client.session_transaction() as sess:
            sess["user"] = "test_hakem"
        
        self.client.post(
            "/api/referee/submit",
            data=json.dumps({
                "match_id": match_id,
                "alliance": "red",
                "match_source": "schedule"
            }),
            content_type="application/json"
        )
        
        # Baş hakem onaylamaya çalış (409 Conflict bekleniyor)
        with self.client.session_transaction() as sess:
            sess["user"] = "test_bas_hakem_2"
        
        response = self.client.post(
            "/api/referee/approve",
            data=json.dumps({
                "match_id": match_id,
                "match_source": "schedule"
            }),
            content_type="application/json"
        )
        
        self.assertEqual(response.status_code, 409)
        data = json.loads(response.data)
        self.assertIn("error", data)


if __name__ == "__main__":
    unittest.main()
