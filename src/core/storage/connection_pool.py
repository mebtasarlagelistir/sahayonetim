"""
SQLite Connection Pool Modülü

Bu modül SQLite veritabanı bağlantılarını yönetir ve connection pooling sağlar.
12+ eşzamanlı cihaz için optimize edilmiştir.

Özellikler:
- Connection pooling (bağlantı havuzu)
- Thread-safe bağlantı yönetimi
- WAL mode (Write-Ahead Logging) - daha iyi concurrent read
- Timeout ayarları
- Connection reuse
"""

import sqlite3
import threading
from pathlib import Path
from typing import Optional
from contextlib import contextmanager


class SQLiteConnectionPool:
    """
    SQLite bağlantı havuzu yöneticisi.
    
    Thread-safe ve performanslı bağlantı yönetimi sağlar.
    """
    
    def __init__(self, db_path: Path, pool_size: int = 5, timeout: float = 5.0):
        """
        Connection pool oluşturur.
        
        Args:
            db_path: Veritabanı dosya yolu
            pool_size: Maksimum pool boyutu (varsayılan: 5)
            timeout: Bağlantı timeout süresi (saniye)
        """
        self.db_path = db_path
        self.pool_size = pool_size
        self.timeout = timeout
        self._pool = []
        self._lock = threading.Lock()
        self._active_connections = 0
        
        # WAL mode'u etkinleştir (daha iyi concurrent read)
        self._enable_wal_mode()
    
    def _configure_connection(self, conn):
        """
        Yeni açılan bir bağlantıya tüm PRAGMA ayarlarını uygular.

        ÖNEMLI: SQLite'ta foreign key zorlaması bağlantı başına varsayılan
        KAPALIDIR; şemadaki ON DELETE CASCADE kısıtlarının çalışması için
        her bağlantıda 'PRAGMA foreign_keys=ON' set edilmelidir.
        """
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")  # Daha hızlı, güvenli
        conn.execute("PRAGMA foreign_keys=ON")  # CASCADE kısıtları için zorunlu
        conn.execute("PRAGMA cache_size=-64000")  # 64MB cache
        conn.execute("PRAGMA temp_store=MEMORY")  # Temp tabloları memory'de tut
        conn.execute("PRAGMA mmap_size=268435456")  # 256MB memory-mapped I/O

    def _enable_wal_mode(self):
        """WAL (Write-Ahead Logging) mode'unu etkinleştirir."""
        try:
            # İlk bağlantıyı oluştur ve WAL mode'u etkinleştir
            conn = sqlite3.connect(
                str(self.db_path),
                timeout=self.timeout,
                check_same_thread=False  # Thread-safe için
            )
            self._configure_connection(conn)
            conn.close()
        except Exception as e:
            # WAL mode etkinleştirilemezse normal modda devam et
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"WAL mode etkinleştirilemedi: {str(e)}")
    
    @contextmanager
    def get_connection(self):
        """
        Bağlantı havuzundan bir connection alır (context manager).
        
        Kullanım:
            with pool.get_connection() as conn:
                conn.execute("SELECT ...")
        """
        conn = None
        # Pool dolu iken oluşturulan, sayaca dahil edilmeyen geçici bağlantı mı?
        is_temporary = False
        try:
            # Pool'dan bağlantı al veya yeni oluştur
            with self._lock:
                if self._pool:
                    conn = self._pool.pop()
                    self._active_connections += 1
                elif self._active_connections < self.pool_size:
                    # Yeni havuz bağlantısı oluştur (sayaca dahil)
                    conn = sqlite3.connect(
                        str(self.db_path),
                        timeout=self.timeout,
                        check_same_thread=False
                    )
                    self._configure_connection(conn)
                    self._active_connections += 1
                else:
                    # Pool dolu, geçici bağlantı oluştur (sayaca dahil DEĞİL)
                    conn = sqlite3.connect(
                        str(self.db_path),
                        timeout=self.timeout,
                        check_same_thread=False
                    )
                    self._configure_connection(conn)
                    is_temporary = True

            yield conn

        except Exception:
            # Herhangi bir hata: açık/kirli transaction'ı geri al ve bağlantıyı at.
            # Aksi halde yarım transaction bir sonraki kullanıcıya pool'dan geçebilir.
            if conn is not None:
                try:
                    conn.rollback()
                except Exception:
                    pass
                try:
                    conn.close()
                except Exception:
                    pass
                with self._lock:
                    if not is_temporary and self._active_connections > 0:
                        self._active_connections -= 1
                conn = None  # finally'de tekrar işlenmesin
            raise
        finally:
            # Sağlıklı bağlantıyı pool'a geri ekle (veya geçici ise kapat)
            if conn is not None:
                with self._lock:
                    if is_temporary:
                        # Geçici bağlantı sayaca dahil değildi; yalnızca kapat
                        try:
                            conn.close()
                        except Exception:
                            pass
                    elif len(self._pool) < self.pool_size and conn not in self._pool:
                        # Pool'a geri ekle
                        self._pool.append(conn)
                        self._active_connections -= 1
                    else:
                        # Pool dolu, kapat
                        try:
                            conn.close()
                        except Exception:
                            pass
                        if self._active_connections > 0:
                            self._active_connections -= 1
    
    def close_all(self):
        """Tüm bağlantıları kapatır."""
        with self._lock:
            for conn in self._pool:
                try:
                    conn.close()
                except:
                    pass
            self._pool.clear()
            self._active_connections = 0


# Global connection pool instance
_connection_pool: Optional[SQLiteConnectionPool] = None
_pool_lock = threading.Lock()


def get_connection_pool(db_path: Path, pool_size: int = 5) -> SQLiteConnectionPool:
    """
    Global connection pool instance'ını döner.
    
    Args:
        db_path: Veritabanı dosya yolu
        pool_size: Pool boyutu
        
    Returns:
        SQLiteConnectionPool: Connection pool instance
    """
    global _connection_pool
    with _pool_lock:
        if _connection_pool is None:
            _connection_pool = SQLiteConnectionPool(db_path, pool_size=pool_size)
        return _connection_pool
