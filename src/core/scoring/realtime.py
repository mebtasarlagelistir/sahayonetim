"""
Gerçek Zamanlı Puanlama Senkronizasyon Modülü

Bu modül WebSocket veya Server-Sent Events (SSE) kullanarak
gerçek zamanlı puanlama güncellemelerini yönetir.

Modüler yapı: Farklı real-time teknolojileri kolayca değiştirilebilir.

ÖNEMLİ: Skor ve SP hesaplamaları bu modülde tek bir yerde yapılır.
Bu sayede hesaplama mantığı değiştiğinde sadece burada güncelleme yapılır.

Robot hazırlık (team_statuses) senkron mantığı:
- Tek referans bu modüldeki _active_scores[match_key]["team_statuses"].
- Maç kontrol: update_team_statuses_only() ile tam state (red + blue) yazar.
- Hakem paneli: update_score(alliance, scoring_data) ile sadece kendi ittifakı
  birleştirilir; diğer ittifak korunur.
- Route'lar güncelleme sonrası "scores" event'i ile odadaki tüm client'lara
  gönderir; böylece her panel aynı state'i görür.
"""

from typing import Dict, Set, Callable, Optional
from datetime import datetime
import json
import logging
from .calculator import ScoreCalculator
from .ranking_points import RankingPointsCalculator

# Logger oluştur
logger = logging.getLogger(__name__)


