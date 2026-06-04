# Kullanıma Hazırlık – Sistematik Kontrol Listesi

Bu belge, yazılımı kullanıma almadan önce yapılması önerilen kontrolleri ve tespit edilen eksiklik/düzeltmeleri özetler.

---

## 1. Kritik Düzeltmeler (Yapıldı / Yapılacak)

| Konu | Durum | Açıklama |
|------|--------|----------|
| **Seyirci ekranı URL** | Düzeltildi (dokümantasyon) | Gerçek URL `/audience`; dokümantasyonda `/audience-display` yazıyordu. GERCEK_KULLANIM_REHBERI.md güncellendi. |
| **ScoreCalculator import** | Zaten düzeltilmiş | routes/screens.py içinde `from src.core.scoring import ScoreCalculator` mevcut (HAKEM_SEYIRCI raporunda belirtilen kritik hata giderilmiş). |
| **Hakem paneli "Aktif maç yok" kartı** | Zaten düzeltilmiş | Mesaj metni `#no_match_message_text` ile güncelleniyor; yapı bozulmuyor. |
| **Maç tamamlandığında skor ekranı** | Zaten eklendi | `clearAudienceResultsView()` maç tamamlandığında seyirci ekranından skor kaldırılıyor. |

---

## 2. Dokümantasyon Tutarlılığı

- **Seyirci ekranı adresi:** Tüm rehberlerde **`http://[SUNUCU_IP]:5000/audience`** kullanılmalı ( `/audience-display` değil).
- **Maç kontrol / Hakem / Seyirci linkleri:** GERCEK_KULLANIM_REHBERI ve CALISTIRMA_REHBERI aynı URL’leri kullanmalı.

---

## 3. Saha Öncesi Kontrol Listesi (Operatör)

- [ ] **Python 3.8+** ve **pip** yüklü.
- [ ] **Bağımlılıklar:** `pip install -r requirements.txt` (waitress dahil).
- [ ] **Production:** `python production_server.py` veya `FLASK_ENV=production` ile `app_web.py`.
- [ ] **Ağ:** Tüm cihazlar aynı WiFi’de; sunucu IP biliniyor (örn. 192.168.1.100).
- [ ] **Veritabanı yedeği:** `src/resources/data.db` etkinlik öncesi/sonrası yedeklendi.
- [ ] **Kullanıcılar:** Giriş hesapları ve roller (maç kontrol, hakem) ayarlandı.
- [ ] **Etkinlik seçimi:** Yarışma günü etkinliği üstte seçili.
- [ ] **Seyirci ekranı:** Bir tarayıcıda `http://[SUNUCU_IP]:5000/audience` açık; ekran maç kontrol ile aynı ağda.
- [ ] **Hakem tabletleri:** `/referee-panel` (ve gerekirse `/referee/red`, `/referee/blue`) doğru adreslerle açıldı.
- [ ] **Maç kontrol:** `/match-control` sayfasından bir maç “Yükle” → “Maçı Başlat” ile test edildi.

---

## 4. Bilinen Sınırlamalar ve Riskler

| Konu | Öneri |
|------|--------|
| **Socket.IO CDN** | Seyirci ekranı ve hakem paneli `cdn.socket.io` kullanıyor. İnternet kesilirse sayfa açılır ama WebSocket bağlanmayabilir. Tam offline için Socket.IO’yu projeye lokal almak gerekir. |
| **HTTPS** | Varsayılan HTTP. Güvenli ağ gerekiyorsa önde nginx vb. ile HTTPS kullanılmalı. |
| **MatchCore bağımlılığı** | Hakem paneli MatchCore + WebSocket’e dayanıyor. Script sırası (match_core.js önce) ve tarayıcı önbelleğinin güncel olması önemli. |
| **Reconnect sonrası** | Audience disconnect/reconnect sonrası `subscribe_audience` tekrar gidiyor; ilk `match_update` gelene kadar “Yükleniyor” kalabilir. Gerekirse sayfa yenilenir. |
| **Preview temizleme** | Sonuç ekranı kaldırıldığında client 3 kontrol döngüsü boyunca preview’ı korur (geçici API hatalarında yanlış silmeyi önlemek için). |

---

## 5. Hata Durumunda Hızlı Kontrol

- **“Aktif maç yok”:** Maç kontrol → Takvim’den maç seç → Yükle → Maçı Başlat.
- **Seyirci ekranında skorlar güncellenmiyor:** Backend logunda `ScoreCalculator`/import hatası var mı kontrol et; tüm cihazlar aynı sunucuya (IP:5000) bağlı mı kontrol et.
- **Timer senkron değil:** Tüm cihazlar aynı sunucuya bağlı mı; sayfa yenileme (Ctrl+F5).
- **WebSocket bağlanamıyor:** Ağ/firewall, `http://[SUNUCU_IP]:5000` erişilebilirliği; log: `logs/app.log`.
- **Maç tamamlandı ama skor ekranı hâlâ görünüyor:** “Maçı tamamla” ile `clearAudienceResultsView()` otomatik çağrılır; çağrı başarısızsa API/network logları kontrol edilir.

---

## 6. Akış Kontrol Listeleri

Belirli akışlar için adım adım listeler **AKIS_KONTROL_LISTELERI.md** dosyasında yer alır:

- **Final maçları akışı:** Ön koşullar, final maçlarını oluşturma (Setup → Maç Takvimi), final maçını oynatma (Maç Kontrol).
- **Baş hakem onayı akışı:** Hakem girişi (Kırmızı/Mavi “Maç Girişini Bitir”), baş hakem onayı (`/head-referee` → Onayla), maç tamamlama.

Saha günü veya test sırasında bu listelerle takip edebilirsiniz.

---

## 7. Özet

- Kritik kod hataları (ScoreCalculator import, hakem paneli mesaj yapısı) raporlara göre giderilmiş durumda.
- Seyirci ekranı URL’i dokümantasyonda **`/audience`** olarak tutarlı hale getirildi.
- Kullanıma almadan önce **GERCEK_KULLANIM_REHBERI** ve bu kontrol listesi ile saha öncesi adımların uygulanması önerilir.
- **AKIS_KONTROL_LISTELERI.md** ile final maçları ve baş hakem onayı akışları adım adım takip edilebilir.
- İlk canlı kullanımda en az bir kez tam maç akışı (başlat → skor gir → tamamla → seyirci ekranında skor kalktı mı) test edilmesi faydalıdır.
