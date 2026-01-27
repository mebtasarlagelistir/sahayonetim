# Match Core Mimarisi

## Genel Bakış

Match Core, tüm UI'lar için merkezi maç durumu yönetimi sağlayan bir modüldür. Tüm WebSocket bağlantıları, timer yönetimi ve state yönetimi burada yapılır. UI'lar sadece subscribe olur ve render eder.

## Sorun

Şu anda her UI (match_control, referee_panel, head_referee, audience_display) kendi:
- WebSocket bağlantısını yönetiyor
- State'ini tutuyor (currentMatch, currentState, timeRemaining)
- Backend'den veri çekiyor
- Kendi mantığını uyguluyor

Bu durum:
- Tutarsızlıklara yol açıyor
- Bug'lara neden oluyor
- Kod tekrarı yaratıyor
- Bakımı zorlaştırıyor

## Çözüm: Match Core

### Mimari

```
┌─────────────────────────────────────────┐
│         Match Core (match_core.js)      │
│  - State Management                     │
│  - WebSocket Connection                 │
│  - Timer Management                     │
│  - Observer Pattern                     │
└─────────────────────────────────────────┘
           │
           │ subscribe/notify
           │
    ┌──────┴──────┬──────────┬──────────┐
    │             │          │          │
┌───▼───┐  ┌─────▼────┐  ┌──▼───┐  ┌───▼────┐
│ Match │  │ Referee  │  │ Head │  │Audience│
│Control│  │  Panel   │  │Referee│  │Display │
└───────┘  └──────────┘  └──────┘  └────────┘
```

### Özellikler

1. **Single Source of Truth**: Tüm match state Match Core'da
2. **Observer Pattern**: UI'lar subscribe olur, state değiştiğinde notify edilir
3. **WebSocket Yönetimi**: Tüm WebSocket bağlantıları Match Core'da
4. **Timer Yönetimi**: Merkezi timer (server timestamp ile senkronize)
5. **Modüler Yapı**: UI'lar sadece render eder, state yönetimi core'da

## Kullanım

### UI'da Subscribe Olma

```javascript
// UI başlatıldığında
const unsubscribe = MatchCore.subscribe((state) => {
  // State değiştiğinde UI'ı güncelle
  if (state.match) {
    renderMatch(state.match);
    renderScores(state.scores);
    renderTimer(state.currentState, state.timeRemaining);
  } else {
    renderNoMatch();
  }
});

// UI kapanırken
window.addEventListener("beforeunload", () => {
  unsubscribe();
});
```

### Maç Başlatma (Sadece Match Control)

```javascript
// Match Control'den
await MatchCore.startMatch(matchId, matchSource, fieldNumber, teamStatuses);
```

### Durum Değiştirme (Sadece Match Control)

```javascript
// Match Control'den
await MatchCore.nextState();
```

### Aktif Maç Yükleme

```javascript
// Sayfa yüklendiğinde
await MatchCore.loadActiveMatch();
```

## Geçiş Planı

### Aşama 1: Match Core Oluşturma ✅
- [x] `match_core.js` dosyası oluşturuldu
- [x] Observer pattern implementasyonu
- [x] WebSocket yönetimi
- [x] Timer yönetimi
- [x] Server timestamp senkronizasyonu
- [x] Periyodik kontrol mekanizması
- [x] Error handling iyileştirmeleri
- [x] Cleanup mekanizması
- [x] Test ve örnek kullanım dosyası (`match_core_test.js`)

### Aşama 2: Match Control Geçişi
- [ ] Match Control'ü Match Core kullanacak şekilde refactor et
- [ ] Eski state yönetimini kaldır
- [ ] Test et

### Aşama 3: Referee Panel Geçişi
- [ ] Referee Panel'i Match Core kullanacak şekilde refactor et
- [ ] Eski WebSocket bağlantısını kaldır
- [ ] Test et

### Aşama 4: Head Referee Geçişi
- [ ] Head Referee'yi Match Core kullanacak şekilde refactor et
- [ ] Test et

### Aşama 5: Audience Display Geçişi
- [ ] Audience Display'i Match Core kullanacak şekilde refactor et
- [ ] Test et

### Aşama 6: Temizlik
- [ ] Eski WebSocket kodlarını kaldır
- [ ] Eski state yönetim kodlarını kaldır
- [ ] Dokümantasyon güncelle

## Avantajlar

1. **Tutarlılık**: Tüm UI'lar aynı state'i görür
2. **Bakım Kolaylığı**: State yönetimi tek bir yerde
3. **Bug Azaltma**: Tek bir kaynak, daha az hata
4. **Performans**: Tek WebSocket bağlantısı (isteğe bağlı olarak paylaşılabilir)
5. **Test Edilebilirlik**: Core'u ayrı test edebiliriz

## Notlar

- Match Core, backend'deki `MatchStateManager` ve `RealtimeScoreManager` ile uyumlu çalışır
- Timer senkronizasyonu için server timestamp kullanılır
- Manuel seçim (preview) desteği var
- Geriye dönük uyumluluk için eski API'ler bir süre daha kalabilir
