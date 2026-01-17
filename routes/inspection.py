"""
İnceleme route'ları - İnceleme slotları ve ayarları için API endpoint'leri
"""

from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta


def register_inspection_routes(bp, datastore, require_login, require_event_manager):
    """
    İnceleme route'larını Blueprint'e kaydeder.
    
    Args:
        bp: Blueprint instance
        datastore: DataStore instance
        require_login: require_login decorator
        require_event_manager: require_event_manager decorator
    """
    
    @bp.get("/inspection-settings")
    @require_login
    def get_inspection_settings():
        """
        İnceleme ayarlarını getirir (tip süreleri vb.).
        
        Returns:
            JSON: İnceleme ayarları
        """
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
        selected_types = inspection_settings.get("selected_types", ["hardware", "size", "safety"])
        return jsonify({
            "type_durations": type_durations,
            "selected_types": selected_types,
        })

    @bp.post("/inspection-settings")
    @require_login
    @require_event_manager
    def save_inspection_settings():
        """
        İnceleme ayarlarını kaydeder (tip süreleri vb.).
        
        Request body:
            {
                "type_durations": {
                    "hardware": 20,
                    "size": 10,
                    "safety": 15,
                    ...
                }
            }
        
        Returns:
            JSON: Başarı durumu
        """
        data = request.get_json(force=True) or {}
        type_durations = data.get("type_durations", {})
        selected_types = data.get("selected_types", [])
        
        # Event data'yı güncelle
        event_data = datastore.get_event()
        if "inspection_settings" not in event_data:
            event_data["inspection_settings"] = {}
        event_data["inspection_settings"]["type_durations"] = type_durations
        if selected_types:
            event_data["inspection_settings"]["selected_types"] = selected_types
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
        
        # Çakışma kontrolü
        duration_minutes = data.get("duration_minutes", 15)
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

    @bp.put("/inspection-slots/<int:slot_id>")
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
            duration_minutes = data.get("duration_minutes", current_slot["duration_minutes"])
            
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
                duration_minutes=data.get("duration_minutes"),
                inspector_name=data.get("inspector_name"),
                status=data.get("status"),
                notes=data.get("notes"),
                station_name=data.get("station_name"),
            )
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
