"""
Temel Veritabanı İşlemleri Modülü

Bu modül veritabanı şeması oluşturma, migrasyon ve temel yardımcı fonksiyonları içerir.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict

from ..event_setup import default_config_dict
from werkzeug.security import generate_password_hash


def _merge_defaults(data: Dict[str, Any], defaults: Dict[str, Any]) -> Dict[str, Any]:
    """İki dictionary'yi birleştirir, defaults'tan eksik olanları ekler."""
    result = defaults.copy()
    for key, value in data.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _merge_defaults(value, result[key])
        else:
            result[key] = value
    return result


class BaseStorage:
    """
    Temel veritabanı işlemlerini yöneten sınıf.
    
    Bu sınıf:
    - Veritabanı şeması oluşturma
    - Migrasyon işlemleri
    - Temel yardımcı fonksiyonlar
    """
    
    def __init__(self, base_path: Path | None = None) -> None:
        """
        BaseStorage'u başlatır.
        
        Args:
            base_path: Proje kök dizini. None ise otomatik tespit edilir.
        """
        self.base_path = base_path or Path(__file__).resolve().parents[3]
        self.db_path = self.base_path / "src" / "resources" / "data.db"
        self._init_db()
        self._migrate_legacy_schema()
        self._ensure_user_event_column()
        # ensure_default_admin UsersStorage'da olacak, burada çağrılmayacak
    
    def _init_db(self) -> None:
        """
        Veritabanı şemasını oluşturur.
        
        Tablolar:
            - events: Etkinlik bilgileri
            - teams: Takım bilgileri (event_id ile bağlı, CASCADE delete)
            - users: Kullanıcı bilgileri
            - inspection_slots: İnceleme slotları
            - practice_matches: Deneme maçları
            - match_schedule: Resmi maç takvimi
            
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
                    field_name TEXT,
                    match_date TEXT NOT NULL,
                    match_time TEXT NOT NULL,
                    red_alliance TEXT NOT NULL,
                    blue_alliance TEXT NOT NULL,
                    status TEXT DEFAULT 'scheduled',
                    red_score INTEGER,
                    blue_score INTEGER,
                    surrogate_teams TEXT,
                    notes TEXT,
                    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS match_schedule (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id INTEGER NOT NULL,
                    match_number INTEGER NOT NULL,
                    match_type TEXT DEFAULT 'qualification',
                    field_number INTEGER DEFAULT 1,
                    match_date TEXT NOT NULL,
                    match_time TEXT NOT NULL,
                    red_alliance TEXT NOT NULL,
                    blue_alliance TEXT NOT NULL,
                    status TEXT DEFAULT 'scheduled',
                    red_score INTEGER,
                    blue_score INTEGER,
                    surrogate_teams TEXT,
                    notes TEXT,
                    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
                    UNIQUE(event_id, match_number, match_type)
                )
                """
            )
            conn.commit()
        # Migration'ları çalıştır
        self._ensure_user_token_column()
        self._ensure_user_event_column()
        self._ensure_inspection_station_column()
        self._ensure_practice_field_name_column()
        self._ensure_practice_surrogate_column()
        self._ensure_match_surrogate_column()
    
    def _migrate_legacy_schema(self) -> None:
        """
        Eski şemadan yeni şemaya veri migrasyonu yapar.
        
        Eski tablolar:
            - event (tekil) -> events (çoğul)
            - teams (event_id yok) -> teams (event_id var)
        """
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
                    # get_active_event_id henüz tanımlı değil, manuel kontrol et
                    active_row = conn.execute("SELECT id FROM events WHERE active = 1 LIMIT 1").fetchone()
                    event_id = active_row[0] if active_row else 1
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
        self._ensure_practice_field_name_column()
        self._ensure_practice_surrogate_column()
        self._ensure_match_surrogate_column()
    
    def _ensure_user_token_column(self) -> None:
        """users tablosuna login_token ve password_plain kolonlarını ekler (migration)."""
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
    
    def _ensure_inspection_station_column(self) -> None:
        """
        inspection_slots tablosuna station_name kolonu ekler (migration).
        
        İstasyon isimleri (örneğin "İstasyon 1", "Grup A") hangi grup müfettişin
        hangi takımlara bakacağını belirlemek için kullanılır.
        """
        with sqlite3.connect(self.db_path) as conn:
            columns = [
                row[1] for row in conn.execute("PRAGMA table_info(inspection_slots)").fetchall()
            ]
            if "station_name" not in columns:
                conn.execute("ALTER TABLE inspection_slots ADD COLUMN station_name TEXT")
                conn.commit()

    def _ensure_practice_field_name_column(self) -> None:
        """
        practice_matches tablosuna field_name kolonu ekler (migration).
        
        Saha ismi, saha numarasına ek olarak gösterilir (örn: "Saha A").
        """
        with sqlite3.connect(self.db_path) as conn:
            columns = [
                row[1] for row in conn.execute("PRAGMA table_info(practice_matches)").fetchall()
            ]
            if "field_name" not in columns:
                conn.execute("ALTER TABLE practice_matches ADD COLUMN field_name TEXT")
                conn.commit()

    def _ensure_practice_surrogate_column(self) -> None:
        """
        practice_matches tablosuna surrogate_teams kolonu ekler (migration).
        
        Surrogate takımlar JSON array olarak saklanır.
        """
        with sqlite3.connect(self.db_path) as conn:
            columns = [
                row[1] for row in conn.execute("PRAGMA table_info(practice_matches)").fetchall()
            ]
            if "surrogate_teams" not in columns:
                conn.execute("ALTER TABLE practice_matches ADD COLUMN surrogate_teams TEXT")
                conn.commit()

    def _ensure_match_surrogate_column(self) -> None:
        """
        match_schedule tablosuna surrogate_teams kolonu ekler (migration).

        Surrogate takımlar JSON array olarak saklanır.
        """
        with sqlite3.connect(self.db_path) as conn:
            columns = [
                row[1] for row in conn.execute("PRAGMA table_info(match_schedule)").fetchall()
            ]
            if "surrogate_teams" not in columns:
                conn.execute("ALTER TABLE match_schedule ADD COLUMN surrogate_teams TEXT")
                conn.commit()
    
    def is_empty(self) -> bool:
        """Veritabanının boş olup olmadığını kontrol eder."""
        with sqlite3.connect(self.db_path) as conn:
            event_row = conn.execute("SELECT 1 FROM events LIMIT 1").fetchone()
            team_row = conn.execute("SELECT 1 FROM teams LIMIT 1").fetchone()
        return not event_row and not team_row
