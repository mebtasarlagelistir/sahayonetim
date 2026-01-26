"""
Production Server Yapılandırması

Bu script production ortamında kullanılmalıdır.
12+ eşzamanlı cihaz için optimize edilmiştir.

Kullanım:
    python production_server.py

veya

    waitress-serve --host=0.0.0.0 --port=5000 --threads=8 --call app_web:create_app
"""

import os
import logging
from pathlib import Path

# Production modunu zorla
os.environ["FLASK_ENV"] = "production"

from app_web import create_app

# Logging yapılandırması - Production için WARNING seviyesi
logging.basicConfig(
    level=logging.WARNING,  # Production için sadece WARNING ve ERROR
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(Path(__file__).parent / 'logs' / 'app.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

if __name__ == "__main__":
    try:
        from waitress import serve
        
        app = create_app()
        
        logger.info("=" * 60)
        logger.info("MEMSKOR Production Server Başlatılıyor...")
        logger.info("=" * 60)
        logger.info("Server: Waitress (Windows uyumlu)")
        logger.info("Threads: 8 (12+ cihaz için optimize)")
        logger.info("Host: 0.0.0.0 (tüm ağ arayüzleri)")
        logger.info("Port: 5000")
        logger.info("=" * 60)
        
        # Waitress ile çalıştır
        # threads=8: 12+ cihaz için optimal (4 hakem + 4 seyirci + 4 jüri + match control)
        # channel_timeout=120: SSE bağlantıları için uzun timeout
        serve(
            app,
            host="0.0.0.0",
            port=5000,
            threads=8,  # 12+ cihaz için optimal
            channel_timeout=120,  # SSE bağlantıları için
            cleanup_interval=30,  # Bağlantı temizleme aralığı
            asyncore_use_poll=True,  # Windows için optimize
            url_prefix="",
            _quiet=False
        )
    except ImportError:
        logger.error("Waitress yüklü değil!")
        logger.error("Yüklemek için: pip install waitress")
        logger.info("Alternatif: Gunicorn (Linux/Mac) veya uwsgi kullanabilirsiniz.")
        raise
    except KeyboardInterrupt:
        logger.info("Server durduruluyor...")
    except Exception as e:
        logger.error(f"Server hatası: {str(e)}", exc_info=True)
        raise
