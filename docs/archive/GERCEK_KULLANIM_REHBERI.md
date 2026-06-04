# Gerçek Kullanım Rehberi – Saha / Etkinlik

Bu rehber, MEMSKOR’u **gerçek hayatta** (saha, etkinlik, yarışma günü) kullanmak için yapılacakları ve dikkat edilecekleri özetler. Temel amaç: uygulamanın saha koşullarında güvenilir çalışması.

---

## 1. Saha Öncesi Kontrol Listesi

### Yazılım ve Ortam

- [ ] **Python 3.8+** yüklü (`python --version`)
- [ ] **Bağımlılıklar** yüklü: `pip install -r requirements.txt`
- [ ] **Waitress** yüklü (production sunucu): `pip install waitress`
- [ ] **Production modu** kullanılacak: `FLASK_ENV=production` (veya `production_server.py` ile çalıştırma)

### Ağ

- [ ] Tüm cihazlar **aynı WiFi ağında** (maç kontrol PC, hakem tabletleri, seyirci ekranı)
- [ ] Sunucu çalışacak bilgisayarın **sabit IP** veya DHCP’den alınan IP’si biliniyor
- [ ] Gerekirse router’da **port 5000** açık / yönlendirme yapıldı

### Veri ve Yedekleme

- [ ] **Veritabanı yedeği:** `src/resources/data.db` düzenli yedekleniyor (etkinlik öncesi ve sonrası)
- [ ] Etkinlik/maç/takım verileri **Kurulum (Setup)** üzerinden kontrol edildi

### Kullanıcılar ve Roller

- [ ] Giriş yapacak kullanıcılar oluşturuldu (Dashboard veya Setup → Hesaplar)
- [ ] Roller atandı: Maç kontrol için yetkili, hakem panelleri için hakem hesapları

---

## 2. Production’da Çalıştırma

### Önerilen: Production sunucu (Waitress)

```bash
# Proje klasöründe
python production_server.py
```

- **Port:** 5000  
- **Adres:** Tüm ağ arayüzleri (`0.0.0.0`) – aynı ağdaki tablet/telefonlar bağlanabilir  
- **Ortam:** `FLASK_ENV=production` otomatik ayarlanır (debug kapatılır)  
- **Log:** `logs/app.log`

### Alternatif: Flask ile production modu

```bash
set FLASK_ENV=production
python app_web.py
```

**Not:** Yoğun kullanımda (çok sayıda cihaz) `production_server.py` (Waitress) kullanılması önerilir.

### Erişim adresleri

- Sunucu PC’den: `http://127.0.0.1:5000`  
- Aynı ağdaki diğer cihazlardan: `http://[SUNUCU_IP]:5000`  
  Örnek: `http://192.168.1.100:5000`

- **Maç kontrol:** `http://[SUNUCU_IP]:5000/match-control`  
- **Hakem paneli:** `http://[SUNUCU_IP]:5000/referee-panel`  
- **Baş hakem:** `http://[SUNUCU_IP]:5000/head-referee`  
- **Seyirci ekranı:** `http://[SUNUCU_IP]:5000/audience`  
- **Giriş / Dashboard:** `http://[SUNUCU_IP]:5000/`

---

## 3. Saha Günü Akışı (Özet)

1. **Sunucuyu başlat:** `python production_server.py` (veya FLASK_ENV=production ile app_web.py).
2. **Giriş yap:** Dashboard’a admin/etkinlik yöneticisi ile gir.
3. **Etkinlik seç:** Üstteki etkinlik seçiciden yarışma günü etkinliğini seç.
4. **Maç kontrol:** `/match-control` sayfasından Takvim’den maç seç → Yükle → Maçı Başlat. Timer (OKS 30 sn, SKS 120 sn) ve puan girişi buradan yönetilir.
5. **Hakem tabletleri:** Her hakem `/referee-panel` ile giriş yapar; atanan ittifak skorunu girer ve “Maç Girişini Bitir” der. Baş hakem `/head-referee` ile onaylar.
6. **Seyirci ekranı:** `/audience` büyük ekranda açık tutulur; canlı skor ve timer otomatik güncellenir.

---

## 4. Bilinen Noktalar ve Sınırlamalar

- **Seyirci ekranı (Socket.IO):** Şu an CDN üzerinden `socket.io` yüklenir. İnternet yoksa sayfa açılır ama WebSocket bağlantısı kurulamayabilir. Tam offline kullanım için ileride Socket.IO kütüphanesi projeye lokal eklenebilir.
- **HTTPS:** Varsayılan çalışma HTTP ile. Güvenli ağ gerekiyorsa önde bir reverse proxy (nginx vb.) ile HTTPS kullanılmalı; bu rehberin kapsamı dışındadır.
- **Veritabanı:** Tüm veri `src/resources/data.db` (SQLite) içindedir. Bu dosyanın yedeği alınmalıdır.

---

## 5. Hata Durumunda

- **“Aktif maç yok”:** Maç kontrol sayfasından bir maç seçip “Yükle” ve “Maçı Başlat” yapıldığından emin olun.
- **Timer ilerlemiyor / senkron değil:** Tüm cihazların aynı sunucuya (aynı IP:5000) bağlı olduğunu kontrol edin; sayfayı yenileyin (Ctrl+F5).
- **Puanlar kayboluyor:** Sadece maç değiştiğinde form güncellenir; aynı maçta puan yazarken silinmemesi gerekir. Sorun sürerse tarayıcı konsolunu (F12) kontrol edin.
- **Seyirci ekranında skorlar güncellenmiyorsa:** Tüm cihazların aynı sunucuya bağlı olduğunu kontrol edin; sayfayı yenileyin. Sorun sürerse sunucu logunda (`logs/app.log`) “ScoreCalculator” veya “Audience” ile ilgili hata var mı bakın.
- **WebSocket bağlanamıyor:** Ağ/VPN/firewall ve “http://[SUNUCU_IP]:5000” erişilebilirliğini kontrol edin. Log: `logs/app.log`.

---

## 6. Kısa Teknik Özet

| Konu | Ayar / Konum |
|------|-------------------------------|
| Production modu | `FLASK_ENV=production` veya `python production_server.py` |
| Maç süreleri | OKS 30 sn, SKS 120 sn – `src/core/constants.py`, `static/js/constants.js` |
| Veritabanı | `src/resources/data.db` |
| Log | `logs/app.log` |
| Secret key | `src/resources/secret.key` (otomatik oluşturulur) |

---

*Bu rehber, projenin gerçek kullanıma hazırlanması amacıyla güncel duruma göre yazılmıştır. Saha deneyimine göre maddeler güncellenebilir.*