class RealtimeScoreManager:
    """
    Gerçek zamanlı puanlama yöneticisi.
    
    Tüm bağlı cihazların (baş hakem, hakemler, tabletler) skorları
    senkronize tutar.
    """
    
    def __init__(self):
        """Yeni bir real-time yönetici oluşturur."""
        # Aktif maçlar için skor verileri
        # Format: {match_key: {"red": {...}, "blue": {...}, "last_updated": ..., "calculated_scores": {...}, "ranking_points": {...}}}
        self._active_scores: Dict[str, Dict] = {}
        
        # Bağlı istemciler (WebSocket bağlantıları veya SSE stream'leri)
        # Format: {match_key: Set[connection_id]}
        self._connected_clients: Dict[str, Set[str]] = {}
        
        # Güncelleme callback'leri
        self._update_callbacks: Dict[str, Callable] = {}
        
        # Skor hesaplayıcı (modüler yapı - tek bir instance)
        self._score_calculator = ScoreCalculator()
    
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
    
    def initialize_match(self, match_key: str) -> None:
        """
        Bir maç için skorları sıfırlar (yeni maç yüklendiğinde).
        
        Mevcut skorları temizler ve yeni bir sıfır durumundan başlatır.
        Bu metod 'Sıradaki Maçı Yükle' gibi işlemler için kullanılır.
        
        Args:
            match_key: Maç anahtarı (örn: "event_id_match_id")
        """
        # Eğer maç zaten kayıtlıysa, sil ve yeniden oluştur
        if match_key in self._active_scores:
            del self._active_scores[match_key]
            logger.info(f"Maç skorları temizlendi: {match_key}")
        
        # Maçı yeniden kaydet (temiz skor durumu ile)
        self.register_match(match_key)
        logger.info(f"Maç yeniden başlatıldı: {match_key}")
    
    def update_score(
        self,
        match_key: str,
        alliance: str,
        scoring_data: Dict,
        updated_by: Optional[str] = None
    ) -> None:
        """
        Bir ittifakın skorunu günceller, hesaplar ve tüm bağlı cihazlara bildirir.
        
        ÖNEMLİ: Skor hesaplaması burada tek bir yerde yapılır.
        Bu sayede hesaplama mantığı değiştiğinde sadece burada güncelleme yapılır.
        
        Args:
            match_key: Maç anahtarı
            alliance: "red" veya "blue"
            scoring_data: Puanlama verileri (team_statuses içerebilir)
            updated_by: Güncellemeyi yapan kullanıcı (opsiyonel)
        """
        if match_key not in self._active_scores:
            self.register_match(match_key)

        # Sunucu tarafı doğrulama: sayısal alanları sınırla (negatif veya
        # sınır-dışı değerler skoru bozmasın/şişirmesin). HTML min/max yalnızca
        # istemci tarafıdır; tahrif edilmiş/bozuk istekler buradan geçemez.
        scoring_data = self._sanitize_scoring_data(scoring_data)

        self._active_scores[match_key][alliance] = scoring_data
        self._active_scores[match_key]["last_updated"] = datetime.now().isoformat()
        self._active_scores[match_key]["updated_by"] = updated_by
        
        # team_statuses'i ayrı olarak sakla (match control için)
        if "team_statuses" in scoring_data and isinstance(scoring_data["team_statuses"], dict):
            if "team_statuses" not in self._active_scores[match_key]:
                self._active_scores[match_key]["team_statuses"] = {}
            # Mevcut team_statuses'i koru, sadece güncellenen ittifakı güncelle
            self._active_scores[match_key]["team_statuses"][alliance] = scoring_data["team_statuses"].get(alliance, {})
        
        # Skorları hesapla ve sakla (tek bir yerde - modüler yapı)
        self._calculate_and_store_scores(match_key)
        
        # Tüm bağlı cihazlara bildir
        self._broadcast_update(match_key, alliance, scoring_data)

    # Üst sınırı olan sayısal alanlar (config.py max_robots ile uyumlu).
    # leave_start_area/climb gibi robot-sınırlı alanlar en fazla 2 robot.
    _MAX_LIMITS = {
        "teleop_climb": 2,
    }

    def _sanitize_scoring_data(self, scoring_data: Dict) -> Dict:
        """
        Puanlama verisindeki üst-seviye sayısal alanları güvenli aralığa çeker.

        - Negatif sayılar 0'a sabitlenir.
        - Üst sınırı tanımlı alanlar (örn. teleop_climb) sınırına çekilir.
        - Boolean alanlar (kart/leave) ve dict/list/string alanlar (team_statuses,
          ranking_points vb.) olduğu gibi korunur.
        """
        if not isinstance(scoring_data, dict):
            return scoring_data
        sanitized = dict(scoring_data)
        for key, value in scoring_data.items():
            # bool, int'in alt sınıfıdır; kart/leave gibi boolean alanlara dokunma
            if isinstance(value, bool):
                continue
            if isinstance(value, (int, float)):
                v = value
                if v < 0:
                    v = 0
                limit = self._MAX_LIMITS.get(key)
                if limit is not None and v > limit:
                    v = limit
                sanitized[key] = v
        return sanitized

    def update_team_statuses_only(self, match_key: str, team_statuses: Dict) -> None:
        """
        Sadece robot hazırlık durumlarını günceller (maç kontrol veya hakem paneli senkronu).
        Red/blue skor verisini değiştirmez; sadece team_statuses birleştirilir.

        Args:
            match_key: Maç anahtarı
            team_statuses: { "red": { "r1": "ready", ... }, "blue": { ... } }
        """
        if match_key not in self._active_scores:
            self.register_match(match_key)
        if "team_statuses" not in self._active_scores[match_key]:
            self._active_scores[match_key]["team_statuses"] = {}
        for alliance, statuses in (team_statuses or {}).items():
            if isinstance(statuses, dict):
                self._active_scores[match_key]["team_statuses"][alliance] = dict(statuses)
        self._active_scores[match_key]["last_updated"] = datetime.now().isoformat()

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
        Bir maçın mevcut skorlarını döner (hesaplanmış skorlar dahil).
        
        Args:
            match_key: Maç anahtarı
        
        Returns:
            Dict: {
                "red": {...}, 
                "blue": {...}, 
                "last_updated": ...,
                "calculated_scores": {
                    "red": {"total_score": int, "breakdown": {...}},
                    "blue": {"total_score": int, "breakdown": {...}}
                },
                "ranking_points": {...} (varsa)
            } veya None
        """
        return self._active_scores.get(match_key)
    
    def _calculate_and_store_scores(self, match_key: str) -> None:
        """
        Bir maç için skorları hesaplar ve saklar.
        
        ÖNEMLİ: Tüm skor hesaplamaları burada tek bir yerde yapılır.
        Bu sayede hesaplama mantığı değiştiğinde sadece burada güncelleme yapılır.
        
        Args:
            match_key: Maç anahtarı
        """
        if match_key not in self._active_scores:
            return
        
        scores = self._active_scores[match_key]
        red_data = scores.get("red", {})
        blue_data = scores.get("blue", {})
        
        # Her iki ittifak için skorları hesapla
        # ÖNEMLİ: Rakip opponent aksiyonlarının hesaplanabilmesi için,
        # HER İKİ tarafın skorları HER ZAMAN hesaplanmalı (data boş olsa bile)
        calculated_scores = {}
        
        # Kırmızı skoru hesapla (mavi opponent aksiyonları dahil)
        red_result = self._score_calculator.calculate_alliance_score(
            alliance="red",
            scoring_data=red_data,
            opponent_scoring_data=blue_data
        )
        calculated_scores["red"] = red_result
        
        # Mavi skoru hesapla (kırmızı opponent aksiyonları dahil)
        blue_result = self._score_calculator.calculate_alliance_score(
            alliance="blue",
            scoring_data=blue_data,
            opponent_scoring_data=red_data
        )
        calculated_scores["blue"] = blue_result
        
        # Hesaplanmış skorları sakla
        self._active_scores[match_key]["calculated_scores"] = calculated_scores
    
    def calculate_and_store_ranking_points(
        self,
        match_key: str,
        match_type: str,
        red_alliance: list,
        blue_alliance: list
    ) -> Optional[Dict]:
        """
        Bir maç için Sıralama Puanlarını (SP) hesaplar ve saklar.
        
        ÖNEMLİ: SP hesaplaması burada tek bir yerde yapılır.
        Deneme maçları (practice) SP'ye etki etmez.
        
        Args:
            match_key: Maç anahtarı
            match_type: Maç tipi ("qualification", "practice", vb.)
            red_alliance: Kırmızı ittifak takımları listesi
            blue_alliance: Mavi ittifak takımları listesi
        
        Returns:
            Dict: SP hesaplama sonuçları veya None (eğer maç bulunamazsa)
        """
        if match_key not in self._active_scores:
            return None
        
        scores = self._active_scores[match_key]
        calculated_scores = scores.get("calculated_scores", {})
        
        # Hesaplanmış skorları al
        red_score = calculated_scores.get("red", {}).get("total_score", 0)
        blue_score = calculated_scores.get("blue", {}).get("total_score", 0)
        
        # Scoring data'yı al (SP hesaplaması için gerekli)
        scoring_data = {
            "red": scores.get("red", {}),
            "blue": scores.get("blue", {})
        }
        
        # SP hesapla
        sp_result = RankingPointsCalculator.calculate_ranking_points(
            match_type=match_type,
            red_score=red_score,
            blue_score=blue_score,
            scoring_data=scoring_data,
            red_alliance=red_alliance,
            blue_alliance=blue_alliance
        )
        
        # SP sonuçlarını sakla
        self._active_scores[match_key]["ranking_points"] = sp_result
        
        return sp_result
    
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
    
    def cleanup_all_matches(self, event_id: int) -> None:
        """
        Belirtilen etkinlik için tüm maç verilerini temizler.
        Reset-active işleminde kullanılır.
        
        Args:
            event_id: Etkinlik ID'si
        """
        # event_id ile başlayan tüm match_key'leri bul ve temizle
        keys_to_remove = [k for k in self._active_scores.keys() if k.startswith(f"{event_id}_")]
        for k in keys_to_remove:
            self.cleanup_match(k)
        
        if keys_to_remove:
            import logging
            logging.getLogger(__name__).info(f"Realtime veriler temizlendi: event_id={event_id}, temizlenen={keys_to_remove}")


# Global instance (her etkinlik için ayrı instance oluşturulabilir)
_realtime_manager = RealtimeScoreManager()


def get_realtime_manager() -> RealtimeScoreManager:
    """Global real-time yönetici instance'ını döner."""
    return _realtime_manager
