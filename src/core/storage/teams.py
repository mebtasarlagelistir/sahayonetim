"""
Takım Yönetimi Modülü

Bu modül takım (team) yönetimi için tüm CRUD işlemlerini içerir.
"""

from __future__ import annotations

import sqlite3
from typing import Dict, List


class TeamsStorage:
    """
    Takım yönetimi için storage sınıfı.
    
    Bu sınıf takımlarla ilgili tüm veritabanı işlemlerini yönetir:
    - Takım listeleme, ekleme, güncelleme, silme
    - Etkinlik bazlı takım yönetimi
    """
    
    def get_teams(self) -> List[Dict[str, str]]:
        """
        Aktif etkinliğin takımlarını getirir.
        
        Returns:
            List[Dict]: Takım listesi
            [
                {
                    "number": "2025",
                    "name": "Takım Adı",
                    "school": "Okul Adı",
                    "city": "Şehir",
                    "category": "Kategori"
                },
                ...
            ]
            
        Not: Aktif etkinlik yoksa boş liste döner.
        """
        event_id = self.get_active_event_id()
        if event_id is None:
            return []
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT number, name, school, city, category FROM teams WHERE event_id = ?",
                (event_id,),
            ).fetchall()
        return [
            {
                "number": row[0] or "",
                "name": row[1] or "",
                "school": row[2] or "",
                "city": row[3] or "",
                "category": row[4] or "",
            }
            for row in rows
        ]
    
    def save_teams(self, teams: List[Dict[str, str]]) -> None:
        """
        Aktif etkinliğin takımlarını kaydeder.
        
        Args:
            teams: Takım listesi
            
        Not:
            - Önce mevcut takımlar silinir, sonra yenileri eklenir
            - Boş takımlar (tüm alanlar boş) kaydedilmez
            - Aktif etkinlik yoksa hata fırlatılır (yanlışlıkla yeni etkinlik oluşmasın)
        """
        event_id = self.get_active_event_id()
        if event_id is None:
            raise ValueError("Aktif etkinlik bulunamadı")
        with self._get_connection() as conn:
            conn.execute("DELETE FROM teams WHERE event_id = ?", (event_id,))
            # Boş takımları filtrele
            valid_teams = [
                (
                    event_id,
                    team.get("number", ""),
                    team.get("name", ""),
                    team.get("school", ""),
                    team.get("city", ""),
                    team.get("category", ""),
                )
                for team in teams
                if team.get("number") or team.get("name")  # En azından numara veya isim olmalı
            ]
            if valid_teams:
                conn.executemany(
                    "INSERT INTO teams (event_id, number, name, school, city, category) VALUES (?, ?, ?, ?, ?, ?)",
                    valid_teams,
                )
            conn.commit()
