# Match Core Test Rehberi

## Hızlı Test

Match Core'u test etmek için tarayıcı console'unda şu komutları çalıştırın:

### 1. Match Core'un Yüklendiğini Kontrol Et

```javascript
typeof MatchCore !== "undefined"
// Beklenen: true
```

### 2. Mevcut State'i Kontrol Et

```javascript
MatchCore.getState()
// Beklenen: { match: null, currentState: "idle", ... }
```

### 3. Subscribe Ol ve State Değişikliklerini İzle

```javascript
const unsubscribe = MatchCore.subscribe((state) => {
  console.log("State güncellendi:", state);
});

// State değişikliklerini görmek için aktif maçı yükle
await MatchCore.loadActiveMatch();
```

### 4. Aktif Maçı Yükle

```javascript
await MatchCore.loadActiveMatch();

// State'i kontrol et
MatchCore.getState()
// Eğer aktif maç varsa, match objesi dolu olmalı
```

### 5. WebSocket Bağlantısını Kontrol Et

```javascript
// Aktif maç yüklendikten sonra
MatchCore.matchSocket?.connected
// Beklenen: true (eğer aktif maç varsa)
```

### 6. Timer'ı Kontrol Et

```javascript
// Aktif maç yüklendikten sonra
MatchCore.timerInterval ? "Çalışıyor" : "Durdurulmuş"
// Eğer maç aktifse (in_progress), "Çalışıyor" olmalı
```

### 7. Periyodik Kontrolü Test Et

```javascript
// Periyodik kontrol başlat
MatchCore.startPeriodicCheck(5000);

// 5 saniye sonra console'da "State güncellendi" mesajları görmelisiniz

// Kontrolü durdur
MatchCore.stopPeriodicCheck();
```

## Beklenen Sonuçlar

### Başarılı Test Senaryosu

1. Match Core yüklendi ✅
2. Subscribe çalışıyor ✅
3. Aktif maç yüklendi ✅
4. WebSocket bağlantısı kuruldu ✅
5. Timer çalışıyor (eğer maç aktifse) ✅
6. State güncellemeleri geliyor ✅

### Hata Durumları

- **Match Core yüklenmedi:** `match_core.js` dosyası HTML'de yüklenmemiş olabilir
- **apiGet/apiPost tanımlı değil:** `network_utils.js` yüklenmemiş olabilir
- **io tanımlı değil:** Socket.IO yüklenmemiş olabilir
- **WebSocket bağlanamıyor:** Backend çalışmıyor olabilir veya aktif maç yok

## Sonraki Adımlar

Test başarılı olduktan sonra:

1. **Match Control Geçişi** - Ben yapabilirim
2. **Referee Panel Geçişi** - Ben yapabilirim  
3. **Head Referee Geçişi** - Ben yapabilirim
4. **Audience Display Geçişi** - Ben yapabilirim

Her geçişten sonra test edilir ve sorunlar düzeltilir.
