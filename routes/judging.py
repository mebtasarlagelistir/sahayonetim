"""
Jüri Görüşme (Judging) Route'ları

Jüri görüşme takvimi, atama ve görüşme durum girişi için endpoint'ler.
İnceleme (inspection) sistemine paraleldir:
- Takvim yalnız yönetici/admin tarafından Kurulum'da üretilir.
- Jüri Danışmanı (juri_danismani) jürileri slotlara atar (/judge-advisor).
- Jüriler (juri_*) görüşme durum/notlarını girer (/judging-progress).
"""

from __future__ import annotations

from datetime import datetime, timedelta
import logging

from flask import jsonify, render_template, request, session

logger = logging.getLogger(__name__)


def register_judging_routes(bp, datastore, require_login, require_event_manager, require_roles, socketio=None):
    """Jüri görüşme route'larını Blueprint'e kaydeder (url_prefix="")."""

    # ---- Sayfalar ----
    @bp.get("/judge-advisor")
    @require_login
    @require_roles("juri_danismani")
    def judge_advisor_page():
        return render_template("judge_advisor.html")

    @bp.get("/judging-progress")
    @require_login
    @require_roles("juri")
    def judging_progress_page():
        return render_template("judging_progress.html")

    # ---- Ayarlar ----
    @bp.get("/api/judging-settings")
    @require_login
    @require_roles("juri")
    def get_judging_settings():
        event_data = datastore.get_event()
        settings = event_data.get("judging_settings", {})
        return jsonify({
            "duration_minutes": settings.get("duration_minutes", 10),
            "rooms": settings.get("rooms", ["Oda 1"]),
        })

    @bp.post("/api/judging-settings")
    @require_login
    @require_event_manager
    def save_judging_settings():
        data = request.get_json(force=True) or {}
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()
        settings = event_data.setdefault("judging_settings", {})
        if "duration_minutes" in data:
            try:
                settings["duration_minutes"] = max(1, int(data["duration_minutes"]))
            except (TypeError, ValueError):
                pass
        if isinstance(data.get("rooms"), list):
            settings["rooms"] = [str(r).strip() for r in data["rooms"] if str(r).strip()]
        datastore.save_event(event_data)
        return jsonify({"ok": True})

    # ---- Slot listeleme / CRUD ----
    @bp.get("/api/judging-slots")
    @require_login
    @require_roles("juri")
    def get_judging_slots():
        slots = datastore.get_judging_slots(
            team_number=request.args.get("team"),
            slot_date=request.args.get("date"),
            status=request.args.get("status"),
        )
        teams = datastore.get_teams()
        team_names = {str(t.get("number", "")).strip(): t.get("name", "") for t in teams}
        for slot in slots:
            slot["team_name"] = team_names.get(str(slot.get("team_number", "")).strip(), "")
        return jsonify(slots)

    @bp.route("/api/judging-slots/<int:slot_id>", methods=["PUT", "POST"])
    @require_login
    @require_roles("juri", "juri_danismani")
    def update_judging_slot(slot_id: int):
        data = request.get_json(force=True) or {}
        try:
            datastore.update_judging_slot(
                slot_id=slot_id,
                team_number=data.get("team_number"),
                slot_date=data.get("slot_date"),
                slot_time=data.get("slot_time"),
                duration_minutes=(int(data["duration_minutes"]) if data.get("duration_minutes") is not None else None),
                room=data.get("room"),
                judge_username=data.get("judge_username"),
                judge_name=data.get("judge_name"),
                status=data.get("status"),
                notes=data.get("notes"),
            )
            if socketio:
                socketio.emit("judging_update", {"slot_id": slot_id, "status": data.get("status")}, namespace="/audience")
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @bp.delete("/api/judging-slots/<int:slot_id>")
    @require_login
    @require_event_manager
    def delete_judging_slot(slot_id: int):
        datastore.delete_judging_slot(slot_id)
        return jsonify({"ok": True})

    @bp.delete("/api/judging-slots")
    @require_login
    @require_event_manager
    def delete_all_judging_slots():
        datastore.delete_all_judging_slots()
        return jsonify({"ok": True})

    @bp.post("/api/judging-slots/bulk-update")
    @require_login
    @require_roles("juri_danismani")
    def bulk_update_judging_slots():
        data = request.get_json(force=True) or {}
        slot_ids = data.get("slot_ids", [])
        if not isinstance(slot_ids, list) or not slot_ids:
            return jsonify({"error": "Güncellenecek slot seçilmedi"}), 400
        judge_username = data.get("judge_username")
        judge_name = data.get("judge_name")
        room = data.get("room")
        status = data.get("status")
        updated = 0
        for sid in slot_ids:
            try:
                datastore.update_judging_slot(
                    slot_id=int(sid),
                    judge_username=judge_username,
                    judge_name=judge_name,
                    room=room,
                    status=status,
                )
                updated += 1
            except Exception:
                continue
        return jsonify({"ok": True, "updated_count": updated})

    # ---- Otomatik takvim üretimi ----
    @bp.post("/api/judging-slots/generate")
    @require_login
    @require_event_manager
    def generate_judging_slots():
        """
        Her takıma bir jüri görüşme slotu üretir; odalara (panel) sırayla dağıtır.
        Her oda kendi zaman çizgisini takip eder (aynı anda oda başına tek görüşme).
        """
        data = request.get_json(force=True) or {}
        start_date = (data.get("start_date") or "").strip()
        start_time = (data.get("start_time") or "").strip()
        duration = data.get("duration_minutes")
        break_minutes = data.get("break_minutes", 0)
        rooms = data.get("rooms") or []
        sort_order = data.get("sort_order", "ascending")
        clear_existing = bool(data.get("clear_existing", False))

        if not start_date or not start_time:
            return jsonify({"error": "Başlangıç tarihi ve saati gerekli"}), 400

        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400

        rooms = [str(r).strip() for r in rooms if str(r).strip()]
        if not rooms:
            rooms = ["Oda 1"]

        try:
            duration = max(1, int(duration))
        except (TypeError, ValueError):
            duration = int(datastore.get_event().get("judging_settings", {}).get("duration_minutes", 10))
        try:
            break_minutes = max(0, int(break_minutes))
        except (TypeError, ValueError):
            break_minutes = 0

        teams = datastore.get_teams()
        team_numbers = [t.get("number", "").strip() for t in teams if t.get("number", "").strip()]
        # Tekilleştir
        seen = set()
        team_numbers = [t for t in team_numbers if not (t in seen or seen.add(t))]
        if not team_numbers:
            return jsonify({"error": "Takım bulunamadı"}), 400

        try:
            base_dt = datetime.strptime(f"{start_date} {start_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            return jsonify({"error": "Geçersiz tarih/saat formatı"}), 400

        if sort_order == "descending":
            team_numbers.sort(key=lambda x: (len(x), x), reverse=True)
        elif sort_order == "random":
            import random
            random.shuffle(team_numbers)
        else:
            team_numbers.sort(key=lambda x: (len(x), x))

        if clear_existing:
            datastore.delete_all_judging_slots(event_id)

        room_times = {room: base_dt for room in rooms}
        created = 0
        for idx, team in enumerate(team_numbers):
            room = rooms[idx % len(rooms)]
            slot_dt = room_times[room]
            try:
                datastore.create_judging_slot(
                    team_number=team,
                    slot_date=slot_dt.strftime("%Y-%m-%d"),
                    slot_time=slot_dt.strftime("%H:%M"),
                    duration_minutes=duration,
                    room=room,
                    status="scheduled",
                    event_id=event_id,
                )
                created += 1
            except Exception:
                pass
            room_times[room] = slot_dt + timedelta(minutes=duration + break_minutes)

        return jsonify({"ok": True, "created_count": created})

    # ---- Jüri hesapları (Jüri Danışmanı paneli için) ----
    @bp.get("/api/judging/judges")
    @require_login
    @require_roles("juri_danismani")
    def get_judges():
        users = datastore.list_users(include_password=True)
        judges = [
            {"username": u.get("username"), "password": u.get("password"), "role": u.get("role")}
            for u in users
            if "juri" in (u.get("role") or "").lower()
        ]
        return jsonify(judges)
