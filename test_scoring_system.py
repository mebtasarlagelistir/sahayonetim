"""
Puanlama Sistemi Test Modülü

Bu modül modüler puanlama sisteminin (ScoreCalculator) testlerini içerir.
"""

import unittest
from src.core.scoring import ScoreCalculator, ScoringConfig


class TestScoringCalculator(unittest.TestCase):
    """ScoreCalculator sınıfının testleri"""
    
    def setUp(self):
        """Her test öncesi yeni bir calculator instance'ı oluştur"""
        self.calculator = ScoreCalculator()
    
    def test_autonomous_leave_start_area(self):
        """Başlangıç alanını terk etme puanlaması testi"""
        scoring_data = {
            "auto_leave_r1": True,
            "auto_leave_r2": True
        }
        
        result = self.calculator.calculate_alliance_score("red", scoring_data)
        
        # Her robot için 3 puan = 6 puan toplam
        self.assertEqual(result["breakdown"]["autonomous"]["leave_start_area"], 6)
        self.assertEqual(result["autonomous_total"], 6)
    
    def test_autonomous_bent_level_1(self):
        """Bent Seviye 1 puanlaması testi"""
        scoring_data = {
            "auto_bent1_own": 5
        }
        
        result = self.calculator.calculate_alliance_score("red", scoring_data)
        
        # 5 küre * 4 puan = 20 puan
        self.assertEqual(result["breakdown"]["autonomous"]["bent_level_1"], 20)
        self.assertEqual(result["autonomous_total"], 20)
    
    def test_autonomous_bent_level_2_correct(self):
        """Bent Seviye 2 - Doğru Renk/Numara testi"""
        scoring_data = {
            "auto_bent2_correct": 3,
            "auto_bent2_wrong": 0
        }
        
        result = self.calculator.calculate_alliance_score("red", scoring_data)
        
        # 3 küre * 6 puan = 18 puan
        self.assertEqual(result["breakdown"]["autonomous"]["bent_level_2"], 18)
    
    def test_autonomous_bent_level_2_wrong(self):
        """Bent Seviye 2 - Yanlış Numara testi"""
        scoring_data = {
            "auto_bent2_correct": 0,
            "auto_bent2_wrong": 2
        }
        
        result = self.calculator.calculate_alliance_score("red", scoring_data)
        
        # 2 küre * 3 puan = 6 puan
        self.assertEqual(result["breakdown"]["autonomous"]["bent_level_2"], 6)
    
    def test_autonomous_bent_level_3(self):
        """Bent Seviye 3 puanlaması testi"""
        scoring_data = {
            "auto_bent3_correct": 2,
            "auto_bent3_wrong": 1
        }
        
        result = self.calculator.calculate_alliance_score("red", scoring_data)
        
        # (2 * 8) + (1 * 4) = 20 puan
        self.assertEqual(result["breakdown"]["autonomous"]["bent_level_3"], 20)
    
    def test_autonomous_tanks(self):
        """Sarnıçlar puanlaması testi"""
        scoring_data = {
            "auto_tank_own": 4
        }
        
        result = self.calculator.calculate_alliance_score("red", scoring_data)
        
        # 4 küre * 7 puan = 28 puan
        self.assertEqual(result["breakdown"]["autonomous"]["tanks"], 28)
    
    def test_teleop_bent_levels(self):
        """Sürücü kontrollü bent seviyeleri testi"""
        scoring_data = {
            "teleop_bent1_own": 3,
            "teleop_bent2_correct": 2,
            "teleop_bent2_wrong": 1,
            "teleop_bent3_correct": 1,
            "teleop_bent3_wrong": 0
        }
        
        result = self.calculator.calculate_alliance_score("red", scoring_data)
        
        # Bent 1: 3 * 2 = 6
        # Bent 2: (2 * 4) + (1 * 3) = 11
        # Bent 3: 1 * 6 = 6
        # Toplam: 23
        self.assertEqual(result["teleop_total"], 23)
    
    def test_teleop_climb(self):
        """Su Kemerine Tırmanma testi"""
        scoring_data = {
            "teleop_climb": 2
        }
        
        result = self.calculator.calculate_alliance_score("red", scoring_data)
        
        # 2 robot * 15 puan = 30 puan
        self.assertEqual(result["breakdown"]["teleop"]["climb"], 30)
        self.assertEqual(result["teleop_total"], 30)
    
    def test_penalties_yellow_card(self):
        """Sarı kart cezası testi"""
        scoring_data = {
            "yellow_card": 2
        }
        opponent_data = {}
        
        result = self.calculator.calculate_alliance_score("red", scoring_data, opponent_data)
        
        # 2 sarı kart * 2 puan = 4 puan (rakibe gider)
        self.assertEqual(result["breakdown"]["penalties"]["yellow_card"], 4)
        self.assertEqual(result["penalty_total"], 4)
    
    def test_penalties_received(self):
        """Rakip cezalarından gelen puanlar testi"""
        scoring_data = {}
        opponent_data = {
            "yellow_card": 1,
            "major_penalty": 2
        }
        
        result = self.calculator.calculate_alliance_score("red", scoring_data, opponent_data)
        
        # (1 * 2) + (2 * 5) = 12 puan (rakibin cezalarından)
        self.assertEqual(result["received_from_penalties"], 12)
    
    def test_opponent_actions(self):
        """Rakip alana verilen puanlar testi"""
        scoring_data = {}
        opponent_data = {
            "auto_bent1_opponent": 2,
            "auto_bent2_opponent": 1,
            "teleop_bent1_opponent": 3
        }
        
        result = self.calculator.calculate_alliance_score("red", scoring_data, opponent_data)
        
        # Otonom: (2 * 4) + (1 * 6) = 14
        # Teleop: 3 * 2 = 6
        # Toplam: 20 puan (rakibin bu ittifakın alanına verdiği)
        self.assertEqual(result["received_from_opponent_actions"], 20)
    
    def test_complete_score_calculation(self):
        """Tam skor hesaplama testi (tüm kategoriler)"""
        scoring_data = {
            "auto_leave_r1": True,
            "auto_leave_r2": True,
            "auto_bent1_own": 5,
            "auto_bent2_correct": 3,
            "auto_bent3_correct": 2,
            "auto_tank_own": 4,
            "teleop_bent1_own": 3,
            "teleop_bent2_correct": 2,
            "teleop_climb": 2,
            "yellow_card": 1
        }
        opponent_data = {
            "yellow_card": 1,
            "major_penalty": 1
        }
        
        result = self.calculator.calculate_alliance_score("red", scoring_data, opponent_data)
        
        # Otonom: 6 (leave) + 20 (bent1) + 18 (bent2) + 16 (bent3) + 28 (tank) = 88
        # Teleop: 6 (bent1) + 8 (bent2) + 30 (climb) = 44
        # Cezalar (verilen): 2 (yellow card)
        # Cezalar (alınan): 2 + 5 = 7
        # Rakip alana verilen: 0 (test edilmedi)
        # Toplam: 88 + 44 + 7 = 139 (rakibe giden cezalar toplamdan çıkarılmaz, sadece breakdown'da gösterilir)
        
        self.assertGreater(result["autonomous_total"], 0)
        self.assertGreater(result["teleop_total"], 0)
        self.assertGreater(result["received_from_penalties"], 0)
        self.assertGreater(result["total_score"], 0)
    
    def test_empty_scoring_data(self):
        """Boş puanlama verisi testi"""
        scoring_data = {}
        
        result = self.calculator.calculate_alliance_score("red", scoring_data)
        
        # Tüm değerler 0 olmalı
        self.assertEqual(result["autonomous_total"], 0)
        self.assertEqual(result["teleop_total"], 0)
        self.assertEqual(result["total_score"], 0)


class TestScoringConfig(unittest.TestCase):
    """ScoringConfig sınıfının testleri"""
    
    def test_get_autonomous_rule(self):
        """Otonom kural getirme testi"""
        rule = ScoringConfig.get_autonomous_rule("leave_start_area")
        self.assertIsNotNone(rule)
        self.assertEqual(rule["points_per_robot"], 3)
    
    def test_get_teleop_rule(self):
        """Sürücü kontrollü kural getirme testi"""
        rule = ScoringConfig.get_teleop_rule("climb")
        self.assertIsNotNone(rule)
        self.assertEqual(rule["points_per_robot"], 15)
    
    def test_get_penalty_rule(self):
        """Cezalandırma kuralı getirme testi"""
        rule = ScoringConfig.get_penalty_rule("yellow_card")
        self.assertIsNotNone(rule)
        self.assertEqual(rule["points_to_opponent"], 2)
    
    def test_get_all_categories(self):
        """Tüm kategorileri getirme testi"""
        categories = ScoringConfig.get_all_categories()
        self.assertIn("autonomous", categories)
        self.assertIn("teleop", categories)
        self.assertIn("penalties", categories)


if __name__ == "__main__":
    unittest.main()
