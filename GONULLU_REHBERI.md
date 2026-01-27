# Gönüllü Geliştirici Rehberi

Bu rehber, MEMSKOR projesine katkıda bulunmak isteyen gönüllü geliştiriciler için hazırlanmıştır.

## 🎯 Proje Hakkında

MEMSKOR, MEM Tasarla Geliştir Yarışması için geliştirilmiş bir yarışma yönetim sistemidir. FTC benzeri bir yapıda, web tabanlı ve modüler olarak tasarlanmıştır.

## 📋 Bugünkü Durum (2026-01-18)

### ✅ Tamamlanan Özellikler

1. **FTC Benzeri Hakem Paneli Sistemi**
   - 3 ayrı ekran: Kırmızı İttifak, Mavi İttifak, Baş Hakem
   - Her hakem kendi ittifakını puanlar
   - Baş hakem tüm girişleri görüp onaylar

2. **Hakem Giriş Akışı**
   - Hakemler "Maç Girişini Bitir" ile tamamlar
   - Baş hakem her iki hakem tamamladıktan sonra onaylar
   - Yeni değişiklik yapılırsa submit durumu sıfırlanır

3. **Gerçek Zamanlı Senkronizasyon**
   - Tüm ekranlar **WebSocket** ile anlık güncellenir (SSE yerine WebSocket kullanılıyor)
   - Hakem girişleri match control ekranında anında görünür
   - Canlı skor ekranı otomatik güncellenir
   - Timer senkronizasyonu için server_timestamp kullanılır (tüm cihazlarda aynı zaman)

4. **Modüler Puanlama Sistemi**
   - Puanlama kuralları `src/core/scoring/config.py` dosyasında
   - Kolayca güncellenebilir yapı
   - Oyun değiştiğinde sadece config güncellenir

### 🔍 Test Edilmesi Gerekenler

Aşağıdaki özellikler bugün eklenmiş ancak henüz test edilmemiştir:

1. **Hakem Paneli Akışı**
   - [ ] Kırmızı hakem ekranı açılıyor mu?
   - [ ] Mavi hakem ekranı açılıyor mu?
   - [ ] Baş hakem ekranı açılıyor mu?
   - [ ] Aktif maç görünüyor mu?
   - [ ] Skor girişi çalışıyor mu?
   - [ ] "Maç Girişini Bitir" butonu çalışıyor mu?
   - [ ] Baş hakem onayı çalışıyor mu?

2. **Gerçek Zamanlı Güncellemeler**
   - [ ] SSE bağlantısı kuruluyor mu?
   - [ ] Skor güncellemeleri anında yansıyor mu?
   - [ ] Bağlantı koptuğunda otomatik yeniden bağlanıyor mu?

3. **Önizleme Modu**
   - [ ] Önizleme butonu çalışıyor mu?
   - [ ] Hakem tabletleri önizleme maçını görüyor mu?

4. **Maç Tamamlama**
   - [ ] Maç tamamlama çalışıyor mu?
   - [ ] Match source doğru işleniyor mu?

## 🛠️ Nasıl Katkıda Bulunabilirsiniz?

### 1. Test Etme

En önemli katkı şu anda **test etmek**:

1. Projeyi çalıştırın:
   ```bash
   python app_web.py
   ```

2. Tarayıcıda açın: `http://127.0.0.1:5000`

3. Test senaryolarını çalıştırın:
   - Maç oluşturun
   - Maçı başlatın
   - Hakem ekranlarını açın
   - Skor girişi yapın
   - Submit/Approve akışını test edin

4. Bulduğunuz hataları kaydedin:
   - Hata mesajı
   - Adımlar (ne yaptınız?)
   - Beklenen davranış
   - Gerçek davranış

### 2. Kod İyileştirmeleri

#### Modüler Yapıyı Koruyun

Her modül bağımsız çalışabilmeli:

```python
# ✅ İYİ: Modüler yapı
def register_referee_panel_routes(bp, datastore, require_login):
    """Hakem paneli route'larını kaydeder."""
    # Modül kendi içinde tamamlanmış
```

```python
# ❌ KÖTÜ: Bağımlı yapı
def register_referee_panel_routes(bp):
    # Diğer modüllere bağımlı
    from routes.match_control import something
```

#### Dokümantasyon Ekleyin

Her fonksiyona açıklama ekleyin:

```python
def referee_submit_match():
    """
    Hakemin maç girişini tamamladığını işaretler.
    
    Bu fonksiyon:
    1. Hakem meta bilgisini günceller
    2. Gerçek zamanlı yöneticiye bildirir
    3. Veritabanına kaydeder
    
    Returns:
        JSON: {"ok": true, "referee_meta": {...}}
    """
```

### 3. Hata Düzeltme

