"""
Deneme Maçları Yönetimi Modülü

Bu modül deneme maçları (practice matches) yönetimi için tüm CRUD işlemlerini içerir.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Dict, List


class PracticeMatchesStorage:
    """
    Deneme maçları yönetimi için storage sınıfı.
    
    Bu sınıf deneme maçlarıyla ilgili tüm veritabanı işlemlerini yönetir:
    - Maç oluşturma, silme, güncelleme
    - Maç listeleme ve filtreleme
    - Çakışma kontrolü
    """
    
    def get_practice_matches(
        self,
        event_id: int | None = None,
        match_date: str | None = None,
        field_number: int | None = None,
        status: str | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Deneme maçlarını listeler.
        
        Args:
            event_id: Etkinlik ID'si (None ise aktif etkinlik kullanılır)
            match_date: Tarih filtresi (YYYY-MM-DD formatında)
            field_number: Saha numarası filtresi
            status: Durum filtresi (scheduled, completed, cancelled, vb.)
            
        Returns:
            List[Dict]: Deneme maçları listesi
            [
                {
                    "id": 1,
                    "match_number": "P1",
                    "field_number": 1,
                    "match_date": "2026-02-06",
                    "match_time": "14:00",
                    "red_alliance": ["202501", "202502"],
                    "blue_alliance": ["202503", "202504"],
                    "status": "scheduled",
                    "red_score": None,
                    "blue_score": None,
                    "notes": ""
                },
                ...
            ]
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return []
        
        query = """
            SELECT id, match_number, field_number, field_name, match_date, match_time, 
                   red_alliance, blue_alliance, status, red_score, blue_score, surrogate_teams, scoring_data, notes
            FROM practice_matches 
            WHERE event_id = ?
        """
        params = [event_id]
        
        if match_date:
            query += " AND match_date = ?"
            params.append(match_date)
        if field_number is not None:
            query += " AND field_number = ?"
            params.append(field_number)
        if status:
            query += " AND status = ?"
            params.append(status)
        
        query += " ORDER BY match_date, match_time, field_number"
        
        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
        
        return [
            {
                "id": row[0],
                "match_number": row[1] or "",
                "field_number": row[2],
                "field_name": row[3] or "",
                "match_date": row[4],
                "match_time": row[5],
                "red_alliance": json.loads(row[6]) if row[6] else [],
                "blue_alliance": json.loads(row[7]) if row[7] else [],
                "status": row[8],
                "red_score": row[9],
                "blue_score": row[10],
                "surrogate_teams": json.loads(row[11]) if row[11] else [],
                "scoring_data": json.loads(row[12]) if row[12] else {},
                "notes": row[13] or "",
            }
            for row in rows
        ]
    
    def create_practice_match(
        self,
        match_number: str | None,
        field_number: int,
        match_date: str,
        match_time: str,
        red_alliance: List[str],
        blue_alliance: List[str],
        field_name: str = "",
        status: str = "scheduled",
        red_score: int | None = None,
        blue_score: int | None = None,
        surrogate_teams: List[str] | None = None,
        notes: str = "",
        event_id: int | None = None,
    ) -> int:
        """
        Yeni deneme maçı oluşturur.
        
        Args:
            match_number: Maç numarası (opsiyonel, örn: "P1")
            field_number: Saha numarası (1-10)
            match_date: Maç tarihi (YYYY-MM-DD formatında)
            match_time: Maç saati (HH:MM formatında)
            red_alliance: Kırmızı ittifak takım numaraları listesi
            blue_alliance: Mavi ittifak takım numaraları listesi
            status: Maç durumu (varsayılan: "scheduled")
            red_score: Kırmızı ittifak skoru (opsiyonel)
            blue_score: Mavi ittifak skoru (opsiyonel)
            notes: Notlar (opsiyonel)
            event_id: Etkinlik ID'si (None ise aktif etkinlik kullanılır)
            
        Returns:
            int: Oluşturulan maç ID'si
            
        Raises:
            ValueError: Aktif etkinlik bulunamazsa
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            raise ValueError("Aktif etkinlik bulunamadı")
        
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO practice_matches 
                (event_id, match_number, field_number, field_name, match_date, match_time, 
                 red_alliance, blue_alliance, status, red_score, blue_score, surrogate_teams, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    match_number,
                    field_number,
                    field_name,
                    match_date,
                    match_time,
                    json.dumps(red_alliance),
                    json.dumps(blue_alliance),
                    status,
                    red_score,
                    blue_score,
                    json.dumps(surrogate_teams or []),
                    notes,
                ),
            )
            conn.commit()
            return cursor.lastrowid
    
    def update_practice_match(
        self,
        match_id: int,
        match_number: str | None = None,
        field_number: int | None = None,
        field_name: str | None = None,
        match_date: str | None = None,
        match_time: str | None = None,
        red_alliance: List[str] | None = None,
        blue_alliance: List[str] | None = None,
        status: str | None = None,
        red_score: int | None = None,
        blue_score: int | None = None,
        surrogate_teams: List[str] | None = None,
        scoring_data: Dict[str, Any] | None = None,
        notes: str | None = None,
    ) -> None:
        """
        Deneme maçı günceller.
        
        Args:
            match_id: Güncellenecek maç ID'si
            match_number: Yeni maç numarası (opsiyonel)
            field_number: Yeni saha numarası (opsiyonel)
            match_date: Yeni maç tarihi (opsiyonel)
            match_time: Yeni maç saati (opsiyonel)
            red_alliance: Yeni kırmızı ittifak (opsiyonel)
            blue_alliance: Yeni mavi ittifak (opsiyonel)
            status: Yeni durum (opsiyonel)
            red_score: Yeni kırmızı skor (opsiyonel)
            blue_score: Yeni mavi skor (opsiyonel)
            notes: Yeni notlar (opsiyonel)
            
        Not: Sadece belirtilen alanlar güncellenir, diğerleri değişmez.
        """
        updates = []
        params = []
        
        if match_number is not None:
            updates.append("match_number = ?")
            params.append(match_number)
        if field_number is not None:
            updates.append("field_number = ?")
            params.append(field_number)
        if field_name is not None:
            updates.append("field_name = ?")
            params.append(field_name)
        if match_date is not None:
            updates.append("match_date = ?")
            params.append(match_date)
        if match_time is not None:
            updates.append("match_time = ?")
            params.append(match_time)
        if red_alliance is not None:
            updates.append("red_alliance = ?")
            params.append(json.dumps(red_alliance))
        if blue_alliance is not None:
            updates.append("blue_alliance = ?")
            params.append(json.dumps(blue_alliance))
        if status is not None:
            updates.append("status = ?")
            params.append(status)
        if red_score is not None:
            updates.append("red_score = ?")
            params.append(red_score)
        if blue_score is not None:
            updates.append("blue_score = ?")
            params.append(blue_score)
        if surrogate_teams is not None:
            updates.append("surrogate_teams = ?")
            params.append(json.dumps(surrogate_teams))
        if scoring_data is not None:
            updates.append("scoring_data = ?")
            params.append(json.dumps(scoring_data))
        if notes is not None:
            updates.append("notes = ?")
            params.append(notes)
        
        if not updates:
            return
        
        params.append(match_id)
        query = f"UPDATE practice_matches SET {', '.join(updates)} WHERE id = ?"
        
        with self._get_connection() as conn:
            conn.execute(query, params)
            conn.commit()
    
    def delete_practice_match(self, match_id: int) -> None:
        """
        Deneme maçı siler.
        
        Args:
            match_id: Silinecek maç ID'si
        """
        with self._get_connection() as conn:
            conn.execute("DELETE FROM practice_matches WHERE id = ?", (match_id,))
            conn.commit()
    
    def delete_all_practice_matches(self, event_id: int | None = None) -> None:
        """
        Tüm deneme maçlarını siler (etkinlik bazlı).
        
        Args:
            event_id: Etkinlik ID'si (None ise aktif etkinlik kullanılır)
            
        Not: Aktif etkinlik yoksa işlem yapılmaz.
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return
        
        with self._get_connection() as conn:
            conn.execute("DELETE FROM practice_matches WHERE event_id = ?", (event_id,))
            conn.commit()
    
    def check_practice_match_conflict(
        self,
        team_number: str,
        match_date: str,
        match_time: str,
        duration_minutes: int,
        exclude_match_id: int | None = None,
        event_id: int | None = None,
    ) -> bool:
        """
        Deneme maçı çakışması kontrol eder.
        
        Belirli bir takımın belirli bir zaman diliminde başka bir maçı olup olmadığını kontrol eder.
        
        Args:
            team_number: Kontrol edilecek takım numarası
            match_date: Maç tarihi (YYYY-MM-DD formatında)
            match_time: Maç başlangıç saati (HH:MM formatında)
            duration_minutes: Maç süresi (dakika)
            exclude_match_id: Hariç tutulacak maç ID'si (güncelleme işlemlerinde kullanılır)
            event_id: Etkinlik ID'si (None ise aktif etkinlik kullanılır)
            
        Returns:
            bool: True ise çakışma var, False ise çakışma yok
            
        Not: 
            - Çakışma kontrolü zaman aralığı kesişimine göre yapılır
            - Takım hem kırmızı hem mavi ittifakta olabilir
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return False
        
        start_time = datetime.strptime(f"{match_date} {match_time}", "%Y-%m-%d %H:%M")
        end_time = start_time + timedelta(minutes=duration_minutes)
        
        query = """
            SELECT id, match_date, match_time, red_alliance, blue_alliance
            FROM practice_matches 
            WHERE event_id = ? AND match_date = ?
        """
        params = [event_id, match_date]
        
        if exclude_match_id:
            query += " AND id != ?"
            params.append(exclude_match_id)
        
        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
        
        event_data = self.get_event()
        match_duration = event_data.get("schedule", {}).get("match_cycle_seconds", 150) // 60
        
        for row in rows:
            existing_start = datetime.strptime(f"{row[1]} {row[2]}", "%Y-%m-%d %H:%M")
            existing_end = existing_start + timedelta(minutes=match_duration)
            
            red_alliance = json.loads(row[3]) if row[3] else []
            blue_alliance = json.loads(row[4]) if row[4] else []
            
            if team_number in red_alliance or team_number in blue_alliance:
                if not (end_time <= existing_start or start_time >= existing_end):
                    return True
        
        return False
