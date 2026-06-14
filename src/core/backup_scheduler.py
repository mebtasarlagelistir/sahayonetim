"""
Otomatik Veritabanı Yedekleme Zamanlayıcısı

Etkinlik sırasında veri kaybı riskini azaltmak için, çalışan sunucu üzerinde
periyodik olarak SQLite veritabanının tutarlı bir kopyasını alır.

- Yedekler `backups/auto/` altına yazılır (manuel/reset yedekleri `backups/`
  altında ayrı kalır ve budanmaz).
- SQLite backup API kullanılır (DataStore.backup_database); uygulama çalışırken
  güvenlidir, WAL'daki bekleyen değişiklikler de dahil edilir.
- Yalnızca son `keep` adet otomatik yedek tutulur; eskiler silinir.
- gevent uyumlu: socketio.start_background_task + socketio.sleep kullanır.
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _auto_backup_dir(datastore) -> Path:
    return datastore.base_path / "backups" / "auto"


def run_backup(datastore, keep: int = 48) -> Path | None:
    """
    Tek bir otomatik yedek alır ve eski yedekleri budar.

    Returns:
        Path: Oluşturulan yedek dosyası; hata olursa None.
    """
    try:
        backup_dir = _auto_backup_dir(datastore)
        path = datastore.backup_database(backup_dir=backup_dir)
        _prune(backup_dir, keep)
        return path
    except Exception as e:
        logger.error("Otomatik yedek alınamadı: %s", e, exc_info=True)
        return None


def _prune(backup_dir: Path, keep: int) -> None:
    """Yalnızca son `keep` adet otomatik yedeği tutar (isim = zaman damgası, kronolojik)."""
    try:
        files = sorted(backup_dir.glob("data_*.db"))
        for old in files[:-keep] if keep > 0 else files:
            try:
                old.unlink()
            except OSError:
                pass
    except Exception as e:
        logger.warning("Yedek budama hatası: %s", e)


def start_backup_scheduler(socketio, datastore, interval_seconds: int = 600, keep: int = 48) -> None:
    """
    Arka planda periyodik yedekleme görevini başlatır (gevent greenlet).

    Args:
        socketio: Flask-SocketIO instance (start_background_task / sleep için).
        datastore: DataStore instance.
        interval_seconds: Yedekler arası süre (saniye).
        keep: Tutulacak en son otomatik yedek sayısı.
    """
    if interval_seconds <= 0:
        logger.info("Otomatik yedekleme devre dışı (interval<=0).")
        return

    def _loop():
        logger.info(
            "Otomatik yedekleme aktif: her %d sn, son %d yedek tutulur → %s",
            interval_seconds, keep, _auto_backup_dir(datastore),
        )
        while True:
            socketio.sleep(interval_seconds)
            path = run_backup(datastore, keep=keep)
            if path:
                try:
                    size_kb = path.stat().st_size / 1024
                except OSError:
                    size_kb = 0
                logger.info("Otomatik yedek alındı: %s (%.0f KB)", path.name, size_kb)

    socketio.start_background_task(_loop)
