"""
Final Maçları Bracket Generator Modülü

Bu modül SP puanlarına göre final maçları için bracket (turnuva ağacı) oluşturur.

Modüler yapı:
- Bracket formatı bracket_config.py içinde tanımlı; değişiklik için orayı güncelleyin
- Yeni format eklemek: config'e ekleyip _generate_* metodu yazılır
- Storage katmanından bağımsızdır (sadece sıralama verilerini alır)

Kullanım:
    from src.core.tournament.bracket_generator import BracketGenerator

    generator = BracketGenerator()
    matches = generator.generate_final_matches(rankings, teams_per_alliance=2)
"""

from typing import List, Dict, Any

from .bracket_config import get_bracket_format, SINGLE_ELIMINATION


class BracketGenerator:
    """
    Final maçları için bracket oluşturucu sınıfı.

    Format bracket_config'den alınır; yeni format eklemek için config ve
    ilgili _generate_* metodu eklenir.
    """

    def __init__(self, bracket_format: str = None):
        self.bracket_format = bracket_format or get_bracket_format()
    
    def generate_final_matches(
        self,
        rankings: List[Dict[str, Any]],
        teams_per_alliance: int = 2,
        max_teams: int = None
    ) -> List[Dict[str, Any]]:
        """
        SP puanlarına göre playoff maçları için bracket oluşturur.
        
        Eşleştirme kuralı (Single Elimination + 3.lük maçı):
        - İttifak içi eşleşme: 1–son, 2–sondan 2, 3–sondan 3...
        - Çeyrek Final: 4 maç (A/B/C/D grupları)
        - Yarı Final: 2 maç
        - Final: 1 maç
        - 3.lük: 1 maç
        
        Örnek (16 takım, 2 takım/ittifak):
        - İttifaklar: [1, 16], [2, 15], [3, 14], [4, 13], [5, 12], [6, 11], [7, 10], [8, 9]
        - Çeyrek: A:[1,16] vs [2,15], B:[3,14] vs [4,13], C:[5,12] vs [6,11], D:[7,10] vs [8,9]
        - Yarı: A/B kazananı vs C/D kazananı (placeholder)
        - 3.lük: Yarı final kaybedenleri (placeholder)
        - Final: Yarı final kazananları (placeholder)
        
        Args:
            rankings: Takım sıralaması listesi (TeamRankingsCalculator'dan)
                [
                    {"team": "202501", "rank": 1, "total_sp": 15, ...},
                    {"team": "202502", "rank": 2, "total_sp": 14, ...},
                    ...
                ]
            teams_per_alliance: İttifak başına takım sayısı (varsayılan: 2)
            max_teams: Maksimum takım sayısı (None ise tüm takımlar kullanılır)
        
        Returns:
            List[Dict]: Final maçları listesi
            [
                {
                    "red_alliance": ["202501", "202502"],
                    "blue_alliance": ["202508", "202507"],
                    "match_number": 1
                },
                {
                    "red_alliance": ["202503", "202504"],
                    "blue_alliance": ["202506", "202505"],
                    "match_number": 2
                },
                ...
            ]
        """
        if not rankings:
            return []
        
        # Maksimum takım sayısını belirle
        if max_teams is not None:
            rankings = rankings[:max_teams]
        
        # Takım sayısını kontrol et
        total_teams = len(rankings)
        teams_per_match = teams_per_alliance * 2  # Her maçta toplam takım sayısı
        
        if total_teams < teams_per_match:
            # Yeterli takım yoksa boş liste döndür
            return []
        
        # Bracket formatına göre maçları oluştur (config: bracket_config.py)
        if self.bracket_format == SINGLE_ELIMINATION:
            rounds = self.generate_playoff_rounds(
                rankings, teams_per_alliance, max_teams=max_teams
            )
            return [m for r in rounds for m in r.get("matches", [])]
        raise ValueError(f"Desteklenmeyen bracket formatı: {self.bracket_format}")

    def generate_playoff_rounds(
        self,
        rankings: List[Dict[str, Any]],
        teams_per_alliance: int = 2,
        max_teams: int = None
    ) -> List[Dict[str, Any]]:
        """
        Playoff round'larını (Çeyrek/Yarı/Final/3.lük) döndürür.
        
        Returns:
            [
                {
                    "name": "Çeyrek Final",
                    "matches": [{...}, ...]
                },
                ...
            ]
        """
        if not rankings:
            return []
        # Rank alanı varsa mutlaka sıralı olsun (kaynak listesi karışık gelebilir)
        rankings = sorted(
            rankings,
            key=lambda item: (item.get("rank") is None, item.get("rank", 0))
        )
        if max_teams is not None:
            rankings = rankings[:max_teams]
        
        total_teams = len(rankings)
        teams_per_match = teams_per_alliance * 2
        if total_teams < teams_per_match:
            return []

        # İttifakları sırala: 1-son, 2-sondan 2...
        paired_order = []
        left = 0
        right = total_teams - 1
        while left <= right:
            if left == right:
                paired_order.append(rankings[left]["team"])
            else:
                paired_order.append(rankings[left]["team"])
                paired_order.append(rankings[right]["team"])
            left += 1
            right -= 1

        alliances = []
        for i in range(0, len(paired_order), teams_per_alliance):
            alliance = paired_order[i:i + teams_per_alliance]
            if len(alliance) < teams_per_alliance:
                break
            alliances.append(alliance)

        # Çeyrek Final (round 1)
        round1_matches = []
        match_number = 1
        for i in range(0, len(alliances), 2):
            if i + 1 >= len(alliances):
                break
            label = chr(65 + (i // 2))  # A, B, C, D...
            round1_matches.append({
                "match_number": match_number,
                "round": "quarterfinal",
                "label": label,
                "red_alliance": alliances[i],
                "blue_alliance": alliances[i + 1],
            })
            match_number += 1

        if not round1_matches:
            return []

        rounds = [
            {"name": "Çeyrek Final", "matches": round1_matches},
        ]

        # Yarı Final (round 2) - placeholder
        semifinal_count = len(round1_matches) // 2
        if semifinal_count > 0:
            semifinal_matches = []
            for i in range(semifinal_count):
                semifinal_matches.append({
                    "match_number": match_number,
                    "round": "semifinal",
                    "label": f"YF-{i + 1}",
                    "red_alliance": [],
                    "blue_alliance": [],
                })
                match_number += 1
            rounds.append({"name": "Yarı Final", "matches": semifinal_matches})

        # 3.lük ve Final sadece 2 yarı final varsa anlamlı
        if semifinal_count >= 2:
            third_place = [{
                "match_number": match_number,
                "round": "third_place",
                "label": "Üçüncülük",
                "red_alliance": [],
                "blue_alliance": [],
            }]
            match_number += 1
            final_match = [{
                "match_number": match_number,
                "round": "final",
                "label": "Final",
                "red_alliance": [],
                "blue_alliance": [],
            }]
            rounds.append({"name": "Üçüncülük Maçı", "matches": third_place})
            rounds.append({"name": "Büyük Final", "matches": final_match})

        return rounds
    
    def _generate_single_elimination_bracket(
        self,
        rankings: List[Dict[str, Any]],
        teams_per_alliance: int
    ) -> List[Dict[str, Any]]:
        """
        Single elimination (tek eleme) bracket oluşturur.
        
        Eşleştirme: İttifak içi eşleşme üst sıra vs alt sıra şeklindedir.
        
        Args:
            rankings: Takım sıralaması listesi (rank 1 = en yüksek SP)
            teams_per_alliance: İttifak başına takım sayısı
        
        Returns:
            List[Dict]: Final maçları listesi
        """
        # Tek eleme için temel mantık generate_playoff_rounds içine taşındı.
        rounds = self.generate_playoff_rounds(rankings, teams_per_alliance)
        return [m for r in rounds for m in r.get("matches", [])]
    
    def get_bracket_info(
        self,
        rankings: List[Dict[str, Any]],
        teams_per_alliance: int = 2
    ) -> Dict[str, Any]:
        """
        Bracket bilgilerini döndürür (kaç maç oluşturulacak, hangi takımlar vb.).
        
        Args:
            rankings: Takım sıralaması listesi
            teams_per_alliance: İttifak başına takım sayısı
        
        Returns:
            Dict: Bracket bilgileri
            {
                "total_teams": int,
                "teams_per_match": int,
                "num_matches": int,
                "format": str
            }
        """
        total_teams = len(rankings)
        teams_per_match = teams_per_alliance * 2
        num_matches = total_teams // teams_per_match if total_teams >= teams_per_match else 0
        
        return {
            "total_teams": total_teams,
            "teams_per_alliance": teams_per_alliance,
            "teams_per_match": teams_per_match,
            "num_matches": num_matches,
            "format": self.bracket_format,
            "rounds": [
                {"name": "Çeyrek Final", "match_count": max(0, num_matches)},
                {"name": "Yarı Final", "match_count": max(0, num_matches // 2)},
                {"name": "Üçüncülük Maçı", "match_count": 1 if num_matches >= 2 else 0},
                {"name": "Büyük Final", "match_count": 1 if num_matches >= 2 else 0},
            ],
        }
