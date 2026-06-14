"""
Merkezi Maç Durumu Yönetim Modülü

Bu modül tüm maç durumlarını merkezi olarak yönetir ve gerçek zamanlı
senkronizasyon sağlar. Veritabanı + memory cache kombinasyonu kullanır.

Modüler yapı: İleride Redis veya başka bir distributed cache'e
kolayca geçilebilir.
"""

from typing import Dict, Optional, Any
from datetime import datetime
import logging
import threading
import copy

logger = logging.getLogger(__name__)


class MatchStateManager:
    """
    Merkezi maç durumu yöneticisi.
    
    Özellikler:
    - Veritabanı tabanlı kalıcılık (sunucu yeniden başlatıldığında korunur)
    - Memory cache (hızlı erişim)
    - Gerçek zamanlı güncelleme yayınlama
    - Preview ve aktif maç durumlarını yönetir
    """
    
    def __init__(self, datastore):
        """
        MatchStateManager oluşturur.
        
        Args:
            datastore: DataStore instance (veritabanı erişimi için)
        """
        self.datastore = datastore
        # RLock kullan (read-write lock) - read-heavy işlemler için daha iyi
        self._lock = threading.RLock()
        
        # Memory cache: {event_id: {match_key: match_state}}
        self._match_cache: Dict[int, Dict[str, Dict[str, Any]]] = {}
        
        # NOT: SSE client tracking kaldırıldı (WebSocket kullanılıyor)
        # WebSocket için room-based tracking kullanılıyor (routes/match_control.py ve routes/screens.py'de)
        
        # Güncelleme callback'leri: {match_key: list(callbacks)}
        self._update_callbacks: Dict[str, list] = {}
    
    def get_active_match(self, event_id: int) -> Optional[Dict[str, Any]]:
        """
        Aktif maçı döner (önce in_progress, sonra preview).
        
        Lock süresini minimize etmek için önce cache'i kopyala, sonra işle.
        
        Args:
            event_id: Etkinlik ID'si
            
        Returns:
            Dict: Maç bilgisi veya None
        """
        # Lock süresini minimize et - sadece cache okuma için
        with self._lock:
            cache_snapshot = None
            if event_id in self._match_cache:
                # Cache'i kopyala (lock dışında işlemek için)
                cache_snapshot = copy.deepcopy(self._match_cache[event_id])
        
        # Lock dışında işle (performans için)
        if cache_snapshot:
            # Önce in_progress maçları kontrol et
            for match_key, match_state in cache_snapshot.items():
                status = match_state.get("status")
                if status == "in_progress":
                    return self._build_match_response(event_id, match_key, match_state)
            
            # Preview durumunu kontrol et
            for match_key, match_state in cache_snapshot.items():
                if match_state.get("status") == "preview":
                    return self._build_match_response(event_id, match_key, match_state)
        
        # Cache'de yoksa veritabanından yükle
        return self._load_from_database(event_id)
    
    def set_match_preview(
        self,
        event_id: int,
        match_id: int,
        match_source: str,
        match_data: Dict[str, Any]
    ) -> None:
        """
        Maçı preview durumuna alır (hakem sayfalarında görünür).
        
        Args:
            event_id: Etkinlik ID'si
            match_id: Maç ID'si
            match_source: "schedule" veya "practice"
            match_data: Maç verisi
        """
        match_key = self._build_match_key(event_id, match_id, match_source)
        
        with self._lock:
            if event_id not in self._match_cache:
                self._match_cache[event_id] = {}
            
            # Önceki preview durumundaki maçları temizle (sadece preview olanları)
            # Ama in_progress maçları koru
            for key in list(self._match_cache[event_id].keys()):
                if key != match_key and self._match_cache[event_id][key].get("status") == "preview":
                    del self._match_cache[event_id][key]
            
            self._match_cache[event_id][match_key] = {
                "match_id": match_id,
                "match_source": match_source,
                "status": "preview",
                "match_data": match_data,
                "state": "idle",
                "time_remaining": 0,
                "started_at": None,
                "updated_at": datetime.now().isoformat(),
            }
            
            logger.info(f"MatchStateManager.set_match_preview: Preview maç cache'e eklendi - match_key={match_key}, match_id={match_id}, match_number={match_data.get('match_number')}")
            # Veritabanına kaydet (opsiyonel - sadece preview için gerekli değil)
            # Preview durumu geçici olduğu için sadece memory'de tutulur
        
        self._broadcast_update(event_id, match_key, "preview")
        logger.info(f"Maç preview durumuna alındı: event_id={event_id}, match_id={match_id}, match_source={match_source}, match_number={match_data.get('match_number')}")
    
    def set_match_active(
        self,
        event_id: int,
        match_id: int,
        match_source: str,
        match_data: Dict[str, Any],
        initial_state: str = "autonomous"
    ) -> None:
        """
        Maçı aktif duruma alır ve veritabanına kaydeder.
        
        Args:
            event_id: Etkinlik ID'si
            match_id: Maç ID'si
            match_source: "schedule" veya "practice"
            match_data: Maç verisi
            initial_state: Başlangıç durumu (varsayılan: "autonomous")
        """
        match_key = self._build_match_key(event_id, match_id, match_source)
        
        # Veritabanında status'ü güncelle
        if match_source == "practice":
            self.datastore.update_practice_match(match_id=match_id, status="in_progress")
        else:
            self.datastore.update_match(match_id=match_id, status="in_progress")
        
        with self._lock:
            if event_id not in self._match_cache:
                self._match_cache[event_id] = {}
            
            # Önceki preview durumunu temizle
            for key in list(self._match_cache[event_id].keys()):
                if key != match_key and self._match_cache[event_id][key].get("status") == "preview":
                    del self._match_cache[event_id][key]
            
            # Aktif maçı cache'e ekle
            from src.core.constants import MatchConstants
            MATCH_TIMINGS = {
                "autonomous": MatchConstants.AUTONOMOUS_DURATION,
                "prepare_teleop": MatchConstants.PREPARE_TELEOP_DURATION,
                "driver_controlled": MatchConstants.DRIVER_CONTROLLED_DURATION,
                "end_game": MatchConstants.END_GAME_DURATION,
                "post_match": MatchConstants.POST_MATCH_DURATION,
            }
            
            self._match_cache[event_id][match_key] = {
                "match_id": match_id,
                "match_source": match_source,
                "status": "in_progress",
                "match_data": match_data,
                "state": initial_state,
                "time_remaining": MATCH_TIMINGS.get(initial_state, 0),
                "started_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
            }
        
        self._broadcast_update(event_id, match_key, "active")
        logger.info(f"Maç aktif duruma alındı: event_id={event_id}, match_id={match_id}, match_source={match_source}, state={initial_state}")
    
    def update_match_state(
        self,
        event_id: int,
        match_id: int,
        match_source: str,
        state: str,
        time_remaining: Optional[int] = None
    ) -> None:
        """
        Maç durumunu günceller (autonomous, prepare_teleop, vb.).
        
        Args:
            event_id: Etkinlik ID'si
            match_id: Maç ID'si
            match_source: "schedule" veya "practice"
            state: Yeni durum
            time_remaining: Kalan süre (None ise otomatik hesaplanır)
        """
        match_key = self._build_match_key(event_id, match_id, match_source)
        
        with self._lock:
            if event_id not in self._match_cache or match_key not in self._match_cache[event_id]:
                logger.warning(f"Match state update: Maç cache'de bulunamadı - {match_key}")
                return
            
            match_state = self._match_cache[event_id][match_key]
            
            from src.core.constants import MatchConstants
            MATCH_TIMINGS = {
                "autonomous": MatchConstants.AUTONOMOUS_DURATION,
                "prepare_teleop": MatchConstants.PREPARE_TELEOP_DURATION,
                "driver_controlled": MatchConstants.DRIVER_CONTROLLED_DURATION,
                "end_game": MatchConstants.END_GAME_DURATION,
                "post_match": MatchConstants.POST_MATCH_DURATION,
            }
            
            match_state["state"] = state
            match_state["time_remaining"] = time_remaining if time_remaining is not None else MATCH_TIMINGS.get(state, 0)
            match_state["started_at"] = datetime.now().isoformat()
            match_state["updated_at"] = datetime.now().isoformat()
        
        self._broadcast_update(event_id, match_key, "state_update")
        logger.info(f"Maç durumu güncellendi: {match_key}, state={state}, time_remaining={match_state.get('time_remaining')}")
    
    def complete_match(
        self,
        event_id: int,
        match_id: int,
        match_source: str
    ) -> None:
        """
        Maçı tamamlanmış olarak işaretler ve cache'den kaldırır (aktif maç olmaktan çıkar).
        
        Args:
            event_id: Etkinlik ID'si
            match_id: Maç ID'si
            match_source: "schedule" veya "practice"
        """
        match_key = self._build_match_key(event_id, match_id, match_source)
        
        # Veritabanında status'ü güncelle (bu zaten routes/match_control.py'de yapılıyor)
        # Burada sadece cache'den kaldırıyoruz
        
        with self._lock:
            # Cache'den maç durumunu kaldır (aktif maç olmaktan çıkar)
            if event_id in self._match_cache and match_key in self._match_cache[event_id]:
                del self._match_cache[event_id][match_key]
                # Eğer event için başka maç yoksa, event'i de kaldır
                if not self._match_cache[event_id]:
                    del self._match_cache[event_id]
        
        self._broadcast_update(event_id, match_key, "completed")
        logger.info(f"Maç tamamlandı ve cache'den kaldırıldı: event_id={event_id}, match_id={match_id}, match_source={match_source}")
    
    def stop_match(
        self,
        event_id: int,
        match_id: int,
        match_source: str
    ) -> None:
        """
        Maçı durdurur (scheduled durumuna geri döner).
        
        Args:
            event_id: Etkinlik ID'si
            match_id: Maç ID'si
            match_source: "schedule" veya "practice"
        """
        match_key = self._build_match_key(event_id, match_id, match_source)
        
        # Veritabanında status'ü güncelle
        if match_source == "practice":
            self.datastore.update_practice_match(match_id=match_id, status="scheduled")
        else:
            self.datastore.update_match(match_id=match_id, status="scheduled")
        
        with self._lock:
            # Cache'den maç durumunu kaldır (aktif maç olmaktan çıkar)
            if event_id in self._match_cache and match_key in self._match_cache[event_id]:
                del self._match_cache[event_id][match_key]
                # Eğer event için başka maç yoksa, event'i de kaldır
                if not self._match_cache[event_id]:
                    del self._match_cache[event_id]
        
        self._broadcast_update(event_id, match_key, "stopped")
        logger.info(f"Maç durduruldu: event_id={event_id}, match_id={match_id}, match_source={match_source}")
    
    def clear_all_matches(self, event_id: int) -> None:
        """
        Belirtilen etkinlik için tüm maç cache'ini temizler (preview dahil).
        Reset-active işleminde kullanılır.
        
        Args:
            event_id: Etkinlik ID'si
        """
        with self._lock:
            if event_id in self._match_cache:
                match_keys = list(self._match_cache[event_id].keys())
                del self._match_cache[event_id]
                logger.info(f"Tüm maç cache'i temizlendi: event_id={event_id}, temizlenen_maclar={match_keys}")
            else:
                logger.info(f"Temizlenecek maç cache'i yok: event_id={event_id}")
    
    # SSE client tracking metodları kaldırıldı (WebSocket kullanılıyor)
    # WebSocket için room-based tracking kullanılıyor (routes/match_control.py ve routes/screens.py'de)
    # 
    # Eski SSE metodları (kaldırıldı):
    # - register_sse_client() - KALDIRILDI
    # - unregister_sse_client() - KALDIRILDI
    # - _sse_clients dict - KALDIRILDI
    
    def register_update_callback(self, match_key: str, callback: callable) -> None:
        """
        Güncelleme callback'i kaydeder.
        
        Args:
            match_key: Maç anahtarı
            callback: Callback fonksiyonu (event_id, match_key, update_type, match_state)
        """
        with self._lock:
            if match_key not in self._update_callbacks:
                self._update_callbacks[match_key] = []
            self._update_callbacks[match_key].append(callback)
    
    def _load_from_database(self, event_id: int) -> Optional[Dict[str, Any]]:
        """
        Veritabanından aktif maçı yükler.
        
        Args:
            event_id: Etkinlik ID'si
            
        Returns:
            Dict: Maç bilgisi veya None
        """
        # Önce in_progress maçları kontrol et
        matches = self.datastore.get_match_schedule(
            event_id=event_id,
            status="in_progress"
        )
        match_source = "schedule"
        
        if not matches:
            matches = self.datastore.get_practice_matches(
                event_id=event_id,
                status="in_progress"
            )
            match_source = "practice" if matches else "schedule"
        
        if matches:
            match = matches[0]
            match_key = self._build_match_key(event_id, match["id"], match_source)
            
            # Cache'e ekle
            with self._lock:
                if event_id not in self._match_cache:
                    self._match_cache[event_id] = {}
                
                self._match_cache[event_id][match_key] = {
                    "match_id": match["id"],
                    "match_source": match_source,
                    "status": "in_progress",
                    "match_data": match,
                    "state": "autonomous",  # Varsayılan
                    "time_remaining": 0,
                    "started_at": None,
                    "updated_at": datetime.now().isoformat(),
                }
            
            return self._build_match_response(event_id, match_key, self._match_cache[event_id][match_key])
        
        return None
    
    def _build_match_key(self, event_id: int, match_id: int, match_source: str) -> str:
        """Maç anahtarı oluşturur."""
        return f"{event_id}_{match_source}_{match_id}"
    
    def _build_match_response(
        self,
        event_id: int,
        match_key: str,
        match_state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        API response için maç bilgisini oluşturur.
        
        Args:
            event_id: Etkinlik ID'si
            match_key: Maç anahtarı
            match_state: Maç durumu
            
        Returns:
            Dict: API response formatında maç bilgisi
        """
        match_data = match_state.get("match_data", {})
        
        try:
            from src.core.constants import MatchConstants
            state_label = MatchConstants.MATCH_STATES.get(match_state.get("state", "idle"), "Beklemede")
        except ImportError:
            state_label = "Beklemede"
        response = {
            "id": match_state.get("match_id"),
            "match_number": match_data.get("match_number"),
            "match_type": match_data.get("match_type"),
            "field_number": match_data.get("field_number"),
            "red_alliance": match_data.get("red_alliance", []),
            "blue_alliance": match_data.get("blue_alliance", []),
            "red_score": match_data.get("red_score", 0),
            "blue_score": match_data.get("blue_score", 0),
            "status": match_state.get("status"),
            "match_source": match_state.get("match_source"),
            "current_state": match_state.get("state", "idle"),
            "state_label": state_label,
            "time_remaining": match_state.get("time_remaining", 0),
            "started_at": match_state.get("started_at"),
            "is_preview": match_state.get("status") == "preview",
        }
        
        return response
    
    def _broadcast_update(
        self,
        event_id: int,
        match_key: str,
        update_type: str
    ) -> None:
        """
        Güncellemeyi tüm bağlı istemcilere yayınlar.
        
        Args:
            event_id: Etkinlik ID'si
            match_key: Maç anahtarı
            update_type: Güncelleme tipi ("preview", "active", "state_update", "completed")
        """
        # Callback'leri çağır
        if match_key in self._update_callbacks:
            match_state = None
            with self._lock:
                if event_id in self._match_cache and match_key in self._match_cache[event_id]:
                    match_state = self._match_cache[event_id][match_key]
            
            if match_state:
                for callback in self._update_callbacks[match_key]:
                    try:
                        callback(event_id, match_key, update_type, match_state)
                    except Exception as e:
                        logger.error(f"Update callback hatası: {str(e)}", exc_info=True)
    
    def refresh_match_state(self, event_id: int, match_key: str) -> Optional[Dict[str, Any]]:
        """
        Maç durumunu yeniler (timer güncellemesi için).
        
        Lock süresini minimize etmek için hesaplamaları lock dışında yap.
        
        Args:
            event_id: Etkinlik ID'si
            match_key: Maç anahtarı
            
        Returns:
            Dict: Güncellenmiş maç durumu veya None
        """
        # Önce match_state'i kopyala (lock süresini minimize et)
        with self._lock:
            if event_id not in self._match_cache or match_key not in self._match_cache[event_id]:
                return None
            match_state = copy.deepcopy(self._match_cache[event_id][match_key])
        
        # Timer güncellemesi (lock dışında - performans için)
        if match_state.get("status") == "in_progress" and match_state.get("started_at"):
            from datetime import datetime
            try:
                from src.core.constants import MatchConstants
                
                MATCH_TIMINGS = {
                    "autonomous": MatchConstants.AUTONOMOUS_DURATION,
                    "prepare_teleop": MatchConstants.PREPARE_TELEOP_DURATION,
                    "driver_controlled": MatchConstants.DRIVER_CONTROLLED_DURATION,
                    "end_game": MatchConstants.END_GAME_DURATION,
                    "post_match": MatchConstants.POST_MATCH_DURATION,
                }
            except ImportError:
                # Fallback değerler (constants.py ile birebir aynı olmalı)
                MATCH_TIMINGS = {
                    "autonomous": 30,
                    "prepare_teleop": 10,  # PREPARE_TELEOP_DURATION ile aynı
                    "driver_controlled": 90,
                    "end_game": 30,
                    "post_match": 10,
                }
            
            try:
                start_time = datetime.fromisoformat(match_state["started_at"])
                elapsed = (datetime.now() - start_time).total_seconds()
                current_state = match_state.get("state", "idle")
                initial_duration = MATCH_TIMINGS.get(current_state, 0)
                time_remaining = max(0, int(initial_duration - elapsed))
                
                match_state["time_remaining"] = time_remaining
                
                # State geçişleri
                needs_update = False
                # Akış: Otonom -> Hazırlık -> SKS -> Oyun Sonu -> Maç Sonrası
                if time_remaining == 0 and current_state not in ["post_match", "completed"]:
                    state_order = ["autonomous", "prepare_teleop", "driver_controlled", "end_game", "post_match"]
                    if current_state in state_order:
                        current_index = state_order.index(current_state)
                        if current_index < len(state_order) - 1:
                            new_state = state_order[current_index + 1]
                            match_state["state"] = new_state
                            match_state["time_remaining"] = MATCH_TIMINGS.get(new_state, 0)
                            match_state["started_at"] = datetime.now().isoformat()
                            needs_update = True
                elif time_remaining == 0 and current_state == "post_match":
                    # Post-match bitti ama maçı otomatik tamamlama
                    # Maç sadece match control sayfasından tamamlanabilir
                    # Timer'ı durdur ama maç hala in_progress kalsın (hakemler düzenleme yapabilsin)
                    match_state["state"] = "post_match"
                    match_state["time_remaining"] = 0
                    # Status'ü completed yapma - sadece timer durur
                    # Maç match control'den tamamlanacak
                    needs_update = True
                
                # Sadece güncelleme gerekiyorsa lock al ve güncelle
                # Önce mevcut değeri kontrol et (lock almadan)
                current_time_remaining = None
                with self._lock:
                    if event_id in self._match_cache and match_key in self._match_cache[event_id]:
                        current_time_remaining = self._match_cache[event_id][match_key].get("time_remaining")
                
                # Güncelleme gerekiyorsa lock al ve güncelle
                if needs_update or match_state.get("time_remaining") != current_time_remaining:
                    with self._lock:
                        if event_id in self._match_cache and match_key in self._match_cache[event_id]:
                            # Güncellemeleri uygula
                            self._match_cache[event_id][match_key]["time_remaining"] = match_state["time_remaining"]
                            if needs_update:
                                self._match_cache[event_id][match_key]["state"] = match_state["state"]
                                self._match_cache[event_id][match_key]["started_at"] = match_state["started_at"]
                                self._broadcast_update(event_id, match_key, "state_update")
                            # Güncel durumu al
                            match_state = copy.deepcopy(self._match_cache[event_id][match_key])
            
            except (ValueError, TypeError) as e:
                # Hata durumunda log yaz ama işlemi durdurma
                logger.debug(f"Timer güncelleme hatası: {str(e)}")
        
        return match_state


# Global instance
_match_state_manager: Optional[MatchStateManager] = None


def get_match_state_manager(datastore) -> MatchStateManager:
    """
    Global MatchStateManager instance'ını döner.
    
    Args:
        datastore: DataStore instance
        
    Returns:
        MatchStateManager: Global instance
    """
    global _match_state_manager
    if _match_state_manager is None:
        _match_state_manager = MatchStateManager(datastore)
    return _match_state_manager
