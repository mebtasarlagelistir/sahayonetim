"""
Network Utility Modülü

Network hatalarında retry mekanizması ve hata yönetimi için yardımcı fonksiyonlar.
"""

import time
from typing import Callable, Any, Optional
from functools import wraps


def retry_on_network_error(
    max_retries: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: tuple = (Exception,)
):
    """
    Network hatalarında otomatik retry sağlayan decorator.
    
    Args:
        max_retries: Maksimum deneme sayısı
        delay: İlk deneme arası gecikme (saniye)
        backoff: Her denemede gecikmeyi artırma çarpanı
        exceptions: Retry yapılacak exception tipleri
    
    Returns:
        Decorated function
    
    Örnek:
        @retry_on_network_error(max_retries=3, delay=1.0)
        def fetch_data():
            return requests.get("http://example.com")
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            retry_delay = delay
            last_exception = None
            
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        time.sleep(retry_delay)
                        retry_delay *= backoff
                    else:
                        raise
            
            if last_exception:
                raise last_exception
        
        return wrapper
    return decorator


def validate_file_upload(
    file,
    allowed_extensions: list = None,
    max_size: int = None,
    required: bool = True
) -> tuple[bool, Optional[str]]:
    """
    Dosya yükleme validasyonu.
    
    Args:
        file: Flask request.files objesi
        allowed_extensions: İzin verilen dosya uzantıları (örn: ['.zip', '.json'])
        max_size: Maksimum dosya boyutu (bytes)
        required: Dosya zorunlu mu?
    
    Returns:
        tuple: (is_valid, error_message)
    
    Örnek:
        is_valid, error = validate_file_upload(
            file,
            allowed_extensions=['.zip'],
            max_size=50 * 1024 * 1024  # 50MB
        )
        if not is_valid:
            return jsonify({"error": error}), 400
    """
    if required and (not file or not file.filename):
        return False, "Dosya seçilmedi"
    
    if not file or not file.filename:
        return True, None  # Dosya opsiyonel ise
    
    # Dosya uzantısı kontrolü
    if allowed_extensions:
        file_ext = None
        if '.' in file.filename:
            file_ext = '.' + file.filename.rsplit('.', 1)[1].lower()
        
        if file_ext not in allowed_extensions:
            return False, f"Sadece {', '.join(allowed_extensions)} dosyaları kabul edilir"
    
    # Dosya boyutu kontrolü
    if max_size:
        try:
            file.seek(0, 2)  # Dosyanın sonuna git
            file_size = file.tell()
            file.seek(0)  # Başa dön
            
            if file_size > max_size:
                size_mb = file_size / 1024 / 1024
                max_mb = max_size / 1024 / 1024
                return False, f"Dosya boyutu {max_mb}MB'dan büyük olamaz (Mevcut: {size_mb:.2f}MB)"
            
            if file_size == 0:
                return False, "Dosya boş olamaz"
        except Exception as e:
            return False, f"Dosya boyutu kontrol edilemedi: {str(e)}"
    
    return True, None
