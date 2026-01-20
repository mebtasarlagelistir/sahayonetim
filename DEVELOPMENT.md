# Geliştirme Rehberi

Bu dosya, gönüllü geliştiriciler için detaylı bir rehberdir.

## 📋 İçindekiler

1. [Proje Yapısı](#proje-yapısı)
2. [Modül Sorumlulukları](#modül-sorumlulukları)
3. [Yeni Özellik Ekleme](#yeni-özellik-ekleme)
4. [Kod Standartları](#kod-standartları)
5. [Test Etme](#test-etme)
6. [Hata Ayıklama](#hata-ayıklama)

## 🏗️ Proje Yapısı

### Katmanlar

```
┌─────────────────────────────────────┐
│   Sunum Katmanı (Presentation)      │
│   - templates/*.html                │
│   - static/*.css, *.js              │
└─────────────────────────────────────┘
              ↕
┌─────────────────────────────────────┐
│   İş Mantığı (Business Logic)       │
│   - app_web.py (routes)             │
│   - src/core/*.py                   │
└─────────────────────────────────────┘
              ↕
┌─────────────────────────────────────┐
│   Veri Katmanı (Data Layer)         │
│   - src/core/storage.py             │
│   - src/resources/data.db           │
└─────────────────────────────────────┘
```

### Dosya Organizasyonu

- **app_web.py**: Flask uygulaması, Blueprint kayıtları
- **routes/**: Route modülleri (Blueprint'ler)
  - `match_control.py`: Maç kontrol sistemi ⭐
  - `referee_panel.py`: Hakem paneli ⭐
  - `inspection.py`: İnceleme programı
  - `practice_matches.py`: Deneme maçları
  - `match_schedule.py`: Resmi maç takvimi
  - `wifi.py`: WiFi kanal atama
  - `archive.py`: Arşiv yönetimi
- **src/core/storage/**: Modüler veritabanı işlemleri (CRUD)
- **src/core/scoring/**: Modüler puanlama sistemi ⭐
  - `config.py`: Puanlama kuralları
  - `calculator.py`: Skor hesaplama
  - `realtime.py`: Gerçek zamanlı senkronizasyon
- **src/core/config.py**: Yapılandırma yönetimi
- **src/core/event_setup.py**: Veri yapıları ve şemalar
- **static/js/**: İstemci tarafı JavaScript modülleri
- **templates/**: HTML şablonları

## 🔧 Modül Sorumlulukları

### app_web.py

**Sorumluluklar:**
- HTTP route tanımları
- Kimlik doğrulama (require_login decorator)
- Rol bazlı erişim kontrolü (require_admin, require_event_manager)
- API endpoint'leri
- QR kod oluşturma
- Request/Response yönetimi

**Rol Bazlı Erişim Kontrolü:**
- `@require_login`: Tüm giriş yapmış kullanıcılar
- `@require_admin`: Sadece admin kullanıcıları
- `@require_event_manager`: Admin ve etkinlik_yoneticisi kullanıcıları

**Yapılmaması Gerekenler:**
- Veritabanı sorguları (storage.py'ye bırakılmalı)
- Karmaşık iş mantığı (core modüllerine bırakılmalı)
- UI mantığı (JavaScript'e bırakılmalı)

**Örnek Route Ekleme:**
```python
@app.get("/api/yeni-endpoint")
@require_login
def yeni_endpoint():
    """
    Açıklama buraya.
    
    Returns:
        JSON: Dönüş verisi
    """
    data = datastore.get_something()
    return jsonify(data)
```

### src/core/storage.py

**Sorumluluklar:**
- Veritabanı şema yönetimi
- CRUD operasyonları
- Veri validasyonu (temel seviye)
- Migrasyon işlemleri

**Yapılmaması Gerekenler:**
- HTTP işlemleri
- UI mantığı
- Karmaşık iş kuralları (event_setup.py'ye bırakılmalı)

**Örnek Metod Ekleme:**
```python
def get_something(self) -> List[Dict[str, Any]]:
    """
    Açıklama buraya.
    
    Returns:
        List[Dict]: Veri listesi
    """
    with sqlite3.connect(self.db_path) as conn:
        rows = conn.execute("SELECT * FROM table").fetchall()
    return [{"field": row[0]} for row in rows]
```

### static/app.js

**Sorumluluklar:**
- Form yönetimi
- API çağrıları
- UI güncellemeleri
- Validasyon (istemci tarafı)
- Kullanıcı etkileşimleri
- Rol bazlı bölüm gösterimi (updateSectionsForRole)
- Rol bazlı UI kontrolü (updateUIForRole)

**Yapılmaması Gerekenler:**
- Sunucu tarafı validasyon (backend'e bırakılmalı)
- Güvenlik kontrolleri (backend'de yapılmalı)

**Örnek Fonksiyon Ekleme:**
```javascript
/**
 * Açıklama buraya
 * 
 * @param {string} param1 - Parametre açıklaması
 * @returns {Promise<Object>} Dönüş değeri
 */
async function yeniFonksiyon(param1) {
  const res = await fetch("/api/endpoint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ param1 }),
  });
  if (res.ok) {
    showToast("Başarılı", "success");
    return await res.json();
  }
  showToast("Hata", "error");
}
```

## ➕ Yeni Özellik Ekleme

### Adım 1: Planlama

1. Özelliğin hangi katmanda olacağını belirleyin
2. Hangi modüllere dokunacağınızı listeleyin
3. Veritabanı değişikliği gerekiyor mu?

### Adım 2: Veritabanı (Gerekirse)

**storage.py içinde:**

```python
def _init_db(self) -> None:
    # ... mevcut tablolar ...
    
    # Yeni tablo ekleme
    conn.execute("""
        CREATE TABLE IF NOT EXISTS yeni_tablo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            field1 TEXT,
            field2 INTEGER
        )
    """)
```

**Migrasyon gerekirse:**

```python
def _migrate_legacy_schema(self) -> None:
    # ... mevcut migrasyonlar ...
    
    # Yeni kolon ekleme
    try:
        conn.execute("ALTER TABLE tablo ADD COLUMN yeni_kolon TEXT")
    except sqlite3.OperationalError:
        pass  # Kolon zaten varsa
```

### Adım 3: Backend (Python)

**storage.py'ye metod ekleyin:**

```python
def get_yeni_veri(self) -> List[Dict]:
    """Açıklama"""
    # Implementation
```

**app_web.py'ye route ekleyin:**

```python
@app.get("/api/yeni-veri")
@require_login
def get_yeni_veri():
    """Açıklama"""
    return jsonify(datastore.get_yeni_veri())
```

### Adım 4: Frontend (JavaScript)

**app.js'e fonksiyon ekleyin:**

```javascript
async function loadYeniVeri() {
  const res = await fetch("/api/yeni-veri");
  const data = await res.json();
  // UI güncelleme
}
```

**HTML'e UI ekleyin (setup.html):**

```html
<section class="card" id="step-yeni">
  <h2>Yeni Özellik</h2>
  <!-- UI bileşenleri -->
</section>
```

### Adım 5: Test

1. Sunucuyu yeniden başlatın
2. Tarayıcıda hard refresh (Ctrl+F5)
3. Tüm senaryoları test edin

## 📝 Kod Standartları

### Python

- **PEP 8** standartlarına uyun
- **Docstring** ekleyin (Google style)
- **Type hints** kullanın
- **Fonksiyon başına tek sorumluluk**

**İyi Örnek:**
```python
def get_user_by_id(self, user_id: int) -> Dict[str, Any] | None:
    """
    Kullanıcı ID'sine göre kullanıcı bilgilerini getirir.
    
    Args:
        user_id: Kullanıcı ID'si
        
    Returns:
        Dict: Kullanıcı bilgileri veya None
    """
    # Implementation
```

### JavaScript

- **ES6+** kullanın
- **JSDoc** yorumları ekleyin
- **Async/await** tercih edin
- **Hata yönetimi** ekleyin

**İyi Örnek:**
```javascript
/**
 * Kullanıcı bilgilerini yükler
 * 
 * @returns {Promise<void>}
 */
async function loadUser() {
  try {
    const res = await fetch("/api/user");
    if (!res.ok) throw new Error("Yükleme başarısız");
    const data = await res.json();
    // UI güncelleme
  } catch (err) {
    showToast(`Hata: ${err.message}`, "error");
  }
}
```

### Yorumlar

**Ne zaman yorum eklenmeli:**
- Karmaşık algoritmalar
- İş kuralları
- Neden belirli bir yaklaşım seçildi
- Gelecekteki geliştiriciler için önemli bilgiler

**Ne zaman yorum eklenmemeli:**
- Açık olan kod (self-documenting)
- Her satır için
- Gereksiz açıklamalar

## 🧪 Test Etme

### Manuel Test Checklist

- [ ] Yeni özellik çalışıyor mu?
- [ ] Hata durumları doğru yönetiliyor mu?
- [ ] Validasyonlar çalışıyor mu?
- [ ] UI responsive mi?
- [ ] Farklı tarayıcılarda test edildi mi?
- [ ] Veritabanı değişiklikleri doğru mu?

### Yaygın Hatalar

1. **Veritabanı bağlantı hatası**
   - Çözüm: `data.db` dosyasının yazılabilir olduğundan emin olun

2. **CORS hatası**
   - Çözüm: Flask'ta CORS ayarlarını kontrol edin

3. **404 Not Found**
   - Çözüm: Route tanımlarını kontrol edin, sunucuyu yeniden başlatın

4. **JavaScript hatası**
   - Çözüm: Tarayıcı konsolunu kontrol edin (F12)

## 🐛 Hata Ayıklama

### Backend Hataları

```python
# app_web.py içinde debug modunu açın
if __name__ == "__main__":
    application = create_app()
    application.run(host="127.0.0.1", port=5000, debug=True)  # debug=True
```

### Frontend Hataları

Tarayıcı konsolunu açın (F12):
- Console: JavaScript hataları
- Network: API çağrıları
- Application: Session/Cookie bilgileri

### Veritabanı Hataları

SQLite veritabanını incelemek için:
```bash
sqlite3 src/resources/data.db
.tables
SELECT * FROM events;
```

## 🔄 Git Workflow

1. **Branch oluştur**: `git checkout -b feature/yeni-ozellik`
2. **Değişiklikleri yap**
3. **Commit**: `git commit -m "Açıklayıcı mesaj"`
4. **Push**: `git push origin feature/yeni-ozellik`
5. **Pull Request oluştur**

## 🧾 Agent Kayıtları

Cursor agent tarafından yapılan değişiklikler `AGENT_LOG.md` dosyasında tutulur.
Son değişikliklerin özeti burada ve detaylar dosyada bulunur.

- 2026-01-18: FTC Benzeri Hakem Paneli Sistemi (3 ekran, submit/approve, önizleme modu)
- 2026-01-17: WiFi Kanal Atama (API + UI + frontend + event default)

## 📚 Kaynaklar

- Flask Dokümantasyonu: https://flask.palletsprojects.com/
- SQLite Dokümantasyonu: https://www.sqlite.org/docs.html
- JavaScript ES6+: https://developer.mozilla.org/en-US/docs/Web/JavaScript

## ❓ Sorular?

Geliştirme sırasında sorularınız için:
1. Kod içindeki yorumları okuyun
2. README.md'yi kontrol edin
3. Mevcut kod örneklerini inceleyin
