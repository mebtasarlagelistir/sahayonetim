# Gönüllü Geliştirici Rehberi

Bu rehber, MEMSKOR projesine katkıda bulunacak gönüllüler için hazırlanmıştır. Projenin geldiği nokta, mimari ve geliştirme kuralları burada özetlenir.

---

## 🎯 Proje Hakkında

**MEMSKOR**, MEM Tasarla Geliştir Yarışması için geliştirilmiş bir yarışma yönetim sistemidir. FTC benzeri yapıda, **web tabanlı** ve **modüler** tasarlanmıştır. Gönüllüler ile geliştirilmeye devam ettiği için her modül kendi başına çalışabilmeli ve kodlarda açıklamalara önem verilmelidir.

---

## 📍 Geldiğimiz Nokta (Güncel Durum)

Bu bölüm, projenin şu anki işlevsel durumunu ve son düzeltmeleri özetler. Üzerinde çalışacak gönüllüler buradan başlayabilir.

### Maç Kontrol Sayfası (`/match-control`)

- **Takvim (Schedule) sekmesi:** Maç listesi yükleniyor; event tabanlı tetikleme ile `loadScheduleMatches` her sekme açılışında çalışıyor. Boş liste durumunda bilgilendirici mesaj gösteriliyor.
- **Maçı Başlat:** Match Core **instance** üzerinden `startMatch` çağrılıyor (sınıf değil instance kullanılır; `window.MatchCore` = instance).
- **Timer:** OKS (Otonom) **30 saniye**, SKS (Sürücü kontrollü) **120 saniye**. Süreler `src/core/constants.py` ve `static/js/constants.js` ile senkron tutulur.
- **Timer senkronizasyonu:** Sunucu her ~300 ms `refresh_match_state` ile `time_remaining` hesaplıyor ve WebSocket ile tüm abonelere gönderiyor. Match control, hakem panelleri ve seyirci ekranında yerel geri sayım (100 ms tick) bu veriyle senkron.
- **Puan girişi:** Match Core her notify’da `applyScoringData` çağrılmıyor; sadece **maç değiştiğinde** (yeni maç seçildiğinde) form dolduruluyor. Böylece kullanıcı yazarken puanlar silinmiyor.
- **Butonlar:** Başlat, Durdur, Sonraki Aşama, Tamamla için loading state ve çift tıklama önlemi var.

### Teknik Düzeltmeler (Dikkat Edilmesi Gerekenler)

- **Global değişken çakışmaları:** Aynı sayfada yüklenen script’lerde aynı isimle `let`/`const` tanımlanmamalı. Örnek: `match_control_core.js` ve `match_control_realtime.js` aynı anda yüklendiği için `retryCount`, `MAX_RETRY_COUNT`, `RETRY_DELAY_BASE` realtime tarafında `realtimeRetryCount`, `REALTIME_MAX_RETRY_COUNT`, `REALTIME_RETRY_DELAY_BASE` olarak ayrıldı.
- **MatchCore:** `window.MatchCore` bir **instance**’tır (sınıf değil). `startMatch`, `nextState` vb. metodlar instance üzerinde tanımlıdır.
- **Aynı fonksiyon içinde aynı isimle iki kez `const` tanımlanmamalı** (örn. `matchCoreInstance` aynı blokta iki kez tanımlanırsa SyntaxError oluşur).

### Kullanıcı Arayüzleri ve Timer

- **Match Control:** Timer Match Core ve `match_control_timer.js` (fallback) ile yönetilir; tam saniye ile kararlı sayım yapılır.
- **Hakem paneli:** `referee_panel_ui.js` – `updateRefereeTimer` yerel 100 ms geri sayım, WebSocket’ten gelen `time_remaining` ve `server_timestamp` ile senkron.
- **Baş hakem:** `head_referee.js` – `updateHeadRefereeTimer` benzer şekilde yerel geri sayım; maç yokken interval temizlenir.
- **Seyirci ekranı:** `audience_display_ui.js` – `updateTimerDisplay` yerel geri sayım; sunucu güncellemeleriyle senkron.

### Backend Timer Altyapısı

- `routes/match_control.py` içindeki WebSocket güncelleme döngüsünde her iterasyonda `match_state_manager.refresh_match_state(event_id, match_key)` çağrılır; böylece `time_remaining` sunucu saatine göre güncellenir ve tüm client’lara aynı değer gider.

---

## 📁 Önemli Dosya Rehberi

### Backend (Python)

| Dosya | Açıklama |
|-------|----------|
| `app_web.py` | Flask uygulaması, Blueprint kayıtları |
| `routes/match_control.py` | Maç kontrol API’leri, WebSocket handler’ları, timer güncelleme döngüsü |
| `routes/referee_panel.py` | Hakem paneli API’leri |
| `routes/screens.py` | Seyirci ekranları, WebSocket |
| `src/core/constants.py` | Maç süreleri (OKS 30, SKS 120), `MatchConstants` |
| `src/core/match_state.py` | Maç durumu cache’i, `refresh_match_state`, timer hesaplaması |
| `src/core/scoring/` | Puanlama kuralları, hesaplama, gerçek zamanlı |

### Frontend – Match Control (Sıralama Önemli)

