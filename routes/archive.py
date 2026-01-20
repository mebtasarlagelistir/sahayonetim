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


def register_archive_routes(bp: Blueprint, datastore, require_login, require_event_manager, limiter=None) -> None:
    """
    Arşiv yönetimi route'larını Blueprint'e kaydeder.

    Args:
        bp: Blueprint instance
        datastore: DataStore instance
        require_login: require_login decorator
        require_event_manager: require_event_manager decorator
        limiter: Flask-Limiter instance (opsiyonel, rate limiting için)
    """
    
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
    @require_event_manager
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

        try:
            data_db_path.write_bytes(data_bytes)
            if config_bytes is not None:
                config_path.write_bytes(config_bytes)
            if secret_bytes is not None:
                secret_path.write_bytes(secret_bytes)
            logger.info(f"Arşiv yüklendi: {len(backup_files)} yedek oluşturuldu (kullanıcı: {request.remote_addr})")
        except Exception as e:
            logger.error(f"Arşiv yükleme hatası: Dosya yazılamadı - {str(e)} (kullanıcı: {request.remote_addr})", exc_info=True)
            return jsonify({"error": "Arşiv içeriği yazılamadı"}), 500

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
