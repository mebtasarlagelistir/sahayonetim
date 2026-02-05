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
# single_elimination: En yüksek SP'li takımlar (kırmızı) vs en düşük SP'li (mavi)
#   Maç 1: [1, 2] vs [8, 7]
#   Maç 2: [3, 4] vs [6, 5]
PAIRING_STYLE = "top_vs_bottom"


def get_bracket_format() -> str:
    """Varsayılan bracket formatını döner."""
    return DEFAULT_BRACKET_FORMAT
