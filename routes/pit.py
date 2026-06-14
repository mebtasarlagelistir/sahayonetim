"""
Pit (Saha / Etkinlik Alanı) Yönetimi Route'ları

Pit yöneticisinin takım operasyonel durumlarını yönettiği sayfa ve API'ler:
- Alana giriş (check-in), sertifika durumu, kayıp eşya, takım notları.

Erişim: 'pit' rolü (pit_yoneticisi) ve admin. (require_roles admin'i her zaman geçirir.)
"""

import logging
from flask import jsonify, render_template, request

logger = logging.getLogger(__name__)

PIT_ROLE = "pit"


def register_pit_routes(bp, datastore, require_login, require_roles):
    @bp.get("/pit-admin")
    @require_login
    @require_roles(PIT_ROLE)
    def pit_admin_page():
        return render_template("pit_admin.html")

    @bp.get("/api/pit/teams")
    @require_login
    @require_roles(PIT_ROLE)
    def pit_teams():
        try:
            return jsonify({
                "ok": True,
                "teams": datastore.get_pit_statuses(),
                "summary": datastore.get_pit_summary(),
            })
        except Exception as e:
            logger.error("pit_teams error: %s", e, exc_info=True)
            return jsonify({"ok": False, "error": str(e)}), 500

    @bp.post("/api/pit/status")
    @require_login
    @require_roles(PIT_ROLE)
    def pit_set_status():
        data = request.get_json(force=True) or {}
        team = (data.get("team_number") or "").strip()
        if not team:
            return jsonify({"ok": False, "error": "team_number gerekli"}), 400
        kwargs = {}
        if "checked_in" in data:
            kwargs["checked_in"] = bool(data.get("checked_in"))
        if "certificate_status" in data:
            cs = (data.get("certificate_status") or "").strip()
            if cs not in ("received", "pending"):
                return jsonify({"ok": False, "error": "certificate_status 'received'/'pending' olmalı"}), 400
            kwargs["certificate_status"] = cs
        if "notes" in data:
            kwargs["notes"] = str(data.get("notes") or "")
        if not kwargs:
            return jsonify({"ok": False, "error": "Güncellenecek alan yok"}), 400
        try:
            res = datastore.set_pit_status(None, team, **kwargs)
            code = 200 if res.get("ok") else 400
            return jsonify(res), code
        except Exception as e:
            logger.error("pit_set_status error: %s", e, exc_info=True)
            return jsonify({"ok": False, "error": str(e)}), 500

    @bp.post("/api/pit/lost-item")
    @require_login
    @require_roles(PIT_ROLE)
    def pit_add_lost_item():
        data = request.get_json(force=True) or {}
        team = (data.get("team_number") or "").strip()
        desc = (data.get("description") or "").strip()
        if not team or not desc:
            return jsonify({"ok": False, "error": "team_number ve description gerekli"}), 400
        try:
            res = datastore.add_lost_item(None, team, desc)
            return jsonify(res), (200 if res.get("ok") else 400)
        except Exception as e:
            logger.error("pit_add_lost_item error: %s", e, exc_info=True)
            return jsonify({"ok": False, "error": str(e)}), 500

    @bp.post("/api/pit/lost-item/resolve")
    @require_login
    @require_roles(PIT_ROLE)
    def pit_resolve_lost_item():
        data = request.get_json(force=True) or {}
        team = (data.get("team_number") or "").strip()
        try:
            index = int(data.get("index"))
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "index gerekli"}), 400
        resolved = bool(data.get("resolved", True))
        if not team:
            return jsonify({"ok": False, "error": "team_number gerekli"}), 400
        try:
            res = datastore.resolve_lost_item(None, team, index, resolved=resolved)
            return jsonify(res), (200 if res.get("ok") else 400)
        except Exception as e:
            logger.error("pit_resolve_lost_item error: %s", e, exc_info=True)
            return jsonify({"ok": False, "error": str(e)}), 500
