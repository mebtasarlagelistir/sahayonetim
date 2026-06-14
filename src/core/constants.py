"""
Constants Modülü

Proje genelinde kullanılan sabit değerler bu modülde tanımlanır.
Magic number'lar ve hardcoded değerler yerine bu modülden alınmalıdır.

Bu sayede:
- Değerler tek bir yerden yönetilir
- Değişiklikler kolayca yapılabilir
- Kod daha okunabilir ve bakımı kolaydır
"""


class MatchConstants:
    """
    Maç kontrolü ile ilgili sabitler.
    
    Bu değerler event config'den de alınabilir, ancak varsayılan değerler
    burada tanımlanır.
    """
    
    # Maç zamanlayıcı süreleri (saniye) - resmi değerler, timer kararlılığı için tek kaynak
    AUTONOMOUS_DURATION = 30   # OKS (Otonom) - 30 saniye
    PREPARE_TELEOP_DURATION = 10   # Otonom -> Teleop arası hazırlık
    DRIVER_CONTROLLED_DURATION = 90  # SKS (Sürücü kontrollü) - 90 sn + 30 sn Oyun Sonu = 120 sn sürücü dönemi
    END_GAME_DURATION = 30  # Oyun sonu - SKS'nin ardından gelen son 30 sn
    POST_MATCH_DURATION = 10  # Maç sonrası
    
    # Maç durumları
    MATCH_STATES = {
        "idle": "Beklemede",
        "autonomous": "Otonom",
        "prepare_teleop": "Kontrol Ünitelerinizi Hazırlayınız",
        "driver_controlled": "Sürücü Kontrollü",
        "end_game": "Oyun Sonu",
        "post_match": "Maç Sonrası",
        "completed": "Tamamlandı"
    }


class NetworkConstants:
    """
    Network ve API ile ilgili sabitler.
    """
    
    # Retry mekanizması
    SSE_RETRY_MAX = 5  # Maksimum retry sayısı
    SSE_RETRY_DELAY_BASE = 1000  # İlk retry gecikmesi (ms)
    SSE_RETRY_DELAY_MAX = 30000  # Maksimum retry gecikmesi (ms)
    SSE_RETRY_BACKOFF = 2  # Exponential backoff çarpanı
    
    # API retry
    API_RETRY_MAX = 3  # API çağrıları için maksimum retry
    API_RETRY_DELAY_BASE = 1000  # İlk retry gecikmesi (ms)
    API_RETRY_BACKOFF = 2  # Exponential backoff çarpanı
    
    # Update interval
    UPDATE_INTERVAL = 3000  # UI güncelleme aralığı (ms)
    TIMER_UPDATE_INTERVAL = 1000  # Timer güncelleme aralığı (ms)


class FileConstants:
    """
    Dosya yükleme ve işleme ile ilgili sabitler.
    """
    
    # Dosya boyutu limitleri (bytes)
    MAX_ARCHIVE_SIZE = 50 * 1024 * 1024  # 50MB
    MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB (genel upload limiti)
    
    # İzin verilen dosya uzantıları
    ALLOWED_ARCHIVE_EXTENSIONS = [".zip"]
    ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif"]
    
    # Dosya yolu desenleri
    ARCHIVE_MANIFEST_NAME = "manifest.json"
    ARCHIVE_DATA_DB_PATHS = ["data.db", "resources/data.db", "src/resources/data.db"]
    ARCHIVE_CONFIG_PATHS = ["config.json", "resources/config.json", "src/resources/config.json"]
    ARCHIVE_SECRET_PATHS = ["secret.key", "resources/secret.key", "src/resources/secret.key"]


class RateLimitConstants:
    """
    Rate limiting ile ilgili sabitler.
    
    Bu değerler Flask-Limiter yapılandırmasında kullanılır.
    """
    
    # Varsayılan limitler
    DEFAULT_DAILY_LIMIT = "200000 per day"
    DEFAULT_HOURLY_LIMIT = "10000 per hour"
    
    # Özel endpoint limitleri
    LOGIN_LIMIT = "10 per minute"  # Brute force koruması
    EVENT_CREATE_LIMIT = "20 per hour"
    USER_DEFAULTS_LIMIT = "5 per hour"
    ARCHIVE_UPLOAD_LIMIT = "10 per hour"
    ARCHIVE_DOWNLOAD_LIMIT = "30 per hour"
    EVENT_READ_LIMIT = "300 per minute"


class ValidationConstants:
    """
    Validasyon ile ilgili sabitler.
    """
    
    # Etkinlik kodu
    EVENT_CODE_MIN_LENGTH = 1
    EVENT_CODE_MAX_LENGTH = 4
    
    # Takım numarası
    TEAM_NUMBER_MIN_LENGTH = 1
    TEAM_NUMBER_MAX_LENGTH = 10
    
    # Kullanıcı adı
    USERNAME_MIN_LENGTH = 3
    USERNAME_MAX_LENGTH = 50
    
    # Şifre
    PASSWORD_MIN_LENGTH = 6
    PASSWORD_MAX_LENGTH = 100


class UIConstants:
    """
    UI ve frontend ile ilgili sabitler.
    """
    
    # Toast mesaj süreleri (ms)
    TOAST_DURATION_SUCCESS = 3000
    TOAST_DURATION_ERROR = 5000
    TOAST_DURATION_WARNING = 4000
    TOAST_DURATION_INFO = 3000
    
    # Clock update interval
    CLOCK_UPDATE_INTERVAL = 1000  # 1 saniye
    
    # Event summary refresh interval
    EVENT_SUMMARY_REFRESH_INTERVAL = 30000  # 30 saniye
