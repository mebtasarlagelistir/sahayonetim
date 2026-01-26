"""
Gerçek Zamanlı Puanlama Senkronizasyon Modülü

Bu modül WebSocket veya Server-Sent Events (SSE) kullanarak
gerçek zamanlı puanlama güncellemelerini yönetir.

Modüler yapı: Farklı real-time teknolojileri kolayca değiştirilebilir.
"""

from typing import Dict, Set, Callable, Optional
from datetime import datetime
import json


class RealtimeScoreManager:
    """
    Gerçek zamanlı puanlama yöneticisi.
    
    Tüm bağlı cihazların (baş hakem, hakemler, tabletler) skorları
    senkronize tutar.
    """
    
    def __init__(self):
        """Yeni bir real-time yönetici oluşturur."""
        # Aktif maçlar için skor verileri
        # Format: {match_key: {"red": {...}, "blue": {...}, "last_updated": ...}}
        self._active_scores: Dict[str, Dict] = {}
        
        # Bağlı istemciler (WebSocket bağlantıları veya SSE stream'leri)
        # Format: {match_key: Set[connection_id]}
        self._connected_clients: Dict[str, Set[str]] = {}
        
        # Güncelleme callback'leri
        self._update_callbacks: Dict[str, Callable] = {}
    
    def register_match(self, match_key: str) -> None:
        """
        Bir maçı gerçek zamanlı takibe alır.
        
        Args:
            match_key: Maç anahtarı (örn: "event_id_match_id")
        """
        if match_key not in self._active_scores:
            self._active_scores[match_key] = {
                "red": {},
                "blue": {},
                "referee_meta": {
                    "red": {
                        "submitted": False,
                        "submitted_at": None,
                        "submitted_by": None,
                        "last_updated": None,
                    },
                    "blue": {
                        "submitted": False,
                        "submitted_at": None,
                        "submitted_by": None,
                        "last_updated": None,
                    },
                    "head": {
                        "approved": False,
                        "approved_at": None,
                        "approved_by": None,
                        "last_updated": None,
                    },
                },
                "last_updated": datetime.now().isoformat(),
                "updated_by": None
            }
            self._connected_clients[match_key] = set()
    
    def update_score(
        self,
        match_key: str,
        alliance: str,
        scoring_data: Dict,
        updated_by: Optional[str] = None
    ) -> None:
        """
        Bir ittifakın skorunu günceller ve tüm bağlı cihazlara bildirir.
        
        Args:
            match_key: Maç anahtarı
            alliance: "red" veya "blue"
            scoring_data: Puanlama verileri (team_statuses içerebilir)
            updated_by: Güncellemeyi yapan kullanıcı (opsiyonel)
        """
        if match_key not in self._active_scores:
            self.register_match(match_key)
        
        self._active_scores[match_key][alliance] = scoring_data
        self._active_scores[match_key]["last_updated"] = datetime.now().isoformat()
        self._active_scores[match_key]["updated_by"] = updated_by
        
        # team_statuses'i ayrı olarak sakla (match control için)
        if "team_statuses" in scoring_data and isinstance(scoring_data["team_statuses"], dict):
            if "team_statuses" not in self._active_scores[match_key]:
                self._active_scores[match_key]["team_statuses"] = {}
            # Mevcut team_statuses'i koru, sadece güncellenen ittifakı güncelle
            self._active_scores[match_key]["team_statuses"][alliance] = scoring_data["team_statuses"].get(alliance, {})
        
        # Tüm bağlı cihazlara bildir
        self._broadcast_update(match_key, alliance, scoring_data)

    def update_referee_meta(self, match_key: str, meta_updates: Dict) -> None:
        """
        Hakem meta bilgilerini günceller ve zaman damgasını yeniler.

        Args:
            match_key: Maç anahtarı
            meta_updates: refere_meta alt sözlüğüne yazılacak güncellemeler
        """
        if match_key not in self._active_scores:
            self.register_match(match_key)

        current_meta = self._active_scores[match_key].get("referee_meta") or {}
        for key, value in meta_updates.items():
            if isinstance(value, dict) and isinstance(current_meta.get(key), dict):
                current_meta[key] = {**current_meta.get(key, {}), **value}
            else:
                current_meta[key] = value

        self._active_scores[match_key]["referee_meta"] = current_meta
        self._active_scores[match_key]["last_updated"] = datetime.now().isoformat()
    
    def get_current_scores(self, match_key: str) -> Optional[Dict]:
        """
        Bir maçın mevcut skorlarını döner.
        
        Args:
            match_key: Maç anahtarı
        
        Returns:
            Dict: {"red": {...}, "blue": {...}, "last_updated": ...} veya None
        """
        return self._active_scores.get(match_key)
    
    def connect_client(self, match_key: str, client_id: str) -> None:
        """
        Bir istemciyi maça bağlar.
        
        Args:
            match_key: Maç anahtarı
            client_id: İstemci kimliği
        """
        if match_key not in self._connected_clients:
            self._connected_clients[match_key] = set()
        self._connected_clients[match_key].add(client_id)
    
    def disconnect_client(self, match_key: str, client_id: str) -> None:
        """
        Bir istemciyi maçtan ayırır.
        
        Args:
            match_key: Maç anahtarı
            client_id: İstemci kimliği
        """
        if match_key in self._connected_clients:
            self._connected_clients[match_key].discard(client_id)
    
    def _broadcast_update(
        self,
        match_key: str,
        alliance: str,
        scoring_data: Dict
    ) -> None:
        """
        Skor güncellemesini tüm bağlı cihazlara yayınlar.
        
        Args:
            match_key: Maç anahtarı
            alliance: Güncellenen ittifak
            scoring_data: Yeni puanlama verileri
        """
        # Bu metod WebSocket veya SSE implementasyonunda override edilebilir
        if match_key in self._update_callbacks:
            callback = self._update_callbacks[match_key]
            callback(match_key, alliance, scoring_data)
    
    def register_update_callback(
        self,
        match_key: str,
        callback: Callable
    ) -> None:
        """
        Bir maç için güncelleme callback'i kaydeder.
        
        Args:
            match_key: Maç anahtarı
            callback: Güncelleme callback fonksiyonu
        """
        self._update_callbacks[match_key] = callback
    
    def cleanup_match(self, match_key: str) -> None:
        """
        Bir maçın gerçek zamanlı takibini sonlandırır.
        
        Args:
            match_key: Maç anahtarı
        """
        if match_key in self._active_scores:
            del self._active_scores[match_key]
        if match_key in self._connected_clients:
            del self._connected_clients[match_key]
        if match_key in self._update_callbacks:
            del self._update_callbacks[match_key]


# Global instance (her etkinlik için ayrı instance oluşturulabilir)
_realtime_manager = RealtimeScoreManager()


def get_realtime_manager() -> RealtimeScoreManager:
    """Global real-time yönetici instance'ını döner."""
    return _realtime_manager
