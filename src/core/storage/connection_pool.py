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
    
    def _enable_wal_mode(self):
        """WAL (Write-Ahead Logging) mode'unu etkinleştirir."""
        try:
            # İlk bağlantıyı oluştur ve WAL mode'u etkinleştir
            conn = sqlite3.connect(
                str(self.db_path),
                timeout=self.timeout,
                check_same_thread=False  # Thread-safe için
            )
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")  # Daha hızlı, güvenli
            conn.execute("PRAGMA cache_size=-64000")  # 64MB cache
            conn.execute("PRAGMA temp_store=MEMORY")  # Temp tabloları memory'de tut
            conn.execute("PRAGMA mmap_size=268435456")  # 256MB memory-mapped I/O
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
        try:
            # Pool'dan bağlantı al veya yeni oluştur
            with self._lock:
                if self._pool:
                    conn = self._pool.pop()
                    self._active_connections += 1
                elif self._active_connections < self.pool_size:
                    # Yeni bağlantı oluştur
                    conn = sqlite3.connect(
                        str(self.db_path),
                        timeout=self.timeout,
                        check_same_thread=False
                    )
                    # WAL mode ve optimizasyonlar
                    conn.execute("PRAGMA journal_mode=WAL")
                    conn.execute("PRAGMA synchronous=NORMAL")
                    conn.execute("PRAGMA cache_size=-64000")
                    conn.execute("PRAGMA temp_store=MEMORY")
                    conn.execute("PRAGMA mmap_size=268435456")
                    self._active_connections += 1
                else:
                    # Pool dolu, yeni bağlantı oluştur (geçici)
                    conn = sqlite3.connect(
                        str(self.db_path),
                        timeout=self.timeout,
                        check_same_thread=False
                    )
                    conn.execute("PRAGMA journal_mode=WAL")
                    conn.execute("PRAGMA synchronous=NORMAL")
            
            yield conn
            
        except sqlite3.OperationalError as e:
            # Bağlantı hatası - pool'a geri ekleme
            if conn:
                try:
                    conn.close()
                except:
                    pass
            raise
        finally:
            # Bağlantıyı pool'a geri ekle
            if conn:
                with self._lock:
                    if self._active_connections <= self.pool_size and conn not in self._pool:
                        # Pool'a geri ekle
                        try:
                            # Bağlantının hala geçerli olduğunu kontrol et
                            # SQLite connection'ları thread-safe değil, bu yüzden sadece basit bir kontrol yap
                            # Detaylı kontrol connection kullanımı sırasında yapılacak
                            self._pool.append(conn)
                            self._active_connections -= 1
                        except:
                            # Bağlantı geçersiz, kapat
                            try:
                                conn.close()
                            except:
                                pass
                            self._active_connections -= 1
                    else:
                        # Pool dolu veya geçici bağlantı, kapat
                        try:
                            conn.close()
                        except:
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
