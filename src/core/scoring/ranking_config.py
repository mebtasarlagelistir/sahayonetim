"""
Sıralama Puanları (SP) Konfigürasyon Modülü

SP hesaplama kuralları bu modülde tanımlanır. Oyun puanlama kurallarından
(config.py) bağımsızdır; sadece sıralama/ranking için kullanılır.

Modülerlik:
- SP değerlerini veya eşikleri değiştirmek için sadece bu dosya güncellenir
- Farklı etkinlik/lig kuralları için bu sınıf genişletilebilir veya
  alternatif config yüklenebilir
"""

from typing import Dict, Any


class RankingPointsConfig:
    """
    Sıralama Puanları (SP) kuralları.

    Kullanım: RankingPointsCalculator bu config'i kullanır;
    kuralları değiştirmek için bu sınıfı güncellemek yeterlidir.
    """

    # SP puan değerleri (maç sonucu ve bonuslar)
    SP_RULES = {
        "win": 2,           # Galibiyet (her ittifak takımına)
        "tie": 1,           # Beraberlik (her ittifak takımına)
        "climb_both": 2,    # Kemere yükselme – 2 robot (ittifak başına)
        "auto_4_balls": 2,  # Otonom 4 küre (ittifak başına)
    }

    # Eşikler (SP bonusu için minimum değerler)
    THRESHOLDS = {
        "climb_robots_min": 2,   # En az kaç robot kemere yükselirse climb SP verilir
        "auto_balls_min": 4,     # Otonomda en az kaç küre (kendi rengine) için auto SP verilir
    }

    # Otonom küre sayısı hesaplamasında kullanılan alanlar (scoring_data ile uyumlu)
    AUTO_BALL_FIELDS = [
        "auto_bent1_own",
        "auto_bent2_correct",
        "auto_bent3_correct",
        "auto_tank_own",
    ]

    @classmethod
    def get_sp_rule(cls, key: str) -> Any:
        """SP kural değerini döner."""
        return cls.SP_RULES.get(key)

    @classmethod
    def get_threshold(cls, key: str) -> Any:
        """Eşik değerini döner."""
        return cls.THRESHOLDS.get(key)
