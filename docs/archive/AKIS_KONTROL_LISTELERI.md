# Akış Kontrol Listeleri – Final Maçları ve Baş Hakem Onayı

Bu belge, **final maçları** ve **baş hakem onayı** akışlarında adım adım yapılacakları listeler. Saha günü veya test sırasında bu listelerle takip edebilirsiniz.

---

## 1. Final Maçları Akışı

Final maçlarını oluşturup oynatmak için sırayla yapılacaklar.

### 1.1 Ön Koşullar

- [ ] **Sıralama maçları tamamlanmış** olmalı (en az bir maç `status = completed`).
- [ ] **SP puanları hesaplanmış** olmalı (maç tamamlandığında ranking_points kaydedilir).
- [ ] **En az 4 takım** olmalı (2 takım/ittifak için; daha fazla takım için `max_teams` ayarlanabilir).

### 1.2 Final Maçlarını Oluşturma (Kurulum / Setup)

1. [ ] **Giriş:** Admin veya etkinlik yöneticisi ile giriş yapın.
2. [ ] **Etkinlik seç:** Üstteki etkinlik seçiciden ilgili etkinliği seçin.
3. [ ] **Setup → Maç Takvimi** adımına gidin (`/setup` içinde “Maç Takvimi” adımı).
4. [ ] **Final ayarlarını doldurun:**
   - Başlangıç tarihi (YYYY-MM-DD)
   - Başlangıç saati (HH:MM)
   - Saha numarası (varsayılan: 1)
   - İttifak başına takım sayısı (varsayılan: 2)
   - Maksimum takım sayısı (boş = tüm takımlar; örn. 8)
   - Maç döngü süresi (dakika)
   - İstenirse: “Mevcut final maçlarını temizle” işaretleyin.
5. [ ] **SP sıralamasını kontrol (opsiyonel):** “SP Sıralamasını Görüntüle” ile tamamlanmış sıralama maçlarına göre sırayı kontrol edin.
6. [ ] **“Final Maçlarını Oluştur”** butonuna tıklayın.
7. [ ] Başarı mesajını ve oluşturulan maç sayısını kontrol edin; maç listesi yenilenecektir.

### 1.3 Final Maçını Oynatma (Maç Kontrol)

1. [ ] **Maç Kontrol** sayfasına gidin (`/match-control`).
2. [ ] **Takvim’de maç türü:** “Final” (veya ilgili tür) seçin; listelenen final maçlarından birini seçin.
3. [ ] **“Yükle”** ile maçı yükleyin.
4. [ ] **“Maçı Başlat”** (veya “Ön izleme göster” sonrası “Maçı Göster” → “Maçı Başlat”) ile maçı başlatın.
5. [ ] Timer ve skor girişi normal akışta devam eder (hakem panelleri + maç kontrol).
6. [ ] Maç bitince **“Sonuçları göster”** (isteğe bağlı) → **“Maçı Tamamla”** ile maçı tamamlayın.

**Not:** Final maçları da sıralama maçları gibi maç kontrol + hakem paneli + baş hakem onayı akışına tabidir.

---

## 2. Baş Hakem Onayı Akışı

Hakem girişlerinin baş hakem tarafından onaylanması ve maçın tamamlanması.

### 2.1 Ön Koşullar

- [ ] **Maç başlatılmış** olmalı (Maç Kontrol’de “Maçı Başlat” yapıldı).
- [ ] **İki hakem** (Kırmızı ve Mavi ittifak için) `/referee-panel` veya `/referee/red`, `/referee/blue` üzerinden giriş yapmış olmalı.

### 2.2 Hakem Girişi (Tabletler)

1. [ ] **Kırmızı ittifak hakemi:** `/referee-panel` veya `/referee/red` ile giriş yapar; skor ve gerekli alanları doldurur.
2. [ ] **“Maç Girişini Bitir”** (submit) ile girişi tamamlar.
3. [ ] **Mavi ittifak hakemi:** Aynı şekilde `/referee-panel` veya `/referee/blue` ile giriş yapar; **“Maç Girişini Bitir”** ile tamamlar.

