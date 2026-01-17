"""
Veritabanı Yönetim Modülü

Bu modül SQLite veritabanı üzerinde tüm CRUD (Create, Read, Update, Delete)
işlemlerini yönetir. Veritabanı şeması, migrasyonlar ve veri işlemleri
burada tanımlanır.

Sınıf: DataStore
    - Veritabanı bağlantısı ve şema yönetimi
    - Etkinlik yönetimi (events tablosu)
    - Takım yönetimi (teams tablosu)
    - Kullanıcı yönetimi (users tablosu)
    - Veri migrasyon işlemleri

Veritabanı Yapısı:
    events: Etkinlik bilgileri (id, name, data, active)
    teams: Takım bilgileri (event_id, number, name, school, city, category)
    users: Kullanıcı bilgileri (id, username, password_hash, role, login_token)

Not: Bu modül bağımsız çalışabilmeli, diğer modüllere bağımlılığı minimal olmalı.
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import Any, Dict, List
import secrets

from .event_setup import default_config_dict
from werkzeug.security import check_password_hash, generate_password_hash


class DataStore:
    """
    Veritabanı işlemlerini yöneten ana sınıf.
    
    Bu sınıf SQLite veritabanı üzerinde tüm veri işlemlerini gerçekleştirir.
    Singleton pattern kullanılmaz, her instance kendi bağlantısını yönetir.
    
    Özellikler:
        - Otomatik veritabanı şeması oluşturma
        - Veri migrasyon desteği
        - Güvenli şifre saklama (hash)
        - QR kod token yönetimi
        
    Kullanım:
        datastore = DataStore(base_path=Path("/path/to/project"))
        events = datastore.get_events()
        datastore.create_event("Yeni Etkinlik")
    """
    def __init__(self, base_path: Path | None = None) -> None:
        """
        DataStore'u başlatır.
        
        Args:
            base_path: Proje kök dizini. None ise otomatik tespit edilir.
            
        İşlemler:
            1. Veritabanı dosya yolu belirlenir
            2. Veritabanı şeması oluşturulur (yoksa)
            3. Eski şema migrasyonu yapılır
            4. Varsayılan admin kullanıcısı oluşturulur (yoksa)
        """
        self.base_path = base_path or Path(__file__).resolve().parents[2]
        self.db_path = self.base_path / "src" / "resources" / "data.db"
        self._init_db()
        self._migrate_legacy_schema()
        self._ensure_user_event_column()
        self.ensure_default_admin()

    def _init_db(self) -> None:
        """
        Veritabanı şemasını oluşturur.
        
        Tablolar:
            - events: Etkinlik bilgileri
            - teams: Takım bilgileri (event_id ile bağlı, CASCADE delete)
            - users: Kullanıcı bilgileri
            
        Not: Bu metod sadece tabloları oluşturur, veri eklemez.
        """
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    data TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS teams (
                    event_id INTEGER NOT NULL,
                    number TEXT,
                    name TEXT,
                    school TEXT,
                    city TEXT,
                    category TEXT,
                    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'admin',
                    login_token TEXT UNIQUE,
                    password_plain TEXT,
                    event_id INTEGER,
                    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
                    UNIQUE(username, event_id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS inspection_slots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id INTEGER NOT NULL,
                    team_number TEXT NOT NULL,
                    inspection_type TEXT NOT NULL,
                    slot_date TEXT NOT NULL,
                    slot_time TEXT NOT NULL,
                    duration_minutes INTEGER DEFAULT 15,
                    inspector_name TEXT,
                    status TEXT DEFAULT 'scheduled',
                    notes TEXT,
                    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS practice_matches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id INTEGER NOT NULL,
                    match_number TEXT,
                    field_number INTEGER DEFAULT 1,
                    match_date TEXT NOT NULL,
                    match_time TEXT NOT NULL,
                    red_alliance TEXT NOT NULL,
                    blue_alliance TEXT NOT NULL,
                    status TEXT DEFAULT 'scheduled',
                    red_score INTEGER,
                    blue_score INTEGER,
                    notes TEXT,
                    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
                )
                """
            )
            conn.commit()
        # Migration'ları çalıştır (event_id kolonu eklenmeli)
        self._ensure_user_token_column()
        self._ensure_user_event_column()
        # Admin kullanıcısını oluştur
        self.ensure_default_admin()

    def get_event(self) -> Dict[str, Any]:
        defaults = default_config_dict()["event"]
        event_id = self.get_active_event_id()
        if event_id is None:
            return defaults
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT data FROM events WHERE id = ?",
                (event_id,),
            ).fetchone()
            if not row:
                return defaults
            try:
                data = json.loads(row[0])
            except json.JSONDecodeError:
                return defaults
        return _merge_defaults(data, defaults)

    def save_event(self, data: Dict[str, Any]) -> None:
        """
        Aktif etkinliğin bilgilerini kaydeder.
        
        Args:
            data: Etkinlik verisi (dict)
            
        Not:
            - Aktif etkinlik yoksa yeni etkinlik oluşturulur
            - Veri JSON formatında saklanır
            - Etkinlik adı ayrı bir kolonda da saklanır (hızlı erişim için)
        """
        event_id = self.get_active_event_id()
        if event_id is None:
            event_id = self.create_event(data.get("name", "") or "Yeni Etkinlik", data)
            return
        payload = json.dumps(data, ensure_ascii=False)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "UPDATE events SET data = ?, name = ? WHERE id = ?",
                (payload, data.get("name", ""), event_id),
            )
            conn.commit()

    # ============================================================================
    # TAKIM YÖNETİMİ METODLARI
    # ============================================================================
    
    def get_teams(self) -> List[Dict[str, str]]:
        """
        Aktif etkinliğin takımlarını getirir.
        
        Returns:
            List[Dict]: Takım listesi
            [
                {
                    "number": "2025",
                    "name": "Takım Adı",
                    "school": "Okul Adı",
                    "city": "Şehir",
                    "category": "Kategori"
                },
                ...
            ]
            
        Not: Aktif etkinlik yoksa boş liste döner.
        """
        event_id = self.get_active_event_id()
        if event_id is None:
            return []
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT number, name, school, city, category FROM teams WHERE event_id = ?",
                (event_id,),
            ).fetchall()
        return [
            {
                "number": row[0] or "",
                "name": row[1] or "",
                "school": row[2] or "",
                "city": row[3] or "",
                "category": row[4] or "",
            }
            for row in rows
        ]

    def save_teams(self, teams: List[Dict[str, str]]) -> None:
        """
        Aktif etkinliğin takımlarını kaydeder.
        
        Args:
            teams: Takım listesi
            
        Not:
            - Önce mevcut takımlar silinir, sonra yenileri eklenir
            - Boş takımlar (tüm alanlar boş) kaydedilmez
            - Aktif etkinlik yoksa yeni etkinlik oluşturulur
        """
        event_id = self.get_active_event_id()
        if event_id is None:
            event_id = self.create_event("Yeni Etkinlik")
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM teams WHERE event_id = ?", (event_id,))
            # Boş takımları filtrele
            valid_teams = [
                (
                    event_id,
                    team.get("number", ""),
                    team.get("name", ""),
                    team.get("school", ""),
                    team.get("city", ""),
                    team.get("category", ""),
                )
                for team in teams
                if team.get("number") or team.get("name")  # En azından numara veya isim olmalı
            ]
            if valid_teams:
                conn.executemany(
                    "INSERT INTO teams (event_id, number, name, school, city, category) VALUES (?, ?, ?, ?, ?, ?)",
                    valid_teams,
                )
            conn.commit()

    def is_empty(self) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            event_row = conn.execute("SELECT 1 FROM events LIMIT 1").fetchone()
            team_row = conn.execute("SELECT 1 FROM teams LIMIT 1").fetchone()
        return not event_row and not team_row

    def migrate_from_config(self, config_data: Dict[str, Any]) -> None:
        if not self.is_empty():
            return
        event = config_data.get("event")
        teams = config_data.get("teams")
        if isinstance(event, dict):
            event_id = self.create_event(event.get("name", "") or "Yeni Etkinlik", event)
            if isinstance(teams, list):
                self.save_teams(teams)
        if isinstance(teams, list):
            self.save_teams(teams)

    def get_events(self) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute("SELECT id, name, active FROM events ORDER BY id").fetchall()
        return [
            {"id": row[0], "name": row[1], "active": bool(row[2])} for row in rows
        ]

    def get_event_id_by_name(self, name: str) -> int | None:
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT id FROM events WHERE name = ?",
                (name,),
            ).fetchone()
        return int(row[0]) if row else None

    def get_team_count_for_event(self, event_id: int) -> int:
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM teams WHERE event_id = ?",
                (event_id,),
            ).fetchone()
        return int(row[0]) if row else 0

    def get_active_event_id(self) -> int | None:
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute("SELECT id FROM events WHERE active = 1").fetchone()
        return int(row[0]) if row else None

    def set_active_event(self, event_id: int) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("UPDATE events SET active = 0")
            conn.execute("UPDATE events SET active = 1 WHERE id = ?", (event_id,))
            conn.commit()

    def create_event(self, name: str, data: Dict[str, Any] | None = None) -> int:
        base = default_config_dict()["event"]
        data = _merge_defaults(data or {}, base)
        data["name"] = name
        payload = json.dumps(data, ensure_ascii=False)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO events (name, data, active) VALUES (?, ?, 0)",
                (name, payload),
            )
            event_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            if self.get_active_event_id() is None:
                conn.execute("UPDATE events SET active = 1 WHERE id = ?", (event_id,))
            conn.commit()
        return int(event_id)

    def delete_event(self, event_id: int) -> None:
        with sqlite3.connect(self.db_path) as conn:
            # Check if event exists
            row = conn.execute("SELECT id FROM events WHERE id = ?", (event_id,)).fetchone()
            if not row:
                raise ValueError("Etkinlik bulunamadı")
            
            # Delete event (teams will be deleted automatically due to CASCADE)
            conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
            
            # If deleted event was active, set another event as active
            active_id = self.get_active_event_id()
            if active_id is None:
                first_event = conn.execute("SELECT id FROM events ORDER BY id LIMIT 1").fetchone()
                if first_event:
                    conn.execute("UPDATE events SET active = 1 WHERE id = ?", (first_event[0],))
            
            conn.commit()

    def save_teams_for_event(self, event_id: int, teams: List[Dict[str, str]]) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM teams WHERE event_id = ?", (event_id,))
            conn.executemany(
                "INSERT INTO teams (event_id, number, name, school, city, category) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    (
                        event_id,
                        team.get("number", ""),
                        team.get("name", ""),
                        team.get("school", ""),
                        team.get("city", ""),
                        team.get("category", ""),
                    )
                    for team in teams
                ],
            )
            conn.commit()

    def _migrate_legacy_schema(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            tables = {
                row[0]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            }
            if "event" in tables:
                row = conn.execute("SELECT data FROM event WHERE id = 1").fetchone()
                data = {}
                if row:
                    try:
                        data = json.loads(row[0])
                    except json.JSONDecodeError:
                        data = {}
                name = data.get("name", "") or "Yeni Etkinlik"
                payload = json.dumps(_merge_defaults(data, default_config_dict()["event"]), ensure_ascii=False)
                conn.execute(
                    "INSERT INTO events (name, data, active) VALUES (?, ?, 1)",
                    (name, payload),
                )
                conn.execute("DROP TABLE event")
            if "teams" in tables:
                columns = [
                    row[1]
                    for row in conn.execute("PRAGMA table_info(teams)").fetchall()
                ]
                if "event_id" not in columns:
                    conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS teams_v2 (
                            event_id INTEGER NOT NULL,
                            number TEXT,
                            name TEXT,
                            school TEXT,
                            city TEXT,
                            category TEXT,
                            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
                        )
                        """
                    )
                    event_id = self.get_active_event_id() or 1
                    conn.execute(
                        """
                        INSERT INTO teams_v2 (event_id, number, name, school, city, category)
                        SELECT ?, number, name, school, city, category FROM teams
                        """,
                        (event_id,),
                    )
                    conn.execute("DROP TABLE teams")
                    conn.execute("ALTER TABLE teams_v2 RENAME TO teams")
            conn.commit()
        self._ensure_user_token_column()
        self._ensure_user_event_column()

    def _ensure_user_token_column(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            columns = [
                row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()
            ]
            if "login_token" not in columns:
                conn.execute("ALTER TABLE users ADD COLUMN login_token TEXT")
                conn.commit()
            if "password_plain" not in columns:
                conn.execute("ALTER TABLE users ADD COLUMN password_plain TEXT")
                conn.commit()
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_token ON users(login_token)"
            )
            conn.commit()
    
    def _ensure_user_event_column(self) -> None:
        """
        users tablosuna event_id kolonu ekler (migration).
        
        Mevcut kullanıcılar için event_id NULL kalır (admin ve eski kullanıcılar).
        Yeni kullanıcılar aktif etkinlik ID'si ile oluşturulur.
        """
        with sqlite3.connect(self.db_path) as conn:
            columns = [
                row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()
            ]
            if "event_id" not in columns:
                # event_id kolonu ekle
                conn.execute("ALTER TABLE users ADD COLUMN event_id INTEGER")
                # Foreign key constraint ekle (SQLite'de ALTER TABLE ile foreign key eklenemez,
                # bu yüzden yeni tablo oluşturup veriyi taşıyoruz)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS users_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL,
                        password_hash TEXT NOT NULL,
                        role TEXT NOT NULL DEFAULT 'admin',
                        login_token TEXT UNIQUE,
                        password_plain TEXT,
                        event_id INTEGER,
                        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
                        UNIQUE(username, event_id)
                    )
                """)
                # Mevcut verileri kopyala
                conn.execute("""
                    INSERT INTO users_new (id, username, password_hash, role, login_token, password_plain, event_id)
                    SELECT id, username, password_hash, role, login_token, password_plain, NULL FROM users
                """)
                # Eski tabloyu sil ve yenisini yeniden adlandır
                conn.execute("DROP TABLE users")
                conn.execute("ALTER TABLE users_new RENAME TO users")
                # Index'leri yeniden oluştur
                conn.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_token ON users(login_token)"
                )
                conn.commit()

    def ensure_default_admin(self) -> None:
        """
        Varsayılan admin kullanıcısını oluşturur (event_id=NULL).
        
        Admin kullanıcısı tüm etkinlikler için geçerlidir.
        """
        with sqlite3.connect(self.db_path) as conn:
            # Admin kullanıcısı var mı kontrol et (event_id IS NULL)
            row = conn.execute(
                "SELECT 1 FROM users WHERE username = 'admin' AND event_id IS NULL"
            ).fetchone()
            if row:
                return
            password_hash = generate_password_hash("admin123")
            conn.execute(
                "INSERT INTO users (username, password_hash, role, event_id) VALUES (?, ?, ?, NULL)",
                ("admin", password_hash, "admin"),
            )
            conn.commit()

    # ============================================================================
    # KULLANICI YÖNETİMİ METODLARI
    # ============================================================================
    
    def list_users(self, include_password: bool = False, event_id: int | None = None) -> List[Dict[str, str]]:
        """
        Kullanıcıları listeler (etkinlik bazlı).
        
        Args:
            include_password: True ise şifreleri de dahil eder (dikkatli kullanın!)
            event_id: Belirli bir etkinlik için kullanıcıları listele. None ise aktif etkinlik kullanılır.
                     Admin kullanıcıları (event_id=NULL) her zaman dahil edilir.
            
        Returns:
            List[Dict]: Kullanıcı listesi
            [
                {
                    "username": "admin",
                    "role": "admin",
                    "login_token": "...",
                    "password": "..." (sadece include_password=True ise)
                },
                ...
            ]
            
        Not: 
            - Şifreler düz metin olarak saklanır (password_plain kolonu).
            - Admin kullanıcıları (event_id=NULL) tüm etkinlikler için görünür.
            - Etkinlik bazlı kullanıcılar sadece kendi etkinliklerinde görünür.
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        
        with sqlite3.connect(self.db_path) as conn:
            if include_password:
                # Admin kullanıcıları (event_id IS NULL) + aktif etkinlik kullanıcıları
                if event_id is not None:
                    rows = conn.execute(
                        """SELECT username, role, login_token, password_plain 
                           FROM users 
                           WHERE event_id IS NULL OR event_id = ?
                           ORDER BY username""",
                        (event_id,)
                    ).fetchall()
                else:
                    # Aktif etkinlik yoksa sadece admin kullanıcıları
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
        """
        Yeni kullanıcı oluşturur (etkinlik bazlı).
        
        Args:
            username: Kullanıcı adı (etkinlik bazlı benzersiz olmalı)
            password: Şifre (hash'lenerek saklanır)
            role: Kullanıcı rolü (varsayılan: "admin")
            event_id: Etkinlik ID'si. None ise aktif etkinlik kullanılır.
                     Admin kullanıcıları için None olmalı.
            
        Returns:
            str: Login token (QR kod için kullanılır)
            
        Raises:
            sqlite3.IntegrityError: Kullanıcı adı aynı etkinlikte zaten varsa
            
        Not:
            - Şifre hem hash'lenir (güvenlik) hem de düz metin saklanır (gösterim)
            - Her kullanıcı için benzersiz login token oluşturulur
            - Admin kullanıcıları için event_id=None kullanılır
        """
        if event_id is None and username.lower() != "admin":
            event_id = self.get_active_event_id()
        
        password_hash = generate_password_hash(password)
        token = secrets.token_urlsafe(24)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO users (username, password_hash, role, login_token, password_plain, event_id) VALUES (?, ?, ?, ?, ?, ?)",
                (username, password_hash, role, token, password, event_id),
            )
            conn.commit()
        return token

    def update_user_password(self, username: str, password: str, event_id: int | None = None) -> str:
        """
        Kullanıcı şifresini günceller (etkinlik bazlı).
        
        Args:
            username: Kullanıcı adı
            password: Yeni şifre
            event_id: Etkinlik ID'si. None ise aktif etkinlik kullanılır.
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        
        password_hash = generate_password_hash(password)
        token = secrets.token_urlsafe(24)
        with sqlite3.connect(self.db_path) as conn:
            if event_id is not None:
                conn.execute(
                    "UPDATE users SET password_hash = ?, password_plain = ?, login_token = ? WHERE username = ? AND event_id = ?",
                    (password_hash, password, token, username, event_id),
                )
            else:
                # Admin kullanıcısı için
                conn.execute(
                    "UPDATE users SET password_hash = ?, password_plain = ?, login_token = ? WHERE username = ? AND event_id IS NULL",
                    (password_hash, password, token, username),
                )
            conn.commit()
        return token

    def _ensure_user_token(self, conn: sqlite3.Connection, username: str, event_id: int | None = None) -> str:
        """
        Kullanıcı için login token oluşturur veya günceller.
        
        Args:
            conn: Veritabanı bağlantısı
            username: Kullanıcı adı
            event_id: Etkinlik ID'si (admin için None)
        """
        token = secrets.token_urlsafe(24)
        if event_id is None:
            # Admin kullanıcısı için
            conn.execute(
                "UPDATE users SET login_token = ? WHERE username = ? AND event_id IS NULL",
                (token, username),
            )
        else:
            # Etkinlik bazlı kullanıcı için
            conn.execute(
                "UPDATE users SET login_token = ? WHERE username = ? AND event_id = ?",
                (token, username, event_id),
            )
        conn.commit()
        return token

    def authenticate_user(self, username: str, password: str, event_id: int | None = None) -> bool:
        """
        Kullanıcı kimlik doğrulaması yapar (etkinlik bazlı).
        
        Args:
            username: Kullanıcı adı
            password: Şifre (düz metin)
            event_id: Etkinlik ID'si. None ise aktif etkinlik kullanılır.
                     Admin kullanıcıları (event_id=NULL) tüm etkinlikler için geçerlidir.
            
        Returns:
            bool: Kimlik doğrulama başarılı ise True
            
        Not: 
            - Şifre hash ile karşılaştırılır, düz metin saklanmaz.
            - Admin kullanıcıları tüm etkinlikler için geçerlidir.
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        
        with sqlite3.connect(self.db_path) as conn:
            # Önce admin kullanıcısını kontrol et (event_id IS NULL)
            row = conn.execute(
                "SELECT password_hash FROM users WHERE username = ? AND event_id IS NULL",
                (username,),
            ).fetchone()
            if row:
                return check_password_hash(row[0], password)
            
            # Sonra etkinlik bazlı kullanıcıyı kontrol et
            if event_id is not None:
                row = conn.execute(
                    "SELECT password_hash FROM users WHERE username = ? AND event_id = ?",
                    (username, event_id),
                ).fetchone()
                if row:
                    return check_password_hash(row[0], password)
        
        return False

    def authenticate_token(self, token: str) -> str | None:
        """
        Token ile kullanıcı kimlik doğrulaması yapar.
        
        Args:
            token: Login token (QR kod içinde)
            
        Returns:
            str | None: Kullanıcı adı veya None
            
        Not: Token benzersiz olduğu için etkinlik kontrolü gerekmez.
        """
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT username FROM users WHERE login_token = ?",
                (token,),
            ).fetchone()
        return row[0] if row else None
    
    def get_user_role(self, username: str) -> str | None:
        """
        Kullanıcının rolünü getirir.
        
        Args:
            username: Kullanıcı adı
            
        Returns:
            str | None: Kullanıcı rolü (örn: "admin", "etkinlik_yoneticisi") veya None
            
        Not: Admin kullanıcıları (event_id=NULL) öncelikli olarak kontrol edilir.
        """
        with sqlite3.connect(self.db_path) as conn:
            # Önce admin kullanıcısını kontrol et (event_id IS NULL)
            row = conn.execute(
                "SELECT role FROM users WHERE username = ? AND event_id IS NULL",
                (username,),
            ).fetchone()
            if row:
                return row[0]
            
            # Sonra etkinlik bazlı kullanıcıyı kontrol et
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
        
        Args:
            username: Kullanıcı adı
            
        Returns:
            int | None: Etkinlik ID'si veya None (admin için)
        """
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT event_id FROM users WHERE username = ?",
                (username,),
            ).fetchone()
            if row:
                return row[0] if row[0] is not None else None
        return None

    def delete_user(self, username: str, event_id: int | None = None) -> None:
        """
        Kullanıcı siler (etkinlik bazlı).
        
        Args:
            username: Kullanıcı adı
            event_id: Etkinlik ID'si. None ise aktif etkinlik kullanılır.
                     Admin kullanıcıları (event_id=NULL) silinemez.
        
        Not: Admin kullanıcıları (event_id=NULL) silinemez.
        """
        if username.lower() == "admin":
            raise ValueError("Admin kullanıcısı silinemez")
        
        if event_id is None:
            event_id = self.get_active_event_id()
        
        with sqlite3.connect(self.db_path) as conn:
            if event_id is not None:
                conn.execute(
                    "DELETE FROM users WHERE username = ? AND event_id = ?",
                    (username, event_id)
                )
            else:
                # Aktif etkinlik yoksa hiçbir şey silme
                return
            conn.commit()

    def delete_all_users(self, keep_admin: bool = False, event_id: int | None = None) -> None:
        """
        Tüm kullanıcıları siler (etkinlik bazlı).
        
        Args:
            keep_admin: True ise admin kullanıcısını korur
            event_id: Etkinlik ID'si. None ise aktif etkinlik kullanılır.
                     Sadece bu etkinliğe ait kullanıcılar silinir.
        
        Not: Admin kullanıcıları (event_id=NULL) her zaman korunur.
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        
        if event_id is None:
            # Aktif etkinlik yoksa hiçbir şey silme
            return
        
        with sqlite3.connect(self.db_path) as conn:
            # Sadece belirtilen etkinliğe ait kullanıcıları sil
            # Admin kullanıcıları (event_id IS NULL) zaten korunur
            conn.execute(
                "DELETE FROM users WHERE event_id = ?",
                (event_id,)
            )
            conn.commit()

    def create_default_role_users(self, event_id: int | None = None) -> List[Dict[str, str]]:
        """
        Varsayılan rol kullanıcılarını oluşturur (etkinlik bazlı).
        
        Args:
            event_id: Etkinlik ID'si. None ise aktif etkinlik kullanılır.
        
        Returns:
            List[Dict]: Oluşturulan kullanıcı listesi
        """
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
            "seremoni_1",
            "seremoni_2",
            "seremoni_3",
        ]
        created: List[Dict[str, str]] = []
        with sqlite3.connect(self.db_path) as conn:
            # Sadece bu etkinliğe ait kullanıcıları kontrol et
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

    # ============================================================================
    # İNCELEME SLOTLARI YÖNETİMİ
    # ============================================================================

    def get_inspection_slots(
        self,
        event_id: int | None = None,
        team_number: str | None = None,
        inspection_type: str | None = None,
        slot_date: str | None = None,
        status: str | None = None,
    ) -> List[Dict[str, Any]]:
        """
        İnceleme slotlarını getirir.
        
        Args:
            event_id: Etkinlik ID'si (None ise aktif etkinlik)
            team_number: Takım numarası (filtreleme)
            inspection_type: İnceleme tipi (filtreleme)
            slot_date: Tarih (YYYY-MM-DD formatında, filtreleme)
            status: Durum (filtreleme)
            
        Returns:
            List[Dict]: İnceleme slotları listesi
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return []
        
        query = "SELECT id, team_number, inspection_type, slot_date, slot_time, duration_minutes, inspector_name, status, notes FROM inspection_slots WHERE event_id = ?"
        params = [event_id]
        
        if team_number:
            query += " AND team_number = ?"
            params.append(team_number)
        if inspection_type:
            query += " AND inspection_type = ?"
            params.append(inspection_type)
        if slot_date:
            query += " AND slot_date = ?"
            params.append(slot_date)
        if status:
            query += " AND status = ?"
            params.append(status)
        
        query += " ORDER BY slot_date, slot_time"
        
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(query, params).fetchall()
        
        return [
            {
                "id": row[0],
                "team_number": row[1],
                "inspection_type": row[2],
                "slot_date": row[3],
                "slot_time": row[4],
                "duration_minutes": row[5],
                "inspector_name": row[6] or "",
                "status": row[7],
                "notes": row[8] or "",
            }
            for row in rows
        ]

    def create_inspection_slot(
        self,
        team_number: str,
        inspection_type: str,
        slot_date: str,
        slot_time: str,
        duration_minutes: int = 15,
        inspector_name: str = "",
        status: str = "scheduled",
        notes: str = "",
        event_id: int | None = None,
    ) -> int:
        """
        Yeni inceleme slotu oluşturur.
        
        Args:
            team_number: Takım numarası
            inspection_type: İnceleme tipi (hardware, size, safety, vb.)
            slot_date: Tarih (YYYY-MM-DD)
            slot_time: Saat (HH:MM)
            duration_minutes: Süre (dakika)
            inspector_name: Müfettiş adı
            status: Durum (scheduled, completed, passed, failed, cancelled, no_show)
            notes: Notlar
            event_id: Etkinlik ID'si (None ise aktif etkinlik)
            
        Returns:
            int: Oluşturulan slot ID'si
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            raise ValueError("Aktif etkinlik bulunamadı")
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO inspection_slots 
                (event_id, team_number, inspection_type, slot_date, slot_time, duration_minutes, inspector_name, status, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    team_number,
                    inspection_type,
                    slot_date,
                    slot_time,
                    duration_minutes,
                    inspector_name,
                    status,
                    notes,
                ),
            )
            conn.commit()
            return cursor.lastrowid

    def update_inspection_slot(
        self,
        slot_id: int,
        team_number: str | None = None,
        inspection_type: str | None = None,
        slot_date: str | None = None,
        slot_time: str | None = None,
        duration_minutes: int | None = None,
        inspector_name: str | None = None,
        status: str | None = None,
        notes: str | None = None,
    ) -> None:
        """
        İnceleme slotu günceller.
        
        Args:
            slot_id: Slot ID'si
            team_number: Takım numarası (opsiyonel)
            inspection_type: İnceleme tipi (opsiyonel)
            slot_date: Tarih (opsiyonel)
            slot_time: Saat (opsiyonel)
            duration_minutes: Süre (opsiyonel)
            inspector_name: Müfettiş adı (opsiyonel)
            status: Durum (opsiyonel)
            notes: Notlar (opsiyonel)
        """
        updates = []
        params = []
        
        if team_number is not None:
            updates.append("team_number = ?")
            params.append(team_number)
        if inspection_type is not None:
            updates.append("inspection_type = ?")
            params.append(inspection_type)
        if slot_date is not None:
            updates.append("slot_date = ?")
            params.append(slot_date)
        if slot_time is not None:
            updates.append("slot_time = ?")
            params.append(slot_time)
        if duration_minutes is not None:
            updates.append("duration_minutes = ?")
            params.append(duration_minutes)
        if inspector_name is not None:
            updates.append("inspector_name = ?")
            params.append(inspector_name)
        if status is not None:
            updates.append("status = ?")
            params.append(status)
        if notes is not None:
            updates.append("notes = ?")
            params.append(notes)
        
        if not updates:
            return
        
        params.append(slot_id)
        query = f"UPDATE inspection_slots SET {', '.join(updates)} WHERE id = ?"
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(query, params)
            conn.commit()

    def delete_inspection_slot(self, slot_id: int) -> None:
        """
        İnceleme slotu siler.
        
        Args:
            slot_id: Slot ID'si
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM inspection_slots WHERE id = ?", (slot_id,))
            conn.commit()

    def delete_all_inspection_slots(self, event_id: int | None = None) -> None:
        """
        Tüm inceleme slotlarını siler (etkinlik bazlı).
        
        Args:
            event_id: Etkinlik ID'si (None ise aktif etkinlik)
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM inspection_slots WHERE event_id = ?", (event_id,))
            conn.commit()

    def check_inspection_conflict(
        self,
        team_number: str,
        slot_date: str,
        slot_time: str,
        duration_minutes: int,
        exclude_slot_id: int | None = None,
        event_id: int | None = None,
    ) -> bool:
        """
        İnceleme slotu çakışması kontrolü yapar.
        
        Args:
            team_number: Takım numarası
            slot_date: Tarih (YYYY-MM-DD)
            slot_time: Başlangıç saati (HH:MM)
            duration_minutes: Süre (dakika)
            exclude_slot_id: Hariç tutulacak slot ID'si (güncelleme sırasında)
            event_id: Etkinlik ID'si (None ise aktif etkinlik)
            
        Returns:
            bool: True ise çakışma var, False ise yok
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return False
        
        # Saatleri datetime'a çevir
        from datetime import datetime, timedelta
        
        start_time = datetime.strptime(f"{slot_date} {slot_time}", "%Y-%m-%d %H:%M")
        end_time = start_time + timedelta(minutes=duration_minutes)
        
        query = """
            SELECT id, slot_date, slot_time, duration_minutes 
            FROM inspection_slots 
            WHERE event_id = ? AND team_number = ? AND slot_date = ?
        """
        params = [event_id, team_number, slot_date]
        
        if exclude_slot_id:
            query += " AND id != ?"
            params.append(exclude_slot_id)
        
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(query, params).fetchall()
        
        for row in rows:
            existing_start = datetime.strptime(f"{row[1]} {row[2]}", "%Y-%m-%d %H:%M")
            existing_end = existing_start + timedelta(minutes=row[3])
            
            # Çakışma kontrolü: zaman aralıkları kesişiyor mu?
            if not (end_time <= existing_start or start_time >= existing_end):
                return True
        
        return False

    # ============================================================================
    # DENEME MAÇLARI YÖNETİMİ
    # ============================================================================

    def get_practice_matches(
        self,
        event_id: int | None = None,
        match_date: str | None = None,
        field_number: int | None = None,
        status: str | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Deneme maçlarını listeler.
        
        Args:
            event_id: Etkinlik ID'si (None ise aktif etkinlik)
            match_date: Tarih filtresi (YYYY-MM-DD)
            field_number: Saha numarası filtresi
            status: Durum filtresi
            
        Returns:
            List[Dict]: Deneme maçları listesi
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return []
        
        query = """
            SELECT id, match_number, field_number, match_date, match_time, 
                   red_alliance, blue_alliance, status, red_score, blue_score, notes
            FROM practice_matches 
            WHERE event_id = ?
        """
        params = [event_id]
        
        if match_date:
            query += " AND match_date = ?"
            params.append(match_date)
        if field_number is not None:
            query += " AND field_number = ?"
            params.append(field_number)
        if status:
            query += " AND status = ?"
            params.append(status)
        
        query += " ORDER BY match_date, match_time, field_number"
        
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(query, params).fetchall()
        
        return [
            {
                "id": row[0],
                "match_number": row[1] or "",
                "field_number": row[2],
                "match_date": row[3],
                "match_time": row[4],
                "red_alliance": json.loads(row[5]) if row[5] else [],
                "blue_alliance": json.loads(row[6]) if row[6] else [],
                "status": row[7],
                "red_score": row[8],
                "blue_score": row[9],
                "notes": row[10] or "",
            }
            for row in rows
        ]

    def create_practice_match(
        self,
        match_number: str | None,
        field_number: int,
        match_date: str,
        match_time: str,
        red_alliance: List[str],
        blue_alliance: List[str],
        status: str = "scheduled",
        red_score: int | None = None,
        blue_score: int | None = None,
        notes: str = "",
        event_id: int | None = None,
    ) -> int:
        """
        Yeni deneme maçı oluşturur.
        
        Args:
            match_number: Maç numarası (opsiyonel, otomatik atanabilir)
            field_number: Saha numarası
            match_date: Tarih (YYYY-MM-DD)
            match_time: Saat (HH:MM)
            red_alliance: Kırmızı ittifak takımları (liste)
            blue_alliance: Mavi ittifak takımları (liste)
            status: Durum (scheduled, in_progress, completed, cancelled)
            red_score: Kırmızı skor (opsiyonel)
            blue_score: Mavi skor (opsiyonel)
            notes: Notlar
            event_id: Etkinlik ID'si (None ise aktif etkinlik)
            
        Returns:
            int: Oluşturulan maç ID'si
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            raise ValueError("Aktif etkinlik bulunamadı")
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO practice_matches 
                (event_id, match_number, field_number, match_date, match_time, 
                 red_alliance, blue_alliance, status, red_score, blue_score, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    match_number,
                    field_number,
                    match_date,
                    match_time,
                    json.dumps(red_alliance),
                    json.dumps(blue_alliance),
                    status,
                    red_score,
                    blue_score,
                    notes,
                ),
            )
            conn.commit()
            return cursor.lastrowid

    def update_practice_match(
        self,
        match_id: int,
        match_number: str | None = None,
        field_number: int | None = None,
        match_date: str | None = None,
        match_time: str | None = None,
        red_alliance: List[str] | None = None,
        blue_alliance: List[str] | None = None,
        status: str | None = None,
        red_score: int | None = None,
        blue_score: int | None = None,
        notes: str | None = None,
    ) -> None:
        """
        Deneme maçı günceller.
        
        Args:
            match_id: Maç ID'si
            match_number: Maç numarası (opsiyonel)
            field_number: Saha numarası (opsiyonel)
            match_date: Tarih (opsiyonel)
            match_time: Saat (opsiyonel)
            red_alliance: Kırmızı ittifak (opsiyonel)
            blue_alliance: Mavi ittifak (opsiyonel)
            status: Durum (opsiyonel)
            red_score: Kırmızı skor (opsiyonel)
            blue_score: Mavi skor (opsiyonel)
            notes: Notlar (opsiyonel)
        """
        updates = []
        params = []
        
        if match_number is not None:
            updates.append("match_number = ?")
            params.append(match_number)
        if field_number is not None:
            updates.append("field_number = ?")
            params.append(field_number)
        if match_date is not None:
            updates.append("match_date = ?")
            params.append(match_date)
        if match_time is not None:
            updates.append("match_time = ?")
            params.append(match_time)
        if red_alliance is not None:
            updates.append("red_alliance = ?")
            params.append(json.dumps(red_alliance))
        if blue_alliance is not None:
            updates.append("blue_alliance = ?")
            params.append(json.dumps(blue_alliance))
        if status is not None:
            updates.append("status = ?")
            params.append(status)
        if red_score is not None:
            updates.append("red_score = ?")
            params.append(red_score)
        if blue_score is not None:
            updates.append("blue_score = ?")
            params.append(blue_score)
        if notes is not None:
            updates.append("notes = ?")
            params.append(notes)
        
        if not updates:
            return
        
        params.append(match_id)
        query = f"UPDATE practice_matches SET {', '.join(updates)} WHERE id = ?"
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(query, params)
            conn.commit()

    def delete_practice_match(self, match_id: int) -> None:
        """
        Deneme maçı siler.
        
        Args:
            match_id: Maç ID'si
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM practice_matches WHERE id = ?", (match_id,))
            conn.commit()

    def delete_all_practice_matches(self, event_id: int | None = None) -> None:
        """
        Tüm deneme maçlarını siler.
        
        Args:
            event_id: Etkinlik ID'si (None ise aktif etkinlik)
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return
        
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM practice_matches WHERE event_id = ?", (event_id,))
            conn.commit()

    def check_practice_match_conflict(
        self,
        team_number: str,
        match_date: str,
        match_time: str,
        duration_minutes: int,
        exclude_match_id: int | None = None,
        event_id: int | None = None,
    ) -> bool:
        """
        Deneme maçı çakışması kontrol eder.
        
        Aynı takım aynı anda birden fazla maçta olamaz.
        
        Args:
            team_number: Takım numarası
            match_date: Maç tarihi (YYYY-MM-DD)
            match_time: Maç saati (HH:MM)
            duration_minutes: Maç süresi (dakika)
            exclude_match_id: Hariç tutulacak maç ID'si (güncelleme sırasında)
            event_id: Etkinlik ID'si (None ise aktif etkinlik)
            
        Returns:
            bool: True ise çakışma var, False ise yok
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return False
        
        # Saatleri datetime'a çevir
        from datetime import datetime, timedelta
        
        start_time = datetime.strptime(f"{match_date} {match_time}", "%Y-%m-%d %H:%M")
        end_time = start_time + timedelta(minutes=duration_minutes)
        
        query = """
            SELECT id, match_date, match_time, red_alliance, blue_alliance
            FROM practice_matches 
            WHERE event_id = ? AND match_date = ?
        """
        params = [event_id, match_date]
        
        if exclude_match_id:
            query += " AND id != ?"
            params.append(exclude_match_id)
        
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(query, params).fetchall()
        
        # Maç süresini event'ten al (match_cycle_seconds)
        event_data = self.get_event()
        match_duration = event_data.get("schedule", {}).get("match_cycle_seconds", 150) // 60  # dakikaya çevir
        
        for row in rows:
            existing_start = datetime.strptime(f"{row[1]} {row[2]}", "%Y-%m-%d %H:%M")
            existing_end = existing_start + timedelta(minutes=match_duration)
            
            # Takım bu maçta mı?
            red_alliance = json.loads(row[3]) if row[3] else []
            blue_alliance = json.loads(row[4]) if row[4] else []
            
            if team_number in red_alliance or team_number in blue_alliance:
                # Çakışma kontrolü: zaman aralıkları kesişiyor mu?
                if not (end_time <= existing_start or start_time >= existing_end):
                    return True
        
        return False


def _slugify_code(value: str) -> str:
    raw = value.strip().lower().replace(" ", "_")
    cleaned = re.sub(r"[^a-z0-9_]+", "", raw)
    return cleaned[:4]


def _merge_defaults(data: Dict[str, Any], defaults: Dict[str, Any]) -> Dict[str, Any]:
    merged: Dict[str, Any] = {}
    for key, default_value in defaults.items():
        if key in data:
            if isinstance(default_value, dict) and isinstance(data[key], dict):
                merged[key] = _merge_defaults(data[key], default_value)
            else:
                merged[key] = data[key]
        else:
            merged[key] = default_value
    for key, value in data.items():
        if key not in merged:
            merged[key] = value
    return merged
