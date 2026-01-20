# Agent Kayıtları

## 2026-01-17 — WiFi Kanal Atama
- API eklendi: `routes/wifi.py`
  - `GET /api/wifi/settings`
  - `POST /api/wifi/settings`
  - `POST /api/wifi/assign`
  - `POST /api/wifi/clear`
- Varsayılan event verisi güncellendi: `src/core/event_setup.py`
  - `event.wifi` alanı eklendi (supported/allowed channels, assignments, scan_notes, assignment_mode, last_assigned_at).
- UI eklendi: `templates/setup/step_wifi.html`
  - Kanal seçimi, yoğunluk notları, atama modu, takım listesi.
- Frontend logic eklendi: `static/js/wifi.js`
  - Kanal seçimi, ayar kaydı, atama, özet ve tablo render.
- Setup bağlantıları güncellendi:
  - `static/js/setup.js` → `initializeStep("wifi")`
  - `templates/setup.html` → `wifi.js` script eklendi.

## 2026-01-17 — Maç Takvimi / Deneme Maçları İyileştirmeleri
- Deneme maçlarında çakışma algılanınca artık doğru şekilde ilerleniyor:
  - `routes/practice_matches.py` → çakışma sonrası `continue`.
- Sıralama maçlarında ittifak renk dengesi ve streak etkisi eklendi:
  - `routes/match_schedule.py` → `color_preference_score` ve red/blue dağıtımı.
- Sıralama maçları grid görünümü:
  - `static/js/match_schedule.js` → tarih normalize (YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY),
    otomatik tarih fallback, güvenli `match_number` render.
  - `static/js/match_schedule.js` → `setMatchView` güvenli hale getirildi (liste/grid görünümü).
- Sıralama maçları sayfasında "tek anda tek maç" uyarısı eklendi:
  - `templates/setup/step_match_schedule.html`.
- Deneme maçları yazdırma çıktısına mola/yemek özeti eklendi:
  - `static/js/practice_matches.js`.
- Sıralama maçları yazdırma işleminde liste görünümü zorlanıyor:
  - `static/js/setup.js`.

## 2026-01-18 — FTC Benzeri Hakem Paneli Sistemi
- **3 Ayrı Hakem Ekranı** oluşturuldu:
  - `GET /referee/red` → Kırmızı İttifak Hakemi
  - `GET /referee/blue` → Mavi İttifak Hakemi
  - `GET /head-referee` → Baş Hakem (maç kontrol ekranına gitmez)
- **Hakem Meta Sistemi** eklendi (`src/core/scoring/realtime.py`):
  - `referee_meta` yapısı: `red.submitted`, `blue.submitted`, `head.approved`
  - Her hakem girişini tamamladığında `submitted: true` olur
  - Baş hakem her iki hakem de tamamladıktan sonra onaylayabilir
  - Yeni giriş yapılırsa `submitted` otomatik `false` olur
- **API Endpoint'leri** (`routes/referee_panel.py`):
  - `POST /api/referee/submit` → Hakem girişini tamamlar
  - `POST /api/referee/approve` → Baş hakem onaylar
  - `GET /api/referee/active-match` → Aktif maç bilgisi (match-control ile senkronize)
  - `GET /api/referee/score/get/<match_id>` → Skor ve meta bilgisi
  - `POST /api/referee/score/update` → Skor güncelleme (match_source desteği eklendi)
- **Gerçek Zamanlı Güncellemeler**:
  - Hakem paneli ve baş hakem ekranı SSE ile skor güncellemelerini alır
  - Match control ekranı hakem girişlerini anlık görür
  - Tüm değişiklikler canlı skor ekranına yansır
- **Hakem Paneli UI** (`templates/referee_panel.html`):
  - Detaylı skorlama formu (OTONOM + SÜRÜCÜ KONTROLLÜ + CEZALAR)
  - "Maç Girişini Bitir" butonu (submit durumunu gösterir)
  - Takım bilgileri ve saha numarası gösterimi
- **Baş Hakem Ekranı** (`templates/head_referee.html`, `static/js/head_referee.js`):
  - Her iki ittifakın skorlarını ve durumlarını gösterir
  - Hakem giriş durumlarını takip eder
  - "Maçı Onayla" butonu (sadece her iki hakem tamamladığında aktif)
- **Dashboard Linkleri** güncellendi (`templates/dashboard.html`):
  - Kırmızı/Mavi İttifak Hakemi → `/referee/red`, `/referee/blue`
  - Baş Hakem → `/head-referee` (artık match-control'a gitmez)
- **Maç Tamamlama Hatası** düzeltildi (`routes/match_control.py`):
  - `complete_match` fonksiyonunda `match_source` eksikliği giderildi
- **Önizleme Modu** eklendi (`routes/match_control.py`):
  - `POST /api/match-control/preview` → Maçı önizleme durumuna alır (DB status değişmez)
  - `GET /api/match-control/active` → Önce in_progress, sonra preview maçı döner
  - Hakem tabletleri önizleme maçını görebilir
- **Match Control SSE Güncellemesi** (`static/js/match_control.js`):
  - SSE mesajlarından gelen skor verileri otomatik forma uygulanır
- **Stil Güncellemeleri** (`static/style.css`):
  - Baş hakem status kartları için CSS eklendi