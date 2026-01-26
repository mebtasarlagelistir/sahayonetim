"""
Sıralama Puanları (SP) Hesaplama Modülü

Bu modül sıralama maçları için Sıralama Puanlarını (SP) hesaplar.
Deneme maçları SP'ye etki etmez.

SP Kuralları:
- Galibiyet: +2 SP (her ittifak takımına)
- Beraberlik: +1 SP (her ittifak takımına)
- Kemere Yükselme (2 robot): +2 SP (ittifak başına)
- Otonom 4 Küre: +2 SP (ittifak başına)

Modüler yapı: 
- SP kuralları bu modülde tanımlıdır ve kolayca güncellenebilir
- Farklı oyunlar için bu modül genişletilebilir veya yeniden yapılandırılabilir
- Backend'de hesaplanır ve frontend'e gönderilir
"""

from typing import Dict, Optional


class RankingPointsCalculator:
    """
    Sıralama Puanları (SP) hesaplayıcı sınıfı.
    
    Modüler yapı: SP kuralları bu sınıfta tanımlıdır,
    farklı oyunlar için kolayca güncellenebilir.
    """
    
    # SP Kuralları
    SP_RULES = {
        "win": 2,  # Galibiyet
        "tie": 1,  # Beraberlik
        "climb_both": 2,  # Kemere Yükselme (2 robot)
        "auto_4_balls": 2,  # Otonom 4 Küre
    }
    
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
        
        # 1. Maç Sonucu SP'si (Galibiyet/Beraberlik)
        if red_score > blue_score:
            result["red"]["result"] = cls.SP_RULES["win"]
        elif blue_score > red_score:
            result["blue"]["result"] = cls.SP_RULES["win"]
        else:
            # Beraberlik
            result["red"]["result"] = cls.SP_RULES["tie"]
            result["blue"]["result"] = cls.SP_RULES["tie"]
        
        # 2. Kemere Yükselme SP'si (2 robot kemere yükselirse +2 SP)
        # scoring_data'dan teleop_climb bilgisini al
        red_data = scoring_data.get("red", {})
        blue_data = scoring_data.get("blue", {})
        
        # Kırmızı ittifak için kemere yükselme kontrolü
        red_climb_count = red_data.get("teleop_climb", 0)
        if red_climb_count >= 2:
            result["red"]["climb"] = cls.SP_RULES["climb_both"]
        
        # Mavi ittifak için kemere yükselme kontrolü
        blue_climb_count = blue_data.get("teleop_climb", 0)
        if blue_climb_count >= 2:
            result["blue"]["climb"] = cls.SP_RULES["climb_both"]
        
        # 3. Otonom 4 Küre SP'si
        # Otonom dönemde ittifakın kendi renklerine 4 küre bırakması gerekiyor
        # Bent seviye 1, 2, 3 ve sarnıçlara bırakılan toplam küre sayısı
        red_auto_total = cls._calculate_auto_balls(red_data)
        if red_auto_total >= 4:
            result["red"]["auto"] = cls.SP_RULES["auto_4_balls"]
        
        blue_auto_total = cls._calculate_auto_balls(blue_data)
        if blue_auto_total >= 4:
            result["blue"]["auto"] = cls.SP_RULES["auto_4_balls"]
        
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
