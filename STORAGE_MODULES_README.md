# Storage Modülleri - Dokümantasyon

## Genel Bakış

`src/core/storage.py` dosyası modüler yapıya dönüştürülmüştür. Artık her veri tipi için ayrı bir modül bulunmaktadır.

## Modül Yapısı

```
src/core/storage/
├── __init__.py          # DataStore ana sınıfı (tüm modülleri birleştirir)
├── base.py              # Temel DB işlemleri (şema, migrasyon)
├── events.py            # Etkinlik yönetimi
├── teams.py             # Takım yönetimi
├── users.py             # Kullanıcı yönetimi
├── inspection.py        # İnceleme slotları yönetimi
└── practice_matches.py # Deneme maçları yönetimi
```

## Kullanım

### Temel Kullanım

```python
from src.core.storage import DataStore
from pathlib import Path

# DataStore oluştur
datastore = DataStore(base_path=Path("."))

# Etkinlik işlemleri
events = datastore.get_events()
event_id = datastore.create_event("Yeni Etkinlik")

# Takım işlemleri
teams = datastore.get_teams()
datastore.save_teams([{"number": "202501", "name": "Takım 1"}])

# Kullanıcı işlemleri
datastore.create_user("kullanici", "sifre", "admin")
authenticated = datastore.authenticate_user("kullanici", "sifre")

# İnceleme slotları
slot_id = datastore.create_inspection_slot(
    team_number="202501",
    inspection_type="Donanım",
    slot_date="2026-02-06",
    slot_time="09:00",
    duration_minutes=20
)

# Deneme maçları
match_id = datastore.create_practice_match(
    match_number="P1",
    field_number=1,
    match_date="2026-02-06",
    match_time="14:00",
    red_alliance=["202501", "202502"],
    blue_alliance=["202503", "202504"]
)
```

## Modül Detayları

### BaseStorage (`base.py`)

**Sorumluluklar:**
- Veritabanı şeması oluşturma
- Migrasyon işlemleri
- Temel yardımcı fonksiyonlar

**Önemli Metodlar:**
- `_init_db()`: Veritabanı şemasını oluşturur
- `_migrate_legacy_schema()`: Eski şemadan yeni şemaya migrasyon
- `is_empty()`: Veritabanının boş olup olmadığını kontrol eder

### EventsStorage (`events.py`)

**Sorumluluklar:**
- Etkinlik CRUD işlemleri
- Aktif etkinlik yönetimi

**Önemli Metodlar:**
- `create_event(name, data)`: Yeni etkinlik oluşturur
- `get_event()`: Aktif etkinliği getirir
- `save_event(data)`: Aktif etkinliği kaydeder
- `get_events()`: Tüm etkinlikleri listeler
- `set_active_event(event_id)`: Aktif etkinliği ayarlar
- `delete_event(event_id)`: Etkinlik siler

### TeamsStorage (`teams.py`)

**Sorumluluklar:**
- Takım CRUD işlemleri
- Etkinlik bazlı takım yönetimi

**Önemli Metodlar:**
- `get_teams()`: Aktif etkinliğin takımlarını getirir
- `save_teams(teams)`: Aktif etkinliğin takımlarını kaydeder

### UsersStorage (`users.py`)

**Sorumluluklar:**
- Kullanıcı CRUD işlemleri
- Kimlik doğrulama (şifre ve token)
- Varsayılan kullanıcı oluşturma

**Önemli Metodlar:**
- `create_user(username, password, role, event_id)`: Yeni kullanıcı oluşturur
- `authenticate_user(username, password, event_id)`: Şifre ile kimlik doğrulama
- `authenticate_token(token)`: Token ile kimlik doğrulama
- `get_user_role(username)`: Kullanıcı rolünü getirir
- `delete_user(username, event_id)`: Kullanıcı siler
- `create_default_role_users(event_id)`: Varsayılan rol kullanıcıları oluşturur

### InspectionStorage (`inspection.py`)

**Sorumluluklar:**
- İnceleme slotları CRUD işlemleri
- Çakışma kontrolü

**Önemli Metodlar:**
- `create_inspection_slot(...)`: Yeni inceleme slotu oluşturur
- `get_inspection_slots(...)`: İnceleme slotlarını listeler (filtreleme destekler)
- `update_inspection_slot(slot_id, ...)`: İnceleme slotunu günceller
- `delete_inspection_slot(slot_id)`: İnceleme slotunu siler
- `check_inspection_conflict(...)`: Çakışma kontrolü yapar

### PracticeMatchesStorage (`practice_matches.py`)

**Sorumluluklar:**
- Deneme maçları CRUD işlemleri
- Çakışma kontrolü

**Önemli Metodlar:**
- `create_practice_match(...)`: Yeni deneme maçı oluşturur
- `get_practice_matches(...)`: Deneme maçlarını listeler (filtreleme destekler)
- `update_practice_match(match_id, ...)`: Deneme maçını günceller
- `delete_practice_match(match_id)`: Deneme maçını siler
- `check_practice_match_conflict(...)`: Çakışma kontrolü yapar

## Testler

Kapsamlı test dosyası: `test_storage_modules.py`

**Test Kapsamı:**
- ✅ Veritabanı başlatma ve şema oluşturma
- ✅ Etkinlik CRUD işlemleri (6 test)
- ✅ Takım CRUD işlemleri (2 test)
- ✅ Kullanıcı CRUD işlemleri ve kimlik doğrulama (6 test)
- ✅ İnceleme slotları CRUD işlemleri (5 test)
- ✅ Deneme maçları CRUD işlemleri (5 test)
- ✅ Çakışma kontrolleri (2 test)
- ✅ Entegrasyon testleri (2 test)

**Test Sonuçları:**
- Toplam Test: 28
- Başarılı: 28
- Başarısız: 0
- Başarı Oranı: 100%

**Test Çalıştırma:**
```bash
python test_storage_modules.py
```

## Avantajlar

1. **Modülerlik**: Her modül kendi sorumluluğuna odaklanır
2. **Okunabilirlik**: Kod daha anlaşılır ve bakımı kolay
3. **Genişletilebilirlik**: Yeni özellikler kolayca eklenebilir
4. **Test Edilebilirlik**: Her modül bağımsız test edilebilir
5. **Dokümantasyon**: Her fonksiyon detaylı açıklamalarla dokümante edilmiştir

## Notlar

- Eski `storage.py` dosyası hala mevcut (yedek olarak)
- Tüm mevcut işlevsellik korunmuştur
- Multiple inheritance kullanılarak modüller birleştirilmiştir
- Tüm modüller `BaseStorage`'dan türetilmiştir (veritabanı bağlantısı için)

## Geliştiriciler İçin

Yeni bir storage modülü eklemek için:

1. `src/core/storage/` altında yeni bir dosya oluştur
2. `BaseStorage`'dan türetilen bir sınıf oluştur
3. `src/core/storage/__init__.py` dosyasına ekle
4. `DataStore` sınıfına multiple inheritance ile ekle
5. Test dosyasına testler ekle

Örnek:
```python
# src/core/storage/new_module.py
class NewModuleStorage:
    def new_function(self):
        """Yeni fonksiyon."""
        pass

# src/core/storage/__init__.py
from .new_module import NewModuleStorage

class DataStore(BaseStorage, ..., NewModuleStorage):
    pass
```

## Son Güncelleme

- Tarih: 2026-01-16
- Modülerleştirme tamamlandı
- Tüm testler başarılı
- Dokümantasyon tamamlandı