| Dosya | Açıklama |
|-------|----------|
| `constants.js` | `MATCH_CONSTANTS` (süreler), `NETWORK_CONSTANTS` |
| `match_core.js` | Merkezi maç state’i, timer, WebSocket, subscribe/notify |
| `match_control_core.js` | `MATCH_STATES`, global değişkenler, sayfa başlatma |
| `match_control_realtime.js` | WebSocket fallback (Match Core yoksa) |
| `match_control_timer.js` | Yerel timer (fallback), `updateStateDisplay` |
| `match_control_data.js` | Maç listesi, Takvim, `loadScheduleMatches`, maç seçimi |
| `match_control_operations.js` | Başlat, Durdur, Sonraki Aşama, Tamamla |
| `match_control_scoring.js` | Puanlama formu, `applyScoringData`, `resetScoringInputs` |
| `match_control_ui.js` | `renderMatchDisplay`, ittifak/takım görünümleri |
| `match_control_events.js` | Tab değiştirme, buton event’leri, Takvim event tetiklemesi |
| `match_control_screens.js` | Ekran ayarları |
| `match_control.js` | Ana koordinasyon, Match Core subscribe, **puan formu sadece maç değişince güncellenir** |

### Frontend – Diğer Arayüzler

| Dosya | Açıklama |
|-------|----------|
| `referee_panel.js` | Hakem paneli ana giriş |
| `referee_panel_ui.js` | Hakem timer, `updateRefereeTimer` |
| `referee_panel_sse.js` | Hakem WebSocket (match_state, scores) |
| `head_referee.js` | Baş hakem, timer, onay |
| `audience_display_ui.js` | Seyirci timer, `updateTimerDisplay` |
| `audience_display_views.js` | Seyirci maç görünümü |
| `utils.js` | `qs()`, opsiyonel element listesi (uyarı verilmeyen id’ler) |

### Sabitler – Tek Kaynak

- **Maç süreleri:** `src/core/constants.py` (backend) ve `static/js/constants.js` (frontend) aynı değerleri kullanmalı (OKS 30, SKS 120).
- **Match Control HTML’de script sırası:** `templates/match_control.html` içinde `constants.js` → `match_core.js` → `match_control_core.js` → … → `match_control_data.js` → `match_control_events.js` → `match_control.js`.

---

## 🛠️ Nasıl Katkıda Bulunabilirsiniz?

### 1. Çalıştırma ve Test

```bash
pip install -r requirements.txt
python app_web.py
```

Tarayıcıda: `http://127.0.0.1:5000`  
Maç kontrol: `http://127.0.0.1:5000/match-control`

- Etkinlik oluşturup maç ekleyin, Takvim’den maç seçin, Maçı Başlat’a tıklayın; timer’ın 30 sn (OKS) ve 120 sn (SKS) saydığını kontrol edin.
- Puan girin; başka bir işlem yapmadan değerlerin silinmediğini doğrulayın.
- Hakem / baş hakem / seyirci ekranlarında timer’ın akıcı ve senkron ilerlediğini kontrol edin.

### 2. Modüler Yapıyı Koruyun

- Her modül kendi başına anlaşılır olmalı; gereksiz çapraz bağımlılık eklemeyin.
- Yeni global değişken/const eklerken aynı sayfada yüklenecek diğer script’lerde aynı ismin kullanılmadığından emin olun.

### 3. Dokümantasyon ve Açıklamalar

- Yeni fonksiyonlara ne yaptığını, hangi bağlamda çağrıldığını anlatan kısa açıklama ekleyin.
- Maç süreleri, timer mantığı gibi kritik noktaları kod içi yorumla belirtin.

### 4. Hata Bildirme

- Hata mesajı, hangi sayfada/ne yaparken oluştuğu, beklenen ve gerçek davranışı yazın.
- Mümkünse tarayıcı konsolu (F12) veya sunucu log çıktısı ekleyin.

---

## 📚 Diğer Dokümanlar

- `README.md` – Proje özeti ve yapı
- **`GERCEK_KULLANIM_REHBERI.md`** – Saha / etkinlikte gerçek kullanım, production çalıştırma, kontrol listesi
- `CALISTIRMA_REHBERI.md` – Kurulum ve çalıştırma
- `API_DOKUMANTASYONU.md` – API endpoint’leri
- `SCORING_SYSTEM_README.md` – Puanlama sistemi
- `DEVELOPMENT.md` – Geliştirici notları

---

## 🔧 Özet Kontrol Listesi (Yeni Özellik / Değişiklik Sonrası)

- [ ] Backend ve frontend süre sabitleri uyumlu mu? (`constants.py` ↔ `constants.js`)
- [ ] Aynı HTML sayfasında yüklenen script’lerde aynı isimle global `let`/`const` var mı?
- [ ] Match Core kullanıyorsanız `window.MatchCore` (instance) üzerinden mi erişiyorsunuz?
- [ ] Puan formunu sadece maç değişince mi güncelliyorsunuz? (Her notify’da `applyScoringData` çağrılmamalı.)
- [ ] Yeni fonksiyonlara kısa açıklama eklendi mi?

---

*Bu rehber projenin güncel durumuna göre güncellenmelidir. Son önemli güncelleme: maç kontrol timer, puan girişi koruma ve timer senkronizasyonu.*
