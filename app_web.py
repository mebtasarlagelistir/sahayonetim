"""
MEMSKOR - Flask Web Uygulaması

Bu modül Flask web uygulamasının ana giriş noktasıdır. Tüm HTTP route'ları,
API endpoint'leri ve kimlik doğrulama mantığı burada tanımlanır.

Modül Yapısı:
- create_app(): Flask uygulamasını oluşturur ve yapılandırır
- require_login: Decorator - Korumalı route'lar için kimlik doğrulama
- require_admin: Decorator - Sadece admin kullanıcıları için
- require_event_manager: Decorator - Admin ve etkinlik_yoneticisi için
- Route handlers: HTTP isteklerini işleyen fonksiyonlar

Rol Bazlı Erişim Kontrolü:
- Admin: Tüm yetkiler, tüm etkinliklere erişim
- Etkinlik Yöneticisi: Sadece kendi etkinliği, tüm bölümleri görebilir
- Hakem: Setup sayfasına erişebilir, sadece Skorlama bölümünü görebilir
- Mufettis: Setup sayfasına erişebilir, sadece İnceleme bölümlerini görebilir
        - Seremoni: Setup sayfasına erişebilir, sadece Ödüller bölümünü görebilir

Bağımlılıklar:
- Flask: Web framework
- src.core.storage: Veritabanı işlemleri
- src.core.config: Yapılandırma yönetimi
"""

# Gevent monkey patching - İLK SATIRDA OLMALI
# WebSocket ve async işlemler için gevent'in stdlib'i patch etmesi gerekir
from gevent import monkey
monkey.patch_all()

from pathlib import Path
import base64
import logging
import os
import secrets
import socket

from flask import Flask, jsonify, redirect, render_template, request, session, url_for
import qrcode
from qrcode.image.svg import SvgImage
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_socketio import SocketIO, emit, join_room, leave_room

from src.core.config import Config
from src.core.storage import DataStore
from src.core.constants import RateLimitConstants
from decorators import create_decorators
from routes.inspection import register_inspection_routes
from routes.practice_matches import register_practice_matches_routes
from routes.match_schedule import register_match_schedule_routes
from routes.wifi import register_wifi_routes
from routes.archive import register_archive_routes
from routes.match_control import register_match_control_routes
from routes.screens import register_screen_routes
from routes.referee_panel import register_referee_panel_routes


def _deep_merge(base: dict, updates: dict) -> dict:
    """
    İç içe sözlükleri birleştirir; updates değerleri base üzerine yazılır.
    """
    merged = dict(base) if isinstance(base, dict) else {}
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _load_secret_key(base_path: Path) -> str:
    """
    Flask session güvenliği için secret key yükler veya oluşturur.
    
    Secret key dosyası yoksa otomatik olarak oluşturulur ve kaydedilir.
    Bu sayede her sunucu yeniden başlatıldığında aynı key kullanılır.
    
    Args:
        base_path: Proje kök dizini
        
    Returns:
        str: Secret key değeri
    """
    secret_path = base_path / "src" / "resources" / "secret.key"
    if secret_path.exists():
        return secret_path.read_text(encoding="utf-8").strip()
    secret = secrets.token_urlsafe(32)
    secret_path.write_text(secret, encoding="utf-8")
    return secret


def _get_lan_base_url(req: request) -> str:
    """
    İstek yapılan bilgisayarın LAN IP adresini ve portunu alır.
    
    QR kod oluşturma için kullanılır. Bu sayede aynı ağdaki diğer cihazlar
    (tablet, telefon vb.) QR kod ile giriş yapabilir.
    
    Args:
        req: Flask request nesnesi
        
    Returns:
        str: LAN IP adresi ve port ile birlikte base URL
             Örnek: "http://192.168.1.100:5000"
    """
    host = req.host
    port = None
    if ":" in host:
        _, port = host.rsplit(":", 1)
    ip = _get_local_ip()
    if port:
        return f"http://{ip}:{port}"
    return f"http://{ip}"


def _get_local_ip() -> str:
    """
    Bilgisayarın yerel ağ (LAN) IP adresini bulur.
    
    Google DNS'ye bağlanarak aktif ağ arayüzünün IP'sini tespit eder.
    Hata durumunda localhost döner.
    
    Returns:
        str: LAN IP adresi (örn: "192.168.1.100") veya "127.0.0.1"
    """
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


