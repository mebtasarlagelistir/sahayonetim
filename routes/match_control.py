"""
Maç Kontrol Route'ları

Bu modül maç kontrol sayfası ve canlı maç yönetimi için API endpoint'lerini içerir.
FTC benzeri maç yönetim ekranı sağlar.

Modüler yapı: Puanlama sistemi src/core/scoring modülünden alınır,
bu sayede puanlama kuralları kolayca güncellenebilir.
"""

from flask import Blueprint, jsonify, request, render_template, Response, stream_with_context, session
from src.core.scoring import ScoreCalculator
from src.core.scoring.realtime import get_realtime_manager
from src.core.constants import MatchConstants
import json
import logging
import time

# Logger oluştur
logger = logging.getLogger(__name__)

# Maç durumları - constants modülünden al
MATCH_STATES = MatchConstants.MATCH_STATES

# Maç zamanlayıcı süreleri (saniye) - constants modülünden al
MATCH_TIMINGS = {
    "autonomous": MatchConstants.AUTONOMOUS_DURATION,
    "prepare_teleop": MatchConstants.PREPARE_TELEOP_DURATION,
    "driver_controlled": MatchConstants.DRIVER_CONTROLLED_DURATION,
    "end_game": MatchConstants.END_GAME_DURATION,
    "post_match": MatchConstants.POST_MATCH_DURATION,
}

# Global maç durumu (her etkinlik için ayrı tutulabilir)
# Gerçek uygulamada bu Redis veya veritabanında tutulmalı
_active_matches = {}


def _normalize_match_source(value: str | None) -> str:
    if value == "practice":
        return "practice"
    return "schedule"


def _build_match_key(event_id: int, match_id: int, match_source: str) -> str:
    return f"{event_id}_{match_source}_{match_id}"


def _refresh_live_state(live_state: dict) -> dict:
    """
    Canlı durum için time_remaining ve state'i günceller.
    """
    if not live_state:
        return {"state": "idle", "time_remaining": 0, "started_at": None}
    time_remaining = live_state.get("time_remaining", 0)
    started_at = live_state.get("started_at")
    current_state = live_state.get("state", "idle")
    if started_at and current_state in MATCH_TIMINGS:
        from datetime import datetime
        try:
            start_time = datetime.fromisoformat(started_at)
            elapsed = (datetime.now() - start_time).total_seconds()
            initial_duration = MATCH_TIMINGS.get(current_state, 0)
            time_remaining = max(0, int(initial_duration - elapsed))
            if time_remaining == 0 and current_state not in ["post_match", "completed"]:
                state_order = ["autonomous", "prepare_teleop", "driver_controlled", "end_game", "post_match"]
                if current_state in state_order:
                    current_index = state_order.index(current_state)
                    if current_index < len(state_order) - 1:
                        current_state = state_order[current_index + 1]
                        live_state["state"] = current_state
                        live_state["time_remaining"] = MATCH_TIMINGS.get(current_state, 0)
                        live_state["started_at"] = datetime.now().isoformat()
                        time_remaining = MATCH_TIMINGS.get(current_state, 0)
            elif time_remaining == 0 and current_state == "post_match":
                # Süre tamamen bitti, maçı tamamlanmış olarak işaretle
                current_state = "completed"
                live_state["state"] = current_state
                live_state["time_remaining"] = 0
                live_state["started_at"] = None
        except (ValueError, TypeError):
            pass
    return {
        "state": current_state,
        "time_remaining": time_remaining,
        "started_at": live_state.get("started_at"),
    }


