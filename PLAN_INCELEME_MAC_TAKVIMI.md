# İnceleme, Deneme Maçları ve Maç Takvimi Planlama - Geliştirme Planı

## 📋 Genel Bakış

Bu plan, üç ana özelliğin geliştirilmesini kapsar:
1. **İnceleme Programı** - Takımlar için inceleme slotları planlama (Ayrı modül)
2. **Deneme Maçları** - Deneme maçları takvimi oluşturma ve yönetimi (Ayrı modül)
3. **Maç Takvimi** - Resmi maçların planlanması ve yönetimi (Ayrı modül)

**Önemli Notlar:**
- İnceleme Programı, Deneme Maçları Takvimi ve Maç Takvimi **tamamen ayrı** modüller olarak geliştirilecektir. Birbirleriyle bağlantılı değildir.
- **İnceleme Durumu Takibi** ayrı bir modül olarak geliştirilecektir (bu plan dışındadır).
- **Amaç**: Takvimleri doğru ve kolay şekilde oluşturabilmek için otomatik planlama ve kullanıcı dostu arayüz.

## 🗄️ Veritabanı Şeması

### 1. `inspection_slots` Tablosu
```sql
CREATE TABLE IF NOT EXISTS inspection_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    team_number TEXT NOT NULL,
    inspection_type TEXT NOT NULL,  -- 'hardware', 'size', 'safety', 'software', vb.
    slot_date TEXT NOT NULL,  -- YYYY-MM-DD formatında
    slot_time TEXT NOT NULL,  -- HH:MM formatında
    duration_minutes INTEGER DEFAULT 15,
    inspector_name TEXT,
    status TEXT DEFAULT 'scheduled',  -- scheduled, completed, cancelled, no_show, failed, passed
    notes TEXT,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
)
```

**İnceleme Tipleri:**
- `hardware` - Donanım İncelemesi
- `size` - Boyut İncelemesi
- `safety` - Güvenlik İncelemesi
- `software` - Yazılım İncelemesi (opsiyonel)
- `weight` - Ağırlık İncelemesi (opsiyonel)
- `custom` - Özel İnceleme (kullanıcı tanımlı)

### 2. `practice_matches` Tablosu
```sql
CREATE TABLE IF NOT EXISTS practice_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    match_number TEXT,  -- Örn: "P1", "P2" veya otomatik
    field_number INTEGER DEFAULT 1,
    match_date TEXT NOT NULL,  -- YYYY-MM-DD
    match_time TEXT NOT NULL,  -- HH:MM
    red_alliance TEXT NOT NULL,  -- JSON array: ["202501", "202502"]
    blue_alliance TEXT NOT NULL,  -- JSON array: ["202503", "202504"]
    status TEXT DEFAULT 'scheduled',  -- scheduled, in_progress, completed, cancelled
    red_score INTEGER,
    blue_score INTEGER,
    notes TEXT,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
)
```

### 3. `match_schedule` Tablosu
```sql
CREATE TABLE IF NOT EXISTS match_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    match_number INTEGER NOT NULL,  -- 1, 2, 3, ...
    match_type TEXT DEFAULT 'qualification',  -- qualification, elimination, final
    field_number INTEGER DEFAULT 1,
    match_date TEXT NOT NULL,  -- YYYY-MM-DD
    match_time TEXT NOT NULL,  -- HH:MM
    red_alliance TEXT NOT NULL,  -- JSON array
    blue_alliance TEXT NOT NULL,  -- JSON array
    status TEXT DEFAULT 'scheduled',  -- scheduled, in_progress, completed, cancelled
    red_score INTEGER,
    blue_score INTEGER,
    notes TEXT,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    UNIQUE(event_id, match_number, match_type)
)
```

## 🔌 Backend API Endpoint'leri

