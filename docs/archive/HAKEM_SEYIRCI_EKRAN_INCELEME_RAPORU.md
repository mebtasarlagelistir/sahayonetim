# Hakem Tabletleri ve Seyirci Ekranı (Audience Display) İnceleme Raporu

**Tarih:** Ocak 2026  
**Kapsam:** Hakem paneli (referee panel), seyirci ekranı (audience display), ilgili backend ve WebSocket akışları.

---

## 1. Özet

Hakem tabletleri ve audience display için kod tabanı incelendi. **1 kritik backend hatası** ve **1 UI hatası** tespit edilip düzeltildi. Aşağıda tespit edilen/düzeltilen noktalar, olası riskler ve tavsiyeler özetlenmiştir.

---

## 2. Düzeltilen Hatalar

### 2.1 Kritik: Audience Display Skor Hesaplama Hatası (Backend)

**Dosya:** `routes/screens.py`  
**Sorun:** Audience WebSocket güncelleme döngüsünde (`_start_audience_update_thread`) skor hesaplamak için `ScoreCalculator()` kullanılıyordu ancak **import edilmemişti**. Bu durumda seyirci ekranına skor güncellemesi giderken `NameError: name 'ScoreCalculator' is not defined` oluşur ve thread hata verir; seyirci ekranında skorlar güncellenmez.

**Yapılan düzeltme:**  
`from src.core.scoring import ScoreCalculator` satırı eklendi.

---

### 2.2 Hakem Paneli: "Aktif Maç Yok" Kartı İçeriğinin Silinmesi

**Dosyalar:** `templates/referee_panel.html`, `static/js/referee_panel.js`, `static/js/referee_panel_ui.js`  
**Sorun:** Farklı mesajlar (örn. "Maç önizleme modunda", "Aktif maç bulunmuyor") gösterilirken `no_match_message` kartının **tüm içeriği** `noMatchMsg.textContent = "..."` ile değiştiriliyordu. Bu da kartın içindeki `<h2>`, `<p>` yapısını silip tek bir metin düğümü bırakıyordu. Yapı bozuluyor, erişilebilirlik ve stil tutarlılığı etkileniyordu.

**Yapılan düzeltme:**  
- Şablonda mesaj metni için `id="no_match_message_text"` olan tek bir `<p>` kullanıldı.  
- Tüm mesaj atamaları bu elemana yönlendirildi: `noMatchMsg.querySelector("#no_match_message_text").textContent = "..."`.  
- Eleman yoksa eski davranış korunuyor (fallback).

---

## 3. Tespit Edilen Riskler ve Eksiklikler (Düzeltme Yapılmadı)

### 3.1 Audience Display

| Konu | Açıklama | Öneri |
|------|----------|--------|
| **İlk yükleme göstergesi** | "Yükleniyor..." sadece `aria-hidden="true"` ile gizleniyor; CSS'te `.audience-initial-loading[aria-hidden="true"] { display: none; }` tanımlı, bu yüzden görünüm doğru. | Ek bir işlem gerekmiyor. |
| **WebSocket yeniden abone** | `AudienceCore` disconnect sonrası reconnect'te `subscribe_audience` tekrar emit ediliyor. Backend tarafında room’a tekrar join edilmesi bu event’e bağlı. | Reconnect sonrası bir kez daha `loadScreenSettings()` veya ilk `match_update` gelene kadar "Yükleniyor" benzeri bir durum gösterilebilir; gerekirse reconnect sonrası tek seferlik state çekimi eklenebilir. |
| **Preview temizleme gecikmesi** | Preview kaldırıldığında client’ta 3 kontrol döngüsü (MAX_PREVIEW_CLEAR_ATTEMPTS) boyunca preview korunuyor. Bu kasıtlı (geçici API hatalarında yanlışlıkla preview’ın silinmesini önlemek için). | Süre/deneme sayısı ihtiyaca göre ayarlanabilir; şu anki değer makul. |

### 3.2 Hakem Paneli (Tabletler)

| Konu | Açıklama | Öneri |
|------|----------|--------|
| **MatchCore bağımlılığı** | Hakem paneli aktif maç ve gerçek zamanlı güncellemeler için tamamen **MatchCore** + WebSocket `/match` namespace’ine dayanıyor. MatchCore yüklenmezse fallback olarak `checkActiveMatch()` ve `startRealtimeUpdates()` (referee_panel_sse.js) kullanılıyor. | Script sırası (match_core.js’in referee panelinden önce yüklenmesi) ve cache’in güncel olması önemli. `GERCEK_KULLANIM_REHBERI.md` veya kurulum notlarında vurgulanabilir. |
| **retryCount / MAX_RETRY_COUNT çakışması** | `referee_panel_core.js` ve `referee_panel_sse.js` içinde ayrı `retryCount`, `MAX_RETRY_COUNT`, `RETRY_DELAY_BASE` tanımları var. MatchCore kullanıldığında referee_panel_sse fonksiyonları çağrılmıyor; yine de ileride fallback kullanılırsa karışıklık olmaması için sabitler tek yerde (örn. constants.js veya core) toplanabilir. | İsteğe bağlı refactor: tüm referee paneli retry sabitleri tek modülde. |
| **Baş hakem ekranı** | `head_referee.html` ve `head_referee.js` bu incelemede detaylı açılmadı. Aynı MatchCore / WebSocket yapısını kullanıyorsa benzer senaryolar geçerli. | İleride head referee ekranı için de kısa bir kontrol önerilir. |

