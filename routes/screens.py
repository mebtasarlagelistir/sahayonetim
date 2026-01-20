"""
Seyirci Ekranları route'ları

Bu modül seyirci ekranlarının yönetimi ve izlenmesi için API endpoint'lerini içerir.
"""

from __future__ import annotations

import time
from typing import Dict, Any

from flask import jsonify, render_template, request


# Bağlı ekranlar (memory)
_screen_registry: Dict[str, Dict[str, Any]] = {}


def _get_global_screen_settings(datastore) -> Dict[str, Any]:
    event_data = datastore.get_event()
    screens = event_data.get("screens", {}) if isinstance(event_data, dict) else {}
    return {
        "active_view": screens.get("active_view", "match"),
        "overlay_enabled": bool(screens.get("overlay_enabled", False)),
        "overlay_text": screens.get("overlay_text", "") or "",
    }


def _cleanup_screens(timeout_seconds: int = 60) -> None:
    now = time.time()
    expired = [key for key, item in _screen_registry.items() if now - item.get("last_seen", 0) > timeout_seconds]
    for key in expired:
        _screen_registry.pop(key, None)


def _assign_screen_name(ip: str) -> str:
    base = f"Ekran {ip}" if ip else "Seyirci Ekranı"
    existing = [
        item.get("screen_name", "")
        for item in _screen_registry.values()
        if item.get("ip") == ip and item.get("screen_name")
    ]
    if base not in existing:
        return base
    index = 2
    while f"{base} #{index}" in existing:
        index += 1
    return f"{base} #{index}"


def register_screen_routes(bp, datastore, require_login, require_event_manager):
    """
    Seyirci ekranı route'larını Blueprint'e kaydeder.
    """

    @bp.get("/screens")
    @require_login
    def screens_page():
        return render_template("screens.html")

    @bp.get("/audience")
    def audience_display_page():
        return render_template("audience_display.html")

    @bp.get("/api/screens/settings")
    def get_screen_settings():
        return jsonify(_get_global_screen_settings(datastore))

    @bp.post("/api/screens/settings")
    @require_login
    @require_event_manager
    def save_screen_settings():
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        data = request.get_json(force=True) or {}
        event_data = datastore.get_event()
        event_data.setdefault("screens", {})
        event_data["screens"]["active_view"] = (data.get("active_view") or "match").strip()
        event_data["screens"]["overlay_enabled"] = bool(data.get("overlay_enabled", False))
        event_data["screens"]["overlay_text"] = (data.get("overlay_text") or "").strip()
        datastore.save_event(event_data)
        return jsonify({"ok": True})

    @bp.post("/api/screens/heartbeat")
    def screen_heartbeat():
        data = request.get_json(force=True) or {}
        screen_id = (data.get("screen_id") or "").strip()
        if not screen_id:
            return jsonify({"error": "screen_id gerekli"}), 400
        existing = _screen_registry.get(screen_id, {})
        desired_view = existing.get("desired_view") or (data.get("desired_view") or "").strip() or "match"
        follow_global = bool(existing.get("follow_global", False))
        ip = request.remote_addr or ""
        screen_name = (data.get("screen_name") or "").strip() or existing.get("screen_name") or _assign_screen_name(ip)
        _screen_registry[screen_id] = {
            "screen_id": screen_id,
            "screen_name": screen_name,
            "view": (data.get("view") or "match").strip(),
            "desired_view": desired_view,
            "follow_global": follow_global,
            "override_view": existing.get("override_view"),
            "override_until": existing.get("override_until"),
            "overlay_enabled": bool(data.get("overlay_enabled", False)),
            "last_seen": time.time(),
            "user_agent": request.headers.get("User-Agent", ""),
            "ip": ip,
        }
        return jsonify({"ok": True})

    @bp.get("/api/screens")
    @require_login
    @require_event_manager
    def list_screens():
        _cleanup_screens()
        screens = sorted(_screen_registry.values(), key=lambda item: item.get("last_seen", 0), reverse=True)
        return jsonify(screens)

    @bp.get("/api/screens/view")
    def get_screen_view():
        screen_id = (request.args.get("screen_id") or "").strip()
        global_settings = _get_global_screen_settings(datastore)
        screen = _screen_registry.get(screen_id, {})
        follow_global = bool(screen.get("follow_global", False))
        desired_view = screen.get("desired_view") or "match"
        override_view = screen.get("override_view")
        override_until = screen.get("override_until")
        override_payload = screen.get("override_payload")
        now = time.time()
        if override_view and override_until and now <= override_until:
            active_view = override_view
        elif follow_global:
            active_view = global_settings.get("active_view", "match")
        else:
            active_view = desired_view
        return jsonify(
            {
                "active_view": active_view,
                "overlay_enabled": global_settings.get("overlay_enabled", False),
                "overlay_text": global_settings.get("overlay_text", ""),
                "preview_payload": override_payload if override_view and override_until and now <= override_until else None,
            }
        )

    @bp.post("/api/screens/control")
    @require_login
    @require_event_manager
    def update_screen_control():
        data = request.get_json(force=True) or {}
        screen_id = (data.get("screen_id") or "").strip()
        if not screen_id:
            return jsonify({"error": "screen_id gerekli"}), 400
        screen = _screen_registry.get(screen_id)
        if not screen:
            return jsonify({"error": "Ekran bulunamadı"}), 404
        desired_view = (data.get("desired_view") or screen.get("desired_view") or "match").strip()
        follow_global = bool(data.get("follow_global", False))
        screen["desired_view"] = desired_view
        screen["follow_global"] = follow_global
        _screen_registry[screen_id] = screen
        return jsonify({"ok": True})

    @bp.post("/api/screens/preview")
    @require_login
    @require_event_manager
    def preview_screens():
        data = request.get_json(force=True) or {}
        view = (data.get("view") or "match").strip()
        mode = (data.get("mode") or "preview").strip()
        payload = data.get("payload") if isinstance(data.get("payload"), dict) else {}
        duration_seconds = int(data.get("duration_seconds") or 30)
        global_settings = _get_global_screen_settings(datastore)
        now = time.time()
        for screen_id, screen in _screen_registry.items():
            desired_view = screen.get("desired_view") or "match"
            follow_global = bool(screen.get("follow_global", False))
            if desired_view == view or (follow_global and global_settings.get("active_view") == view):
                if mode == "live":
                    screen["override_view"] = None
                    screen["override_until"] = None
                    screen["override_payload"] = None
                else:
                    screen["override_view"] = view
                    screen["override_until"] = now + duration_seconds
                    screen["override_payload"] = payload
                _screen_registry[screen_id] = screen
        return jsonify({"ok": True})