### İnceleme Programı
- `GET /api/inspection-slots` - Tüm inceleme slotlarını listele (filtreleme: team, type, date, status)
- `POST /api/inspection-slots` - Yeni inceleme slotu oluştur
- `PUT /api/inspection-slots/<id>` - İnceleme slotu güncelle
- `DELETE /api/inspection-slots/<id>` - İnceleme slotu sil
- `POST /api/inspection-slots/generate` - **Otomatik takvim oluştur** (tüm takımlar için seçilen tipler için)
- `POST /api/inspection-slots/bulk-update` - Toplu güncelleme (tarih/saat değişikliği)

### Deneme Maçları
- `GET /api/practice-matches` - Tüm deneme maçlarını listele (filtreleme: date, field, status)
- `POST /api/practice-matches` - Yeni deneme maçı oluştur
- `PUT /api/practice-matches/<id>` - Deneme maçı güncelle
- `DELETE /api/practice-matches/<id>` - Deneme maçı sil
- `POST /api/practice-matches/generate` - **Otomatik takvim oluştur** (tüm takımlar için dengeli eşleştirme)
- `POST /api/practice-matches/bulk-update` - Toplu güncelleme (tarih/saat değişikliği)

### Maç Takvimi
- `GET /api/match-schedule` - Tüm maçları listele (filtreleme: type, date, field, status)
- `POST /api/match-schedule` - Yeni maç oluştur
- `PUT /api/match-schedule/<id>` - Maç güncelle
- `DELETE /api/match-schedule/<id>` - Maç sil
- `POST /api/match-schedule/generate` - **Otomatik takvim oluştur** (tüm takımlar için round-robin veya seçilen algoritma)
- `POST /api/match-schedule/bulk-update` - Toplu güncelleme (tarih/saat değişikliği)
- `GET /api/match-schedule/conflicts` - Çakışma kontrolü (aynı takım aynı anda birden fazla maçta mı?)

## 🎨 Frontend UI Bileşenleri

### 1. İnceleme Programı (`step-inspection-schedule`)
**Amaç: Kolay ve doğru inceleme takvimi oluşturma**

- **Otomatik Takvim Oluşturma** (Ana Özellik):
  - Başlangıç tarihi/saati seçimi
  - İnceleme tipleri seçimi (checkbox: Donanım, Boyut, Güvenlik, vb.)
  - İnceleme tipine göre otomatik süre atama
  - Tüm takımlar için otomatik slot oluşturma
  - Çakışma kontrolü (aynı takım aynı anda birden fazla incelemede olamaz)
  - Müfettiş atama (opsiyonel, otomatik veya manuel)
  
- **Takvim Görünümü**: 
  - Günlük/haftalık görünüm (inceleme tipine göre renklendirme)
  - Sürükle-bırak ile yeniden planlama
  - Tarih/saat değişikliği için kolay düzenleme
  
- **Slot Listesi**: 
  - Tablo görünümü (tarih, saat, takım, inceleme tipi, durum, müfettiş)
  - Toplu seçim ve işlem (silme, durum güncelleme)
  
- **Manuel Slot Ekleme/Düzenleme**: 
  - Takım seçimi
  - İnceleme tipi seçimi (dropdown)
  - Tarih/saat
  - Süre (inceleme tipine göre otomatik, manuel değiştirilebilir)
  - Müfettiş atama
  
- **Durum Güncelleme**: Planlandı, Tamamlandı, Geçti, Kaldı, İptal, Gelmedi
- **Filtreleme**: Takım, inceleme tipi, tarih, durum, müfettiş bazlı

### 2. Deneme Maçları (Yeni Bölüm: `step-practice-matches`)
**Amaç: Kolay ve doğru deneme maçları takvimi oluşturma**

- **Otomatik Takvim Oluşturma** (Ana Özellik):
  - Başlangıç tarihi/saati seçimi
  - Saha sayısı seçimi
  - Maç sayısı veya süre belirleme
  - Otomatik eşleştirme (rastgele veya dengeli)
  - Tüm takımlar için dengeli maç dağılımı
  - Çakışma kontrolü (aynı takım aynı anda birden fazla maçta olamaz)
  - Maç sürelerine göre otomatik zamanlama
  
