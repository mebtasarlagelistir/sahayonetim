"""
Etkinlik arşiv yönetimi route'ları - indir/yükle API endpoint'leri.
"""

from __future__ import annotations

from datetime import datetime
import io
import json
from pathlib import Path
import re
import shutil
import zipfile

from flask import Blueprint, jsonify, request, send_file
from src.core.utils.network import validate_file_upload
from src.core.constants import FileConstants, RateLimitConstants
import logging

# Logger oluştur
logger = logging.getLogger(__name__)


def register_archive_routes(bp: Blueprint, datastore, require_login, require_event_manager, limiter=None, require_admin=None) -> None:
    """
    Arşiv yönetimi route'larını Blueprint'e kaydeder.

    Args:
        bp: Blueprint instance
        datastore: DataStore instance
        require_login: require_login decorator
        require_event_manager: require_event_manager decorator
        limiter: Flask-Limiter instance (opsiyonel, rate limiting için)
        require_admin: require_admin decorator (arşiv yükleme için zorunlu)
    """
    # Arşiv geri yükleme tüm veritabanının ve secret.key'in üzerine yazdığı için
    # yalnızca admin'e açıktır. require_admin verilmezse güvenli tarafta kalıp
    # require_event_manager'a düşeriz (eski davranış), ama app_web bunu sağlar.
    require_admin = require_admin or require_event_manager
    
    # Rate limiting decorator helper (limiter varsa uygula)
    def rate_limit(limit_str):
        """Rate limiting decorator helper"""
        def decorator(f):
            if limiter:
                return limiter.limit(limit_str)(f)
            return f
        return decorator

    @bp.get("/archive/download")
    @rate_limit(RateLimitConstants.ARCHIVE_DOWNLOAD_LIMIT)
    @require_login
    @require_event_manager
    def download_archive():
        """
        Tüm verileri bir zip arşiv olarak indirir.
        """
        try:
            data_db_path, config_path, secret_path = _get_resource_paths(datastore)
            if not data_db_path.exists():
                logger.warning(f"Arşiv indirme hatası: Veri dosyası bulunamadı (kullanıcı: {request.remote_addr})")
                return jsonify({"error": "Veri dosyası bulunamadı"}), 404

            archive_bytes = _build_archive_bytes(data_db_path, config_path, secret_path, datastore)
            filename = _build_archive_filename(datastore)
            logger.info(f"Arşiv indirildi: {filename} (kullanıcı: {request.remote_addr})")
            return send_file(
                archive_bytes,
                mimetype="application/zip",
                as_attachment=True,
                download_name=filename,
            )
        except Exception as e:
            logger.error(f"Arşiv indirme hatası: {str(e)} (kullanıcı: {request.remote_addr})", exc_info=True)
            return jsonify({"error": "Arşiv oluşturulurken bir hata oluştu"}), 500

    @bp.post("/archive/upload")
    @rate_limit(RateLimitConstants.ARCHIVE_UPLOAD_LIMIT)
    @require_login
    @require_admin
    def upload_archive():
        """
        Zip arşivini yükler ve mevcut verilerin üzerine yazar.
        
        Rate limiting: Saatte maksimum 10 yükleme (RateLimitConstants.ARCHIVE_UPLOAD_LIMIT)
        """
        if "archive" not in request.files:
            return jsonify({"error": "Arşiv dosyası gerekli"}), 400

        file = request.files["archive"]
        
        # Dosya validasyonu (tip, boyut) - constants modülünden al
        is_valid, error_msg = validate_file_upload(
            file,
            allowed_extensions=FileConstants.ALLOWED_ARCHIVE_EXTENSIONS,
            max_size=FileConstants.MAX_ARCHIVE_SIZE,
            required=True
        )
        
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        try:
            raw_bytes = file.read()
        except Exception as e:
            logger.warning(f"Arşiv yükleme hatası: Dosya okunamadı - {str(e)} (kullanıcı: {request.remote_addr})")
            return jsonify({"error": f"Arşiv dosyası okunamadı: {str(e)}"}), 400

        try:
            with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zip_file:
                data_bytes = _read_zip_member(
                    zip_file, ["data.db", "resources/data.db", "src/resources/data.db"]
                )
                if not _looks_like_sqlite(data_bytes):
                    return jsonify({"error": "data.db geçerli bir SQLite veritabanı değil"}), 400
                # İmza ötesinde içerik doğrulaması: beklenen MEMSKOR tabloları var mı?
                if not _is_valid_memskor_db(data_bytes):
                    logger.warning(f"Arşiv yükleme reddedildi: data.db beklenen şemaya uymuyor (kullanıcı: {request.remote_addr})")
                    return jsonify({"error": "data.db geçerli bir MEMSKOR veritabanı değil (beklenen tablolar yok)"}), 400

                config_bytes = _read_zip_member_optional(
                    zip_file, ["config.json", "resources/config.json", "src/resources/config.json"]
                )
                secret_bytes = _read_zip_member_optional(
                    zip_file, ["secret.key", "resources/secret.key", "src/resources/secret.key"]
                )
        except KeyError:
            logger.warning(f"Arşiv yükleme hatası: data.db bulunamadı (kullanıcı: {request.remote_addr})")
            return jsonify({"error": "Arşiv içinde data.db bulunamadı"}), 400
        except zipfile.BadZipFile:
            logger.warning(f"Arşiv yükleme hatası: Geçersiz zip dosyası (kullanıcı: {request.remote_addr})")
            return jsonify({"error": "Geçersiz zip dosyası"}), 400

        data_db_path, config_path, secret_path = _get_resource_paths(datastore)
        backup_files = _backup_existing_files(data_db_path, config_path, secret_path)

        # Atomik yazım: önce geçici dosyaya yaz, sonra os.replace ile taşı.
        # Herhangi bir adım başarısız olursa daha önce alınan yedeklerden geri yükle.
        writes = [(data_db_path, data_bytes)]
        if config_bytes is not None:
            writes.append((config_path, config_bytes))
        if secret_bytes is not None:
            writes.append((secret_path, secret_bytes))

        try:
            for target_path, payload in writes:
                _atomic_write_bytes(target_path, payload)
            logger.info(f"Arşiv yüklendi: {len(backup_files)} yedek oluşturuldu (kullanıcı: {request.remote_addr})")
        except Exception as e:
            logger.error(f"Arşiv yükleme hatası: Dosya yazılamadı - {str(e)} (kullanıcı: {request.remote_addr})", exc_info=True)
            restored = _restore_from_backups(backup_files, data_db_path)
            msg = "Arşiv içeriği yazılamadı"
            if restored:
                msg += "; önceki veriler yedekten geri yüklendi"
            return jsonify({"error": msg, "restored": restored}), 500

        return jsonify(
            {
                "ok": True,
                "message": "Arşiv yüklendi. Uygulamayı yeniden yükleyin.",
                "backups": backup_files,
                "restart_required": True,
            }
        )


