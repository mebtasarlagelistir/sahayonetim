"""
Yeni Yarışma İçin Veritabanı Sıfırlama Scripti
==============================================

Bu script mevcut veritabanını (src/resources/data.db) zaman damgalı olarak
yedekler, ardından yeni bir yarışma için temiz bir veritabanı oluşturur.

Davranış:
    1. Mevcut data.db tutarlı şekilde backups/data_YYYYMMDD_HHMMSS.db olarak yedeklenir
       (SQLite backup API ile; WAL'daki bekleyen veriler de dahil edilir).
    2. data.db, data.db-wal ve data.db-shm dosyaları silinir.
    3. DataStore yeniden başlatılır → şema sıfırdan kurulur ve varsayılan admin
       kullanıcısı (admin/admin123) otomatik oluşturulur.

Korunanlar: Şema yapısı + varsayılan admin kullanıcısı.
Silinenler: Tüm etkinlik, takım, maç takvimi, deneme maçı, skor, inceleme ve ödül verileri.

Kullanım:
    python scripts/reset_for_new_event.py            # onay sorar
    python scripts/reset_for_new_event.py --yes       # onaysız çalışır

NOT: Uygulama (app_web.py) çalışırken çalıştırmayın; önce sunucuyu durdurun.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

# Windows konsolunda (cp1252) Türkçe karakterlerin hata vermemesi için
# çıktıyı UTF-8'e ayarla (Python 3.7+).
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except (AttributeError, ValueError):
    pass

# Proje kökünü yola ekle (script doğrudan çalıştırılabilsin)
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.storage import DataStore  # noqa: E402

DB_PATH = PROJECT_ROOT / "src" / "resources" / "data.db"
BACKUP_DIR = PROJECT_ROOT / "backups"


def backup_database() -> Path | None:
    """
    Mevcut veritabanını tutarlı şekilde yedekler.

    SQLite backup API kullanılır; bu sayede WAL dosyasındaki bekleyen değişiklikler
    de yedeğe dahil edilir (düz dosya kopyası bunu garanti etmez).

    Returns:
        Path: Oluşturulan yedek dosyasının yolu. DB yoksa None.
    """
    if not DB_PATH.exists():
        print(f"[i] Veritabanı bulunamadı ({DB_PATH}); yedek alınmadı.")
        return None

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"data_{timestamp}.db"

    source = sqlite3.connect(str(DB_PATH))
    try:
        dest = sqlite3.connect(str(backup_path))
        try:
            source.backup(dest)
        finally:
            dest.close()
    finally:
        source.close()

    size_kb = backup_path.stat().st_size / 1024
    print(f"[OK] Yedek alındı: {backup_path}  ({size_kb:.1f} KB)")
    return backup_path


def remove_db_files() -> None:
    """data.db ve yardımcı WAL/SHM dosyalarını siler."""
    for suffix in ("", "-wal", "-shm"):
        path = DB_PATH.parent / (DB_PATH.name + suffix)
        if path.exists():
            path.unlink()
            print(f"[OK] Silindi: {path.name}")


def reinitialize() -> None:
    """
    DataStore'u yeniden başlatarak temiz şema + varsayılan admin oluşturur.
    """
    store = DataStore(base_path=PROJECT_ROOT)
    users = store.list_users()
    events = store.get_events()
    print(f"[OK] Temiz veritabanı oluşturuldu. "
          f"Kullanıcı: {len(users)} (admin), Etkinlik: {len(events)}.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Yeni yarışma için veritabanını yedekle ve sıfırla."
    )
    parser.add_argument(
        "--yes", action="store_true",
        help="Onay sormadan doğrudan çalıştır.",
    )
    args = parser.parse_args()

    print("=" * 60)
    print(" MEMSKOR — Yeni Yarışma İçin Veritabanı Sıfırlama")
    print("=" * 60)
    print(f" Veritabanı : {DB_PATH}")
    print(f" Yedek dizini: {BACKUP_DIR}")
    print("-" * 60)
    print(" UYARI: Tüm etkinlik/takım/maç/skor verileri SİLİNECEK.")
    print("        (Yedek alınır, admin kullanıcısı korunur.)")
    print("=" * 60)

    if not args.yes:
        answer = input("Devam edilsin mi? Onaylamak için 'EVET' yazın: ").strip()
        if answer != "EVET":
            print("[X] İptal edildi. Değişiklik yapılmadı.")
            return 1

    backup_database()
    remove_db_files()
    reinitialize()
    print("\n[OK] Tamamlandı. Uygulamayı başlatıp admin/admin123 ile giriş yapabilirsiniz.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
