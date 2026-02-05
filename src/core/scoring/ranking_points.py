"""
Sıralama Puanları (SP) Hesaplama Modülü

Bu modül sıralama maçları için Sıralama Puanlarını (SP) hesaplar.
Deneme maçları SP'ye etki etmez.

Modüler yapı:
- SP kuralları ranking_config.py içinde tanımlıdır; değişiklik için orayı güncelleyin
- Hesaplama mantığı bu modülde; config'den değerler alınır
- Farklı oyunlar için ranking_config veya alternatif config kullanılabilir
"""

from typing import Dict, Optional

from .ranking_config import RankingPointsConfig


class RankingPointsCalculator:
    """
    Sıralama Puanları (SP) hesaplayıcı sınıfı.

    SP değerleri ve eşikler RankingPointsConfig'den alınır;
    kuralları değiştirmek için sadece ranking_config.py güncellenir.
    """
    
    @classmethod
    def calculate_ranking_points(
        cls,
        match_type: str,
        red_score: int,
        blue_score: int,
        scoring_data: Dict,
        red_alliance: list,
        blue_alliance: list
    ) -> Dict[str, int]:
        """
        Bir maç için Sıralama Puanlarını (SP) hesaplar.
        
        ÖNEMLİ: Deneme maçları (practice) SP'ye etki etmez.
        
        Args:
            match_type: Maç tipi ("qualification", "elimination", "final", "practice")
            red_score: Kırmızı ittifak skoru
            blue_score: Mavi ittifak skoru
            scoring_data: Puanlama verileri (team_statuses, auto, teleop vb. içerir)
            red_alliance: Kırmızı ittifak takım listesi
            blue_alliance: Mavi ittifak takım listesi
        
        Returns:
            Dict: {
                "red": {
                    "result": int,  # Galibiyet/Beraberlik SP'si
                    "climb": int,   # Kemere Yükselme SP'si
                    "auto": int,    # Otonom 4 Küre SP'si
                    "total": int    # Toplam SP
                },
                "blue": {
                    "result": int,
                    "climb": int,
                    "auto": int,
                    "total": int
                }
            }
        """
        # Deneme maçları SP'ye etki etmez
        if match_type == "practice":
            return {
                "red": {"result": 0, "climb": 0, "auto": 0, "total": 0},
                "blue": {"result": 0, "climb": 0, "auto": 0, "total": 0}
            }
        
        result = {
            "red": {"result": 0, "climb": 0, "auto": 0, "total": 0},
            "blue": {"result": 0, "climb": 0, "auto": 0, "total": 0}
        }
        
        # Config'den kurallar ve eşikler (modülerlik: değişiklik ranking_config.py'de)
        sp_rules = RankingPointsConfig.SP_RULES
        climb_min = RankingPointsConfig.get_threshold("climb_robots_min") or 2
        auto_balls_min = RankingPointsConfig.get_threshold("auto_balls_min") or 4

        # 1. Maç Sonucu SP'si (Galibiyet/Beraberlik)
        if red_score > blue_score:
            result["red"]["result"] = sp_rules.get("win", 2)
        elif blue_score > red_score:
            result["blue"]["result"] = sp_rules.get("win", 2)
        else:
            result["red"]["result"] = sp_rules.get("tie", 1)
            result["blue"]["result"] = sp_rules.get("tie", 1)

        # 2. Kemere Yükselme SP'si (eşik: climb_robots_min robot kemere yükselirse)
        red_data = scoring_data.get("red", {})
        blue_data = scoring_data.get("blue", {})

        red_climb_count = red_data.get("teleop_climb", 0)
        if red_climb_count >= climb_min:
            result["red"]["climb"] = sp_rules.get("climb_both", 2)

        blue_climb_count = blue_data.get("teleop_climb", 0)
        if blue_climb_count >= climb_min:
            result["blue"]["climb"] = sp_rules.get("climb_both", 2)

        # 3. Otonom küre SP'si (eşik: auto_balls_min küre – kendi rengine)
        red_auto_total = cls._calculate_auto_balls(red_data)
        if red_auto_total >= auto_balls_min:
            result["red"]["auto"] = sp_rules.get("auto_4_balls", 2)

        blue_auto_total = cls._calculate_auto_balls(blue_data)
        if blue_auto_total >= auto_balls_min:
            result["blue"]["auto"] = sp_rules.get("auto_4_balls", 2)
        
        # Toplam SP hesapla
        result["red"]["total"] = (
            result["red"]["result"] +
            result["red"]["climb"] +
            result["red"]["auto"]
        )
        result["blue"]["total"] = (
            result["blue"]["result"] +
            result["blue"]["climb"] +
            result["blue"]["auto"]
        )
        
        return result
    
    @classmethod
    def _calculate_auto_balls(cls, alliance_data: Dict) -> int:
        """
        Otonom dönemde ittifakın kendi renklerine bıraktığı toplam küre sayısını hesaplar.
        
        Args:
            alliance_data: İttifakın otonom puanlama verileri
        
        Returns:
            int: Toplam küre sayısı (kendi renklerine bırakılan)
        """
        total = 0
        
        # Bent seviye 1 - kendi
        total += alliance_data.get("auto_bent1_own", 0)
        
        # Bent seviye 2 - doğru (kendi renk/numara)
        total += alliance_data.get("auto_bent2_correct", 0)
        
        # Bent seviye 3 - doğru (kendi renk/numara)
        total += alliance_data.get("auto_bent3_correct", 0)
        
        # Sarnıçlar - kendi
        total += alliance_data.get("auto_tank_own", 0)
        
        return total