def _get_resource_paths(datastore) -> tuple[Path, Path, Path]:
    base_path = Path(getattr(datastore, "base_path", Path(__file__).resolve().parents[1]))
    resource_dir = base_path / "src" / "resources"
    return (
        resource_dir / "data.db",
        resource_dir / "config.json",
        resource_dir / "secret.key",
    )


def _build_archive_bytes(data_db_path: Path, config_path: Path, secret_path: Path, datastore) -> io.BytesIO:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(data_db_path, arcname="data.db")
        if config_path.exists():
            archive.write(config_path, arcname="config.json")
        if secret_path.exists():
            archive.write(secret_path, arcname="secret.key")

        manifest = {
            "format": "memskor_archive_v1",
            "created_at": datetime.utcnow().isoformat() + "Z",
            "event_name": (datastore.get_event() or {}).get("name", ""),
        }
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    buffer.seek(0)
    return buffer


def _build_archive_filename(datastore) -> str:
    event_name = (datastore.get_event() or {}).get("name", "") or "etkinlik"
    slug = _slugify(event_name) or "etkinlik"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    return f"memskor_{slug}_{timestamp}.zip"


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-").lower()
    return cleaned[:32]


def _read_zip_member(zip_file: zipfile.ZipFile, candidates: list[str]) -> bytes:
    for name in candidates:
        try:
            return zip_file.read(name)
        except KeyError:
            continue
    raise KeyError("member not found")


