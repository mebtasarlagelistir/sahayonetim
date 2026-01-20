"""
Etkinlik Yönetimi Modülü

Bu modül etkinlik (event) yönetimi için tüm CRUD işlemlerini içerir.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List

from ..event_setup import default_config_dict
from .base import _merge_defaults


class EventsStorage:
    """
    Etkinlik yönetimi için storage sınıfı.
    
    Bu sınıf etkinliklerle ilgili tüm veritabanı işlemlerini yönetir:
    - Etkinlik oluşturma, silme, güncelleme
    - Aktif etkinlik yönetimi
    - Etkinlik listeleme
    """
    
    def get_event(self) -> Dict[str, Any]:
        """
        Aktif etkinliğin bilgilerini getirir.
        
        Returns:
            Dict: Etkinlik verisi (varsayılan değerlerle birleştirilmiş)
        """
        defaults = default_config_dict()["event"]
        event_id = self.get_active_event_id()
        if event_id is None:
            return defaults
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT data FROM events WHERE id = ?",
                (event_id,),
            ).fetchone()
            if not row:
                return defaults
            try:
                data = json.loads(row[0])
            except json.JSONDecodeError:
                return defaults
        return _merge_defaults(data, defaults)
    
    def save_event(self, data: Dict[str, Any]) -> None:
        """
        Aktif etkinliğin bilgilerini kaydeder.
        
        Args:
            data: Etkinlik verisi (dict)
            
        Not:
            - Aktif etkinlik yoksa hata fırlatılır (yanlışlıkla yeni etkinlik oluşmasın)
            - Veri JSON formatında saklanır
            - Etkinlik adı ayrı bir kolonda da saklanır (hızlı erişim için)
        """
        event_id = self.get_active_event_id()
        if event_id is None:
            raise ValueError("Aktif etkinlik bulunamadı")
        payload = json.dumps(data, ensure_ascii=False)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "UPDATE events SET data = ?, name = ? WHERE id = ?",
                (payload, data.get("name", ""), event_id),
            )
            conn.commit()
    
    def get_events(self) -> List[Dict[str, Any]]:
        """
        Tüm etkinlikleri listeler.
        
        Returns:
            List[Dict]: Etkinlik listesi
            [{"id": 1, "name": "Etkinlik Adı", "active": true}, ...]
        """
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute("SELECT id, name, active FROM events ORDER BY id").fetchall()
        return [
            {"id": row[0], "name": row[1], "active": bool(row[2])} for row in rows
        ]
    
    def get_event_id_by_name(self, name: str) -> int | None:
        """
        Etkinlik adına göre ID bulur.
        
        Args:
            name: Etkinlik adı
            
        Returns:
            int | None: Etkinlik ID'si veya None
        """
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT id FROM events WHERE name = ?",
                (name,),
            ).fetchone()
        return int(row[0]) if row else None
    
    def get_team_count_for_event(self, event_id: int) -> int:
        """
        Bir etkinliğin takım sayısını döndürür.
        
        Args:
            event_id: Etkinlik ID'si
            
        Returns:
            int: Takım sayısı
        """
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM teams WHERE event_id = ?",
                (event_id,),
            ).fetchone()
        return int(row[0]) if row else 0
    
    def get_active_event_id(self) -> int | None:
        """
        Aktif etkinlik ID'sini döndürür.
        
        Returns:
            int | None: Aktif etkinlik ID'si veya None
        """
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute("SELECT id FROM events WHERE active = 1").fetchone()
        return int(row[0]) if row else None
    
    def set_active_event(self, event_id: int) -> None:
        """
        Aktif etkinliği ayarlar.
        
        Args:
            event_id: Etkinlik ID'si
            
        Not:
            - Önce tüm etkinliklerin active değeri 0 yapılır
            - Sonra belirtilen etkinlik active = 1 yapılır
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE events SET active = 0")
            conn.execute("UPDATE events SET active = 1 WHERE id = ?", (event_id,))
            conn.commit()
    
    def create_event(self, name: str, data: Dict[str, Any] | None = None) -> int:
        """
        Yeni etkinlik oluşturur.
        
        Args:
            name: Etkinlik adı
            data: Etkinlik verisi (opsiyonel, varsayılan değerlerle birleştirilir)
            
        Returns:
            int: Oluşturulan etkinlik ID'si
            
        Not:
            - Eğer aktif etkinlik yoksa, yeni oluşturulan etkinlik otomatik aktif yapılır
        """
        base = default_config_dict()["event"]
        data = _merge_defaults(data or {}, base)
        data["name"] = name
        payload = json.dumps(data, ensure_ascii=False)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO events (name, data, active) VALUES (?, ?, 0)",
                (name, payload),
            )
            event_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            if self.get_active_event_id() is None:
                conn.execute("UPDATE events SET active = 1 WHERE id = ?", (event_id,))
            conn.commit()
        return int(event_id)
    
    def delete_event(self, event_id: int) -> None:
        """
        Etkinlik siler.
        
        Args:
            event_id: Silinecek etkinlik ID'si
            
        Not:
            - Takımlar otomatik silinir (CASCADE delete)
            - Eğer silinen etkinlik aktif ise, başka bir etkinlik aktif yapılır
        """
        with sqlite3.connect(self.db_path) as conn:
            # Check if event exists
            row = conn.execute("SELECT id FROM events WHERE id = ?", (event_id,)).fetchone()
            if not row:
                raise ValueError("Etkinlik bulunamadı")
            
            # Check if this is the active event
            active_row = conn.execute(
                "SELECT active FROM events WHERE id = ?", (event_id,)
            ).fetchone()
            was_active = active_row and active_row[0] == 1
            
            # Delete event-specific users (admin stays with event_id NULL)
            conn.execute("DELETE FROM users WHERE event_id = ?", (event_id,))

            # Delete event (teams will be deleted automatically due to CASCADE)
            conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
            
            # If deleted event was active, set another event as active
            if was_active:
                other_event = conn.execute(
                    "SELECT id FROM events ORDER BY id LIMIT 1"
                ).fetchone()
                if other_event:
                    conn.execute("UPDATE events SET active = 1 WHERE id = ?", (other_event[0],))
            
            conn.commit()
    
    def save_teams_for_event(self, event_id: int, teams: List[Dict[str, str]]) -> None:
        """
        Belirli bir etkinlik için takımları kaydeder.
        
        Args:
            event_id: Etkinlik ID'si
            teams: Takım listesi
            
        Not:
            - Önce mevcut takımlar silinir, sonra yenileri eklenir
            - Boş takımlar (tüm alanlar boş) kaydedilmez
        """
        with sqlite3.connect(self.db_path) as conn:
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
    
    def migrate_from_config(self, config_data: Dict[str, Any]) -> None:
        """
        Eski config.json formatından veritabanına veri migrasyonu yapar.
        
        Args:
            config_data: Eski config.json verisi
            
        Not:
            - Sadece veritabanı boşsa çalışır
            - Event ve teams verilerini migre eder
        """
        if not self.is_empty():
            return
        event = config_data.get("event")
        teams = config_data.get("teams")
        if isinstance(event, dict):
            event_id = self.create_event(event.get("name", "") or "Yeni Etkinlik", event)
            if isinstance(teams, list):
                self.save_teams_for_event(event_id, teams)
        if isinstance(teams, list):
            # Eğer event yoksa, varsayılan event oluştur
            event_id = self.get_active_event_id()
            if event_id is None:
                event_id = self.create_event("Yeni Etkinlik")
            self.save_teams_for_event(event_id, teams)
