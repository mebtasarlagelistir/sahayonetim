"""
Pit (Saha / Etkinlik Alanı) Takım Durumu Storage Modülü

Pit yöneticisinin takım-bazlı operasyonel verileri:
- Alana giriş (check-in) durumu + saati
- Sertifika durumu (received/pending)
- Kayıp eşya kayıtları (liste)
- Serbest metin notlar

Veri `pit_team_status` tablosunda (event_id, team_number) tekil anahtarıyla tutulur.
Kayıp eşyalar JSON dizisi olarak saklanır.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Dict, List, Optional


class PitStorage:
    """Pit yöneticisi takım durumu için storage sınıfı."""

    @staticmethod
    def _parse_items(raw) -> List[Dict]:
        if not raw:
            return []
        try:
            v = json.loads(raw)
            return v if isinstance(v, list) else []
        except (ValueError, TypeError):
            return []

    def get_pit_statuses(self, event_id: Optional[int] = None) -> List[Dict]:
        """
        Aktif etkinliğin tüm takımlarını pit durumlarıyla (sol-birleşim) döner.
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return []
        with self._get_connection() as conn:
            teams = conn.execute(
                "SELECT number, name, school FROM teams WHERE event_id = ? ORDER BY number",
                (event_id,),
            ).fetchall()
            statuses = conn.execute(
                """SELECT team_number, checked_in, checked_in_at, certificate_status, notes, lost_items, updated_at
                   FROM pit_team_status WHERE event_id = ?""",
                (event_id,),
            ).fetchall()
        smap = {r[0]: r for r in statuses}
        out = []
        for t in teams:
            num = t[0]
            st = smap.get(num)
            out.append({
                "team_number": num,
                "team_name": t[1] or "",
                "school": t[2] or "",
                "checked_in": bool(st[1]) if st else False,
                "checked_in_at": (st[2] if st else None),
                "certificate_status": (st[3] if st and st[3] else "pending"),
                "notes": (st[4] if st else "") or "",
                "lost_items": self._parse_items(st[5]) if st else [],
            })
        return out

    def get_pit_summary(self, event_id: Optional[int] = None) -> Dict:
        """Özet sayımlar (admin/genel görünüm için)."""
        rows = self.get_pit_statuses(event_id)
        return {
            "total_teams": len(rows),
            "checked_in": sum(1 for r in rows if r["checked_in"]),
            "certificate_received": sum(1 for r in rows if r["certificate_status"] == "received"),
            "open_lost_items": sum(1 for r in rows for it in r["lost_items"] if it.get("status") != "resolved"),
        }

    def _read_row(self, conn, event_id, team_number):
        return conn.execute(
            """SELECT checked_in, checked_in_at, certificate_status, notes, lost_items
               FROM pit_team_status WHERE event_id = ? AND team_number = ?""",
            (event_id, team_number),
        ).fetchone()

    def _write(self, conn, event_id, team_number, ci, ci_at, cert, notes, items_json, now):
        existing = conn.execute(
            "SELECT 1 FROM pit_team_status WHERE event_id = ? AND team_number = ?",
            (event_id, team_number),
        ).fetchone()
        if existing:
            conn.execute(
                """UPDATE pit_team_status
                   SET checked_in=?, checked_in_at=?, certificate_status=?, notes=?, lost_items=?, updated_at=?
                   WHERE event_id=? AND team_number=?""",
                (ci, ci_at, cert, notes, items_json, now, event_id, team_number),
            )
        else:
            conn.execute(
                """INSERT INTO pit_team_status
                   (event_id, team_number, checked_in, checked_in_at, certificate_status, notes, lost_items, updated_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (event_id, team_number, ci, ci_at, cert, notes, items_json, now),
            )
        conn.commit()

    def set_pit_status(
        self,
        event_id: Optional[int],
        team_number: str,
        *,
        checked_in: Optional[bool] = None,
        certificate_status: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Dict:
        """Verilen alanları upsert eder; None geçilen alanlara dokunmaz."""
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return {"ok": False, "error": "Aktif etkinlik yok"}
        now = datetime.now().isoformat(timespec="seconds")
        with self._get_connection() as conn:
            row = self._read_row(conn, event_id, team_number)
            ci = row[0] if row else 0
            ci_at = row[1] if row else None
            cert = (row[2] if row and row[2] else "pending")
            note_v = (row[3] if row else "") or ""
            items_json = (row[4] if row else None)
            if checked_in is not None:
                ci = 1 if checked_in else 0
                ci_at = now if ci else None
            if certificate_status is not None:
                cert = certificate_status
            if notes is not None:
                note_v = notes
            self._write(conn, event_id, team_number, ci, ci_at, cert, note_v, items_json, now)
        return {"ok": True}

    def add_lost_item(self, event_id: Optional[int], team_number: str, description: str) -> Dict:
        """Takıma bir kayıp eşya kaydı ekler."""
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return {"ok": False, "error": "Aktif etkinlik yok"}
        description = (description or "").strip()
        if not description:
            return {"ok": False, "error": "Açıklama gerekli"}
        now = datetime.now().isoformat(timespec="seconds")
        with self._get_connection() as conn:
            row = self._read_row(conn, event_id, team_number)
            items = self._parse_items(row[4]) if row else []
            items.append({"desc": description, "status": "open", "ts": now})
            ci = row[0] if row else 0
            ci_at = row[1] if row else None
            cert = (row[2] if row and row[2] else "pending")
            note_v = (row[3] if row else "") or ""
            self._write(conn, event_id, team_number, ci, ci_at, cert, note_v, json.dumps(items, ensure_ascii=False), now)
        return {"ok": True, "lost_items": items}

    def resolve_lost_item(self, event_id: Optional[int], team_number: str, index: int, resolved: bool = True) -> Dict:
        """Belirtilen kayıp eşyanın durumunu çözüldü/açık yapar."""
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return {"ok": False, "error": "Aktif etkinlik yok"}
        now = datetime.now().isoformat(timespec="seconds")
        with self._get_connection() as conn:
            row = self._read_row(conn, event_id, team_number)
            items = self._parse_items(row[4]) if row else []
            if not (0 <= index < len(items)):
                return {"ok": False, "error": "Geçersiz kayıt"}
            items[index]["status"] = "resolved" if resolved else "open"
            self._write(conn, event_id, team_number,
                        row[0], row[1], (row[2] or "pending"), (row[3] or ""),
                        json.dumps(items, ensure_ascii=False), now)
        return {"ok": True, "lost_items": items}
