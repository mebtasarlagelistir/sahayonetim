"""
Yetim (orphan) kayıt temizleme betiği.

FK zorlaması (PRAGMA foreign_keys) önceden kapalı olduğu için, geçmişte silinen
etkinliklere ait takım/maç/inceleme/ödül kayıtları veritabanında öksüz kalmış
olabilir. Bu betik, var olmayan bir event_id'ye bağlı tüm satırları bulur,
raporlar ve (onaylanırsa) siler. Çalıştırmadan önce data.db'nin yedeğini alır.

Kullanım:
    python scripts/cleanup_orphans.py            # önce kuru çalıştırma (sadece rapor)
    python scripts/cleanup_orphans.py --apply    # gerçekten sil
    python scripts/cleanup_orphans.py --apply --vacuum   # silip VACUUM yap
"""
from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Windows konsolu (cp1252) Türkçe karakterlerde çökmesin
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from src.core.storage import DataStore


def _tables_with_event_id(conn) -> list[str]:
    """event_id sütunu olan tüm tabloları döner."""
    tables = [
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    ]
    result = []
    for table in tables:
        cols = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if "event_id" in cols:
            result.append(table)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Yetim kayıtları temizler")
    parser.add_argument("--apply", action="store_true", help="Gerçekten sil (yoksa sadece rapor)")
    parser.add_argument("--vacuum", action="store_true", help="Silme sonrası VACUUM çalıştır")
    args = parser.parse_args()

    datastore = DataStore()
    db_path = Path(datastore.db_path)
    if not db_path.exists():
        print(f"HATA: Veritabanı bulunamadı: {db_path}")
        return 1

    print(f"Veritabanı: {db_path}")

    # Yedek al (her durumda; salt-rapor olsa bile zararı yok ama yalnızca --apply'da alalım)
    if args.apply:
        backup_dir = db_path.parent / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = backup_dir / f"data_before_cleanup_{ts}.db"
        shutil.copy2(db_path, backup_path)
        print(f"Yedek alındı: {backup_path}")

    total_orphans = 0
    with datastore._get_connection() as conn:
        valid_event_ids = {row[0] for row in conn.execute("SELECT id FROM events").fetchall()}
        print(f"Geçerli etkinlik sayısı: {len(valid_event_ids)}")
        print("-" * 60)

        tables = _tables_with_event_id(conn)
        for table in tables:
            # users tablosunda admin event_id IS NULL ile global tutulur; NULL'lar korunur.
            rows = conn.execute(
                f"SELECT COUNT(*) FROM {table} "
                f"WHERE event_id IS NOT NULL "
                f"AND event_id NOT IN (SELECT id FROM events)"
            ).fetchone()[0]
            if rows > 0:
                total_orphans += rows
                print(f"  {table:<35} {rows:>6} yetim kayıt")
                if args.apply:
                    conn.execute(
                        f"DELETE FROM {table} "
                        f"WHERE event_id IS NOT NULL "
                        f"AND event_id NOT IN (SELECT id FROM events)"
                    )
            else:
                print(f"  {table:<35} {'temiz':>6}")

        if args.apply:
            conn.commit()
            # FK bütünlüğünü doğrula
            violations = conn.execute("PRAGMA foreign_key_check").fetchall()
            print("-" * 60)
            if violations:
                print(f"UYARI: {len(violations)} FK ihlali hâlâ var: {violations[:5]}")
            else:
                print("FK bütünlüğü: temiz (ihlal yok)")
            if args.vacuum:
                conn.execute("VACUUM")
                print("VACUUM tamamlandı.")

    print("=" * 60)
    print(f"Toplam yetim kayıt: {total_orphans}")
    if not args.apply and total_orphans > 0:
        print("Silmek için tekrar --apply ile çalıştırın.")
    elif args.apply:
        print("Temizlik tamamlandı.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
