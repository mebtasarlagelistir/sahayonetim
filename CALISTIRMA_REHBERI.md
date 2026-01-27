# 🚀 MEMSKOR Çalıştırma Rehberi

Bu rehber, MEMSKOR uygulamasını nasıl çalıştıracağınızı adım adım açıklar.

## 📋 Ön Gereksinimler

1. **Python 3.8+** yüklü olmalı
2. **pip** (Python paket yöneticisi) yüklü olmalı

## 🔧 Kurulum Adımları

### 1. Bağımlılıkları Yükle

Proje dizininde terminal açın ve şu komutu çalıştırın:

```bash
pip install -r requirements.txt
```

Bu komut şu paketleri yükler:
- Flask (web framework)
- Flask-SocketIO (WebSocket desteği)
- threading (Python'un yerleşik async desteği - Python 3.13 uyumluluğu için)
- Diğer gerekli paketler

### 2. Veritabanı Kontrolü

Uygulama ilk çalıştırıldığında otomatik olarak veritabanı oluşturulur:
- `src/resources/data.db` - SQLite veritabanı dosyası

**Not:** Veritabanı yoksa otomatik oluşturulur, manuel işlem gerekmez.

## ▶️ Çalıştırma

### Geliştirme Modu (Development)

En basit çalıştırma yöntemi:

```bash
python app_web.py
```

Veya:

```bash
python -m flask run
```

**Varsayılan Ayarlar:**
- Port: `5000`
- Host: `127.0.0.1` (sadece localhost)
- Debug modu: **AÇIK** (kod değişikliklerinde otomatik yeniden başlatma)

**Erişim:**
- Yerel: `http://localhost:5000`
- Aynı ağdaki diğer cihazlar: `http://[BILGISAYAR_IP]:5000`

### Tüm Ağdan Erişim İçin

Aynı ağdaki tabletler, telefonlar ve diğer cihazlardan erişim için:

**Windows:**
```bash
python app_web.py
```
Ardından tarayıcıda `http://0.0.0.0:5000` veya `http://[BILGISAYAR_IP]:5000` kullanın.

**Not:** `app_web.py` dosyasında host ayarı kontrol edilmelidir. Eğer sadece localhost'ta çalışıyorsa, dosyayı düzenleyip `host='0.0.0.0'` yapmanız gerekebilir.

### Üretim Modu (Production)

Üretim ortamında çalıştırmak için:

```bash
# Ortam değişkenini ayarla
set FLASK_ENV=production  # Windows
# veya
export FLASK_ENV=production  # Linux/Mac

# Uygulamayı çalıştır
python app_web.py
```

**Not:** Üretim modunda debug kapalıdır ve daha güvenlidir.

## 🌐 Ağ Erişimi

### IP Adresini Bulma

**Windows:**
```bash
ipconfig
```
"IPv4 Address" değerini not edin (örn: `192.168.1.100`)

**Linux/Mac:**
```bash
ifconfig
```
veya
```bash
ip addr show
```

### Diğer Cihazlardan Erişim

1. Sunucu bilgisayarın IP adresini bulun (örn: `192.168.1.100`)
2. Aynı WiFi ağına bağlı tablet/telefon/cihazdan tarayıcıyı açın
3. Adres çubuğuna yazın: `http://192.168.1.100:5000`

**Önemli:** 
- Sunucu bilgisayar ve diğer cihazlar **aynı WiFi ağında** olmalı
- Windows Firewall port 5000'i engelliyorsa, izin vermeniz gerekebilir

## 🔐 İlk Giriş

Uygulama ilk çalıştırıldığında varsayılan kullanıcılar otomatik oluşturulur:

1. Tarayıcıda `http://localhost:5000` adresine gidin
2. Giriş sayfası açılır
3. Varsayılan kullanıcı adı ve şifreler:
   - **Admin:** `admin` / `admin123`
   - **Etkinlik Yöneticisi:** `yonetici` / `yonetici123`
   - **Hakem:** `hakem` / `hakem123`

**Güvenlik Notu:** İlk girişten sonra şifreleri değiştirmeniz önerilir.

## 📱 QR Kod ile Giriş

1. Dashboard'a giriş yapın
2. "QR Kodlar" bölümüne gidin
3. Her kullanıcı için QR kod oluşturulur
4. QR kodu tablet/telefonda okutun
5. Otomatik giriş yapılır

## 🛠️ Sorun Giderme

### Port Zaten Kullanılıyor

Eğer port 5000 zaten kullanılıyorsa:

```bash
# Farklı bir port kullan
python app_web.py --port 8080
```

Veya `app_web.py` dosyasında port numarasını değiştirin.

### WebSocket Bağlantı Hatası

WebSocket için `eventlet` yüklü olmalı:

```bash
pip install eventlet
```

### Veritabanı Hatası

Eğer veritabanı hatası alırsanız:

1. `src/resources/data.db` dosyasını silin (yedek alın!)
2. Uygulamayı yeniden başlatın
3. Veritabanı otomatik oluşturulur

### Modül Bulunamadı Hatası

```bash
# Tüm bağımlılıkları yeniden yükle
pip install -r requirements.txt --force-reinstall
```

## 📊 Sistem Gereksinimleri

- **RAM:** Minimum 512 MB (önerilen: 1 GB+)
- **Disk:** 100 MB boş alan
- **İşletim Sistemi:** Windows, Linux, macOS
- **Tarayıcı:** Modern tarayıcılar (Chrome, Firefox, Edge, Safari)

## 🎯 Kullanım Senaryoları

### Senaryo 1: Tek Bilgisayar (Localhost)

```bash
python app_web.py
```
Sadece aynı bilgisayardan erişim: `http://localhost:5000`

### Senaryo 2: Yerel Ağ (LAN)

1. Sunucu bilgisayarda: `python app_web.py`
2. IP adresini bulun (örn: `192.168.1.100`)
3. Tablet/telefonlarda: `http://192.168.1.100:5000`

### Senaryo 3: Production Server

```bash
# Waitress ile (Windows için önerilen)
waitress-serve --host=0.0.0.0 --port=5000 app_web:application

# veya Gunicorn ile (Linux için, Python 3.12 ve öncesi)
# NOT: Python 3.13 için waitress kullanın
gunicorn -k eventlet -w 1 -b 0.0.0.0:5000 app_web:application
```

## 📝 Notlar

- **WebSocket:** Gerçek zamanlı güncellemeler için WebSocket kullanılır
- **Timer Senkronizasyonu:** Tüm cihazlarda aynı zaman gösterilir (`server_timestamp` ile)
- **Modüler Yapı:** Her modül bağımsız çalışır, kolay bakım
- **Gönüllü Dostu:** Kod açıklamaları ve modüler yapı sayesinde kolay geliştirme

## 🆘 Yardım

Sorun yaşarsanız:
1. `README.md` dosyasını kontrol edin
2. `API_DOKUMANTASYONU.md` dosyasına bakın
3. `GONULLU_REHBERI.md` dosyasını inceleyin
4. Log dosyalarını kontrol edin (console çıktısı)

---

**Son Güncelleme:** 2025-01-XX  
**Versiyon:** 1.0.0
