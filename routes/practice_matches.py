"""
Deneme Maçları route'ları - Deneme maçları yönetimi için API endpoint'leri
"""

from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
import random

from src.core.scheduling import generate_partner_balanced_fixture


def register_practice_matches_routes(bp, datastore, require_login, require_event_manager):
    def _parse_time_windows(raw_windows: list[dict]) -> list[tuple[datetime, datetime]]:
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

    def _parse_breaks(raw_breaks: list[dict]) -> list[tuple[datetime, datetime]]:
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

    def _next_valid_time(current: datetime, duration_minutes: int, windows, breaks) -> datetime:
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
            # Check if current is inside a window
            window = next((w for w in windows if w[0] <= current < w[1]), None)
            if not window:
                # Move to next window start
                next_window = next((w for w in windows if w[0] > current), None)
                if not next_window:
                    return current
                current = next_window[0]
                continue

            # If match exceeds window end, move to next window
            if current + timedelta(minutes=duration_minutes) > window[1]:
                next_window = next((w for w in windows if w[0] > window[1]), None)
                if not next_window:
                    return current
                current = next_window[0]
                continue

            # Check breaks overlap
            overlapping_break = next(
                (b for b in breaks if not (current + timedelta(minutes=duration_minutes) <= b[0] or current >= b[1])),
                None,
            )
            if overlapping_break:
                current = overlapping_break[1]
                continue

            return current

    @bp.get("/practice-settings")
    @require_login
    def get_practice_settings():
        event_data = datastore.get_event()
        practice_settings = event_data.get("practice_settings", {})
        stage_settings = event_data.get("stages", {}).get("practice_matches", {})
        return jsonify(
            {
                "field_names": practice_settings.get("field_names", []),
                "time_windows": practice_settings.get("time_windows", []),
                "breaks": practice_settings.get("breaks", []),
                "matches_per_team": practice_settings.get("matches_per_team", 1),
                "stage_active": stage_settings.get("active", True),
            }
        )

    @bp.post("/practice-settings")
    @require_login
    @require_event_manager
    def save_practice_settings():
        data = request.get_json(force=True) or {}
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()
        event_data.setdefault("practice_settings", {})
        event_data["practice_settings"]["field_names"] = data.get("field_names", [])
        event_data["practice_settings"]["time_windows"] = data.get("time_windows", [])
        event_data["practice_settings"]["breaks"] = data.get("breaks", [])
        event_data["practice_settings"]["matches_per_team"] = data.get("matches_per_team", 1)
        event_data.setdefault("stages", {})
        event_data["stages"].setdefault("practice_matches", {})
        event_data["stages"]["practice_matches"]["active"] = data.get("stage_active", True)
        datastore.save_event(event_data)
        return jsonify({"ok": True})

    @bp.post("/practice-matches/preview")
    @require_login
    @require_event_manager
    def preview_practice_matches():
        data = request.get_json(force=True) or {}
        start_date = data.get("start_date", "").strip()
        start_time = data.get("start_time", "").strip()
        field_count = data.get("field_count", 1)
        teams_per_alliance = data.get("teams_per_alliance", 2)
        match_cycle_minutes = data.get("match_cycle_minutes")
        matches_per_team = data.get("matches_per_team")
        field_names = data.get("field_names", [])
        time_windows = _parse_time_windows(data.get("time_windows", []))
        breaks = _parse_breaks(data.get("breaks", []))

        if (not start_date or not start_time) and time_windows:
            start_date = time_windows[0][0].strftime("%Y-%m-%d")
            start_time = time_windows[0][0].strftime("%H:%M")
        if not start_date or not start_time:
            return jsonify({"error": "Başlangıç tarihi ve saati gerekli"}), 400

        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()
        teams = datastore.get_teams()
        team_numbers = [t.get("number", "").strip() for t in teams if t.get("number", "").strip()]
        # Deterministik sıra yerine karışık başlangıç düzeni kullan
        random.shuffle(team_numbers)
        if not team_numbers:
            return jsonify({"error": "Takım bulunamadı"}), 400

        try:
            initial_datetime = datetime.strptime(f"{start_date} {start_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            return jsonify({"error": "Geçersiz tarih/saat formatı"}), 400

        event_match_cycle = int(event_data.get("schedule", {}).get("match_cycle_seconds", 150))
        if match_cycle_minutes:
            match_duration = max(1, int(match_cycle_minutes))
        else:
            match_duration = max(1, event_match_cycle // 60)

        target_matches_per_team = None
        if matches_per_team:
            try:
                target_matches_per_team = max(1, int(matches_per_team))
            except ValueError:
                target_matches_per_team = None

        if target_matches_per_team:
            match_count = max(
                1,
                (target_matches_per_team * len(team_numbers) + (teams_per_alliance * 2 - 1)) // (teams_per_alliance * 2),
            )
        else:
            match_count = max(len(team_numbers) // (teams_per_alliance * 2), 1)

        current_time = initial_datetime
        preview_rows = []
        for match_index in range(match_count):
            current_time = _next_valid_time(current_time, match_duration, time_windows, breaks)
            field_number = (match_index % max(1, field_count)) + 1
            preview_rows.append(
                {
                    "match_number": f"P{match_index + 1}",
                    "match_time": current_time.strftime("%H:%M"),
                    "match_date": current_time.strftime("%Y-%m-%d"),
                    "field_number": field_number,
                    "field_name": field_names[field_number - 1] if (field_number - 1) < len(field_names) else f"Saha {field_number}",
                }
            )
            current_time = current_time + timedelta(minutes=match_duration)

        return jsonify(
            {
                "match_count": match_count,
                "start_time": initial_datetime.strftime("%Y-%m-%d %H:%M"),
                "end_time": current_time.strftime("%Y-%m-%d %H:%M"),
                "preview_rows": preview_rows[:8],
            }
        )
    """
    Deneme maçları route'larını Blueprint'e kaydeder.
    
    Args:
        bp: Blueprint instance
        datastore: DataStore instance
        require_login: require_login decorator
        require_event_manager: require_event_manager decorator
    """
    
    @bp.get("/practice-matches")
    @require_login
    def get_practice_matches():
        """
        Deneme maçlarını listeler.
        
        Query parametreleri:
            date: Tarih filtresi (YYYY-MM-DD)
            field: Saha numarası filtresi
            status: Durum filtresi
            
        Returns:
            JSON: Deneme maçları listesi
        """
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify([])
        
        match_date = request.args.get("date", "").strip()
        field_number = request.args.get("field")
        status = request.args.get("status", "").strip()
        
        field_num = None
        if field_number:
            try:
                field_num = int(field_number)
            except ValueError:
                pass
        
        matches = datastore.get_practice_matches(
            event_id=event_id,
            match_date=match_date if match_date else None,
            field_number=field_num,
            status=status if status else None,
        )
        
        return jsonify(matches)
    
    @bp.post("/practice-matches")
    @require_login
    @require_event_manager
    def create_practice_match():
        """
        Yeni deneme maçı oluşturur.
        
        Request body:
            match_number: Maç numarası (opsiyonel)
            field_number: Saha numarası
            match_date: Tarih (YYYY-MM-DD)
            match_time: Saat (HH:MM)
            red_alliance: Kırmızı ittifak (liste)
            blue_alliance: Mavi ittifak (liste)
            status: Durum (opsiyonel, default: scheduled)
            red_score: Kırmızı skor (opsiyonel)
            blue_score: Mavi skor (opsiyonel)
            notes: Notlar (opsiyonel)
            
        Returns:
            JSON: Oluşturulan maç bilgisi
        """
        data = request.get_json(force=True) or {}
        
        match_number = data.get("match_number", "").strip() or None
        field_number = data.get("field_number", 1)
        field_name = data.get("field_name", "").strip()
        match_date = data.get("match_date", "").strip()
        match_time = data.get("match_time", "").strip()
        red_alliance = data.get("red_alliance", [])
        blue_alliance = data.get("blue_alliance", [])
        status = data.get("status", "scheduled")
        red_score = data.get("red_score")
        blue_score = data.get("blue_score")
        surrogate_teams = data.get("surrogate_teams", [])
        notes = data.get("notes", "").strip()
        
        # Validasyon
        if not match_date or not match_time:
            return jsonify({"error": "Tarih ve saat gerekli"}), 400
        if not red_alliance or not blue_alliance:
            return jsonify({"error": "Her iki ittifak için en az bir takım gerekli"}), 400
        
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()
        
        # Çakışma kontrolü
        match_duration = event_data.get("schedule", {}).get("match_cycle_seconds", 150) // 60
        all_teams = red_alliance + blue_alliance
        for team in all_teams:
            if datastore.check_practice_match_conflict(
                team_number=team,
                match_date=match_date,
                match_time=match_time,
                duration_minutes=match_duration,
                event_id=event_id,
            ):
                return jsonify({"error": f"Takım {team} için çakışma var"}), 400
        
        try:
            match_id = datastore.create_practice_match(
                match_number=match_number,
                field_number=field_number,
                field_name=field_name,
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
    
    @bp.put("/practice-matches/<int:match_id>")
    @require_login
    @require_event_manager
    def update_practice_match(match_id):
        """
        Deneme maçı günceller.
        
        Args:
            match_id: Maç ID'si
            
        Request body:
            match_number, field_number, match_date, match_time, red_alliance,
            blue_alliance, status, red_score, blue_score, notes (opsiyonel)
            
        Returns:
            JSON: Güncelleme sonucu
        """
        data = request.get_json(force=True) or {}
        
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()
        
        # Çakışma kontrolü (eğer tarih/saat değişiyorsa)
        if "match_date" in data or "match_time" in data:
            match_date = data.get("match_date") or request.args.get("match_date", "")
            match_time = data.get("match_time") or request.args.get("match_time", "")
            if match_date and match_time:
                match_duration = event_data.get("schedule", {}).get("match_cycle_seconds", 150) // 60
                # Mevcut maçı al
                matches = datastore.get_practice_matches(event_id=event_id)
                current_match = next((m for m in matches if m["id"] == match_id), None)
                if current_match:
                    all_teams = current_match.get("red_alliance", []) + current_match.get("blue_alliance", [])
                    for team in all_teams:
                        if datastore.check_practice_match_conflict(
                            team_number=team,
                            match_date=match_date,
                            match_time=match_time,
                            duration_minutes=match_duration,
                            exclude_match_id=match_id,
                            event_id=event_id,
                        ):
                            return jsonify({"error": f"Takım {team} için çakışma var"}), 400
        
        try:
            datastore.update_practice_match(
                match_id=match_id,
                match_number=data.get("match_number"),
                field_number=data.get("field_number"),
                field_name=data.get("field_name"),
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
    
    @bp.delete("/practice-matches/<int:match_id>")
    @require_login
    @require_event_manager
    def delete_practice_match(match_id):
        """
        Deneme maçı siler.
        
        Args:
            match_id: Maç ID'si
            
        Returns:
            JSON: Silme sonucu
        """
        try:
            datastore.delete_practice_match(match_id)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @bp.post("/practice-matches/bulk-update")
    @require_login
    @require_event_manager
    def bulk_update_practice_matches():
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
        new_field = data.get("field_number")
        new_status = data.get("status")

        matches = datastore.get_practice_matches(event_id=event_id)
        match_map = {m["id"]: m for m in matches}

        conflicts = []
        for match_id in match_ids:
            current = match_map.get(match_id)
            if not current:
                continue
            updated_date = new_date or current["match_date"]
            updated_time = new_time or current["match_time"]
            duration = event_data.get("schedule", {}).get("match_cycle_seconds", 150) // 60
            all_teams = current.get("red_alliance", []) + current.get("blue_alliance", [])
            for team in all_teams:
                if datastore.check_practice_match_conflict(
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
            field_name = None
            if new_field:
                idx = int(new_field) - 1
                field_names = event_data.get("practice_settings", {}).get("field_names", [])
                if 0 <= idx < len(field_names):
                    field_name = field_names[idx]
            datastore.update_practice_match(
                match_id=match_id,
                match_date=new_date or None,
                match_time=new_time or None,
                field_number=int(new_field) if new_field else None,
                field_name=field_name,
                status=new_status,
            )
            updated_count += 1

        return jsonify({"ok": True, "updated_count": updated_count})
    
    @bp.post("/practice-matches/generate")
    @require_login
    @require_event_manager
    def generate_practice_matches():
        """
        Otomatik deneme maçları takvimi oluşturur.
        
        Request body:
            start_date: Başlangıç tarihi (YYYY-MM-DD)
            start_time: Başlangıç saati (HH:MM)
            num_matches: Oluşturulacak maç sayısı (opsiyonel)
            field_count: Saha sayısı (default: 1)
            teams_per_alliance: İttifak başına takım sayısı (default: 2)
            clear_existing: Mevcut maçları temizle (default: false)
            
        Returns:
            JSON: Oluşturulan maç sayısı
        """
        data = request.get_json(force=True) or {}
        
        start_date = data.get("start_date", "").strip()
        start_time = data.get("start_time", "").strip()
        num_matches = data.get("num_matches")
        field_count = data.get("field_count", 1)
        teams_per_alliance = data.get("teams_per_alliance", 2)
        match_cycle_minutes = data.get("match_cycle_minutes")
        matches_per_team = data.get("matches_per_team")
        field_names = data.get("field_names", [])
        time_windows = _parse_time_windows(data.get("time_windows", []))
        breaks = _parse_breaks(data.get("breaks", []))
        clear_existing = data.get("clear_existing", False)
        
        if not start_date or not start_time:
            return jsonify({"error": "Başlangıç tarihi ve saati gerekli"}), 400
        if not (1 <= field_count <= 10):
            return jsonify({"error": "Saha sayısı 1 ile 10 arasında olmalı"}), 400
        
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        event_data = datastore.get_event()

        # Etkinlikten saha sayısı ve ittifak takım sayısını al
        format_data = event_data.get("format", {})
        event_fields = int(format_data.get("fields") or 1)
        event_teams_per_alliance = int(format_data.get("teams_per_alliance") or 2)
        if event_fields >= 1:
            field_count = event_fields
        if event_teams_per_alliance >= 1:
            teams_per_alliance = event_teams_per_alliance
        
        teams = datastore.get_teams()
        if not teams:
            return jsonify({"error": "Takım bulunamadı"}), 400
        
        # Takım numaralarını al
        team_numbers = [t.get("number", "").strip() for t in teams if t.get("number", "").strip()]
        if len(team_numbers) < teams_per_alliance * 2:
            return jsonify({"error": f"En az {teams_per_alliance * 2} takım gerekli"}), 400
        
        try:
            initial_datetime = datetime.strptime(f"{start_date} {start_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            return jsonify({"error": "Geçersiz tarih/saat formatı"}), 400
        
        if clear_existing:
            datastore.delete_all_practice_matches(event_id)
        
        # Maç süresini al (önce istekteki değer, yoksa etkinlikten)
        event_match_cycle = int(event_data.get("schedule", {}).get("match_cycle_seconds", 150))
        if match_cycle_minutes:
            try:
                match_duration = max(1, int(match_cycle_minutes))
            except ValueError:
                match_duration = max(1, event_match_cycle // 60)
        else:
            match_duration = max(1, event_match_cycle // 60)
        
        # Maç sayısını belirle
        target_matches_per_team = None
        if matches_per_team:
            try:
                target_matches_per_team = max(1, int(matches_per_team))
            except ValueError:
                target_matches_per_team = None
        if target_matches_per_team:
            num_matches = max(
                1,
                (target_matches_per_team * len(team_numbers) + (teams_per_alliance * 2 - 1)) // (teams_per_alliance * 2),
            )
        elif num_matches is None:
            # Tüm takımlar için dengeli eşleştirme
            # Her takım en az bir kez oynasın
            min_matches_per_team = 1
            num_matches = max(min_matches_per_team * len(team_numbers) // (teams_per_alliance * 2), 10)
        
        created_count = 0
        match_counter = 1
        current_time = initial_datetime

        # Adil fikstür: takımlar eşit maç yapsın, partner tekrarı (mümkünse) olmasın,
        # rakip çeşitliliği ve kırmızı/mavi denge gözetilsin. Sıralama maçlarıyla
        # AYNI paylaşılan algoritma kullanılır (src/core/scheduling/fixture.py).
        required_count = teams_per_alliance * 2

        # Hedef maç/takım: kullanıcı vermediyse toplam maç sayısından türet.
        fixture_matches_per_team = target_matches_per_team
        if not fixture_matches_per_team:
            fixture_matches_per_team = max(1, round((num_matches * required_count) / len(team_numbers)))

        # Dinlenme aralığı (deadlock önleme): yeterli takım varsa 2, azsa 1.
        min_gap_matches = 2 if len(team_numbers) >= required_count * 3 else 1

        schedule_pairs = generate_partner_balanced_fixture(
            team_numbers,
            teams_per_alliance,
            fixture_matches_per_team,
            num_matches,
            min_gap_matches=min_gap_matches,
            hard_unique_partners=False,
        )
        if not schedule_pairs:
            return jsonify({"error": "Deneme maçı takvimi oluşturulamadı, parametreleri gözden geçirin"}), 400

        # Üretilen ittifak çiftlerini zaman/saha ile veritabanına yaz.
        match_count_tracker = {team: 0 for team in team_numbers}
        # Saha ataması: ardışık maçlar sahalar arasında ALTERNATİF (1,2,1,2...) —
        # böylece iki saha paralel çalıştırılabilir (bir saha 1, bir saha 2).
        _nf = max(1, field_count)
        for pair in schedule_pairs:
            red_alliance = pair["red_alliance"]
            blue_alliance = pair["blue_alliance"]

            current_time = _next_valid_time(current_time, match_duration, time_windows, breaks)

            # Çakışma kontrolü (var olan maçlarla)
            conflict = False
            for team in red_alliance + blue_alliance:
                if datastore.check_practice_match_conflict(
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

            # Surrogate: hedef maç sayısını aşan (doldurma amaçlı) takımlar
            surrogate_teams = []
            if target_matches_per_team:
                for team in red_alliance + blue_alliance:
                    if match_count_tracker[team] >= target_matches_per_team:
                        surrogate_teams.append(team)

            try:
                match_number = f"P{match_counter}"
                field_number = (created_count % _nf) + 1  # alternatif: 1,2,1,2...
                datastore.create_practice_match(
                    match_number=match_number,
                    field_number=field_number,
                    field_name=field_names[field_number - 1] if (field_number - 1) < len(field_names) else f"Saha {field_number}",
                    match_date=current_time.strftime("%Y-%m-%d"),
                    match_time=current_time.strftime("%H:%M"),
                    red_alliance=red_alliance,
                    blue_alliance=blue_alliance,
                    status="scheduled",
                    surrogate_teams=surrogate_teams,
                    event_id=event_id,
                )
                created_count += 1
                match_counter += 1
                for team in red_alliance + blue_alliance:
                    match_count_tracker[team] += 1
                current_time += timedelta(minutes=match_duration)
            except Exception as e:
                print(f"Error creating practice match: {e}")
                continue

        # Kısmi başarı bilgisi: istenen sayıda maç üretilemediyse uyar (resmi maç
        # takvimiyle tutarlı). Üretilenler geçerlidir; kullanıcıya fark bildirilir.
        response = {"ok": True, "created_count": created_count, "requested": num_matches}
        if num_matches and created_count < num_matches:
            response["partial"] = True
            response["message"] = (
                f"İstenen {num_matches} maçtan {created_count} tanesi oluşturulabildi "
                f"(dinlenme/çakışma kuralları nedeniyle)."
            )
        return jsonify(response)
