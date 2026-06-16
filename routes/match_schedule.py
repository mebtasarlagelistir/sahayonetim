"""
Resmi Maç Takvimi route'ları

Bu modül resmi maç takvimi yönetimi için API endpoint'lerini içerir.
"""

from datetime import datetime, timedelta
import itertools
import logging
import random

from flask import Blueprint, jsonify, request

from src.core.scheduling import generate_partner_balanced_fixture

logger = logging.getLogger(__name__)


def register_match_schedule_routes(bp, datastore, require_login, require_event_manager):
    """
    Resmi maç takvimi route'larını Blueprint'e kaydeder.

    Args:
        bp: Blueprint instance
        datastore: DataStore instance
        require_login: require_login decorator
        require_event_manager: require_event_manager decorator
    """

    def _parse_int(value, default=None):
        """
        String veya sayısal değeri integer'a çevirir.
        
        Args:
            value: Dönüştürülecek değer
            default: Hata durumunda döndürülecek varsayılan değer
        
        Returns:
            int: Dönüştürülmüş değer veya default
        """
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    def _parse_time_windows(raw_windows):
        """
        Ham zaman penceresi verilerini datetime tuple listesine çevirir.
        
        Args:
            raw_windows: Ham zaman penceresi listesi [{"date": "...", "start_time": "...", "end_time": "..."}, ...]
        
        Returns:
            list: Sıralı (start_datetime, end_datetime) tuple listesi
        """
        windows = []
        for item in raw_windows or []:
            date = (item.get("date") or "").strip()
            start = (item.get("start_time") or "").strip()
            end = (item.get("end_time") or "").strip()
            if not date or not start or not end:
                continue
            try:
                start_dt = datetime.strptime(f"{date} {start}", "%Y-%m-%d %H:%M")
                end_dt = datetime.strptime(f"{date} {end}", "%Y-%m-%d %H:%M")
            except ValueError:
                continue
            if end_dt > start_dt:
                windows.append((start_dt, end_dt))
        return sorted(windows, key=lambda x: x[0])

    def _parse_breaks(raw_breaks):
        """
        Ham mola verilerini datetime tuple listesine çevirir.
        
        Args:
            raw_breaks: Ham mola listesi [{"date": "...", "start_time": "...", "end_time": "..."}, ...]
        
        Returns:
            list: Sıralı (start_datetime, end_datetime) tuple listesi
        """
        breaks = []
        for item in raw_breaks or []:
            date = (item.get("date") or "").strip()
            start = (item.get("start_time") or "").strip()
            end = (item.get("end_time") or "").strip()
            if not date or not start or not end:
                continue
            try:
                start_dt = datetime.strptime(f"{date} {start}", "%Y-%m-%d %H:%M")
                end_dt = datetime.strptime(f"{date} {end}", "%Y-%m-%d %H:%M")
            except ValueError:
                continue
            if end_dt > start_dt:
                breaks.append((start_dt, end_dt))
        return sorted(breaks, key=lambda x: x[0])

    def _collect_qualification_matches(event_id):
        """
        Tamamlanmış sıralama maçlarını ve özet listesini hazırlar.
        
        Not: Bazı kayıtlarda match_type boş olabilir, qualification kabul edilir.
        Eksik SP verisi varsa scoring_data üzerinden hesaplanır.
        """
        completed_matches = datastore.get_match_schedule(
            event_id=event_id,
            status="completed",
        )
        qualification_matches = [
            m for m in completed_matches
            if (m.get("match_type") or "qualification").strip() == "qualification"
        ]
        from src.core.scoring.ranking_points import RankingPointsCalculator
        def _normalize_rp(rp: dict) -> dict:
            if not isinstance(rp, dict):
                return {}
            normalized = {}
            for side in ("red", "blue"):
                side_rp = rp.get(side, {}) or {}
                result = int(side_rp.get("result") or 0)
                climb = int(side_rp.get("climb") or 0)
                auto = int(side_rp.get("auto") or 0)
                total = int(side_rp.get("total") or 0)
                computed_total = result + climb + auto
                if total != computed_total:
                    total = computed_total
                normalized[side] = {
                    "result": result,
                    "climb": climb,
                    "auto": auto,
                    "total": total,
                }
            return normalized
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
            scoring_data["ranking_points"] = _normalize_rp(rp)
            m["scoring_data"] = scoring_data
        completed_list = [
            {
                "match_number": m.get("match_number"),
                "red_alliance": m.get("red_alliance") or [],
                "blue_alliance": m.get("blue_alliance") or [],
                "red_score": m.get("red_score"),
                "blue_score": m.get("blue_score"),
                "match_date": m.get("match_date"),
                "match_time": m.get("match_time"),
                "ranking_points": (m.get("scoring_data") or {}).get("ranking_points", {}),
            }
            for m in qualification_matches
        ]
        return qualification_matches, completed_list

    def _next_valid_time(current, duration_minutes, windows, breaks):
        """
        Verilen süre için uygun bir zaman bulur (zaman pencereleri ve molaları dikkate alarak).
        
        Algoritma:
        1. Mevcut zaman bir zaman penceresi içindeyse kontrol et
        2. Süre pencere dışına taşıyorsa sonraki pencereye geç
        3. Mola ile çakışma varsa molanın bitişine geç
        4. Uygun zaman bulunana kadar tekrarla
        
        Args:
            current: Mevcut zaman (datetime)
            duration_minutes: Maç süresi (dakika)
            windows: Zaman pencereleri listesi [(start, end), ...]
            breaks: Mola listesi [(start, end), ...]
        
        Returns:
            datetime: Uygun zaman
        """
        if not windows:
            return current
        while True:
            window = next((w for w in windows if w[0] <= current < w[1]), None)
            if not window:
                next_window = next((w for w in windows if w[0] > current), None)
                if not next_window:
                    return current
                current = next_window[0]
                continue
            if current + timedelta(minutes=duration_minutes) > window[1]:
                next_window = next((w for w in windows if w[0] > window[1]), None)
                if not next_window:
                    return current
                current = next_window[0]
                continue
            overlapping_break = next(
                (b for b in breaks if not (current + timedelta(minutes=duration_minutes) <= b[0] or current >= b[1])),
                None,
            )
            if overlapping_break:
                current = overlapping_break[1]
                continue
            return current

    def _get_next_match_number(event_id, match_type):
        """
        Bir sonraki maç numarasını hesaplar.
        
        Args:
            event_id: Etkinlik ID'si
            match_type: Maç tipi ("qualification", "elimination", vb.)
        
        Returns:
            int: Bir sonraki maç numarası
        """
        matches = datastore.get_match_schedule(event_id=event_id, match_type=match_type)
        existing = [m.get("match_number") for m in matches if m.get("match_number")]
        return max(existing, default=0) + 1

    @bp.get("/match-schedule")
    @require_login
    def get_match_schedule():
        """
        Resmi maçları listeler.

        Query parametreleri:
            date: Tarih filtresi (YYYY-MM-DD)
            field: Saha numarası filtresi
            type: Maç tipi filtresi
            status: Durum filtresi
        """
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify([])

        match_date = request.args.get("date", "").strip()
        field_number = _parse_int(request.args.get("field"))
        match_type = request.args.get("type", "").strip()
        status = request.args.get("status", "").strip()

        matches = datastore.get_match_schedule(
            event_id=event_id,
            match_type=match_type if match_type else None,
            match_date=match_date if match_date else None,
            field_number=field_number,
            status=status if status else None,
        )

        return jsonify(matches)

    @bp.get("/match-schedule/rankings")
    @require_login
    def get_qualification_rankings():
        """
        Sıralama maçları sonuçları ve SP sıralaması.

        Tamamlanmış sıralama maçlarından anlık SP hesaplanır; maçlar ilerledikçe
        bu endpoint yeniden çağrıldığında güncel sıralama döner.

        Returns:
            JSON: {
                "rankings": [{"team", "rank", "total_sp", "wins", "ties", "losses", ...}, ...],
                "completed_matches": [{"match_number", "red_alliance", "blue_alliance", "red_score", "blue_score"}, ...],
                "completed_count": int
            }
        """
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"rankings": [], "legacy_rankings": [], "completed_matches": [], "completed_count": 0})

        qualification_matches, completed_list = _collect_qualification_matches(event_id)

        if not qualification_matches:
            return jsonify({
                "rankings": [],
                "legacy_rankings": [],
                "completed_matches": completed_list,
                "completed_count": 0,
            })

        from src.core.scoring.team_rankings import TeamRankingsCalculator
        calculator = TeamRankingsCalculator()
        rankings = calculator.calculate_team_rankings(qualification_matches, mode="current")
        legacy_rankings = calculator.calculate_team_rankings(qualification_matches, mode="legacy")

        return jsonify({
            "rankings": rankings,
            "legacy_rankings": legacy_rankings,
            "completed_matches": completed_list,
            "completed_count": len(qualification_matches),
        })


    @bp.post("/match-schedule")
    @require_login
    @require_event_manager
    def create_match():
        """
        Yeni resmi maç oluşturur.
        """
        data = request.get_json(force=True) or {}

        match_number_raw = data.get("match_number")
        match_type = (data.get("match_type") or "qualification").strip()
        field_number = _parse_int(data.get("field_number"), 1)
        match_date = (data.get("match_date") or "").strip()
        match_time = (data.get("match_time") or "").strip()
        red_alliance = data.get("red_alliance", [])
        blue_alliance = data.get("blue_alliance", [])
        status = data.get("status", "scheduled")
        red_score = data.get("red_score")
        blue_score = data.get("blue_score")
        surrogate_teams = data.get("surrogate_teams", [])
        notes = (data.get("notes") or "").strip()

        if not match_date or not match_time:
            return jsonify({"error": "Tarih ve saat gerekli"}), 400
        if not red_alliance or not blue_alliance:
            return jsonify({"error": "Her iki ittifak için en az bir takım gerekli"}), 400

        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()

        match_duration = int(event_data.get("schedule", {}).get("match_cycle_seconds", 150)) // 60
        all_teams = red_alliance + blue_alliance
        for team in all_teams:
            if datastore.check_match_schedule_conflict(
                team_number=team,
                match_date=match_date,
                match_time=match_time,
                duration_minutes=match_duration,
                event_id=event_id,
            ):
                return jsonify({"error": f"Takım {team} için çakışma var"}), 400

        match_number = _parse_int(match_number_raw)
        if match_number is None:
            match_number = _get_next_match_number(event_id, match_type)

        try:
            match_id = datastore.create_match(
                match_number=match_number,
                match_type=match_type,
                field_number=field_number,
                match_date=match_date,
                match_time=match_time,
                red_alliance=red_alliance,
                blue_alliance=blue_alliance,
                status=status,
                red_score=red_score,
                blue_score=blue_score,
                surrogate_teams=surrogate_teams,
                notes=notes,
                event_id=event_id,
            )
            return jsonify({"ok": True, "id": match_id})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @bp.put("/match-schedule/<int:match_id>")
    @require_login
    @require_event_manager
    def update_match(match_id):
        """
        Resmi maç günceller.
        """
        data = request.get_json(force=True) or {}

        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()

        # Çakışma kontrolü (tarih/saat değişiyorsa)
        if "match_date" in data or "match_time" in data:
            match_date = data.get("match_date") or request.args.get("match_date", "")
            match_time = data.get("match_time") or request.args.get("match_time", "")
            if match_date and match_time:
                match_duration = int(event_data.get("schedule", {}).get("match_cycle_seconds", 150)) // 60
                matches = datastore.get_match_schedule(event_id=event_id)
                current = next((m for m in matches if m["id"] == match_id), None)
                if current:
                    all_teams = current.get("red_alliance", []) + current.get("blue_alliance", [])
                    for team in all_teams:
                        if datastore.check_match_schedule_conflict(
                            team_number=team,
                            match_date=match_date,
                            match_time=match_time,
                            duration_minutes=match_duration,
                            exclude_match_id=match_id,
                            event_id=event_id,
                        ):
                            return jsonify({"error": f"Takım {team} için çakışma var"}), 400

        try:
            datastore.update_match(
                match_id=match_id,
                match_number=_parse_int(data.get("match_number"))
                if data.get("match_number") is not None
                else None,
                match_type=data.get("match_type"),
                field_number=_parse_int(data.get("field_number"))
                if data.get("field_number") is not None
                else None,
                match_date=data.get("match_date"),
                match_time=data.get("match_time"),
                red_alliance=data.get("red_alliance"),
                blue_alliance=data.get("blue_alliance"),
                status=data.get("status"),
                red_score=data.get("red_score"),
                blue_score=data.get("blue_score"),
                surrogate_teams=data.get("surrogate_teams"),
                notes=data.get("notes"),
            )
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @bp.delete("/match-schedule/<int:match_id>")
    @require_login
    @require_event_manager
    def delete_match(match_id):
        """Resmi maçı siler."""
        try:
            datastore.delete_match(match_id)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @bp.post("/match-schedule/bulk-update")
    @require_login
    @require_event_manager
    def bulk_update_match_schedule():
        """
        Seçili maçları toplu günceller (tarih/saat/saha/durum).
        """
        data = request.get_json(force=True) or {}
        match_ids = data.get("match_ids", [])
        if not isinstance(match_ids, list) or not match_ids:
            return jsonify({"error": "Güncellenecek maç seçilmedi"}), 400

        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()

        new_date = (data.get("match_date") or "").strip()
        new_time = (data.get("match_time") or "").strip()
        new_field = _parse_int(data.get("field_number"))
        new_status = data.get("status")
        new_type = data.get("match_type")

        matches = datastore.get_match_schedule(event_id=event_id)
        match_map = {m["id"]: m for m in matches}

        conflicts = []
        duration = int(event_data.get("schedule", {}).get("match_cycle_seconds", 150)) // 60
        for match_id in match_ids:
            current = match_map.get(match_id)
            if not current:
                continue
            updated_date = new_date or current["match_date"]
            updated_time = new_time or current["match_time"]
            all_teams = current.get("red_alliance", []) + current.get("blue_alliance", [])
            for team in all_teams:
                if datastore.check_match_schedule_conflict(
                    team_number=team,
                    match_date=updated_date,
                    match_time=updated_time,
                    duration_minutes=duration,
                    exclude_match_id=match_id,
                    event_id=event_id,
                ):
                    conflicts.append({"id": match_id, "team_number": team})
                    break

        if conflicts:
            return jsonify({"error": "Bazı maçlarda çakışma var", "conflicts": conflicts}), 400

        updated_count = 0
        for match_id in match_ids:
            if match_id not in match_map:
                continue
            datastore.update_match(
                match_id=match_id,
                match_date=new_date or None,
                match_time=new_time or None,
                field_number=new_field,
                status=new_status,
                match_type=new_type,
            )
            updated_count += 1

        return jsonify({"ok": True, "updated_count": updated_count})

    @bp.get("/match-schedule/conflicts")
    @require_login
    def check_match_conflict():
        """
        Takım bazlı çakışma kontrolü endpoint'i.
        """
        team_number = (request.args.get("team") or "").strip()
        match_date = (request.args.get("date") or "").strip()
        match_time = (request.args.get("time") or "").strip()

        if not team_number or not match_date or not match_time:
            return jsonify({"error": "team/date/time gerekli"}), 400

        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400

        event_data = datastore.get_event()
        duration = int(event_data.get("schedule", {}).get("match_cycle_seconds", 150)) // 60
        conflict = datastore.check_match_schedule_conflict(
            team_number=team_number,
            match_date=match_date,
            match_time=match_time,
            duration_minutes=duration,
            event_id=event_id,
        )
        return jsonify({"conflict": conflict})

    @bp.get("/match-settings")
    @require_login
    def get_match_settings():
        event_data = datastore.get_event()
        match_settings = event_data.get("match_settings", {})
        stage_settings = event_data.get("stages", {}).get("match_schedule", {})
        return jsonify(
            {
                "time_windows": match_settings.get("time_windows", []),
                "breaks": match_settings.get("breaks", []),
                "stage_active": stage_settings.get("active", True),
            }
        )

    @bp.post("/match-settings")
    @require_login
    @require_event_manager
    def save_match_settings():
        data = request.get_json(force=True) or {}
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()
        event_data.setdefault("match_settings", {})
        event_data["match_settings"]["time_windows"] = data.get("time_windows", [])
        event_data["match_settings"]["breaks"] = data.get("breaks", [])
        event_data.setdefault("stages", {})
        event_data["stages"].setdefault("match_schedule", {})
        event_data["stages"]["match_schedule"]["active"] = data.get("stage_active", True)
        datastore.save_event(event_data)
        return jsonify({"ok": True})

    @bp.post("/match-schedule/generate")
    @require_login
    @require_event_manager
    def generate_match_schedule():
        """
        Otomatik resmi maç takvimi oluşturur.
        """
        data = request.get_json(force=True) or {}

        start_date = (data.get("start_date") or "").strip()
        start_time = (data.get("start_time") or "").strip()
        num_matches = _parse_int(data.get("num_matches"))
        matches_per_team = _parse_int(data.get("matches_per_team"))
        match_type = "qualification"
        algorithm = (data.get("algorithm") or "balanced").strip()
        field_count = _parse_int(data.get("field_count"), 1)
        teams_per_alliance = _parse_int(data.get("teams_per_alliance"), 2)
        match_cycle_minutes = _parse_int(data.get("match_cycle_minutes"))
        clear_existing = bool(data.get("clear_existing", False))
        time_windows = _parse_time_windows(data.get("time_windows", []))
        breaks = _parse_breaks(data.get("breaks", []))

        if (not start_date or not start_time) and time_windows:
            start_date = time_windows[0][0].strftime("%Y-%m-%d")
            start_time = time_windows[0][0].strftime("%H:%M")
        if not start_date or not start_time:
            return jsonify({"error": "Başlangıç tarihi ve saati gerekli"}), 400
        if field_count < 1:
            return jsonify({"error": "Saha sayısı en az 1 olmalı"}), 400

        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()

        # Etkinlik formatından saha ve ittifak bilgilerini al
        format_data = event_data.get("format", {})
        event_fields = _parse_int(format_data.get("fields"), 1)
        event_teams_per_alliance = _parse_int(format_data.get("teams_per_alliance"), 2)
        if event_fields:
            field_count = event_fields
        if event_teams_per_alliance:
            teams_per_alliance = event_teams_per_alliance

        teams = datastore.get_teams()
        raw_team_numbers = [
            t.get("number", "").strip() for t in teams if t.get("number", "").strip()
        ]
        # Aynı takım numarasının tekrarı eşleştirmeyi bozar; burada tekilleştiriyoruz.
        seen_numbers = set()
        team_numbers = []
        for team_num in raw_team_numbers:
            if team_num in seen_numbers:
                continue
            seen_numbers.add(team_num)
            team_numbers.append(team_num)
        if len(team_numbers) < teams_per_alliance * 2:
            return jsonify({"error": f"En az {teams_per_alliance * 2} takım gerekli"}), 400

        try:
            initial_datetime = datetime.strptime(f"{start_date} {start_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            return jsonify({"error": "Geçersiz tarih/saat formatı"}), 400

        if clear_existing:
            datastore.delete_all_matches(event_id)

        # Maç süresini al (istek > etkinlik)
        event_cycle = int(event_data.get("schedule", {}).get("match_cycle_seconds", 150))
        match_duration = max(1, (match_cycle_minutes or (event_cycle // 60)))
        # --- Adalet (fairness) ayarları ---
        # Takımın ardışık maçlarını engellemek için minimum maç aralığı.
        # Hedef: en az 2 maç dinlenme. Ancak takım sayısı azsa bu kural fikstürü
        # kilitleyebileceğinden, yeterli takım yoksa 1'e düşürülür (deadlock önleme).
        required_count = teams_per_alliance * 2
        if len(team_numbers) >= required_count * 3:
            min_gap_matches = 2
        else:
            min_gap_matches = 1
        # Tekrar eden eşleşmelere uygulanan cezalar (büyük = daha güçlü kaçınma).
        # Partner tekrarı en ağır cezalı; rakip tekrarı da artık belirgin biçimde cezalı.
        PARTNER_REPEAT_PENALTY = 120
        # 300: rakip çeşitliliği için güçlü kaçınma. best-of-K seçimle birlikte rakip
        # tekrarını ~0'a indirir (partner=0 ve dinlenme garantilerini bozmadan).
        OPPONENT_REPEAT_PENALTY = 300

        # Maç sayısını belirle
        if matches_per_team:
            # Kullanıcının beklediği formül:
            # (takım_sayısı * maç_sayısı) / (ittifak_başı_takım * 2)
            num_matches = (matches_per_team * len(team_numbers)) // (teams_per_alliance * 2)
            if num_matches < 1:
                return jsonify({"error": "Geçerli maç sayısı hesaplanamadı"}), 400
        elif num_matches is None:
            num_matches = max(len(team_numbers) // (teams_per_alliance * 2), 1)

        # Eğer temizleme yapılmadıysa maç numarasını devam ettir
        next_number = _get_next_match_number(event_id, match_type)
# Eğer takım başına maç sayısı verilmişse, partner tekrarını önleyen
        # özel algoritmayı (kullanıcının paylaştığına benzer) kullan
        if matches_per_team:

            # Not: Ağır partner cezası (120) feasible durumlarda zaten 0 partner
            # tekrarı verir (etkin biçimde "mümkünse benzersiz"). Strict skip
            # (hard_unique_partners=True) greedy'yi fallback'e zorlayıp dinlenme
            # dağılımını bozduğu için kullanılmaz; ceza yaklaşımı tercih edilir.
            schedule_pairs = generate_partner_balanced_fixture(
                team_numbers,
                teams_per_alliance,
                matches_per_team,
                num_matches,
                min_gap_matches=min_gap_matches,
                partner_penalty=PARTNER_REPEAT_PENALTY,
                opponent_penalty=OPPONENT_REPEAT_PENALTY,
                hard_unique_partners=False,
            )

            if schedule_pairs is None:
                return jsonify(
                    {
                        "error": "Maç takvimi oluşturulamadı, lütfen parametreleri ve takım sayısını gözden geçirin"
                    }
                ), 400

            created_count = 0
            current_time = initial_datetime
            # Saha ataması: ardışık maçlar sahalar arasında ALTERNATİF (1,2,1,2...) —
            # iki saha paralel çalıştırılabilsin diye.
            _nf = max(1, field_count)

            for match_data in schedule_pairs:
                current_time = _next_valid_time(current_time, match_duration, time_windows, breaks)

                # Var olan maçlarla çakışma kontrolü
                conflict = False
                for team in match_data["blue_alliance"] + match_data["red_alliance"]:
                    if datastore.check_match_schedule_conflict(
                        team_number=team,
                        match_date=current_time.strftime("%Y-%m-%d"),
                        match_time=current_time.strftime("%H:%M"),
                        duration_minutes=match_duration,
                        event_id=event_id,
                    ):
                        conflict = True
                        break

                if conflict:
                    # Çakışma varsa bir sonraki zaman slotunda dene
                    current_time += timedelta(minutes=match_duration)
                    continue

                field_number = (created_count % _nf) + 1  # alternatif: 1,2,1,2...
                datastore.create_match(
                    match_number=next_number,
                    match_type=match_type,
                    field_number=field_number,
                    match_date=current_time.strftime("%Y-%m-%d"),
                    match_time=current_time.strftime("%H:%M"),
                    red_alliance=match_data["red_alliance"],
                    blue_alliance=match_data["blue_alliance"],
                    status="scheduled",
                    surrogate_teams=[],
                    event_id=event_id,
                )

                created_count += 1
                next_number += 1
                current_time += timedelta(minutes=match_duration)

            return jsonify({"ok": True, "created_count": created_count})

        # matches_per_team belirtilmediyse, mevcut dengeleyici algoritmaya geri dön

        # Matchmaker istatistikleri
        team_stats = {
            team: {
                "match_count": 0,
                "red_count": 0,
                "blue_count": 0,
                "opponents": set(),
                "partners": set(),
                "last_color": None,
                "last_match_time": None,
                "last_match_index": None,
            }
            for team in team_numbers
        }

        def calculate_team_score(team, current_time, match_index):
            """
            Takım skoru hesaplar (az oynayan ve dinlenmiş takımları önceliklendirir).
            """
            stats = team_stats[team]
            base_score = 1000 - stats["match_count"] * 10
            balance = abs(stats["red_count"] - stats["blue_count"])
            balance_score = 50 - balance * 5
            rest_score = 0
            last_time = stats["last_match_time"]
            if last_time is None:
                rest_score += 80
            else:
                gap_minutes = (current_time - last_time).total_seconds() / 60
                if gap_minutes < match_duration:
                    rest_score -= 200
                elif gap_minutes < match_duration * 2:
                    rest_score -= 80
                else:
                    rest_score += min(120, gap_minutes)
            # Maç sayısı bazlı dinlenme/ardışık ceza
            last_idx = stats.get("last_match_index")
            if last_idx is None:
                rest_score += 20
            else:
                gap_matches = match_index - last_idx - 1
                if gap_matches < min_gap_matches:
                    rest_score -= 240
                elif gap_matches == 1:
                    rest_score -= 120
                else:
                    rest_score += min(80, gap_matches * 10)
            return base_score + balance_score + rest_score

        def pick_balanced_teams(available_teams, required_count, current_time, match_index):
            if len(available_teams) < required_count:
                return None
            eligible = []
            for team in available_teams:
                last_idx = team_stats[team].get("last_match_index")
                if last_idx is None:
                    eligible.append(team)
                    continue
                gap_matches = match_index - last_idx - 1
                if gap_matches >= min_gap_matches:
                    eligible.append(team)
            if len(eligible) < required_count:
                return None
            shuffled = list(eligible)
            random.shuffle(shuffled)
            sorted_teams = sorted(
                shuffled,
                key=lambda t: calculate_team_score(t, current_time, match_index) + random.random(),
                reverse=True,
            )
            selected = []
            selected_set = set()
            if sorted_teams:
                top_score = calculate_team_score(sorted_teams[0], current_time, match_index)
                top_candidates = [
                    t for t in sorted_teams if calculate_team_score(t, current_time, match_index) >= top_score - 0.01
                ]
                first_team = random.choice(top_candidates) if top_candidates else sorted_teams[0]
                selected.append(first_team)
                selected_set.add(first_team)

            remaining = [t for t in sorted_teams if t not in selected_set]
            while len(selected) < required_count and remaining:
                best_candidates = []
                best_score = float("-inf")
                for team in remaining:
                    if team in selected_set:
                        continue
                    team_score = calculate_team_score(team, current_time, match_index)
                    # Daha önce rakip VEYA partner olunan takımlarla yeniden
                    # eşleşmeyi caydır. Seçim anında ittifak (kırmızı/mavi) bölünmesi
                    # henüz belli olmadığından, her iki tekrar türü de cezalandırılır;
                    # partner tekrarı rakip tekrarından daha ağır cezalıdır.
                    opponent_overlap = sum(
                        1 for sel in selected if team in team_stats[sel]["opponents"]
                    )
                    partner_overlap = sum(
                        1 for sel in selected if team in team_stats[sel]["partners"]
                    )
                    diversity_bonus = (len(selected) - opponent_overlap - partner_overlap) * 5
                    repeat_penalty = (
                        opponent_overlap * OPPONENT_REPEAT_PENALTY
                        + partner_overlap * PARTNER_REPEAT_PENALTY
                    )
                    total = team_score + diversity_bonus - repeat_penalty
                    if total > best_score + 0.0001:
                        best_score = total
                        best_candidates = [team]
                    elif abs(total - best_score) <= 0.0001:
                        best_candidates.append(team)
                if best_candidates:
                    chosen = random.choice(best_candidates)
                    selected.append(chosen)
                    selected_set.add(chosen)
                    if chosen in remaining:
                        remaining.remove(chosen)
                else:
                    break

            if len(selected) < required_count:
                remaining = [t for t in available_teams if t not in selected_set]
                needed = required_count - len(selected)
                if remaining:
                    selected.extend(random.sample(remaining, min(needed, len(remaining))))

            return selected[:required_count] if len(selected) >= required_count else None

        created_count = 0
        current_time = initial_datetime
        max_attempts = num_matches * 10
        attempts = 0
        # Saha ataması: ardışık maçlar ALTERNATİF (1,2,1,2...) — paralel iki saha için.
        _nf = max(1, field_count)

        while created_count < num_matches and attempts < max_attempts:
            attempts += 1
            current_time = _next_valid_time(current_time, match_duration, time_windows, breaks)

            available_teams = list(team_numbers)
            if len(available_teams) < teams_per_alliance * 2:
                break

            if algorithm == "random":
                selected = random.sample(available_teams, teams_per_alliance * 2)
            else:
                selected = pick_balanced_teams(
                    available_teams,
                    teams_per_alliance * 2,
                    current_time,
                    created_count + 1,
                )

            if not selected or len(selected) < teams_per_alliance * 2:
                current_time += timedelta(minutes=match_duration)
                continue

            # Tek anda tek maç: çakışma kontrolü
            conflict = False
            for team in selected:
                if datastore.check_match_schedule_conflict(
                    team_number=team,
                    match_date=current_time.strftime("%Y-%m-%d"),
                    match_time=current_time.strftime("%H:%M"),
                    duration_minutes=match_duration,
                    event_id=event_id,
                ):
                    conflict = True
                    break
            if conflict:
                current_time += timedelta(minutes=match_duration)
                continue

            def _alliance_partner_penalty(alliance):
                """İttifak içindeki eski partner çiftlerini cezalandırır."""
                penalty = 0
                for i in range(len(alliance)):
                    for j in range(i + 1, len(alliance)):
                        if alliance[j] in team_stats[alliance[i]]["partners"]:
                            penalty += PARTNER_REPEAT_PENALTY
                return penalty

            def _alliance_color_penalty(red, blue):
                """Renk (kırmızı/mavi) dengesini korumayı teşvik eder."""
                penalty = 0
                for team in red:
                    stats = team_stats[team]
                    # Bu takım zaten çok kırmızı oynadıysa tekrar kırmızı olması cezalı
                    penalty += max(0, stats["red_count"] - stats["blue_count"]) * 5
                    if stats["last_color"] == "red":
                        penalty += 5
                for team in blue:
                    stats = team_stats[team]
                    penalty += max(0, stats["blue_count"] - stats["red_count"]) * 5
                    if stats["last_color"] == "blue":
                        penalty += 5
                return penalty

            # Seçilen takımları kırmızı/mavi ittifaklara böl. Tüm olası bölünmeler
            # arasından, ÖNCE partner tekrarını sonra renk dengesizliğini minimize
            # eden bölünme seçilir (partner-balanced dalıyla aynı mantık).
            best_split = None
            best_penalty = None
            for red_combo in itertools.combinations(selected, teams_per_alliance):
                red = list(red_combo)
                blue = [t for t in selected if t not in red]
                if len(blue) != teams_per_alliance:
                    continue
                penalty = (
                    _alliance_partner_penalty(red)
                    + _alliance_partner_penalty(blue)
                    + _alliance_color_penalty(red, blue)
                    + random.random() * 0.01  # eşitlikte rastgelelik
                )
                if best_penalty is None or penalty < best_penalty:
                    best_penalty = penalty
                    best_split = (red, blue)

            red_alliance, blue_alliance = best_split

            surrogate_teams = []
            if matches_per_team:
                for team in red_alliance + blue_alliance:
                    if team_stats[team]["match_count"] >= matches_per_team:
                        surrogate_teams.append(team)

            try:
                # Saha: ardışık maçlar arası alternatif (1,2,1,2...) — paralel iki saha.
                field_number = (created_count % _nf) + 1
                datastore.create_match(
                    match_number=next_number,
                    match_type=match_type,
                    field_number=field_number,
                    match_date=current_time.strftime("%Y-%m-%d"),
                    match_time=current_time.strftime("%H:%M"),
                    red_alliance=red_alliance,
                    blue_alliance=blue_alliance,
                    status="scheduled",
                    surrogate_teams=surrogate_teams,
                    event_id=event_id,
                )
            except Exception as e:
                logger.warning("Sıralama maçı oluşturulamadı (atlandı): %s", e)
                current_time += timedelta(minutes=match_duration)
                continue

            created_count += 1
            next_number += 1

            # İstatistikleri güncelle
            for team in red_alliance:
                team_stats[team]["match_count"] += 1
                team_stats[team]["red_count"] += 1
                team_stats[team]["last_color"] = "red"
                team_stats[team]["last_match_time"] = current_time
                team_stats[team]["last_match_index"] = created_count + 1
                team_stats[team]["opponents"].update(blue_alliance)
                # İttifak arkadaşları (kendisi hariç) partner geçmişine eklenir
                team_stats[team]["partners"].update(t for t in red_alliance if t != team)
            for team in blue_alliance:
                team_stats[team]["match_count"] += 1
                team_stats[team]["blue_count"] += 1
                team_stats[team]["last_color"] = "blue"
                team_stats[team]["last_match_time"] = current_time
                team_stats[team]["last_match_index"] = created_count + 1
                team_stats[team]["opponents"].update(red_alliance)
                team_stats[team]["partners"].update(t for t in blue_alliance if t != team)

            # Zamanı ilerlet
            current_time += timedelta(minutes=match_duration)

        if created_count < num_matches:
            return jsonify({
                "error": "Dinlenme kuralı nedeniyle yeterli maç oluşturulamadı. "
                         "Lütfen maç sayısını azaltın veya takım sayısını artırın."
            }), 400
        return jsonify({"ok": True, "created_count": created_count})

    @bp.post("/match-schedule/generate-finals")
    @require_login
    @require_event_manager
    def generate_final_matches():
        """
        SP puanlarına göre final maçlarını otomatik oluşturur.
        
        Bu endpoint:
        1. Tamamlanmış sıralama maçlarından SP puanlarını toplar
        2. Takımları SP puanına göre sıralar
        3. Final maçları için bracket oluşturur
        4. Final maçlarını veritabanına kaydeder
        
        Modüler yapı:
        - SP toplama: TeamRankingsCalculator modülü
        - Bracket oluşturma: BracketGenerator modülü
        - Storage: MatchScheduleStorage modülü
        
        Request body:
        {
            "start_date": "2026-02-06",      # Final maçları başlangıç tarihi
            "start_time": "14:00",            # Final maçları başlangıç saati
            "field_number": 1,                # Saha numarası (varsayılan: 1)
            "teams_per_alliance": 2,          # İttifak başına takım sayısı (varsayılan: 2)
            "max_teams": 8,                   # Maksimum takım sayısı (None ise tüm takımlar)
            "match_cycle_minutes": 5,         # Maç döngüsü süresi (dakika)
            "clear_existing": false           # Mevcut final maçlarını temizle (varsayılan: false)
        }
        
        Response:
        {
            "ok": true,
            "created_count": 4,               # Oluşturulan maç sayısı
            "rankings": [...],                # Takım sıralaması
            "bracket_info": {...}             # Bracket bilgileri
        }
        """
        from src.core.scoring.team_rankings import TeamRankingsCalculator
        from src.core.tournament.bracket_generator import BracketGenerator
        
        data = request.get_json(force=True) or {}
        
        # Parametreleri al
        start_date = (data.get("start_date") or "").strip()
        start_time = (data.get("start_time") or "").strip()
        field_number = _parse_int(data.get("field_number"), 1)
        teams_per_alliance = _parse_int(data.get("teams_per_alliance"), 2)
        max_teams = _parse_int(data.get("max_teams"))
        match_cycle_minutes = _parse_int(data.get("match_cycle_minutes"))
        clear_existing = bool(data.get("clear_existing", False))
        
        # Tarih ve saat kontrolü
        if not start_date or not start_time:
            return jsonify({"error": "Başlangıç tarihi ve saati gerekli"}), 400
        
        try:
            initial_datetime = datetime.strptime(f"{start_date} {start_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            return jsonify({"error": "Geçersiz tarih/saat formatı"}), 400
        
        # Etkinlik kontrolü
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        
        event_data = datastore.get_event()
        
        # Etkinlik formatından varsayılan değerleri al
        format_data = event_data.get("format", {})
        playoff_data = event_data.get("playoff", {}) if isinstance(event_data, dict) else {}
        event_teams_per_alliance = _parse_int(format_data.get("teams_per_alliance"), 2)
        playoff_teams_per_alliance = _parse_int(playoff_data.get("teams_per_alliance"))
        if playoff_teams_per_alliance:
            teams_per_alliance = playoff_teams_per_alliance
        elif event_teams_per_alliance:
            teams_per_alliance = event_teams_per_alliance
        if max_teams is None:
            max_teams = _parse_int(playoff_data.get("max_teams"))
        
        # Maç süresini al
        event_cycle = int(event_data.get("schedule", {}).get("match_cycle_seconds", 150))
        match_duration = max(1, (match_cycle_minutes or (event_cycle // 60)))

        # === 6 İTTİFAK ÇİFT ELEME (manuel kaptan seçimi ile) ===
        bracket_format = (data.get("format") or "").strip()
        raw_alliances = data.get("alliances")
        if bracket_format == "double_elimination_6" or raw_alliances:
            # Doğrula: tam 6 ittifak, her biri 2 takım, hepsi geçerli ve tekil
            if not isinstance(raw_alliances, list) or len(raw_alliances) != 6:
                return jsonify({"error": "Çift eleme için tam olarak 6 ittifak gerekli (12 takım)"}), 400
            valid_team_numbers = {
                (t.get("number") or "").strip()
                for t in datastore.get_teams()
                if (t.get("number") or "").strip()
            }
            alliances = []
            seen_teams = set()
            for idx, alli in enumerate(raw_alliances, start=1):
                if not isinstance(alli, list) or len(alli) != 2:
                    return jsonify({"error": f"{idx}. ittifak tam 2 takımdan oluşmalı"}), 400
                pair = [str(x).strip() for x in alli]
                for tn in pair:
                    if not tn:
                        return jsonify({"error": f"{idx}. ittifakta eksik takım var"}), 400
                    if tn not in valid_team_numbers:
                        return jsonify({"error": f"Geçersiz takım numarası: {tn}"}), 400
                    if tn in seen_teams:
                        return jsonify({"error": f"Bir takım birden fazla ittifakta olamaz: {tn}"}), 400
                    seen_teams.add(tn)
                alliances.append(pair)

            # İttifakları event_data.playoff.alliances altına kaydet (UI yeniden açabilsin)
            playoff_cfg = dict(playoff_data) if isinstance(playoff_data, dict) else {}
            playoff_cfg["alliances"] = alliances
            playoff_cfg["format"] = "double_elimination_6"
            new_event_data = dict(event_data)
            new_event_data["playoff"] = playoff_cfg
            try:
                datastore.save_event(new_event_data)
            except Exception as e:
                logger.warning("Playoff ittifak konfigurasyonu kaydedilemedi: %s", e)

            de_generator = BracketGenerator()
            de_rounds = de_generator.generate_double_elimination_6(alliances)

            if clear_existing:
                for match in datastore.get_match_schedule(event_id=event_id, match_type="final"):
                    datastore.delete_match(match["id"])

            created_count = 0
            current_time = initial_datetime
            next_number = _get_next_match_number(event_id, "final")
            bracket_id = datetime.utcnow().strftime("%Y%m%d%H%M%S")
            for match_data in [m for r in de_rounds for m in r.get("matches", [])]:
                notes = (
                    f"[playoff] bracket_id={bracket_id};"
                    f"round={match_data.get('round')};label={match_data.get('label')}"
                )
                if match_data.get("win_to"):
                    notes += f";win_to={match_data['win_to']}"
                if match_data.get("lose_to"):
                    notes += f";lose_to={match_data['lose_to']}"
                if match_data.get("gf"):
                    notes += f";gf={match_data['gf']}"
                if match_data.get("reset_to"):
                    notes += f";reset_to={match_data['reset_to']}"
                try:
                    datastore.create_match(
                        match_number=next_number,
                        match_type="final",
                        field_number=field_number,
                        match_date=current_time.strftime("%Y-%m-%d"),
                        match_time=current_time.strftime("%H:%M"),
                        red_alliance=match_data["red_alliance"],
                        blue_alliance=match_data["blue_alliance"],
                        status="scheduled",
                        notes=notes,
                        event_id=event_id,
                    )
                    created_count += 1
                    next_number += 1
                    current_time += timedelta(minutes=match_duration)
                except Exception as e:
                    logger.warning("Çift eleme maçı oluşturulamadı (atlandı): %s", e)
                    continue

            # Yanıt: ittifak/seed bilgisini zenginleştir
            teams = datastore.get_teams()
            team_name_map = {
                (t.get("number") or "").strip(): (t.get("name") or "").strip()
                for t in teams
                if (t.get("number") or "").strip()
            }
            seed_map = {}
            for i, pair in enumerate(alliances, start=1):
                for tn in pair:
                    seed_map[tn] = i

            def _de_info(team_numbers):
                return [
                    {"team": tn, "rank": seed_map.get(tn), "name": team_name_map.get(tn, "")}
                    for tn in team_numbers
                ]

            bracket_rounds = []
            for r in de_rounds:
                ems = []
                for m in r.get("matches", []):
                    ems.append({
                        "match_number": m.get("match_number"),
                        "round": m.get("round"),
                        "label": m.get("label"),
                        "red_alliance": m.get("red_alliance") or [],
                        "blue_alliance": m.get("blue_alliance") or [],
                        "red_alliance_info": _de_info(m.get("red_alliance") or []),
                        "blue_alliance_info": _de_info(m.get("blue_alliance") or []),
                    })
                bracket_rounds.append({"name": r.get("name"), "matches": ems})

            return jsonify({
                "ok": True,
                "created_count": created_count,
                "format": "double_elimination_6",
                "alliances": alliances,
                "bracket_rounds": bracket_rounds,
            })

        # Tamamlanmış sıralama maçlarını al
        completed_matches = datastore.get_match_schedule(
            event_id=event_id,
            status="completed"
        )
        qualification_matches = [
            m for m in completed_matches
            if (m.get("match_type") or "qualification").strip() == "qualification"
        ]
        
        if not qualification_matches:
            return jsonify({"error": "Tamamlanmış sıralama maçı bulunamadı"}), 400
        
        # Eksik SP verisini scoring_data üzerinden hesapla (sıralama ile aynı algoritma)
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

        # SP puanlarını topla ve takımları sırala
        rankings_calculator = TeamRankingsCalculator()
        rankings = rankings_calculator.calculate_team_rankings(qualification_matches)
        
        if not rankings:
            return jsonify({"error": "Takım sıralaması hesaplanamadı"}), 400
        
        # Bracket oluştur
        bracket_generator = BracketGenerator()
        bracket_info = bracket_generator.get_bracket_info(rankings, teams_per_alliance)
        
        if bracket_info["num_matches"] == 0:
            return jsonify({"error": "Yeterli takım yok (en az {} takım gerekli)".format(
                teams_per_alliance * 2
            )}), 400
        
        playoff_rounds = bracket_generator.generate_playoff_rounds(
            rankings=rankings,
            teams_per_alliance=teams_per_alliance,
            max_teams=max_teams
        )
        final_matches = [m for r in playoff_rounds for m in r.get("matches", [])]
        
        if not final_matches:
            return jsonify({"error": "Final maçları oluşturulamadı"}), 400
        
        # Mevcut final maçlarını temizle (eğer istenirse)
        if clear_existing:
            existing_finals = datastore.get_match_schedule(
                event_id=event_id,
                match_type="final"
            )
            for match in existing_finals:
                datastore.delete_match(match["id"])
        
        # Final maçlarını oluştur
        created_count = 0
        current_time = initial_datetime
        next_number = _get_next_match_number(event_id, "final")
        bracket_id = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        
        for match_data in final_matches:
            try:
                datastore.create_match(
                    match_number=next_number,
                    match_type="final",
                    field_number=field_number,
                    match_date=current_time.strftime("%Y-%m-%d"),
                    match_time=current_time.strftime("%H:%M"),
                    red_alliance=match_data["red_alliance"],
                    blue_alliance=match_data["blue_alliance"],
                    status="scheduled",
                    notes=f"[playoff] bracket_id={bracket_id};round={match_data.get('round')};label={match_data.get('label')}",
                    event_id=event_id,
                )
                created_count += 1
                next_number += 1
                
                # Zamanı ilerlet
                current_time += timedelta(minutes=match_duration)
            except Exception as e:
                # Hata durumunda devam et (loglama yapılabilir)
                continue
        
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
            "created_count": created_count,
            "rankings": rankings,
            "bracket_info": bracket_info,
            "bracket_rounds": bracket_rounds
        })