def _read_zip_member_optional(zip_file: zipfile.ZipFile, candidates: list[str]) -> bytes | None:
    try:
        return _read_zip_member(zip_file, candidates)
    except KeyError:
        return None


def _looks_like_sqlite(data_bytes: bytes) -> bool:
    return data_bytes.startswith(b"SQLite format 3")


# Yüklenen veritabanında bulunması beklenen çekirdek MEMSKOR tabloları.
_REQUIRED_DB_TABLES = {"events", "users", "teams", "match_schedule"}


def _is_valid_memskor_db(data_bytes: bytes) -> bool:
    """
    Yüklenen baytları geçici bir dosyaya yazıp SQLite olarak açar ve
    beklenen MEMSKOR tablolarının var olduğunu doğrular. Sahte/yabancı bir
    SQLite dosyasının (yalnızca imza kontrolünü geçen) reddedilmesini sağlar.
    """
    import sqlite3
    import tempfile
    import os as _os

    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".db")
        with _os.fdopen(fd, "wb") as fh:
            fh.write(data_bytes)
        conn = sqlite3.connect(tmp_path)
        try:
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        finally:
            conn.close()
        table_names = {r[0] for r in rows}
        return _REQUIRED_DB_TABLES.issubset(table_names)
    except Exception:
        return False
    finally:
        if tmp_path:
            try:
                _os.remove(tmp_path)
            except OSError:
                pass


def _atomic_write_bytes(target_path: Path, payload: bytes) -> None:
    """
    Veriyi aynı dizinde geçici bir dosyaya yazıp os.replace ile atomik olarak
    hedefin üzerine taşır. Yazma yarıda kalırsa hedef dosya bozulmaz.
    """
    import os as _os

    target_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target_path.with_suffix(target_path.suffix + ".tmp")
    with open(tmp_path, "wb") as fh:
        fh.write(payload)
        fh.flush()
        _os.fsync(fh.fileno())
    _os.replace(tmp_path, target_path)


def _restore_from_backups(backup_files: list[str], data_db_path: Path) -> bool:
    """
    _backup_existing_files ile alınan yedekleri orijinal konumlarına geri yükler.
    Yedek adları '<stem>_<timestamp><suffix>' biçiminde olup backups/ altındadır.
    """
    resource_dir = data_db_path.parent
    # stem -> hedef dosya eşlemesi
    stem_to_target = {
        "data": resource_dir / "data.db",
        "config": resource_dir / "config.json",
        "secret": resource_dir / "secret.key",
    }
    restored_any = False
    for rel in backup_files:
        try:
            # backup_files öğeleri data_db_path.parent'a göreli (örn. "backups/data_<ts>.db")
            backup_path = data_db_path.parent / rel
            if not backup_path.exists():
                continue
            # '<stem>_<timestamp>' -> stem
            stem_part = backup_path.stem.rsplit("_", 2)[0]
            target = stem_to_target.get(stem_part)
            if target is None:
                continue
            shutil.copy2(backup_path, target)
            restored_any = True
        except Exception:
            continue
    return restored_any


def _backup_existing_files(data_db_path: Path, config_path: Path, secret_path: Path) -> list[str]:
    backup_dir = data_db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backups: list[str] = []

    for source in [data_db_path, config_path, secret_path]:
        if not source.exists():
            continue
        target = backup_dir / f"{source.stem}_{timestamp}{source.suffix}"
        try:
            shutil.copy2(source, target)
            backups.append(str(target.relative_to(data_db_path.parent)))
        except Exception:
            continue
    return backups