**Not:** Her iki ittifak da “Maç Girişini Bitir” demeden baş hakem onayı yapılamaz.

### 2.3 Baş Hakem Onayı

1. [ ] **Baş hakem ekranı:** `/head-referee` ile giriş yapın.
2. [ ] **Aktif maç:** Ekranda o anki maçın Kırmızı/Mavi giriş durumları ve skorları görünür.
3. [ ] **Kontrol:** Her iki ittifak için “Giriş tamamlandı” (veya benzeri) göründüğünden emin olun.
4. [ ] **“Onayla”** (veya “Maçı Onayla”) butonuna tıklayın.
5. [ ] Onay sonrası maç kontrol ekranı anında güncellenir (WebSocket ile); maç artık “Maçı Tamamla” için hazırdır.

### 2.4 Maçı Tamamlama (Maç Kontrol)

1. [ ] **Maç Kontrol** sayfasında aynı maç seçili olsun.
2. [ ] **“Maçı Tamamla”** butonuna tıklayın.
3. [ ] Onay penceresinde skorları kontrol edip onaylayın.
4. [ ] Maç tamamlanır; skorlar veritabanına yazılır; **seyirci ekranındaki skor görünümü otomatik kaldırılır.**

---

## 3. Hızlı Referans

| Akış | Sayfa / Adres | Ana işlem |
|------|----------------|-----------|
| Final maçları oluşturma | Setup → Maç Takvimi | “Final Maçlarını Oluştur” |
| SP sıralamasını görme | Setup → Maç Takvimi | “SP Sıralamasını Görüntüle” |
| Final maçı oynatma | Maç Kontrol | Takvim’den final maçı seç → Yükle → Maçı Başlat |
| Hakem girişi | `/referee-panel` veya `/referee/red`, `/referee/blue` | Skor gir → “Maç Girişini Bitir” |
| Baş hakem onayı | `/head-referee` | “Onayla” |
| Maç tamamlama | Maç Kontrol | “Maçı Tamamla” |

---

## 4. Sık Karşılaşılan Durumlar

- **“Önce iki hakem de girişlerini tamamlamalı”:** Baş hakem onayı vermeden önce hem Kırmızı hem Mavi hakem “Maç Girişini Bitir” demelidir.
- **Final maçları oluşturulmuyor:** En az bir tamamlanmış sıralama maçı ve yeterli takım olduğunu kontrol edin; “SP Sıralamasını Görüntüle” ile sıralamanın dolu olduğunu doğrulayın.
- **Baş hakem ekranında maç görünmüyor:** Maçın başlatıldığından ve tüm cihazların aynı sunucuya (IP:5000) bağlı olduğundan emin olun; sayfayı yenileyin (Ctrl+F5).

---

## 5. Otomatik Tam Etkinlik Testi (27 Takım)

Sunucu çalışırken dummy verilerle uçtan uca test:

- **Kısa test (4 takım, 1 maç):** `python -m tests.test_full_event_cycle`
- **Geniş test (27 takım, sıralama + SP + final):** `python -m tests.test_full_event_cycle_27_teams`

27 takım testi: etkinlik oluşturur, 27 takım ekler, sıralama maç takvimi oluşturur, tüm sıralama maçlarını oynatır (SP kaydı için `scoring_data` complete ile gönderilir), SP sıralamasına göre final maçlarını oluşturur, bracket eşleşmesini doğrular (1–2 vs 8–7, 3–4 vs 6–5) ve birkaç final maçını kazanan/kaybeden sonuçlarıyla tamamlar.

---

*Bu listeler GERCEK_KULLANIM_REHBERI ve KULLANIMA_HAZIRLIK_KONTROL ile birlikte kullanılabilir.*
