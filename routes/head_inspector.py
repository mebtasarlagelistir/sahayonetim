"""
Baş Robot Müfettişi Paneli Route'ları

Baş müfettişin (bas_mufettis) müfettiş hesaplarını görüntüleyip inceleme
slotlarına/takımlara atama yapabilmesi için sayfa ve API endpoint'lerini içerir.

Atama işlemi mevcut inceleme slot-update endpoint'leri üzerinden yapılır
(routes/inspection.py); bu modül yalnız panel sayfasını ve müfettiş hesap
listesini sağlar.
"""

from __future__ import annotations

from flask import render_template, jsonify
import logging

logger = logging.getLogger(__name__)


def register_head_inspector_routes(bp, datastore, require_login, require_roles):
    """
    Baş müfettiş paneli route'larını Blueprint'e kaydeder.

    Args:
        bp: Blueprint instance
        datastore: DataStore instance
        require_login: require_login decorator
        require_roles: require_roles decorator factory
    """

    @bp.get("/head-inspector")
    @require_login
    @require_roles("bas_mufettis")
    def head_inspector_page():
        """Baş müfettiş panelini render eder."""
        return render_template("head_inspector.html")

    @bp.get("/api/inspection/inspectors")
    @require_login
    @require_roles("bas_mufettis")
    def get_inspectors():
        """
        Aktif etkinliğin müfettiş hesaplarını (kullanıcı adı + şifre) döndürür.

        Baş müfettiş, kimlik bilgilerini dağıtabilmek ve slotlara atayabilmek
        için bu listeyi kullanır.

        Returns:
            JSON: [{"username": "...", "password": "...", "role": "..."}, ...]
        """
        users = datastore.list_users(include_password=True)
        inspectors = [
            {
                "username": u.get("username"),
                "password": u.get("password"),
                "role": u.get("role"),
            }
            for u in users
            if "mufettis" in (u.get("role") or "").lower()
        ]
        return jsonify(inspectors)
