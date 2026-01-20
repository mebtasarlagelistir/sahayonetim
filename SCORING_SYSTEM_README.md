# Modüler Puanlama Sistemi Dokümantasyonu

## Genel Bakış

MEMSKOR'un puanlama sistemi tamamen modüler yapıda tasarlanmıştır. Bu sayede:
- Puanlama kuralları kolayca güncellenebilir
- Farklı oyunlar için yeniden yapılandırılabilir
- Gerçek zamanlı senkronizasyon desteklenir
- Hakem panelleri ile çoklu cihaz desteği sağlanır

## Mimari

### 1. Modüler Puanlama Sistemi (`src/core/scoring/`)

#### `config.py` - Puanlama Konfigürasyonu
Oyun puanlama kurallarını tanımlar. **Bu dosyayı güncelleyerek puanlama kurallarını değiştirebilirsiniz.**

```python
# Örnek: Bent Seviye 2 puanını değiştirmek
AUTONOMOUS_RULES = {
    "bent_level_2": {
        "correct_color_number": {
            "points": 6,  # Bu değeri değiştirin
            "description": "Bent Seviye 2 - Doğru Renk/Numara"
        },
        ...
    }
}
```

#### `calculator.py` - Puanlama Hesaplayıcı
Puanlama verilerini alır ve toplam skorları hesaplar. Konfigürasyondan kuralları okur.

#### `realtime.py` - Gerçek Zamanlı Yönetici
Tüm bağlı cihazların skorlarını senkronize tutar.

### 2. Backend API Endpoint'leri

#### `/api/match-control/score/detailed` (POST)
Detaylı puanlama verilerini günceller. Modüler puanlama sistemi kullanır.

**Request:**
```json
{
  "match_id": 1,
  "alliance": "red",
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
  "breakdown": {
    "autonomous": {...},
    "teleop": {...},
    "penalties": {...}
  }
}
```

#### `/api/match-control/score/realtime/<match_id>` (SSE)
Server-Sent Events stream'i. Gerçek zamanlı skor güncellemelerini gönderir.

### 3. Hakem Paneli (`routes/referee_panel.py`)

Hakemlerin tabletlerinden puanlama yapabilmesi için optimize edilmiş endpoint'ler:

- `/referee-panel` - Hakem paneli sayfası
- `/api/referee/active-match` - Aktif maç bilgisi
- `/api/referee/score/update` - Skor güncelleme
- `/api/referee/score/get/<match_id>` - Mevcut skorları alma

## Puanlama Kurallarını Güncelleme

### Adım 1: `src/core/scoring/config.py` Dosyasını Açın

### Adım 2: İlgili Kuralı Bulun ve Güncelleyin

Örnek: Bent Seviye 2 puanını 6'dan 7'ye çıkarmak:

```python
"bent_level_2": {
    "correct_color_number": {
        "points": 7,  # 6'dan 7'ye değiştirildi
        "description": "Bent Seviye 2 - Doğru Renk/Numara"
    },
    ...
}
```

### Adım 3: Uygulamayı Yeniden Başlatın

Değişiklikler otomatik olarak uygulanır. **JavaScript kodunda değişiklik yapmanıza gerek yok!**

## Yeni Puanlama Kategorisi Ekleme

### 1. Config'e Ekleme

`config.py` dosyasına yeni kategori ekleyin:

```python
AUTONOMOUS_RULES = {
    ...
    "yeni_kategori": {
        "points_per_item": 10,
        "description": "Yeni Kategori Açıklaması",
        "can_opponent": False
    }
}
```

### 2. Calculator'a Ekleme

`calculator.py` dosyasındaki `_calculate_autonomous` veya `_calculate_teleop` metoduna ekleyin:

```python
def _calculate_autonomous(self, data: Dict) -> Dict:
    breakdown = {}
    ...
    # Yeni kategori
    rule = self.config.get_autonomous_rule("yeni_kategori")
    if rule:
        count = data.get("yeni_kategori_count", 0)
        points = count * rule["points_per_item"]
        breakdown["yeni_kategori"] = points
    ...
    return breakdown
```

### 3. Frontend'e Ekleme

`templates/match_control.html` dosyasına yeni input alanı ekleyin:

```html
<div class="scoring-group compact-group">
  <div class="group-header">Yeni Kategori (10 Puan)</div>
  <div class="scoring-input-compact">
    <div class="score-control-compact">
      <span class="score-label-compact">Sayı</span>
      <button class="btn-score-minus" data-field="blue_yeni_kategori_count" data-points="10">−</button>
      <input type="number" id="blue_yeni_kategori_count" value="0" min="0" data-points="10" class="score-field-compact" />
      <button class="btn-score-plus" data-field="blue_yeni_kategori_count" data-points="10">+</button>
    </div>
  </div>
</div>
```

### 4. JavaScript'e Ekleme

`static/js/match_control.js` dosyasındaki `collectScoringData` fonksiyonuna ekleyin:

```javascript
function collectScoringData(alliance) {
  return {
    ...
    yeni_kategori_count: parseInt(qs(`${alliance}_yeni_kategori_count`)?.value || 0)
  };
}
```

## Gerçek Zamanlı Senkronizasyon

### Nasıl Çalışır?

1. **Baş Hakem** maç kontrol sayfasından skor günceller
2. Backend modüler puanlama sistemi ile skorları hesaplar
3. `RealtimeScoreManager` tüm bağlı cihazlara güncellemeyi yayınlar
4. **Hakemler** tabletlerinde anlık olarak güncellenmiş skorları görür

### SSE (Server-Sent Events)

- Her cihaz `/api/match-control/score/realtime/<match_id>` endpoint'ine bağlanır
- Backend skor değişikliklerini otomatik olarak gönderir
- Frontend EventSource API ile güncellemeleri alır

## Hakem Paneli Kullanımı

### Baş Hakem Tarafı

1. Maç kontrol sayfasından maçı başlatır
2. Hakemlere ittifak ataması yapar (ileride backend'den yönetilecek)
3. Tüm skorları görüntüler ve yönetir

### Hakem Tarafı

1. `/referee-panel` sayfasına giriş yapar
2. Aktif maç otomatik olarak görünür
3. Atandığı ittifakın skorlarını girer
4. "Skorları Kaydet" butonuna tıklar
5. Skorlar gerçek zamanlı olarak tüm cihazlara yayınlanır

## Modülerlik Avantajları

1. **Kolay Güncelleme**: Sadece `config.py` dosyasını güncelleyerek puanlama kurallarını değiştirebilirsiniz
2. **Yeniden Kullanılabilirlik**: Farklı oyunlar için aynı sistem kullanılabilir
3. **Test Edilebilirlik**: Her modül bağımsız olarak test edilebilir
4. **Genişletilebilirlik**: Yeni kategoriler kolayca eklenebilir
5. **Bakım Kolaylığı**: Kod değişiklikleri minimum seviyede kalır

## Gelecek Geliştirmeler

- [ ] Hakem atama sistemi (backend'den yönetim)
- [ ] WebSocket desteği (SSE yerine veya ek olarak)
- [ ] Puanlama geçmişi ve geri alma özelliği
- [ ] Çoklu saha desteği için gelişmiş senkronizasyon
- [ ] Puanlama kuralları için görsel editör