def register_match_control_routes(bp, datastore, require_login, require_event_manager):
    """
    Maç kontrol route'larını Blueprint'e kaydeder.
    
    Args:
        bp: Blueprint instance
        datastore: DataStore instance
        require_login: require_login decorator
        require_event_manager: require_event_manager decorator
    """
    def _finalize_completed_match(event_id: int, match_id: int, match_source: str) -> None:
        """
        Süresi biten maçı tamamlandı olarak işaretler ve canlı durumu temizler.
        """
        try:
            if match_source == "practice":
                datastore.update_practice_match(match_id=match_id, status="completed")
            else:
                datastore.update_match(match_id=match_id, status="completed")

            match_key = _build_match_key(event_id, match_id, match_source)
            if match_key in _active_matches:
                del _active_matches[match_key]

            realtime_manager = get_realtime_manager()
            realtime_manager.cleanup_match(match_key)
        except Exception as e:
            logger.error(
                f"Maç otomatik tamamlama hatası: {str(e)} (match_id: {match_id})",
                exc_info=True
            )
    
    @bp.route("/match-control")
    @require_login
    def match_control_page():
        """Maç kontrol sayfasını render eder."""
        return render_template("match_control.html")
    
    def _get_active_match_from_store(event_id: int):
        """
        Aktif maçın verisini döner. Önce in_progress, sonra preview durumunu kontrol eder.
        """
        match_source = "schedule"
        matches = datastore.get_match_schedule(
            event_id=event_id,
            status="in_progress"
        )
        if not matches:
            matches = datastore.get_practice_matches(
                event_id=event_id,
                status="in_progress"
            )
            match_source = "practice" if matches else "schedule"

        if matches:
            match = matches[0]
            if match_source == "practice":
                match["match_type"] = "practice"
            match["match_source"] = match_source
            return match

        # Preview durumunu _active_matches üzerinden kontrol et
        preview_key = next((key for key in _active_matches if key.startswith(f"{event_id}_")), None)
        if preview_key:
            _, preview_source, preview_match_id = preview_key.split("_", 2)
            preview_source = _normalize_match_source(preview_source)
            preview_match_id = int(preview_match_id)
            if preview_source == "practice":
                preview_matches = datastore.get_practice_matches(event_id=event_id)
            else:
                preview_matches = datastore.get_match_schedule(event_id=event_id)
            preview_match = next((m for m in preview_matches if m["id"] == preview_match_id), None)
            if preview_match:
                preview_match["match_source"] = preview_source
                preview_match["status"] = "preview"
                preview_match["is_preview"] = True
                if preview_source == "practice":
                    preview_match["match_type"] = "practice"
                return preview_match

        return None

    @bp.route("/api/match-control/active")
    @require_login
    def get_active_match():
        """
        Aktif maç bilgisini döner.
        
        Returns:
            JSON: Aktif maç bilgisi veya null
        """
        event_id = datastore.get_active_event_id()
        if not event_id:
            return jsonify({"match": None})
        
        match = _get_active_match_from_store(event_id)
        if match:
            match_source = match.get("match_source", "schedule")
            match_key = _build_match_key(event_id, match["id"], match_source)
            live_state = _active_matches.get(match_key, {})
            refreshed = _refresh_live_state(live_state)
            if refreshed.get("state") == "completed":
                _finalize_completed_match(event_id, match["id"], match_source)
            match.update({
                "current_state": refreshed.get("state", "idle"),
                "time_remaining": refreshed.get("time_remaining", 0),
                "started_at": refreshed.get("started_at"),
            })
            return jsonify({"match": match})

        return jsonify({"match": None})
    
    @bp.route("/api/match-control/start", methods=["POST"])
    @require_login
    @require_event_manager
    def start_match():
        """
        Maçı başlatır.
        
        Body:
            match_id: Maç ID'si
            field_number: Saha numarası (opsiyonel)
        
        Returns:
            JSON: Başlatma sonucu
        """
        try:
            data = request.get_json() or {}
            match_id = data.get("match_id")
            field_number = data.get("field_number")
            match_source = _normalize_match_source(data.get("match_source"))
            
            if not match_id:
                logger.warning(f"Maç başlatma hatası: match_id eksik (kullanıcı: {session.get('username', 'unknown')})")
                return jsonify({"error": "match_id gerekli"}), 400
            
            event_id = datastore.get_active_event_id()
            if not event_id:
                logger.warning("Maç başlatma hatası: Aktif etkinlik yok")
                return jsonify({"error": "Aktif etkinlik yok"}), 400
            
            # Aktif maç kontrolü - aynı anda birden fazla maç başlatılamaz
            active_matches = datastore.get_match_schedule(
                event_id=event_id,
                status="in_progress"
            )
            practice_active = datastore.get_practice_matches(
                event_id=event_id,
                status="in_progress"
            )
            if active_matches:
                active_match = active_matches[0]
                logger.warning(f"Maç başlatma hatası: Zaten aktif maç var - Maç {active_match['match_number']} (kullanıcı: {session.get('username', 'unknown')})")
                return jsonify({
                    "error": f"Zaten aktif bir maç var: Maç {active_match['match_number']} (Saha {active_match.get('field_number', '?')})"
                }), 409  # Conflict - aynı anda birden fazla maç başlatılamaz
            if practice_active:
                active_match = practice_active[0]
                logger.warning(f"Maç başlatma hatası: Zaten aktif deneme maçı var - Maç {active_match.get('match_number', '?')} (kullanıcı: {session.get('username', 'unknown')})")
                return jsonify({
                    "error": f"Zaten aktif bir deneme maçı var: {active_match.get('match_number', 'Deneme')} (Saha {active_match.get('field_number', '?')})"
                }), 409

            # Preview varsa temizle
            preview_key = next((key for key in _active_matches if key.startswith(f"{event_id}_")), None)
            if preview_key:
                del _active_matches[preview_key]
            
            # Maç bilgisini al
            if match_source == "practice":
                matches = datastore.get_practice_matches(event_id=event_id)
            else:
                matches = datastore.get_match_schedule(event_id=event_id)
            match = next((m for m in matches if m["id"] == match_id), None)
            
            if not match:
                logger.warning(f"Maç başlatma hatası: Maç bulunamadı (match_id: {match_id}, kullanıcı: {session.get('username', 'unknown')})")
                return jsonify({"error": "Maç bulunamadı"}), 404
            
            # Maç durumunu güncelle
            if match_source == "practice":
                datastore.update_practice_match(match_id=match_id, status="in_progress")
            else:
                datastore.update_match(match_id=match_id, status="in_progress")
            
            # Canlı durumu başlat - direkt autonomous'den başla
            from datetime import datetime
            match_key = _build_match_key(event_id, match_id, match_source)
            _active_matches[match_key] = {
                "state": "autonomous",
                "time_remaining": MATCH_TIMINGS["autonomous"],
                "started_at": datetime.now().isoformat(),
                "field_number": field_number or match.get("field_number", 1),
                "match_source": match_source,
            }
            
            logger.info(f"Maç başlatıldı: Maç {match.get('match_number', '?')} (match_id: {match_id}, kullanıcı: {session.get('username', 'unknown')})")
            
            return jsonify({
                "ok": True,
                "match": {
                    "id": match_id,
                    "match_source": match_source,
                    "current_state": "autonomous",
                    "time_remaining": MATCH_TIMINGS["autonomous"],
                }
            })
        except Exception as e:
            logger.error(f"Maç başlatma hatası: {str(e)} (match_id: {data.get('match_id')}, kullanıcı: {session.get('username', 'unknown')})", exc_info=True)
            return jsonify({"error": "Maç başlatılırken bir hata oluştu"}), 500
    
    @bp.route("/api/match-control/stop", methods=["POST"])
    @require_login
    @require_event_manager
    def stop_match():
        """
        Maçı durdurur.
        
        Body:
            match_id: Maç ID'si
        
        Returns:
            JSON: Durdurma sonucu
        """
        try:
            data = request.get_json() or {}
            match_id = data.get("match_id")
            match_source = _normalize_match_source(data.get("match_source"))
            
            if not match_id:
                logger.warning(f"Maç durdurma hatası: match_id eksik (kullanıcı: {session.get('username', 'unknown')})")
                return jsonify({"error": "match_id gerekli"}), 400
            
            event_id = datastore.get_active_event_id()
            if not event_id:
                logger.warning("Maç durdurma hatası: Aktif etkinlik yok")
                return jsonify({"error": "Aktif etkinlik yok"}), 400
            
            # Maç durumunu güncelle
            if match_source == "practice":
                datastore.update_practice_match(match_id=match_id, status="scheduled")
            else:
                datastore.update_match(match_id=match_id, status="scheduled")
            
            # Canlı durumu temizle
            match_key = _build_match_key(event_id, match_id, match_source)
            if match_key in _active_matches:
                del _active_matches[match_key]
            
            logger.info(f"Maç durduruldu: match_id: {match_id} (kullanıcı: {session.get('username', 'unknown')})")
            
            return jsonify({"ok": True})
        except Exception as e:
            logger.error(f"Maç durdurma hatası: {str(e)} (match_id: {data.get('match_id')}, kullanıcı: {session.get('username', 'unknown')})", exc_info=True)
            return jsonify({"error": "Maç durdurulurken bir hata oluştu"}), 500
    
    @bp.route("/api/match-control/state", methods=["POST"])
    @require_login
    @require_event_manager
    def update_match_state():
        """
        Maç durumunu günceller (autonomous -> prepare_teleop -> driver_controlled -> end_game -> post_match).
        
        Body:
            match_id: Maç ID'si
            state: Yeni durum (autonomous, prepare_teleop, driver_controlled, end_game, post_match)
        
        Returns:
            JSON: Güncelleme sonucu
        """
        try:
            data = request.get_json() or {}
            match_id = data.get("match_id")
            new_state = data.get("state") or data.get("new_state")  # Hem "state" hem "new_state" kabul et
            match_source = _normalize_match_source(data.get("match_source"))
            
            if not match_id or not new_state:
                logger.warning(f"Maç durumu güncelleme hatası: match_id veya state eksik (kullanıcı: {session.get('username', 'unknown')})")
                return jsonify({"error": "match_id ve state gerekli"}), 400
            
            if new_state not in MATCH_TIMINGS:
                logger.warning(f"Maç durumu güncelleme hatası: Geçersiz durum '{new_state}' (match_id: {match_id}, kullanıcı: {session.get('username', 'unknown')})")
                return jsonify({"error": f"Geçersiz durum: {new_state}"}), 400
            
            event_id = datastore.get_active_event_id()
            if not event_id:
                logger.warning("Maç durumu güncelleme hatası: Aktif etkinlik yok")
                return jsonify({"error": "Aktif etkinlik yok"}), 400
            
            match_key = _build_match_key(event_id, match_id, match_source)
            if match_key not in _active_matches:
                logger.warning(f"Maç durumu güncelleme hatası: Aktif maç bulunamadı (match_id: {match_id}, kullanıcı: {session.get('username', 'unknown')})")
                return jsonify({"error": "Aktif maç bulunamadı"}), 404
            
            # Durumu güncelle
            from datetime import datetime
            _active_matches[match_key]["state"] = new_state
            _active_matches[match_key]["time_remaining"] = MATCH_TIMINGS[new_state]
            _active_matches[match_key]["started_at"] = datetime.now().isoformat()
            
            logger.info(f"Maç durumu güncellendi: match_id={match_id}, state={new_state} (kullanıcı: {session.get('username', 'unknown')})")
            
            return jsonify({
                "ok": True,
                "state": new_state,
                "time_remaining": MATCH_TIMINGS[new_state],
            })
        except Exception as e:
            logger.error(f"Maç durumu güncelleme hatası: {str(e)} (match_id: {data.get('match_id')}, state: {data.get('state')}, kullanıcı: {session.get('username', 'unknown')})", exc_info=True)
            return jsonify({"error": "Maç durumu güncellenirken bir hata oluştu"}), 500

    @bp.route("/api/match-control/preview", methods=["POST"])
    @require_login
    @require_event_manager
    def preview_match():
        """
        Hakem tabletleri için maçı önizleme durumuna alır (DB status güncellenmez).
        """
        try:
            data = request.get_json() or {}
            match_id = data.get("match_id")
            match_source = _normalize_match_source(data.get("match_source"))

            if not match_id:
                return jsonify({"error": "match_id gerekli"}), 400

            event_id = datastore.get_active_event_id()
            if not event_id:
                return jsonify({"error": "Aktif etkinlik yok"}), 400

            # Aktif maç varsa önizleme yapılmasın
            active_matches = datastore.get_match_schedule(
                event_id=event_id,
                status="in_progress"
            )
            practice_active = datastore.get_practice_matches(
                event_id=event_id,
                status="in_progress"
            )
            if active_matches or practice_active:
                return jsonify({"error": "Aktif maç varken önizleme yapılamaz"}), 409

            if match_source == "practice":
                matches = datastore.get_practice_matches(event_id=event_id)
            else:
                matches = datastore.get_match_schedule(event_id=event_id)
            match = next((m for m in matches if m["id"] == match_id), None)
            if not match:
                return jsonify({"error": "Maç bulunamadı"}), 404

            match_key = _build_match_key(event_id, match_id, match_source)
            _active_matches[match_key] = {
                "state": "idle",
                "time_remaining": 0,
                "started_at": None,
                "field_number": match.get("field_number", 1),
                "match_source": match_source,
                "preview": True,
            }
            return jsonify({"ok": True})
        except Exception as e:
            logger.error(f"Maç önizleme hatası: {str(e)}", exc_info=True)
            return jsonify({"error": "Maç önizleme sırasında bir hata oluştu"}), 500
    
    @bp.route("/api/match-control/score", methods=["POST"])
    @require_login
    @require_event_manager
    def update_score():
        """
        Maç skorunu günceller.
        
        Body:
            match_id: Maç ID'si
            red_score: Kırmızı ittifak skoru
            blue_score: Mavi ittifak skoru
        
        Returns:
            JSON: Güncelleme sonucu
        """
        try:
            data = request.get_json() or {}
            match_id = data.get("match_id")
            red_score = data.get("red_score")
            blue_score = data.get("blue_score")
            match_source = _normalize_match_source(data.get("match_source"))
            scoring_data = data.get("scoring_data")
            notes = data.get("notes")
            match_source = _normalize_match_source(data.get("match_source"))
            
            if not match_id:
                logger.warning(f"Skor güncelleme hatası: match_id eksik (kullanıcı: {session.get('username', 'unknown')})")
                return jsonify({"error": "match_id gerekli"}), 400
            
            # Skorları güncelle
            update_data = {}
            if red_score is not None:
                update_data["red_score"] = int(red_score)
            if blue_score is not None:
                update_data["blue_score"] = int(blue_score)
            if isinstance(scoring_data, dict):
                update_data["scoring_data"] = scoring_data
            if notes is not None:
                update_data["notes"] = str(notes)
            
            if update_data:
                if match_source == "practice":
                    datastore.update_practice_match(match_id=match_id, **update_data)
                else:
                    datastore.update_match(match_id=match_id, **update_data)
                logger.info(f"Skor güncellendi: match_id={match_id}, red={update_data.get('red_score')}, blue={update_data.get('blue_score')} (kullanıcı: {session.get('username', 'unknown')})")
            
            return jsonify({"ok": True})
        except (ValueError, TypeError) as e:
            logger.warning(f"Skor güncelleme hatası: Geçersiz skor değeri - {str(e)} (match_id: {data.get('match_id')}, kullanıcı: {session.get('username', 'unknown')})")
            return jsonify({"error": "Geçersiz skor değeri"}), 400
        except Exception as e:
            logger.error(f"Skor güncelleme hatası: {str(e)} (match_id: {data.get('match_id')}, kullanıcı: {session.get('username', 'unknown')})", exc_info=True)
            return jsonify({"error": "Skor güncellenirken bir hata oluştu"}), 500
    
    @bp.route("/api/match-control/score/detailed", methods=["POST"])
    @require_login
    def update_detailed_score():
        """
        Detaylı puanlama verilerini günceller (modüler puanlama sistemi kullanır).
        
        Bu endpoint hakemlerden gelen detaylı puanlama verilerini alır,
        modüler puanlama sistemi ile hesaplar ve gerçek zamanlı olarak
        tüm bağlı cihazlara yayınlar.
        
        Body:
            match_id: Maç ID'si
            alliance: "red" veya "blue"
            scoring_data: {
                "auto_leave_r1": bool,
                "auto_leave_r2": bool,
                "auto_bent1_own": int,
                "auto_bent1_opponent": int,
                ...
            }
            updated_by: Kullanıcı adı (opsiyonel)
        
        Returns:
            JSON: {
                "ok": true,
                "calculated_score": int,
                "breakdown": {...}
            }
        """
        try:
            data = request.get_json() or {}
            match_id = data.get("match_id")
            alliance = data.get("alliance")  # "red" veya "blue"
            scoring_data = data.get("scoring_data", {})
            updated_by = session.get("username", "unknown")
            match_source = _normalize_match_source(data.get("match_source"))
            
            if not match_id or not alliance:
                logger.warning(f"Detaylı skor güncelleme hatası: match_id veya alliance eksik (kullanıcı: {updated_by})")
                return jsonify({"error": "match_id ve alliance gerekli"}), 400
            
            if alliance not in ["red", "blue"]:
                logger.warning(f"Detaylı skor güncelleme hatası: Geçersiz alliance '{alliance}' (kullanıcı: {updated_by})")
                return jsonify({"error": "alliance 'red' veya 'blue' olmalı"}), 400
            
            event_id = datastore.get_active_event_id()
            if not event_id:
                logger.warning("Detaylı skor güncelleme hatası: Aktif etkinlik yok")
                return jsonify({"error": "Aktif etkinlik yok"}), 400

            # Mevcut maç verisini al (kayıtlı scoring_data için)
            if match_source == "practice":
                matches = datastore.get_practice_matches(event_id=event_id)
            else:
                matches = datastore.get_match_schedule(event_id=event_id)
            match = next((m for m in matches if m["id"] == match_id), None)
            if not match:
                logger.warning(f"Detaylı skor güncelleme hatası: Maç bulunamadı (match_id: {match_id}, kullanıcı: {updated_by})")
                return jsonify({"error": "Maç bulunamadı"}), 404
            
            # Modüler puanlama hesaplayıcısını kullan
            calculator = ScoreCalculator()
            
            # Rakip ittifakın verilerini al (cezalar ve rakip alana verilen puanlar için)
            match_key = _build_match_key(event_id, match_id, match_source)
            realtime_manager = get_realtime_manager()
            current_scores = realtime_manager.get_current_scores(match_key)
            
            opponent_alliance = "blue" if alliance == "red" else "red"
            opponent_data = {}
            if current_scores:
                opponent_data = current_scores.get(opponent_alliance, {})
            
            # Skorları hesapla
            result = calculator.calculate_alliance_score(
                alliance=alliance,
                scoring_data=scoring_data,
                opponent_scoring_data=opponent_data
            )
            
            # Gerçek zamanlı yöneticiye kaydet
            realtime_manager.update_score(
                match_key=match_key,
                alliance=alliance,
                scoring_data=scoring_data,
                updated_by=updated_by
            )

            # scoring_data'yı veritabanında sakla (ittifak bazlı)
            persisted = match.get("scoring_data") if isinstance(match.get("scoring_data"), dict) else {}
            persisted[alliance] = scoring_data
            if match_source == "practice":
                datastore.update_practice_match(match_id=match_id, scoring_data=persisted)
            else:
                datastore.update_match(match_id=match_id, scoring_data=persisted)
            
            # Veritabanında toplam skorları güncelle
            if alliance == "red":
                if match_source == "practice":
                    datastore.update_practice_match(match_id=match_id, red_score=result["total_score"])
                else:
                    datastore.update_match(match_id=match_id, red_score=result["total_score"])
            else:
                if match_source == "practice":
                    datastore.update_practice_match(match_id=match_id, blue_score=result["total_score"])
                else:
                    datastore.update_match(match_id=match_id, blue_score=result["total_score"])
            
            logger.info(f"Detaylı skor güncellendi: match_id={match_id}, alliance={alliance}, score={result['total_score']} (kullanıcı: {updated_by})")
            
            return jsonify({
                "ok": True,
                "calculated_score": result["total_score"],
                "breakdown": result["breakdown"],
                "alliance": alliance
            })
        except Exception as e:
            logger.error(f"Detaylı skor güncelleme hatası: {str(e)} (match_id: {data.get('match_id')}, alliance: {data.get('alliance')}, kullanıcı: {session.get('username', 'unknown')})", exc_info=True)
            return jsonify({"error": "Skor güncellenirken bir hata oluştu"}), 500
    
    @bp.route("/api/match-control/score/realtime/<int:match_id>")
    @require_login
    def score_realtime_stream(match_id):
        """
        Server-Sent Events (SSE) stream'i - gerçek zamanlı skor güncellemeleri.
        
        Bu endpoint tüm bağlı cihazlara (baş hakem, hakemler, tabletler)
        skor güncellemelerini gerçek zamanlı olarak gönderir.
        
        Args:
            match_id: Maç ID'si
        
        Returns:
            SSE stream: Gerçek zamanlı skor güncellemeleri
        """
        event_id = datastore.get_active_event_id()
        if not event_id:
            return jsonify({"error": "Aktif etkinlik yok"}), 400
        
        match_source = _normalize_match_source(request.args.get("source"))
        match_key = _build_match_key(event_id, match_id, match_source)
        realtime_manager = get_realtime_manager()
        realtime_manager.register_match(match_key)
        
        def generate():
            """SSE event'lerini üretir."""
            # İlk bağlantıda mevcut skorları gönder
            current = realtime_manager.get_current_scores(match_key)
            if current:
                yield f"data: {json.dumps({'type': 'initial', 'scores': current})}\n\n"
            
            # Polling ile güncellemeleri kontrol et (SSE için)
            last_update = current.get("last_updated") if current else None
            while True:
                time.sleep(0.5)  # 500ms'de bir kontrol et
                current = realtime_manager.get_current_scores(match_key)
                
                if current and current.get("last_updated") != last_update:
                    last_update = current.get("last_updated")
                    yield f"data: {json.dumps({'type': 'update', 'scores': current})}\n\n"
        
        return Response(
            stream_with_context(generate()),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no"
            }
        )
    
    @bp.route("/api/match-control/complete", methods=["POST"])
    @require_login
    @require_event_manager
    def complete_match():
        """
        Maçı tamamlar ve skorları kaydeder.
        
        Body:
            match_id: Maç ID'si
            red_score: Kırmızı ittifak skoru
            blue_score: Mavi ittifak skoru
        
        Returns:
            JSON: Tamamlama sonucu
        """
        try:
            data = request.get_json() or {}
            match_id = data.get("match_id")
            red_score = data.get("red_score")
            blue_score = data.get("blue_score")
            match_source = _normalize_match_source(data.get("match_source"))
            
            if not match_id:
                logger.warning(f"Maç tamamlama hatası: match_id eksik (kullanıcı: {session.get('username', 'unknown')})")
                return jsonify({"error": "match_id gerekli"}), 400
            
            event_id = datastore.get_active_event_id()
            if not event_id:
                logger.warning("Maç tamamlama hatası: Aktif etkinlik yok")
                return jsonify({"error": "Aktif etkinlik yok"}), 400
            
            # Skorları ve durumu güncelle
            update_data = {"status": "completed"}
            if red_score is not None:
                update_data["red_score"] = int(red_score)
            if blue_score is not None:
                update_data["blue_score"] = int(blue_score)
            
            if match_source == "practice":
                datastore.update_practice_match(match_id=match_id, **update_data)
            else:
                datastore.update_match(match_id=match_id, **update_data)
            
            # Canlı durumu temizle
            match_key = _build_match_key(event_id, match_id, match_source)
            if match_key in _active_matches:
                del _active_matches[match_key]
            
            logger.info(f"Maç tamamlandı: match_id={match_id}, red={update_data.get('red_score')}, blue={update_data.get('blue_score')} (kullanıcı: {session.get('username', 'unknown')})")
            
            return jsonify({"ok": True})
        except (ValueError, TypeError) as e:
            logger.warning(f"Maç tamamlama hatası: Geçersiz skor değeri - {str(e)} (match_id: {data.get('match_id')}, kullanıcı: {session.get('username', 'unknown')})")
            return jsonify({"error": "Geçersiz skor değeri"}), 400
        except Exception as e:
            logger.error(f"Maç tamamlama hatası: {str(e)} (match_id: {data.get('match_id')}, kullanıcı: {session.get('username', 'unknown')})", exc_info=True)
            return jsonify({"error": "Maç tamamlanırken bir hata oluştu"}), 500
    
    @bp.route("/api/match-control/audience-display")
    def audience_display():
        """
        Audience display için canlı maç bilgisini döner.
        Bu endpoint kimlik doğrulama gerektirmez (herkese açık).
        
        Returns:
            JSON: Canlı maç bilgisi (skorlar, durum, takımlar)
        """
        event_id = datastore.get_active_event_id()
        if not event_id:
            return jsonify({"match": None})
        
        # Aktif maçı al (önce resmi, sonra deneme)
        match_source = "schedule"
        matches = datastore.get_match_schedule(
            event_id=event_id,
            status="in_progress"
        )
        if not matches:
            matches = datastore.get_practice_matches(
                event_id=event_id,
                status="in_progress"
            )
            match_source = "practice" if matches else "schedule"
        
        if not matches:
            return jsonify({"match": None})
        
        match = matches[0]
        if match_source == "practice":
            match["match_type"] = "practice"
        match_key = _build_match_key(event_id, match["id"], match_source)
        live_state = _active_matches.get(match_key, {})
        refreshed = _refresh_live_state(live_state)
        if refreshed.get("state") == "completed":
            _finalize_completed_match(event_id, match["id"], match_source)
        
        return jsonify({
            "match": {
                "id": match["id"],
                "match_number": match["match_number"],
                "match_type": match.get("match_type", "practice" if match_source == "practice" else "qualification"),
                "match_source": match_source,
                "field_number": match.get("field_number", 1),
                "red_alliance": match["red_alliance"],
                "blue_alliance": match["blue_alliance"],
                "red_score": match.get("red_score", 0),
                "blue_score": match.get("blue_score", 0),
                "current_state": refreshed.get("state", "idle"),
                "time_remaining": refreshed.get("time_remaining", 0),
                "state_label": MATCH_STATES.get(refreshed.get("state", "idle"), "Beklemede"),
            }
        })
    
    @bp.route("/api/match-control/next-match")
    @require_login
    def get_next_match():
        """
        Sıradaki maçı döner.
        
        Returns:
            JSON: Sıradaki maç bilgisi
        """
        event_id = datastore.get_active_event_id()
        if not event_id:
            return jsonify({"match": None})
        
        # Scheduled durumundaki ilk maçı al
        matches = datastore.get_match_schedule(
            event_id=event_id,
            status="scheduled"
        )
        
        if matches:
            return jsonify({"match": matches[0]})
        
        return jsonify({"match": None})

    @bp.route("/api/public/next-match")
    def get_next_match_public():
        """
        Seyirci ekranı için sıradaki maçı döner (giriş gerektirmez).
        """
        event_id = datastore.get_active_event_id()
        if not event_id:
            return jsonify({"match": None})
        matches = datastore.get_match_schedule(
            event_id=event_id,
            status="scheduled"
        )
        if matches:
            return jsonify({"match": matches[0]})
        return jsonify({"match": None})
