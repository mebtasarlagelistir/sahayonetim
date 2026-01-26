# Sistem Durumları ve Maç Durumları - Kapsamlı Liste

## 📋 İçindekiler

1. [Maç Status Değerleri (Veritabanı)](#maç-status-değerleri)
2. [Maç State Değerleri (Maç İçi Durumlar)](#maç-state-değerleri)
3. [İnceleme Status Değerleri](#inceleme-status-değerleri)
4. [Sistem Durumları](#sistem-durumları)
5. [Durum Geçişleri](#durum-geçişleri)

---

## 1. Maç Status Değerleri (Veritabanı)

Bu değerler veritabanında (`match_schedule` ve `practice_matches` tablolarında) saklanır.

### 1.1. `scheduled` (Planlanmış)
- **Açıklama:** Maç planlanmış ama henüz başlamamış
- **Varsayılan Değer:** Yeni oluşturulan maçlar için varsayılan durum
- **Kullanım Yerleri:**
  - Maç oluşturulduğunda
  - Maç durdurulduğunda (`stop_match`)
  - Maç tamamlandıktan sonra tekrar planlanabilir
- **Veritabanı:** `status = 'scheduled'`
- **Backend:** `src/core/storage/match_schedule.py`, `src/core/storage/practice_matches.py`

### 1.2. `in_progress` (Devam Ediyor)
- **Açıklama:** Maç aktif olarak oynanıyor
- **Kullanım Yerleri:**
  - Maç başlatıldığında (`start_match`)
  - Maç sırasında timer çalışırken
- **Veritabanı:** `status = 'in_progress'`
- **Backend:** `src/core/match_state.py` - `set_match_active()`
- **Özellikler:**
  - Memory cache'de tutulur (`MatchStateManager`)
  - Timer aktif
  - SSE güncellemeleri gönderilir

### 1.3. `completed` (Tamamlandı)
- **Açıklama:** Maç tamamlandı ve skorlar kaydedildi
- **Kullanım Yerleri:**
  - Maç tamamlandığında (`complete_match`)
  - Skorlar veritabanına kaydedildiğinde
- **Veritabanı:** `status = 'completed'`
- **Backend:** `routes/match_control.py` - `complete_match()`
- **Özellikler:**
  - Skorlar kalıcı olarak kaydedilir
  - Memory cache'den kaldırılır
  - Tekrar başlatılamaz (yeni maç oluşturulmalı)

### 1.4. `preview` (Önizleme) ⚠️ ÖZEL
- **Açıklama:** Maç seçilmiş ama henüz başlatılmamış (sadece görüntüleme için)
- **ÖNEMLİ:** Bu durum **sadece memory cache'de** tutulur, **veritabanında saklanmaz**
- **Kullanım Yerleri:**
  - Match control sayfasında maç seçildiğinde
  - Hakem panellerinde görüntülenmek için
- **Backend:** `src/core/match_state.py` - `set_match_preview()`
- **Özellikler:**
  - Geçici durum (sunucu yeniden başlatıldığında kaybolur)
  - Aktif maç varsa, `get_active_match()` önce aktif maçı döndürür
  - Aktif maç yoksa, preview maç görünür
- **Öncelik:** `in_progress` > `preview`

---

## 2. Maç State Değerleri (Maç İçi Durumlar)

Bu değerler maç sırasında timer ve aşamaları yönetir. `current_state` alanında saklanır.

### 2.1. `idle` (Beklemede)
- **Açıklama:** Maç başlamamış veya durdurulmuş
- **Süre:** 0 saniye
- **Renk:** `#666` (Gri)
- **Kullanım:**
  - Maç seçildiğinde ama başlatılmadığında
  - Maç durdurulduğunda
  - Maç tamamlandığında
- **Frontend:** `static/js/match_control_core.js` - `MATCH_STATES.idle`

### 2.2. `autonomous` (Otonom)
- **Açıklama:** Otonom dönem (robotlar otomatik çalışır)
- **Süre:** 30 saniye (varsayılan)
- **Renk:** `#f44336` (Kırmızı)
- **Kullanım:**
  - Maç başlatıldığında ilk durum
  - Timer otomatik olarak bu durumdan başlar
- **Backend:** `src/core/constants.py` - `AUTONOMOUS_DURATION = 30`
- **Frontend:** `static/js/match_control_core.js` - `MATCH_STATES.autonomous`

### 2.3. `prepare_teleop` (Teleop Hazırlık)
- **Açıklama:** Otonom ve Teleop arası hazırlık dönemi
- **Süre:** 5 saniye (varsayılan)
- **Renk:** `#ff9800` (Turuncu)
- **Kullanım:**
  - Otonom süresi bittiğinde otomatik geçiş
  - Sürücüler kontrol ünitelerini hazırlar
- **Backend:** `src/core/constants.py` - `PREPARE_TELEOP_DURATION = 5`
- **Frontend:** `static/js/match_control_core.js` - `MATCH_STATES.prepare_teleop`

### 2.4. `driver_controlled` (Sürücü Kontrollü)
- **Açıklama:** Sürücüler robotları manuel kontrol eder
- **Süre:** 120 saniye (varsayılan)
- **Renk:** `#2196f3` (Mavi)
- **Kullanım:**
  - Teleop hazırlık süresi bittiğinde otomatik geçiş
  - En uzun maç aşaması
- **Backend:** `src/core/constants.py` - `DRIVER_CONTROLLED_DURATION = 120`
- **Frontend:** `static/js/match_control_core.js` - `MATCH_STATES.driver_controlled`

### 2.5. `end_game` (Oyun Sonu)
- **Açıklama:** Maçın son aşaması (genellikle özel görevler)
- **Süre:** 30 saniye (varsayılan)
- **Renk:** `#9c27b0` (Mor)
- **Kullanım:**
  - Sürücü kontrollü süre bittiğinde otomatik geçiş
  - Son puan fırsatları
- **Backend:** `src/core/constants.py` - `END_GAME_DURATION = 30`
- **Frontend:** `static/js/match_control_core.js` - `MATCH_STATES.end_game`

### 2.6. `post_match` (Maç Sonrası)
- **Açıklama:** Maç bitti, son kontroller ve skor hesaplama
- **Süre:** 10 saniye (varsayılan)
- **Renk:** `#607d8b` (Gri-Mavi)
- **Kullanım:**
  - Oyun sonu süresi bittiğinde otomatik geçiş
  - Skorlar hesaplanır ve kaydedilir
- **Backend:** `src/core/constants.py` - `POST_MATCH_DURATION = 10`
- **Frontend:** `static/js/match_control_core.js` - `MATCH_STATES.post_match`

### 2.7. `completed` (Tamamlandı)
- **Açıklama:** Maç tamamen bitti, tüm işlemler tamamlandı
- **Süre:** 0 saniye
- **Renk:** `#4caf50` (Yeşil)
- **Kullanım:**
  - Post-match süresi bittiğinde otomatik geçiş
  - Veya manuel olarak "Maçı Tamamla" butonu ile
- **Frontend:** `static/js/match_control_core.js` - `MATCH_STATES.completed`

### State Geçiş Sırası

```
idle → autonomous → prepare_teleop → driver_controlled → end_game → post_match → completed
```

**Otomatik Geçişler:**
- Timer süresi dolduğunda otomatik olarak bir sonraki state'e geçer
- `nextMatchState()` fonksiyonu ile manuel geçiş de yapılabilir

---

## 3. İnceleme Status Değerleri

İnceleme slotları için kullanılan durumlar (`inspection_slots` tablosunda).

### 3.1. `scheduled` (Planlanmış)
- **Açıklama:** İnceleme planlanmış ama henüz yapılmamış
- **Varsayılan Değer:** Yeni oluşturulan inceleme slotları için
- **Veritabanı:** `status = 'scheduled'`
- **Backend:** `src/core/storage/inspection.py`

### 3.2. `completed` (Tamamlandı)
- **Açıklama:** İnceleme tamamlandı
- **Kullanım:** İnceleme yapıldığında
- **Veritabanı:** `status = 'completed'`
- **Backend:** `src/core/storage/inspection.py`

### 3.3. `passed` (Geçti) ⚠️ OPSİYONEL
- **Açıklama:** İnceleme geçildi (kod içinde referans var ama aktif kullanım belirsiz)
- **Not:** Kod içinde referans var ama aktif kullanımı kontrol edilmeli

### 3.4. `failed` (Başarısız) ⚠️ OPSİYONEL
- **Açıklama:** İnceleme başarısız oldu (kod içinde referans var ama aktif kullanım belirsiz)
- **Not:** Kod içinde referans var ama aktif kullanımı kontrol edilmeli

---

## 4. Sistem Durumları

### 4.1. MatchStateManager Durumları

**Memory Cache Durumları:**
- `in_progress` - Aktif maç (en yüksek öncelik)
- `preview` - Önizleme maç (düşük öncelik)

**Öncelik Sırası:**
1. `in_progress` maçlar (önce kontrol edilir)
2. `preview` maçlar (aktif maç yoksa görünür)

**Backend:** `src/core/match_state.py` - `get_active_match()`

### 4.2. SSE Update Types

**Güncelleme Tipleri:**
- `preview` - Preview maç eklendi/güncellendi
- `active` - Maç aktif duruma alındı
- `state_update` - Maç state'i güncellendi
- `completed` - Maç tamamlandı
- `stopped` - Maç durduruldu

**Backend:** `src/core/match_state.py` - `_broadcast_update()`

---

## 5. Durum Geçişleri

### 5.1. Maç Status Geçişleri

```
scheduled → in_progress → completed
     ↑           ↓
     └───────────┘ (stop_match ile geri döner)

preview → in_progress → completed
   ↑           ↓
   └───────────┘ (stop_match ile scheduled'a döner)
```

### 5.2. Maç State Geçişleri (in_progress sırasında)

```
idle → autonomous → prepare_teleop → driver_controlled → end_game → post_match → completed
```

**Otomatik Geçişler:**
- Timer süresi dolduğunda otomatik geçiş
- `refresh_match_state()` fonksiyonu ile kontrol edilir

**Manuel Geçişler:**
- "Sonraki Aşama" butonu ile (`nextMatchState()`)

### 5.3. Preview Geçişleri

```
scheduled → preview → in_progress → completed
```

**Not:** Preview durumu sadece memory'de tutulur, veritabanına yazılmaz.

---

## 6. Özet Tablo

### Maç Status Değerleri

| Status | Açıklama | Veritabanı | Memory Cache | Öncelik |
|--------|----------|------------|--------------|---------|
| `scheduled` | Planlanmış | ✅ | ❌ | - |
| `in_progress` | Devam Ediyor | ✅ | ✅ | 1 (En Yüksek) |
| `completed` | Tamamlandı | ✅ | ❌ | - |
| `preview` | Önizleme | ❌ | ✅ | 2 (Düşük) |

### Maç State Değerleri

| State | Açıklama | Süre (sn) | Renk | Otomatik Geçiş |
|-------|----------|-----------|------|-----------------|
| `idle` | Beklemede | 0 | #666 | ❌ |
| `autonomous` | Otonom | 30 | #f44336 | ✅ |
| `prepare_teleop` | Teleop Hazırlık | 5 | #ff9800 | ✅ |
| `driver_controlled` | Sürücü Kontrollü | 120 | #2196f3 | ✅ |
| `end_game` | Oyun Sonu | 30 | #9c27b0 | ✅ |
| `post_match` | Maç Sonrası | 10 | #607d8b | ✅ |
| `completed` | Tamamlandı | 0 | #4caf50 | ✅ |

---

## 7. Dosya Konumları

### Backend
- **Constants:** `src/core/constants.py`
- **Match State Manager:** `src/core/match_state.py`
- **Storage:** `src/core/storage/match_schedule.py`, `src/core/storage/practice_matches.py`
- **Routes:** `routes/match_control.py`

### Frontend
- **Constants:** `static/js/constants.js`
- **Match Control Core:** `static/js/match_control_core.js`
- **Match Control Operations:** `static/js/match_control_operations.js`
- **Match Control Timer:** `static/js/match_control_timer.js`

---

## 8. Önemli Notlar

1. **Preview Durumu:**
   - Sadece memory cache'de tutulur
   - Sunucu yeniden başlatıldığında kaybolur
   - Veritabanına yazılmaz

2. **Status vs State:**
   - **Status:** Maçın genel durumu (scheduled, in_progress, completed)
   - **State:** Maç içi aşamalar (autonomous, driver_controlled, vb.)

3. **Öncelik Sistemi:**
   - `get_active_match()` önce `in_progress` maçları kontrol eder
   - Aktif maç yoksa `preview` maçları kontrol eder
   - Bu sayede hakem panelleri ve seyirci ekranları her zaman doğru maçı görür

4. **Otomatik Geçişler:**
   - Timer süresi dolduğunda otomatik state geçişi yapılır
   - `refresh_match_state()` fonksiyonu ile kontrol edilir
   - Post-match bittiğinde maç otomatik olarak `completed` durumuna geçer

---

**Son Güncelleme:** 2026-01-22
**Versiyon:** 1.0
