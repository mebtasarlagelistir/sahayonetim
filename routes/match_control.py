"""
Maç Kontrol Route'ları

Bu modül maç kontrol sayfası ve canlı maç yönetimi için API endpoint'lerini içerir.
FTC benzeri maç yönetim ekranı sağlar.

Modüler yapı: Puanlama sistemi src/core/scoring modülünden alınır,
bu sayede puanlama kuralları kolayca güncellenebilir.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request, render_template, session
from flask_socketio import emit, join_room, leave_room
# ScoreCalculator artık realtime_manager içinde kullanılıyor (tek bir yerde hesaplama), RankingPointsCalculator
from src.core.scoring.realtime import get_realtime_manager
from src.core.match_state import get_match_state_manager
from src.core.constants import MatchConstants
import json
import logging
import time
import uuid
import threading

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

# Not: Artık MatchStateManager kullanılıyor, _active_matches kaldırıldı


def _normalize_match_source(value: str | None) -> str:
    if value == "practice":
        return "practice"
    return "schedule"


def _build_match_key(event_id: int, match_id: int, match_source: str) -> str:
    return f"{event_id}_{match_source}_{match_id}"


# Not: _refresh_live_state fonksiyonu kaldırıldı
# Timer güncellemesi artık MatchStateManager.refresh_match_state() içinde yapılıyor


def register_match_control_routes(bp, datastore, require_login, require_event_manager, socketio=None):
    """
    Maç kontrol route'larını Blueprint'e kaydeder.
    
    Args:
        bp: Blueprint instance
        datastore: DataStore instance
        require_login: require_login decorator
        require_event_manager: require_event_manager decorator
        socketio: SocketIO instance (WebSocket için)
    """
    # SocketIO instance'ını al (app'ten)
    if socketio is None:
        from flask import current_app
        socketio = current_app.socketio if hasattr(current_app, 'socketio') else None
    
    # Merkezi maç durumu yöneticisi
    match_state_manager = get_match_state_manager(datastore)
    def _finalize_completed_match(event_id: int, match_id: int, match_source: str) -> None:
        """
        Süresi biten maçı tamamlandı olarak işaretler ve canlı durumu temizler.
        Rankings güncellemesini audience ekranlarına bildirir.
        """
        try:
            if match_source == "practice":
                datastore.update_practice_match(match_id=match_id, status="completed")
            else:
                datastore.update_match(match_id=match_id, status="completed")

            match_key = _build_match_key(event_id, match_id, match_source)
            realtime_manager = get_realtime_manager()
            realtime_manager.cleanup_match(match_key)
            
            # WebSocket ile tüm audience ekranlarına maç tamamlandı ve rankings güncellemesi bildir
            if socketio:
                socketio.emit("match_completed", {
                    "type": "match_completed",
                    "match_id": match_id,
                    "match_source": match_source
                }, namespace="/audience")
                
                # Rankings güncellemesi (maç tamamlandığında sıralama değişir)
                socketio.emit("rankings_update", {
                    "type": "rankings_update",
                    "reason": "match_completed"
                }, namespace="/audience")
                logger.info(f"Match completed broadcast: match_id={match_id}")
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
    
    # Timer güncelleme cache'i (her maç için son güncelleme zamanı)
    # Module-level değişkenler (fonksiyon dışında)
    _last_refresh_time_cache = {}  # {match_key: timestamp}
    _refresh_interval_seconds = 0.5  # 500ms'de bir güncelle (performans için)
    
    def _get_active_match_from_store(event_id: int):
        """
        Aktif maçın verisini döner. Merkezi MatchStateManager kullanır.
        
        NOT: Timer güncellemesi sadece belirli aralıklarla yapılır (performans için).
        """
        try:
            # Merkezi yöneticiden aktif maçı al
            match = match_state_manager.get_active_match(event_id)
            
            if match:
                # Timer güncellemesi yap (sadece in_progress maçlar için ve belirli aralıklarla)
                if match.get("status") == "in_progress":
                    match_key = _build_match_key(event_id, match["id"], match.get("match_source", "schedule"))
                    
                    # Son güncelleme zamanını kontrol et (performans için throttling)
                    import time as time_module
                    current_time = time_module.time()
                    last_refresh = _last_refresh_time_cache.get(match_key, 0)
                    
                    # Sadece belirli aralıklarla güncelle (performans için)
                    if current_time - last_refresh >= _refresh_interval_seconds:
                        try:
                            refreshed_state = match_state_manager.refresh_match_state(event_id, match_key)
                            
                            if refreshed_state:
                                # Güncellenmiş durumu response'a ekle
                                match["current_state"] = refreshed_state.get("state", match.get("current_state", "idle"))
                                match["time_remaining"] = refreshed_state.get("time_remaining", match.get("time_remaining", 0))
                                match["started_at"] = refreshed_state.get("started_at", match.get("started_at"))
                            
                            # Son güncelleme zamanını kaydet
                            _last_refresh_time_cache[match_key] = current_time
                        except Exception as refresh_err:
                            # Refresh hatası durumunda mevcut değerleri kullan
                            logger.warning(f"Timer refresh hatası: {str(refresh_err)}")
                
                return match
            
            return None
        except Exception as e:
            # Hata durumunda log yaz ama işlemi durdurma
            logger.error(f"_get_active_match_from_store hatası: {str(e)}", exc_info=True)
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
            logger.info("get_active_match: Aktif etkinlik yok")
            return jsonify({"match": None})
        
        # Log'u sadece ilk çağrıda veya hata durumunda yaz (performans için)
        match = _get_active_match_from_store(event_id)
        if match:
            match_source = match.get("match_source", "schedule")
            match_id = match.get("id")
            if not match_id:
                return jsonify({"match": None})
            
            # Eksik alanları kontrol et ve ekle
            if "match_number" not in match:
                match["match_number"] = match.get("match_number", "?")
            if "match_type" not in match:
                match["match_type"] = match.get("match_type", "qualification")
            if "field_number" not in match:
                match["field_number"] = match.get("field_number", 1)
            if "red_alliance" not in match:
                match["red_alliance"] = match.get("red_alliance", [])
            if "blue_alliance" not in match:
                match["blue_alliance"] = match.get("blue_alliance", [])
            # ÖNEMLİ: match_source alanını ekle (hakem paneli için gerekli)
            if "match_source" not in match:
                match["match_source"] = match_source
            # source alanını da ekle (geriye dönük uyumluluk için)
            if "source" not in match:
                match["source"] = match_source
            
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

            # Preview durumundaki maçları temizle (MatchStateManager otomatik yapar)
            
            # Maç bilgisini al
            if match_source == "practice":
                matches = datastore.get_practice_matches(event_id=event_id)
            else:
                matches = datastore.get_match_schedule(event_id=event_id)
            match = next((m for m in matches if m["id"] == match_id), None)
            
            if not match:
                logger.warning(f"Maç başlatma hatası: Maç bulunamadı (match_id: {match_id}, kullanıcı: {session.get('username', 'unknown')})")
                return jsonify({"error": "Maç bulunamadı"}), 404
            
            # Robot durumlarını kaydet (eğer gönderildiyse)
            # ÖNEMLİ: Robot durumları maç başlatıldığında kaydedilmeli
            team_statuses = data.get("team_statuses")
            if isinstance(team_statuses, dict):
                # Robot durumlarını scoring_data'ya ekle
                scoring_data = match.get("scoring_data") if isinstance(match.get("scoring_data"), dict) else {}
                if "team_statuses" not in scoring_data:
                    scoring_data["team_statuses"] = {}
                scoring_data["team_statuses"].update(team_statuses)
                
                # Surrogate teams listesi oluştur (RY durumundaki robotlar için)
                surrogate_teams = []
                for alliance, teams in team_statuses.items():
                    if isinstance(teams, dict):
                        for robot_key, status in teams.items():
                            if status == "ry":
                                # Robot index'ini al (r1, r2 -> 1, 2)
                                try:
                                    robot_index = int(robot_key.replace("r", "")) - 1
                                    alliance_teams = match.get(f"{alliance}_alliance", [])
                                    if 0 <= robot_index < len(alliance_teams):
                                        surrogate_teams.append(alliance_teams[robot_index])
                                except (ValueError, IndexError):
                                    logger.warning(f"Robot durumu kaydedilirken hata: Geçersiz robot index - {robot_key}")
                
                # Scoring data'yı güncelle
                if match_source == "practice":
                    datastore.update_practice_match(match_id=match_id, scoring_data=scoring_data)
                    if surrogate_teams:
                        current_surrogate = match.get("surrogate_teams") or []
                        updated_surrogate = list(set(current_surrogate + surrogate_teams))
                        datastore.update_practice_match(match_id=match_id, surrogate_teams=updated_surrogate)
                else:
                    datastore.update_match(match_id=match_id, scoring_data=scoring_data)
                    if surrogate_teams:
                        current_surrogate = match.get("surrogate_teams") or []
                        updated_surrogate = list(set(current_surrogate + surrogate_teams))
                        datastore.update_match(match_id=match_id, surrogate_teams=updated_surrogate)
                
                # Match data'yı güncelle (MatchStateManager'a gönderilecek)
                match["scoring_data"] = scoring_data
                if surrogate_teams:
                    match["surrogate_teams"] = updated_surrogate
                
                logger.info(f"Robot durumları kaydedildi: match_id={match_id}, team_statuses={team_statuses} (kullanıcı: {session.get('username', 'unknown')})")
            
            # Merkezi MatchStateManager ile maçı aktif duruma al
            match_state_manager.set_match_active(
                event_id=event_id,
                match_id=match_id,
                match_source=match_source,
                match_data=match,
                initial_state="autonomous"
            )
            
            logger.info(f"Maç başlatıldı: Maç {match.get('match_number', '?')} (match_id: {match_id}, kullanıcı: {session.get('username', 'unknown')})")
            
            # Güncel maç bilgisini al ve döndür
            active_match = match_state_manager.get_active_match(event_id)
            
            # WebSocket ile tüm abone olan client'lara hemen match_state gönder (timer başlatma için)
            if socketio and active_match:
                room = _get_match_room(event_id, match_id, match_source)
                match_data = dict(active_match)
                match_data["server_timestamp"] = time.time()  # Timer senkronizasyonu için
                socketio.emit("match_state", {
                    "type": "match_state",
                    "match": match_data
                }, room=room, namespace="/match")
                logger.info(f"WebSocket match_state gönderildi (maç başlatıldı): room={room}")
            
            if active_match:
                return jsonify({
                    "ok": True,
                    "match": active_match
                })
            
            # Fallback: Eğer MatchStateManager'dan alınamazsa, manuel oluştur
            from datetime import datetime
            match["status"] = "in_progress"
            match["match_source"] = match_source
            match["current_state"] = "autonomous"
            match["time_remaining"] = MATCH_TIMINGS["autonomous"]
            match["started_at"] = datetime.now().isoformat()
            
            return jsonify({
                "ok": True,
                "match": match
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
            
            # MatchStateManager ile maçı durdur (cache'den kaldırır ve veritabanını günceller)
            match_state_manager.stop_match(
                event_id=event_id,
                match_id=match_id,
                match_source=match_source
            )
            
            # Güncel maç bilgisini al (durdurulduktan sonra scheduled durumunda)
            match = None
            if match_source == "practice":
                matches = datastore.get_practice_matches(event_id=event_id, status="scheduled")
                match = next((m for m in matches if m["id"] == match_id), None)
            else:
                matches = datastore.get_match_schedule(event_id=event_id, status="scheduled")
                match = next((m for m in matches if m["id"] == match_id), None)
            
            # Match source bilgisini ekle
            if match:
                match["source"] = match_source
                match["match_type"] = match.get("match_type", "qualification")
            
            logger.info(f"Maç durduruldu: match_id: {match_id} (kullanıcı: {session.get('username', 'unknown')})")
            
            return jsonify({
                "ok": True,
                "match": match
            })
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
            
            # Merkezi MatchStateManager ile durumu güncelle
            match_state_manager.update_match_state(
                event_id=event_id,
                match_id=match_id,
                match_source=match_source,
                state=new_state,
                time_remaining=MATCH_TIMINGS[new_state]
            )
            
            logger.info(f"Maç durumu güncellendi: match_id={match_id}, state={new_state} (kullanıcı: {session.get('username', 'unknown')})")
            
            # Güncel durumu al
            active_match = match_state_manager.get_active_match(event_id)
            
            # WebSocket ile tüm abone olan client'lara hemen match_state gönder (timer güncelleme için)
            if socketio and active_match:
                room = _get_match_room(event_id, match_id, match_source)
                match_data = dict(active_match)
                match_data["server_timestamp"] = time.time()  # Timer senkronizasyonu için
                socketio.emit("match_state", {
                    "type": "match_state",
                    "match": match_data
                }, room=room, namespace="/match")
                logger.info(f"WebSocket match_state gönderildi (durum güncellendi): room={room}, state={new_state}")
            
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

            # Aktif maç varsa bile preview yapılabilir
            # get_active_match önce in_progress maçı döndürür, sonra preview'ı
            # Bu sayede match control sayfasında seçilen maç görünür ama
            # hakem panelleri ve seyirci ekranları aktif maçı görmeye devam eder

            if match_source == "practice":
                matches = datastore.get_practice_matches(event_id=event_id)
            else:
                matches = datastore.get_match_schedule(event_id=event_id)
            match = next((m for m in matches if m["id"] == match_id), None)
            if not match:
                return jsonify({"error": "Maç bulunamadı"}), 404

            # Merkezi MatchStateManager ile preview durumuna al
            match_state_manager.set_match_preview(
                event_id=event_id,
                match_id=match_id,
                match_source=match_source,
                match_data=match
            )
            
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
            
            # Gerçek zamanlı yöneticiye kaydet (skor hesaplaması otomatik yapılır)
            match_key = _build_match_key(event_id, match_id, match_source)
            realtime_manager = get_realtime_manager()
            realtime_manager.update_score(
                match_key=match_key,
                alliance=alliance,
                scoring_data=scoring_data,
                updated_by=updated_by
            )
            
            # Hesaplanmış skorları al (tek bir yerde hesaplanır - modüler yapı)
            current_scores = realtime_manager.get_current_scores(match_key)
            calculated_scores = current_scores.get("calculated_scores", {}) if current_scores else {}
            result = calculated_scores.get(alliance, {})
            
            # Eğer hesaplanmış skor yoksa (ilk güncelleme), varsayılan değerler
            if not result:
                result = {"total_score": 0, "breakdown": {}}
            
            # WebSocket ile diğer client'lara broadcast yap (hakem paneli, audience display için)
            if socketio:
                room = _get_match_room(event_id, match_id, match_source)
                current_scores = realtime_manager.get_current_scores(match_key)
                if current_scores:
                    response_data = dict(current_scores)
                    if "team_statuses" in current_scores:
                        response_data["team_statuses"] = current_scores["team_statuses"]
                    response_data["server_timestamp"] = time.time()
                    socketio.emit("scores", {
                        "type": "scores",
                        "scores": response_data
                    }, room=room, namespace="/match")
                    
                    # Audience ekranlarına da skor güncellemesi gönder (anlık güncelleme için)
                    red_score = calculated_scores.get("red", {}).get("total_score", 0)
                    blue_score = calculated_scores.get("blue", {}).get("total_score", 0)
                    socketio.emit("scores_update", {
                        "type": "scores_update",
                        "scores": {
                            "red_score": red_score,
                            "blue_score": blue_score
                        },
                        "match_id": match_id,
                        "server_timestamp": time.time()
                    }, namespace="/audience")
                    
                    logger.info(f"WebSocket broadcast: match_id={match_id}, alliance={alliance}, room={room}")

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
    
    # ============================================================================
    # WEBSOCKET EVENT HANDLERS (Yeni - WebSocket kullanıyor)
    # ============================================================================
    
    if socketio:
        # WebSocket bağlantı yönetimi için room'lar
        # Format: "match:{event_id}:{match_source}:{match_id}"
        _websocket_rooms = {}  # {room_name: set(session_ids)}
        _websocket_match_tracking = {}  # {session_id: {"match_key": "...", "room": "..."}}
        
        def _get_match_room(event_id: int, match_id: int, match_source: str) -> str:
            """Maç için WebSocket room adı oluşturur."""
            return f"match:{event_id}:{match_source}:{match_id}"
        
        @socketio.on("connect", namespace="/match")
        def handle_match_connect(auth):
            """WebSocket bağlantısı kurulduğunda (match namespace)."""
            logger.info(f"WebSocket bağlantısı kuruldu (match): {request.sid}")
            return True
        
        @socketio.on("disconnect", namespace="/match")
        def handle_match_disconnect():
            """WebSocket bağlantısı kesildiğinde (match namespace)."""
            session_id = request.sid
            tracking = _websocket_match_tracking.get(session_id)
            if tracking:
                room = tracking.get("room")
                if room:
                    leave_room(room, namespace="/match", sid=session_id)
                    if room in _websocket_rooms:
                        _websocket_rooms[room].discard(session_id)
                        if not _websocket_rooms[room]:
                            del _websocket_rooms[room]
                del _websocket_match_tracking[session_id]
            logger.info(f"WebSocket bağlantısı kesildi (match): {session_id}")
        
        @socketio.on("subscribe_match", namespace="/match")
        def handle_subscribe_match(data):
            """
            Maç güncellemelerine abone ol.
            
            Data:
                {
                    "match_id": int,
                    "match_source": "schedule" | "practice"
                }
            """
            try:
                event_id = datastore.get_active_event_id()
                if not event_id:
                    socketio.emit("error", {"message": "Aktif etkinlik yok"}, room=request.sid, namespace="/match")
                    return
                
                match_id = data.get("match_id")
                match_source = _normalize_match_source(data.get("match_source", "schedule"))
                
                if not match_id:
                    socketio.emit("error", {"message": "match_id gerekli"}, room=request.sid, namespace="/match")
                    return
                
                match_key = _build_match_key(event_id, match_id, match_source)
                room = _get_match_room(event_id, match_id, match_source)
                session_id = request.sid
                
                # Room'a katıl
                join_room(room, namespace="/match", sid=session_id)
                if room not in _websocket_rooms:
                    _websocket_rooms[room] = set()
                _websocket_rooms[room].add(session_id)
                
                # Tracking'e ekle
                _websocket_match_tracking[session_id] = {
                    "match_key": match_key,
                    "room": room,
                    "match_id": match_id,
                    "match_source": match_source
                }
                
                # Realtime manager'a kaydet
                realtime_manager = get_realtime_manager()
                realtime_manager.register_match(match_key)
                
                # İlk durumu gönder
                active_match = match_state_manager.get_active_match(event_id)
                if active_match and active_match.get("id") == match_id:
                    # Server-side timestamp ekle (timer senkronizasyonu için)
                    match_data = dict(active_match)
                    match_data["server_timestamp"] = time.time()
                    socketio.emit("match_state", {"type": "match_state", "match": match_data}, room=room, namespace="/match")
                
                # İlk skorları gönder
                current_scores = realtime_manager.get_current_scores(match_key)
                if current_scores:
                    response_data = dict(current_scores)
                    if "team_statuses" in current_scores:
                        response_data["team_statuses"] = current_scores["team_statuses"]
                    response_data["server_timestamp"] = time.time()
                    socketio.emit("scores", {"type": "scores", "scores": response_data}, room=room, namespace="/match")
                
                # Güncelleme thread'ini başlat (eğer yoksa)
                if room not in _update_threads:
                    _start_match_update_thread(room, match_key, event_id, match_id)
                
                logger.info(f"WebSocket abone oldu: match_id={match_id}, source={match_source}, room={room}, sid={session_id}")
                
            except Exception as e:
                logger.error(f"WebSocket subscribe_match hatası: {str(e)}", exc_info=True)
                socketio.emit("error", {"message": str(e)}, room=request.sid, namespace="/match")
        
        @socketio.on("unsubscribe_match", namespace="/match")
        def handle_unsubscribe_match(data):
            """Maç güncellemelerinden abonelikten çık."""
            session_id = request.sid
            tracking = _websocket_match_tracking.get(session_id)
            if tracking:
                room = tracking.get("room")
                if room:
                    leave_room(room, namespace="/match", sid=session_id)
                    if room in _websocket_rooms:
                        _websocket_rooms[room].discard(session_id)
                        if not _websocket_rooms[room]:
                            del _websocket_rooms[room]
                del _websocket_match_tracking[session_id]
                logger.info(f"WebSocket abonelikten çıkıldı: sid={session_id}")
        
        # Periyodik güncelleme thread'i (timer senkronizasyonu için)
        _update_threads = {}  # {room: thread}
        _stop_threads = {}  # {room: threading.Event}
        
        def _start_match_update_thread(room: str, match_key: str, event_id: int, match_id: int):
            """Maç güncellemelerini periyodik olarak gönderen thread."""
            if room in _update_threads:
                return  # Zaten çalışıyor
            
            stop_event = threading.Event()
            _stop_threads[room] = stop_event
            
            def update_loop():
                last_match_update = None
                last_scores_update = None
                
                while not stop_event.is_set():
                    try:
                        # Maç durumu güncellemesi
                        active_match = match_state_manager.get_active_match(event_id)
                        if active_match and active_match.get("id") == match_id:
                            match_update_key = f"{active_match.get('current_state')}_{active_match.get('time_remaining')}_{active_match.get('status')}"
                            if match_update_key != last_match_update:
                                last_match_update = match_update_key
                                match_data = dict(active_match)
                                match_data["server_timestamp"] = time.time()  # Timer senkronizasyonu için
                                socketio.emit("match_state", {
                                    "type": "match_state",
                                    "match": match_data
                                }, room=room, namespace="/match")
                        else:
                            if last_match_update != "none":
                                last_match_update = "none"
                                socketio.emit("match_state", {
                                    "type": "match_state",
                                    "match": None,
                                    "server_timestamp": time.time()
                                }, room=room, namespace="/match")
                        
                        # Skor güncellemesi
                        realtime_manager = get_realtime_manager()
                        current_scores = realtime_manager.get_current_scores(match_key)
                        if current_scores and current_scores.get("last_updated") != last_scores_update:
                            last_scores_update = current_scores.get("last_updated")
                            response_data = dict(current_scores)
                            if "team_statuses" in current_scores:
                                response_data["team_statuses"] = current_scores["team_statuses"]
                            response_data["server_timestamp"] = time.time()
                            socketio.emit("scores", {
                                "type": "scores",
                                "scores": response_data
                            }, room=room, namespace="/match")
                        
                        time.sleep(0.3)  # 300ms'de bir güncelle
                        
                    except Exception as e:
                        logger.error(f"WebSocket update thread hatası (room={room}): {str(e)}", exc_info=True)
                        time.sleep(1)
                
                # Thread sonlandı, temizle
                if room in _update_threads:
                    del _update_threads[room]
                if room in _stop_threads:
                    del _stop_threads[room]
            
            thread = threading.Thread(target=update_loop, daemon=True)
            thread.start()
            _update_threads[room] = thread
    
    # ============================================================================
    # SSE ENDPOINTS KALDIRILDI - WebSocket Kullanın
    # ============================================================================
    # NOT: SSE endpoint'leri kaldırıldı. Tüm sistem WebSocket kullanıyor.
    # 
    # WebSocket kullanımı:
    # - /match namespace: subscribe_match event ile maç güncellemelerine abone olun
    # - /audience namespace: subscribe_audience event ile seyirci ekranı güncellemelerine abone olun
    # 
    # Timer senkronizasyonu için server_timestamp kullanılır (tüm cihazlarda aynı zaman).
    # 
    # Eski SSE endpoint'leri kaldırıldı:
    # - /api/match-control/realtime/<match_id> - KALDIRILDI
    # - /api/match-control/score/realtime/<match_id> - KALDIRILDI
    # - /api/public/match/realtime - KALDIRILDI
    
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
            
            # Detaylı skorlama verilerini ekle
            scoring_data = data.get("scoring_data")
            if isinstance(scoring_data, dict):
                update_data["scoring_data"] = scoring_data
                
                # Sıralama Puanları (SP) hesapla (sadece sıralama maçları için)
                # Maç bilgisini al (match_type için)
                if match_source == "practice":
                    matches = datastore.get_practice_matches(event_id=event_id)
                else:
                    matches = datastore.get_match_schedule(event_id=event_id)
                match_info = next((m for m in matches if m["id"] == match_id), None)
                
                if match_info:
                    match_type = match_info.get("match_type", "qualification")
                    match_key = _build_match_key(event_id, match_id, match_source)
                    realtime_manager = get_realtime_manager()
                    
                    # SP hesapla (tek bir yerde - modüler yapı)
                    sp_result = realtime_manager.calculate_and_store_ranking_points(
                        match_key=match_key,
                        match_type=match_type,
                        red_alliance=match_info.get("red_alliance", []),
                        blue_alliance=match_info.get("blue_alliance", [])
                    )
                    
                    # SP'yi scoring_data'ya ekle
                    if sp_result:
                        if "ranking_points" not in scoring_data:
                            scoring_data["ranking_points"] = {}
                        scoring_data["ranking_points"] = sp_result
                        update_data["scoring_data"] = scoring_data
            
            # Takım durumlarını ekle (surrogate teams)
            team_statuses = data.get("team_statuses")
            if isinstance(team_statuses, dict):
                # Surrogate teams listesi oluştur
                surrogate_teams = []
                for alliance, teams in team_statuses.items():
                    if isinstance(teams, dict):
                        for team, status in teams.items():
                            if status == "surrogate":
                                surrogate_teams.append(team)
                if surrogate_teams:
                    update_data["surrogate_teams"] = surrogate_teams
            
            # Veritabanına kaydet
            if match_source == "practice":
                datastore.update_practice_match(match_id=match_id, **update_data)
            else:
                datastore.update_match(match_id=match_id, **update_data)
            
            # Merkezi MatchStateManager ile maçı tamamla (cache'den kaldırır)
            match_state_manager.complete_match(
                event_id=event_id,
                match_id=match_id,
                match_source=match_source
            )
            
            # Güncel maç bilgisini al (tamamlandıktan sonra)
            match = None
            if match_source == "practice":
                matches = datastore.get_practice_matches(event_id=event_id, status="completed")
                match = next((m for m in matches if m["id"] == match_id), None)
            else:
                matches = datastore.get_match_schedule(event_id=event_id, status="completed")
                match = next((m for m in matches if m["id"] == match_id), None)
            
            # Match source bilgisini ekle
            if match:
                match["source"] = match_source
                match["match_type"] = match.get("match_type", "qualification")
            
            logger.info(f"Maç tamamlandı: match_id={match_id}, red={update_data.get('red_score')}, blue={update_data.get('blue_score')} (kullanıcı: {session.get('username', 'unknown')})")
            
            return jsonify({
                "ok": True,
                "match": match
            })
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
        
        # Merkezi MatchStateManager'dan aktif maçı al
        match = match_state_manager.get_active_match(event_id)
        
        if not match:
            return jsonify({"match": None})
        
        # Audience display için formatla
        return jsonify({
            "match": {
                "id": match.get("id"),
                "match_number": match.get("match_number"),
                "match_type": match.get("match_type", "qualification"),
                "match_source": match.get("match_source", "schedule"),
                "field_number": match.get("field_number", 1),
                "red_alliance": match.get("red_alliance", []),
                "blue_alliance": match.get("blue_alliance", []),
                "red_score": match.get("red_score", 0),
                "blue_score": match.get("blue_score", 0),
                "current_state": match.get("current_state", "idle"),
                "time_remaining": match.get("time_remaining", 0),
                "state_label": MATCH_STATES.get(match.get("current_state", "idle"), "Beklemede"),
            }
        })
    
    # SSE endpoint kaldırıldı - WebSocket kullanın (/audience namespace, subscribe_audience event)
    
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
