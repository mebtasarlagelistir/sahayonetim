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
    def _parse_playoff_meta(notes: str) -> dict:
        """
        Playoff meta bilgisini notes alanından parse eder.
        Format: [playoff] bracket_id=...;round=...;label=...
        """
        if not notes or "[playoff]" not in notes:
            return {}
        try:
            payload = notes.split("[playoff]", 1)[-1].strip()
            parts = [p.strip() for p in payload.split(";") if p.strip()]
            data = {}
            for part in parts:
                if "=" in part:
                    key, value = part.split("=", 1)
                    data[key.strip()] = value.strip()
            return data
        except Exception:
            return {}
    def _get_playoff_rankings(event_id: int):
        """
        Playoff için sıralama listesi oluşturur (qualification maçlarından).
        
        Not: Eksik ranking_points varsa hesaplanır.
        """
        completed_matches = datastore.get_match_schedule(
            event_id=event_id,
            status="completed",
        )
        qualification_matches = [
            m for m in completed_matches
            if (m.get("match_type") or "qualification").strip() == "qualification"
        ]
        if not qualification_matches:
            return []
        from src.core.scoring.ranking_points import RankingPointsCalculator
        for m in qualification_matches:
            scoring_data = m.get("scoring_data") if isinstance(m.get("scoring_data"), dict) else {}
            rp = scoring_data.get("ranking_points")
            if not rp:
                rp = RankingPointsCalculator.calculate_ranking_points(
                    match_type=m.get("match_type", "qualification"),
                    red_score=int(m.get("red_score") or 0),
                    blue_score=int(m.get("blue_score") or 0),
                    scoring_data=scoring_data,
                    red_alliance=m.get("red_alliance") or [],
                    blue_alliance=m.get("blue_alliance") or [],
                )
                scoring_data["ranking_points"] = rp
                m["scoring_data"] = scoring_data
        from src.core.scoring.team_rankings import TeamRankingsCalculator
        rankings_calculator = TeamRankingsCalculator()
        return rankings_calculator.calculate_team_rankings(qualification_matches)

    def _get_playoff_structure(event_data: dict, total_teams: int):
        """
        Playoff yapı bilgisini (çeyrek/yari/final) hesaplar.
        """
        def _parse_int(value, default=None):
            try:
                return int(value)
            except (TypeError, ValueError):
                return default
        format_data = event_data.get("format", {}) if isinstance(event_data, dict) else {}
        playoff_data = event_data.get("playoff", {}) if isinstance(event_data, dict) else {}
        teams_per_alliance = _parse_int(playoff_data.get("teams_per_alliance")) or _parse_int(format_data.get("teams_per_alliance"), 2)
        max_teams = _parse_int(playoff_data.get("max_teams"))
        if max_teams is None:
            max_teams = total_teams
        effective_teams = min(total_teams, max_teams)
        teams_per_match = max(1, teams_per_alliance * 2)
        quarter_count = effective_teams // teams_per_match
        semifinal_count = quarter_count // 2
        return {
            "teams_per_alliance": teams_per_alliance,
            "quarter_count": quarter_count,
            "semifinal_count": semifinal_count,
            "has_finals": semifinal_count >= 2,
        }

    def _determine_winner(match):
        red_score = match.get("red_score")
        blue_score = match.get("blue_score")
        if red_score is None or blue_score is None:
            return None, None
        try:
            red_score = int(red_score)
            blue_score = int(blue_score)
        except (TypeError, ValueError):
            return None, None
        if red_score == blue_score:
            return None, None
        if red_score > blue_score:
            return match.get("red_alliance") or [], match.get("blue_alliance") or []
        return match.get("blue_alliance") or [], match.get("red_alliance") or []

    def _update_playoff_match_alliance(match_obj, slot: str, teams: list):
        """
        Playoff maçında ittifakı günceller (slot: red|blue).
        """
        if not match_obj or slot not in ("red", "blue"):
            return False, "invalid_target"
        existing = match_obj.get("red_alliance") if slot == "red" else match_obj.get("blue_alliance")
        if existing:
            # Aynıysa hiçbir şey yapma
            if existing == teams:
                return False, "already_filled"
            # Farklıysa DÜZELTME yap: bir üst maç yeniden oynanmış/düzeltilmiş olabilir.
            # Eski (yanlış) ittifakın üzerine yaz; aksi halde bracket eski galiple asılı kalır.
            logger.warning(
                "Playoff slot düzeltiliyor (match_id=%s, slot=%s): %s -> %s",
                match_obj.get("id"), slot, existing, teams,
            )
        update_data = {"red_alliance": teams} if slot == "red" else {"blue_alliance": teams}
        datastore.update_match(match_id=match_obj.get("id"), **update_data)
        return True, "updated"

    # Otomatik doldurulan ittifak ödüllerinin adları (şablon ile birebir aynı olmalı —
    # static/js/awards.js awardPresets içindeki adlarla eşleşir).
    PLAYOFF_AWARD_LABELS = {
        "champion": [
            "Robot Performansı Kazanan İttifak (1)",
            "Robot Performansı Kazanan İttifak (2)",
        ],
        "finalist": [
            "Robot Performansı Finalist İttifak (1)",
            "Robot Performansı Finalist İttifak (2)",
        ],
    }

    def _populate_alliance_awards(event_id: int, champion_teams: list, finalist_teams: list) -> None:
        """
        Playoff şampiyon ve finalist ittifaklarını ilgili 'Robot Performansı' ödüllerine
        otomatik yazar. Ödül adına göre upsert eder (jüri ödüllerini etkilemez).
        Operatör daha sonra Ödül Atama sayfasından elle düzeltebilir.
        """
        try:
            team_names = {
                str(t.get("number")): (t.get("name") or "")
                for t in (datastore.get_teams() or [])
            }
            pairs = []
            for i, label in enumerate(PLAYOFF_AWARD_LABELS["champion"]):
                num = champion_teams[i] if i < len(champion_teams or []) else None
                pairs.append((label, num))
            for i, label in enumerate(PLAYOFF_AWARD_LABELS["finalist"]):
                num = finalist_teams[i] if i < len(finalist_teams or []) else None
                pairs.append((label, num))

            for award_name, team_num in pairs:
                if not team_num:
                    continue
                datastore.save_award_winner(
                    award_name=award_name,
                    winner_team_number=str(team_num),
                    winner_team_name=team_names.get(str(team_num), ""),
                    award_category="Robot Performansı",
                    award_description="Playoff sonucuna göre otomatik atandı (Ödül Atama'dan düzenlenebilir).",
                    event_id=event_id,
                )
            logger.info(
                "Playoff ittifak ödülleri otomatik dolduruldu: şampiyon=%s, finalist=%s",
                champion_teams, finalist_teams,
            )
            # Seyirci ekranlarına ödül güncellemesi bildir
            try:
                socketio.emit("awards_update", {"type": "awards_update"}, namespace="/audience")
            except Exception:
                pass
        except Exception as e:
            logger.warning("Playoff ittifak ödülü otomatik atama hatası: %s", e)

    def _advance_playoff_match(event_id: int, match_id: int) -> dict | None:
        """
        Playoff maçları tamamlandıkça kazananları bir sonraki maça taşır.
        """
        try:
            playoff_matches = datastore.get_match_schedule(event_id=event_id, match_type="final")
            if not playoff_matches:
                return None
            playoff_matches = sorted(
                playoff_matches,
                key=lambda m: (m.get("match_number") or 0, m.get("match_date") or "", m.get("match_time") or "")
            )
            match = next((m for m in playoff_matches if m.get("id") == match_id), None)
            if not match:
                return None
            # Sadece final/playoff maçları için ilerlet
            if (match.get("match_type") or "").strip() != "final":
                return None

            # Aynı bracket_id içindeki maçlara bak (eski playoff'lar karışmasın)
            match_meta = _parse_playoff_meta(match.get("notes") or "")
            bracket_id = match_meta.get("bracket_id")
            if bracket_id:
                playoff_matches = [
                    m for m in playoff_matches
                    if _parse_playoff_meta(m.get("notes") or "").get("bracket_id") == bracket_id
                ]
                playoff_matches = sorted(
                    playoff_matches,
                    key=lambda m: (m.get("match_number") or 0, m.get("match_date") or "", m.get("match_time") or "")
                )
                match = next((m for m in playoff_matches if m.get("id") == match_id), None)
                if not match:
                    return None

            # Round bilgisi varsa önce onu kullan
            round_meta = _parse_playoff_meta(match.get("notes") or "")
            round_key = round_meta.get("round")
            label = round_meta.get("label")

            # === GENEL YÖNLENDİRME (çift eleme vb.: win_to / lose_to / gf) ===
            # Maç meta'sında win_to/gf varsa, kazanan/kaybeden hedef etiket:slot'a
            # yönlendirilir. Bu yol single-elim'i etkilemez (onlarda win_to yoktur).
            win_to = round_meta.get("win_to")
            lose_to = round_meta.get("lose_to")
            gf = round_meta.get("gf")
            if win_to or gf:
                winner, loser = _determine_winner(match)
                if not winner:
                    return {"status": "skipped", "message": "Playoff ilerlemedi: skorlar eşit veya eksik."}

                def _find_by_label(lbl):
                    return next(
                        (m for m in playoff_matches
                         if _parse_playoff_meta(m.get("notes") or "").get("label") == lbl),
                        None,
                    )

                # Büyük Final rövanşı (M11): yalnızca tamamlanır, ilerletme yok
                if gf == "reset":
                    # Şampiyon = M11 galibi, finalist = M11 mağlubu
                    _populate_alliance_awards(event_id, winner, loser)
                    return {"status": "advanced", "message": "Büyük Final (rövanş) tamamlandı: şampiyon belirlendi."}

                # Büyük Final (M10)
                if gf == "1":
                    red_alliance = match.get("red_alliance") or []
                    # Kırmızı = üst kademe şampiyonu. Kırmızı kazanırsa turnuva biter.
                    if winner == red_alliance:
                        # Şampiyon = üst kademe (kırmızı), finalist = alt kademe (mavi)
                        _populate_alliance_awards(event_id, winner, match.get("blue_alliance") or [])
                        return {"status": "advanced", "message": "Büyük Final tamamlandı: Üst kademe şampiyonu kazandı."}
                    # Mavi (alt kademe şampiyonu) kazandı -> bracket reset (rövanş)
                    reset_label = round_meta.get("reset_to")
                    target = _find_by_label(reset_label) if reset_label else None
                    if target:
                        _update_playoff_match_alliance(target, "red", match.get("red_alliance") or [])
                        _update_playoff_match_alliance(target, "blue", match.get("blue_alliance") or [])
                        return {"status": "advanced", "message": f"Büyük Final eşitlendi: rövanş ({reset_label}) oluşturuldu."}
                    return {"status": "advanced", "message": "Büyük Final tamamlandı."}

                # Normal win_to / lose_to yönlendirmesi
                messages = []
                if win_to and ":" in win_to:
                    lbl, slot = win_to.split(":", 1)
                    target = _find_by_label(lbl)
                    if target:
                        updated, _ = _update_playoff_match_alliance(target, slot, winner)
                        if updated:
                            messages.append(f"Kazanan -> {lbl} ({slot})")
                if lose_to and ":" in lose_to and loser:
                    lbl, slot = lose_to.split(":", 1)
                    target = _find_by_label(lbl)
                    if target:
                        updated, _ = _update_playoff_match_alliance(target, slot, loser)
                        if updated:
                            messages.append(f"Kaybeden -> {lbl} ({slot})")
                if messages:
                    return {"status": "advanced", "message": "Playoff ilerledi: " + ", ".join(messages)}
                return {"status": "skipped", "message": "Playoff ilerlemedi: hedef slotlar dolu/bulunamadı."}

            meta_by_round = {}
            for m in playoff_matches:
                meta = _parse_playoff_meta(m.get("notes") or "")
                rkey = meta.get("round")
                if not rkey:
                    continue
                meta_by_round.setdefault(rkey, []).append((m, meta))

            if round_key and round_key in ("quarterfinal", "semifinal"):
                if round_key == "quarterfinal":
                    winner, _loser = _determine_winner(match)
                    if not winner:
                        return {"status": "skipped", "message": "Playoff ilerlemedi: skorlar eşit veya eksik."}
                    semifinal_matches = meta_by_round.get("semifinal", [])
                    if not semifinal_matches:
                        return {"status": "skipped", "message": "Playoff ilerlemedi: yarı final maçları bulunamadı."}
                    if label in ("A", "B"):
                        target_label = "YF-1"
                        slot = "red" if label == "A" else "blue"
                    elif label in ("C", "D"):
                        target_label = "YF-2"
                        slot = "red" if label == "C" else "blue"
                    else:
                        # Label yoksa sıraya göre
                        qf_list = meta_by_round.get("quarterfinal", [])
                        idx = next((i for i, (m, _meta) in enumerate(qf_list) if m.get("id") == match_id), None)
                        if idx is None:
                            return {"status": "skipped", "message": "Playoff ilerlemedi: çeyrek eşleştirmesi bulunamadı."}
                        sf_index = idx // 2
                        slot = "red" if idx % 2 == 0 else "blue"
                        if sf_index >= len(semifinal_matches):
                            return {"status": "skipped", "message": "Playoff ilerlemedi: yarı final eşleşmesi bulunamadı."}
                        target_match = semifinal_matches[sf_index][0]
                        updated, reason = _update_playoff_match_alliance(target_match, slot, winner)
                        if updated:
                            return {"status": "advanced", "message": f"Playoff ilerledi: Yarı Final ({target_match.get('notes') or 'YF'}) {slot.capitalize()} ittifaka yazıldı."}
                        return {"status": "skipped", "message": "Playoff ilerlemedi: hedef maç dolu."}
                    target_match = next((m for m, meta in semifinal_matches if meta.get("label") == target_label), None)
                    if not target_match:
                        return {"status": "skipped", "message": "Playoff ilerlemedi: hedef yarı final bulunamadı."}
                    updated, reason = _update_playoff_match_alliance(target_match, slot, winner)
                    if updated:
                        return {"status": "advanced", "message": f"Playoff ilerledi: Yarı Final ({target_label}) {('Kırmızı' if slot == 'red' else 'Mavi')} ittifaka yazıldı."}
                    return {"status": "skipped", "message": "Playoff ilerlemedi: hedef maç dolu."}

                # semifinal -> final/third
                winner, loser = _determine_winner(match)
                if not winner or not loser:
                    return {"status": "skipped", "message": "Playoff ilerlemedi: skorlar eşit veya eksik."}
                final_matches = meta_by_round.get("final", [])
                third_matches = meta_by_round.get("third_place", [])
                if not final_matches or not third_matches:
                    return {"status": "skipped", "message": "Playoff ilerlemedi: final/üçüncülük maçları bulunamadı."}
                if label == "YF-1":
                    slot = "red"
                elif label == "YF-2":
                    slot = "blue"
                else:
                    # Label yoksa sıraya göre
                    sf_list = meta_by_round.get("semifinal", [])
                    idx = next((i for i, (m, _meta) in enumerate(sf_list) if m.get("id") == match_id), None)
                    if idx is None:
                        return {"status": "skipped", "message": "Playoff ilerlemedi: yarı final eşleştirmesi bulunamadı."}
                    slot = "red" if idx % 2 == 0 else "blue"
                final_match = final_matches[0][0]
                third_match = third_matches[0][0]
                updated_final, _ = _update_playoff_match_alliance(final_match, slot, winner)
                updated_third, _ = _update_playoff_match_alliance(third_match, slot, loser)
                if updated_final or updated_third:
                    return {"status": "advanced", "message": "Playoff ilerledi: Final ve Üçüncülük maçları güncellendi."}
                return {"status": "skipped", "message": "Playoff ilerlemedi: hedef maçlar dolu."}

            # Fallback: meta yoksa mevcut maçlardan çeyrek/yari sayısını çıkar
            quarter_matches = [
                m for m in playoff_matches
                if (m.get("red_alliance") or []) and (m.get("blue_alliance") or [])
            ]
            quarter_count = len(quarter_matches)
            semifinal_count = quarter_count // 2
            has_finals = semifinal_count >= 2
            if quarter_count <= 0:
                return {"status": "skipped", "message": "Playoff ilerlemedi: çeyrek final eşleşmesi bulunamadı."}

            index = next((i for i, m in enumerate(playoff_matches) if m.get("id") == match_id), None)
            if index is None:
                return {"status": "skipped", "message": "Playoff ilerlemedi: eşleşme bulunamadı."}

            if index < quarter_count:
                winner, _loser = _determine_winner(match)
                if not winner:
                    return {"status": "skipped", "message": "Playoff ilerlemedi: skorlar eşit veya eksik."}
                sf_index = index // 2
                target_index = quarter_count + sf_index
                if target_index >= len(playoff_matches):
                    return {"status": "skipped", "message": "Playoff ilerlemedi: hedef yarı final bulunamadı."}
                target_match = playoff_matches[target_index]
                slot = "red" if index % 2 == 0 else "blue"
                updated, _ = _update_playoff_match_alliance(target_match, slot, winner)
                if updated:
                    return {"status": "advanced", "message": "Playoff ilerledi: Yarı final güncellendi."}
                return {"status": "skipped", "message": "Playoff ilerlemedi: hedef maç dolu."}

            if index < quarter_count + semifinal_count and has_finals:
                winner, loser = _determine_winner(match)
                if not winner or not loser:
                    return {"status": "skipped", "message": "Playoff ilerlemedi: skorlar eşit veya eksik."}
                sf_index = index - quarter_count
                third_index = quarter_count + semifinal_count
                final_index = third_index + 1
                if final_index >= len(playoff_matches):
                    return {"status": "skipped", "message": "Playoff ilerlemedi: final/üçüncülük bulunamadı."}
                third_match = playoff_matches[third_index]
                final_match = playoff_matches[final_index]
                slot = "red" if sf_index % 2 == 0 else "blue"
                updated_final, _ = _update_playoff_match_alliance(final_match, slot, winner)
                updated_third, _ = _update_playoff_match_alliance(third_match, slot, loser)
                if updated_final or updated_third:
                    return {"status": "advanced", "message": "Playoff ilerledi: Final ve Üçüncülük güncellendi."}
                return {"status": "skipped", "message": "Playoff ilerlemedi: hedef maçlar dolu."}
        except Exception as e:
            logger.error("Playoff auto-advance error: %s", str(e), exc_info=True)
            return {"status": "error", "message": "Playoff ilerlemedi: beklenmeyen hata."}

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

            # Playoff otomatik ilerletme (sadece schedule + final maçları için)
            if match_source != "practice":
                try:
                    _advance_playoff_match(event_id, match_id)
                except Exception as advance_err:
                    logger.warning("Playoff auto-advance (finalize) hatası: %s", str(advance_err))
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
            
            # Baş hakem / maç kontrol ile senkron: realtime skorları aktif maça ekle
            # Böylece sayfa ilk yüklendiğinde mavi ve kırmızı skorlar görünür
            match_key = _build_match_key(event_id, match_id, match_source)
            try:
                realtime_manager = get_realtime_manager()
                current_scores = realtime_manager.get_current_scores(match_key)
                if current_scores:
                    if "scoring_data" not in match or not isinstance(match.get("scoring_data"), dict):
                        match["scoring_data"] = {}
                    match["scoring_data"]["red"] = current_scores.get("red") or match["scoring_data"].get("red") or {}
                    match["scoring_data"]["blue"] = current_scores.get("blue") or match["scoring_data"].get("blue") or {}
                    match["scoring_data"]["referee_meta"] = current_scores.get("referee_meta") or match["scoring_data"].get("referee_meta") or {}
                    if current_scores.get("team_statuses"):
                        match["scoring_data"]["team_statuses"] = current_scores["team_statuses"]
                    if current_scores.get("calculated_scores"):
                        match["scoring_data"]["calculated_scores"] = current_scores["calculated_scores"]
            except Exception as e:
                logger.debug("Aktif maça realtime skor eklenirken hata (görmezden gelindi): %s", str(e))
            
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
            
            # Tüm robotlar için hazırlık durumu zorunlu: Hazır, DQ, RY veya Bypass
            ALLOWED_START_STATUSES = {"ready", "dq", "ry", "bypass"}
            team_statuses = data.get("team_statuses")
            if not isinstance(team_statuses, dict):
                return jsonify({
                    "error": "Tüm robotlar için hazırlık durumu işaretleyin (Hazır, DQ, RY veya Bypass)"
                }), 400
            red_teams = match.get("red_alliance") or []
            blue_teams = match.get("blue_alliance") or []
            for alliance_name, teams_list in [("red", red_teams), ("blue", blue_teams)]:
                alliance_statuses = team_statuses.get(alliance_name) or {}
                for i in range(1, len(teams_list) + 1):
                    robot_key = f"r{i}"
                    status = alliance_statuses.get(robot_key)
                    if not status or status not in ALLOWED_START_STATUSES:
                        return jsonify({
                            "error": "Tüm robotlar için hazırlık durumu işaretleyin (Hazır, DQ, RY veya Bypass)"
                        }), 400
            
            # Robot durumlarını kaydet (eğer gönderildiyse)
            # ÖNEMLİ: Robot durumları maç başlatıldığında kaydedilmeli
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
            
            # Yeni maç başladığında önceki maçın skorları kalmasın: realtime skorları sıfırla
            # Böylece maç kontrol ve hakem tabletleri boş puanlarla başlar
            match_key = _build_match_key(event_id, match_id, match_source)
            realtime_manager = get_realtime_manager()
            realtime_manager.cleanup_match(match_key)
            realtime_manager.register_match(match_key)
            
            logger.info(f"Maç başlatıldı: Maç {match.get('match_number', '?')} (match_id: {match_id}, kullanıcı: {session.get('username', 'unknown')})")
            
            # Güncel maç bilgisini al; skorları realtime'dan (artık boş) al ki yanıt önceki maçın puanlarını taşımasın
            active_match = match_state_manager.get_active_match(event_id)
            if active_match:
                current_scores = realtime_manager.get_current_scores(match_key)
                if current_scores:
                    if "scoring_data" not in active_match or not isinstance(active_match.get("scoring_data"), dict):
                        active_match["scoring_data"] = {}
                    active_match["scoring_data"]["red"] = current_scores.get("red") or {}
                    active_match["scoring_data"]["blue"] = current_scores.get("blue") or {}
                    active_match["scoring_data"]["referee_meta"] = current_scores.get("referee_meta") or {}
                    if current_scores.get("team_statuses"):
                        active_match["scoring_data"]["team_statuses"] = current_scores["team_statuses"]
                    if current_scores.get("calculated_scores"):
                        active_match["scoring_data"]["calculated_scores"] = current_scores["calculated_scores"]
            
            # WebSocket ile tüm abone olan client'lara hemen match_state ve sıfırlanmış skorları gönder
            if socketio and active_match:
                room = _get_match_room(event_id, match_id, match_source)
                match_data = dict(active_match)
                match_data["server_timestamp"] = time.time()  # Timer senkronizasyonu için
                socketio.emit("match_state", {
                    "type": "match_state",
                    "match": match_data
                }, room=room, namespace="/match")
                # Hakem tabletleri ve maç kontrol ekranı skorları hemen sıfırlansın diye "scores" da gönder
                current_scores = realtime_manager.get_current_scores(match_key)
                if current_scores:
                    response_data = dict(current_scores)
                    if "team_statuses" in current_scores:
                        response_data["team_statuses"] = current_scores["team_statuses"]
                    socketio.emit("scores", {"type": "scores", "scores": response_data}, room=room, namespace="/match")
                logger.info(f"WebSocket match_state ve scores gönderildi (maç başlatıldı): room={room}")
                # Seyirci ekranları maç başlangıcı ile senkron: anında match_update + scores_update
                match_data["state_label"] = MATCH_STATES.get(match_data.get("current_state"), "Beklemede")
                socketio.emit("match_update", {
                    "type": "match_update",
                    "match": match_data,
                    "server_timestamp": match_data["server_timestamp"]
                }, namespace="/audience")
                red_score = 0
                blue_score = 0
                if current_scores:
                    try:
                        from src.core.scoring import ScoreCalculator
                        calc = ScoreCalculator()
                        red_data = current_scores.get("red") or {}
                        blue_data = current_scores.get("blue") or {}
                        if red_data or blue_data:
                            if red_data:
                                red_score = calc.calculate_alliance_score("red", red_data, blue_data).get("total_score", 0)
                            if blue_data:
                                blue_score = calc.calculate_alliance_score("blue", blue_data, red_data).get("total_score", 0)
                    except Exception as calc_err:
                        logger.warning(f"Audience skor hesaplama (start_match): {calc_err}")
                socketio.emit("scores_update", {
                    "type": "scores_update",
                    "scores": {"red_score": red_score, "blue_score": blue_score},
                    "server_timestamp": time.time()
                }, namespace="/audience")
                
                # Tüm audience ekranlarına view_change gönder (awards/rankings'den match view'a geçmeleri için)
                # ÖNEMLİ: Bu sayede maç başladığında tüm ekranlar otomatik olarak maç view'a geçer
                event_data_for_view = datastore.get_event()  # Aktif event'i al
                screens_config = event_data_for_view.get("screens", {}) if event_data_for_view else {}
                
                # Global active_view'ı da "match" olarak güncelle
                if event_data_for_view and screens_config.get("active_view") != "match":
                    screens_config["active_view"] = "match"
                    event_data_for_view["screens"] = screens_config
                    datastore.save_event(event_data_for_view)  # Aktif event'i kaydet
                    logger.info("Maç başladı - global active_view 'match' olarak ayarlandı")
                
                socketio.emit("view_change", {
                    "active_view": "match",
                    "overlay_enabled": screens_config.get("overlay_enabled", False),
                    "overlay_text": screens_config.get("overlay_text", ""),
                    "overlay_chroma_enabled": screens_config.get("overlay_chroma_enabled", False),
                    "overlay_chroma_color": screens_config.get("overlay_chroma_color", "#00ff00")
                }, namespace="/audience")
                logger.info("Maç başlatıldı - view_change broadcast edildi (tüm audience ekranlarına)")
            
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
    
    @bp.route("/api/match-control/team-status", methods=["POST"])
    @require_login
    @require_event_manager
    def update_team_status():
        """
        Maç kontrol ekranından robot hazırlık durumlarını kaydeder.
        Hakem panelleri ile senkron kalır; backend birleştirir ve WebSocket ile yayınlar.
        """
        try:
            data = request.get_json() or {}
            match_id = data.get("match_id")
            match_source = _normalize_match_source(data.get("match_source"))
            team_statuses = data.get("team_statuses")
            if not match_id:
                return jsonify({"error": "match_id gerekli"}), 400
            if not isinstance(team_statuses, dict):
                return jsonify({"error": "team_statuses gerekli"}), 400
            event_id = datastore.get_active_event_id()
            if not event_id:
                return jsonify({"error": "Aktif etkinlik yok"}), 400
            match_key = _build_match_key(event_id, match_id, match_source)
            realtime_manager = get_realtime_manager()
            realtime_manager.update_team_statuses_only(match_key, team_statuses)
            if socketio:
                room = _get_match_room(event_id, match_id, match_source)
                current_scores = realtime_manager.get_current_scores(match_key)
                if current_scores:
                    response_data = dict(current_scores)
                    if "team_statuses" in current_scores:
                        response_data["team_statuses"] = current_scores["team_statuses"]
                    socketio.emit("scores", {"type": "scores", "scores": response_data}, room=room, namespace="/match")
            return jsonify({"ok": True})
        except Exception as e:
            logger.error(f"Team status güncelleme hatası: {str(e)}", exc_info=True)
            return jsonify({"error": "Robot durumları güncellenirken hata oluştu"}), 500
    
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
    
    @bp.route("/api/match-control/reset-active", methods=["POST"])
    @require_login
    @require_event_manager
    def reset_active_match():
        """
        Veritabanında in_progress kalan (takılı kalan) aktif maçı sıfırlar.
        Ayrıca cache'deki tüm maç durumlarını temizler (preview dahil).
        Yeni maç başlatmak için kullanılır; Maç 2 (Saha 2) gibi eski aktif maç temizlenir.
        """
        try:
            event_id = datastore.get_active_event_id()
            if not event_id:
                return jsonify({"error": "Aktif etkinlik yok"}), 400
            
            reset_list = []
            
            # 1. Veritabanındaki in_progress maçları sıfırla
            active_schedule = datastore.get_match_schedule(event_id=event_id, status="in_progress")
            for m in active_schedule or []:
                match_state_manager.stop_match(event_id=event_id, match_id=m["id"], match_source="schedule")
                reset_list.append({"match_number": m.get("match_number"), "field_number": m.get("field_number"), "match_source": "schedule"})
            
            active_practice = datastore.get_practice_matches(event_id=event_id, status="in_progress")
            for m in active_practice or []:
                match_state_manager.stop_match(event_id=event_id, match_id=m["id"], match_source="practice")
                reset_list.append({"match_number": m.get("match_number"), "field_number": m.get("field_number"), "match_source": "practice"})
            
            # 2. Cache'deki TÜM maç durumlarını temizle (preview dahil) - önemli!
            match_state_manager.clear_all_matches(event_id)
            
            # 3. Realtime manager'daki veriyi de temizle
            realtime_manager = get_realtime_manager()
            realtime_manager.cleanup_all_matches(event_id)
            
            # 4. Ekranların view'ını "match" olarak ayarla (ödül törenine dönmeyi engelle)
            # Reset sonrası genellikle yeni maç başlatılacak
            event_data = datastore.get_event()  # Aktif event'i al
            if event_data:
                current_view = event_data.get("screens", {}).get("active_view", "match")
                if current_view != "match":
                    event_data.setdefault("screens", {})["active_view"] = "match"
                    datastore.save_event(event_data)  # Aktif event'i kaydet
                    logger.info("Reset-active: active_view set to match")
                    
                    # WebSocket ile tüm ekranlara bildir
                    if socketio:
                        screens_config = event_data.get("screens", {})
                        socketio.emit("view_change", {
                            "active_view": "match",
                            "overlay_enabled": screens_config.get("overlay_enabled", False),
                            "overlay_text": screens_config.get("overlay_text", ""),
                            "overlay_chroma_enabled": screens_config.get("overlay_chroma_enabled", False),
                            "overlay_chroma_color": screens_config.get("overlay_chroma_color", "#00ff00")
                        }, namespace="/audience")
            
            logger.info("Aktif maç sıfırlandı (DB + cache temizlendi): %s (kullanıcı: %s)", reset_list, session.get("user", "?"))
            return jsonify({"ok": True, "reset": reset_list, "cache_cleared": True})
        except Exception as e:
            logger.error("Aktif maç sıfırlama hatası: %s", e, exc_info=True)
            return jsonify({"error": "Aktif maç sıfırlanırken bir hata oluştu"}), 500
    
    @bp.route("/api/match-control/reset-match", methods=["POST"])
    @require_login
    @require_event_manager
    def reset_specific_match():
        """
        Belirli bir maçı skorlarını sıfırlayarak yeniden başlatılabilir hale getirir.
        
        Tamamlanmış bir maçı yeniden oynamak için kullanılır.
        
        Body:
            match_id: Maç ID
            match_source: "schedule" veya "practice" (varsayılan: schedule)
        """
        try:
            event_id = datastore.get_active_event_id()
            if not event_id:
                return jsonify({"error": "Aktif etkinlik yok"}), 400
            
            data = request.get_json() or {}
            match_id = data.get("match_id")
            match_source = data.get("match_source", "schedule")
            
            if not match_id:
                return jsonify({"error": "match_id parametresi gerekli"}), 400
            
            # Maçı veritabanından al
            if match_source == "practice":
                # Deneme maçları için ID ile arama (filtreleme ile)
                all_practice = datastore.get_practice_matches(event_id=event_id)
                match = next((m for m in all_practice if m.get("id") == match_id), None)
            else:
                # Resmi (schedule/playoff) maçlar için ID ile arama.
                # NOT: datastore.get_match diye bir metot yok; get_match_schedule kullanılır.
                all_schedule = datastore.get_match_schedule(event_id=event_id)
                match = next((m for m in all_schedule if m.get("id") == match_id), None)
            
            if not match:
                return jsonify({"error": "Maç bulunamadı"}), 404
            
            # Maç skorlarını sıfırla
            update_data = {
                "red_score": 0,
                "blue_score": 0,
                "scoring_data": {},
                "status": "scheduled"
            }
            
            if match_source == "practice":
                datastore.update_practice_match(match_id=match_id, **update_data)
            else:
                datastore.update_match(match_id=match_id, **update_data)
                advance_result = _advance_playoff_match(event_id, match_id)
            
            # Cache'deki maç durumunu temizle
            match_key = _build_match_key(event_id, match_id, match_source)
            realtime_manager = get_realtime_manager()
            realtime_manager.initialize_match(match_key)
            
            # Match state manager'da da temizle
            match_state_manager.stop_match(event_id=event_id, match_id=match_id, match_source=match_source)
            
            logger.info("Maç sıfırlandı (yeniden başlatılabilir): match_id=%s, source=%s (kullanıcı: %s)", 
                       match_id, match_source, session.get("user", "?"))
            
            return jsonify({
                "ok": True, 
                "match_id": match_id,
                "match_source": match_source,
                "message": "Maç sıfırlandı. Artık yeniden başlatabilirsiniz."
            })
            
        except Exception as e:
            logger.error("Maç sıfırlama hatası: %s", e, exc_info=True)
            return jsonify({"error": "Maç sıfırlanırken bir hata oluştu"}), 500
    
    @bp.route("/api/match-control/state", methods=["POST"])
    @require_login
    @require_event_manager
    def update_match_state():
        """
        Maç durumunu günceller (autonomous -> prepare_teleop -> driver_controlled -> post_match).

        Body:
            match_id: Maç ID'si
            state: Yeni durum (autonomous, prepare_teleop, driver_controlled, post_match)
        
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
                # Seyirci ekranları maç kontrol ile senkron: aynı anda match_update gönder (ses + timer)
                match_data["state_label"] = MATCH_STATES.get(match_data.get("current_state"), "Beklemede")
                socketio.emit("match_update", {
                    "type": "match_update",
                    "match": match_data,
                    "server_timestamp": match_data["server_timestamp"]
                }, namespace="/audience")
            
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
        Hakem ekranlarına WebSocket ile yeni maç bilgisini gönderir.
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

            # Önceki maç skorlarını temizle (yeni maç için temiz başlangıç)
            match_key = _build_match_key(event_id, match_id, match_source)
            realtime_manager = get_realtime_manager()
            # Yeni maç için realtime skorları sıfırla
            realtime_manager.initialize_match(match_key)
            logger.info(f"Preview: Realtime skorlar sıfırlandı - match_key={match_key}")

            # Merkezi MatchStateManager ile preview durumuna al
            match_state_manager.set_match_preview(
                event_id=event_id,
                match_id=match_id,
                match_source=match_source,
                match_data=match
            )
            
            # Hakem ekranlarına WebSocket ile yeni maç bilgisini gönder
            if socketio:
                room = _get_match_room(event_id, match_id, match_source)
                
                # Tüm hakem ekranlarına match_preview event'i gönder
                preview_data = {
                    "type": "match_preview",
                    "match": {
                        "id": match_id,
                        "match_number": match.get("match_number"),
                        "match_type": match.get("match_type", "qualification"),
                        "match_source": match_source,
                        "field_number": match.get("field_number", 1),
                        "red_alliance": match.get("red_alliance", []),
                        "blue_alliance": match.get("blue_alliance", []),
                        "red_score": 0,  # Yeni maç için sıfır
                        "blue_score": 0,  # Yeni maç için sıfır
                        "status": "preview",
                        "scoring_data": match.get("scoring_data", {})
                    }
                }
                
                # /match namespace'ine gönder (hakem ekranları bu namespace'i dinliyor)
                socketio.emit("match_preview", preview_data, namespace="/match")
                logger.info(f"Preview: WebSocket bildirimi gönderildi - match_id={match_id}, namespace=/match")
            
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
                        # Timer senkronizasyonu: sunucu time_remaining'i günceller, tüm UI'lar aynı değeri alır
                        match_state_manager.refresh_match_state(event_id, match_key)
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
            advance_result = None
            
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
            
            # Maç bilgisini al (match_type için)
            if match_source == "practice":
                matches = datastore.get_practice_matches(event_id=event_id)
            else:
                matches = datastore.get_match_schedule(event_id=event_id)
            match_info = next((m for m in matches if m["id"] == match_id), None)

            # Detaylı skorlama verilerini ekle
            scoring_data = data.get("scoring_data")
            if isinstance(scoring_data, dict):
                update_data["scoring_data"] = scoring_data
                
                # Sıralama Puanları (SP) hesapla (sadece sıralama maçları için)
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

            # Playoff otomatik ilerletme (sadece schedule + final maçları için)
            if match_source != "practice":
                match_type = (match_info or {}).get("match_type", "")
                if (match_type or "").strip() == "final":
                    advance_result = _advance_playoff_match(event_id, match_id)
            
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
                "match": match,
                "playoff_advance": advance_result if match_source != "practice" else None,
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
        REST fallback ile seyirci ekranı güncel timer/skor alır; önce refresh_match_state ile güncellenir.
        
        ÖNEMLİ: Skorlar realtime_manager'dan alınır (WebSocket ile senkron).
        """
        event_id = datastore.get_active_event_id()
        if not event_id:
            return jsonify({"match": None})
        
        match = match_state_manager.get_active_match(event_id)
        if not match:
            return jsonify({"match": None})
        
        # Canlı timer için cache güncelle (REST ile açan seyirci de güncel görsün)
        match_id = match.get("id")
        match_source = match.get("match_source", "schedule")
        match_key = _build_match_key(event_id, match_id, match_source)
        match_state_manager.refresh_match_state(event_id, match_key)
        match = match_state_manager.get_active_match(event_id)
        if not match:
            return jsonify({"match": None})
        
        # Realtime skorları al (WebSocket ile senkron kalması için)
        realtime_manager = get_realtime_manager()
        current_scores = realtime_manager.get_current_scores(match_key)
        
        # Canlı skorları hesapla
        red_score = match.get("red_score", 0)
        blue_score = match.get("blue_score", 0)
        
        if current_scores:
            calculated = current_scores.get("calculated_scores", {})
            if calculated:
                red_score = calculated.get("red", {}).get("total_score", red_score)
                blue_score = calculated.get("blue", {}).get("total_score", blue_score)
        
        # Baş hakem / MatchCore ile aynı mantık: timer senkronu için server_timestamp
        server_ts = time.time()
        return jsonify({
            "server_timestamp": server_ts,
            "match": {
                "id": match.get("id"),
                "match_number": match.get("match_number"),
                "match_type": match.get("match_type", "qualification"),
                "match_source": match.get("match_source", "schedule"),
                "field_number": match.get("field_number", 1),
                "red_alliance": match.get("red_alliance", []),
                "blue_alliance": match.get("blue_alliance", []),
                "red_score": red_score,
                "blue_score": blue_score,
                "current_state": match.get("current_state", "idle"),
                "time_remaining": match.get("time_remaining", 0),
                "state_label": match.get("state_label") or MATCH_STATES.get(match.get("current_state", "idle"), "Beklemede"),
                "server_timestamp": server_ts,
            }
        })
    
    # SSE endpoint kaldırıldı - WebSocket kullanın (/audience namespace, subscribe_audience event)
    
    @bp.route("/api/match-control/next-match")
    @require_login
    def get_next_match():
        """
        Sıradaki maçı döner (takvim + deneme maçları birlikte; tarih/saat sırasına göre en erken).
        
        Returns:
            JSON: { "match": {...}, "match_source": "schedule" | "practice" } veya {"match": None}
        """
        event_id = datastore.get_active_event_id()
        if not event_id:
            return jsonify({"match": None})
        
        # Takvim: scheduled durumundaki ilk maç (zaten tarih/saat sıralı)
        schedule_matches = datastore.get_match_schedule(
            event_id=event_id,
            status="scheduled"
        )
        next_schedule = schedule_matches[0] if schedule_matches else None
        
        # Deneme: scheduled durumundaki ilk maç (zaten tarih/saat sıralı)
        practice_matches = datastore.get_practice_matches(
            event_id=event_id,
            status="scheduled"
        )
        next_practice = practice_matches[0] if practice_matches else None
        
        # Hangisi daha erken? (tarih + saat karşılaştırması)
        def datetime_key(m):
            return (m.get("match_date") or "", m.get("match_time") or "")
        
        if not next_schedule and not next_practice:
            return jsonify({"match": None})
        if not next_schedule:
            next_practice["match_source"] = "practice"
            return jsonify({"match": next_practice})
        if not next_practice:
            next_schedule["match_source"] = "schedule"
            return jsonify({"match": next_schedule})
        if datetime_key(next_practice) < datetime_key(next_schedule):
            next_practice["match_source"] = "practice"
            return jsonify({"match": next_practice})
        next_schedule["match_source"] = "schedule"
        return jsonify({"match": next_schedule})

    @bp.route("/api/public/next-match")
    def get_next_match_public():
        """
        Seyirci ekranı için sıradaki maçı döner (giriş gerektirmez).
        Takvim + deneme maçları birlikte; tarih/saat sırasına göre en erken döner.
        """
        event_id = datastore.get_active_event_id()
        if not event_id:
            return jsonify({"match": None})
        schedule_matches = datastore.get_match_schedule(
            event_id=event_id,
            status="scheduled"
        )
        next_schedule = schedule_matches[0] if schedule_matches else None
        practice_matches = datastore.get_practice_matches(
            event_id=event_id,
            status="scheduled"
        )
        next_practice = practice_matches[0] if practice_matches else None

        def _dt_key(m):
            return (m.get("match_date") or "", m.get("match_time") or "")

        if not next_schedule and not next_practice:
            return jsonify({"match": None})
        if not next_schedule:
            next_practice["match_source"] = "practice"
            return jsonify({"match": next_practice})
        if not next_practice:
            next_schedule["match_source"] = "schedule"
            return jsonify({"match": next_schedule})
        if _dt_key(next_practice) < _dt_key(next_schedule):
            next_practice["match_source"] = "practice"
            return jsonify({"match": next_practice})
        next_schedule["match_source"] = "schedule"
        return jsonify({"match": next_schedule})

    @bp.get("/api/public/playoff-alliances")
    def get_playoff_alliances_public():
        """
        Seçilen playoff ittifaklarını (kaptan + partner) public olarak döner.

        Kaynak: event_data.playoff.alliances (manuel kaptan seçimiyle kaydedilir).
        Seyirci ekranındaki "İttifak Seçimi" töreni görünümü bu veriyi kullanır.
        """
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"ok": False, "error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event() or {}
        playoff = event_data.get("playoff", {}) if isinstance(event_data, dict) else {}
        alliances = playoff.get("alliances") or []
        teams = datastore.get_teams()
        name_map = {
            (t.get("number") or "").strip(): (t.get("name") or "").strip()
            for t in teams
            if (t.get("number") or "").strip()
        }
        result = []
        for idx, pair in enumerate(alliances, start=1):
            if not isinstance(pair, (list, tuple)) or len(pair) < 2:
                continue
            captain = str(pair[0])
            partner = str(pair[1])
            result.append({
                "seed": idx,
                "captain": {"team": captain, "name": name_map.get(captain, "")},
                "partner": {"team": partner, "name": name_map.get(partner, "")},
            })
        return jsonify({
            "ok": True,
            "alliances": result,
            "event": {"name": event_data.get("name", "")},
        })

    @bp.get("/api/public/playoff-bracket")
    def get_playoff_bracket_public():
        """
        Playoff eşleşme raporu için public veri döner.
        
        Bu endpoint:
        - Tamamlanmış sıralama maçlarından SP sıralaması çıkarır
        - Bracket formatına göre eşleşme listesi üretir
        - Takım isimleri ile birlikte döndürür
        """
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"ok": False, "error": "Aktif etkinlik bulunamadı"}), 400

        def _parse_int(value, default=None):
            try:
                return int(value)
            except (TypeError, ValueError):
                return default

        # Tamamlanmış sıralama maçlarını topla
        completed_matches = datastore.get_match_schedule(
            event_id=event_id,
            status="completed",
        )
        qualification_matches = [
            m for m in completed_matches
            if (m.get("match_type") or "qualification").strip() == "qualification"
        ]

        # Playoff (final) maçları zaten oluşturulmuşsa, sıralama maçları tamamlanmamış
        # olsa bile bracket'i göster: manuel ittifak seçimi (çift eleme) sıralama
        # gerektirmez; eşleşmeler maçların kendisinde saklıdır.
        playoff_matches = datastore.get_match_schedule(event_id=event_id, match_type="final")

        if not qualification_matches and not playoff_matches:
            return jsonify({
                "ok": False,
                "error": "Tamamlanmış sıralama maçı veya playoff maçı bulunamadı",
                "completed_count": 0,
            })

        # Eksik SP verisini mevcut scoring_data'dan hesapla (raporun doğru görünmesi için)
        from src.core.scoring.ranking_points import RankingPointsCalculator
        for m in qualification_matches:
            scoring_data = m.get("scoring_data") if isinstance(m.get("scoring_data"), dict) else {}
            rp = scoring_data.get("ranking_points")
            if not rp:
                rp = RankingPointsCalculator.calculate_ranking_points(
                    match_type=m.get("match_type", "qualification"),
                    red_score=int(m.get("red_score") or 0),
                    blue_score=int(m.get("blue_score") or 0),
                    scoring_data=scoring_data,
                    red_alliance=m.get("red_alliance") or [],
                    blue_alliance=m.get("blue_alliance") or [],
                )
                scoring_data["ranking_points"] = rp
                m["scoring_data"] = scoring_data

        from src.core.scoring.team_rankings import TeamRankingsCalculator
        from src.core.tournament.bracket_generator import BracketGenerator

        rankings_calculator = TeamRankingsCalculator()
        rankings = rankings_calculator.calculate_team_rankings(qualification_matches) if qualification_matches else []
        # Sıralama yoksa ama playoff maçları varsa devam et (bracket maçlardan çizilir)
        if not rankings and not playoff_matches:
            return jsonify({
                "ok": False,
                "error": "Takım sıralaması hesaplanamadı",
                "completed_count": len(qualification_matches),
            })

        event_data = datastore.get_event() or {}
        format_data = event_data.get("format", {}) if isinstance(event_data, dict) else {}
        playoff_data = event_data.get("playoff", {}) if isinstance(event_data, dict) else {}
        teams_per_alliance = _parse_int(playoff_data.get("teams_per_alliance")) or _parse_int(format_data.get("teams_per_alliance"), 2)
        max_teams = _parse_int(request.args.get("max_teams"))
        if max_teams is None:
            max_teams = _parse_int(playoff_data.get("max_teams"))

        bracket_generator = BracketGenerator()
        bracket_info = bracket_generator.get_bracket_info(rankings, teams_per_alliance)
        playoff_rounds = bracket_generator.generate_playoff_rounds(
            rankings=rankings,
            teams_per_alliance=teams_per_alliance,
            max_teams=max_teams,
        )
        final_matches = [m for r in playoff_rounds for m in r.get("matches", [])]

        teams = datastore.get_teams()
        team_name_map = {
            (t.get("number") or "").strip(): (t.get("name") or "").strip()
            for t in teams
            if (t.get("number") or "").strip()
        }
        rank_map = {item.get("team"): item.get("rank") for item in rankings}

        def _build_alliance_info(team_numbers):
            items = []
            for team_num in team_numbers:
                items.append({
                    "team": team_num,
                    "rank": rank_map.get(team_num),
                    "name": team_name_map.get(team_num, ""),
                })
            return items

        bracket_rounds = []
        bracket_matches = []

        # Öncelik: Mevcut playoff maçları varsa onları göster (otomatik ilerleme dahil)
        playoff_matches = datastore.get_match_schedule(event_id=event_id, match_type="final")
        if playoff_matches:
            meta_items = []
            bracket_counts = {}
            for m in playoff_matches:
                meta = _parse_playoff_meta(m.get("notes") or "")
                meta_items.append((m, meta))
                bracket_id = meta.get("bracket_id")
                if bracket_id:
                    bracket_counts[bracket_id] = bracket_counts.get(bracket_id, 0) + 1
            if bracket_counts:
                latest_bracket = max(bracket_counts, key=bracket_counts.get)
                meta_items = [(m, meta) for m, meta in meta_items if meta.get("bracket_id") == latest_bracket]

            def _winner_of(match_obj):
                """Tamamlanmış maç için kazananı döner: 'red' | 'blue' | 'tie' | None."""
                if (match_obj.get("status") or "") != "completed":
                    return None
                try:
                    rs = int(match_obj.get("red_score") or 0)
                    bs = int(match_obj.get("blue_score") or 0)
                except (TypeError, ValueError):
                    return None
                if rs > bs:
                    return "red"
                if bs > rs:
                    return "blue"
                return "tie"

            round_map = {}
            for match_obj, meta in meta_items:
                round_key = meta.get("round")
                if not round_key:
                    continue
                round_map.setdefault(round_key, []).append({
                    "match_number": match_obj.get("match_number"),
                    "round": round_key,
                    "label": meta.get("label"),
                    # Çift eleme yönlendirmesi (boş slotlara "Mx Kazananı/Kaybedeni" etiketi için)
                    "win_to": meta.get("win_to"),
                    "lose_to": meta.get("lose_to"),
                    "gf": meta.get("gf"),
                    "red_alliance": match_obj.get("red_alliance") or [],
                    "blue_alliance": match_obj.get("blue_alliance") or [],
                    "red_alliance_info": _build_alliance_info(match_obj.get("red_alliance") or []),
                    "blue_alliance_info": _build_alliance_info(match_obj.get("blue_alliance") or []),
                    "status": match_obj.get("status") or "scheduled",
                    "red_score": match_obj.get("red_score") or 0,
                    "blue_score": match_obj.get("blue_score") or 0,
                    "winner": _winner_of(match_obj),
                    "match_date": match_obj.get("match_date") or "",
                    "match_time": match_obj.get("match_time") or "",
                    "field_number": match_obj.get("field_number"),
                })

            round_order = [
                # Çift eleme (6 ittifak)
                ("upper", "Üst Kademe"),
                ("lower", "Alt Kademe"),
                # Tekli eleme
                ("quarterfinal", "Çeyrek Final"),
                ("semifinal", "Yarı Final"),
                ("third_place", "Üçüncülük Maçı"),
                # Her iki format için final
                ("final", "Büyük Final"),
            ]
            for key, title in round_order:
                matches = round_map.get(key) or []
                if matches:
                    matches.sort(key=lambda item: item.get("match_number") or 0)
                    bracket_rounds.append({"name": title, "matches": matches})
            bracket_matches = [m for r in bracket_rounds for m in r.get("matches", [])]

        # Fallback: Playoff maçları yoksa sıralamadan bracket üret
        if not bracket_rounds:
            bracket_matches = [
                {
                    "match_number": m.get("match_number"),
                    "red_alliance": m.get("red_alliance") or [],
                    "blue_alliance": m.get("blue_alliance") or [],
                    "round": m.get("round"),
                    "label": m.get("label"),
                    "red_alliance_info": _build_alliance_info(m.get("red_alliance") or []),
                    "blue_alliance_info": _build_alliance_info(m.get("blue_alliance") or []),
                }
                for m in final_matches
            ]
            for round_item in playoff_rounds:
                matches = round_item.get("matches", []) or []
                enriched_matches = []
                for match in matches:
                    enriched_matches.append({
                        "match_number": match.get("match_number"),
                        "round": match.get("round"),
                        "label": match.get("label"),
                        "red_alliance": match.get("red_alliance") or [],
                        "blue_alliance": match.get("blue_alliance") or [],
                        "red_alliance_info": _build_alliance_info(match.get("red_alliance") or []),
                        "blue_alliance_info": _build_alliance_info(match.get("blue_alliance") or []),
                    })
                bracket_rounds.append({
                    "name": round_item.get("name"),
                    "matches": enriched_matches,
                })

        return jsonify({
            "ok": True,
            "event": {
                "name": event_data.get("name", ""),
                "code": event_data.get("code", ""),
            },
            "completed_count": len(qualification_matches),
            "teams_per_alliance": teams_per_alliance,
            "bracket_info": bracket_info,
            "rankings": rankings,
            "bracket_matches": bracket_matches,
            "bracket_rounds": bracket_rounds,
            "max_teams": max_teams,
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        })
