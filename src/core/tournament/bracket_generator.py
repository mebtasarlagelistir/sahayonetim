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

from .bracket_config import get_bracket_format, SINGLE_ELIMINATION, DOUBLE_ELIMINATION_6


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
            Dengeli (serpentine) ittifaklar + standart seeding ile (8 takım örneği):
              İttifaklar: (1,8), (2,7), (3,6), (4,5)
              Eşleştirme: en iyi ittifak en zayıfla → A=(1,8)v(4,5), B=(2,7)v(3,6)
            [
                {
                    "red_alliance": ["202501", "202508"],
                    "blue_alliance": ["202504", "202505"],
                    "match_number": 1
                },
                {
                    "red_alliance": ["202502", "202507"],
                    "blue_alliance": ["202503", "202506"],
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

        # Çeyrek Final (round 1) — STANDART SEEDING: en iyi ittifak en zayıfla eşleşir.
        # İttifaklar zaten dengeli (serpentine): alliances[0]=(seed1+son), alliances[1]=(seed2+...)
        # Eşleştirme: A = ittifak[0] vs ittifak[n-1], B = ittifak[1] vs ittifak[n-2], ...
        # Böylece 4 ittifakta A=(1,8)vs(4,5), B=(2,7)vs(3,6) gibi adil bir bracket oluşur.
        round1_matches = []
        match_number = 1
        num_alliances = len(alliances)
        num_round1 = num_alliances // 2
        for i in range(num_round1):
            label = chr(65 + i)  # A, B, C, D...
            round1_matches.append({
                "match_number": match_number,
                "round": "quarterfinal",
                "label": label,
                "red_alliance": alliances[i],                      # üst seed ittifakı
                "blue_alliance": alliances[num_alliances - 1 - i],  # karşı uçtaki alt seed ittifakı
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
    
    def generate_double_elimination_6(
        self,
        alliances: List[List[str]],
    ) -> List[Dict[str, Any]]:
        """
        6 ittifak için çift eleme (double elimination) bracket'ı üretir.

        FRC Figure 13-5 (6-ALLIANCE) ile birebir (seed: alliances[0]=1. sıra ... [5]=6. sıra):

            ÜST KADEME (Winners)          ALT KADEME (Losers)
             M1: A4 vs A5                  M5: L(M3) vs L(M2)
             M2: A3 vs A6                  M6: L(M4) vs L(M1)
             M3: A1 vs W(M1)               M8: W(M6) vs W(M5)
             M4: A2 vs W(M2)               M9: L(M7) vs W(M8)  -> Alt şampiyonu
             M7: W(M3) vs W(M4) -> Üst şampiyonu
            BÜYÜK FINAL
             M10: Üst şampiyonu (kırmızı) vs Alt şampiyonu (mavi)
             M11: yalnızca alt şampiyonu M10'u kazanırsa rövanş (bracket reset)

        Her maç, sonuç ilerletmesi için yönlendirme bilgisi taşır:
            win_to / lose_to = "<label>:<slot>"  (slot: red|blue)
        M10 için gf="1" ve reset_to="M11" (alt şampiyonu kazanırsa M11 doldurulur).

        Args:
            alliances: 6 ittifak; her biri 2 takım numarası içeren liste.
                       Sıra önemlidir (seed sırası).

        Returns:
            Round grupları listesi (single elim ile aynı yapı):
            [{"name": "Üst Kademe", "matches": [...]}, ...]

        Raises:
            ValueError: İttifak sayısı 6 değilse.
        """
        if not alliances or len(alliances) != 6:
            raise ValueError("Çift eleme için tam olarak 6 ittifak gereklidir")
        a = [list(alli) for alli in alliances]  # a[0]=seed1 ... a[5]=seed6

        empty: List[str] = []
        # (label, round_key, round_name, red, blue, win_to, lose_to, extra)
        spec = [
            ("M1", "upper", "Üst Kademe", a[3], a[4], "M3:blue", "M6:blue", {}),
            ("M2", "upper", "Üst Kademe", a[2], a[5], "M4:blue", "M5:blue", {}),
            ("M3", "upper", "Üst Kademe", a[0], empty, "M7:red", "M5:red", {}),
            ("M4", "upper", "Üst Kademe", a[1], empty, "M7:blue", "M6:red", {}),
            ("M7", "upper", "Üst Kademe", empty, empty, "M10:red", "M9:red", {}),
            ("M5", "lower", "Alt Kademe", empty, empty, "M8:blue", None, {}),
            ("M6", "lower", "Alt Kademe", empty, empty, "M8:red", None, {}),
            ("M8", "lower", "Alt Kademe", empty, empty, "M9:blue", None, {}),
            # M9 kaybedeni turnuva 3.sü olur (ayrı maç yok)
            ("M9", "lower", "Alt Kademe", empty, empty, "M10:blue", None, {}),
            ("M10", "final", "Büyük Final", empty, empty, None, None, {"gf": "1", "reset_to": "M11"}),
            ("M11", "final", "Büyük Final", empty, empty, None, None, {"gf": "reset"}),
        ]

        matches_by_round: Dict[str, List[Dict[str, Any]]] = {}
        round_order = ["upper", "lower", "final"]
        round_names = {"upper": "Üst Kademe", "lower": "Alt Kademe", "final": "Büyük Final"}

        for label, round_key, _round_name, red, blue, win_to, lose_to, extra in spec:
            match_number = int(label[1:])  # "M7" -> 7 (oynanış sırası)
            match = {
                "match_number": match_number,
                "round": round_key,
                "label": label,
                "red_alliance": list(red),
                "blue_alliance": list(blue),
            }
            if win_to:
                match["win_to"] = win_to
            if lose_to:
                match["lose_to"] = lose_to
            match.update(extra)
            matches_by_round.setdefault(round_key, []).append(match)

        rounds = []
        for round_key in round_order:
            matches = sorted(
                matches_by_round.get(round_key, []),
                key=lambda m: m["match_number"],
            )
            if matches:
                rounds.append({"name": round_names[round_key], "matches": matches})
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
