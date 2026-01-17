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
- Seremoni: Setup sayfasına erişebilir, sadece Ödüller ve Yükselme Raporu görebilir

Bağımlılıklar:
- Flask: Web framework
- src.core.storage: Veritabanı işlemleri
- src.core.config: Yapılandırma yönetimi
"""

from pathlib import Path

from functools import wraps
from pathlib import Path
import base64
import secrets
import socket

from flask import Flask, jsonify, redirect, render_template, request, session, url_for
import qrcode
from qrcode.image.svg import SvgImage

from src.core.config import Config
from src.core.storage import DataStore
from decorators import create_decorators
from routes.inspection import register_inspection_routes
from routes.practice_matches import register_practice_matches_routes
from routes.match_schedule import register_match_schedule_routes


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
    app = Flask(
        __name__,
        template_folder=str(base_path / "templates"),
        static_folder=str(base_path / "static"),
    )
    # Geliştirme modunda template'lerin otomatik yeniden yüklenmesi
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    app.jinja_env.auto_reload = True
    app.secret_key = _load_secret_key(base_path)
    datastore = DataStore(base_path=base_path)
    datastore.migrate_from_config(config.data)

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
        - Admin ve etkinlik_yoneticisi: setup sayfasına
        - Diğerleri: bir bilgilendirme sayfasına (şimdilik setup sayfası ama görüntüleme modu)
        """
        username = session.get("user")
        if not username:
            return redirect(url_for("login"))
        
        role = datastore.get_user_role(username)
        if not role:
            return redirect(url_for("login"))
        
        role_lower = role.lower()
        # Admin ve etkinlik yöneticisi setup sayfasına erişebilir
        if role_lower == "admin" or "etkinlik_yoneticisi" in role_lower or "yonetici" in role_lower:
            return redirect(url_for("setup"))
        
        # Diğer kullanıcılar için şimdilik bir bilgilendirme mesajı göster
        # (Gelecekte başka bir sayfa olabilir)
        return render_template("setup.html")  # Frontend'de görüntüleme modu aktif olacak

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
            "wifi": "step_wifi.html",
            "pit-map": "step_pit_map.html",
            "awards": "step_awards.html",
            "advancement": "step_advancement.html",
            "send-results": "step_send_results.html",
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

    @app.get("/api/event")
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
            datastore.save_event(data)
            return jsonify({"ok": True})
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
            datastore.save_teams(data)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.post("/api/teams/seed")
    @require_login
    def seed_teams():
        target_event_name = "Istanbul ve Su 1"
        event_id = datastore.get_event_id_by_name(target_event_name)
        if event_id is None:
            event_data = config.data.get("event") if isinstance(config.data, dict) else None
            event_id = datastore.create_event(target_event_name, event_data)
        teams = config.data.get("teams")
        if not isinstance(teams, list) or not teams:
            return jsonify({"error": "no teams in config"}), 400
        datastore.save_teams_for_event(event_id, teams)
        datastore.set_active_event(event_id)
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
    register_inspection_routes(inspection_bp, datastore, require_login, require_event_manager)
    app.register_blueprint(inspection_bp)

    # Practice Matches route'larını Blueprint'e kaydet
    practice_matches_bp = Blueprint("practice_matches", __name__, url_prefix="/api")
    register_practice_matches_routes(practice_matches_bp, datastore, require_login, require_event_manager)
    app.register_blueprint(practice_matches_bp)

    # Match Schedule route'larını Blueprint'e kaydet
    match_schedule_bp = Blueprint("match_schedule", __name__, url_prefix="/api")
    register_match_schedule_routes(match_schedule_bp, datastore, require_login, require_event_manager)
    app.register_blueprint(match_schedule_bp)

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

    return app


if __name__ == "__main__":
    application = create_app()
    application.run(host="127.0.0.1", port=5000, debug=False)
