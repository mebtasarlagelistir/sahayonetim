"""
Modüler Puanlama Sistemi

Bu modül oyun puanlama kurallarını yönetir ve hesaplamaları yapar.
Kolayca güncellenebilir ve genişletilebilir yapıdadır.
"""

from .calculator import ScoreCalculator
from .config import ScoringConfig

__all__ = ["ScoreCalculator", "ScoringConfig"]
