"""
WiFi kanal atama route'ları - takım kanal planlama API endpoint'leri.
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Tuple

from flask import Blueprint, jsonify, request


def register_wifi_routes(bp: Blueprint, datastore, require_login, require_event_manager) -> None:
    """
    WiFi kanal atama route'larını Blueprint'e kaydeder.

    Args:
        bp: Blueprint instance
        datastore: DataStore instance
        require_login: require_login decorator
        require_event_manager: require_event_manager decorator
    """

    @bp.get("/wifi/settings")
    @require_login
    def get_wifi_settings():
        """
        WiFi kanal ayarlarını ve mevcut atamaları getirir.

        Returns:
            JSON: WiFi ayarları ve atamalar
        """
        event_data = datastore.get_event()
        wifi = _merge_wifi_defaults(event_data.get("wifi", {}))
        return jsonify(wifi)

    @bp.post("/wifi/settings")
    @require_login
    @require_event_manager
    def save_wifi_settings():
        """
        WiFi kanal ayarlarını kaydeder.

        Request body:
            {
                "allowed_channels": [1, 6, 11],
                "scan_notes": "Yoğun kanallar: 1-3",
                "assignment_mode": "unique"
            }

        Returns:
            JSON: Başarı durumu
        """
        data = request.get_json(force=True) or {}
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()
        wifi = _merge_wifi_defaults(event_data.get("wifi", {}))

        allowed_channels = _normalize_channels(
            data.get("allowed_channels", wifi.get("allowed_channels", [])),
            wifi["supported_channels"],
        )
        wifi["allowed_channels"] = allowed_channels
        wifi["scan_notes"] = (data.get("scan_notes") or "").strip()

        mode = (data.get("assignment_mode") or wifi.get("assignment_mode") or "unique").strip()
        wifi["assignment_mode"] = mode if mode in {"unique", "round_robin"} else "unique"

        event_data["wifi"] = wifi
        datastore.save_event(event_data)
        return jsonify({"ok": True})

    @bp.post("/wifi/assign")
    @require_login
    @require_event_manager
    def assign_wifi_channels():
        """
        Takımlara WiFi kanalı atar ve sonucu kaydeder.

        Request body:
            {
                "allowed_channels": [1, 6, 11],
                "assignment_mode": "unique"
            }

        Returns:
            JSON: Atama özeti ve takım listesi
        """
        data = request.get_json(force=True) or {}
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()
        wifi = _merge_wifi_defaults(event_data.get("wifi", {}))

        allowed_channels = _normalize_channels(
            data.get("allowed_channels", wifi.get("allowed_channels", [])),
            wifi["supported_channels"],
        )
        if not allowed_channels:
            return jsonify({"error": "Kullanılabilir kanal listesi boş"}), 400

        mode = (data.get("assignment_mode") or wifi.get("assignment_mode") or "unique").strip()
        assignment_mode = mode if mode in {"unique", "round_robin"} else "unique"

        teams = datastore.get_teams()
        sorted_teams = _sort_teams(teams)
        assignments, reused = _assign_channels(sorted_teams, allowed_channels, assignment_mode)

        wifi["allowed_channels"] = allowed_channels
        wifi["assignment_mode"] = assignment_mode
        wifi["assignments"] = {item["team_number"]: item["channel"] for item in assignments}
        wifi["last_assigned_at"] = datetime.utcnow().isoformat() + "Z"

        event_data["wifi"] = wifi
        datastore.save_event(event_data)

        return jsonify(
            {
                "ok": True,
                "summary": {
                    "team_count": len(assignments),
                    "channel_count": len(allowed_channels),
                    "reused": reused,
                    "assignment_mode": assignment_mode,
                },
                "assignments": assignments,
            }
        )

    @bp.post("/wifi/clear")
    @require_login
    @require_event_manager
    def clear_wifi_assignments():
        """
        WiFi kanal atamalarını temizler.
        """
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()
        wifi = _merge_wifi_defaults(event_data.get("wifi", {}))
        wifi["assignments"] = {}
        wifi["last_assigned_at"] = ""
        event_data["wifi"] = wifi
        datastore.save_event(event_data)
        return jsonify({"ok": True})


def _merge_wifi_defaults(raw: Dict) -> Dict:
    supported = _normalize_channels(raw.get("supported_channels", []), None)
    if not supported:
        supported = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    allowed = _normalize_channels(raw.get("allowed_channels", supported), supported)
    return {
        "supported_channels": supported,
        "allowed_channels": allowed,
        "assignments": raw.get("assignments", {}) or {},
        "scan_notes": (raw.get("scan_notes") or "").strip(),
        "assignment_mode": raw.get("assignment_mode") or "unique",
        "last_assigned_at": raw.get("last_assigned_at") or "",
    }


def _normalize_channels(raw: List, supported: List[int] | None) -> List[int]:
    seen = set()
    result: List[int] = []
    for item in raw or []:
        try:
            channel = int(item)
        except (TypeError, ValueError):
            continue
        if channel <= 0:
            continue
        if supported is not None and channel not in supported:
            continue
        if channel in seen:
            continue
        seen.add(channel)
        result.append(channel)
    return result


def _sort_teams(teams: List[Dict[str, str]]) -> List[Dict[str, str]]:
    def sort_key(team: Dict[str, str]) -> Tuple[int, str]:
        raw = (team.get("number") or "").strip()
        try:
            return (0, f"{int(raw):06d}")
        except ValueError:
            return (1, raw)

    return sorted(teams, key=sort_key)


def _assign_channels(
    teams: List[Dict[str, str]], channels: List[int], mode: str
) -> Tuple[List[Dict[str, str]], bool]:
    assignments: List[Dict[str, str]] = []
    reused = False
    if not teams:
        return assignments, reused
    channel_count = len(channels)
    for idx, team in enumerate(teams):
        channel_index = idx % channel_count
        if mode == "unique" and idx >= channel_count:
            reused = True
        assignments.append(
            {
                "team_number": (team.get("number") or "").strip(),
                "team_name": (team.get("name") or "").strip(),
                "channel": channels[channel_index],
            }
        )
    if mode == "round_robin" and len(teams) > channel_count:
        reused = True
    return assignments, reused
