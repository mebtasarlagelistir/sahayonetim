# MEMSKOR - Yarışma Yönetim Sistemi

MEM Tasarla Geliştir Yarışması Kapsamında kullanılacak Saha yönetimi yazılımı.

FTC türevi yarışma yönetim programı. Web tabanlı, modüler yapıda geliştirilmiştir.

## 📁 Proje Yapısı

```
MEMSKOR_NEW/
├── app_web.py              # Flask web uygulaması (ana giriş noktası)
├── requirements.txt        # Python bağımlılıkları
│
├── src/                    # Kaynak kodlar
│   ├── core/              # Temel iş mantığı modülleri
│   │   ├── config.py      # Yapılandırma yönetimi
│   │   ├── storage/        # Modüler veritabanı işlemleri
│   │   │   ├── __init__.py    # DataStore ana sınıfı
│   │   │   ├── base.py         # Temel DB işlemleri
│   │   │   ├── events.py       # Etkinlik yönetimi
│   │   │   ├── teams.py        # Takım yönetimi
│   │   │   ├── users.py        # Kullanıcı yönetimi
│   │   │   ├── inspection.py   # İnceleme slotları
│   │   │   ├── practice_matches.py  # Deneme maçları
│   │   │   └── match_schedule.py     # Resmi maç takvimi
│   │   ├── scoring/        # Modüler puanlama sistemi ⭐ YENİ
│   │   │   ├── __init__.py
│   │   │   ├── config.py      # Puanlama kuralları
│   │   │   ├── calculator.py  # Skor hesaplama
│   │   │   └── realtime.py    # Gerçek zamanlı senkronizasyon
│   │   └── event_setup.py # Etkinlik yapılandırma şemaları
│   │
│   └── resources/         # Statik kaynaklar
│       ├── config.json    # UI yapılandırması
│       ├── data.db        # SQLite veritabanı
│       └── style.qss      # PyQt stilleri (eski, kullanılmıyor)
│
├── routes/                # Route modülleri (Blueprint)
│   ├── match_control.py   # Maç kontrol sistemi ⭐ YENİ
│   ├── referee_panel.py   # Hakem paneli ⭐ YENİ
│   ├── inspection.py      # İnceleme programı
│   ├── practice_matches.py # Deneme maçları
│   ├── match_schedule.py  # Resmi maç takvimi
│   ├── wifi.py            # WiFi kanal atama
│   └── archive.py         # Arşiv yönetimi
│
├── templates/             # HTML şablonları (Jinja2)
│   ├── login.html
│   ├── dashboard.html
│   ├── match_control.html # Maç kontrol sayfası ⭐ YENİ
│   ├── referee_panel.html # Hakem paneli ⭐ YENİ
│   └── setup.html
│
└── static/                # Statik dosyalar (CSS, JS)
    ├── style.css
    └── js/                # JavaScript modülleri
        ├── utils.js
        ├── event.js
        ├── teams.js
        ├── users.js
        ├── inspection.js
        ├── practice_matches.js
        ├── match_schedule.js
        ├── match_control.js  # Maç kontrol ⭐ YENİ
        ├── referee_panel.js  # Hakem paneli ⭐ YENİ
        ├── wifi.js
        ├── awards.js
        ├── archive.js
        ├── dashboard.js
        ├── setup.js
        └── setup_validation.js
```

**Not:** PyQt GUI uygulaması (`main.py` ve `src/gui/`) artık kullanılmıyor. Flask web uygulaması (`app_web.py`) ana uygulamadır.

## 🏗️ Mimari Yapı

### Modüler Tasarım

Program üç ana katmandan oluşur:

1. **Sunum Katmanı (Presentation Layer)**
   - `templates/`: HTML şablonları
   - `static/`: CSS ve JavaScript dosyaları
   - Kullanıcı arayüzü ve etkileşimler

2. **İş Mantığı Katmanı (Business Logic Layer)**
   - `src/core/`: Temel iş mantığı
   - `app_web.py`: Flask route'ları ve API endpoint'leri
   - Veri doğrulama ve iş kuralları

3. **Veri Katmanı (Data Layer)**
   - `src/core/storage.py`: SQLite veritabanı işlemleri
   - Veri kalıcılığı ve CRUD operasyonları

