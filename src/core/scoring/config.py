"""
Puanlama Konfigürasyon Modülü

Oyun puanlama kurallarını tanımlar. Bu dosya kolayca güncellenebilir
ve farklı oyunlar için yeniden yapılandırılabilir.

Modülerlik: 
- Yeni puanlama kategorileri eklemek veya mevcut kuralları değiştirmek için 
  sadece bu dosyayı güncellemek yeterlidir
- Frontend'deki constants.js (SCORING_CONSTANTS) ile senkronize tutulmalıdır
- Puanlama kuralları değiştiğinde hem backend hem frontend güncellenmelidir

İstanbul ve Su Oyunu Puanlama Kuralları:
- OKS (Otonom): Başlangıç alanını terk (3), Bent 1 (4), Bent 2 doğru (6), 
  Bent 2 yanlış (3), Bent 3 doğru (8), Bent 3 yanlış (4), Sarnıç (7)
- SKS (Sürücü Kontrollü): Bent 1 (2), Bent 2 doğru (4), Bent 2 yanlış (3),
  Bent 3 doğru (6), Bent 3 yanlış (4), Sarnıç (5), Kaynak giriş (2), Tırmanma (25)

Güncel: Tırmanma puanı oyun kılavuzu Rev. 11.05.2026 ile 15 → 25 yapıldı.
"""

from typing import Dict, List, Optional


