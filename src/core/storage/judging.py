"""
Jüri Görüşme Slotları Yönetimi Modülü

Jüri görüşme (interview) slotları için CRUD ve takvim üretim yardımcıları.
İnceleme (inspection) modülüne benzer; ancak takım başına TEK görüşme vardır
(inceleme tipi yoktur), oda/panel ve jüri ataması içerir.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from typing import Any, Dict, List


class JudgingStorage:
    """Jüri görüşme slotları için storage sınıfı."""

    def get_judging_slots(
        self,
        event_id: int | None = None,
        team_number: str | None = None,
        slot_date: str | None = None,
        status: str | None = None,
    ) -> List[Dict[str, Any]]:
        """Jüri görüşme slotlarını getirir (opsiyonel filtrelerle)."""
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return []

        query = (
            "SELECT id, team_number, slot_date, slot_time, duration_minutes, "
            "room, judge_username, judge_name, status, notes "
            "FROM judging_slots WHERE event_id = ?"
        )
        params: List[Any] = [event_id]
        if team_number:
            query += " AND team_number = ?"
            params.append(team_number)
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
                "slot_date": row[2],
                "slot_time": row[3],
                "duration_minutes": row[4],
                "room": row[5] or "",
                "judge_username": row[6] or "",
                "judge_name": row[7] or "",
                "status": row[8] or "scheduled",
                "notes": row[9] or "",
            }
            for row in rows
        ]

    def create_judging_slot(
        self,
        team_number: str,
        slot_date: str,
        slot_time: str,
        duration_minutes: int = 10,
        room: str = "",
        judge_username: str = "",
        judge_name: str = "",
        status: str = "scheduled",
        notes: str = "",
        event_id: int | None = None,
    ) -> int:
        """Yeni jüri görüşme slotu oluşturur."""
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            raise ValueError("Aktif etkinlik bulunamadı")

        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO judging_slots
                (event_id, team_number, slot_date, slot_time, duration_minutes,
                 room, judge_username, judge_name, status, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id, team_number, slot_date, slot_time, duration_minutes,
                    room, judge_username, judge_name, status, notes,
                ),
            )
            conn.commit()
            return cursor.lastrowid

    def update_judging_slot(
        self,
        slot_id: int,
        team_number: str | None = None,
        slot_date: str | None = None,
        slot_time: str | None = None,
        duration_minutes: int | None = None,
        room: str | None = None,
        judge_username: str | None = None,
        judge_name: str | None = None,
        status: str | None = None,
        notes: str | None = None,
    ) -> None:
        """Jüri görüşme slotunu günceller (yalnız verilen alanlar)."""
        updates: List[str] = []
        params: List[Any] = []
        for column, value in (
            ("team_number", team_number),
            ("slot_date", slot_date),
            ("slot_time", slot_time),
            ("duration_minutes", duration_minutes),
            ("room", room),
            ("judge_username", judge_username),
            ("judge_name", judge_name),
            ("status", status),
            ("notes", notes),
        ):
            if value is not None:
                updates.append(f"{column} = ?")
                params.append(value)

        if not updates:
            return
        params.append(slot_id)
        with self._get_connection() as conn:
            conn.execute(
                f"UPDATE judging_slots SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            conn.commit()

    def delete_judging_slot(self, slot_id: int) -> None:
        """Tek jüri görüşme slotunu siler."""
        with self._get_connection() as conn:
            conn.execute("DELETE FROM judging_slots WHERE id = ?", (slot_id,))
            conn.commit()

    def delete_all_judging_slots(self, event_id: int | None = None) -> None:
        """Etkinliğin tüm jüri görüşme slotlarını siler."""
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return
        with self._get_connection() as conn:
            conn.execute("DELETE FROM judging_slots WHERE event_id = ?", (event_id,))
            conn.commit()

    def check_judging_conflict(
        self,
        team_number: str,
        slot_date: str,
        slot_time: str,
        duration_minutes: int,
        exclude_slot_id: int | None = None,
        event_id: int | None = None,
    ) -> bool:
        """Bir takımın aynı zaman aralığında başka görüşmesi var mı kontrol eder."""
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return False

        slots = self.get_judging_slots(event_id=event_id, team_number=team_number)
        try:
            new_start = datetime.strptime(f"{slot_date} {slot_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            return False
        new_end = new_start + timedelta(minutes=duration_minutes)

        for slot in slots:
            if exclude_slot_id is not None and slot["id"] == exclude_slot_id:
                continue
            try:
                existing_start = datetime.strptime(
                    f"{slot['slot_date']} {slot['slot_time']}", "%Y-%m-%d %H:%M"
                )
            except (ValueError, TypeError):
                continue
            existing_end = existing_start + timedelta(minutes=slot.get("duration_minutes") or 10)
            # Zaman aralığı kesişimi
            if new_start < existing_end and existing_start < new_end:
                return True
        return False
