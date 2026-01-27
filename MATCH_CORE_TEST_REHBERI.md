# Match Core Test Rehberi

## Genel Bakış

Match Core, tüm UI'lar için merkezi maç durumu yönetimi sağlayan bir modüldür. Bu rehber, Match Core'un nasıl test edileceğini ve kullanılacağını açıklar.

## Yapılan İyileştirmeler

### 1. Timer Senkronizasyonu
- Server timestamp ile doğru senkronizasyon
- Client-server zaman farkı hesaplama
- Timer başlangıç zamanı düzeltmesi

### 2. Scores Formatı
- Backend'den gelen scores formatı ile uyumlu hale getirildi
- `scoring_data` ve `calculated_scores` desteği
- Team statuses güncellemesi

### 3. Periyodik Kontrol
- `startPeriodicCheck()` - Periyodik aktif maç kontrolü
- `stopPeriodicCheck()` - Kontrolü durdurma
- Otomatik cleanup

### 4. Error Handling
- Daha iyi hata yönetimi
- Network hatalarında state korunması
- Retry mekanizması

### 5. Cleanup
- `cleanup()` - Tüm kaynakları temizleme
- Sayfa kapanırken otomatik cleanup

## Test Senaryoları

### Senaryo 1: Temel Subscribe/Unsubscribe

```javascript
// Console'da test et
const unsubscribe = MatchCore.subscribe((state) => {
  console.log("State güncellendi:", state);
});

// State'i kontrol et
console.log("Current state:", MatchCore.getState());

// Unsubscribe
unsubscribe();
```

### Senaryo 2: Aktif Maç Yükleme

```javascript
// Aktif maçı yükle
await MatchCore.loadActiveMatch();

// State'i kontrol et
console.log("Match:", MatchCore.match);
console.log("State:", MatchCore.currentState);
console.log("Time remaining:", MatchCore.timeRemaining);
```

### Senaryo 3: WebSocket Bağlantısı

```javascript
// Aktif maç yüklendiğinde WebSocket otomatik başlar
await MatchCore.loadActiveMatch();

// WebSocket durumunu kontrol et
console.log("WebSocket connected:", MatchCore.matchSocket?.connected);
```

### Senaryo 4: Timer Testi

```javascript
// Aktif maç yükle
await MatchCore.loadActiveMatch();

// Timer'ın çalışıp çalışmadığını kontrol et
setInterval(() => {
  console.log("Time remaining:", MatchCore.timeRemaining);
}, 1000);
```

### Senaryo 5: Periyodik Kontrol

```javascript
// Periyodik kontrol başlat (5 saniyede bir)
MatchCore.startPeriodicCheck(5000);

// Kontrolü durdur
MatchCore.stopPeriodicCheck();
```

## Kullanım Örnekleri

Detaylı kullanım örnekleri için `static/js/match_core_test.js` dosyasına bakın:

- **Match Control**: `setupMatchControl()`
- **Referee Panel**: `setupRefereePanel()`
- **Audience Display**: `setupAudienceDisplay()`
- **Head Referee**: `setupHeadReferee()`

## Test Checklist

- [ ] Match Core yükleniyor mu? (`typeof MatchCore !== "undefined"`)
- [ ] Subscribe çalışıyor mu?
- [ ] Aktif maç yükleniyor mu?
- [ ] WebSocket bağlantısı kuruluyor mu?
- [ ] Timer çalışıyor mu?
- [ ] State güncellemeleri notify ediliyor mu?
- [ ] Scores güncellemeleri alınıyor mu?
- [ ] Periyodik kontrol çalışıyor mu?
- [ ] Cleanup çalışıyor mu?

## Debugging

### Console Komutları

```javascript
// Match Core durumunu kontrol et
MatchCore.getState()

// Aktif maçı zorla yükle
MatchCore.loadActiveMatch(true)

// WebSocket durumunu kontrol et
MatchCore.matchSocket?.connected

// Timer durumunu kontrol et
MatchCore.timerInterval ? "Çalışıyor" : "Durdurulmuş"

// Subscriber sayısını kontrol et
MatchCore.subscribers.size
```

### Log Mesajları

Match Core, tüm önemli işlemleri console'a loglar:
- `MatchCore: WebSocket bağlantısı kuruldu`
- `MatchCore: Timer başlatıldı`
- `MatchCore: State güncellendi`
- `MatchCore: Server time sync`

## Bilinen Sorunlar ve Çözümler

### Sorun 1: Timer senkronizasyonu
**Çözüm**: Server timestamp ile senkronizasyon eklendi. `syncWithServerTime()` fonksiyonu kullanılıyor.

### Sorun 2: Scores formatı
**Çözüm**: Backend formatı ile uyumlu hale getirildi. Hem `scoring_data` hem de `calculated_scores` destekleniyor.

### Sorun 3: WebSocket reconnect
**Çözüm**: Otomatik reconnect mekanizması eklendi. Exponential backoff ile retry yapılıyor.

## Sonraki Adımlar

1. **Match Control Geçişi**: Match Control'ü Match Core kullanacak şekilde refactor et
2. **Referee Panel Geçişi**: Referee Panel'i Match Core kullanacak şekilde refactor et
3. **Head Referee Geçişi**: Head Referee'yi Match Core kullanacak şekilde refactor et
4. **Audience Display Geçişi**: Audience Display'i Match Core kullanacak şekilde refactor et
5. **Eski Kod Temizliği**: Eski WebSocket ve state yönetim kodlarını kaldır

## Notlar

- Match Core, `apiGet` ve `apiPost` fonksiyonlarını kullanır (network_utils.js'de tanımlı)
- Match Core, Socket.IO'yu kullanır (`io` global olarak yüklenmiş olmalı)
- Match Core, constants.js'deki `MATCH_CONSTANTS` ve `NETWORK_CONSTANTS` kullanır
