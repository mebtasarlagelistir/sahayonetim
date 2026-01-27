# Match Core Geçiş Planı

## Genel Bakış

Match Core oluşturuldu ve test edilmeye hazır. Bu dokümantasyon, UI'ların Match Core'a nasıl geçirileceğini adım adım açıklar.

## Ön Koşullar

- [x] Match Core oluşturuldu (`match_core.js`)
- [x] Test dosyası hazır (`match_core_test.js`)
- [ ] Match Core test edildi ve çalışıyor
- [ ] HTML'de `match_core.js` yüklendi

## Geçiş Sırası

### 1. HTML'de Match Core'u Yükle

**Dosya:** `templates/match_control.html`, `templates/referee_panel.html`, vb.

```html
<!-- Match Core'u yükle (diğer match_control modüllerinden ÖNCE) -->
<script src="{{ url_for('static', filename='js/match_core.js') }}"></script>
```

**ÖNEMLİ:** Match Core, `network_utils.js` ve Socket.IO'dan sonra, diğer match modüllerinden önce yüklenmeli.

### 2. Match Control Geçişi (Öncelikli)

**Dosyalar:**
- `static/js/match_control.js`
- `static/js/match_control_data.js`
- `static/js/match_control_realtime.js`
- `static/js/match_control_timer.js`

**Yapılacaklar:**
1. `match_control_realtime.js` - WebSocket bağlantısını kaldır, Match Core kullan
2. `match_control_timer.js` - Timer yönetimini kaldır, Match Core'dan al
3. `match_control_data.js` - `checkActiveMatch()` fonksiyonunu Match Core kullanacak şekilde değiştir
4. `match_control.js` - Initialize'da Match Core'a subscribe ol

**Örnek Kod:**

```javascript
// match_control.js - initializeMatchControl() içinde
async function initializeMatchControl() {
  // Match Core'a subscribe ol
  const unsubscribe = MatchCore.subscribe((state) => {
    // State değiştiğinde UI'ı güncelle
    if (state.match) {
      currentMatch = state.match;
      currentState = state.currentState;
      timeRemaining = state.timeRemaining;
      
      // UI'ı güncelle
      if (typeof renderMatchDisplay === "function") {
        renderMatchDisplay();
      }
      
      // Skorları güncelle
      if (state.scores.red || state.scores.blue) {
        if (typeof applyScoringData === "function") {
          applyScoringData(state.scores);
        }
      }
    } else {
      currentMatch = null;
      // "Aktif maç yok" mesajı göster
    }
  });
  
  // Aktif maçı yükle
  await MatchCore.loadActiveMatch();
  
  // Periyodik kontrol başlat
  MatchCore.startPeriodicCheck(5000);
  
  // Sayfa kapanırken cleanup
  window.addEventListener("beforeunload", () => {
    unsubscribe();
  });
  
  // Maç başlatma butonu
  document.getElementById("btn_start_match")?.addEventListener("click", async () => {
    const matchId = getSelectedMatchId();
    const matchSource = getSelectedMatchSource();
    const fieldNumber = getFieldNumber();
    const teamStatuses = collectTeamStatuses();
    
    try {
      await MatchCore.startMatch(matchId, matchSource, fieldNumber, teamStatuses);
      showToast("Maç başlatıldı", "success");
    } catch (err) {
      showToast("Maç başlatılamadı", "error");
    }
  });
}
```

### 3. Referee Panel Geçişi

**Dosyalar:**
- `static/js/referee_panel.js`
- `static/js/referee_panel_sse.js` (WebSocket kaldırılacak)
- `static/js/referee_panel_ui.js`

**Yapılacaklar:**
1. `referee_panel_sse.js` - WebSocket bağlantısını kaldır
2. `referee_panel.js` - `checkActiveMatch()` yerine Match Core kullan
3. `referee_panel_ui.js` - Timer güncellemelerini Match Core'dan al

### 4. Head Referee Geçişi

**Dosyalar:**
- `static/js/head_referee.js`

**Yapılacaklar:**
1. WebSocket bağlantısını kaldır
2. Match Core'a subscribe ol
3. State güncellemelerini Match Core'dan al

### 5. Audience Display Geçişi

**Dosyalar:**
- `static/js/audience_display.js`
- `static/js/audience_display_sse.js` (WebSocket kaldırılacak)

**Yapılacaklar:**
1. `audience_display_sse.js` - WebSocket bağlantısını kaldır
2. `audience_display.js` - Match Core'a subscribe ol
3. Audience namespace için özel handling (Match Core `/match` namespace kullanıyor)

**NOT:** Audience Display `/audience` namespace kullanıyor. Bu durumda:
- Ya Match Core'a audience namespace desteği ekle
- Ya da Audience Display için ayrı bir core oluştur
- Ya da Audience Display'i `/match` namespace'e geçir

## Test Stratejisi

### Her Geçiş Sonrası Test

1. **Match Control:**
   - [ ] Maç başlatma çalışıyor mu?
   - [ ] Timer çalışıyor mu?
   - [ ] Skor güncellemeleri geliyor mu?
   - [ ] Durum geçişleri çalışıyor mu?

2. **Referee Panel:**
   - [ ] Aktif maç görünüyor mu?
   - [ ] Skor girişi çalışıyor mu?
   - [ ] Timer senkronize mi?
   - [ ] WebSocket güncellemeleri geliyor mu?

3. **Head Referee:**
   - [ ] Maç bilgileri görünüyor mu?
   - [ ] Skorlar görünüyor mu?
   - [ ] Onaylama çalışıyor mu?

4. **Audience Display:**
   - [ ] Maç görünüyor mu?
   - [ ] Timer çalışıyor mu?
   - [ ] Skorlar güncelleniyor mu?

## Rollback Planı

Eğer bir sorun çıkarsa:
1. Eski kodlar hala mevcut (sadece kullanılmıyor)
2. Match Core'u devre dışı bırak
3. Eski WebSocket bağlantılarını geri aktif et
4. Sorunu düzelt ve tekrar dene

## Notlar

- Match Core, mevcut API'lerle uyumlu çalışır
- Eski kodlar bir süre daha kalabilir (rollback için)
- Geçiş sırasında her UI'ı ayrı ayrı test et
- Tüm UI'lar geçtikten sonra eski kodları temizle

## Sorular

1. **Audience Display namespace:** `/audience` namespace'i Match Core'a ekleyelim mi, yoksa ayrı mı tutalım?
2. **Eski kod temizliği:** Ne zaman eski kodları kaldıralım?
3. **Test süresi:** Her geçişten sonra ne kadar test yapalım?
