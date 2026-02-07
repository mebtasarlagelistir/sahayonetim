"""
Final Maçları Bracket Konfigürasyon Modülü

Bracket formatı ve eşleştirme mantığı bu modülde tanımlanır.
BracketGenerator bu config'i kullanır; değişiklik için bu dosya güncellenir.

Modülerlik:
- Yeni bracket formatı eklemek: BRACKET_FORMATS'a ekleyip BracketGenerator'da
  ilgili _generate_* metodunu yazmak yeterli
- Eşleştirme stili (top_vs_bottom vb.) bu modülde dokümante edilir
"""

from typing import Any, Dict

# Desteklenen bracket formatları
SINGLE_ELIMINATION = "single_elimination"

# Varsayılan format (BracketGenerator BRACKET_FORMAT olarak kullanır)
DEFAULT_BRACKET_FORMAT = SINGLE_ELIMINATION

# Eşleştirme açıklaması (dokümantasyon ve ileride alternatif stiller için)
# single_elimination: İttifak içi eşleşme üst sıra vs alt sıra (tek eleme + 3.lük)
#   İttifaklar: [1, 16], [2, 15], [3, 14], [4, 13], ...
#   Çeyrek Final: A:[1,16] vs [2,15], B:[3,14] vs [4,13], C:[5,12] vs [6,11], D:[7,10] vs [8,9]
#   Yarı Final: A/B kazananı vs C/D kazananı (placeholder)
#   3.lük: Yarı final kaybedenleri (placeholder)
#   Final: Yarı final kazananları (placeholder)
PAIRING_STYLE = "top_vs_bottom"


def get_bracket_format() -> str:
    """Varsayılan bracket formatını döner."""
    return DEFAULT_BRACKET_FORMAT
