"""
Seyirci Ekranları route'ları

Bu modül seyirci ekranlarının yönetimi ve izlenmesi için API endpoint'lerini içerir.
"""

from __future__ import annotations

import time
import logging
import threading
from typing import Dict, Any

from flask import jsonify, render_template, request
from flask_socketio import emit, join_room, leave_room

from src.core.scoring import ScoreCalculator

logger = logging.getLogger(__name__)


# Bağlı ekranlar (memory)
_screen_registry: Dict[str, Dict[str, Any]] = {}

# Global preview ayarı (tüm ekranlar için, kayıtlı olmasalar bile)
_global_preview: Dict[str, Any] = {
    "override_view": None,
    "override_until": None,
    "override_payload": None,
}


def _get_global_screen_settings(datastore) -> Dict[str, Any]:
    event_data = datastore.get_event()
    screens = event_data.get("screens", {}) if isinstance(event_data, dict) else {}
    return {
        "active_view": screens.get("active_view", "match"),
        "overlay_enabled": bool(screens.get("overlay_enabled", False)),
        "overlay_text": screens.get("overlay_text", "") or "",
        # Chroma key (yeşil ekran): yayında skor board'u tek renk arka plan üzerinde gösterir, OBS vb. ile key'lenebilir
        "overlay_chroma_enabled": bool(screens.get("overlay_chroma_enabled", False)),
        "overlay_chroma_color": (screens.get("overlay_chroma_color") or "").strip() or "#00ff00",
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


def register_screen_routes(bp, datastore, require_login, require_event_manager, socketio=None):
    """
    Seyirci ekranı route'larını Blueprint'e kaydeder.
    
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
        
        new_active_view = (data.get("active_view") or "match").strip()
        new_overlay_enabled = bool(data.get("overlay_enabled", False))
        new_overlay_text = (data.get("overlay_text") or "").strip()
        new_chroma_enabled = bool(data.get("overlay_chroma_enabled", False))
        new_chroma_color = (data.get("overlay_chroma_color") or "").strip() or "#00ff00"
        
        # Mevcut ayarları al (değişiklik kontrolü için)
        old_active_view = event_data["screens"].get("active_view", "match")
        old_overlay_enabled = event_data["screens"].get("overlay_enabled", False)
        old_overlay_text = event_data["screens"].get("overlay_text", "")
        old_chroma_enabled = event_data["screens"].get("overlay_chroma_enabled", False)
        old_chroma_color = event_data["screens"].get("overlay_chroma_color", "#00ff00")
        
        # Yeni ayarları kaydet
        event_data["screens"]["active_view"] = new_active_view
        event_data["screens"]["overlay_enabled"] = new_overlay_enabled
        event_data["screens"]["overlay_text"] = new_overlay_text
        event_data["screens"]["overlay_chroma_enabled"] = new_chroma_enabled
        event_data["screens"]["overlay_chroma_color"] = new_chroma_color
        datastore.save_event(event_data)
        
        # Değişiklik varsa tüm seyirci ekranlarına WebSocket ile bildir
        settings_changed = (
            old_active_view != new_active_view or
            old_overlay_enabled != new_overlay_enabled or
            old_overlay_text != new_overlay_text or
            old_chroma_enabled != new_chroma_enabled or
            old_chroma_color != new_chroma_color
        )
        
        if settings_changed and socketio:
            # Tüm /audience namespace'indeki ekranlara broadcast yap
            socketio.emit("view_change", {
                "active_view": new_active_view,
                "overlay_enabled": new_overlay_enabled,
                "overlay_text": new_overlay_text,
                "overlay_chroma_enabled": new_chroma_enabled,
                "overlay_chroma_color": new_chroma_color
            }, namespace="/audience")
            logger.info(f"View change broadcast: {new_active_view}")
        
        return jsonify({"ok": True})

    @bp.post("/api/screens/heartbeat")
    def screen_heartbeat():
        data = request.get_json(force=True) or {}
        screen_id = (data.get("screen_id") or "").strip()
        if not screen_id:
            return jsonify({"error": "screen_id gerekli"}), 400
        existing = _screen_registry.get(screen_id, {})
        desired_view = existing.get("desired_view") or (data.get("desired_view") or "").strip() or "match"
        # Yeni ekranlar varsayılan olarak global ayarları takip etsin
        follow_global = existing.get("follow_global", True) if existing else True
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
    def list_screens():
        _cleanup_screens()
        screens = sorted(_screen_registry.values(), key=lambda item: item.get("last_seen", 0), reverse=True)
        return jsonify(screens)

    @bp.get("/api/screens/view")
    def get_screen_view():
        screen_id = (request.args.get("screen_id") or "").strip()
        global_settings = _get_global_screen_settings(datastore)
        screen = _screen_registry.get(screen_id, {})
        # Varsayılan olarak global ayarları takip et (yeni ekranlar için)
        follow_global = screen.get("follow_global", True) if screen else True
        desired_view = screen.get("desired_view") or "match"
        override_view = screen.get("override_view")
        override_until = screen.get("override_until")
        override_payload = screen.get("override_payload")
        now = time.time()
        
        # ÖNEMLİ: Önce ekran-spesifik override'ı kontrol et
        # override_until None ise süresiz (sadece "Maçı Göster" ile temizlenir)
        screen_override_active = False
        if override_view:
            if override_until is None:
                # Süresiz preview (sadece "Maçı Göster" ile temizlenir)
                screen_override_active = True
            elif now <= override_until:
                # Süreli preview (henüz süresi dolmamış)
                screen_override_active = True
        
        # Eğer ekran-spesifik override yoksa veya süresi dolmuşsa, global preview'ı kontrol et
        if not screen_override_active:
            global_override_view = _global_preview.get("override_view")
            global_override_until = _global_preview.get("override_until")
            global_override_payload = _global_preview.get("override_payload")
            
            # ÖNEMLİ: Global preview varsa ve payload geçerliyse kullan
            # payload None değilse ve boş dict değilse kullan
            if global_override_view and global_override_payload and isinstance(global_override_payload, dict) and global_override_payload.get("match"):
                if global_override_until is None:
                    # Süresiz global preview
                    override_view = global_override_view
                    override_until = None
                    override_payload = global_override_payload
                    screen_override_active = True
                elif now <= global_override_until:
                    # Süreli global preview (henüz süresi dolmamış)
                    override_view = global_override_view
                    override_until = global_override_until
                    override_payload = global_override_payload
                    screen_override_active = True
        
        # Active view'ı belirle
        if screen_override_active:
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
                "overlay_chroma_enabled": global_settings.get("overlay_chroma_enabled", False),
                "overlay_chroma_color": global_settings.get("overlay_chroma_color", "#00ff00"),
                "preview_payload": override_payload if screen_override_active else None,
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
        
        # Eğer ekran global takip etmiyorsa, WebSocket ile view değişikliğini bildir
        if not follow_global and socketio:
            global_settings = _get_global_screen_settings(datastore)
            socketio.emit("view_change", {
                "active_view": desired_view,
                "overlay_enabled": global_settings.get("overlay_enabled", False),
                "overlay_text": global_settings.get("overlay_text", ""),
                "screen_id": screen_id  # Hangi ekran için olduğunu belirt
            }, namespace="/audience")
            logger.info(f"Screen-specific view change: {screen_id} -> {desired_view}")
        
        return jsonify({"ok": True})

    @bp.post("/api/screens/close")
    @require_login
    @require_event_manager
    def close_screen():
        """
        Bir ekranı kapatır (registry'den siler).
        Bu, server yükünü azaltmak için kullanılabilir.
        """
        data = request.get_json(force=True) or {}
        screen_id = (data.get("screen_id") or "").strip()
        if not screen_id:
            return jsonify({"error": "screen_id gerekli"}), 400
        if screen_id in _screen_registry:
            _screen_registry.pop(screen_id, None)
            return jsonify({"ok": True, "message": "Ekran kapatıldı"})
        return jsonify({"error": "Ekran bulunamadı"}), 404

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
        
        # Global preview ayarını güncelle (tüm ekranlar için, kayıtlı olmasalar bile)
        if mode == "live":
            _global_preview["override_view"] = None
            _global_preview["override_until"] = None
            _global_preview["override_payload"] = None
        else:
            # ÖNEMLİ: Payload boş değilse ve geçerli bir match içeriyorsa ayarla
            if payload and isinstance(payload, dict) and payload.get("match"):
                _global_preview["override_view"] = view
                # duration_seconds = 0 ise süresiz (sadece "Maçı Göster" ile temizlenir)
                if duration_seconds == 0:
                    _global_preview["override_until"] = None  # None = süresiz
                else:
                    _global_preview["override_until"] = now + duration_seconds
                _global_preview["override_payload"] = payload
                # Debug log
                logger.info(f"Global preview ayarlandı: view={view}, match={payload.get('match', {}).get('match_number', 'N/A')}, duration={'süresiz' if duration_seconds == 0 else duration_seconds}")
            else:
                # Payload geçersizse hata döndür
                logger.warning(f"Geçersiz preview payload: payload={payload}")
                return jsonify({"error": "Geçersiz preview payload - match bilgisi eksik"}), 400
        
        # Kayıtlı ekranlara da preview gönder
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
                    # duration_seconds = 0 ise süresiz (sadece "Maçı Göster" ile temizlenir)
                    if duration_seconds == 0:
                        screen["override_until"] = None  # None = süresiz
                    else:
                        screen["override_until"] = now + duration_seconds
                    screen["override_payload"] = payload
                _screen_registry[screen_id] = screen
        return jsonify({"ok": True})
    
    # ============================================================================
    # WEBSOCKET EVENT HANDLERS (Audience Display için)
    # ============================================================================
    
    if socketio:
        # Audience WebSocket bağlantı yönetimi
        _audience_rooms = {}  # {screen_id: set(session_ids)}
        _audience_update_threads = {}  # {screen_id: thread}
        _audience_stop_threads = {}  # {screen_id: threading.Event}
        
        @socketio.on("connect", namespace="/audience")
        def handle_audience_connect(auth):
            """WebSocket bağlantısı kurulduğunda (audience namespace)."""
            screen_id = request.args.get("screen_id", "").strip()
            logger.info(f"Audience WebSocket bağlantısı kuruldu: screen_id={screen_id}, sid={request.sid}")
            return True
        
        @socketio.on("disconnect", namespace="/audience")
        def handle_audience_disconnect():
            """WebSocket bağlantısı kesildiğinde (audience namespace)."""
            session_id = request.sid
            # Screen ID'yi bul ve room'dan çıkar
            for screen_id, sessions in _audience_rooms.items():
                if session_id in sessions:
                    sessions.discard(session_id)
                    if not sessions:
                        # Room boş, thread'i durdur
                        if screen_id in _audience_stop_threads:
                            _audience_stop_threads[screen_id].set()
                        del _audience_rooms[screen_id]
                    break
            logger.info(f"Audience WebSocket bağlantısı kesildi: sid={session_id}")
        
        def _start_audience_update_thread(screen_id: str):
            """Audience ekranı için periyodik güncelleme thread'i."""
            if screen_id in _audience_update_threads:
                return  # Zaten çalışıyor
            
            stop_event = threading.Event()
            _audience_stop_threads[screen_id] = stop_event
            
            def update_loop():
                from src.core.match_state import get_match_state_manager
                from src.core.scoring.realtime import get_realtime_manager
                
                match_state_manager = get_match_state_manager(datastore)
                realtime_manager = get_realtime_manager()
                
                last_match_id = None
                last_state = None
                last_time_remaining = None
                last_scores_update = None
                
                while not stop_event.is_set():
                    try:
                        event_id = datastore.get_active_event_id()
                        if not event_id:
                            time.sleep(1)
                            continue
                        
                        # Aktif maçı kontrol et (maç başladıysa önizlemeyi kaldırmak için önce alıyoruz)
                        active_match = match_state_manager.get_active_match(event_id)
                        current_state = active_match.get("current_state") if active_match else None
                        # Maç başladığında (otonom/teleop/end_game) önizlemeyi otomatik kaldır; canlı skor/timer gösterilsin
                        if current_state in ("autonomous", "driver_controlled", "end_game"):
                            _global_preview["override_view"] = None
                            _global_preview["override_until"] = None
                            _global_preview["override_payload"] = None
                            screen = _screen_registry.get(screen_id, {})
                            screen["override_view"] = None
                            screen["override_until"] = None
                            screen["override_payload"] = None
                            _screen_registry[screen_id] = screen
                        
                        # Preview kontrolü
                        screen = _screen_registry.get(screen_id, {})
                        override_payload = screen.get("override_payload") or _global_preview.get("override_payload")
                        
                        # Eğer preview aktifse, normal güncellemeleri gönderme
                        if override_payload:
                            time.sleep(0.5)
                            continue
                        
                        if active_match:
                            match_id = active_match.get("id")
                            match_source = active_match.get("match_source", "schedule")
                            match_key = f"{event_id}_{match_source}_{match_id}"
                            # Timer maç kontrol ile senkron: cache'deki time_remaining güncellenir
                            match_state_manager.refresh_match_state(event_id, match_key)
                            active_match = match_state_manager.get_active_match(event_id)
                            if not active_match:
                                time.sleep(0.1)
                                continue
                            # Maç durumu güncellemesi (güncel time_remaining ile)
                            current_state = active_match.get("current_state")
                            time_remaining = active_match.get("time_remaining")
                            
                            match_update_key = f"{match_id}_{current_state}_{time_remaining}"
                            if match_update_key != f"{last_match_id}_{last_state}_{last_time_remaining}":
                                last_match_id = match_id
                                last_state = current_state
                                last_time_remaining = time_remaining
                                
                                match_data = dict(active_match)
                                match_data["server_timestamp"] = time.time()  # Timer senkronizasyonu için
                                
                                socketio.emit("match_update", {
                                    "type": "match_update",
                                    "match": match_data
                                }, room=screen_id, namespace="/audience")
                            
                            # Skor güncellemesi
                            current_scores = realtime_manager.get_current_scores(match_key)
                            if current_scores:
                                scores_update_key = current_scores.get("last_updated")
                                if scores_update_key != last_scores_update:
                                    last_scores_update = scores_update_key
                                    
                                    # Skorları hesapla (realtime_manager'da sadece scoring_data var, total_score yok)
                                    red_data = current_scores.get("red", {})
                                    blue_data = current_scores.get("blue", {})
                                    red_score = 0
                                    blue_score = 0
                                    
                                    if red_data or blue_data:
                                        try:
                                            calculator = ScoreCalculator()
                                            if red_data:
                                                red_result = calculator.calculate_alliance_score(
                                                    alliance="red",
                                                    scoring_data=red_data,
                                                    opponent_scoring_data=blue_data
                                                )
                                                red_score = red_result["total_score"]
                                            if blue_data:
                                                blue_result = calculator.calculate_alliance_score(
                                                    alliance="blue",
                                                    scoring_data=blue_data,
                                                    opponent_scoring_data=red_data
                                                )
                                                blue_score = blue_result["total_score"]
                                        except Exception as calc_err:
                                            logger.warning(f"Audience skor hesaplama hatası: {str(calc_err)}")
                                    
                                    socketio.emit("scores_update", {
                                        "type": "scores_update",
                                        "scores": {
                                            "red_score": red_score,
                                            "blue_score": blue_score
                                        },
                                        "server_timestamp": time.time()
                                    }, room=screen_id, namespace="/audience")
                        else:
                            # Aktif maç yok
                            if last_match_id is not None:
                                last_match_id = None
                                socketio.emit("match_update", {
                                    "type": "match_update",
                                    "match": None,
                                    "server_timestamp": time.time()
                                }, room=screen_id, namespace="/audience")
                        
                        time.sleep(0.1)  # 100ms: maç kontrol ile senkron timer/skor/ses için hızlı güncelleme
                        
                    except Exception as e:
                        logger.error(f"Audience update thread hatası (screen_id={screen_id}): {str(e)}", exc_info=True)
                        time.sleep(1)
                
                # Thread sonlandı, temizle
                if screen_id in _audience_update_threads:
                    del _audience_update_threads[screen_id]
                if screen_id in _audience_stop_threads:
                    del _audience_stop_threads[screen_id]
            
            thread = threading.Thread(target=update_loop, daemon=True)
            thread.start()
            _audience_update_threads[screen_id] = thread
        
        @socketio.on("subscribe_audience", namespace="/audience")
        def handle_subscribe_audience(data):
            """Audience ekranı güncellemelerine abone ol."""
            try:
                screen_id = data.get("screen_id") or request.args.get("screen_id", "").strip()
                if not screen_id:
                    socketio.emit("error", {"message": "screen_id gerekli"}, room=request.sid, namespace="/audience")
                    return
                
                session_id = request.sid
                
                # Room'a katıl
                join_room(screen_id, namespace="/audience", sid=session_id)
                if screen_id not in _audience_rooms:
                    _audience_rooms[screen_id] = set()
                _audience_rooms[screen_id].add(session_id)
                
                # Güncelleme thread'ini başlat (eğer yoksa)
                if screen_id not in _audience_update_threads:
                    _start_audience_update_thread(screen_id)
                
                # Yeni bağlanan seyirciye anında canlı skor ve timer gönder (beklemeden)
                event_id = datastore.get_active_event_id()
                if event_id:
                    from src.core.match_state import get_match_state_manager
                    from src.core.scoring.realtime import get_realtime_manager
                    _mm = get_match_state_manager(datastore)
                    _rm = get_realtime_manager()
                    active_match = _mm.get_active_match(event_id)
                    if active_match:
                        _match_id = active_match.get("id")
                        _match_source = active_match.get("match_source", "schedule")
                        _match_key = f"{event_id}_{_match_source}_{_match_id}"
                        _mm.refresh_match_state(event_id, _match_key)
                        active_match = _mm.get_active_match(event_id)
                        if active_match:
                            match_data = dict(active_match)
                            match_data["server_timestamp"] = time.time()
                            socketio.emit("match_update", {"type": "match_update", "match": match_data}, room=screen_id, namespace="/audience")
                            current_scores = _rm.get_current_scores(_match_key)
                            if current_scores:
                                red_data = current_scores.get("red", {})
                                blue_data = current_scores.get("blue", {})
                                red_score = blue_score = 0
                                if red_data or blue_data:
                                    try:
                                        if red_data:
                                            red_score = ScoreCalculator().calculate_alliance_score("red", red_data, blue_data).get("total_score", 0)
                                        if blue_data:
                                            blue_score = ScoreCalculator().calculate_alliance_score("blue", blue_data, red_data).get("total_score", 0)
                                    except Exception as calc_err:
                                        logger.warning("Audience subscribe skor hesaplama: %s", calc_err)
                                socketio.emit("scores_update", {
                                    "type": "scores_update",
                                    "scores": {"red_score": red_score, "blue_score": blue_score},
                                    "server_timestamp": time.time()
                                }, room=screen_id, namespace="/audience")
                
                logger.info(f"Audience WebSocket abone oldu: screen_id={screen_id}, sid={session_id}")
                
            except Exception as e:
                logger.error(f"Audience WebSocket subscribe_audience hatası: {str(e)}", exc_info=True)
                socketio.emit("error", {"message": str(e)}, room=request.sid, namespace="/audience")
        
        @socketio.on("unsubscribe_audience", namespace="/audience")
        def handle_unsubscribe_audience(data):
            """Audience ekranı güncellemelerinden abonelikten çık."""
            session_id = request.sid
            screen_id = data.get("screen_id") or request.args.get("screen_id", "").strip()
            
            if screen_id and screen_id in _audience_rooms:
                leave_room(screen_id, namespace="/audience", sid=session_id)
                _audience_rooms[screen_id].discard(session_id)
                
                # Eğer room boşsa thread'i durdur
                if not _audience_rooms[screen_id]:
                    del _audience_rooms[screen_id]
                    if screen_id in _audience_stop_threads:
                        _audience_stop_threads[screen_id].set()
            
            logger.info(f"Audience WebSocket abonelikten çıkıldı: screen_id={screen_id}, sid={session_id}")
