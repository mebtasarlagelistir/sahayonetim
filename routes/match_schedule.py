"""
Resmi Maç Takvimi route'ları

Bu modül resmi maç takvimi yönetimi için API endpoint'lerini içerir.
"""

from datetime import datetime, timedelta
import random

from flask import Blueprint, jsonify, request


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
        team_numbers = [t.get("number", "").strip() for t in teams if t.get("number", "").strip()]
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

        # Maç sayısını belirle
        if matches_per_team:
            num_matches = max(
                1,
                (matches_per_team * len(team_numbers) + (teams_per_alliance * 2 - 1)) // (teams_per_alliance * 2),
            )
        elif num_matches is None:
            num_matches = max(len(team_numbers) // (teams_per_alliance * 2), 1)

        # Eğer temizleme yapılmadıysa maç numarasını devam ettir
        next_number = _get_next_match_number(event_id, match_type)

        # Matchmaker istatistikleri
        team_stats = {
            team: {
                "match_count": 0,
                "red_count": 0,
                "blue_count": 0,
                "opponents": set(),
                "last_color": None,
                "last_match_time": None,
            }
            for team in team_numbers
        }

        def calculate_team_score(team, current_time):
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
            return base_score + balance_score + rest_score

        def pick_balanced_teams(available_teams, required_count, current_time):
            if len(available_teams) < required_count:
                return None
            shuffled = list(available_teams)
            random.shuffle(shuffled)
            sorted_teams = sorted(
                shuffled,
                key=lambda t: calculate_team_score(t, current_time) + random.random(),
                reverse=True,
            )
            selected = []
            selected_set = set()
            if sorted_teams:
                top_score = calculate_team_score(sorted_teams[0], current_time)
                top_candidates = [
                    t for t in sorted_teams if calculate_team_score(t, current_time) >= top_score - 0.01
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
                    team_score = calculate_team_score(team, current_time)
                    overlap = sum(
                        1
                        for sel in selected
                        if team in team_stats[sel]["opponents"] or sel in team_stats[team]["opponents"]
                    )
                    diversity_bonus = (len(selected) - overlap) * 5
                    repeat_penalty = overlap * 25
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

            def color_preference_score(team):
                stats = team_stats[team]
                balance = stats["red_count"] - stats["blue_count"]
                streak_bonus = 0
                if stats["last_color"] == "red":
                    streak_bonus = -5
                elif stats["last_color"] == "blue":
                    streak_bonus = 5
                return balance + streak_bonus

            shuffled_selected = list(selected)
            random.shuffle(shuffled_selected)
            sorted_selected = sorted(
                shuffled_selected,
                key=lambda t: color_preference_score(t) + random.random() * 0.01,
            )
            red_alliance = sorted_selected[:teams_per_alliance]
            blue_alliance = sorted_selected[teams_per_alliance:]

            surrogate_teams = []
            if matches_per_team:
                for team in red_alliance + blue_alliance:
                    if team_stats[team]["match_count"] >= matches_per_team:
                        surrogate_teams.append(team)

            try:
                # Saha numarası sırayla ilerler (aynı anda tek maç)
                field_number = (created_count % max(1, field_count)) + 1
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
            except Exception:
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
                team_stats[team]["opponents"].update(blue_alliance)
            for team in blue_alliance:
                team_stats[team]["match_count"] += 1
                team_stats[team]["blue_count"] += 1
                team_stats[team]["last_color"] = "blue"
                team_stats[team]["last_match_time"] = current_time
                team_stats[team]["opponents"].update(red_alliance)

            # Zamanı ilerlet
            current_time += timedelta(minutes=match_duration)

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
        event_teams_per_alliance = _parse_int(format_data.get("teams_per_alliance"), 2)
        if event_teams_per_alliance:
            teams_per_alliance = event_teams_per_alliance
        
        # Maç süresini al
        event_cycle = int(event_data.get("schedule", {}).get("match_cycle_seconds", 150))
        match_duration = max(1, (match_cycle_minutes or (event_cycle // 60)))
        
        # Tamamlanmış sıralama maçlarını al
        qualification_matches = datastore.get_match_schedule(
            event_id=event_id,
            match_type="qualification",
            status="completed"
        )
        
        if not qualification_matches:
            return jsonify({"error": "Tamamlanmış sıralama maçı bulunamadı"}), 400
        
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
        
        final_matches = bracket_generator.generate_final_matches(
            rankings=rankings,
            teams_per_alliance=teams_per_alliance,
            max_teams=max_teams
        )
        
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
                    event_id=event_id,
                )
                created_count += 1
                next_number += 1
                
                # Zamanı ilerlet
                current_time += timedelta(minutes=match_duration)
            except Exception as e:
                # Hata durumunda devam et (loglama yapılabilir)
                continue
        
        return jsonify({
            "ok": True,
            "created_count": created_count,
            "rankings": rankings,
            "bracket_info": bracket_info
        })
