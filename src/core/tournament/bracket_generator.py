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
        SP puanlarına göre final maçları için bracket oluşturur.
        
        Eşleştirme kuralı (Single Elimination):
        - 1. sıradaki takım ile son sıradaki takım
        - 2. sıradaki takım ile sondan 2. takım
        - ... (ortadan eşleştirme)
        
        Örnek (8 takım, 2 takım/ittifak):
        - Maç 1: [1, 2] vs [8, 7]
        - Maç 2: [3, 4] vs [6, 5]
        
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
            return self._generate_single_elimination_bracket(
                rankings, teams_per_alliance
            )
        raise ValueError(f"Desteklenmeyen bracket formatı: {self.bracket_format}")
    
    def _generate_single_elimination_bracket(
        self,
        rankings: List[Dict[str, Any]],
        teams_per_alliance: int
    ) -> List[Dict[str, Any]]:
        """
        Single elimination (tek eleme) bracket oluşturur.
        
        Eşleştirme: En yüksek SP'li takımlar en düşük SP'li takımlarla eşleşir.
        
        Args:
            rankings: Takım sıralaması listesi (rank 1 = en yüksek SP)
            teams_per_alliance: İttifak başına takım sayısı
        
        Returns:
            List[Dict]: Final maçları listesi
        """
        matches = []
        total_teams = len(rankings)
        teams_per_match = teams_per_alliance * 2
        
        # Kaç maç oluşturulacak?
        num_matches = total_teams // teams_per_match
        
        for match_num in range(1, num_matches + 1):
            # Kırmızı ittifak: En yüksek SP'li takımlar
            # Mavi ittifak: En düşük SP'li takımlar
            
            # Kırmızı ittifak için takımları al (baştan)
            red_start = (match_num - 1) * teams_per_alliance
            red_end = red_start + teams_per_alliance
            red_alliance = [
                rankings[i]["team"] 
                for i in range(red_start, min(red_end, total_teams))
            ]
            
            # Mavi ittifak için takımları al (sondan)
            blue_end = total_teams - (match_num - 1) * teams_per_alliance
            blue_start = blue_end - teams_per_alliance
            blue_alliance = [
                rankings[i]["team"] 
                for i in range(max(0, blue_start), blue_end)
            ]
            
            # Eğer yeterli takım yoksa bu maçı atla
            if len(red_alliance) < teams_per_alliance or len(blue_alliance) < teams_per_alliance:
                continue
            
            matches.append({
                "red_alliance": red_alliance,
                "blue_alliance": blue_alliance,
                "match_number": match_num
            })
        
        return matches
    
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
            "format": self.bracket_format
        }
