# Seyirci Ekranları – Mevcut Durum Kontrolü

Bu belge seyirci ekranlarının (**/audience**) mevcut yapısını, çalışan parçaları ve tamamlanması/iyileştirilmesi gereken noktaları listeler. Gönüllüler bu listeye göre geliştirme yapabilir.

---

## 1. Genel Yapı (Çalışıyor)

| Bileşen | Durum | Açıklama |
|--------|--------|----------|
| **URL** | ✅ | `http://[SUNUCU_IP]:5000/audience` (giriş gerekmez) |
| **Route** | ✅ | `routes/screens.py` → `GET /audience` → `audience_display.html` |
| **State yönetimi** | ✅ | `AudienceCore` (audience_core.js) – merkezi state, WebSocket, preview |
| **WebSocket** | ✅ | Namespace `/audience`, `subscribe_audience` → maç/skor güncellemeleri |
| **Heartbeat** | ✅ | `/api/screens/heartbeat` ile ekran sunucuya kayıt olur; Maç Kontrol’de listelenir |

---

## 2. Görünümler (Views)

| Görünüm | Durum | Not |
|---------|--------|-----|
| **Maç (match)** | ✅ | Canlı skor, timer, takımlar; WebSocket ile anlık güncelleme |
| **Sıradaki maç (VS Preview)** | ✅ | Maç Kontrol’den "Ön izleme göster" ile gönderilir; Kırmızı vs Mavi ittifak |
| **Maç sonucu (Results)** | ✅ | "Sonuçları göster" ile gönderilir; skor, breakdown, KAZANAN rozeti, eleme metni |
| **İnceleme (inspection)** | ✅ | `/api/public/inspection-status`; tamamlanan/toplam, tablo |
| **Sıralama (rankings)** | ⚠️ | Panel var; içerik "Bu ekran yakında etkinleştirilecek" placeholder |
| **Ödüller (awards)** | ✅ | `/api/public/awards`; ödül listesi |

---

## 3. Akışlar

### 3.1 Ön izleme (Preview)

| Adım | Durum | Dosya / API |
|------|--------|-------------|
| Maç Kontrol’de "Ön izleme göster" | ✅ | `match_control_screens.js` → `/api/screens/preview` (view, payload) |
| Seyirci ekranında VS ekranı | ✅ | `applyVSPreviewPayload` (match, teams, event_name) |
| Süresiz / süreli preview | ✅ | `duration_seconds: 0` = süresiz; backend `_global_preview` |
| Maç başlayınca önizlemenin kalkması | ✅ | Backend thread: `current_state` autonomous/driver_controlled/end_game ise preview temizlenir |

### 3.2 Sonuç gösterimi

| Adım | Durum | Dosya / API |
|------|--------|-------------|
| Maç Kontrol’de "Sonuçları göster" | ✅ | `sendMatchResultsToScreens` → `buildMatchResultsPayloadForMatch` → `/api/screens/preview` (type: "results") |
| Seyirci ekranında sonuç paneli | ✅ | `applyResultsPayload` – skor, breakdown, KAZANAN, advancement_red/blue |
| Maç tamamlanınca sonucun kaldırılması | ✅ | `clearAudienceResultsView()` → `/api/screens/preview` (mode: "live") – maç tamamlama akışında çağrılıyor |

### 3.3 Canlı maç

| Adım | Durum | Dosya / API |
|------|--------|-------------|
| Aktif maç bilgisi (REST) | ✅ | `GET /api/match-control/audience-display` (match, skorlar, state, timer) |
| Canlı güncellemeler | ✅ | WebSocket: `match_update`, `scores_update` (ScoreCalculator backend’de) |
| Timer senkronizasyonu | ✅ | `server_timestamp` ile client tarafında geri sayım |
| Ses efektleri | ✅ | Otonom / Teleop / End Game / Post Match için `announceState` |

---

## 4. API Özeti

| Endpoint | Auth | Açıklama |
|----------|------|----------|
| `GET /audience` | Hayır | Seyirci ekranı sayfası |
| `GET /api/screens/view?screen_id=...` | Hayır | Aktif view, overlay, preview_payload |
| `POST /api/screens/heartbeat` | Hayır | Ekran kaydı (screen_id, view, …) |
| `GET /api/screens` | Evet | Bağlı ekran listesi (Maç Kontrol) |
| `POST /api/screens/settings` | Evet | Genel ayarlar (active_view, overlay, chroma) |
| `POST /api/screens/preview` | Evet | Ön izleme / sonuç gönder veya temizle (mode: live) |
| `GET /api/match-control/audience-display` | Hayır | Canlı maç (id, skorlar, state, timer) |
| `GET /api/public/next-match` | Hayır | Sıradaki maç (seyirci "Sıradaki maç" satırı) |
| `GET /api/public/inspection-status` | Hayır | İnceleme durumları |
| `GET /api/public/awards` | Hayır | Ödül listesi |

