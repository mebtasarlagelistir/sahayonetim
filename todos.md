# MERGE İŞLEMİ TODO LİSTESİ

## Aşama 1: Hazırlık
- [x] 1.1 Yeni merge branch oluştur: `git checkout -b merge-all-features main`
- [x] 1.2 Tüm remote branch'ları fetch et: `git fetch --all`

## Aşama 2: Hasan Branch'ını Merge Et (Base)
- [x] 2.1 Hasan branch'ını merge et: `git merge origin/Hasan --no-commit`
- [x] 2.2 Merge conflict varsa analiz et ve çöz (5 conflict bulundu)
- [x] 2.3 Merge'i commit et

## Aşama 3: Sudem'in Benzersiz Değişikliklerini Ekle
- [ ] 3.1 Sudem'in screens.html dosyasını kontrol et ve gerekirse al
- [ ] 3.2 Sudem'in screens.js dosyasını kontrol et ve gerekirse al
- [ ] 3.3 Sudem'in inspection.py güncellemelerini kontrol et
- [ ] 3.4 Sudem'in audience_core.js WebSocket event'lerini ekle (inspection_update, awards_update, rankings_update, match_completed)
- [ ] 3.5 Sudem'in audience_display_views.js güncellemelerini kontrol et
- [ ] 3.6 Sudem'in style.css modern tasarım değişikliklerini kontrol et

## Aşama 4: Çakışma Çözümü (Detaylı)
- [ ] 4.1 app_web.py: Her iki tarafın route'larını birleştir
- [ ] 4.2 routes/match_control.py: Hasan'ınki base, Sudem'in eklemelerini kontrol et
- [ ] 4.3 routes/screens.py: Chroma key özelliği korunmalı
- [ ] 4.4 audience_core.js: Chroma key (Hasan) + WebSocket events (Sudem) birleştir
- [ ] 4.5 audience_display.js: Her iki tarafın değişikliklerini birleştir
- [ ] 4.6 audience_display_views.js: Her iki tarafın view güncellemelerini birleştir
- [ ] 4.7 static/style.css: Modern tasarım + Chroma key stilleri birleştir
- [ ] 4.8 templates/audience_display.html: Chroma key + Sudem'in değişiklikleri birleştir

## Aşama 5: Test ve Doğrulama
- [ ] 5.1 Python syntax kontrolü: `python -m py_compile app_web.py`
- [ ] 5.2 Tüm route'ların import edildiğini kontrol et
- [ ] 5.3 Sunucuyu başlat ve hata olup olmadığını kontrol et
- [ ] 5.4 WebSocket bağlantısını test et
- [ ] 5.5 Chroma key özelliğini test et
- [ ] 5.6 Screens sayfasının çalıştığını kontrol et
- [ ] 5.7 Mevcut testleri çalıştır

## Aşama 6: Finalizasyon
- [ ] 6.1 Gereksiz .md dokümantasyon dosyalarını temizle
- [ ] 6.2 Final commit yap
- [ ] 6.3 Main'e merge et veya PR oluştur
- [ ] 6.4 Kullanıcıdan final onay al
