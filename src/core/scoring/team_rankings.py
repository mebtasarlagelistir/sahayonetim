"""
Takım Sıralaması Hesaplama Modülü

Bu modül sıralama maçlarından sonra takımların toplam SP (Sıralama Puanı) 
puanlarını hesaplar ve sıralar.

Modüler yapı:
- SP toplama işlemi bu modülde yapılır
- Tie-breaker kuralları bu modülde tanımlıdır
- Farklı sıralama sistemleri için kolayca genişletilebilir
- Storage katmanından bağımsızdır (sadece maç verilerini alır)

Kullanım:
    from src.core.scoring.team_rankings import TeamRankingsCalculator
    
    calculator = TeamRankingsCalculator()
    rankings = calculator.calculate_team_rankings(qualification_matches)
    # Returns: [{"team": "202501", "total_sp": 15, "rank": 1, ...}, ...]
"""

from typing import Dict, List, Any
from collections import defaultdict


class TeamRankingsCalculator:
    """
    Takım sıralaması hesaplayıcı sınıfı.
    
    Bu sınıf sıralama maçlarından (qualification) sonra takımların 
    toplam SP puanlarını hesaplar ve sıralar.
    
    Modüler yapı: 
    - SP toplama mantığı bu sınıfta
    - Tie-breaker kuralları bu sınıfta tanımlı
    - Storage katmanından bağımsız (sadece maç verilerini alır)
    """
    
    # Tie-breaker kuralları (sıralama önceliği)
    # Daha yüksek değer = daha iyi sıralama
    TIE_BREAKER_RULES = {
        "total_sp": 1000,      # Toplam SP puanı (en önemli)
        "wins": 100,           # Galibiyet sayısı
        "ties": 10,            # Beraberlik sayısı
        "matches_played": 1,   # Oynanan maç sayısı (daha fazla maç = daha iyi)
    }
    
    def calculate_team_rankings(
        self,
        qualification_matches: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Sıralama maçlarından takımların toplam SP puanlarını hesaplar ve sıralar.
        
        Args:
            qualification_matches: Tamamlanmış sıralama maçları listesi
                Her maç şu formatta olmalı:
                {
                    "id": int,
                    "match_number": int,
                    "red_alliance": List[str],
                    "blue_alliance": List[str],
                    "scoring_data": {
                        "ranking_points": {
                            "red": {"total": int, ...},
                            "blue": {"total": int, ...}
                        }
                    }
                }
        
        Returns:
            List[Dict]: Takım sıralaması listesi (SP'ye göre sıralı)
            [
                {
                    "team": str,              # Takım numarası
                    "total_sp": int,          # Toplam SP puanı
                    "rank": int,              # Sıralama (1, 2, 3, ...)
                    "wins": int,             # Galibiyet sayısı
                    "ties": int,              # Beraberlik sayısı
                    "losses": int,            # Mağlubiyet sayısı
                    "matches_played": int,     # Oynanan maç sayısı
                    "ranking_points_detail": { # SP detayları
                        "result": int,        # Maç sonucu SP'leri toplamı
                        "climb": int,         # Kemere yükselme SP'leri toplamı
                        "auto": int           # Otonom 4 küre SP'leri toplamı
                    }
                },
                ...
            ]
        """
        # Takım istatistiklerini topla
        team_stats = self._collect_team_stats(qualification_matches)
        
        # Takımları sırala (SP'ye göre, tie-breaker kuralları ile)
        ranked_teams = self._rank_teams(team_stats)
        
        return ranked_teams
    
    def _collect_team_stats(
        self,
        qualification_matches: List[Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Takım istatistiklerini toplar.
        
        Args:
            qualification_matches: Sıralama maçları listesi
        
        Returns:
            Dict: Takım bazlı istatistikler
            {
                "202501": {
                    "total_sp": int,
                    "wins": int,
                    "ties": int,
                    "losses": int,
                    "matches_played": int,
                    "ranking_points_detail": {
                        "result": int,
                        "climb": int,
                        "auto": int
                    }
                },
                ...
            }
        """
        team_stats = defaultdict(lambda: {
            "total_sp": 0,
            "wins": 0,
            "ties": 0,
            "losses": 0,
            "matches_played": 0,
            "ranking_points_detail": {
                "result": 0,
                "climb": 0,
                "auto": 0
            }
        })
        
        for match in qualification_matches:
            # Sadece tamamlanmış maçları say
            if match.get("status") != "completed":
                continue
            
            scoring_data = match.get("scoring_data", {})
            ranking_points = scoring_data.get("ranking_points", {})
            
            # Ranking points yoksa bu maçı atla
            if not ranking_points:
                continue
            
            red_alliance = match.get("red_alliance", [])
            blue_alliance = match.get("blue_alliance", [])
            red_score = match.get("red_score", 0) or 0
            blue_score = match.get("blue_score", 0) or 0
            
            # Kırmızı ittifak takımları için
            red_rp = ranking_points.get("red", {})
            red_total_sp = red_rp.get("total", 0)
            
            for team in red_alliance:
                team_stats[team]["total_sp"] += red_total_sp
                team_stats[team]["matches_played"] += 1
                
                # SP detaylarını topla
                team_stats[team]["ranking_points_detail"]["result"] += red_rp.get("result", 0)
                team_stats[team]["ranking_points_detail"]["climb"] += red_rp.get("climb", 0)
                team_stats[team]["ranking_points_detail"]["auto"] += red_rp.get("auto", 0)
                
                # Maç sonucu istatistikleri
                if red_score > blue_score:
                    team_stats[team]["wins"] += 1
                elif red_score == blue_score and red_score > 0:
                    team_stats[team]["ties"] += 1
                elif blue_score > red_score:
                    team_stats[team]["losses"] += 1
            
            # Mavi ittifak takımları için
            blue_rp = ranking_points.get("blue", {})
            blue_total_sp = blue_rp.get("total", 0)
            
            for team in blue_alliance:
                team_stats[team]["total_sp"] += blue_total_sp
                team_stats[team]["matches_played"] += 1
                
                # SP detaylarını topla
                team_stats[team]["ranking_points_detail"]["result"] += blue_rp.get("result", 0)
                team_stats[team]["ranking_points_detail"]["climb"] += blue_rp.get("climb", 0)
                team_stats[team]["ranking_points_detail"]["auto"] += blue_rp.get("auto", 0)
                
                # Maç sonucu istatistikleri
                if blue_score > red_score:
                    team_stats[team]["wins"] += 1
                elif red_score == blue_score and red_score > 0:
                    team_stats[team]["ties"] += 1
                elif red_score > blue_score:
                    team_stats[team]["losses"] += 1
        
        return dict(team_stats)
    
    def _rank_teams(
        self,
        team_stats: Dict[str, Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Takımları SP puanına göre sıralar (tie-breaker kuralları ile).
        
        Args:
            team_stats: Takım istatistikleri dict'i
        
        Returns:
            List[Dict]: Sıralı takım listesi (rank alanı ile)
        """
        # Takımları sıralama skoruna göre sırala
        ranked_list = []
        
        for team, stats in team_stats.items():
            # Sıralama skoru hesapla (tie-breaker kuralları ile)
            ranking_score = self._calculate_ranking_score(stats)
            
            ranked_list.append({
                "team": team,
                "total_sp": stats["total_sp"],
                "wins": stats["wins"],
                "ties": stats["ties"],
                "losses": stats["losses"],
                "matches_played": stats["matches_played"],
                "ranking_points_detail": stats["ranking_points_detail"],
                "_ranking_score": ranking_score  # Geçici, sıralama için
            })
        
        # Sıralama skoruna göre sırala (yüksekten düşüğe)
        ranked_list.sort(key=lambda x: x["_ranking_score"], reverse=True)
        
        # Rank ekle ve geçici alanı kaldır
        for i, team_data in enumerate(ranked_list, start=1):
            team_data["rank"] = i
            del team_data["_ranking_score"]
        
        return ranked_list
    
    def _calculate_ranking_score(self, stats: Dict[str, Any]) -> float:
        """
        Tie-breaker kurallarına göre sıralama skoru hesaplar.
        
        Args:
            stats: Takım istatistikleri
        
        Returns:
            float: Sıralama skoru (daha yüksek = daha iyi sıralama)
        """
        score = 0.0
        
        # Toplam SP puanı (en önemli)
        score += stats["total_sp"] * self.TIE_BREAKER_RULES["total_sp"]
        
        # Galibiyet sayısı
        score += stats["wins"] * self.TIE_BREAKER_RULES["wins"]
        
        # Beraberlik sayısı
        score += stats["ties"] * self.TIE_BREAKER_RULES["ties"]
        
        # Oynanan maç sayısı (daha fazla maç = daha iyi)
        score += stats["matches_played"] * self.TIE_BREAKER_RULES["matches_played"]
        
        return score
