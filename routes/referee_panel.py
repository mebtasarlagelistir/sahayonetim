"""
Hakem Paneli Route'ları

Bu modül hakemlerin tabletlerinden puanlama yapabilmesi için
API endpoint'lerini içerir.

Modüler yapı: Puanlama sistemi src/core/scoring modülünden alınır,
bu sayede puanlama kuralları kolayca güncellenebilir.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request, render_template, session, current_app
# ScoreCalculator artık realtime_manager içinde kullanılıyor (tek bir yerde hesaplama)
from src.core.scoring.realtime import get_realtime_manager
from datetime import datetime
import logging
import time

# Logger oluştur
logger = logging.getLogger(__name__)


def register_referee_panel_routes(bp, datastore, require_login, socketio=None):
    """
    Hakem paneli route'larını Blueprint'e kaydeder.
    
    Args:
        bp: Blueprint instance
        datastore: DataStore instance
        require_login: require_login decorator
        socketio: SocketIO instance (WebSocket için)
    """
    # SocketIO instance'ını al (app'ten)
    if socketio is None:
        socketio = current_app.socketio if hasattr(current_app, 'socketio') else None
    
    def _normalize_match_source(value: str | None) -> str:
        return "practice" if value == "practice" else "schedule"

    def _build_match_key(event_id: int, match_id: int, match_source: str) -> str:
        return f"{event_id}_{match_source}_{match_id}"
    
    def _get_match_room(event_id: int, match_id: int, match_source: str) -> str:
        """WebSocket room adını oluşturur."""
        return f"match:{event_id}:{match_source}:{match_id}"

    def _get_active_match(event_id: int):
        """
        Aktif maçı bulur (önce resmi, sonra deneme).
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
            match["match_source"] = match_source
            if match_source == "practice":
                match["match_type"] = "practice"
            return match
        return None

    def _get_referee_meta(match: dict) -> dict:
        """
        Maç scoring_data içindeki hakem meta verisini okur.
        """
        scoring_data = match.get("scoring_data") if isinstance(match.get("scoring_data"), dict) else {}
        return scoring_data.get("referee_meta") or {}

    def _persist_referee_meta(match_id: int, match_source: str, scoring_data: dict, meta: dict) -> None:
        """
        Hakem meta bilgisini maç scoring_data'sına yazar.
        """
        persisted = scoring_data if isinstance(scoring_data, dict) else {}
        persisted["referee_meta"] = meta
        if match_source == "practice":
            datastore.update_practice_match(match_id=match_id, scoring_data=persisted)
        else:
            datastore.update_match(match_id=match_id, scoring_data=persisted)

    @bp.route("/referee-panel")
    @require_login
    def referee_panel_page():
        """
        Hakem paneli sayfasını render eder.
        
        Bu sayfa hakemlerin tabletlerinden puanlama yapabilmesi için
        optimize edilmiş bir arayüz sağlar.
        """
        return render_template("referee_panel.html")

    @bp.route("/referee/red")
    @require_login
    def referee_red_page():
        return render_template("referee_panel.html", referee_mode="red")

    @bp.route("/referee/blue")
    @require_login
    def referee_blue_page():
        return render_template("referee_panel.html", referee_mode="blue")

    @bp.route("/head-referee")
    @require_login
    def head_referee_page():
        return render_template("head_referee.html")
    
    @bp.route("/api/referee/active-match")
    @require_login
    def get_referee_active_match():
        """
        Hakem için aktif maç bilgisini döner.
        
        Returns:
            JSON: Aktif maç bilgisi veya null
        """
        event_id = datastore.get_active_event_id()
        if not event_id:
            return jsonify({"match": None})
        
        match = _get_active_match(event_id)
        if match:
            return jsonify({"match": match})
        return jsonify({"match": None})
    
    @bp.route("/api/referee/score/update", methods=["POST"])
    @require_login
    def referee_update_score():
        """
        Hakemden gelen puanlama verilerini günceller.
        
        Bu endpoint hakemlerin tabletlerinden gönderilen detaylı
        puanlama verilerini alır, modüler puanlama sistemi ile
        hesaplar ve gerçek zamanlı olarak tüm cihazlara yayınlar.
        
        Body:
            match_id: Maç ID'si
            alliance: "red" veya "blue" (hangi ittifakı puanladığı)
            scoring_data: Detaylı puanlama verileri
            field_id: Hangi alan için (opsiyonel, çoklu saha için)
        
        Returns:
            JSON: Hesaplanan skor ve breakdown
        """
        try:
            data = request.get_json() or {}
            match_id = data.get("match_id")
            alliance = data.get("alliance")
            scoring_data = data.get("scoring_data", {})
            match_source = _normalize_match_source(data.get("match_source"))
            
            if not match_id or not alliance:
                logger.warning(f"Hakem skor güncelleme hatası: match_id veya alliance eksik (kullanıcı: {session.get('username', 'unknown')})")
                return jsonify({"error": "match_id ve alliance gerekli"}), 400
            
            if alliance not in ["red", "blue"]:
                logger.warning(f"Hakem skor güncelleme hatası: Geçersiz alliance '{alliance}' (kullanıcı: {session.get('username', 'unknown')})")
                return jsonify({"error": "alliance 'red' veya 'blue' olmalı"}), 400
            
            event_id = datastore.get_active_event_id()
            if not event_id:
                logger.warning("Hakem skor güncelleme hatası: Aktif etkinlik yok")
                return jsonify({"error": "Aktif etkinlik yok"}), 400
            
            # Kullanıcı bilgisi
            updated_by = session.get("username", "unknown")
            
            # Maçı doğrula
            if match_source == "practice":
                matches = datastore.get_practice_matches(event_id=event_id)
            else:
                matches = datastore.get_match_schedule(event_id=event_id)
            match = next((m for m in matches if m["id"] == match_id), None)
            if not match:
                logger.warning(f"Hakem skor güncelleme hatası: Maç bulunamadı (match_id: {match_id}, kullanıcı: {updated_by})")
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
            
            # WebSocket ile diğer client'lara broadcast yap (match control, audience display için)
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
            
            # ÖNEMLİ: team_statuses formatını koru (match control ile tutarlılık)
            # Referee panel'den gelen scoring_data içinde team_statuses varsa, onu birleştir
            if "team_statuses" in scoring_data and isinstance(scoring_data["team_statuses"], dict):
                if "team_statuses" not in persisted:
                    persisted["team_statuses"] = {}
                # Mevcut team_statuses'i koru, sadece güncellenen ittifakı güncelle
                persisted["team_statuses"][alliance] = scoring_data["team_statuses"].get(alliance, {})
                # scoring_data'dan team_statuses'i kaldır (çünkü zaten persisted'e eklendi)
                # Ama scoring_data[alliance] içinde tutmaya devam ediyoruz (geriye dönük uyumluluk)

            # Hakem daha önce submit ettiyse, yeni girişte submit'i düşür - AMA baş hakem düzenlemesinde düşürme
            # Baş hakem düzenleyince hakemin "Maç Girişini Bitir" durumu korunur; tekrar basması gerekmez
            from_head_referee = data.get("from_head_referee", False)
            current_meta = _get_referee_meta(match)
            alliance_meta = current_meta.get(alliance, {})
            meta_changed = False
            updated_meta = {**current_meta}
            if not from_head_referee:
                now_iso = datetime.now().isoformat()
                # 1) Hakem skoru yeniden düzenledi -> "Maç Girişini Bitir" durumunu düşür
                if alliance_meta.get("submitted"):
                    updated_meta[alliance] = {
                        **alliance_meta,
                        "submitted": False,
                        "last_updated": now_iso,
                    }
                    meta_changed = True
                # 2) Onaydan SONRA düzenleme -> baş hakem onayını geçersiz kıl (yeniden onay gerekir)
                head_meta = current_meta.get("head", {})
                if head_meta.get("approved"):
                    updated_meta["head"] = {
                        **head_meta,
                        "approved": False,
                        "invalidated_at": now_iso,
                        "invalidated_reason": f"{alliance} skoru onaydan sonra düzenlendi",
                        "last_updated": now_iso,
                    }
                    meta_changed = True

            if meta_changed:
                persisted["referee_meta"] = updated_meta
                realtime_manager.update_referee_meta(match_key, updated_meta)
                # Baş hakem / maç kontrol ekranları durumu anında görsün diye skor odasına emit et
                if socketio:
                    try:
                        latest_scores = realtime_manager.get_current_scores(match_key)
                        if latest_scores:
                            room = f"match:{event_id}:{match_source}:{match_id}"
                            socketio.emit(
                                "scores",
                                {"type": "scores", "scores": dict(latest_scores)},
                                room=room,
                                namespace="/match",
                            )
                    except Exception as emit_err:
                        logger.warning("Onay geçersizleştirme emit hatası: %s", emit_err)

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
            
            return jsonify({
                "ok": True,
                "calculated_score": result["total_score"],
                "breakdown": result["breakdown"],
                "alliance": alliance,
                "updated_by": updated_by
            })
        except Exception as e:
            logger.error(f"Hakem skor güncelleme hatası: {str(e)}", exc_info=True)
            return jsonify({"error": f"Skor güncellenirken hata oluştu: {str(e)}"}), 500
    
    @bp.route("/api/referee/score/get/<match_id>")
    @require_login
    def referee_get_score(match_id):
        """
        Bir maçın mevcut skorlarını döner.
        
        Args:
            match_id: Maç ID'si
        
        Returns:
            JSON: Mevcut skorlar ve breakdown
        """
        event_id = datastore.get_active_event_id()
        if not event_id:
            return jsonify({"error": "Aktif etkinlik yok"}), 400
        
        match_source = _normalize_match_source(request.args.get("source"))
        match_key = _build_match_key(event_id, int(match_id), match_source)
        realtime_manager = get_realtime_manager()
        current_scores = realtime_manager.get_current_scores(match_key)
        
        if not current_scores:
            return jsonify({
                "red": {},
                "blue": {},
                "referee_meta": {},
                "last_updated": None
            })
        
        # Hesaplanmış skorları al (tek bir yerde hesaplanır - modüler yapı)
        calculated_scores = current_scores.get("calculated_scores", {})
        red_result = calculated_scores.get("red", {})
        blue_result = calculated_scores.get("blue", {})
        
        # Eğer hesaplanmış skor yoksa, varsayılan değerler
        if not red_result:
            red_result = {"total_score": 0, "breakdown": {}}
        if not blue_result:
            blue_result = {"total_score": 0, "breakdown": {}}
        
        red_data = current_scores.get("red", {})
        blue_data = current_scores.get("blue", {})
        
        return jsonify({
            "red": {
                "scoring_data": red_data,
                "calculated_score": red_result["total_score"],
                "breakdown": red_result["breakdown"]
            },
            "blue": {
                "scoring_data": blue_data,
                "calculated_score": blue_result["total_score"],
                "breakdown": blue_result["breakdown"]
            },
            "referee_meta": current_scores.get("referee_meta") or {},
            "last_updated": current_scores.get("last_updated"),
            "updated_by": current_scores.get("updated_by")
        })

    @bp.route("/api/referee/submit", methods=["POST"])
    @require_login
    def referee_submit_match():
        """
        Hakemin maç girişini tamamladığını işaretler.
        """
        try:
            data = request.get_json() or {}
            match_id = data.get("match_id")
            alliance = data.get("alliance")
            match_source = _normalize_match_source(data.get("match_source"))
            if not match_id or not alliance:
                return jsonify({"error": "match_id ve alliance gerekli"}), 400
            if alliance not in ["red", "blue"]:
                return jsonify({"error": "alliance 'red' veya 'blue' olmalı"}), 400

            event_id = datastore.get_active_event_id()
            if not event_id:
                return jsonify({"error": "Aktif etkinlik yok"}), 400

            # Maçı doğrula
            if match_source == "practice":
                matches = datastore.get_practice_matches(event_id=event_id)
            else:
                matches = datastore.get_match_schedule(event_id=event_id)
            match = next((m for m in matches if m["id"] == match_id), None)
            if not match:
                return jsonify({"error": "Maç bulunamadı"}), 404

            match_key = _build_match_key(event_id, match_id, match_source)
            realtime_manager = get_realtime_manager()
            current_meta = _get_referee_meta(match)
            alliance_meta = current_meta.get(alliance, {})
            updated_meta = {
                **current_meta,
                alliance: {
                    **alliance_meta,
                    "submitted": True,
                    "submitted_at": datetime.now().isoformat(),
                    "submitted_by": session.get("user", "unknown"),
                    "last_updated": datetime.now().isoformat(),
                }
            }
            realtime_manager.update_referee_meta(match_key, updated_meta)
            _persist_referee_meta(match_id, match_source, match.get("scoring_data") or {}, updated_meta)

            return jsonify({"ok": True, "referee_meta": updated_meta})
        except Exception as e:
            logger.error(f"Hakem submit hatası: {str(e)}", exc_info=True)
            return jsonify({"error": "Hakem girişi tamamlanırken hata oluştu"}), 500

    @bp.route("/api/referee/approve", methods=["POST"])
    @require_login
    def head_referee_approve_match():
        """
        Baş hakem maç sonuçlarını onaylar.
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

            # Maçı doğrula
            if match_source == "practice":
                matches = datastore.get_practice_matches(event_id=event_id)
            else:
                matches = datastore.get_match_schedule(event_id=event_id)
            match = next((m for m in matches if m["id"] == match_id), None)
            if not match:
                return jsonify({"error": "Maç bulunamadı"}), 404

            current_meta = _get_referee_meta(match)
            if not current_meta.get("red", {}).get("submitted") or not current_meta.get("blue", {}).get("submitted"):
                return jsonify({"error": "Önce iki hakem de girişlerini tamamlamalı"}), 409

            match_key = _build_match_key(event_id, match_id, match_source)
            realtime_manager = get_realtime_manager()
            updated_meta = {
                **current_meta,
                "head": {
                    "approved": True,
                    "approved_at": datetime.now().isoformat(),
                    "approved_by": session.get("user", "unknown"),
                    "last_updated": datetime.now().isoformat(),
                }
            }
            realtime_manager.update_referee_meta(match_key, updated_meta)
            _persist_referee_meta(match_id, match_source, match.get("scoring_data") or {}, updated_meta)

            # Maç kontrol ekranının anında güncellenmesi için skor odasına "scores" emit et
            # (referee_meta.head.approved böylece MatchCore ve skor kontrol ekranına ulaşır)
            if socketio:
                current_scores = realtime_manager.get_current_scores(match_key)
                if current_scores:
                    response_data = dict(current_scores)
                    if "team_statuses" in current_scores:
                        response_data["team_statuses"] = current_scores["team_statuses"]
                    room = f"match:{event_id}:{match_source}:{match_id}"
                    socketio.emit("scores", {"type": "scores", "scores": response_data}, room=room, namespace="/match")
                    logger.info(f"Baş hakem onayı sonrası skor odasına emit: room={room}")

            return jsonify({"ok": True, "referee_meta": updated_meta})
        except Exception as e:
            logger.error(f"Baş hakem onay hatası: {str(e)}", exc_info=True)
            return jsonify({"error": "Onay sırasında hata oluştu"}), 500