### Modül Sorumlulukları

#### `app_web.py`
- Flask uygulamasının ana giriş noktası
- HTTP route'ları ve API endpoint'leri
- Kimlik doğrulama ve oturum yönetimi
- QR kod oluşturma

#### `src/core/storage.py`
- Veritabanı şeması yönetimi
- CRUD operasyonları (Create, Read, Update, Delete)
- Veri migrasyon işlemleri
- Kullanıcı yönetimi ve kimlik doğrulama

#### `src/core/config.py`
- Yapılandırma dosyası yönetimi (JSON)
- UI ayarları (font, tema vb.)
- Varsayılan değerler

#### `src/core/event_setup.py`
- Etkinlik veri yapıları
- Varsayılan yapılandırma şemaları
- Veri doğrulama kuralları

#### `static/app.js`
- İstemci tarafı JavaScript mantığı
- Form validasyonları
- API çağrıları
- Dinamik UI güncellemeleri

## 🚀 Kurulum

1. Python 3.8+ yüklü olmalı
2. Bağımlılıkları yükleyin:
   ```bash
   pip install -r requirements.txt
   ```
3. Uygulamayı çalıştırın:
   ```bash
   python app_web.py
   ```
4. Tarayıcıda `http://127.0.0.1:5000` adresine gidin

## 🔐 Varsayılan Giriş Bilgileri

- **Kullanıcı Adı:** `admin`
- **Şifre:** `admin123`

## 👥 Kullanıcı Rolleri ve Yetkiler

### Admin
- Tüm yetkilere sahip
- Tüm etkinliklere erişim
- Tüm bölümleri görebilir ve düzenleyebilir
- Etkinlik oluşturma/silme yetkisi

### Etkinlik Yöneticisi (etkinlik_yoneticisi)
- Sadece kendi etkinliğine erişim
- Etkinlik değiştirme yetkisi yok
- Tüm bölümleri görebilir ve düzenleyebilir
- Etkinlik oluşturma/silme yetkisi yok

### Hakem (hakem_*)
- Setup sayfasına erişebilir
- Sadece **Skorlama** bölümünü görebilir
- Görüntüleme modu (düzenleme yetkisi yok)

### Mufettis (mufettis_*)
- Setup sayfasına erişebilir
- Sadece **İnceleme Programı** ve **Jüri/İnceleme Takibi** bölümlerini görebilir
- Görüntüleme modu (düzenleme yetkisi yok)

### Seremoni (seremoni_*)
- Setup sayfasına erişebilir
- Sadece **Ödüller** bölümünü görebilir
- Görüntüleme modu (düzenleme yetkisi yok)

### Diğer Roller
- Saha yöneticisi, baş hakem, baş mufettis vb. roller de benzer şekilde çalışır
- Her rol sadece kendi işiyle ilgili bölümleri görür

## 📝 Geliştirme Rehberi

Detaylı geliştirme rehberi için `DEVELOPMENT.md` dosyasına bakın.

**Gönüllü geliştiriciler için:** `GONULLU_REHBERI.md` dosyasına bakın.

### Yeni Özellik Ekleme

1. **Backend (Python)**
   - `routes/` klasöründe yeni Blueprint modülü oluşturun
   - `src/core/storage/` içinde gerekli veritabanı metodlarını ekleyin
   - `app_web.py` içinde Blueprint'i kaydedin
   - Validasyon kurallarını ekleyin

2. **Frontend (JavaScript)**
   - `static/js/` içinde yeni modül oluşturun
   - `templates/` içinde HTML şablonu ekleyin
   - `static/style.css` içinde stilleri ekleyin

3. **Veritabanı Değişiklikleri**
   - İlgili storage modülünde `_init_db()` metodunu güncelleyin
   - Migrasyon gerekirse migration metodunu ekleyin

### Modüler Puanlama Sistemi

Puanlama kurallarını güncellemek için `src/core/scoring/config.py` dosyasını düzenleyin.
Detaylı bilgi için `SCORING_SYSTEM_README.md` dosyasına bakın.

### Kod Standartları