class ScoringConfig:
    """
    Puanlama konfigürasyon sınıfı.
    
    İstanbul ve Su oyunu için puanlama kurallarını içerir.
    Farklı oyunlar için bu sınıf genişletilebilir veya yeniden yapılandırılabilir.
    """
    
    # OTONOM (OKS) - İlk 30 saniye puanlama kuralları
    AUTONOMOUS_RULES = {
        "leave_start_area": {
            "points_per_robot": 3,
            "description": "Başlangıç Alanını Terk Etme",
            "max_robots": 2
        },
        "bent_level_1": {
            "points_per_ball": 4,
            "description": "Bent Seviye 1",
            "can_opponent": True  # Rakip alana verilebilir
        },
        "bent_level_2": {
            "correct_color_number": {
                "points": 6,
                "description": "Bent Seviye 2 - Doğru Renk/Numara"
            },
            "wrong_number": {
                "points": 3,
                "description": "Bent Seviye 2 - Yanlış Numara"
            },
            "can_opponent": True
        },
        "bent_level_3": {
            "correct_color_number": {
                "points": 8,
                "description": "Bent Seviye 3 - Doğru Renk/Numara"
            },
            "wrong_number": {
                "points": 4,
                "description": "Bent Seviye 3 - Yanlış Numara"
            },
            "can_opponent": True
        },
        "tanks": {
            "points_per_ball": 7,
            "description": "Sarnıçlara Küre Bırakma",
            "can_opponent": True
        }
    }
    
    # SÜRÜCÜ KONTROLLÜ (SKS) - 30. saniyeden sonra puanlama kuralları
    TELEOP_RULES = {
        "bent_level_1": {
            "points_per_ball": 2,
            "description": "Bent Seviye 1",
            "can_opponent": True
        },
        "bent_level_2": {
            "correct_color_number": {
                "points": 4,
                "description": "Bent Seviye 2 - Doğru Renk/Numara"
            },
            "wrong_number": {
                "points": 3,
                "description": "Bent Seviye 2 - Yanlış Numara"
            },
            "can_opponent": True
        },
        "bent_level_3": {
            "correct_color_number": {
                "points": 6,
                "description": "Bent Seviye 3 - Doğru Renk/Numara"
            },
            "wrong_number": {
                "points": 4,
                "description": "Bent Seviye 3 - Yanlış Numara"
            },
            "can_opponent": True
        },
        "tanks": {
            "points_per_ball": 5,
            "description": "Sarnıçlara Küre Bırakma",
            "can_opponent": True
        },
        "source_entry": {
            "points_per_entry": 2,
            "description": "Kaynaktan Rastgele Giriş"
        },
        "climb": {
            "points_per_robot": 25,
            "description": "Su Kemerine Tırmanma",
            "max_robots": 2
        }
    }
    
    # CEZALAR
    PENALTIES = {
        "yellow_card": {
            "points_to_opponent": 2,
            "description": "Sarı Kart"
        },
        "major_penalty": {
            "points_to_opponent": 5,
            "description": "Major Penalty"
        },
        "red_card": {
            "disqualifies": True,
            "description": "Kırmızı Kart (Diskalifiye)"
        }
    }
    
    @classmethod
    def get_autonomous_rule(cls, category: str) -> Optional[Dict]:
        """Otonom puanlama kuralını döner."""
        return cls.AUTONOMOUS_RULES.get(category)
    
    @classmethod
    def get_teleop_rule(cls, category: str) -> Optional[Dict]:
        """Sürücü kontrollü puanlama kuralını döner."""
        return cls.TELEOP_RULES.get(category)
    
    @classmethod
    def get_penalty_rule(cls, penalty_type: str) -> Optional[Dict]:
        """Cezalandırma kuralını döner."""
        return cls.PENALTIES.get(penalty_type)
    
    @classmethod
    def get_all_categories(cls) -> Dict[str, List[str]]:
        """Tüm puanlama kategorilerini döner."""
        return {
            "autonomous": list(cls.AUTONOMOUS_RULES.keys()),
            "teleop": list(cls.TELEOP_RULES.keys()),
            "penalties": list(cls.PENALTIES.keys())
        }

    @classmethod
    def to_frontend_constants(cls) -> Dict[str, int]:
        """
        Frontend'in beklediği düz anahtarlı puan sabitlerini üretir.

        Bu sözlük, eskiden static/js/constants.js içindeki SCORING_CONSTANTS
        bloğunu birebir karşılar. Frontend bu değerleri backend'den
        (/js/scoring_constants.js) alır; böylece puanlar TEK kaynakta
        (bu dosyada) tutulur ve senkron-kayma riski ortadan kalkar.

        Anahtar isimleri değiştirilmemelidir: match_control_scoring.js ve
        referee_panel_scoring.js bu adlara bağımlıdır.

        Returns:
            Dict[str, int]: window.SCORING_CONSTANTS olarak servis edilen sabitler.
        """
        auto = cls.AUTONOMOUS_RULES
        teleop = cls.TELEOP_RULES
        penalties = cls.PENALTIES
        return {
            # Otonom (OKS) Puanları
            "AUTO_LEAVE_POINTS": auto["leave_start_area"]["points_per_robot"],
            "AUTO_BENT1_POINTS": auto["bent_level_1"]["points_per_ball"],
            "AUTO_BENT2_CORRECT_POINTS": auto["bent_level_2"]["correct_color_number"]["points"],
            "AUTO_BENT2_WRONG_POINTS": auto["bent_level_2"]["wrong_number"]["points"],
            "AUTO_BENT3_CORRECT_POINTS": auto["bent_level_3"]["correct_color_number"]["points"],
            "AUTO_BENT3_WRONG_POINTS": auto["bent_level_3"]["wrong_number"]["points"],
            "AUTO_TANK_POINTS": auto["tanks"]["points_per_ball"],
            # Sürücü Kontrollü (SKS) Puanları
            "TELEOP_BENT1_POINTS": teleop["bent_level_1"]["points_per_ball"],
            "TELEOP_BENT2_CORRECT_POINTS": teleop["bent_level_2"]["correct_color_number"]["points"],
            "TELEOP_BENT2_WRONG_POINTS": teleop["bent_level_2"]["wrong_number"]["points"],
            "TELEOP_BENT3_CORRECT_POINTS": teleop["bent_level_3"]["correct_color_number"]["points"],
            "TELEOP_BENT3_WRONG_POINTS": teleop["bent_level_3"]["wrong_number"]["points"],
            "TELEOP_TANK_POINTS": teleop["tanks"]["points_per_ball"],
            "TELEOP_SOURCE_ENTRY_POINTS": teleop["source_entry"]["points_per_entry"],
            "TELEOP_CLIMB_POINTS": teleop["climb"]["points_per_robot"],
            # Ceza Puanları
            "YELLOW_CARD_POINTS_TO_OPPONENT": penalties["yellow_card"]["points_to_opponent"],
            "MAJOR_PENALTY_POINTS_TO_OPPONENT": penalties["major_penalty"]["points_to_opponent"],
        }
