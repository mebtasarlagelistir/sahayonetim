"""
İnceleme Slotları Yönetimi Modülü

Bu modül inceleme slotları (inspection slots) yönetimi için tüm CRUD işlemlerini içerir.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from typing import Any, Dict, List


class InspectionStorage:
    """
    İnceleme slotları yönetimi için storage sınıfı.
    
    Bu sınıf inceleme slotlarıyla ilgili tüm veritabanı işlemlerini yönetir:
    - İnceleme slotu oluşturma, silme, güncelleme
    - Slot listeleme ve filtreleme
    - Çakışma kontrolü
    """
    
    def get_inspection_slots(
        self,
        event_id: int | None = None,
        team_number: str | None = None,
        inspection_type: str | None = None,
        slot_date: str | None = None,
        status: str | None = None,
    ) -> List[Dict[str, Any]]:
        """
        İnceleme slotlarını getirir.
        
        Args:
            event_id: Etkinlik ID'si (None ise aktif etkinlik kullanılır)
            team_number: Takım numarası filtresi
            inspection_type: İnceleme tipi filtresi (Donanım, Boyut, Güvenlik, vb.)
            slot_date: Tarih filtresi (YYYY-MM-DD formatında)
            status: Durum filtresi (scheduled, completed, passed, failed, vb.)
            
        Returns:
            List[Dict]: İnceleme slotları listesi
            [
                {
                    "id": 1,
                    "team_number": "202501",
                    "inspection_type": "Donanım",
                    "slot_date": "2026-02-06",
                    "slot_time": "09:00",
                    "duration_minutes": 20,
                    "inspector_name": "Müfettiş 1",
                    "status": "scheduled",
                    "notes": ""
                },
                ...
            ]
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return []
        
        query = "SELECT id, team_number, inspection_type, slot_date, slot_time, duration_minutes, inspector_name, status, notes, station_name FROM inspection_slots WHERE event_id = ?"
        params = [event_id]
        
        if team_number:
            query += " AND team_number = ?"
            params.append(team_number)
        if inspection_type:
            query += " AND inspection_type = ?"
            params.append(inspection_type)
        if slot_date:
            query += " AND slot_date = ?"
            params.append(slot_date)
        if status:
            query += " AND status = ?"
            params.append(status)
        
        query += " ORDER BY slot_date, slot_time"
        
        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
        
        return [
            {
                "id": row[0],
                "team_number": row[1],
                "inspection_type": row[2],
                "slot_date": row[3],
                "slot_time": row[4],
                "duration_minutes": row[5],
                "inspector_name": row[6] or "",
                "status": row[7],
                "notes": row[8] or "",
                "station_name": row[9] if len(row) > 9 and row[9] else "",
            }
            for row in rows
        ]
    
    def create_inspection_slot(
        self,
        team_number: str,
        inspection_type: str,
        slot_date: str,
        slot_time: str,
        duration_minutes: int = 15,
        inspector_name: str = "",
        status: str = "scheduled",
        notes: str = "",
        station_name: str = "",
        event_id: int | None = None,
    ) -> int:
        """
        Yeni inceleme slotu oluşturur.
        
        Args:
            team_number: Takım numarası
            inspection_type: İnceleme tipi (Donanım, Boyut, Güvenlik, Yazılım, Ağırlık, Özel)
            slot_date: Slot tarihi (YYYY-MM-DD formatında)
            slot_time: Slot saati (HH:MM formatında)
            duration_minutes: Süre (dakika, varsayılan: 15)
            inspector_name: Müfettiş adı (opsiyonel)
            status: Durum (varsayılan: "scheduled")
            notes: Notlar (opsiyonel)
            station_name: İstasyon ismi (opsiyonel, örn: "İstasyon 1", "Grup A")
            event_id: Etkinlik ID'si (None ise aktif etkinlik kullanılır)
            
        Returns:
            int: Oluşturulan slot ID'si
            
        Raises:
            ValueError: Aktif etkinlik bulunamazsa
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            raise ValueError("Aktif etkinlik bulunamadı")
        
        with self._get_connection() as conn:
            # station_name kolonu var mı kontrol et
            columns = [row[1] for row in conn.execute("PRAGMA table_info(inspection_slots)").fetchall()]
            has_station = "station_name" in columns
            
            if has_station:
                cursor = conn.execute(
                    """
                    INSERT INTO inspection_slots 
                    (event_id, team_number, inspection_type, slot_date, slot_time, duration_minutes, inspector_name, status, notes, station_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event_id,
                        team_number,
                        inspection_type,
                        slot_date,
                        slot_time,
                        duration_minutes,
                        inspector_name,
                        status,
                        notes,
                        station_name,
                    ),
                )
            else:
                cursor = conn.execute(
                    """
                    INSERT INTO inspection_slots 
                    (event_id, team_number, inspection_type, slot_date, slot_time, duration_minutes, inspector_name, status, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event_id,
                        team_number,
                        inspection_type,
                        slot_date,
                        slot_time,
                        duration_minutes,
                        inspector_name,
                        status,
                        notes,
                    ),
                )
            conn.commit()
            return cursor.lastrowid
    
    def update_inspection_slot(
        self,
        slot_id: int,
        team_number: str | None = None,
        inspection_type: str | None = None,
        slot_date: str | None = None,
        slot_time: str | None = None,
        duration_minutes: int | None = None,
        inspector_name: str | None = None,
        status: str | None = None,
        notes: str | None = None,
        station_name: str | None = None,
    ) -> None:
        """
        İnceleme slotu günceller.
        
        Args:
            slot_id: Güncellenecek slot ID'si
            team_number: Yeni takım numarası (opsiyonel)
            inspection_type: Yeni inceleme tipi (opsiyonel)
            slot_date: Yeni slot tarihi (opsiyonel)
            slot_time: Yeni slot saati (opsiyonel)
            duration_minutes: Yeni süre (opsiyonel)
            inspector_name: Yeni müfettiş adı (opsiyonel)
            status: Yeni durum (opsiyonel)
            notes: Yeni notlar (opsiyonel)
            station_name: Yeni istasyon ismi (opsiyonel)
            
        Not: Sadece belirtilen alanlar güncellenir, diğerleri değişmez.
        """
        updates = []
        params = []
        
        if team_number is not None:
            updates.append("team_number = ?")
            params.append(team_number)
        if inspection_type is not None:
            updates.append("inspection_type = ?")
            params.append(inspection_type)
        if slot_date is not None:
            updates.append("slot_date = ?")
            params.append(slot_date)
        if slot_time is not None:
            updates.append("slot_time = ?")
            params.append(slot_time)
        if duration_minutes is not None:
            updates.append("duration_minutes = ?")
            params.append(duration_minutes)
        if inspector_name is not None:
            updates.append("inspector_name = ?")
            params.append(inspector_name)
        if status is not None:
            updates.append("status = ?")
            params.append(status)
        if notes is not None:
            updates.append("notes = ?")
            params.append(notes)
        if station_name is not None:
            updates.append("station_name = ?")
            params.append(station_name)
        
        if not updates:
            return
        
        params.append(slot_id)
        query = f"UPDATE inspection_slots SET {', '.join(updates)} WHERE id = ?"
        
        with self._get_connection() as conn:
            conn.execute(query, params)
            conn.commit()
    
    def delete_inspection_slot(self, slot_id: int) -> None:
        """
        İnceleme slotu siler.
        
        Args:
            slot_id: Silinecek slot ID'si
        """
        with self._get_connection() as conn:
            conn.execute("DELETE FROM inspection_slots WHERE id = ?", (slot_id,))
            conn.commit()
    
    def delete_all_inspection_slots(self, event_id: int | None = None) -> None:
        """
        Tüm inceleme slotlarını siler (etkinlik bazlı).
        
        Args:
            event_id: Etkinlik ID'si (None ise aktif etkinlik kullanılır)
            
        Not: Aktif etkinlik yoksa işlem yapılmaz.
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return
        
        with self._get_connection() as conn:
            conn.execute("DELETE FROM inspection_slots WHERE event_id = ?", (event_id,))
            conn.commit()
    
    def check_inspection_conflict(
        self,
        team_number: str,
        slot_date: str,
        slot_time: str,
        duration_minutes: int,
        exclude_slot_id: int | None = None,
        event_id: int | None = None,
    ) -> bool:
        """
        İnceleme slotu çakışması kontrolü yapar.
        
        Belirli bir takımın belirli bir zaman diliminde başka bir inceleme slotu olup olmadığını kontrol eder.
        
        Args:
            team_number: Kontrol edilecek takım numarası
            slot_date: Slot tarihi (YYYY-MM-DD formatında)
            slot_time: Slot başlangıç saati (HH:MM formatında)
            duration_minutes: Slot süresi (dakika)
            exclude_slot_id: Hariç tutulacak slot ID'si (güncelleme işlemlerinde kullanılır)
            event_id: Etkinlik ID'si (None ise aktif etkinlik kullanılır)
            
        Returns:
            bool: True ise çakışma var, False ise çakışma yok
            
        Not: 
            - Çakışma kontrolü zaman aralığı kesişimine göre yapılır
            - Aynı takım aynı anda birden fazla incelemede olamaz
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return False
        
        start_time = datetime.strptime(f"{slot_date} {slot_time}", "%Y-%m-%d %H:%M")
        end_time = start_time + timedelta(minutes=duration_minutes)
        
        query = """
            SELECT id, slot_date, slot_time, duration_minutes 
            FROM inspection_slots 
            WHERE event_id = ? AND team_number = ? AND slot_date = ?
        """
        params = [event_id, team_number, slot_date]
        
        if exclude_slot_id:
            query += " AND id != ?"
            params.append(exclude_slot_id)
        
        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
        
        for row in rows:
            existing_start = datetime.strptime(f"{row[1]} {row[2]}", "%Y-%m-%d %H:%M")
            existing_end = existing_start + timedelta(minutes=row[3])
            
            if not (end_time <= existing_start or start_time >= existing_end):
                return True
        
        return False