- **Python:** PEP 8 standartlarına uyun
- **JavaScript:** ES6+ kullanın, fonksiyonlara açıklama ekleyin
- **Docstring:** Tüm fonksiyonlara docstring ekleyin
- **Yorumlar:** Karmaşık mantık için açıklayıcı yorumlar ekleyin

### Test Etme

- Her değişiklikten sonra:
  1. Sunucuyu yeniden başlatın
  2. Tarayıcıda hard refresh yapın (Ctrl+F5)
  3. Tüm özellikleri test edin

## 🧾 Agent Kayıtları

Cursor agent tarafından yapılan değişiklikler `AGENT_LOG.md` dosyasında tutulur.
Güncel özet `DEVELOPMENT.md` içinde bulunur.

## 🔧 Yapılandırma

### Veritabanı
- SQLite kullanılır (`src/resources/data.db`)
- Otomatik oluşturulur, manuel müdahale gerekmez

### Yapılandırma Dosyası
- `src/resources/config.json`: UI ayarları
- `src/resources/secret.key`: Otomatik oluşturulan güvenlik anahtarı

## 📚 API Dokümantasyonu

### Etkinlik Yönetimi
- `GET /api/events` - Tüm etkinlikleri listele
- `POST /api/events` - Yeni etkinlik oluştur
- `DELETE /api/events/<id>` - Etkinlik sil
- `GET /api/event` - Aktif etkinliği getir
- `POST /api/event` - Etkinlik kaydet

### Takım Yönetimi
- `GET /api/teams` - Takımları listele
- `POST /api/teams` - Takımları kaydet

### Kullanıcı Yönetimi
- `GET /api/users` - Kullanıcıları listele
- `POST /api/users` - Yeni kullanıcı oluştur
- `POST /api/users/delete` - Kullanıcı sil
- `POST /api/users/defaults` - Varsayılan kullanıcıları oluştur

### Maç Kontrol Sistemi ⭐ YENİ
- `GET /match-control` - Maç kontrol sayfası
- `GET /api/match-control/active` - Aktif maç bilgisi (in_progress veya preview)
- `POST /api/match-control/start` - Maç başlat
- `POST /api/match-control/stop` - Maç durdur
- `POST /api/match-control/complete` - Maç tamamla (match_source desteği)
- `POST /api/match-control/preview` - Maçı önizleme durumuna alır (hakem tabletleri için)
- `POST /api/match-control/score/detailed` - Detaylı skor güncelleme (modüler sistem)
- **WebSocket**: `/match` namespace - `subscribe_match` event ile maç güncellemelerine abone olun
- **WebSocket**: `/audience` namespace - `subscribe_audience` event ile seyirci ekranı güncellemelerine abone olun
- **NOT:** SSE endpoint'leri kaldırıldı. Tüm sistem WebSocket kullanıyor (timer senkronizasyonu için server_timestamp desteği ile).

### Hakem Paneli ⭐ YENİ
- `GET /referee/red` - Kırmızı İttifak Hakemi sayfası
- `GET /referee/blue` - Mavi İttifak Hakemi sayfası
- `GET /head-referee` - Baş Hakem sayfası
- `GET /referee-panel` - Genel hakem paneli (geriye dönük uyumluluk)
- `GET /api/referee/active-match` - Aktif maç bilgisi (match-control ile senkronize)
- `POST /api/referee/score/update` - Skor güncelleme (match_source desteği)
- `GET /api/referee/score/get/<match_id>` - Mevcut skorlar ve hakem meta bilgisi
- `POST /api/referee/submit` - Hakem girişini tamamlar
- `POST /api/referee/approve` - Baş hakem maçı onaylar

### Diğer Modüller
Detaylı API dokümantasyonu için `DEVELOPMENT.md` ve `SCORING_SYSTEM_README.md` dosyalarına bakın.

## 🤝 Katkıda Bulunma

1. Her modül bağımsız çalışabilmeli
2. Fonksiyonlara docstring ekleyin
3. Karmaşık mantık için yorumlar ekleyin
4. Değişikliklerden önce mevcut yapıyı anlayın

## 📄 Lisans

Bu proje gönüllü geliştirme için hazırlanmıştır.
