"""
Decorator'lar - Kimlik doğrulama ve yetkilendirme

Bu modül Flask route'ları için decorator'ları içerir.
Decorator'lar factory function olarak tanımlanmıştır,
böylece datastore ve session'a erişebilirler.
"""

from functools import wraps
from flask import jsonify, redirect, request, session, url_for


def create_decorators(datastore):
    """
    Decorator factory fonksiyonu.
    
    Args:
        datastore: DataStore instance
        
    Returns:
        dict: Decorator fonksiyonları (require_login, require_admin, require_event_manager)
    """
    
    def require_login(handler):
        """
        Decorator: Korumalı route'lar için kimlik doğrulama.
        
        Kullanıcı giriş yapmamışsa:
        - API endpoint'leri için 401 Unauthorized döner
        - Diğer route'lar için login sayfasına yönlendirir
        
        Kullanım:
            @app.get("/protected")
            @require_login
            def protected_route():
                return "Bu sayfa korumalı"
        """
        @wraps(handler)
        def wrapper(*args, **kwargs):
            if not session.get("user"):
                if request.path.startswith("/api/"):
                    return jsonify({"error": "unauthorized"}), 401
                return redirect(url_for("login"))
            return handler(*args, **kwargs)

        return wrapper
    
    def require_admin(handler):
        """
        Decorator: Sadece admin kullanıcıları için erişim kontrolü.
        
        Admin olmayan kullanıcılar için 403 Forbidden döner.
        
        Kullanım:
            @app.post("/api/admin-only")
            @require_login
            @require_admin
            def admin_route():
                return jsonify({"ok": True})
        """
        @wraps(handler)
        def wrapper(*args, **kwargs):
            username = session.get("user")
            if not username:
                if request.path.startswith("/api/"):
                    return jsonify({"error": "unauthorized"}), 401
                return redirect(url_for("login"))
            
            role = datastore.get_user_role(username)
            if role and role.lower() != "admin":
                if request.path.startswith("/api/"):
                    return jsonify({"error": "forbidden", "message": "Bu işlem için admin yetkisi gereklidir"}), 403
                return redirect(url_for("setup"))
            
            return handler(*args, **kwargs)
        
        return wrapper
    
    def require_event_manager(handler):
        """
        Decorator: Admin veya etkinlik yöneticisi için erişim kontrolü.
        
        Admin veya etkinlik yöneticisi olmayan kullanıcılar için 403 Forbidden döner.
        Etkinlik yöneticisi sadece kendi etkinliğine erişebilir.
        
        Kullanım:
            @app.post("/api/event-manager-only")
            @require_login
            @require_event_manager
            def event_manager_route():
                return jsonify({"ok": True})
        """
        @wraps(handler)
        def wrapper(*args, **kwargs):
            username = session.get("user")
            if not username:
                if request.path.startswith("/api/"):
                    return jsonify({"error": "unauthorized"}), 401
                return redirect(url_for("login"))
            
            role = datastore.get_user_role(username)
            if not role:
                if request.path.startswith("/api/"):
                    return jsonify({"error": "unauthorized"}), 401
                return redirect(url_for("login"))
            
            role_lower = role.lower()
            # Admin her şeye erişebilir
            if role_lower == "admin":
                return handler(*args, **kwargs)
            
            # Müfettiş/hakem/saha yöneticisi kontrolü (inceleme ve maç işlemleri için)
            if "mufettis" in role_lower or "inspector" in role_lower or "hakem" in role_lower or "saha_yoneticisi" in role_lower:
                # Bu roller kendi etkinliklerine erişebilir
                user_event_id = datastore.get_user_event_id(username)
                active_event_id = datastore.get_active_event_id()
                
                if user_event_id is not None and active_event_id is not None:
                    if user_event_id != active_event_id:
                        if request.path.startswith("/api/"):
                            return jsonify({"error": "forbidden", "message": "Bu etkinliğe erişim yetkiniz yok"}), 403
                        return redirect(url_for("setup"))
                
                return handler(*args, **kwargs)
            
            # Etkinlik yöneticisi kontrolü
            if "etkinlik_yoneticisi" in role_lower or "yonetici" in role_lower:
                # Etkinlik yöneticisi sadece kendi etkinliğine erişebilir
                user_event_id = datastore.get_user_event_id(username)
                active_event_id = datastore.get_active_event_id()
                
                if user_event_id is not None and active_event_id is not None:
                    if user_event_id != active_event_id:
                        if request.path.startswith("/api/"):
                            return jsonify({"error": "forbidden", "message": "Bu etkinliğe erişim yetkiniz yok"}), 403
                        return redirect(url_for("setup"))
                
                return handler(*args, **kwargs)
            
            # Diğer roller erişemez
            if request.path.startswith("/api/"):
                return jsonify({"error": "forbidden", "message": "Bu işlem için yetkiniz yok"}), 403
            # Setup sayfasına erişim denemesi - login sayfasına yönlendir
            return redirect(url_for("login"))

        return wrapper

    def home_for_role(role: str | None) -> str:
        """
        Bir rolün varsayılan iniş sayfası yolunu döndürür.

        Yetkisiz bir sayfaya erişmeye çalışan kullanıcı, login yerine kendi
        ana sayfasına yönlendirilir. app_web.py index rol-yönlendirmesiyle hizalı.
        """
        role_lower = (role or "").lower()
        if role_lower == "admin" or "etkinlik_yoneticisi" in role_lower or "yonetici" in role_lower:
            return "/setup"
        if "bas_mufettis" in role_lower:
            return "/head-inspector"
        if "mufettis" in role_lower or "inspector" in role_lower:
            return "/inspection-progress"
        if "juri_danismani" in role_lower or "juri_danışmanı" in role_lower:
            return "/judge-advisor"
        if "juri" in role_lower or "jüri" in role_lower:
            return "/judging-progress"
        if "bas_hakem" in role_lower:
            return "/head-referee"
        if "hakem" in role_lower:
            return "/referee-panel"
        if "seremoni" in role_lower:
            return "/award-assignment"
        if "pit" in role_lower:
            return "/pit-admin"
        return "/setup"

    def require_roles(*allowed_substrings):
        """
        Decorator factory: Belirli rollere (alt-string eşleşmesiyle) erişim verir.

        Admin ve etkinlik yöneticisi her zaman geçer. allowed_substrings içindeki
        herhangi biri kullanıcının rolünde geçiyorsa erişim verilir (aynı-etkinlik
        kontrolüyle). Aksi halde API → 403 JSON, sayfa → rolün ana sayfasına redirect.

        Kullanım:
            @app.get("/head-inspector")
            @require_login
            @require_roles("bas_mufettis")
            def head_inspector_page(): ...
        """
        def decorator(handler):
            @wraps(handler)
            def wrapper(*args, **kwargs):
                username = session.get("user")
                if not username:
                    if request.path.startswith("/api/"):
                        return jsonify({"error": "unauthorized"}), 401
                    return redirect(url_for("login"))

                role = datastore.get_user_role(username)
                role_lower = (role or "").lower()

                # Admin ve etkinlik yöneticisi her şeye erişir
                privileged = (
                    role_lower == "admin"
                    or "etkinlik_yoneticisi" in role_lower
                    or "yonetici" in role_lower
                )
                allowed = privileged or any(sub in role_lower for sub in allowed_substrings)

                if not allowed:
                    if request.path.startswith("/api/"):
                        return jsonify({"error": "forbidden", "message": "Bu işlem için yetkiniz yok"}), 403
                    return redirect(home_for_role(role))

                # Yetkili roller için aynı-etkinlik kontrolü (admin hariç)
                if not privileged or "etkinlik_yoneticisi" in role_lower or "yonetici" in role_lower:
                    if role_lower != "admin":
                        user_event_id = datastore.get_user_event_id(username)
                        active_event_id = datastore.get_active_event_id()
                        if user_event_id is not None and active_event_id is not None:
                            if user_event_id != active_event_id:
                                if request.path.startswith("/api/"):
                                    return jsonify({"error": "forbidden", "message": "Bu etkinliğe erişim yetkiniz yok"}), 403
                                return redirect(home_for_role(role))

                return handler(*args, **kwargs)

            return wrapper

        return decorator

    return {
        "require_login": require_login,
        "require_admin": require_admin,
        "require_event_manager": require_event_manager,
        "require_roles": require_roles,
        "home_for_role": home_for_role,
    }
