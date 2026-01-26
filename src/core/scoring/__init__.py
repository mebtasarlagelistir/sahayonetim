"""
Modüler Puanlama Sistemi

Bu modül oyun puanlama kurallarını yönetir ve hesaplamaları yapar.
Kolayca güncellenebilir ve genişletilebilir yapıdadır.
"""

from .calculator import ScoreCalculator
from .config import ScoringConfig
from .ranking_points import RankingPointsCalculator

__all__ = ["ScoreCalculator", "ScoringConfig", "RankingPointsCalculator"]