- **Takvim Görünümü**: 
  - Günlük görünüm, saha bazlı
  - Sürükle-bırak ile yeniden planlama
  - Tarih/saat değişikliği için kolay düzenleme
  
- **Maç Listesi**: 
  - Tablo görünümü (maç no, tarih, saat, saha, takımlar, durum)
  - Toplu seçim ve işlem (silme, durum güncelleme)
  
- **Manuel Maç Ekleme/Düzenleme**: 
  - Tarih/saat, saha seçimi
  - Takım seçimi (red/blue alliance)
  - Maç numarası (otomatik veya manuel)
  
- **Sonuç Girişi**: Skor girişi (opsiyonel)
- **Filtreleme**: Tarih, saha, durum bazlı

### 3. Maç Takvimi (Yeni Bölüm: `step-match-schedule`)
**Amaç: Kolay ve doğru resmi maç takvimi oluşturma**

- **Önemli**: Maç Takvimi, İnceleme Programından **tamamen bağımsız** çalışır

- **Otomatik Takvim Oluşturma** (Ana Özellik):
  - Maç tipi seçimi (Qualification, Elimination, Final)
  - Başlangıç tarihi/saati seçimi
  - Saha sayısı seçimi
  - Eşleştirme algoritması seçimi (Round-robin, Swiss, vb.)
  - Tüm takımları otomatik eşleştir
  - Saha sayısına göre otomatik dağıt
  - Maç sürelerine göre otomatik zamanlama (match_cycle_seconds)
  - Çakışma kontrolü (aynı takım aynı anda birden fazla maçta olamaz)
  - Maç numaralarını otomatik atama
  
- **Takvim Görünümü**: 
  - Günlük görünüm, saha bazlı
  - Sürükle-bırak ile yeniden planlama
  - Tarih/saat değişikliği için kolay düzenleme
  
- **Maç Listesi**: 
  - Tablo görünümü (maç no, tip, tarih, saat, saha, takımlar, durum)
  - Toplu seçim ve işlem (silme, durum güncelleme)
  
- **Manuel Maç Ekleme/Düzenleme**: 
  - Maç tipi seçimi
  - Tarih/saat, saha seçimi
  - Takım seçimi (red/blue alliance)
  - Maç numarası (otomatik veya manuel)
  
- **Filtreleme**: Tip (qualification/elimination/final), tarih, saha, durum
- **Not**: Maç planlaması yapılırken inceleme durumu kontrol edilmez (takımlar inceleme olmadan da maça çıkabilir)

## 🔧 Otomatik Planlama Algoritmaları

### İnceleme Programı Otomatik Planlama
1. Tüm takımları al
2. İnceleme tiplerini belirle (donanım, boyut, güvenlik, vb.)
3. İnceleme başlangıç tarihi/saati belirle
4. Her takım için her inceleme tipi için slot oluştur (varsayılan: 15 dakika)
5. Çakışma kontrolü yap (aynı takım aynı anda birden fazla incelemede olamaz)
6. Müfettiş ataması (opsiyonel)
7. İnceleme tiplerine göre farklı süreler atanabilir (örn: donanım 20 dk, boyut 10 dk)

### Deneme Maçları Otomatik Planlama
1. Tüm takımları al
2. İttifak başına takım sayısına göre eşleştir
3. Saha sayısına göre dağıt
4. Maç sürelerine göre zamanlama
5. Çakışma kontrolü


### Maç Takvimi Otomatik Planlama
1. Tüm takımları al (inceleme durumundan bağımsız)
2. İttifak başına takım sayısına göre eşleştir
3. Saha sayısına göre dağıt
4. Maç sürelerine göre zamanlama (match_cycle_seconds)
5. Çakışma kontrolü (aynı takım aynı anda birden fazla maçta olamaz)
6. Maç numaralarını otomatik atama
7. **Not**: İnceleme durumu kontrol edilmez - takımlar inceleme olmadan da maça çıkabilir