def create_app() -> Flask:
    """
    Flask uygulamasını oluşturur ve yapılandırır.
    
    Bu fonksiyon:
    1. Flask uygulamasını başlatır
    2. Template ve static klasörlerini yapılandırır
    3. Secret key'i yükler
    4. DataStore'u başlatır ve veri migrasyonu yapar
    5. Tüm route'ları tanımlar
    
    Returns:
        Flask: Yapılandırılmış Flask uygulaması
        
    Not:
        Bu fonksiyon modüler test için kullanılabilir.
        Direkt çalıştırıldığında __main__ bloğu devreye girer.
    """
    base_path = Path(__file__).resolve().parent
    config = Config(base_path=base_path)
    
    # Ortam tespiti (development/production)
    # FLASK_ENV environment variable ile kontrol edilir
    # Varsayılan: development (güvenlik için)
    flask_env = os.environ.get("FLASK_ENV", "development").lower()
    is_production = flask_env == "production"
    is_development = not is_production
    
    # Logging yapılandırması
    (base_path / 'logs').mkdir(exist_ok=True)
    
    # Production modunda logging seviyesini optimize et
    log_level = logging.WARNING if is_production else logging.INFO
    
    # Geliştirme modunda Werkzeug uyarılarını filtrele
    class DevelopmentServerFilter(logging.Filter):
        """Geliştirme sunucu uyarılarını filtreler"""
        def filter(self, record):
            # Werkzeug'un development server uyarısını filtrele
            if "WARNING: This is a development server" in record.getMessage():
                return False
            return True
    
    # Logging handler'ları oluştur
    handlers = [
        logging.FileHandler(base_path / 'logs' / 'app.log', encoding='utf-8')
    ]
    
    # Console handler - geliştirme modunda uyarıları filtrele
    console_handler = logging.StreamHandler()
    if is_development:
        console_handler.addFilter(DevelopmentServerFilter())
    handlers.append(console_handler)
    
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=handlers
    )
    
    # Production modunda bazı logger'ları daha yüksek seviyeye ayarla
    if is_production:
        # SSE ve realtime logger'larını WARNING seviyesine ayarla
        logging.getLogger('routes.match_control').setLevel(logging.WARNING)
        logging.getLogger('src.core.match_state').setLevel(logging.WARNING)
        logging.getLogger('src.core.scoring.realtime').setLevel(logging.WARNING)
    
    # Werkzeug logger'ını da filtrele (geliştirme modunda)
    if is_development:
        werkzeug_logger = logging.getLogger('werkzeug')
        werkzeug_logger.addFilter(DevelopmentServerFilter())
    
    logger = logging.getLogger(__name__)
    logger.info(f"MEMSKOR uygulaması başlatılıyor... (Ortam: {flask_env})")
    
    app = Flask(
        __name__,
        template_folder=str(base_path / "templates"),
        static_folder=str(base_path / "static"),
    )
    
    # Ortam bazlı yapılandırma
    app.config["ENV"] = flask_env
    app.config["DEBUG"] = is_development
    
    # Geliştirme modunda template'lerin otomatik yeniden yüklenmesi
    if is_development:
        app.config["TEMPLATES_AUTO_RELOAD"] = True
        app.jinja_env.auto_reload = True
    else:
        # Production'da performans için kapat
        app.config["TEMPLATES_AUTO_RELOAD"] = False
        app.jinja_env.auto_reload = False
    app.secret_key = _load_secret_key(base_path)
    datastore = DataStore(base_path=base_path)
    datastore.migrate_from_config(config.data)
    
    # Flask-SocketIO'yu başlat
    # CORS ayarları: Tüm origin'lere izin ver (aynı ağdaki cihazlar için)
    # gevent async_mode ile gerçek WebSocket desteği (gevent yüklü olmalı: pip install gevent)
    # NOT: gevent ile Werkzeug development server sorunsuz çalışır
    socketio = SocketIO(
        app,
        cors_allowed_origins="*",
        async_mode="gevent",  # Gevent modu - gerçek WebSocket desteği
        logger=is_development,  # Geliştirme modunda log açık
        engineio_logger=is_development,
        ping_timeout=60,  # 60 saniye ping timeout
        ping_interval=25,  # 25 saniyede bir ping gönder
    )
    
    # SocketIO instance'ını app'e ekle (route modüllerinde kullanmak için)
    app.socketio = socketio

    # Rate limiting yapılandırması - constants modülünden al
    limiter = Limiter(
        app=app,
        key_func=get_remote_address,
        default_limits=[
            RateLimitConstants.DEFAULT_DAILY_LIMIT,
            RateLimitConstants.DEFAULT_HOURLY_LIMIT
        ],
        storage_uri="memory://",  # Production'da Redis kullanılabilir
        strategy="fixed-window"
    )

    # Decorator'ları oluştur
    decorators = create_decorators(datastore)
    require_login = decorators["require_login"]
    require_admin = decorators["require_admin"]
    require_event_manager = decorators["require_event_manager"]


    # ============================================================================
    # SAYFA ROUTE'LARI (HTML Sayfaları)
    # ============================================================================
    
    @app.get("/")
    @require_login
    def index():
        """
        Ana sayfa.
        
        Kullanıcının rolüne göre yönlendirme yapar:
        - Admin ve etkinlik_yoneticisi: dashboard sayfasına
        - Diğerleri: dashboard sayfasına (okuma/erişim rolüne göre sınırlandırılır)
        """
        username = session.get("user")
        if not username:
            return redirect(url_for("login"))
        
        role = datastore.get_user_role(username)
        if not role:
            return redirect(url_for("login"))
        
        role_lower = role.lower()
        # Admin ve etkinlik yöneticisi dashboard sayfasına erişebilir
        if role_lower == "admin" or "etkinlik_yoneticisi" in role_lower or "yonetici" in role_lower:
            return redirect(url_for("dashboard"))
        
        # Diğer kullanıcılar dashboard sayfasında rol bazlı içerik görecek
        return redirect(url_for("dashboard"))

    @app.get("/dashboard")
    @require_login
    def dashboard():
        """
        Etkinlik yönetim dashboard'u.

        Kurulum adımlarına bağlantılar ve etkinlik özet bilgileri içerir.
        """
        return render_template("dashboard.html")

    @app.get("/inspection-tracking")
    @require_login
    def inspection_tracking():
        """
        İnceleme takip paneli.
        
        Takımların inceleme durumlarını gösteren dashboard.
        Bar chart ve liste görünümü içerir.
        """
        return render_template("inspection_tracking.html")
    
    @app.get("/inspection-schedule")
    @require_login
    def inspection_schedule():
        """
        İnceleme programı oluşturma sayfası.
        
        Takımlar için basit inceleme programı oluşturur (yazdırılabilir).
        """
        return render_template("inspection_schedule.html")
    
    @app.get("/inspection-progress")
    @require_login
    def inspection_progress():
        """
        İnceleme durum girişi sayfası.
        
        Takımların inceleme sonuçlarını (geçti/geçmedi) ve notlarını girme ekranı.
        """
        return render_template("inspection_progress.html")

    @app.get("/award-assignment")
    @require_login
    def award_assignment():
        """
        Ödül atama sayfası.
        
        Jüri üyeleri için ödül-takım eşleştirmesi yapma ekranı.
        """
        return render_template("award_assignment.html")

    @app.get("/setup")
    @app.get("/setup/<step>")
    @require_login
    def setup(step=None):
        """
        Etkinlik kurulum sayfası.
        
        Tüm roller erişebilir, ancak içerik rol bazlı gösterilir:
        - Admin ve etkinlik_yoneticisi: Tüm bölümleri görebilir
        - Hakem, mufettis, seremoni: Sadece kendi işleriyle ilgili bölümleri görebilir
        
        Args:
            step: Adım adı (event, teams, accounts, inspection-schedule, vb.)
                 None ise ana setup sayfası gösterilir
        """
        return render_template("setup.html")
    
    @app.get("/api/setup/step/<step>")
    @require_login
    def get_setup_step(step):
        """
        Belirli bir kurulum adımının HTML içeriğini döndürür.
        
        Args:
            step: Adım adı (event, teams, accounts, inspection-schedule, vb.)
        
        Returns:
            HTML: Adım içeriği
        """
        # Adım adını template dosya adına çevir
        step_map = {
            "event": "step_event.html",
            "teams": "step_teams.html",
            "accounts": "step_accounts.html",
            "sponsors": "step_sponsors.html",
            "judging": "step_judging.html",
            "inspection-schedule": "step_inspection_schedule.html",
            "practice-matches": "step_practice_matches.html",
            "match-schedule": "step_match_schedule.html",
            "playoff": "step_playoff.html",
            "wifi": "step_wifi.html",
            "awards": "step_awards.html",
            "archive": "step_archive.html",
        }
        
        template_name = step_map.get(step)
        if not template_name:
            return jsonify({"error": "Geçersiz adım"}), 404
        
        try:
            return render_template(f"setup/{template_name}")
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.get("/login")
    def login():
        """
        Giriş sayfası.
        
        Kullanıcı zaten giriş yapmışsa ana sayfaya yönlendirir.
        """
        if session.get("user"):
            return redirect(url_for("index"))
        return render_template("login.html")

    @app.post("/login")
    @limiter.limit(RateLimitConstants.LOGIN_LIMIT)  # Brute force koruması
    def login_post():
        """
        Kullanıcı giriş işlemi (form POST).
        
        Kullanıcı adı ve şifre ile kimlik doğrulama yapar.
        Başarılı olursa session'a kullanıcı adını kaydeder.
        """
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        if datastore.authenticate_user(username, password):
            session["user"] = username
            return redirect(url_for("index"))
        return render_template("login.html", error="Geçersiz kullanıcı adı veya şifre.")

    @app.get("/qr/<token>")
    def login_with_qr(token: str):
        """
        QR kod ile giriş.
        
        Kullanıcılar QR kod okutarak giriş yapabilir.
        Token geçerliyse oturum açılır.
        
        Args:
            token: Kullanıcının login token'ı (QR kod içinde)
        """
        username = datastore.authenticate_token(token)
        if not username:
            return redirect(url_for("login"))
        session["user"] = username
        return redirect(url_for("index"))

    @app.get("/logout")
    def logout():
        """Çıkış yap - Session'ı temizle ve login sayfasına yönlendir."""
        session.clear()
        return redirect(url_for("login"))

    # ============================================================================
    # API ROUTE'LARI (JSON Endpoint'leri)
    # ============================================================================
    
    # --- ETKİNLİK YÖNETİMİ ---
    
    @app.get("/api/events")
    @require_login
    def get_events():
        """
        Tüm etkinlikleri listeler.
        
        Returns:
            JSON: Etkinlik listesi
            [{"id": 1, "name": "Etkinlik Adı", "active": true}, ...]
        """
        return jsonify(datastore.get_events())

    @app.get("/api/user/role")
    @require_login
    def get_user_role():
        """
        Mevcut kullanıcının rolünü ve bilgilerini getirir.
        
        Returns:
            JSON: {"username": "admin", "role": "admin", "event_id": 1} veya {"role": null}
        """
        username = session.get("user")
        if not username:
            return jsonify({"username": None, "role": None}), 401
        
        role = datastore.get_user_role(username)
        event_id = datastore.get_user_event_id(username)
        return jsonify({"username": username, "role": role, "event_id": event_id})
    
    @app.post("/api/events")
    @limiter.limit(RateLimitConstants.EVENT_CREATE_LIMIT)
    @require_login
    @require_event_manager
    def create_event():
        """
        Yeni etkinlik oluşturur.
        
        Request Body:
            {"name": "Etkinlik Adı"}
            
        Returns:
            JSON: {"id": event_id}
            
        Not: Oluşturulan etkinlik otomatik olarak aktif yapılır.
        """
        data = request.get_json(force=True) or {}
        name = str(data.get("name", "")).strip() or "Yeni Etkinlik"
        event_id = datastore.create_event(name)
        datastore.set_active_event(event_id)
        return jsonify({"id": event_id})

    @app.post("/api/events/active")
    @require_login
    @require_event_manager
    def set_active_event():
        """
        Aktif etkinliği değiştirir.
        
        Request Body:
            {"id": event_id}
            
        Returns:
            JSON: {"ok": true}
        """
        data = request.get_json(force=True) or {}
        event_id = data.get("id")
        if not isinstance(event_id, int):
            return jsonify({"error": "invalid id"}), 400
        datastore.set_active_event(event_id)
        return jsonify({"ok": True})

    @app.delete("/api/events/<int:event_id>")
    @require_login
    @require_event_manager
    def delete_event(event_id: int):
        """
        Etkinlik siler.
        
        Args:
            event_id: Silinecek etkinliğin ID'si
            
        Returns:
            JSON: {"ok": true} veya {"error": "mesaj"}
            
        Not: Etkinlik silinince tüm takımları da silinir (CASCADE).
        """
        try:
            datastore.delete_event(event_id)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.delete("/api/events")
    @require_login
    @require_admin
    def delete_all_events():
        """
        Tüm etkinlikleri siler (test/başlangıç için).
        
        Returns:
            JSON: {"ok": true, "deleted_count": sayı} veya {"error": "mesaj"}
            
        Not: 
            - Sadece admin kullanıcılar bu işlemi yapabilir
            - Tüm etkinlikler ve takımları silinir
        """
        try:
            events = datastore.get_events()
            count = len(events)
            for event in events:
                datastore.delete_event(event["id"])
            return jsonify({"ok": True, "deleted_count": count})
        except Exception as e:
            logger.error(f"Tüm etkinlikleri silme hatası: {str(e)}", exc_info=True)
            return jsonify({"error": str(e)}), 500

    @app.get("/api/event")
    @limiter.limit(RateLimitConstants.EVENT_READ_LIMIT)
    @require_login
    def get_event():
        """
        Aktif etkinliğin bilgilerini getirir.
        
        Returns:
            JSON: Etkinlik verisi (tüm alanlar dahil)
            
        Not:
            - Aktif etkinlik yoksa varsayılan değerler döner
            - Veri bozuksa varsayılan değerler döner
        """
        try:
            return jsonify(datastore.get_event())
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.post("/api/event")
    @require_login
    @require_event_manager
    def save_event():
        """
        Aktif etkinliğin bilgilerini kaydeder.
        
        Request Body:
            {
                "name": "Etkinlik Adı",
                "code": "KOD",
                "dates": {"start": "2026-01-01", "end": "2026-01-02"},
                ...
            }
            
        Validasyonlar:
            - Etkinlik kodu max 4 karakter
            - Bitiş tarihi >= başlangıç tarihi
            - E-posta formatı kontrolü
            
        Returns:
            JSON: {"ok": true} veya {"error": "mesaj"}
        """
        data = request.get_json(force=True) or {}
        if not isinstance(data, dict):
            return jsonify({"error": "invalid payload"}), 400
        
        # Aktif etkinlik yoksa, bilinçli olarak yeni etkinlik oluşturulmalı
        if datastore.get_active_event_id() is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı. Önce Yeni ile etkinlik oluşturun."}), 400
        
        # Validations
        event_code = str(data.get("code", "")).strip()
        if event_code and len(event_code) > 4:
            return jsonify({"error": "Etkinlik kodu en fazla 4 karakter olabilir"}), 400
        
        dates = data.get("dates", {})
        start_date = dates.get("start")
        end_date = dates.get("end")
        if start_date and end_date:
            from datetime import datetime
            try:
                start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
                end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
                if end < start:
                    return jsonify({"error": "Bitiş tarihi başlangıç tarihinden önce olamaz"}), 400
            except (ValueError, AttributeError):
                pass  # Invalid date format, let it pass
        
        email = data.get("organizer", {}).get("email", "").strip()
        if email:
            import re
            if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
                return jsonify({"error": "Geçerli bir e-posta adresi giriniz"}), 400
        
        try:
            existing = datastore.get_event()
            merged = _deep_merge(existing, data)
            datastore.save_event(merged)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.get("/api/awards")
    @require_login
    def get_awards():
        """
        Aktif etkinliğin ödül listesini döndürür.

        Returns:
            JSON: Ödül listesi
        """
        event_data = datastore.get_event()
        awards = event_data.get("awards", [])
        if not isinstance(awards, list):
            awards = []
        return jsonify(awards)

    @app.get("/api/public/awards")
    def get_awards_public():
        """
        Seyirci ekranı için ödül listesini döndürür (giriş gerektirmez).
        """
        event_data = datastore.get_event()
        awards = event_data.get("awards", [])
        if not isinstance(awards, list):
            awards = []
        return jsonify(awards)

    @app.get("/api/public/event-info")
    def get_event_info_public():
        """
        Seyirci ekranı için aktif etkinlik adı/kodu (giriş gerektirmez).
        Maç kontrol ile aynı etkinlik: get_active_event_id() tek kaynaktır.
        """
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"name": "", "code": "", "id": None})
        event_data = datastore.get_event()
        if not event_data:
            return jsonify({"name": "", "code": "", "id": event_id})
        return jsonify({
            "id": event_id,
            "name": event_data.get("name") or "",
            "code": event_data.get("code") or "",
        })

    @app.get("/api/public/rankings")
    def get_rankings_public():
        """
        Seyirci ekranı için sıralama verisini döndürür (giriş gerektirmez).
        Tamamlanan sıralama maçlarından SP sıralamasını hesaplar.
        """
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"rankings": [], "completed_count": 0})

        completed_matches = datastore.get_match_schedule(
            event_id=event_id,
            status="completed",
        )
        qualification_matches = [
            m for m in completed_matches
            if (m.get("match_type") or "qualification").strip() == "qualification"
        ]

        # Eksik SP verisini mevcut scoring_data'dan hesapla
        from src.core.scoring.ranking_points import RankingPointsCalculator
        for m in qualification_matches:
            scoring_data = m.get("scoring_data") if isinstance(m.get("scoring_data"), dict) else {}
            rp = scoring_data.get("ranking_points")
            if not rp:
                rp = RankingPointsCalculator.calculate_ranking_points(
                    match_type=m.get("match_type", "qualification"),
                    red_score=int(m.get("red_score") or 0),
                    blue_score=int(m.get("blue_score") or 0),
                    scoring_data=scoring_data,
                    red_alliance=m.get("red_alliance") or [],
                    blue_alliance=m.get("blue_alliance") or [],
                )
                scoring_data["ranking_points"] = rp
                m["scoring_data"] = scoring_data

        if not qualification_matches:
            return jsonify({"rankings": [], "completed_count": 0})

        from src.core.scoring.team_rankings import TeamRankingsCalculator
        calculator = TeamRankingsCalculator()
        rankings = calculator.calculate_team_rankings(qualification_matches)
        return jsonify({"rankings": rankings, "completed_count": len(qualification_matches)})

    @app.get("/api/public/inspection-status")
    def get_inspection_status_public():
        """
        Seyirci ekranı için inceleme durumlarını döndürür (giriş gerektirmez).
        """
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"teams": [], "slots": []})
        teams = datastore.get_teams()
        slots = datastore.get_inspection_slots(event_id=event_id)
        return jsonify({"teams": teams, "slots": slots})

    @app.post("/api/awards")
    @require_login
    def save_awards():
        """
        Aktif etkinliğin ödül listesini kaydeder.

        Request Body:
            [
                {"name": "...", "category": "...", "type": "...", "sponsor": "...", "description": "..."},
                ...
            ]
        """
        username = session.get("user")
        role = datastore.get_user_role(username) or ""
        role_lower = role.lower()
        can_edit = (
            role_lower == "admin"
            or "etkinlik_yoneticisi" in role_lower
            or "yonetici" in role_lower
            or "seremoni" in role_lower
        )
        if not can_edit:
            return jsonify({"error": "forbidden", "message": "Bu işlem için yetkiniz yok"}), 403

        data = request.get_json(force=True) or []
        if not isinstance(data, list):
            return jsonify({"error": "invalid payload"}), 400

        cleaned = []
        for item in data:
            if not isinstance(item, dict):
                continue
            cleaned.append(
                {
                    "name": str(item.get("name", "")).strip(),
                    "category": str(item.get("category", "")).strip(),
                    "type": str(item.get("type", "")).strip(),
                    "sponsor": str(item.get("sponsor", "")).strip(),
                    "description": str(item.get("description", "")).strip(),
                }
            )

        event_data = datastore.get_event()
        event_data["awards"] = cleaned
        datastore.save_event(event_data)
        return jsonify({"ok": True, "count": len(cleaned)})

    # --- ÖDÜL KAZANANLARI VE TÖREN YÖNETİMİ ---
    
    @app.get("/api/award-winners")
    @require_login
    def get_award_winners():
        """
        Aktif etkinliğin ödül kazananlarını döndürür.
        """
        try:
            winners = datastore.get_award_winners()
            return jsonify(winners)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    @app.get("/api/public/award-winners")
    def get_award_winners_public():
        """
        Seyirci ekranı için ödül kazananlarını döndürür (giriş gerektirmez).
        """
        try:
            winners = datastore.get_award_winners()
            return jsonify(winners)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    @app.post("/api/award-winners")
    @require_login
    def save_award_winners():
        """
        Ödül kazananlarını toplu olarak kaydeder.
        
        Request Body:
            [
                {
                    "award_name": "...",
                    "award_category": "...",
                    "award_description": "...",
                    "winner_team_number": "...",
                    "winner_team_name": "...",
                    "jury_note": "...",
                    "presentation_order": 0
                },
                ...
            ]
        """
        username = session.get("user")
        role = datastore.get_user_role(username) or ""
        role_lower = role.lower()
        can_edit = (
            role_lower == "admin"
            or "etkinlik_yoneticisi" in role_lower
            or "yonetici" in role_lower
            or "juri" in role_lower
            or "seremoni" in role_lower
        )
        if not can_edit:
            return jsonify({"error": "forbidden", "message": "Bu işlem için yetkiniz yok"}), 403
        
        data = request.get_json(force=True) or []
        if not isinstance(data, list):
            return jsonify({"error": "invalid payload"}), 400
        
        try:
            count = datastore.bulk_save_award_winners(data)
            
            # WebSocket ile tüm audience ekranlarına awards güncellemesini bildir
            socketio.emit("awards_update", {
                "type": "awards_update",
                "count": count
            }, namespace="/audience")
            logger.info(f"Awards update broadcast: {count} kazanan güncellendi")
            
            return jsonify({"ok": True, "count": count})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    @app.delete("/api/award-winners/<int:winner_id>")
    @require_login
    def delete_award_winner(winner_id):
        """
        Ödül kazananını siler.
        """
        username = session.get("user")
        role = datastore.get_user_role(username) or ""
        role_lower = role.lower()
        can_edit = (
            role_lower == "admin"
            or "etkinlik_yoneticisi" in role_lower
            or "yonetici" in role_lower
        )
        if not can_edit:
            return jsonify({"error": "forbidden", "message": "Bu işlem için yetkiniz yok"}), 403
        
        try:
            success = datastore.delete_award_winner(winner_id)
            if success:
                return jsonify({"ok": True})
            else:
                return jsonify({"error": "Kayıt bulunamadı"}), 404
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    # --- TÖREN KONTROL API'leri ---
    
    @app.get("/api/ceremony/state")
    @require_login
    def get_ceremony_state():
        """
        Tören durumunu döndürür.
        """
        try:
            state = datastore.get_ceremony_state()
            return jsonify(state)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    @app.get("/api/public/ceremony")
    def get_ceremony_state_public():
        """
        Seyirci ekranı için tören durumunu döndürür (giriş gerektirmez).
        """
        try:
            state = datastore.get_ceremony_state()
            return jsonify(state)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    @app.post("/api/ceremony/start")
    @require_login
    def start_ceremony():
        """
        Tören sunumunu başlatır.
        """
        username = session.get("user")
        role = datastore.get_user_role(username) or ""
        role_lower = role.lower()
        can_control = (
            role_lower == "admin"
            or "etkinlik_yoneticisi" in role_lower
            or "seremoni" in role_lower
            or "mc" in role_lower
        )
        if not can_control:
            return jsonify({"error": "forbidden", "message": "Bu işlem için yetkiniz yok"}), 403
        
        try:
            result = datastore.start_ceremony()
            if "error" in result:
                return jsonify(result), 400
            
            # SocketIO ile tüm seyirci ekranlarına bildir (/audience namespace)
            socketio.emit("ceremony_update", result, namespace="/audience")
            return jsonify(result)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    @app.post("/api/ceremony/next")
    @require_login
    def next_ceremony_step():
        """
        Tören sunumunda bir sonraki adıma geçer.
        """
        username = session.get("user")
        role = datastore.get_user_role(username) or ""
        role_lower = role.lower()
        can_control = (
            role_lower == "admin"
            or "etkinlik_yoneticisi" in role_lower
            or "seremoni" in role_lower
            or "mc" in role_lower
        )
        if not can_control:
            return jsonify({"error": "forbidden", "message": "Bu işlem için yetkiniz yok"}), 403
        
        try:
            result = datastore.next_ceremony_step()
            if "error" in result:
                return jsonify(result), 400
            
            # SocketIO ile tüm seyirci ekranlarına bildir (/audience namespace)
            socketio.emit("ceremony_update", result, namespace="/audience")
            return jsonify(result)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    @app.post("/api/ceremony/show/<int:award_id>")
    @require_login
    def show_ceremony_award(award_id):
        """
        Belirli bir ödülü gösterir.
        """
        username = session.get("user")
        role = datastore.get_user_role(username) or ""
        role_lower = role.lower()
        can_control = (
            role_lower == "admin"
            or "etkinlik_yoneticisi" in role_lower
            or "seremoni" in role_lower
            or "mc" in role_lower
        )
        if not can_control:
            return jsonify({"error": "forbidden", "message": "Bu işlem için yetkiniz yok"}), 403
        
        try:
            result = datastore.show_specific_award(award_id)
            if "error" in result:
                return jsonify(result), 400
            
            # SocketIO ile tüm seyirci ekranlarına bildir (/audience namespace)
            socketio.emit("ceremony_update", result, namespace="/audience")
            return jsonify(result)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    @app.post("/api/ceremony/stop")
    @require_login
    def stop_ceremony():
        """
        Töreni durdurur.
        """
        username = session.get("user")
        role = datastore.get_user_role(username) or ""
        role_lower = role.lower()
        can_control = (
            role_lower == "admin"
            or "etkinlik_yoneticisi" in role_lower
            or "seremoni" in role_lower
            or "mc" in role_lower
        )
        if not can_control:
            return jsonify({"error": "forbidden", "message": "Bu işlem için yetkiniz yok"}), 403
        
        try:
            result = datastore.stop_ceremony()
            
            # SocketIO ile tüm seyirci ekranlarına bildir (/audience namespace)
            socketio.emit("ceremony_update", {"is_active": False, "current_step": "idle"}, namespace="/audience")
            return jsonify(result)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.post("/api/ceremony/show-by-name")
    @require_login
    def show_ceremony_award_by_name():
        """
        Belirli bir ödülü ismine göre gösterir.
        """
        username = session.get("user")
        role = datastore.get_user_role(username) or ""
        role_lower = role.lower()
        can_control = (
            role_lower == "admin"
            or "etkinlik_yoneticisi" in role_lower
            or "seremoni" in role_lower
            or "mc" in role_lower
        )
        if not can_control:
            return jsonify({"error": "forbidden", "message": "Bu işlem için yetkiniz yok"}), 403
        
        try:
            data = request.get_json(force=True) or {}
            award_name = data.get("award_name", "").strip()
            if not award_name:
                return jsonify({"error": "award_name gerekli"}), 400
            
            # Ödülü ismine göre bul
            winners = datastore.get_award_winners()
            award = next((w for w in winners if w["award_name"] == award_name), None)
            if not award:
                return jsonify({"error": "Ödül bulunamadı"}), 404
            
            result = datastore.show_specific_award(award["id"])
            if "error" in result:
                return jsonify(result), 400
            
            # SocketIO ile tüm seyirci ekranlarına bildir (/audience namespace)
            socketio.emit("ceremony_update", result, namespace="/audience")
            return jsonify(result)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # --- TAKIM YÖNETİMİ ---
    
    @app.get("/api/teams")
    @require_login
    def get_teams():
        """
        Aktif etkinliğin takımlarını listeler.
        
        Returns:
            JSON: Takım listesi
            [{"number": "2025", "name": "Takım Adı", ...}, ...]
            
        Not:
            - Aktif etkinlik yoksa boş liste döner
        """
        try:
            return jsonify(datastore.get_teams())
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.post("/api/teams")
    @require_login
    @require_event_manager
    def save_teams():
        """
        Aktif etkinliğin takımlarını kaydeder.
        
        Request Body:
            [
                {"number": "2025", "name": "Takım Adı", "school": "...", ...},
                ...
            ]
            
        Validasyonlar:
            - Aynı takım numarası birden fazla kez kullanılamaz
            
        Returns:
            JSON: {"ok": true} veya {"error": "mesaj"}
        """
        data = request.get_json(force=True) or []
        if not isinstance(data, list):
            return jsonify({"error": "invalid payload"}), 400
        
        # Validate duplicate team numbers
        team_numbers = {}
        duplicates = []
        for idx, team in enumerate(data):
            number = str(team.get("number", "")).strip()
            if number:
                if number in team_numbers:
                    duplicates.append(number)
                else:
                    team_numbers[number] = idx
        
        if duplicates:
            return jsonify({"error": f"Aynı takım numarası birden fazla kez kullanılamaz: {', '.join(set(duplicates))}"}), 400
        
        try:
            if datastore.get_active_event_id() is None:
                return jsonify({"error": "Aktif etkinlik bulunamadı. Önce etkinlik seçin."}), 400
            datastore.save_teams(data)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.post("/api/teams/seed")
    @require_login
    @require_event_manager
    def seed_teams():
        event_id = datastore.get_active_event_id()
        if event_id is None:
            return jsonify({"error": "Aktif etkinlik bulunamadı. Önce etkinlik oluşturun."}), 400
        teams = config.data.get("teams")
        if not isinstance(teams, list) or not teams:
            return jsonify({"error": "no teams in config"}), 400
        datastore.save_teams_for_event(event_id, teams)
        return jsonify({"ok": True, "event_id": event_id, "count": len(teams)})

    # --- KULLANICI YÖNETİMİ ---
    
    @app.get("/api/users")
    @require_login
    def list_users():
        """
        Kullanıcıları listeler.
        
        Query Parameters:
            include_password=1: Şifreleri de dahil et (varsayılan: false)
            
        Returns:
            JSON: Kullanıcı listesi
            [{"username": "...", "role": "...", "password": "..."}, ...]
        """
        include_password = request.args.get("include_password") == "1"
        return jsonify(datastore.list_users(include_password=include_password))

    @app.post("/api/users")
    @require_login
    @require_admin
    def create_user():
        """
        Yeni kullanıcı oluşturur.
        
        Request Body:
            {
                "username": "kullanici_adi",
                "password": "sifre",
                "role": "rol"
            }
            
        Returns:
            JSON: {"ok": true, "token": "login_token"}
        """
        data = request.get_json(force=True) or {}
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", "")).strip()
        role = str(data.get("role", "admin")).strip() or "admin"
        if not username or not password:
            return jsonify({"error": "missing fields"}), 400
        token = datastore.create_user(username, password, role)
        return jsonify({"ok": True, "token": token})

    @app.post("/api/users/delete")
    @require_login
    @require_admin
    def delete_user_post():
        try:
            data = request.get_json(force=True) or {}
            username = str(data.get("username", "")).strip()
            if not username:
                return jsonify({"error": "missing username"}), 400
            if username.lower() == "admin":
                return jsonify({"error": "Admin kullanıcısı silinemez"}), 403
            datastore.delete_user(username)
            if session.get("user") == username:
                session.clear()
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.post("/api/users/delete_all")
    @require_login
    @require_admin
    def delete_all_users_post():
        try:
            # Admin kullanıcısını koru
            datastore.delete_all_users(keep_admin=True)
            # Eğer admin kullanıcısı yoksa, yeniden oluştur
            users = datastore.list_users()
            admin_exists = any(u.get("username", "").lower() == "admin" for u in users)
            if not admin_exists:
                datastore.create_user("admin", "admin123", "admin")
            # Sadece admin değilse session'ı temizle
            if session.get("user", "").lower() != "admin":
                session.clear()
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.delete("/api/users")
    @require_login
    def delete_all_users():
        datastore.delete_all_users()
        session.clear()
        return jsonify({"ok": True})

    @app.delete("/api/users/<username>")
    @require_login
    def delete_user(username: str):
        datastore.delete_user(username)
        if session.get("user") == username:
            session.clear()
        return jsonify({"ok": True})

    @app.post("/api/users/defaults")
    @limiter.limit(RateLimitConstants.USER_DEFAULTS_LIMIT)
    @require_login
    @require_event_manager
    def create_default_users():
        """
        Varsayılan rol kullanıcılarını oluşturur.
        
        Etkinlik koduna göre önek eklenir (örn: "ISTA_etkinlik_yoneticisi").
        Mevcut kullanıcılar varsa şifreleri güncellenir.
        
        Returns:
            JSON: Oluşturulan kullanıcı listesi
            [{"username": "...", "password": "...", "token": "..."}, ...]
        """
        created = datastore.create_default_role_users()
        return jsonify(created)

    # ============================================================================
    # İNCELEME SLOTLARI API (Blueprint ile yönetiliyor)
    # ============================================================================
    
    # Inspection route'larını Blueprint'e kaydet
    from flask import Blueprint
    inspection_bp = Blueprint("inspection", __name__, url_prefix="/api")
    register_inspection_routes(inspection_bp, datastore, require_login, require_event_manager, socketio)
    app.register_blueprint(inspection_bp)

    # Practice Matches route'larını Blueprint'e kaydet
    practice_matches_bp = Blueprint("practice_matches", __name__, url_prefix="/api")
    register_practice_matches_routes(practice_matches_bp, datastore, require_login, require_event_manager)
    app.register_blueprint(practice_matches_bp)

    # Match Schedule route'larını Blueprint'e kaydet
    match_schedule_bp = Blueprint("match_schedule", __name__, url_prefix="/api")
    register_match_schedule_routes(match_schedule_bp, datastore, require_login, require_event_manager)
    app.register_blueprint(match_schedule_bp)

    # WiFi Kanal Atama route'larını Blueprint'e kaydet
    wifi_bp = Blueprint("wifi", __name__, url_prefix="/api")
    register_wifi_routes(wifi_bp, datastore, require_login, require_event_manager)
    app.register_blueprint(wifi_bp)

    # Arşiv yönetimi route'larını Blueprint'e kaydet
    archive_bp = Blueprint("archive", __name__, url_prefix="/api")
    register_archive_routes(archive_bp, datastore, require_login, require_event_manager, limiter)
    app.register_blueprint(archive_bp)
    
    # Maç Kontrol route'larını Blueprint'e kaydet
    match_control_bp = Blueprint("match_control", __name__, url_prefix="")
    register_match_control_routes(match_control_bp, datastore, require_login, require_event_manager, socketio)
    app.register_blueprint(match_control_bp)
    
    # Hakem Paneli route'larını Blueprint'e kaydet
    referee_panel_bp = Blueprint("referee_panel", __name__, url_prefix="")
    register_referee_panel_routes(referee_panel_bp, datastore, require_login, socketio)
    app.register_blueprint(referee_panel_bp)
    
    # Seyirci ekranları route'larını Blueprint'e kaydet
    screens_bp = Blueprint("screens", __name__, url_prefix="")
    register_screen_routes(screens_bp, datastore, require_login, require_event_manager, socketio)
    app.register_blueprint(screens_bp)

    # Sıralama sonuçları sayfası (blueprint'lerden sonra kayıt - 404 önlemek için)
    @app.route("/rankings", methods=["GET"])
    @require_login
    def rankings_page():
        """Sıralama maçları sonuçları sayfası. SP sıralaması ve tamamlanan maçlar listesi."""
        return render_template("rankings.html")

    @app.route("/ranking-details", methods=["GET"])
    @require_login
    def ranking_details_page():
        """SP eşitlik bozma kriterlerini detaylı gösteren sayfa."""
        return render_template("ranking_details.html")

    @app.route("/match-results-report", methods=["GET"])
    @require_login
    def match_results_report_page():
        """
        Maç sonuçları raporu sayfası.

        Tamamlanan maçların filtrelenmesi, CSV çıktısı ve yazdırma için UI sağlar.
        """
        return render_template("match_results_report.html")

    # Eski route'lar kaldırıldı - Blueprint kullanılıyor (routes/inspection.py, routes/practice_matches.py)

    @app.get("/api/users/qr")
    @require_login
    def get_user_qr_list():
        """
        Tüm kullanıcılar için QR kod oluşturur.
        
        QR kodlar LAN IP adresi ile oluşturulur, böylece aynı ağdaki
        cihazlar QR kod ile giriş yapabilir.
        
        Returns:
            JSON: QR kod listesi
            [{"username": "...", "role": "...", "url": "...", "qr": "data:image..."}, ...]
        """
        base_url = _get_lan_base_url(request)
        users = datastore.list_users()
        results = []
        for user in users:
            token = user.get("login_token")
            if not token:
                continue
            url = f"{base_url}/qr/{token}"
            qr = qrcode.QRCode(box_size=2, border=1)
            qr.add_data(url)
            qr.make(fit=True)
            img = qr.make_image(image_factory=SvgImage)
            svg_bytes = img.to_string()
            data_url = "data:image/svg+xml;base64," + base64.b64encode(
                svg_bytes
            ).decode("ascii")
            results.append({"username": user["username"], "role": user["role"], "url": url, "qr": data_url})
        return jsonify(results)

    # SocketIO instance'ını döndür (route modüllerinde kullanmak için)
    return app, socketio

