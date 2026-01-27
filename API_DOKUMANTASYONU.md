# MEMSKOR - API Dokümantasyonu

Bu dokümantasyon MEMSKOR'un tüm API endpoint'lerini içerir.

## 🔐 Kimlik Doğrulama

Çoğu endpoint kimlik doğrulama gerektirir. Session cookie kullanılır.

**Hata Kodları:**
- `401 Unauthorized` - Giriş yapılmamış
- `403 Forbidden` - Yetki yetersiz

## 📋 Endpoint Kategorileri

1. [Etkinlik Yönetimi](#etkinlik-yönetimi)
2. [Takım Yönetimi](#takım-yönetimi)
3. [Kullanıcı Yönetimi](#kullanıcı-yönetimi)
4. [Maç Kontrol Sistemi](#maç-kontrol-sistemi) ⭐
5. [Hakem Paneli](#hakem-paneli) ⭐
6. [İnceleme Programı](#inceleme-programı)
7. [Deneme Maçları](#deneme-maçları)
8. [Resmi Maç Takvimi](#resmi-maç-takvimi)
9. [WiFi Kanal Atama](#wifi-kanal-atama)
10. [Arşiv Yönetimi](#arşiv-yönetimi)

---

## Etkinlik Yönetimi

### `GET /api/events`
Tüm etkinlikleri listeler.

**Yetki:** `@require_login`

**Response:**
```json
[
  {
    "id": 1,
    "name": "İstanbul Şampiyonası",
    "code": "ISTB",
    "season": "2025-2026",
    ...
  }
]
```

### `POST /api/events`
Yeni etkinlik oluşturur.

**Yetki:** `@require_admin`

**Request:**
```json
{
  "name": "Yeni Etkinlik",
  "code": "NEW",
  "season": "2025-2026"
}
```

### `DELETE /api/events/<id>`
Etkinlik siler.

**Yetki:** `@require_admin`

### `POST /api/events/active`
Aktif etkinliği değiştirir.

**Yetki:** `@require_admin`

**Request:**
```json
{
  "id": 1
}
```

### `GET /api/event`
Aktif etkinlik bilgilerini getirir.

**Yetki:** `@require_login`

### `POST /api/event`
Etkinlik bilgilerini kaydeder.

**Yetki:** `@require_event_manager`

---

## Takım Yönetimi

### `GET /api/teams`
Takımları listeler.

**Yetki:** `@require_login`

### `POST /api/teams`
Takımları kaydeder (toplu).

**Yetki:** `@require_event_manager`

**Request:**
```json
{
  "teams": [
    {
      "number": "202501",
      "name": "Takım Adı",
      "school": "Okul Adı",
      ...
    }
  ]
}
```

---

## Kullanıcı Yönetimi

### `GET /api/users`
Kullanıcıları listeler.

**Yetki:** `@require_admin`

### `POST /api/users`
Yeni kullanıcı oluşturur.

**Yetki:** `@require_admin`

### `POST /api/users/delete`
Kullanıcı siler.

**Yetki:** `@require_admin`

### `POST /api/users/defaults`
Varsayılan rol kullanıcılarını oluşturur.

**Yetki:** `@require_admin`

---

## Maç Kontrol Sistemi ⭐

### `GET /match-control`
Maç kontrol sayfasını render eder.

**Yetki:** `@require_login`

### `GET /api/match-control/active`
Aktif maç bilgisini getirir.

**Yetki:** `@require_login`

**Response:**
```json
{
  "match": {
    "id": 1,
    "match_number": 1,
    "match_type": "qualification",
    "red_alliance": ["202501", "202502"],
    "blue_alliance": ["202503", "202504"],
    "current_state": "autonomous",
    "time_remaining": 25,
    ...
  }
}
```

### `POST /api/match-control/start`
Maçı başlatır.

**Yetki:** `@require_event_manager`

**Request:**
```json
{
  "match_id": 1
}
```

**Not:** Aynı anda sadece bir maç aktif olabilir.

### `POST /api/match-control/stop`
Maçı durdurur.

**Yetki:** `@require_event_manager`

### `POST /api/match-control/preview`
Maçı önizleme durumuna alır (DB status değişmez, hakem tabletleri için).

**Yetki:** `@require_event_manager`

**Request:**
```json
{
  "match_id": 1,
  "match_source": "schedule"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Not:** Aktif maç varken önizleme yapılamaz (409 Conflict).

### `POST /api/match-control/complete`
Maçı tamamlar ve skorları kaydeder.

**Yetki:** `@require_event_manager`

**Request:**
```json
{
  "match_id": 1,
  "red_score": 45,
  "blue_score": 38,
  "match_source": "schedule"
}
```

### `POST /api/match-control/state`
Maç durumunu günceller (autonomous → driver_controlled vb.).

**Yetki:** `@require_event_manager`

**Request:**
```json
{
  "match_id": 1,
  "new_state": "driver_controlled"
}
```

### `POST /api/match-control/score`
Basit skor güncelleme (geriye dönük uyumluluk).

**Yetki:** `@require_event_manager`

**Request:**
```json
{
  "match_id": 1,
  "red_score": 45,
  "blue_score": 38
}
```

### `POST /api/match-control/score/detailed` ⭐
Detaylı puanlama verilerini günceller (modüler puanlama sistemi).

**Yetki:** `@require_login`

**Request:**
```json
{
  "match_id": 1,
  "alliance": "red",
  "scoring_data": {
    "auto_leave_r1": true,
    "auto_leave_r2": false,
    "auto_bent1_own": 5,
    "auto_bent2_correct": 3,
    ...
  }
}
```

**Response:**
```json
{
  "ok": true,
  "calculated_score": 45,
  "breakdown": {
    "autonomous": {...},
    "teleop": {...},
    "penalties": {...}
  }
}
```

### `GET /api/match-control/score/realtime/<match_id>` ⭐
**KALDIRILDI** - WebSocket kullanın (`/match` namespace, `subscribe_match` event).

**NOT:** Bu endpoint kaldırıldı. WebSocket kullanın.
data: {"type": "update", "scores": {...}}
```

### `GET /api/match-control/next-match`
Sıradaki maçı getirir.

**Yetki:** `@require_login`

### `GET /api/match-control/audience-display`
Audience display için canlı maç bilgisi (kimlik doğrulama gerektirmez).

---

## Hakem Paneli ⭐

### `GET /referee/red`
Kırmızı İttifak Hakemi sayfası.

**Yetki:** `@require_login`

### `GET /referee/blue`
Mavi İttifak Hakemi sayfası.

**Yetki:** `@require_login`

### `GET /head-referee`
Baş Hakem sayfası (maç kontrol ekranına gitmez).

**Yetki:** `@require_login`

### `GET /referee-panel`
Genel hakem paneli sayfası (geriye dönük uyumluluk).

**Yetki:** `@require_login`

**URL Parametreleri:**
- `?alliance=red` - Kırmızı ittifak için
- `?alliance=blue` - Mavi ittifak için

### `GET /api/referee/active-match`
Aktif maç bilgisini getirir (match-control ile senkronize).

**Yetki:** `@require_login`

**Response:**
```json
{
  "match": {
    "id": 1,
    "match_number": 1,
    "match_type": "qualification",
    "match_source": "schedule",
    "field_number": 1,
    "red_alliance": ["202501", "202502"],
    "blue_alliance": ["202503", "202504"],
    "status": "in_progress"
  }
}
```

### `POST /api/referee/score/update`
Hakemden gelen puanlama verilerini günceller.

**Yetki:** `@require_login`

**Request:**
```json
{
  "match_id": 1,
  "alliance": "red",
  "match_source": "schedule",
  "scoring_data": {
    "auto_leave_r1": true,
    "auto_bent1_own": 5,
    ...
  }
}
```

**Response:**
```json
{
  "ok": true,
  "calculated_score": 45,
  "breakdown": {...},
  "alliance": "red",
  "updated_by": "hakem_1"
}
```

### `GET /api/referee/score/get/<match_id>`
Bir maçın mevcut skorlarını ve hakem meta bilgisini getirir.

**Yetki:** `@require_login`

**Query Parameters:**
- `?source=schedule` veya `?source=practice` - Maç kaynağı

**Response:**
```json
{
  "red": {
    "scoring_data": {...},
    "calculated_score": 45,
    "breakdown": {...}
  },
  "blue": {
    "scoring_data": {...},
    "calculated_score": 38,
    "breakdown": {...}
  },
  "referee_meta": {
    "red": {
      "submitted": true,
      "submitted_at": "2026-01-18T22:30:00",
      "submitted_by": "hakem_1",
      "last_updated": "2026-01-18T22:30:00"
    },
    "blue": {
      "submitted": true,
      "submitted_at": "2026-01-18T22:31:00",
      "submitted_by": "hakem_2",
      "last_updated": "2026-01-18T22:31:00"
    },
    "head": {
      "approved": true,
      "approved_at": "2026-01-18T22:32:00",
      "approved_by": "bas_hakem",
      "last_updated": "2026-01-18T22:32:00"
    }
  },
  "last_updated": "2026-01-18T22:32:00",
  "updated_by": "hakem_1"
}
```

### `POST /api/referee/submit`
Hakem girişini tamamlar (submit durumunu işaretler).

**Yetki:** `@require_login`

**Request:**
```json
{
  "match_id": 1,
  "alliance": "red",
  "match_source": "schedule"
}
```

**Response:**
```json
{
  "ok": true,
  "referee_meta": {...}
}
```

**Not:** Hakem yeni değişiklik yaparsa submit durumu otomatik `false` olur.

### `POST /api/referee/approve`
Baş hakem maç sonuçlarını onaylar.

**Yetki:** `@require_login`

**Request:**
```json
{
  "match_id": 1,
  "match_source": "schedule"
}
```

**Response:**
```json
{
  "ok": true,
  "referee_meta": {...}
}
```

**Hata Durumları:**
- `409 Conflict`: Her iki hakem de girişlerini tamamlamamışsa

---

## İnceleme Programı

### `GET /api/inspection-slots`
İnceleme slotlarını listeler.

**Yetki:** `@require_login`

### `POST /api/inspection-slots`
Yeni inceleme slotu oluşturur.

**Yetki:** `@require_event_manager`

### `POST /api/inspection-slots/generate`
Otomatik inceleme programı oluşturur.

**Yetki:** `@require_event_manager`

---

## Deneme Maçları

### `GET /api/practice-matches`
Deneme maçlarını listeler.

**Yetki:** `@require_login`

### `POST /api/practice-matches/generate`
Otomatik deneme maç takvimi oluşturur.

**Yetki:** `@require_event_manager`

---

## Resmi Maç Takvimi

### `GET /api/match-schedule`
Resmi maçları listeler.

**Yetki:** `@require_login`

### `POST /api/match-schedule/generate`
Otomatik resmi maç takvimi oluşturur.

**Yetki:** `@require_event_manager`

---

## WiFi Kanal Atama

### `GET /api/wifi-channels`
WiFi kanal atamalarını listeler.

**Yetki:** `@require_login`

### `POST /api/wifi-channels/assign`
WiFi kanalları atar.

**Yetki:** `@require_event_manager`

---

## Arşiv Yönetimi

### `GET /api/archive/download`
Proje verilerini ZIP olarak indirir.

**Yetki:** `@require_event_manager`

### `POST /api/archive/upload`
ZIP arşivini yükler ve verileri geri yükler.

**Yetki:** `@require_event_manager`

---

## Hata Yönetimi

Tüm endpoint'ler standart HTTP status kodları kullanır:

- `200 OK` - Başarılı
- `400 Bad Request` - Geçersiz istek
- `401 Unauthorized` - Kimlik doğrulama gerekli
- `403 Forbidden` - Yetki yetersiz
- `404 Not Found` - Kaynak bulunamadı
- `409 Conflict` - Çakışma (örn: aynı anda iki maç başlatma)
- `500 Internal Server Error` - Sunucu hatası

**Hata Response Formatı:**
```json
{
  "error": "Hata mesajı"
}
```

---

## Gerçek Zamanlı Güncellemeler

Maç kontrol sistemi **WebSocket** kullanarak gerçek zamanlı güncellemeler sağlar. 
SSE endpoint'leri kaldırıldı - tüm sistem WebSocket kullanıyor.

### WebSocket Kullanımı (Önerilen)

**Namespace: `/match`** - Maç durumu ve skor güncellemeleri için

```javascript
// Socket.IO bağlantısı oluştur
const socket = io("/match", {
  transports: ["websocket", "polling"],
  reconnection: true
});

// Maça abone ol
socket.emit("subscribe_match", {
  match_id: 1,
  match_source: "schedule"  // veya "practice"
});

// Maç durumu güncellemesi (timer senkronizasyonu için server_timestamp içerir)
socket.on("match_state", (data) => {
  const match = data.match;
  if (match && match.server_timestamp) {
    // Timer senkronizasyonu için server_timestamp kullan
    const serverTime = match.server_timestamp * 1000;
    const clientTime = Date.now();
    const timeOffset = clientTime - serverTime;
    // Timer'ı güncelle (timeOffset ile senkronize)
  }
});

// Skor güncellemesi
socket.on("scores", (data) => {
  const scores = data.scores;
  // Skorları güncelle
});

// Abonelikten çık
socket.emit("unsubscribe_match", {});
socket.disconnect();
```

**Namespace: `/audience`** - Seyirci ekranları için

```javascript
// Socket.IO bağlantısı oluştur
const socket = io("/audience", {
  transports: ["websocket", "polling"],
  query: {
    screen_id: "unique-screen-id"
  }
});

// Audience güncellemelerine abone ol
socket.emit("subscribe_audience", {
  screen_id: "unique-screen-id"
});

// Maç güncellemesi
socket.on("match_update", (data) => {
  const match = data.match;
  // Maç bilgilerini güncelle (server_timestamp ile timer senkronizasyonu)
});

// Skor güncellemesi
socket.on("scores_update", (data) => {
  const scores = data.scores;
  // Skorları güncelle
});
```

### SSE Kullanımı (Kaldırıldı)

SSE endpoint'leri kaldırıldı. Tüm sistem WebSocket kullanıyor.  
**NOT:** Timer senkronizasyonu için WebSocket kullanılması zorunludur (server_timestamp desteği ile).

---

**Son Güncelleme:** 2025-01-XX  
**Versiyon:** 1.0.0
