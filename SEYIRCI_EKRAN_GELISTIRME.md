# Seyirci Ekranı Geliştirme Rehberi

Bu belge, seyirci ekranlarının (audience display) etkinlik aşamasına göre nasıl çalıştığını ve otomasyonu açıklar. Gönüllüler modüler yapıyı bozmadan geliştirme yapabilir.

## Genel Yapı

- **Üst bar (header):** Etkinlik adı | Maç bilgisi | Marka
- **Alt bar (footer):** Etkinlik adı, etkinlik başlığı (örn. Türkiye Şampiyonası), marka
- **Sıradaki maç (Up Next):** Tam sayfa – "Sıradaki" | Maç no | Etkinlik; Kırmızı ittifak | VS | Mavi ittifak
- **Canlı maç:** Üst bar (Kırmızı skor | Timer | Mavi skor), chroma alanı
- **Maç sonucu (Results):** Etkinlik aşamasına göre otomatik düzenlenir (sıralama / eleme-final)

## Etkinlik Aşamasına Göre Ekranlar

### Sıralama (qualification)

- Başlık: "Maç Sonucu", alt başlık: "Sıralama #29"
- Büyük skorlar, KAZANAN rozeti (kazanan ittifak tarafında)
- Kategori özeti: Otonom, Teleop, Ceza, SP, Sarı/Kırmızı kart
- Takım rozetleri (takım numaraları)
- "Bir sonraki maç" kutusu gösterilmez (eleme için kullanılır)

### Eleme / Final (elimination, final)

- Başlık: "Maç Sonucu", alt başlık: "Maç 7"
- Aynı skor ve breakdown yapısı
- İsteğe bağlı: "Bir sonraki: Eleme Maçı 9 – Kırmızı İttifak olacak" (payload'da `advancement_red` / `advancement_blue` varsa otomatik gösterilir)

## Otomasyon (İnsan Hatasını Azaltma)

- **Tüm veri API / WebSocket’ten gelir.** Seyirci ekranında manuel skor veya maç girişi yok.
- **Sıradaki maç:** Maç kontrolünden "Ön izleme göster" ile gönderilen payload (match, teams, event_name) kullanılır. Maç türüne göre "Sıralama #X" veya "Maç X" otomatik yazılır.
- **Maç sonucu:** "Sonuçları göster" ile gönderilen payload (match, results) kullanılır. Kazanan, skorlar ve breakdown tamamen payload’dan okunur; KAZANAN rozeti kazanan ittifak tarafında otomatik gösterilir.
- **Skor ekranının kaldırılması (ayrı modül):** Maç tamamlandığında seyirci ekranındaki skor/sonuç görünümü otomatik kaldırılır; böylece hakemler düzenleme yaparken skor ekranda görünmez. Bu davranış `match_control_screens.js` içindeki `clearAudienceResultsView()` ile yapılır ve maç tamamlama akışında (`completeMatch`) çağrılır.
- **Header/Footer:** Şu an varsayılan metin (MEMSKOR, Türkiye Şampiyonası). İleride `/api/public/event-info` gibi bir endpoint ile etkinlik adı otomatik doldurulabilir.

## Modül Dosyaları

| Dosya | Amaç |
|-------|------|
| `templates/audience_display.html` | HTML yapısı: header, footer, VS preview, match view, results (stage-aware), QR alanı |
| `static/style.css` | `.audience-header`, `.audience-footer`, `.vs-divider`, `.audience-results-main`, `.audience-results-winner-badge`, `.audience-advancement`, `.audience-qr-area` |
| `static/js/audience_display_preview.js` | `applyVSPreviewPayload`, `applyResultsPayload`, `getResultsSubtitleForMatch` – maç türü ve stage’e göre metin/layout |
| `static/js/audience_display_views.js` | `updateMatchView`, `loadNextMatchPreview` – canlı maç ve sıradaki maç metni |
| `static/js/match_control_screens.js` | `sendMatchResultsToScreens`, `buildMatchResultsPayloadForMatch` – sonuç gönderme; **`clearAudienceResultsView`** – maç tamamlandığında seyirci ekranındaki skor görünümünü kaldırır (ayrı modül) |

## Sonuç Payload’ına Opsiyonel Alanlar

Maç kontrolünde "Sonuçları göster" kullanıldığında seyirci ekranı şu alanları kullanır:

- `match`: `match_number`, `match_type`, `field_number`, `red_alliance`, `blue_alliance`
- `results`: `winner`, `red_score`, `blue_score`, `red_auto_total`, `red_teleop_total`, `red_penalty_total`, `red_sp_total`, `red_yellow_cards`, `red_red_cards` (mavi için aynıları)
- İsteğe bağlı: `results.advancement_red`, `results.advancement_blue` – eleme/final ekranında "Bir sonraki: …" metni

Eleme maçları için bracket/advancement bilgisi backend’den veya match control’den bu alanlara yazılırsa, seyirci ekranında ek işlem yapmadan otomatik gösterilir.

## QR Kod / Detaylı Sonuçlar

Maç sonucu ekranında "… detaylı sonuçlar için tara" metni otomatik yazılır (maç türüne göre "Sıralama #X" veya "Maç X"). QR kod görseli ileride aynı sayfada veya ayrı bir API ile üretilip `audience_qr_placeholder` alanına bindirilebilir; mevcut yapı buna uyumludur.
