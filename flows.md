# Inspection Module - Phase 1: FRC Enhancement Flow

## Strategic Flow Plan

### Problem Definition
**What:** Mevcut inspection modülü temel tiplere sahip (hardware, size, safety, software, weight, custom). FRC yarışmalarına özel daha detaylı inceleme kategorileri ve checklist sistemi eklenmeli.

**Why:** FRC yarışmaları katı kurallara sahip. Her robot kategori bazlı detaylı inceleme geçmelidir. Mevcut sistem genel amaçlı, FRC'nin özel ihtiyaçlarını karşılamıyor.

**Success Criteria:**
1. ✅ 10 FRC-specific inspection type tanımlanmalı
2. ✅ Her inspection type için checklist template'i olmalı
3. ✅ Checklist durumu (pass/fail/na) kaydedilmeli
4. ✅ Durum renklendirmesi görünmeli (yeşil/sarı/kırmızı)
5. ✅ Print/export checklist içermeli
6. ✅ Backward compatibility (mevcut veriler bozulmamalı)

---

## User Flow Map

### Flow 1: Inspection Settings Configuration
```
1. Admin/Event Manager → Setup → İnceleme Programı
2. "İnceleme Tipi Süreleri" bölümünde 10 FRC tipi görür:
   - Weight (Ağırlık) ⚖️
   - Size (Boyut) 📏
   - General Hardware (Genel Donanım) 🔧
   - Electrical (Elektrik) ⚡
   - Pneumatics (Pnömatik - opsiyonel) 💨
   - Radio/Communication (Radio/İletişim) 📡
   - Software/Control (Yazılım) 💻
   - Bumpers (Tamponlar) 🛡️
   - Game-Specific (Oyuna Özel) 🎮
   - Safety (Güvenlik) ⚠️
3. Her tip için:
   - Checkbox (aktif/pasif)
   - Süre ayarı (dakika)
   - Checklist template seçimi (dropdown - gelecek özellik)
4. "Süreleri Kaydet" → Backend'e POST /api/inspection-settings
5. Ayarlar event.inspection_settings altına kaydedilir
```

### Flow 2: Automatic Schedule Generation with FRC Types
```
1. Admin → "Otomatik Takvim Oluştur" butonu
2. Seçili FRC tipleri için (checkbox işaretli olanlar) slot oluşturulur
3. Backend algorithm:
   - Her takım için seçili tiplerin hepsi oluşturulur
   - Sıralama: Önce Weight → Size → Electrical → ... (priority order)
   - Her slot için checklist_data başlatılır (boş template)
4. Slotlar DB'ye kaydedilir (inspection_slots tablosu)
```

### Flow 3: Inspector Conducts Inspection (Checklist)
```
1. Inspector → İnceleme Programı sayfası
2. Grid veya Liste görünümünde slot seçer
3. Slot satırına tıklayınca "Checklist" modal açılır:
   - Inspection type'a özel checklist items gösterilir
   - Her item için: [ ] checkbox, notes input, Pass/Fail/N/A butonları
4. Inspector işaretler:
   - Pass (✓) → Yeşil
   - Fail (✗) → Kırmızı
   - N/A (—) → Gri
5. "Kaydet" → Backend'e PUT /api/inspection-slots/<id>
   - checklist_data JSON olarak notes alanına kaydedilir
6. Slot durumu otomatik güncellenir:
   - Tüm items PASS → status: "passed" (yeşil)
   - En az 1 FAIL → status: "failed" (kırmızı)
   - PASS + bazı N/A → status: "passed_with_conditions" (sarı)
```

### Flow 4: Status Color Coding
```
1. Liste görünümü:
   - Status dropdown'ında seçilen değere göre row arka plan rengi
   - scheduled → Varsayılan (beyaz/açık gri)
   - in_progress → Mavi
   - passed → Yeşil
   - passed_with_conditions → Sarı
   - failed → Açık kırmızı
   - pending_reinspection → Turuncu
   - cancelled, no_show → Gri
2. Grid görünümü:
   - Cell background color aynı mantıkla değişir
```

### Flow 5: Print Schedule with Checklist
```
1. Admin → "🖨️ Yazdır" butonu
2. Backend:
   - Slot listesi alınır
   - Her slot için checklist_data parse edilir
3. Print window:
   - Slot tablosu (team, type, date, time, status)
   - Her slot için checklist summary (pass/fail count)
   - Detaylı checklist (opsiyonel toggle)
4. Browser print dialog → PDF/Printer
```

---

## Data Model Changes

### inspection_slots Table (No Schema Change)
```sql
-- Mevcut şema yeterli, sadece notes alanı JSON olarak kullanılacak
notes TEXT -- JSON format: {"checklist": [...], "general_notes": "..."}
```

### Checklist Data Structure (JSON in notes field)
```json
{
  "checklist": [
    {
      "id": "weight_robot",
      "category": "weight",
      "label": "Robot weight with battery ≤ 56.7 kg",
      "status": "pass",  // pass, fail, na, pending
      "notes": "55.2 kg measured",
      "checked_by": "Inspector 1",
      "checked_at": "2026-01-30T10:15:00Z"
    },
    {
      "id": "size_starting",
      "category": "size",
      "label": "Starting configuration within 120\" perimeter",
      "status": "pass",
      "notes": "",
      "checked_by": "Inspector 1",
      "checked_at": "2026-01-30T10:16:00Z"
    }
  ],
  "general_notes": "All inspections passed. Team ready for competition.",
  "overall_status": "passed"  // passed, failed, passed_with_conditions
}
```

---

## API Changes

### Existing Endpoints (Extended)
```
POST /api/inspection-settings
  Request body (NEW fields):
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
      "selected_types": ["weight", "size", "electrical", ...],
      "checklist_templates": {  // NEW
        "weight": "frc_weight_default",
        "size": "frc_size_default",
        ...
      }
    }

PUT /api/inspection-slots/<id>
  Request body (NEW field):
    {
      "notes": "{\"checklist\": [...], \"general_notes\": \"...\"}",  // JSON string
      "status": "passed"  // Auto-calculated from checklist
    }
```

### New Endpoints (Optional - Phase 2)
```
GET /api/inspection-slots/<id>/checklist
  Returns parsed checklist data

POST /api/inspection-slots/<id>/checklist
  Updates checklist items
```

---

## UI Component Changes

### 1. Inspection Type Checkboxes
**File:** `templates/setup/step_inspection_schedule.html`
- Expand from 6 types to 10 types
- Add icons for each type
- Show optional badge for pneumatics

### 2. Checklist Modal
**New Component:** `static/js/inspection_checklist.js`
- Modal dialog (overlay)
- Accordion sections (per category)
- Pass/Fail/N/A buttons
- Notes textarea
- Save button

### 3. Status Color Coding
**File:** `static/js/inspection.js`
- Update `loadInspectionSlots()` function
- Add CSS classes for status colors
- Update `renderInspectionGrid()` for grid view

### 4. Print Template
**File:** `static/js/inspection.js` → `printInspectionSchedule()`
- Include checklist summary
- Show pass/fail/na counts
- Optional detailed checklist

---

## Implementation Priority

### Critical (Day 1)
1. ✅ Add 10 FRC inspection types to UI
2. ✅ Extend inspection_settings storage
3. ✅ Checklist JSON structure definition
4. ✅ Status color coding

### Important (Day 2)
5. ✅ Checklist modal UI
6. ✅ Checklist CRUD operations
7. ✅ Print template update

### Nice-to-Have (Day 3+)
8. ⭐ Checklist templates (predefined)
9. ⭐ Bulk checklist operations
10. ⭐ Inspector signature field