---

## 5. Tamamlanması / İyileştirilmesi Gerekenler

### 5.1 Sıralama ekranı (rankings)

- **Durum:** Panel var, içerik placeholder.
- **Yapılacak:** Sıralama puanları için backend’de public bir endpoint (örn. `/api/public/rankings`) ve seyirci ekranında bu veriyi çekip tablo/liste göstermek.
- **Not:** Sıralama hesaplaması `src/core/scoring/` altında mevcut; API ve view bağlantısı eklenmeli.

### 5.2 Header / Footer metinleri

- **Durum:** Varsayılan metinler (MEMSKOR, Türkiye Şampiyonası).
- **Öneri:** Etkinlik adı ve başlığı için `/api/public/event-info` gibi bir endpoint ile otomatik doldurulabilir (SEYIRCI_EKRAN_GELISTIRME.md’de belirtilmiş).

### 5.3 İlk yükleme / reconnect

- **Durum:** "Yükleniyor..." `aria-hidden` ile gizleniyor; reconnect sonrası ilk `match_update` gelene kadar aynı durum kalabilir.
- **Öneri:** Reconnect sonrası tek seferlik `loadScreenSettings()` veya `loadMatchView()` ile state’i hemen güncellemek (HAKEM_SEYIRCI raporunda not edilmiş).

### 5.4 QR kod

- **Durum:** Sonuç ekranında "… detaylı sonuçlar için tara" metni var; QR görseli yok.
- **Öneri:** İleride QR üreten bir API veya client tarafı kütüphane ile `audience_qr_placeholder` doldurulabilir.

### 5.5 Socket.IO CDN

- **Durum:** `cdn.socket.io` kullanılıyor; tam offline’da WebSocket bağlanmayabilir.
- **Öneri:** Tam offline için Socket.IO’yu projeye lokal almak (KULLANIMA_HAZIRLIK_KONTROL.md’de belirtilmiş).

---

## 6. Dosya Referansı (Modüler yapı)

| Dosya | Rol |
|-------|-----|
| `templates/audience_display.html` | Sayfa yapısı, header/footer, paneller |
| `static/js/audience_core.js` | AudienceCore: state, WebSocket, preview state machine |
| `static/js/audience_display_core.js` | screenId, heartbeat, audienceTeamsMap, fallback state |
| `static/js/audience_display_ui.js` | Timer, skor, overlay, chroma, ses efektleri |
| `static/js/audience_display_preview.js` | applyVSPreviewPayload, applyResultsPayload, hideResultsPanel |
| `static/js/audience_display_sse.js` | WebSocket fallback (start/stopAudienceSSE) |
| `static/js/audience_display_views.js` | updateMatchView, loadMatchView, loadInspectionView, loadAwardsView, loadNextMatchPreview |
| `static/js/audience_display.js` | DOMContentLoaded, AudienceCore init, subscribe, cleanup |
| `static/js/match_control_screens.js` | Sonuç gönderimi, clearAudienceResultsView, buildMatchResultsPayloadForMatch |
| `routes/screens.py` | /audience, /api/screens/*, WebSocket /audience, preview/thread |
| `routes/match_control.py` | /api/match-control/audience-display, /api/public/next-match |
| `app_web.py` | /api/public/awards, /api/public/inspection-status |

---

## 7. Hızlı Test Listesi

- [ ] `/audience` açıldığında "Yükleniyor" sonrası maç/view ekranı geliyor.
- [ ] Maç Kontrol’de maç başlatılınca seyirci ekranında skor/timer güncelleniyor.
- [ ] "Ön izleme göster" → seyirci ekranında VS (Kırmızı vs Mavi) görünüyor.
- [ ] "Sonuçları göster" → seyirci ekranında sonuç paneli (skor, KAZANAN, breakdown) görünüyor.
- [ ] Maç tamamlanınca (Maç Kontrol’de "Maçı tamamla") seyirci ekranındaki sonuç görünümü kalkıyor.
- [ ] Maç Kontrol → Ekranlar sekmesinde seyirci ekranı listeleniyor (heartbeat sonrası).
- [ ] Görünüm değiştir: İnceleme / Ödüller seçilince ilgili panel açılıyor.

Bu belge, seyirci ekranlarını "tamamlamak" için önce mevcut durumu kontrol etmek ve ardından yukarıdaki 5.x maddelerine göre ilerlemek için kullanılabilir.