### 3.3 Backend (Screens / Audience)

| Konu | Açıklama | Öneri |
|------|----------|--------|
| **Audience thread temizliği** | `_audience_update_threads` ve `_audience_stop_threads` ile thread’ler yönetiliyor. Disconnect’te room boşalınca `_audience_stop_threads[screen_id].set()` ile thread durduruluyor; thread içinde `_audience_update_threads` siliniyor. Çok ekran / sık bağlan-kopar senaryosunda thread sayısının artmaması için mevcut mantık yeterli görünüyor. | Özel bir düzeltme gerekmiyor; ileride log ile thread sayısı izlenebilir. |
| **match_update / scores_update sıklığı** | Audience thread 300 ms’de bir döngü yapıyor; state/skor değişmediyse emit yapılmıyor (match_update_key / scores_update_key ile). | Performans açısından uygun. |

---

## 4. Mimari Özet (Kontrol İçin)

### 4.1 Audience Display Akışı

1. **Sayfa:** `/audience` → `audience_display.html`  
2. **Client:**  
   - `audience_display_core.js`: `screenId` (ensureScreenId), heartbeat.  
   - `audience_core.js`: **AudienceCore** – state, preview, WebSocket `/audience`, periyodik `loadScreenSettings()` ve `loadMatchView()`.  
   - WebSocket: `io("/audience")` → `subscribe_audience` → sunucu client’ı `screen_id` ile room’a alıyor.  
3. **Backend:**  
   - `routes/screens.py`: `/audience` sayfası, `/api/screens/view`, `/api/screens/heartbeat`, WebSocket namespace `/audience`, `subscribe_audience` → `_start_audience_update_thread(screen_id)`.  
   - Thread: `match_state_manager.get_active_match()`, `realtime_manager.get_current_scores()`, `ScoreCalculator` ile skor hesaplama, `match_update` ve `scores_update` emit.

### 4.2 Hakem Paneli Akışı

1. **Sayfa:** `/referee-panel`, `/referee/red`, `/referee/blue` → `referee_panel.html`  
2. **Client:**  
   - **MatchCore** (match_core.js): `/api/match-control/active`, WebSocket `/match` → `subscribe_match`.  
   - Referee paneli: MatchCore’a subscribe, state değişince `loadMatchForReferee`, `updateRefereeTimer`, skor/form güncellemesi.  
   - Skor gönderme: `POST /api/referee/score/update`; backend `realtime_manager.update_score`, sonra WebSocket ile `scores` emit (room: `match:event_id:source:match_id`).  
3. **Backend:**  
   - `routes/referee_panel.py`: aktif maç, skor güncelleme, submit, onay.  
   - `routes/match_control.py`: WebSocket `/match` namespace, match state update loop.

---

## 5. Tavsiyeler

1. **Canlı/saha testi:**  
   En az bir tablette hakem paneli, bir ekranda audience display açık; maç başlat → skor gir → bitir akışında timer, skor ve “Aktif maç yok” mesajlarının doğru göründüğünü test edin.

2. **CDN / Socket.IO:**  
   Audience ve referee ekranları Socket.IO CDN’e bağımlı. İnternet kesintisinde veya CDN erişim sorununda WebSocket/polling başarısız olabilir. Mümkünse Socket.IO’yu projeye local/vendor olarak almayı değerlendirin.

3. **Loglama:**  
   - Audience thread içinde `ScoreCalculator` kullanımı artık import ile çalışıyor; ilk canlı testte skor emit’lerinin düştüğünü log veya console ile doğrulayın.  
   - Hakem panelinde MatchCore yoksa fallback’e düşme durumunu (console uyarıları) bir kez gözden geçirin.

4. **Dokümantasyon:**  
   - `GERCEK_KULLANIM_REHBERI.md` içinde “Seyirci ekranı skorları güncellenmiyorsa” maddesine backend log’unda `ScoreCalculator`/import hatası olup olmadığını kontrol etmeyi ekleyebilirsiniz.  
   - Hakem tabletleri için “MatchCore yüklenmedi” uyarısı alınıyorsa script sırası ve cache temizliği adımlarını yazın.

5. **Modülerlik (gönüllü geliştirme):**  
   Mevcut ayrım (audience_core, referee_panel_core, match_core, ayrı sse/ui dosyaları) modüler; yeni özellik eklerken ilgili modülün “fallback” ve “MatchCore/AudienceCore kullanılıyorsa çık” notlarını korumak, hem eski davranışı hem tek kaynaklı state’i korur.

---

## 6. Sonuç

- **Kritik:** Audience skor hesaplama hatası (ScoreCalculator import) giderildi.  
- **UI:** Hakem paneli “Aktif maç yok” kartı artık yapıyı bozmadan sadece mesaj metnini güncelliyor.  
- Diğer noktalar risk/iyileştirme olarak raporlandı; isteğe bağlı refactor ve dokümantasyon güncellemeleri önerildi.  
- Canlı ortamda bir kez tam maç akışı (başlat → skor → bitir) ile hakem + audience testi yapılması önerilir.
