"""
İnceleme route'ları - İnceleme slotları ve ayarları için API endpoint'leri
"""

from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


def _coerce_duration(value, default=15, min_v=1, max_v=600):
    """
    İnceleme süresini (dakika) güvenli pozitif int'e çevirir.
    Geçersiz/negatif/sınır dışı girdileri makul aralığa sabitler.
    """
    try:
        v = int(value)
    except (TypeError, ValueError):
        return default
    if v < min_v:
        return min_v
    if v > max_v:
        return max_v
    return v


def register_inspection_routes(bp, datastore, require_login, require_event_manager, socketio=None):
    """
    İnceleme route'larını Blueprint'e kaydeder.
    
    Args:
        bp: Blueprint instance
        datastore: DataStore instance
        require_login: require_login decorator
        require_event_manager: require_event_manager decorator
        socketio: SocketIO instance (WebSocket için)
    """
    
    @bp.get("/inspection-settings")
    @require_login
    def get_inspection_settings():
        """
        İnceleme ayarlarını getirir (tip süreleri vb.).
        
        Phase 1: FRC Enhancement - 10 inspection types supported
        
        Returns:
            JSON: İnceleme ayarları
        """
        event_data = datastore.get_event()
        inspection_settings = event_data.get("inspection_settings", {})
        
        # FRC default type durations (updated for Phase 1)
        default_type_durations = {
            # Core inspections
            "weight": 5,
            "size": 10,
            "general_hardware": 20,
            "electrical": 15,
            "pneumatics": 10,
            "radio": 10,
            "software": 15,
            "bumpers": 5,
            "game_specific": 10,
            "safety": 15,
            # Legacy types (backward compatibility)
            "hardware": 20,  # Maps to general_hardware
            "custom": 15,    # Maps to game_specific
        }
        
        type_durations = inspection_settings.get("type_durations", default_type_durations)
        
        # Merge with defaults (ensure all FRC types exist)
        for key, value in default_type_durations.items():
            if key not in type_durations:
                type_durations[key] = value
        
        # Default selected types (FRC core inspections)
        default_selected = ["weight", "size", "general_hardware", "electrical", "radio", "software", "bumpers", "game_specific", "safety"]
        selected_types = inspection_settings.get("selected_types", default_selected)
        
        print_note = inspection_settings.get(
            "print_note",
            (
                "İnceleme İstanyonu Ekipleri programda bir sakma olmama durumunda belirtilen saatte "
                "Pit Alanınıza inceleme için ziyaret gerçekleştirecektir. Bu saatte robotunuz ve ilgili "
                "kişiler mutlaka Pit Alanınızda yer bulunmalıdır. Oyun kılavuzunda izin verilen kurallara "
                "göre robotunuzun yarışmaya hazır olduğunuzdan emin olacaklardır. Bir itirazınız olduğun "
                "Baş Robot Müfettişine danışınız."
            ),
        )
        return jsonify({
            "type_durations": type_durations,
            "selected_types": selected_types,
            "print_note": print_note,
        })

    @bp.post("/inspection-settings")
    @require_login
    @require_event_manager
    def save_inspection_settings():
        """
        İnceleme ayarlarını kaydeder (tip süreleri vb.).
        
        Phase 1: FRC Enhancement - Validates 10 inspection types
        
        Request body:
            {
                "type_durations": {
                    "weight": 5,
                    "size": 10,
                    "general_hardware": 20,
                    "electrical": 15,
                    "pneumatics": 10,
                    "radio": 10,
                    "software": 15,
                    "bumpers": 5,
                    "game_specific": 10,
                    "safety": 15
                },
                "selected_types": ["weight", "size", ...],
                "print_note": "..."
            }
        
        Returns:
            JSON: Başarı durumu
        """
        data = request.get_json(force=True) or {}
        type_durations = data.get("type_durations")
        selected_types = data.get("selected_types")
        print_note = data.get("print_note")
        
        # Validation: Check for valid FRC types
        valid_frc_types = {
            "weight", "size", "general_hardware", "electrical", "pneumatics",
            "radio", "software", "bumpers", "game_specific", "safety",
            # Legacy types for backward compatibility
            "hardware", "custom"
        }
        
        if type_durations is not None:
            if not isinstance(type_durations, dict):
                return jsonify({"error": "type_durations must be a dictionary"}), 400
            
            # Validate type keys
            for type_key in type_durations.keys():
                if type_key not in valid_frc_types:
                    return jsonify({"error": f"Invalid inspection type: {type_key}"}), 400
            
            # Validate duration values
            for type_key, duration in type_durations.items():
                if not isinstance(duration, (int, float)) or duration <= 0:
                    return jsonify({"error": f"Invalid duration for {type_key}: must be positive number"}), 400
        
        if selected_types is not None:
            if not isinstance(selected_types, list):
                return jsonify({"error": "selected_types must be a list"}), 400
            
            # Validate selected types
            for type_key in selected_types:
                if type_key not in valid_frc_types:
                    return jsonify({"error": f"Invalid selected type: {type_key}"}), 400
        
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı"}), 400
        
        # Event data'yı güncelle
        event_data = datastore.get_event()
        if "inspection_settings" not in event_data:
            event_data["inspection_settings"] = {}
        
        if isinstance(type_durations, dict):
            event_data["inspection_settings"]["type_durations"] = type_durations
        if isinstance(selected_types, list):
            event_data["inspection_settings"]["selected_types"] = selected_types
        if print_note is not None:
            event_data["inspection_settings"]["print_note"] = str(print_note).strip()
        
        datastore.save_event(event_data)
        
        return jsonify({"ok": True})

    @bp.get("/inspection-slots")
    @require_login
    def get_inspection_slots():
        """
        İnceleme slotlarını listeler.
        
        Query parametreleri:
            - team: Takım numarası (filtreleme)
            - type: İnceleme tipi (filtreleme)
            - date: Tarih YYYY-MM-DD (filtreleme)
            - status: Durum (filtreleme)
        
        Returns:
            JSON: İnceleme slotları listesi
        """
        team_number = request.args.get("team")
        inspection_type = request.args.get("type")
        slot_date = request.args.get("date")
        status = request.args.get("status")
        
        slots = datastore.get_inspection_slots(
            team_number=team_number,
            inspection_type=inspection_type,
            slot_date=slot_date,
            status=status,
        )
        
        # Takım adlarını eşleştir
        teams = datastore.get_teams()
        team_names = {str(t.get("number", "")).strip(): t.get("name", "") for t in teams}
        
        for slot in slots:
            slot["team_name"] = team_names.get(str(slot.get("team_number", "")).strip(), "")
        
        return jsonify(slots)

    @bp.post("/inspection-slots")
    @require_login
    @require_event_manager
    def create_inspection_slot():
        """
        Yeni inceleme slotu oluşturur.
        
        Request body:
            {
                "team_number": "202501",
                "inspection_type": "hardware",
                "slot_date": "2026-02-06",
                "slot_time": "09:00",
                "duration_minutes": 20,
                "inspector_name": "Müfettiş Adı",
                "status": "scheduled",
                "notes": "Notlar"
            }
        
        Returns:
            JSON: Oluşturulan slot bilgisi
        """
        data = request.get_json(force=True) or {}
        
        # Validasyon
        team_number = data.get("team_number", "").strip()
        inspection_type = data.get("inspection_type", "").strip()
        slot_date = data.get("slot_date", "").strip()
        slot_time = data.get("slot_time", "").strip()
        
        if not team_number:
            return jsonify({"error": "Takım numarası gerekli"}), 400
        if not inspection_type:
            return jsonify({"error": "İnceleme tipi gerekli"}), 400
        if not slot_date:
            return jsonify({"error": "Tarih gerekli"}), 400
        if not slot_time:
            return jsonify({"error": "Saat gerekli"}), 400
        
        # Çakışma kontrolü — süreyi pozitif int'e zorla (tip/aralık doğrulaması)
        duration_minutes = _coerce_duration(data.get("duration_minutes", 15))
        if datastore.check_inspection_conflict(
            team_number=team_number,
            slot_date=slot_date,
            slot_time=slot_time,
            duration_minutes=duration_minutes,
        ):
            return jsonify({"error": "Bu takım için aynı saatte başka bir inceleme var"}), 400
        
        try:
            slot_id = datastore.create_inspection_slot(
                team_number=team_number,
                inspection_type=inspection_type,
                slot_date=slot_date,
                slot_time=slot_time,
                duration_minutes=duration_minutes,
                inspector_name=data.get("inspector_name", "").strip(),
                status=data.get("status", "scheduled"),
                notes=data.get("notes", "").strip(),
                station_name=data.get("station_name", "").strip(),
            )
            return jsonify({"id": slot_id, "ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @bp.route("/inspection-slots/<int:slot_id>", methods=["PUT", "POST"])
    @require_login
    @require_event_manager
    def update_inspection_slot(slot_id: int):
        """
        İnceleme slotu günceller.
        
        Request body:
            {
                "team_number": "202501",
                "inspection_type": "hardware",
                "slot_date": "2026-02-06",
                "slot_time": "09:00",
                "duration_minutes": 20,
                "inspector_name": "Müfettiş Adı",
                "status": "completed",
                "notes": "Notlar"
            }
        
        Returns:
            JSON: Başarı durumu
        """
        data = request.get_json(force=True) or {}
        
        # Çakışma kontrolü (eğer tarih/saat değişiyorsa)
        if "slot_date" in data or "slot_time" in data:
            # Mevcut slot bilgilerini al
            slots = datastore.get_inspection_slots()
            current_slot = next((s for s in slots if s["id"] == slot_id), None)
            if not current_slot:
                return jsonify({"error": "Slot bulunamadı"}), 404
            
            team_number = data.get("team_number", current_slot["team_number"])
            slot_date = data.get("slot_date", current_slot["slot_date"])
            slot_time = data.get("slot_time", current_slot["slot_time"])
            duration_minutes = _coerce_duration(
                data.get("duration_minutes", current_slot["duration_minutes"])
            )
            if datastore.check_inspection_conflict(
                team_number=team_number,
                slot_date=slot_date,
                slot_time=slot_time,
                duration_minutes=duration_minutes,
                exclude_slot_id=slot_id,
            ):
                return jsonify({"error": "Bu takım için aynı saatte başka bir inceleme var"}), 400
        
        try:
            datastore.update_inspection_slot(
                slot_id=slot_id,
                team_number=data.get("team_number"),
                inspection_type=data.get("inspection_type"),
                slot_date=data.get("slot_date"),
                slot_time=data.get("slot_time"),
                duration_minutes=_coerce_duration(data["duration_minutes"]) if data.get("duration_minutes") is not None else None,
                inspector_name=data.get("inspector_name"),
                status=data.get("status"),
                notes=data.get("notes"),
                station_name=data.get("station_name"),
            )
            
            # WebSocket ile tüm audience ekranlarına inspection güncellemesini bildir
            if socketio:
                socketio.emit("inspection_update", {
                    "slot_id": slot_id,
                    "status": data.get("status"),
                    "team_number": data.get("team_number"),
                }, namespace="/audience")
                logger.info(f"Inspection update broadcast: slot_id={slot_id}")
            
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @bp.post("/inspection-slots/bulk-update")
    @require_login
    @require_event_manager
    def bulk_update_inspection_slots():
        """
        Seçili inceleme slotlarını toplu günceller.
        
        Request body:
            {
                "slot_ids": [1, 2, 3],
                "slot_date": "2026-02-06",   # opsiyonel
                "slot_time": "10:00",        # opsiyonel
                "status": "completed",       # opsiyonel
                "station_name": "İstasyon 1",# opsiyonel
                "inspector_name": "Müfettiş A" # opsiyonel
            }
        
        Returns:
            JSON: Başarı durumu ve güncellenen slot sayısı
        """
        data = request.get_json(force=True) or {}
        slot_ids = data.get("slot_ids", [])
        if not isinstance(slot_ids, list) or not slot_ids:
            return jsonify({"error": "Güncellenecek slot seçilmedi"}), 400

        # Güncellenecek alanlar
        new_date = (data.get("slot_date") or "").strip()
        new_time = (data.get("slot_time") or "").strip()
        new_status = data.get("status")
        new_station = data.get("station_name")
        new_inspector = data.get("inspector_name")

        slots = datastore.get_inspection_slots()
        slot_map = {s["id"]: s for s in slots}

        conflicts = []
        for slot_id in slot_ids:
            current = slot_map.get(slot_id)
            if not current:
                continue
            updated_date = new_date or current["slot_date"]
            updated_time = new_time or current["slot_time"]
            updated_duration = current["duration_minutes"]

            if (new_date or new_time) and datastore.check_inspection_conflict(
                team_number=current["team_number"],
                slot_date=updated_date,
                slot_time=updated_time,
                duration_minutes=updated_duration,
                exclude_slot_id=slot_id,
            ):
                conflicts.append(
                    {
                        "id": slot_id,
                        "team_number": current["team_number"],
                        "slot_date": updated_date,
                        "slot_time": updated_time,
                    }
                )

        if conflicts:
            return jsonify({"error": "Bazı slotlarda çakışma var", "conflicts": conflicts}), 400

        updated_count = 0
        for slot_id in slot_ids:
            if slot_id not in slot_map:
                continue
            datastore.update_inspection_slot(
                slot_id=slot_id,
                slot_date=new_date or None,
                slot_time=new_time or None,
                status=new_status,
                station_name=new_station,
                inspector_name=new_inspector,
            )
            updated_count += 1

        return jsonify({"ok": True, "updated_count": updated_count})

    @bp.delete("/inspection-slots/<int:slot_id>")
    @require_login
    @require_event_manager
    def delete_inspection_slot(slot_id: int):
        """
        İnceleme slotu siler.
        
        Returns:
            JSON: Başarı durumu
        """
        try:
            datastore.delete_inspection_slot(slot_id)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    @bp.delete("/inspection-slots")
    @require_login
    @require_event_manager
    def delete_all_inspection_slots():
        """
        Tüm inceleme slotlarını siler (etkinlik bazlı).
        
        Returns:
            JSON: Başarı durumu ve silinen slot sayısı
        """
        try:
            # Önce mevcut slot sayısını al
            slots = datastore.get_inspection_slots()
            count = len(slots)
            
            # Tüm slotları sil
            datastore.delete_all_inspection_slots()
            
            return jsonify({"ok": True, "deleted_count": count})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @bp.post("/inspection-slots/generate")
    @require_login
    @require_event_manager
    def generate_inspection_slots():
        """
        Otomatik inceleme takvimi oluşturur.
        
        Request body:
            {
                "start_date": "2026-02-06",
                "start_time": "09:00",
                "inspection_types": ["hardware", "size", "safety"],
                "break_minutes": 5,
                "inspector_names": ["Müfettiş 1", "Müfettiş 2"],
                "station_count": 1
            }
        
        Returns:
            JSON: Oluşturulan slot sayısı
        """
        data = request.get_json(force=True) or {}
        
        start_date = data.get("start_date", "").strip()
        start_time = data.get("start_time", "").strip()
        inspection_types = data.get("inspection_types", [])
        break_minutes = data.get("break_minutes", 5)
        inspector_names = data.get("inspector_names", [])
        # İstasyon isimleri listesi (yeni özellik)
        station_names = data.get("station_names", [])
        # Geriye dönük uyumluluk için station_count'u da destekle
        station_count = data.get("station_count", len(station_names) if station_names else 1)
        sort_order = data.get("sort_order", "ascending")  # ascending, descending, random
        
        if not start_date:
            return jsonify({"error": "Başlangıç tarihi gerekli"}), 400
        if not start_time:
            return jsonify({"error": "Başlangıç saati gerekli"}), 400
        if not inspection_types:
            return jsonify({"error": "En az bir inceleme tipi seçilmeli"}), 400
        
        # İstasyon isimleri yoksa, sayıya göre oluştur
        if not station_names:
            station_names = [f"İstasyon {i+1}" for i in range(station_count)]
        else:
            # İstasyon isimlerini temizle (boş olanları filtrele)
            station_names = [s.strip() for s in station_names if s.strip()]
            if not station_names:
                station_names = [f"İstasyon {i+1}" for i in range(station_count)]
        
        station_count = len(station_names)
        if station_count < 1:
            station_count = 1
            station_names = ["İstasyon 1"]
        
        # İnceleme tipi sürelerini event data'dan al, yoksa varsayılanları kullan
        event_data = datastore.get_event()
        inspection_settings = event_data.get("inspection_settings", {})
        type_durations = inspection_settings.get("type_durations", {
            "hardware": 20,
            "size": 10,
            "safety": 15,
            "software": 15,
            "weight": 5,
            "custom": 15,
        })
        
        # Tüm takımları al
        teams = datastore.get_teams()
        if not teams:
            return jsonify({"error": "Takım bulunamadı"}), 400
        
        try:
            current_datetime = datetime.strptime(f"{start_date} {start_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            return jsonify({"error": "Geçersiz tarih/saat formatı"}), 400
        
        # Mevcut slotları temizle (opsiyonel - kullanıcı seçebilir)
        if data.get("clear_existing", False):
            datastore.delete_all_inspection_slots()
        
        created_count = 0
        inspector_index = 0
        
        # Takım numaralarını al
        team_numbers = [t.get("number", "").strip() for t in teams if t.get("number", "").strip()]
        
        # Sıralama uygula
        if sort_order == "ascending":
            team_numbers.sort(key=lambda x: (len(x), x))  # Önce uzunluğa, sonra alfabetik
        elif sort_order == "descending":
            team_numbers.sort(key=lambda x: (len(x), x), reverse=True)
        elif sort_order == "random":
            import random
            random.shuffle(team_numbers)
        
        # Her istasyon için tek bir zaman takibi (bir istasyon aynı anda sadece bir inceleme yapabilir)
        # station_times[station_idx] = datetime
        station_times = [current_datetime] * station_count
        
        # Takımları istasyon sayısına göre döngüsel olarak dağıt (round-robin)
        # İlk N takım (N = istasyon sayısı) aynı anda başlar, sonraki N takım aynı anda başlar, vs.
        for team_idx, team_number in enumerate(team_numbers):
            # Bu takımın atandığı istasyon (döngüsel dağıtım)
            station_idx = team_idx % station_count
            
            # Bu takım için tüm inceleme tiplerini sırayla işle
            # Her inceleme tipi, önceki inceleme tipinin bitiş zamanından sonra başlar
            for inspection_type in inspection_types:
                duration = type_durations.get(inspection_type, 15)
                
                # Bu istasyonun mevcut zamanını kullan
                slot_datetime = station_times[station_idx]
                
                # Çakışma kontrolü (bu takım için - başka bir inceleme tipi ile çakışma olabilir)
                while datastore.check_inspection_conflict(
                    team_number=team_number,
                    slot_date=slot_datetime.strftime("%Y-%m-%d"),
                    slot_time=slot_datetime.strftime("%H:%M"),
                    duration_minutes=duration,
                ):
                    # Çakışma varsa, bir sonraki boş slotu bul
                    slot_datetime += timedelta(minutes=duration + break_minutes)
                    # Eğer gün değişirse, başlangıç saatine geri dön
                    if slot_datetime.date() != current_datetime.date():
                        slot_datetime = slot_datetime.replace(
                            hour=current_datetime.hour,
                            minute=current_datetime.minute
                        )
                
                # Müfettiş atama (döngüsel)
                inspector_name = ""
                if inspector_names:
                    inspector_name = inspector_names[inspector_index % len(inspector_names)]
                    inspector_index += 1
                
                # İstasyon ismi atama
                station_name = station_names[station_idx] if station_names else ""
                
                # Slot oluştur
                try:
                    datastore.create_inspection_slot(
                        team_number=team_number,
                        inspection_type=inspection_type,
                        slot_date=slot_datetime.strftime("%Y-%m-%d"),
                        slot_time=slot_datetime.strftime("%H:%M"),
                        duration_minutes=duration,
                        inspector_name=inspector_name,
                        status="scheduled",
                        station_name=station_name,
                    )
                    created_count += 1
                except Exception as e:
                    # Hata durumunda devam et
                    continue
                
                # Bu istasyonun zamanını güncelle (süre + mola)
                # Bir sonraki inceleme tipi veya takım bu zamandan sonra başlayacak
                station_times[station_idx] = slot_datetime + timedelta(minutes=duration + break_minutes)
        
        return jsonify({"ok": True, "created_count": created_count})
    @bp.post("/inspection-slots/generate-simple")
    @require_login
    @require_event_manager
    def generate_simple_inspection_slots():
        """
        Basitleştirilmiş inceleme programı oluşturur (FRC inceleme tipleri olmadan).
        Her takım için tek bir inceleme slotu oluşturur.
        Birden fazla müfettiş varsa takımları paralel dağıtır.
        
        Request body:
            {
                "start_date": "2026-02-06",
                "start_time": "09:00",
                "slot_duration": 15,
                "break_minutes": 5,
                "sort_order": "ascending",
                "inspector_name": "Ali, Veli, Ayşe",  # Virgülle ayrılmış isimler
                "clear_existing": true
            }
        
        Returns:
            JSON: Oluşturulan slot sayısı
        """
        data = request.get_json(force=True) or {}
        
        start_date = data.get("start_date", "").strip()
        start_time = data.get("start_time", "").strip()
        slot_duration = data.get("slot_duration", 15)
        break_minutes = data.get("break_minutes", 5)
        sort_order = data.get("sort_order", "ascending")
        inspector_names_raw = data.get("inspector_name", "").strip()
        
        if not start_date:
            return jsonify({"error": "Başlangıç tarihi gerekli"}), 400
        if not start_time:
            return jsonify({"error": "Başlangıç saati gerekli"}), 400
        
        # Müfettiş isimlerini ayır
        inspectors = [name.strip() for name in inspector_names_raw.split(",") if name.strip()]
        if not inspectors:
            inspectors = [""]  # En az bir boş müfettiş
        
        # Tüm takımları al
        teams = datastore.get_teams()
        if not teams:
            return jsonify({"error": "Takım bulunamadı"}), 400
        
        try:
            base_datetime = datetime.strptime(f"{start_date} {start_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            return jsonify({"error": "Geçersiz tarih/saat formatı"}), 400
        
        # Mevcut slotları temizle
        if data.get("clear_existing", False):
            datastore.delete_all_inspection_slots()
        
        # Takım numaralarını al ve takım adlarını eşle
        team_list = []
        for t in teams:
            num = t.get("number", "").strip()
            name = t.get("name", "").strip()
            if num:
                team_list.append({"number": num, "name": name})
        
        # Sıralama uygula
        if sort_order == "ascending":
            team_list.sort(key=lambda x: (len(x["number"]), x["number"]))
        elif sort_order == "descending":
            team_list.sort(key=lambda x: (len(x["number"]), x["number"]), reverse=True)
        elif sort_order == "random":
            import random
            random.shuffle(team_list)
        
        created_count = 0
        
        # Her müfettiş için ayrı zaman takibi
        inspector_times = {inspector: base_datetime for inspector in inspectors}
        
        for i, team in enumerate(team_list):
            # Round-robin: Takımları müfettişlere sırayla dağıt
            inspector = inspectors[i % len(inspectors)]
            slot_datetime = inspector_times[inspector]
            
            try:
                datastore.create_inspection_slot(
                    team_number=team["number"],
                    inspection_type="general",  # Tek bir genel tip kullan
                    slot_date=slot_datetime.strftime("%Y-%m-%d"),
                    slot_time=slot_datetime.strftime("%H:%M"),
                    duration_minutes=slot_duration,
                    inspector_name=inspector,
                    status="pending",  # Bekliyor durumunda başla
                    station_name="",
                )
                created_count += 1
                # Bu müfettişin sonraki slot zamanını güncelle
                inspector_times[inspector] = slot_datetime + timedelta(minutes=slot_duration + break_minutes)
            except Exception as e:
                continue
        
        return jsonify({"ok": True, "created_count": created_count, "inspectors": len(inspectors)})