## 📝 Özellikler

### Ortak Özellikler
- ✅ Event bazlı veri izolasyonu
- ✅ Rol bazlı erişim kontrolü (mufettis, hakem, admin)
- ✅ Validasyon (tarih/saat, takım seçimi, çakışma)
- ✅ Toast mesajları ve hata yönetimi
- ✅ Responsive tasarım

### İnceleme Programı Özel
- ✅ **Otomatik takvim oluşturma** (tek tıkla tüm takımlar için)
- ✅ İnceleme tipi seçimi (donanım, boyut, güvenlik, vb.)
- ✅ İnceleme tipine göre otomatik süre atama
- ✅ Takım bazlı filtreleme
- ✅ İnceleme tipi bazlı filtreleme
- ✅ Tarih bazlı görünüm
- ✅ Sürükle-bırak ile kolay yeniden planlama
- ✅ Toplu güncelleme (tarih/saat değişikliği)
- ✅ Durum güncelleme (planlandı, tamamlandı, geçti, kaldı, iptal, gelmedi)
- ✅ Müfettiş atama
- ✅ Her takım için birden fazla inceleme slotu (farklı tipler için)

### Deneme Maçları Özel
- ✅ **Otomatik takvim oluşturma** (tek tıkla dengeli eşleştirme)
- ✅ Rastgele veya dengeli eşleştirme
- ✅ Saha sayısına göre otomatik dağıtım
- ✅ Maç sürelerine göre otomatik zamanlama
- ✅ Sürükle-bırak ile kolay yeniden planlama
- ✅ Toplu güncelleme (tarih/saat değişikliği)
- ✅ Skor girişi (opsiyonel)
- ✅ Saha bazlı görünüm

### Maç Takvimi Özel
- ✅ **Otomatik takvim oluşturma** (tek tıkla tüm maçları planla)
- ✅ Maç tipi (qualification/elimination/final)
- ✅ Eşleştirme algoritması seçimi (Round-robin, Swiss, vb.)
- ✅ Otomatik numaralandırma
- ✅ Saha sayısına göre otomatik dağıtım
- ✅ Maç sürelerine göre otomatik zamanlama
- ✅ Çakışma kontrolü
- ✅ Sürükle-bırak ile kolay yeniden planlama
- ✅ Toplu güncelleme (tarih/saat değişikliği)
- ✅ Saha bazlı zamanlama

## 🚀 Geliştirme Adımları

### Faz 1: İnceleme Programı (Bağımsız)
1. **Veritabanı Şeması** (storage.py)
   - `inspection_slots` tablosunu oluştur
   - Migration fonksiyonları

2. **Backend API** (app_web.py)
   - İnceleme slotları CRUD endpoint'leri
   - **Otomatik takvim oluşturma endpoint'i** (ana özellik)
   - Toplu güncelleme endpoint'i
   - Validasyon ve çakışma kontrolü

3. **Frontend UI** (setup.html, app.js, style.css)
   - İnceleme Programı bölümü (`step-inspection-schedule`)
   - **Otomatik takvim oluşturma arayüzü** (kolay kullanım)
   - Takvim görünümü (sürükle-bırak)
   - Slot listesi ve filtreleme
   - JavaScript fonksiyonları
   - CSS stilleri

### Faz 2: Deneme Maçları (Bağımsız)
1. **Veritabanı Şeması** (storage.py)
   - `practice_matches` tablosunu oluştur

2. **Backend API** (app_web.py)
   - Deneme maçları CRUD endpoint'leri
   - Otomatik planlama endpoint'i

3. **Frontend UI** (setup.html, app.js, style.css)
   - Deneme Maçları bölümü (`step-practice-matches`)

