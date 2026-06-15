"""
Kullanıcı Yönetimi Modülü

Bu modül kullanıcı (user) yönetimi için tüm CRUD işlemlerini içerir.
"""

from __future__ import annotations

import re
import secrets
import sqlite3
from typing import Dict, List

from werkzeug.security import check_password_hash, generate_password_hash


def _slugify_code(value: str) -> str:
    """Etkinlik kodunu slug formatına çevirir (4 karakter)."""
    raw = value.strip().lower().replace(" ", "_")
    cleaned = re.sub(r"[^a-z0-9_]+", "", raw)
    return cleaned[:4]


class UsersStorage:
    """
    Kullanıcı yönetimi için storage sınıfı.
    
    Bu sınıf kullanıcılarla ilgili tüm veritabanı işlemlerini yönetir:
    - Kullanıcı oluşturma, silme, güncelleme
    - Kimlik doğrulama (şifre ve token)
    - Varsayılan kullanıcı oluşturma
    """
    
    def ensure_default_admin(self) -> None:
        """
        Varsayılan admin kullanıcısını oluşturur (event_id=NULL).
        
        Admin kullanıcısı tüm etkinlikler için geçerlidir.
        """
        with self._get_connection() as conn:
            # Admin kullanıcısı var mı kontrol et (event_id IS NULL)
            row = conn.execute(
                "SELECT 1 FROM users WHERE username = 'admin' AND event_id IS NULL"
            ).fetchone()
            if row:
                return
            password_hash = generate_password_hash("admin123", method="pbkdf2:sha256")
            conn.execute(
                "INSERT INTO users (username, password_hash, role, event_id) VALUES (?, ?, ?, NULL)",
                ("admin", password_hash, "admin"),
            )
            conn.commit()
    
    def list_users(self, include_password: bool = False, event_id: int | None = None) -> List[Dict[str, str]]:
        """
        Kullanıcıları listeler (etkinlik bazlı).
        
        Args:
            include_password: True ise şifreleri de dahil eder (dikkatli kullanın!)
            event_id: Belirli bir etkinlik için kullanıcıları listele. None ise aktif etkinlik kullanılır.
                     Admin kullanıcıları (event_id=NULL) her zaman dahil edilir.
            
        Returns:
            List[Dict]: Kullanıcı listesi
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        
        with self._get_connection() as conn:
            if include_password:
                if event_id is not None:
                    rows = conn.execute(
                        """SELECT username, role, login_token, password_plain 
                           FROM users 
                           WHERE event_id IS NULL OR event_id = ?
                           ORDER BY username""",
                        (event_id,)
                    ).fetchall()
                else:
                    rows = conn.execute(
                        """SELECT username, role, login_token, password_plain 
                           FROM users 
                           WHERE event_id IS NULL
                           ORDER BY username"""
                    ).fetchall()
            else:
                if event_id is not None:
                    rows = conn.execute(
                        """SELECT username, role, login_token 
                           FROM users 
                           WHERE event_id IS NULL OR event_id = ?
                           ORDER BY username""",
                        (event_id,)
                    ).fetchall()
                else:
                    rows = conn.execute(
                        """SELECT username, role, login_token 
                           FROM users 
                           WHERE event_id IS NULL
                           ORDER BY username"""
                    ).fetchall()
            if include_password:
                rows = [
                    (
                        row[0],
                        row[1],
                        row[2] or self._ensure_user_token(conn, row[0], event_id),
                        row[3],
                    )
                    for row in rows
                ]
            else:
                rows = [
                    (
                        row[0],
                        row[1],
                        row[2] or self._ensure_user_token(conn, row[0], event_id),
                    )
                    for row in rows
                ]
        if include_password:
            return [
                {
                    "username": row[0],
                    "role": row[1],
                    "login_token": row[2],
                    "password": row[3],
                }
                for row in rows
            ]
        return [{"username": row[0], "role": row[1], "login_token": row[2]} for row in rows]
    
    def create_user(self, username: str, password: str, role: str = "admin", event_id: int | None = None) -> str:
        """Yeni kullanıcı oluşturur (etkinlik bazlı)."""
        if event_id is None and username.lower() != "admin":
            event_id = self.get_active_event_id()
            if event_id is None:
                raise ValueError("Aktif etkinlik yok. Kullanıcılar etkinlik bazlı oluşturulmalıdır.")
        
        password_hash = generate_password_hash(password, method="pbkdf2:sha256")
        token = secrets.token_urlsafe(24)
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO users (username, password_hash, role, login_token, password_plain, event_id) VALUES (?, ?, ?, ?, ?, ?)",
                (username, password_hash, role, token, password, event_id),
            )
            conn.commit()
        return token

    def cleanup_global_users(self) -> int:
        """
        Etkinlik seçili değilken admin dışındaki global kullanıcıları temizler.
        
        Returns:
            int: Silinen kullanıcı sayısı
        """
        with self._get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM users WHERE event_id IS NULL AND LOWER(username) != 'admin'"
            )
            conn.commit()
            return cursor.rowcount

    def cleanup_orphan_event_users(self) -> int:
        """
        Etkinliği olmayan (orphan) kullanıcıları temizler.
        
        Returns:
            int: Silinen kullanıcı sayısı
        """
        with self._get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM users WHERE event_id IS NOT NULL AND event_id NOT IN (SELECT id FROM events)"
            )
            conn.commit()
            return cursor.rowcount
    
    def update_user_password(self, username: str, password: str, event_id: int | None = None) -> str:
        """Kullanıcı şifresini günceller (etkinlik bazlı)."""
        if event_id is None:
            event_id = self.get_active_event_id()
        
        password_hash = generate_password_hash(password, method="pbkdf2:sha256")
        token = secrets.token_urlsafe(24)
        with self._get_connection() as conn:
            if event_id is not None:
                conn.execute(
                    "UPDATE users SET password_hash = ?, password_plain = ?, login_token = ? WHERE username = ? AND event_id = ?",
                    (password_hash, password, token, username, event_id),
                )
            else:
                conn.execute(
                    "UPDATE users SET password_hash = ?, password_plain = ?, login_token = ? WHERE username = ? AND event_id IS NULL",
                    (password_hash, password, token, username),
                )
            conn.commit()
        return token
    
    def _ensure_user_token(self, conn: sqlite3.Connection, username: str, event_id: int | None = None) -> str:
        """Kullanıcı için login token oluşturur veya günceller."""
        token = secrets.token_urlsafe(24)
        if event_id is None:
            conn.execute(
                "UPDATE users SET login_token = ? WHERE username = ? AND event_id IS NULL",
                (token, username),
            )
        else:
            conn.execute(
                "UPDATE users SET login_token = ? WHERE username = ? AND event_id = ?",
                (token, username, event_id),
            )
        conn.commit()
        return token
    
    def authenticate_user(self, username: str, password: str, event_id: int | None = None) -> bool:
        """Kullanıcı kimlik doğrulaması yapar (etkinlik bazlı)."""
        if event_id is None:
            event_id = self.get_active_event_id()
        
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT password_hash FROM users WHERE username = ? AND event_id IS NULL",
                (username,),
            ).fetchone()
            if row:
                return check_password_hash(row[0], password)
            
            if event_id is not None:
                row = conn.execute(
                    "SELECT password_hash FROM users WHERE username = ? AND event_id = ?",
                    (username, event_id),
                ).fetchone()
                if row:
                    return check_password_hash(row[0], password)
        
        return False
    
    def authenticate_token(self, token: str) -> str | None:
        """Token ile kullanıcı kimlik doğrulaması yapar."""
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT username FROM users WHERE login_token = ?",
                (token,),
            ).fetchone()
        return row[0] if row else None
    
    def get_user_role(self, username: str) -> str | None:
        """Kullanıcının rolünü getirir."""
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT role FROM users WHERE username = ? AND event_id IS NULL",
                (username,),
            ).fetchone()
            if row:
                return row[0]
            
            row = conn.execute(
                "SELECT role FROM users WHERE username = ? AND event_id = ?",
                (username, self.get_active_event_id()),
            ).fetchone()
            if row:
                return row[0]
        
        return None
    
    def get_user_event_id(self, username: str) -> int | None:
        """
        Kullanıcının bağlı olduğu etkinlik ID'sini getirir.

        UNIQUE(username, event_id) olduğundan aynı kullanıcı adı birden çok
        etkinlikte bulunabilir. Bu yüzden çözümleme deterministik ve aktif
        etkinlik bağlamıyla tutarlı olmalı (get_user_role ile aynı öncelik):
          1) Aktif etkinlikteki kayıt
          2) Global (event_id IS NULL) kayıt — örn. admin
          3) Son çare: en küçük event_id (rastgele satır yerine deterministik)
        """
        active_event_id = self.get_active_event_id()
        with self._get_connection() as conn:
            if active_event_id is not None:
                row = conn.execute(
                    "SELECT event_id FROM users WHERE username = ? AND event_id = ?",
                    (username, active_event_id),
                ).fetchone()
                if row:
                    return row[0]
            row = conn.execute(
                "SELECT event_id FROM users WHERE username = ? AND event_id IS NULL",
                (username,),
            ).fetchone()
            if row:
                return None  # global kullanıcı (etkinliğe bağlı değil)
            row = conn.execute(
                "SELECT event_id FROM users WHERE username = ? ORDER BY event_id",
                (username,),
            ).fetchone()
            if row:
                return row[0] if row[0] is not None else None
        return None
    
    def delete_user(self, username: str, event_id: int | None = None) -> None:
        """Kullanıcı siler (etkinlik bazlı)."""
        if username.lower() == "admin":
            raise ValueError("Admin kullanıcısı silinemez")
        
        if event_id is None:
            event_id = self.get_active_event_id()
        
        with self._get_connection() as conn:
            if event_id is not None:
                conn.execute(
                    "DELETE FROM users WHERE username = ? AND event_id = ?",
                    (username, event_id)
                )
            conn.commit()
    
    def delete_all_users(self, keep_admin: bool = False, event_id: int | None = None) -> None:
        """Tüm kullanıcıları siler (etkinlik bazlı)."""
        if event_id is None:
            event_id = self.get_active_event_id()
        
        if event_id is None:
            return
        
        with self._get_connection() as conn:
            conn.execute(
                "DELETE FROM users WHERE event_id = ?",
                (event_id,)
            )
            conn.commit()
    
    def create_default_role_users(self, event_id: int | None = None) -> List[Dict[str, str]]:
        """Varsayılan rol kullanıcılarını oluşturur (etkinlik bazlı)."""
        if event_id is None:
            event_id = self.get_active_event_id()
        
        if event_id is None:
            raise ValueError("Aktif etkinlik bulunamadı")
        
        event_code = self.get_event().get("code", "")
        prefix = _slugify_code(event_code) or "event"
        roles = [
            "etkinlik_yoneticisi",
            "saha_yoneticisi_1",
            "saha_yoneticisi_2",
            "saha_yoneticisi_3",
            "bas_hakem",
            "hakem_1",
            "hakem_2",
            "hakem_3",
            "hakem_4",
            "bas_mufettis",
            "mufettis_1",
            "mufettis_2",
            "mufettis_3",
            "mufettis_4",
            "mufettis_5",
            "juri_danismani",
            "juri_1",
            "juri_2",
            "juri_3",
            "juri_4",
            "juri_5",
            "seremoni_1",
            "seremoni_2",
            "seremoni_3",
            "pit_yoneticisi",
        ]
        created: List[Dict[str, str]] = []
        with self._get_connection() as conn:
            existing = {
                row[0]
                for row in conn.execute(
                    "SELECT username FROM users WHERE event_id = ?",
                    (event_id,)
                ).fetchall()
            }
        for role in roles:
            username = f"{prefix}_{role}"
            password = secrets.token_urlsafe(8)
            if username in existing:
                token = self.update_user_password(username, password, event_id)
            else:
                token = self.create_user(username, password, username, event_id)
            created.append(
                {"username": username, "role": username, "password": password, "token": token}
            )
        return created
