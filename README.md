# MEMSKOR - Yarışma Yönetim Sistemi

FTC türevi yarışma yönetim programı. Web tabanlı, modüler yapıda geliştirilmiştir.

## 📁 Proje Yapısı

```
MEMSKOR_NEW/
├── app_web.py              # Flask web uygulaması (ana giriş noktası)
├── main.py                 # Eski PyQt uygulaması (geçiş için)
├── requirements.txt        # Python bağımlılıkları
│
├── src/                    # Kaynak kodlar
│   ├── core/              # Temel iş mantığı modülleri
│   │   ├── config.py      # Yapılandırma yönetimi
│   │   ├── storage.py     # Veritabanı işlemleri (SQLite)
│   │   └── event_setup.py # Etkinlik yapılandırma şemaları
│   │
│   ├── gui/               # PyQt GUI bileşenleri (gelecekte kullanılabilir)
│   │   ├── main_window.py
│   │   └── tabs/
│   │
│   └── resources/         # Statik kaynaklar
│       ├── config.json    # UI yapılandırması
│       ├── data.db        # SQLite veritabanı
│       └── style.qss      # PyQt stilleri
│
├── templates/             # HTML şablonları (Jinja2)
│   ├── login.html
│   └── setup.html
│
└── static/                # Statik dosyalar (CSS, JS)
    ├── style.css
    └── app.js
```

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
- Sadece **Ödüller** ve **Yükselme Raporu** bölümlerini görebilir
- Görüntüleme modu (düzenleme yetkisi yok)

### Diğer Roller
- Saha yöneticisi, baş hakem, baş mufettis vb. roller de benzer şekilde çalışır
- Her rol sadece kendi işiyle ilgili bölümleri görür

## 📝 Geliştirme Rehberi

### Yeni Özellik Ekleme

1. **Backend (Python)**
   - `app_web.py` içinde yeni route ekleyin
   - `src/core/storage.py` içinde gerekli veritabanı metodlarını ekleyin
   - Validasyon kurallarını ekleyin

2. **Frontend (JavaScript)**
   - `static/app.js` içinde yeni fonksiyonlar ekleyin
   - `templates/setup.html` içinde UI bileşenlerini ekleyin
   - `static/style.css` içinde stilleri ekleyin

3. **Veritabanı Değişiklikleri**
   - `storage.py` içinde `_init_db()` metodunu güncelleyin
   - Migrasyon gerekirse `_migrate_legacy_schema()` metodunu güncelleyin

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

## 🤝 Katkıda Bulunma

1. Her modül bağımsız çalışabilmeli
2. Fonksiyonlara docstring ekleyin
3. Karmaşık mantık için yorumlar ekleyin
4. Değişikliklerden önce mevcut yapıyı anlayın

## 📄 Lisans

Bu proje gönüllü geliştirme için hazırlanmıştır.