#### Yaygın Hatalar

1. **"Aktif maç yok" hatası**
   - Çözüm: `GET /api/match-control/active` endpoint'ini kontrol edin
   - Maç `in_progress` durumunda mı?

2. **WebSocket bağlantı hatası**
   - Çözüm: Tarayıcı konsolunu kontrol edin
   - Network sekmesinde WebSocket bağlantısı var mı? (WS veya WSS protokolü)
   - Socket.IO client library yüklendi mi? (CDN'den)
   - Console'da "WebSocket bağlantısı kuruldu" mesajı görünüyor mu?

3. **Submit/Approve çalışmıyor**
   - Çözüm: Backend loglarını kontrol edin (`logs/app.log`)
   - Session bilgisi doğru mu?

### 4. Özellik Geliştirme

#### Yeni Özellik Ekleme Adımları

1. **Planlama**
   - Özellik hangi modüle ait?
   - Veritabanı değişikliği gerekiyor mu?
   - API endpoint'leri neler olmalı?

2. **Backend (Python)**
   - `routes/` klasöründe yeni Blueprint modülü
   - `src/core/storage/` içinde veritabanı metodları
   - `app_web.py` içinde Blueprint kaydı

3. **Frontend (JavaScript)**
   - `static/js/` içinde yeni modül
   - `templates/` içinde HTML şablonu
   - `static/style.css` içinde stiller

4. **Test**
   - Manuel test
   - Farklı senaryolar
   - Hata durumları

## 📚 Önemli Dosyalar

### Dokümantasyon
- `README.md` - Genel proje bilgisi
- `DEVELOPMENT.md` - Geliştirici rehberi
- `API_DOKUMANTASYONU.md` - API endpoint'leri
- `SCORING_SYSTEM_README.md` - Puanlama sistemi
- `STORAGE_MODULES_README.md` - Veritabanı modülleri
- `AGENT_LOG.md` - Yapılan değişiklikler

### Kod Modülleri
- `routes/referee_panel.py` - Hakem paneli API'leri
- `routes/match_control.py` - Maç kontrol API'leri (WebSocket handler'ları içerir)
- `routes/screens.py` - Seyirci ekranları API'leri (WebSocket handler'ları içerir)
- `src/core/scoring/realtime.py` - Gerçek zamanlı senkronizasyon
- `static/js/referee_panel_sse.js` - Hakem paneli WebSocket modülü (SSE yerine WebSocket)
- `static/js/audience_display_sse.js` - Seyirci ekranı WebSocket modülü (SSE yerine WebSocket)
- `static/js/match_control_realtime.js` - Maç kontrol WebSocket modülü (SSE yerine WebSocket)
- `static/js/head_referee.js` - Baş hakem frontend (WebSocket kullanıyor)
- `static/js/referee_panel.js` - Hakem paneli frontend
- `static/js/match_control.js` - Maç kontrol frontend

## 🔧 Geliştirme Ortamı Kurulumu

1. Python 3.8+ yüklü olmalı
2. Bağımlılıkları yükleyin:
   ```bash
   pip install -r requirements.txt
   ```
3. Uygulamayı çalıştırın:
   ```bash
   python app_web.py
   ```
4. Tarayıcıda açın: `http://127.0.0.1:5000`

## 🐛 Hata Bildirme

Hata bulduğunuzda:

1. **Hata mesajını** kaydedin
2. **Adımları** yazın (ne yaptınız?)
3. **Beklenen davranışı** açıklayın
4. **Gerçek davranışı** açıklayın
5. **Log dosyasını** kontrol edin (`logs/app.log`)

## 💡 İpuçları

1. **Modüler yapıyı koruyun** - Her modül bağımsız çalışabilmeli
2. **Dokümantasyon ekleyin** - Her fonksiyona açıklama
3. **Hata yönetimi** - Try-catch blokları ekleyin
4. **Test edin** - Değişiklik yaptıktan sonra mutlaka test edin
5. **Kod standartlarına uyun** - PEP 8 (Python), ES6+ (JavaScript)

## 📞 İletişim

Sorularınız için:
1. Kod içindeki yorumları okuyun
2. Dokümantasyon dosyalarını kontrol edin
3. Mevcut kod örneklerini inceleyin

## 🎯 Öncelikli Görevler

1. **Test Etme** - Bugün eklenen özellikleri test edin
2. **Hata Bildirme** - Bulduğunuz hataları kaydedin
3. **Dokümantasyon** - Eksik açıklamaları tamamlayın
4. **Kod İyileştirme** - Magic number'ları constants'a taşıyın

---

**Not:** Bu rehber sürekli güncellenmelidir. Yeni özellikler eklendikçe bu dosya da güncellenmelidir.
