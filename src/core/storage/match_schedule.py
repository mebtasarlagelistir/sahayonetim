"""
Resmi Maç Takvimi Yönetimi Modülü

Bu modül resmi maç takvimi (qualification/elimination/final) için tüm CRUD
işlemlerini ve çakışma kontrollerini içerir.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Dict, List


class MatchScheduleStorage:
    """
    Resmi maç takvimi için storage sınıfı.

    Bu sınıf şunları sağlar:
    - Maç oluşturma, güncelleme, silme
    - Maçları filtreli listeleme
    - Takım bazlı çakışma kontrolü
    """

    def get_match_schedule(
        self,
        event_id: int | None = None,
        match_type: str | None = None,
        match_date: str | None = None,
        field_number: int | None = None,
        status: str | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Resmi maçları listeler.

        Args:
            event_id: Etkinlik ID'si (None ise aktif etkinlik kullanılır)
            match_type: Maç tipi filtresi (qualification/elimination/final)
            match_date: Tarih filtresi (YYYY-MM-DD)
            field_number: Saha numarası filtresi
            status: Durum filtresi

        Returns:
            Resmi maç listesi (dict)
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return []

        query = """
            SELECT id, match_number, match_type, field_number, match_date, match_time,
                   red_alliance, blue_alliance, status, red_score, blue_score, surrogate_teams, scoring_data, notes
            FROM match_schedule
            WHERE event_id = ?
        """
        params = [event_id]

        if match_type:
            query += " AND match_type = ?"
            params.append(match_type)
        if match_date:
            query += " AND match_date = ?"
            params.append(match_date)
        if field_number is not None:
            query += " AND field_number = ?"
            params.append(field_number)
        if status:
            query += " AND status = ?"
            params.append(status)

        query += " ORDER BY match_date, match_time, field_number, match_number"

        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(query, params).fetchall()

        return [
            {
                "id": row[0],
                "match_number": row[1],
                "match_type": row[2],
                "field_number": row[3],
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

    def create_match(
        self,
        match_number: int,
        match_type: str,
        field_number: int,
        match_date: str,
        match_time: str,
        red_alliance: List[str],
        blue_alliance: List[str],
        status: str = "scheduled",
        red_score: int | None = None,
        blue_score: int | None = None,
        surrogate_teams: List[str] | None = None,
        notes: str = "",
        event_id: int | None = None,
    ) -> int:
        """
        Yeni resmi maç oluşturur.

        Args:
            match_number: Maç numarası (1, 2, 3, ...)
            match_type: Maç tipi
            field_number: Saha numarası
            match_date: Maç tarihi (YYYY-MM-DD)
            match_time: Maç saati (HH:MM)
            red_alliance: Kırmızı ittifak takım numaraları listesi
            blue_alliance: Mavi ittifak takım numaraları listesi
            status: Maç durumu
            red_score: Kırmızı skor (opsiyonel)
            blue_score: Mavi skor (opsiyonel)
            notes: Notlar
            event_id: Etkinlik ID'si (None ise aktif etkinlik)

        Returns:
            Oluşturulan maç ID'si
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            raise ValueError("Aktif etkinlik bulunamadı")

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO match_schedule
                (event_id, match_number, match_type, field_number, match_date, match_time,
                 red_alliance, blue_alliance, status, red_score, blue_score, surrogate_teams, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    match_number,
                    match_type,
                    field_number,
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

    def update_match(
        self,
        match_id: int,
        match_number: int | None = None,
        match_type: str | None = None,
        field_number: int | None = None,
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
        Resmi maç günceller (sadece gönderilen alanlar).
        """
        updates = []
        params = []

        if match_number is not None:
            updates.append("match_number = ?")
            params.append(match_number)
        if match_type is not None:
            updates.append("match_type = ?")
            params.append(match_type)
        if field_number is not None:
            updates.append("field_number = ?")
            params.append(field_number)
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
        query = f"UPDATE match_schedule SET {', '.join(updates)} WHERE id = ?"

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(query, params)
            conn.commit()

    def delete_match(self, match_id: int) -> None:
        """Resmi maçı siler."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM match_schedule WHERE id = ?", (match_id,))
            conn.commit()

    def delete_all_matches(self, event_id: int | None = None) -> None:
        """
        Etkinlikteki tüm resmi maçları siler.
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return

        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM match_schedule WHERE event_id = ?", (event_id,))
            conn.commit()

    def check_match_schedule_conflict(
        self,
        team_number: str,
        match_date: str,
        match_time: str,
        duration_minutes: int,
        exclude_match_id: int | None = None,
        event_id: int | None = None,
    ) -> bool:
        """
        Resmi maç çakışması kontrol eder.

        Aynı takımın aynı zaman aralığında başka bir resmi maçı varsa True döner.
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return False

        start_time = datetime.strptime(f"{match_date} {match_time}", "%Y-%m-%d %H:%M")
        end_time = start_time + timedelta(minutes=duration_minutes)

        query = """
            SELECT id, match_date, match_time, red_alliance, blue_alliance
            FROM match_schedule
            WHERE event_id = ? AND match_date = ?
        """
        params = [event_id, match_date]

        if exclude_match_id:
            query += " AND id != ?"
            params.append(exclude_match_id)

        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(query, params).fetchall()

        for row in rows:
            existing_start = datetime.strptime(f"{row[1]} {row[2]}", "%Y-%m-%d %H:%M")
            existing_end = existing_start + timedelta(minutes=duration_minutes)
            red_alliance = json.loads(row[3]) if row[3] else []
            blue_alliance = json.loads(row[4]) if row[4] else []

            if team_number in red_alliance or team_number in blue_alliance:
                if not (end_time <= existing_start or start_time >= existing_end):
                    return True

        return False
