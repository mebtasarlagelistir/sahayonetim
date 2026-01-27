# Skor Kaydetme ve Senkronizasyon Düzeltmesi ✅

## Sorun

Kullanıcı hakem panelinde puan girdiğinde:
1. Puanlar siliniyor
2. Match control'a ulaşmıyor gibi görünüyor

## Tespit Edilen Sorunlar

1. **Match Core'dan gelen skor güncellemeleri kullanıcı girdilerini siliyor**: 
   - Match Core'dan gelen her skor güncellemesi `applyScoringDataToForm` ile forma uygulanıyor
   - Kullanıcı input yaparken bile skorlar override ediliyor

2. **Kaydetme sonrası loadCurrentScores çağrılıyor**:
   - `saveScore` fonksiyonunda `loadCurrentScores()` çağrılıyor
   - Bu, kullanıcının girdiği değerleri siliyor

3. **Kullanıcı input takibi yok**:
   - Kullanıcı input yapıp yapmadığı takip edilmiyor
   - Match Core'dan gelen güncellemeler her zaman uygulanıyor

## Yapılan Düzeltmeler

### 1. Kullanıcı Input Takibi Eklendi ✅

**referee_panel_core.js:**
- `isUserEditing` flag'i eklendi
- `userEditingTimeout` timer'ı eklendi
- `USER_EDITING_TIMEOUT = 2000` (2 saniye)

**Mantık:**
- Kullanıcı input yapınca `isUserEditing = true`
- 2 saniye input yoksa `isUserEditing = false`
- Match Core'dan gelen skor güncellemeleri sadece `!isUserEditing` olduğunda uygulanıyor

### 2. Match Core Skor Güncellemeleri Koşullu Yapıldı ✅

**referee_panel.js:**
- Match Core subscribe callback'inde skor güncellemeleri sadece `!isUserEditing` olduğunda uygulanıyor
- Console log'lar eklendi (debug için)

### 3. Input Event Listener'ları Güncellendi ✅

**referee_panel.js:**
- `input` event'inde `isUserEditing = true` set ediliyor
- `change` event'inde `isUserEditing = true` set ediliyor
- `btn-score-plus/minus` click'inde `isUserEditing = true` set ediliyor
- Her input'tan sonra 2 saniye timer başlatılıyor

### 4. Kaydetme Sonrası loadCurrentScores Düzeltildi ✅

**referee_panel_scoring.js:**
- `loadCurrentScores(applyScores = true)` parametresi eklendi
- `applyScores=false` ise sadece referee meta güncellenir, skorlar uygulanmaz
- `saveScore` fonksiyonunda `loadCurrentScores(false)` çağrılıyor
- `autoSaveScore` fonksiyonunda kaydetme sonrası kısa süre `isUserEditing = true` kalıyor

### 5. loadCurrentScores İyileştirildi ✅

**referee_panel_scoring.js:**
- `applyScores` parametresi eklendi
- `isUserEditing` kontrolü eklendi
- Sadece `applyScores=true` ve `!isUserEditing` olduğunda skorlar uygulanıyor

## Test Edilmesi Gerekenler

1. **Kullanıcı Input Koruması**:
   - [ ] Hakem panelinde puan girildiğinde silinmiyor mu?
   - [ ] Match Core'dan gelen güncellemeler kullanıcı input yaparken ignore ediliyor mu?
   - [ ] 2 saniye input yoksa skor güncellemeleri tekrar aktif oluyor mu?

2. **Skor Kaydetme**:
   - [ ] Auto-save çalışıyor mu?
   - [ ] Manuel kaydetme çalışıyor mu?
   - [ ] Kaydetme sonrası puanlar korunuyor mu?

3. **Match Control Senkronizasyonu**:
   - [ ] Hakem panelinden kaydedilen skorlar match control'da görünüyor mu?
   - [ ] WebSocket üzerinden skorlar senkronize oluyor mu?
   - [ ] Başka hakemlerden gelen skorlar görünüyor mu?

## Debug İçin Console Kontrolleri

Browser console'da şu log'ları kontrol edin:

```javascript
// Kullanıcı input durumu
isUserEditing  // true/false

// Skor güncellemeleri
// "initializeRefereePanel: Kullanıcı input yapıyor, skor güncellemeleri ignore ediliyor"
// "initializeRefereePanel: Kırmızı/Mavi ittifak skorları güncelleniyor (kullanıcı input yok)"

// Auto-save
// "Skorlar otomatik olarak kaydedildi"
```

## Notlar

- Kullanıcı input yaparken Match Core'dan gelen güncellemeler ignore ediliyor
- Kaydetme sonrası kısa süre (2 saniye) "editing" modunda kalıyor
- `loadCurrentScores(false)` ile sadece referee meta güncelleniyor, skorlar uygulanmıyor
- Auto-save ve manuel kaydetme çalışmaya devam ediyor

## Sonraki Adımlar

1. Sayfayı hard refresh yapın (Ctrl+Shift+R)
2. Hakem panelinde puan girin
3. Puanların silinmediğini kontrol edin
4. Match control'da skorların göründüğünü kontrol edin
