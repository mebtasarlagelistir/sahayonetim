"""
Veritabanı Yönetim Modülü - Ana Giriş Noktası

Bu modül tüm veritabanı işlemlerini yönetir. Modüler yapıda organize edilmiştir:
- base: Temel veritabanı işlemleri (şema, migrasyon)
- events: Etkinlik yönetimi
- teams: Takım yönetimi
- users: Kullanıcı yönetimi
- inspection: İnceleme slotları yönetimi
- practice_matches: Deneme maçları yönetimi

DataStore sınıfı tüm bu modülleri birleştirir ve tek bir arayüz sunar.
"""

from .base import BaseStorage
from .events import EventsStorage
from .teams import TeamsStorage
from .users import UsersStorage
from .inspection import InspectionStorage
from .practice_matches import PracticeMatchesStorage
from .match_schedule import MatchScheduleStorage

from pathlib import Path


class DataStore(
    BaseStorage,
    EventsStorage,
    TeamsStorage,
    UsersStorage,
    InspectionStorage,
    PracticeMatchesStorage,
    MatchScheduleStorage,
):
    """
    Veritabanı işlemlerini yöneten ana sınıf.
    
    Bu sınıf tüm storage modüllerini birleştirir ve tek bir arayüz sunar.
    Multiple inheritance kullanarak tüm modül fonksiyonlarını içerir.
    
    Kullanım:
        datastore = DataStore(base_path=Path("/path/to/project"))
        events = datastore.get_events()
        datastore.create_event("Yeni Etkinlik")
    """
    
    def __init__(self, base_path: Path | None = None) -> None:
        """
        DataStore'u başlatır.
        
        Args:
            base_path: Proje kök dizini. None ise otomatik tespit edilir.
            
        İşlemler:
            1. Veritabanı dosya yolu belirlenir
            2. Veritabanı şeması oluşturulur (yoksa)
            3. Eski şema migrasyonu yapılır
            4. Varsayılan admin kullanıcısı oluşturulur (yoksa)
        """
        # BaseStorage'ın __init__'ini çağır
        super().__init__(base_path)
        
        # Varsayılan admin kullanıcısını oluştur (UsersStorage'dan)
        self.ensure_default_admin()