### Faz 3: Maç Takvimi (Bağımsız - İncelemeden ayrı)
1. **Veritabanı Şeması** (storage.py)
   - `match_schedule` tablosunu oluştur

2. **Backend API** (app_web.py)
   - Maç takvimi CRUD endpoint'leri
   - Otomatik planlama endpoint'i
   - Çakışma kontrolü endpoint'i

3. **Frontend UI** (setup.html, app.js, style.css)
   - Maç Takvimi bölümü (`step-match-schedule`)

4. **Test ve İyileştirme**
   - Test senaryoları
   - Hata düzeltmeleri
   - UI/UX iyileştirmeleri

## 📊 Veri Yapıları

### InspectionSlot (Python)
```python
@dataclass
class InspectionSlot:
    id: int | None
    event_id: int
    team_number: str
    inspection_type: str  # 'hardware', 'size', 'safety', 'software', 'weight', 'custom'
    slot_date: str  # YYYY-MM-DD
    slot_time: str  # HH:MM
    duration_minutes: int = 15
    inspector_name: str = ""
    status: str = "scheduled"  # scheduled, completed, passed, failed, cancelled, no_show
    notes: str = ""
```

**İnceleme Tipi Varsayılan Süreleri:**
- `hardware` (Donanım): 20 dakika
- `size` (Boyut): 10 dakika
- `safety` (Güvenlik): 15 dakika
- `software` (Yazılım): 15 dakika (opsiyonel)
- `weight` (Ağırlık): 5 dakika (opsiyonel)
- `custom` (Özel): 15 dakika (kullanıcı tanımlı)

### PracticeMatch (Python)
```python
@dataclass
class PracticeMatch:
    id: int | None
    event_id: int
    match_number: str
    field_number: int = 1
    match_date: str  # YYYY-MM-DD
    match_time: str  # HH:MM
    red_alliance: List[str]  # Takım numaraları
    blue_alliance: List[str]  # Takım numaraları
    status: str = "scheduled"
    red_score: int | None = None
    blue_score: int | None = None
    notes: str = ""
```

### MatchSchedule (Python)
```python
@dataclass
class MatchSchedule:
    id: int | None
    event_id: int
    match_number: int
    match_type: str = "qualification"  # qualification, elimination, final
    field_number: int = 1
    match_date: str  # YYYY-MM-DD
    match_time: str  # HH:MM
    red_alliance: List[str]
    blue_alliance: List[str]
    status: str = "scheduled"
    red_score: int | None = None
    blue_score: int | None = None
    notes: str = ""
```

## ✅ Onay Bekleyen Noktalar

1. **İnceleme tipleri**: Donanım, boyut, güvenlik yeterli mi? Başka tipler eklenmeli mi? (yazılım, ağırlık, vb.)
2. **İnceleme süreleri**: Önerilen süreler (donanım 20dk, boyut 10dk, güvenlik 15dk) uygun mu?
3. **İnceleme durumları**: "Geçti/Kaldı" durumları eklenmeli mi, yoksa sadece "Tamamlandı" yeterli mi? ✅ **Eklendi: Geçti/Kaldı durumları var**
4. **İnceleme Durumu Takibi**: Özet tablo formatı uygun mu? Başka bir görünüm tercih edilir mi?
5. **Deneme maçları**: Skor girişi zorunlu mu, opsiyonel mi?
6. **Maç takvimi**: Otomatik planlama algoritması nasıl olmalı? (Round-robin, Swiss, vb.)
7. **Çakışma kontrolü**: 
   - İnceleme: Aynı takım aynı anda birden fazla incelemede olamaz ✅
   - Maç: Aynı takım aynı anda birden fazla maçta olamaz ✅
   - İnceleme ve Maç: Birbirinden bağımsız (takım inceleme sırasında maça çıkabilir) ✅
8. **UI Görünümü**: Takvim görünümü mü, tablo görünümü mü tercih edilir?
