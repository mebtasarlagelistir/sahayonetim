"""
Puanlama Hesaplama Modülü

Bu modül puanlama verilerini alır ve toplam skorları hesaplar.
Modüler yapı sayesinde puanlama kuralları kolayca güncellenebilir.
"""

from typing import Dict, Optional
from .config import ScoringConfig


class ScoreCalculator:
    """
    Puanlama hesaplama sınıfı.
    
    Modüler yapı: Puanlama kuralları ScoringConfig'den alınır,
    bu sayede kuralları değiştirmek için sadece config dosyasını
    güncellemek yeterlidir.
    """
    
    def __init__(self, config: Optional[ScoringConfig] = None):
        """
        Args:
            config: Puanlama konfigürasyonu (varsayılan: ScoringConfig)
        """
        self.config = config or ScoringConfig()
    
    def calculate_alliance_score(
        self,
        alliance: str,
        scoring_data: Dict,
        opponent_scoring_data: Optional[Dict] = None
    ) -> Dict:
        """
        Bir ittifakın toplam skorunu hesaplar.
        
        Args:
            alliance: "red" veya "blue"
            scoring_data: Bu ittifakın puanlama verileri
            opponent_scoring_data: Rakip ittifakın puanlama verileri (cezalar için)
        
        Returns:
            Dict: {
                "autonomous_total": int,
                "teleop_total": int,
                "penalty_total": int,
                "received_from_penalties": int,
                "received_from_opponent_actions": int,
                "total_score": int,
                "breakdown": {...}
            }
        """
        if opponent_scoring_data is None:
            opponent_scoring_data = {}
        
        # OTONOM (OKS) hesaplamaları
        auto_breakdown = self._calculate_autonomous(scoring_data)
        auto_total = sum(auto_breakdown.values())
        
        # SÜRÜCÜ KONTROLLÜ (SKS) hesaplamaları
        teleop_breakdown = self._calculate_teleop(scoring_data)
        teleop_total = sum(teleop_breakdown.values())
        
        # CEZALAR (bu ittifakın verdiği cezalar - rakibe gider)
        penalty_breakdown = self._calculate_penalties_given(scoring_data)
        penalty_total = sum(penalty_breakdown.values())
        
        # Rakip cezalarından gelen puanlar (bu ittifaka eklenir)
        received_from_penalties = self._calculate_penalties_received(opponent_scoring_data)
        
        # Rakip ittifakın bu ittifakın alanına verdiği puanlar
        received_from_opponent = self._calculate_opponent_actions(
            opponent_scoring_data,
            alliance
        )
        
        # Toplam skor
        total_score = (
            auto_total +
            teleop_total +
            received_from_penalties +
            received_from_opponent
        )
        
        return {
            "autonomous_total": auto_total,
            "teleop_total": teleop_total,
            "penalty_total": penalty_total,
            "received_from_penalties": received_from_penalties,
            "received_from_opponent_actions": received_from_opponent,
            "total_score": total_score,
            "breakdown": {
                "autonomous": auto_breakdown,
                "teleop": teleop_breakdown,
                "penalties": penalty_breakdown
            }
        }
    
    def _calculate_autonomous(self, data: Dict) -> Dict:
        """Otonom puanlama hesaplar."""
        breakdown = {}
        
        # Başlangıç alanını terk etme
        rule = self.config.get_autonomous_rule("leave_start_area")
        if rule:
            r1 = data.get("auto_leave_r1", False)
            r2 = data.get("auto_leave_r2", False)
            points = (int(r1) + int(r2)) * rule["points_per_robot"]
            breakdown["leave_start_area"] = points
        
        # Bent Seviye 1
        rule = self.config.get_autonomous_rule("bent_level_1")
        if rule:
            own = data.get("auto_bent1_own", 0) * rule["points_per_ball"]
            breakdown["bent_level_1"] = own
        
        # Bent Seviye 2
        rule = self.config.get_autonomous_rule("bent_level_2")
        if rule:
            correct = data.get("auto_bent2_correct", 0) * rule["correct_color_number"]["points"]
            wrong = data.get("auto_bent2_wrong", 0) * rule["wrong_number"]["points"]
            breakdown["bent_level_2"] = correct + wrong
        
        # Bent Seviye 3
        rule = self.config.get_autonomous_rule("bent_level_3")
        if rule:
            correct = data.get("auto_bent3_correct", 0) * rule["correct_color_number"]["points"]
            wrong = data.get("auto_bent3_wrong", 0) * rule["wrong_number"]["points"]
            breakdown["bent_level_3"] = correct + wrong
        
        # Sarnıçlar
        rule = self.config.get_autonomous_rule("tanks")
        if rule:
            own = data.get("auto_tank_own", 0) * rule["points_per_ball"]
            breakdown["tanks"] = own
        
        return breakdown
    
    def _calculate_teleop(self, data: Dict) -> Dict:
        """Sürücü kontrollü puanlama hesaplar."""
        breakdown = {}
        
        # Bent Seviye 1
        rule = self.config.get_teleop_rule("bent_level_1")
        if rule:
            own = data.get("teleop_bent1_own", 0) * rule["points_per_ball"]
            breakdown["bent_level_1"] = own
        
        # Bent Seviye 2
        rule = self.config.get_teleop_rule("bent_level_2")
        if rule:
            correct = data.get("teleop_bent2_correct", 0) * rule["correct_color_number"]["points"]
            wrong = data.get("teleop_bent2_wrong", 0) * rule["wrong_number"]["points"]
            breakdown["bent_level_2"] = correct + wrong
        
        # Bent Seviye 3
        rule = self.config.get_teleop_rule("bent_level_3")
        if rule:
            correct = data.get("teleop_bent3_correct", 0) * rule["correct_color_number"]["points"]
            wrong = data.get("teleop_bent3_wrong", 0) * rule["wrong_number"]["points"]
            breakdown["bent_level_3"] = correct + wrong
        
        # Sarnıçlar
        rule = self.config.get_teleop_rule("tanks")
        if rule:
            own = data.get("teleop_tank_own", 0) * rule["points_per_ball"]
            breakdown["tanks"] = own
        
        # Kaynaktan giriş
        rule = self.config.get_teleop_rule("source_entry")
        if rule:
            entry = data.get("teleop_source_entry", 0) * rule["points_per_entry"]
            breakdown["source_entry"] = entry
        
        # Tırmanma
        rule = self.config.get_teleop_rule("climb")
        if rule:
            climb = data.get("teleop_climb", 0) * rule["points_per_robot"]
            breakdown["climb"] = climb
        
        return breakdown
    
    def _calculate_penalties_given(self, data: Dict) -> Dict:
        """Bu ittifakın verdiği cezaları hesaplar (rakibe gider)."""
        breakdown = {}
        
        # Sarı kart
        rule = self.config.get_penalty_rule("yellow_card")
        if rule:
            count = data.get("yellow_card", 0)
            points = count * rule["points_to_opponent"]
            breakdown["yellow_card"] = points
        
        # Major penalty
        rule = self.config.get_penalty_rule("major_penalty")
        if rule:
            count = data.get("major_penalty", 0)
            points = count * rule["points_to_opponent"]
            breakdown["major_penalty"] = points
        
        return breakdown
    
    def _calculate_penalties_received(self, opponent_data: Dict) -> int:
        """Rakip ittifakın cezalarından gelen puanları hesaplar."""
        total = 0
        
        # Sarı kart
        rule = self.config.get_penalty_rule("yellow_card")
        if rule:
            count = opponent_data.get("yellow_card", 0)
            total += count * rule["points_to_opponent"]
        
        # Major penalty
        rule = self.config.get_penalty_rule("major_penalty")
        if rule:
            count = opponent_data.get("major_penalty", 0)
            total += count * rule["points_to_opponent"]
        
        return total
    
    def _calculate_opponent_actions(
        self,
        opponent_data: Dict,
        alliance: str
    ) -> int:
        """
        Rakip ittifakın bu ittifakın alanına verdiği puanları hesaplar.
        
        Örnek: Kırmızı takım mavi bentine küre bırakırsa,
        mavi takıma puan eklenir.
        """
        total = 0
        
        # Otonom - rakip alana verilen
        auto_rules = self.config.AUTONOMOUS_RULES
        if "bent_level_1" in auto_rules:
            total += opponent_data.get("auto_bent1_opponent", 0) * auto_rules["bent_level_1"]["points_per_ball"]
        
        if "bent_level_2" in auto_rules:
            # Rakip alana verilen doğru renk/numara
            total += opponent_data.get("auto_bent2_opponent", 0) * auto_rules["bent_level_2"]["correct_color_number"]["points"]
        
        if "bent_level_3" in auto_rules:
            total += opponent_data.get("auto_bent3_opponent", 0) * auto_rules["bent_level_3"]["correct_color_number"]["points"]
        
        if "tanks" in auto_rules:
            total += opponent_data.get("auto_tank_opponent", 0) * auto_rules["tanks"]["points_per_ball"]
        
        # Teleop - rakip alana verilen
        teleop_rules = self.config.TELEOP_RULES
        if "bent_level_1" in teleop_rules:
            total += opponent_data.get("teleop_bent1_opponent", 0) * teleop_rules["bent_level_1"]["points_per_ball"]
        
        if "bent_level_2" in teleop_rules:
            total += opponent_data.get("teleop_bent2_opponent", 0) * teleop_rules["bent_level_2"]["correct_color_number"]["points"]
        
        if "bent_level_3" in teleop_rules:
            total += opponent_data.get("teleop_bent3_opponent", 0) * teleop_rules["bent_level_3"]["correct_color_number"]["points"]
        
        if "tanks" in teleop_rules:
            total += opponent_data.get("teleop_tank_opponent", 0) * teleop_rules["tanks"]["points_per_ball"]
        
        return total
