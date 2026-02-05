# BRANCH MERGE FLOW - Sudem & Hasan → Main

## 1. MEVCUT DURUM ANALİZİ

### Branch Yapısı
- **main**: Base branch (son merge: Sudem'in bazı değişiklikleri - #1 PR)
- **origin/Hasan**: 5 yeni commit (WebSocket refactor + Chroma Key + Ranking/Bracket + Test)
- **origin/sudem**: 1 yeni commit (WebSocket altyapısı + Screens modern tasarım)

### Ortak Ata
Her iki branch de `f2f8321` commit'inden dallanmış.

---

## 2. ÖZELLİK HARİTASI

### HASAN BRANCH ÖZELLİKLERİ
1. **WebSocket Refactor**: SSE'den WebSocket'e geçiş (çok kapsamlı)
2. **Chroma Key (Yeşil Ekran)**: Seyirci ekranı için OBS uyumlu arka plan
3. **Ranking System**: Yeni ranking_config, ranking_points, team_rankings
4. **Bracket System**: bracket_config, bracket_generator (turnuva braketleri)
5. **Match Control İyileştirmeleri**: Aktif maç sıfırlama, senkronizasyon
6. **Head Referee Panel**: Gelişmiş hakem paneli özellikleri
7. **Dokümantasyon**: Birçok .md dosyası (temizlik yapılmış - çoğu silindi)
8. **Test Dosyaları**: Yeni test yapısı (tests/ klasörü)
9. **Dashboard İyileştirmeleri**: dashboard.js güncellemeleri

### SUDEM BRANCH ÖZELLİKLERİ
1. **WebSocket Altyapısı**: inspection_update, awards_update, rankings_update, match_completed events
2. **Screens Sayfası Modern Tasarım**: screens.html ve screens.js tamamen yeniden tasarım
3. **Audience Display Views**: inspection, awards, rankings view'ları için WebSocket entegrasyonu
4. **Style Güncellemeleri**: Modern CSS (screens için özellikle)
5. **Inspection Route**: inspection.py güncellemeleri

---

## 3. ÇAKIŞAN DOSYALAR VE STRATEJİ

| Dosya | Hasan | Sudem | Strateji |
|-------|-------|-------|----------|
| `app_web.py` | +18 satır | +10 satır | Her ikisini birleştir |
| `routes/match_control.py` | +227 satır | +30 satır | Hasan'ınki baz, Sudem ekle |
| `routes/screens.py` | +65 satır (chroma) | +10 satır | Hasan'ınki baz |
| `static/js/audience_core.js` | +116 satır (chroma+timer) | +76 satır (events) | HER İKİSİ GEREKLİ |
| `static/js/audience_display.js` | +40 satır | +87 satır | Birleştir |
| `static/js/audience_display_views.js` | +71 satır | +170 satır | Birleştir |
| `static/style.css` | +924 satır | +893 satır | Dikkatli birleştir |
| `templates/audience_display.html` | +158 satır (chroma) | +42 satır | Birleştir |

---

## 4. MERGE STRATEJİSİ

### Önerilen Yaklaşım: "Hasan Base + Sudem Cherry-Pick"

**Neden?**
- Hasan'ın branch'ı daha kapsamlı değişiklikler içeriyor (5 commit vs 1 commit)
- Hasan WebSocket'i zaten refactor etmiş, Sudem ek event'ler eklemiş
- Hasan Chroma Key özelliğini eklemiş (kritik)
- Sudem'in screens tasarımı Hasan'da yok - bu eklenecek

### Adımlar:
1. Yeni bir merge branch oluştur: `merge-all-features`
2. Önce Hasan'ı merge et (base olarak)
3. Sudem'in benzersiz değişikliklerini cherry-pick veya manuel ekle
4. Çakışmaları çöz
5. Test et
6. Main'e push et

---

## 5. BENZERSİZ DOSYALAR (ÇAKIŞMA YOK)

### Sadece Hasan'da (ALINACAK):
- `routes/match_schedule.py` ✓
- `routes/referee_panel.py` güncellemeleri ✓
- `src/core/scoring/ranking_config.py` ✓
- `src/core/scoring/team_rankings.py` ✓
- `src/core/tournament/bracket_config.py` ✓
- `src/core/tournament/bracket_generator.py` ✓
- `static/js/head_referee.js` güncellemeleri ✓
- `static/js/match_schedule.js` ✓
- `tests/` klasörü ✓
- `production_server.py` ✓

### Sadece Sudem'de (ALINACAK):
- `routes/inspection.py` güncellemeleri ✓
- `static/js/screens.js` ✓ (Modern tasarım)
- `templates/screens.html` ✓ (Modern tasarım)
- `templates/dashboard.html` küçük değişiklik ✓

---

## 6. BAŞARI KRİTERLERİ

1. ✅ WebSocket tüm ekranlarda çalışıyor
2. ✅ Chroma Key (yeşil ekran) özelliği çalışıyor
3. ✅ Screens sayfası modern tasarımla çalışıyor
4. ✅ Inspection, Awards, Rankings güncellemeleri anlık geliyor
5. ✅ Match Control tüm özellikleriyle çalışıyor
6. ✅ Ranking sistemi çalışıyor
7. ✅ Bracket generator çalışıyor
8. ✅ Tüm testler geçiyor
9. ✅ Syntax/lint hatası yok