# Flask CLI ve gunicorn için module-level değişkenler
application, socketio_instance = create_app()
app = application  # Flask CLI için alias

if __name__ == "__main__":
    """
    Flask uygulamasını çalıştırır.
    
    Ortam Kontrolü:
        - FLASK_ENV=development (varsayılan): Geliştirme modu, debug açık
        - FLASK_ENV=production: Üretim modu, debug kapalı
        
    Not: WebSocket desteği için Flask-SocketIO kullanılıyor.
    Üretim ortamında eventlet veya gunicorn ile eventlet worker kullanılmalıdır.
    
    Örnek kullanım:
        # Geliştirme
        python app_web.py
        
        # Üretim (eventlet ile)
        gunicorn -k eventlet -w 1 -b 0.0.0.0:5001 app_web:application
    """
    # Ortam tespiti
    flask_env = os.environ.get("FLASK_ENV", "development").lower()
    is_production = flask_env == "production"
    
    if is_production:
        # Üretim modunda direkt çalıştırmayı önle
        logger = logging.getLogger(__name__)
        logger.warning(
            "ÜRETİM MODU: Bu script doğrudan çalıştırılmamalı. "
            "Lütfen gunicorn ile gevent worker kullanın."
        )
        logger.info("Örnek: gunicorn -k geventwebsocket.gunicorn.workers.GeventWebSocketWorker -w 1 -b 0.0.0.0:5001 app_web:application")
        # Yine de çalıştır ama uyarı ver
        socketio_instance.run(application, host="0.0.0.0", port=5001, debug=False)
    else:
        # Geliştirme modu - aynı ağdaki diğer cihazlardan erişim için 0.0.0.0 kullan
        # NOT: Gevent modunda use_reloader=False olmalı (fork hatası önlenir)
        local_ip = _get_local_ip()
        logger = logging.getLogger(__name__)
        logger.info(f"Sunucu başlatılıyor...")
        logger.info(f"Yerel erişim: http://127.0.0.1:5001")
        if local_ip != "127.0.0.1":
            logger.info(f"Ağ erişimi: http://{local_ip}:5001")
        socketio_instance.run(application, host="0.0.0.0", port=5001, debug=True, use_reloader=False)

