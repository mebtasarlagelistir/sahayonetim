"""
Puanlama Konfigürasyon Modülü

Oyun puanlama kurallarını tanımlar. Bu dosya kolayca güncellenebilir
ve farklı oyunlar için yeniden yapılandırılabilir.

Modülerlik: Yeni puanlama kategorileri eklemek veya mevcut kuralları
değiştirmek için sadece bu dosyayı güncellemek yeterlidir.
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
            "points_per_robot": 15,
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
