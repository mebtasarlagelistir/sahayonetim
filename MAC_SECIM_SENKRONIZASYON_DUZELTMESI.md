# Maç Seçim Senkronizasyon Düzeltmesi

## 🔍 Tespit Edilen Sorun

**Problem:** Admin maç kontrol sayfasından takvimden maç seçildiğinde (örneğin deneme maçı), yeni maçın tüm sistemde yüklendiğinden emin olunmuyordu. Kullanıcı deneme maçı seçiyor ama sonra sıralama maç 1 aktif oluyor ve hakem panelleri/seyrci ekranları sıralama maç 1'i görüyor.

## 🔧 Yapılan Düzeltmeler

### 1. Preview Endpoint Düzeltmesi ✅

**Dosya:** `routes/match_control.py`

**Sorun:** Preview endpoint'i aktif maç varken preview yapılmasına izin vermiyordu (409 hatası).

**Çözüm:**
- Aktif maç varsa bile preview yapılabilir hale getirildi
- `get_active_match` önce `in_progress` maçı döndürür, sonra `preview` maçı
- Bu sayede:
  - Match control sayfasında seçilen maç preview olarak görünür
  - Hakem panelleri ve seyirci ekranları aktif maçı görmeye devam eder (öncelik `in_progress`'te)

**Değişiklik:**
```python
# ÖNCE:
if active_match and active_match.get("status") == "in_progress":
    return jsonify({"error": "Aktif maç varken önizleme yapılamaz"}), 409

# SONRA:
# Aktif maç varsa bile preview yapılabilir
# get_active_match önce in_progress maçı döndürür, sonra preview'ı
```

### 2. selectMatch Fonksiyonu İyileştirmesi ✅

**Dosya:** `static/js/match_control_data.js`

**Sorun:** `selectMatch` fonksiyonu maç seçildiğinde, aktif maç varsa preview yapmıyordu.

**Çözüm:**
- Her zaman preview yapılır (aktif maç varsa bile)
- Preview başarılı olduktan sonra backend'den güncel durum alınır
- Eğer seçilen maç preview durumundaysa, `currentMatch` güncellenir

**Değişiklik:**
```javascript
// ÖNCE:
const activeData = await apiGet("/api/match-control/active");
if (!activeData.match || activeData.match.status !== "in_progress") {
  await apiPost("/api/match-control/preview", {...});
}

// SONRA:
await apiPost("/api/match-control/preview", {...});
// Preview başarılı oldu, backend'den güncel durumu al
const activeData = await apiGet("/api/match-control/active");
if (activeData.match && activeData.match.id === matchId && activeData.match.status === "preview") {
  currentMatch = activeData.match;
  // ...
}
```

### 3. selectPracticeMatch Fonksiyonu İyileştirmesi ✅

**Dosya:** `static/js/match_control_data.js`

**Sorun:** `selectPracticeMatch` fonksiyonu preview yapmıyordu.

**Çözüm:**
- `selectPracticeMatch` fonksiyonu da `selectMatch` gibi preview yapıyor
- Async hale getirildi
- Preview başarılı olduktan sonra backend'den güncel durum alınıyor

**Değişiklik:**
```javascript
// ÖNCE:
function selectPracticeMatch(match) {
  // Preview yapılmıyordu
}

// SONRA:
async function selectPracticeMatch(match) {
  // ... mevcut kod ...
  if (match.status !== "in_progress") {
    await apiPost("/api/match-control/preview", {...});
    // Preview başarılı oldu, backend'den güncel durumu al
    // ...
  }
}
```

### 4. set_match_preview İyileştirmesi ✅

**Dosya:** `src/core/match_state.py`

**Sorun:** Preview maç eklendiğinde önceki preview maçlar temizlenmiyordu.

**Çözüm:**
- Preview maç eklendiğinde, önceki preview durumundaki maçlar temizlenir
- Ama `in_progress` maçlar korunur
- Bu sayede sadece bir preview maç olabilir

**Değişiklik:**
```python
# ÖNCE:
self._match_cache[event_id][match_key] = {...}

# SONRA:
# Önceki preview durumundaki maçları temizle (sadece preview olanları)
for key in list(self._match_cache[event_id].keys()):
    if key != match_key and self._match_cache[event_id][key].get("status") == "preview":
        del self._match_cache[event_id][key]

self._match_cache[event_id][match_key] = {...}
```

## 📊 Sistem Mantığı

### Öncelik Sırası

1. **`in_progress` maçlar** (en yüksek öncelik)
   - Aktif maçlar
   - Hakem panelleri ve seyirci ekranları bunları görür
   - Match control sayfasında da görünür

2. **`preview` maçlar** (düşük öncelik)
   - Seçilmiş ama başlatılmamış maçlar
   - Aktif maç yoksa hakem panelleri ve seyirci ekranları bunları görür
   - Match control sayfasında her zaman görünür

### Akış

1. **Maç Seçimi:**
   - Kullanıcı match control sayfasından bir maç seçer
   - Maç preview durumuna alınır
   - Match control sayfasında seçilen maç görünür

2. **Aktif Maç Varsa:**
   - `get_active_match` önce aktif maçı döndürür
   - Hakem panelleri ve seyirci ekranları aktif maçı görür
   - Match control sayfasında seçilen preview maç görünür

3. **Aktif Maç Yoksa:**
   - `get_active_match` preview maçı döndürür
   - Hakem panelleri ve seyirci ekranları preview maçı görür
   - Match control sayfasında seçilen preview maç görünür

## ✅ Sonuç

Artık:
- ✅ Match control sayfasında seçilen maç her zaman görünür
- ✅ Aktif maç varsa, hakem panelleri ve seyirci ekranları aktif maçı görür
- ✅ Aktif maç yoksa, hakem panelleri ve seyirci ekranları preview maçı görür
- ✅ Preview maç seçildiğinde backend'de doğru şekilde preview durumuna alınır
- ✅ Önceki preview maçlar otomatik temizlenir

## 🧪 Test Senaryoları

1. **Deneme maçı seç, sonra sıralama maç 1 başlat:**
   - Deneme maçı preview durumuna alınır
   - Sıralama maç 1 başlatıldığında aktif olur
   - Hakem panelleri ve seyirci ekranları sıralama maç 1'i görür
   - Match control sayfasında deneme maçı görünür (preview)

2. **Aktif maç yokken deneme maçı seç:**
   - Deneme maçı preview durumuna alınır
   - Hakem panelleri ve seyirci ekranları deneme maçını görür
   - Match control sayfasında deneme maçı görünür

3. **Sıralama maçı seç, sonra deneme maçı seç:**
   - Sıralama maçı preview durumuna alınır
   - Deneme maçı seçildiğinde, sıralama maçının preview'ı temizlenir
   - Deneme maçı preview durumuna alınır
   - Match control sayfasında deneme maçı görünür
