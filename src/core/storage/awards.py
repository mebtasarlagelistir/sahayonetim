"""
Ödül Kazananları ve Tören Yönetimi Modülü

Bu modül ödül kazananları ve tören durumu için tüm CRUD işlemlerini içerir.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Dict, List, Optional


class AwardWinnersStorage:
    """
    Ödül kazananları ve tören yönetimi için storage sınıfı.
    
    Bu sınıf:
    - Ödül kazananları CRUD işlemleri
    - Tören durumu yönetimi
    - Sunum sıralaması
    """
    
    # ==========================================
    # ÖDÜL KAZANANLARI İŞLEMLERİ
    # ==========================================
    
    def get_award_winners(self, event_id: int | None = None, assigned_only: bool = True) -> List[Dict]:
        """
        Ödül kazananlarını listeler.
        
        Args:
            event_id: Etkinlik ID'si. None ise aktif etkinlik kullanılır.
            assigned_only: True ise sadece takım atanmış ödülleri döndürür (tören için)
            
        Returns:
            List[Dict]: Ödül kazananları listesi
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return []
        
        with self._get_connection() as conn:
            # Sadece atanmış ödülleri döndür (winner_team_number dolu olanlar)
            if assigned_only:
                rows = conn.execute(
                    """SELECT id, event_id, award_name, award_category, award_description,
                              winner_team_number, winner_team_name, jury_note,
                              presentation_order, announced, created_at
                       FROM award_winners
                       WHERE event_id = ? AND winner_team_number IS NOT NULL AND winner_team_number != ''
                       ORDER BY presentation_order, id""",
                    (event_id,)
                ).fetchall()
            else:
                rows = conn.execute(
                    """SELECT id, event_id, award_name, award_category, award_description,
                              winner_team_number, winner_team_name, jury_note,
                              presentation_order, announced, created_at
                       FROM award_winners
                       WHERE event_id = ?
                       ORDER BY presentation_order, id""",
                    (event_id,)
                ).fetchall()
        
        return [
            {
                "id": row[0],
                "event_id": row[1],
                "award_name": row[2],
                "award_category": row[3],
                "award_description": row[4],
                "winner_team_number": row[5],
                "winner_team_name": row[6],
                "jury_note": row[7],
                "presentation_order": row[8],
                "announced": bool(row[9]),
                "created_at": row[10],
            }
            for row in rows
        ]
    
    def get_award_winner(self, winner_id: int) -> Optional[Dict]:
        """
        Tek bir ödül kazananını getirir.
        
        Args:
            winner_id: Kazanan ID'si
            
        Returns:
            Dict veya None
        """
        with self._get_connection() as conn:
            row = conn.execute(
                """SELECT id, event_id, award_name, award_category, award_description,
                          winner_team_number, winner_team_name, jury_note,
                          presentation_order, announced, created_at
                   FROM award_winners
                   WHERE id = ?""",
                (winner_id,)
            ).fetchone()
        
        if not row:
            return None
        
        return {
            "id": row[0],
            "event_id": row[1],
            "award_name": row[2],
            "award_category": row[3],
            "award_description": row[4],
            "winner_team_number": row[5],
            "winner_team_name": row[6],
            "jury_note": row[7],
            "presentation_order": row[8],
            "announced": bool(row[9]),
            "created_at": row[10],
        }
    
    def save_award_winner(
        self,
        award_name: str,
        winner_team_number: str | None = None,
        winner_team_name: str | None = None,
        jury_note: str | None = None,
        award_category: str | None = None,
        award_description: str | None = None,
        presentation_order: int = 0,
        event_id: int | None = None,
        winner_id: int | None = None
    ) -> int:
        """
        Ödül kazananı ekler veya günceller.
        
        Args:
            award_name: Ödül adı
            winner_team_number: Kazanan takım numarası
            winner_team_name: Kazanan takım adı
            jury_note: Jüri notu/gerekçesi
            award_category: Ödül kategorisi
            award_description: Ödül açıklaması
            presentation_order: Sunum sırası
            event_id: Etkinlik ID'si
            winner_id: Güncelleme için mevcut kayıt ID'si
            
        Returns:
            int: Kaydedilen/güncellenen kayıt ID'si
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            raise ValueError("Aktif etkinlik yok")
        
        with self._get_connection() as conn:
            if winner_id:
                # Güncelleme
                conn.execute(
                    """UPDATE award_winners
                       SET award_name = ?, award_category = ?, award_description = ?,
                           winner_team_number = ?, winner_team_name = ?, jury_note = ?,
                           presentation_order = ?
                       WHERE id = ? AND event_id = ?""",
                    (award_name, award_category, award_description,
                     winner_team_number, winner_team_name, jury_note,
                     presentation_order, winner_id, event_id)
                )
                conn.commit()
                return winner_id
            else:
                # Yeni kayıt - önce aynı ödül adı var mı kontrol et
                existing = conn.execute(
                    "SELECT id FROM award_winners WHERE event_id = ? AND award_name = ?",
                    (event_id, award_name)
                ).fetchone()
                
                if existing:
                    # Güncelle
                    conn.execute(
                        """UPDATE award_winners
                           SET award_category = ?, award_description = ?,
                               winner_team_number = ?, winner_team_name = ?, jury_note = ?,
                               presentation_order = ?
                           WHERE id = ?""",
                        (award_category, award_description,
                         winner_team_number, winner_team_name, jury_note,
                         presentation_order, existing[0])
                    )
                    conn.commit()
                    return existing[0]
                else:
                    # Yeni kayıt
                    cursor = conn.execute(
                        """INSERT INTO award_winners
                           (event_id, award_name, award_category, award_description,
                            winner_team_number, winner_team_name, jury_note, presentation_order)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                        (event_id, award_name, award_category, award_description,
                         winner_team_number, winner_team_name, jury_note, presentation_order)
                    )
                    conn.commit()
                    return cursor.lastrowid
    
    def delete_award_winner(self, winner_id: int, event_id: int | None = None) -> bool:
        """
        Ödül kazananını siler.
        
        Args:
            winner_id: Silinecek kayıt ID'si
            event_id: Etkinlik ID'si (güvenlik için)
            
        Returns:
            bool: Silme başarılı mı
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        
        with self._get_connection() as conn:
            if event_id:
                cursor = conn.execute(
                    "DELETE FROM award_winners WHERE id = ? AND event_id = ?",
                    (winner_id, event_id)
                )
            else:
                cursor = conn.execute(
                    "DELETE FROM award_winners WHERE id = ?",
                    (winner_id,)
                )
            conn.commit()
            return cursor.rowcount > 0
    
    def set_award_announced(self, winner_id: int, announced: bool = True) -> bool:
        """
        Ödülün duyuruldu olarak işaretlenmesini sağlar.
        
        Args:
            winner_id: Kazanan ID'si
            announced: Duyuruldu mu
            
        Returns:
            bool: Güncelleme başarılı mı
        """
        with self._get_connection() as conn:
            cursor = conn.execute(
                "UPDATE award_winners SET announced = ? WHERE id = ?",
                (1 if announced else 0, winner_id)
            )
            conn.commit()
            return cursor.rowcount > 0
    
    def bulk_save_award_winners(self, winners: List[Dict], event_id: int | None = None) -> int:
        """
        Toplu ödül kazananı kaydetme.
        
        Args:
            winners: Kazanan listesi
            event_id: Etkinlik ID'si
            
        Returns:
            int: Kaydedilen kayıt sayısı
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            raise ValueError("Aktif etkinlik yok")
        
        count = 0
        for winner in winners:
            self.save_award_winner(
                award_name=winner.get("award_name", ""),
                winner_team_number=winner.get("winner_team_number"),
                winner_team_name=winner.get("winner_team_name"),
                jury_note=winner.get("jury_note"),
                award_category=winner.get("award_category"),
                award_description=winner.get("award_description"),
                presentation_order=winner.get("presentation_order", 0),
                event_id=event_id,
                winner_id=winner.get("id")
            )
            count += 1
        
        return count
    
    # ==========================================
    # TÖREN DURUMU İŞLEMLERİ
    # ==========================================
    
    def get_ceremony_state(self, event_id: int | None = None) -> Dict:
        """
        Tören durumunu getirir.
        
        Args:
            event_id: Etkinlik ID'si
            
        Returns:
            Dict: Tören durumu
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return {"is_active": False, "current_award_id": None, "current_step": "idle"}
        
        with self._get_connection() as conn:
            row = conn.execute(
                """SELECT is_active, current_award_id, current_step, updated_at
                   FROM ceremony_state
                   WHERE event_id = ?""",
                (event_id,)
            ).fetchone()
        
        if not row:
            return {
                "is_active": False,
                "current_award_id": None,
                "current_step": "idle",
                "current_award": None
            }
        
        result = {
            "is_active": bool(row[0]),
            "current_award_id": row[1],
            "current_step": row[2] or "idle",
            "updated_at": row[3],
            "current_award": None
        }
        
        # Aktif ödül bilgisini ekle
        if row[1]:
            result["current_award"] = self.get_award_winner(row[1])
        
        return result
    
    def update_ceremony_state(
        self,
        is_active: bool | None = None,
        current_award_id: int | None = None,
        current_step: str | None = None,
        event_id: int | None = None
    ) -> bool:
        """
        Tören durumunu günceller.
        
        Args:
            is_active: Tören aktif mi
            current_award_id: Şu anki ödül ID'si
            current_step: Şu anki adım (idle, showing_award, showing_winner, showing_note)
            event_id: Etkinlik ID'si
            
        Returns:
            bool: Güncelleme başarılı mı
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return False
        
        with self._get_connection() as conn:
            # Mevcut kayıt var mı kontrol et
            existing = conn.execute(
                "SELECT id FROM ceremony_state WHERE event_id = ?",
                (event_id,)
            ).fetchone()
            
            now = datetime.now().isoformat()
            
            if existing:
                # Güncelleme - sadece None olmayan değerleri güncelle
                updates = []
                params = []
                
                if is_active is not None:
                    updates.append("is_active = ?")
                    params.append(1 if is_active else 0)
                
                if current_award_id is not None:
                    updates.append("current_award_id = ?")
                    params.append(current_award_id if current_award_id > 0 else None)
                
                if current_step is not None:
                    updates.append("current_step = ?")
                    params.append(current_step)
                
                updates.append("updated_at = ?")
                params.append(now)
                params.append(event_id)
                
                conn.execute(
                    f"UPDATE ceremony_state SET {', '.join(updates)} WHERE event_id = ?",
                    tuple(params)
                )
            else:
                # Yeni kayıt
                conn.execute(
                    """INSERT INTO ceremony_state (event_id, is_active, current_award_id, current_step, updated_at)
                       VALUES (?, ?, ?, ?, ?)""",
                    (event_id, 1 if is_active else 0, current_award_id, current_step or "idle", now)
                )
            
            conn.commit()
            return True
    
    def start_ceremony(self, event_id: int | None = None) -> Dict:
        """
        Tören sunumunu başlatır.
        
        Args:
            event_id: Etkinlik ID'si
            
        Returns:
            Dict: İlk ödül bilgisi ve durum
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return {"error": "Aktif etkinlik yok"}
        
        # İlk ödülü bul (sadece atanmış ödüller)
        winners = self.get_award_winners(event_id, assigned_only=True)
        if not winners:
            return {"error": "Ödül kazananı tanımlanmamış. Önce Ödül Atama sayfasından takım atayın."}
        
        first_award = winners[0]
        
        # Tören durumunu güncelle
        self.update_ceremony_state(
            is_active=True,
            current_award_id=first_award["id"],
            current_step="showing_award",
            event_id=event_id
        )
        
        return {
            "success": True,
            "is_active": True,
            "current_step": "showing_award",
            "current_award": first_award,
            "total_awards": len(winners),
            "current_index": 0
        }
    
    def next_ceremony_step(self, event_id: int | None = None) -> Dict:
        """
        Tören sunumunda bir sonraki adıma geçer.
        
        Adım sırası:
        1. showing_award - Ödül adı ve açıklaması gösteriliyor
        2. showing_note - Jüri notu gösteriliyor (varsa)
        3. showing_winner - Kazanan takım gösteriliyor
        4. (sonraki ödüle geç veya bitir)
        
        Args:
            event_id: Etkinlik ID'si
            
        Returns:
            Dict: Yeni durum
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return {"error": "Aktif etkinlik yok"}
        
        state = self.get_ceremony_state(event_id)
        if not state["is_active"]:
            return {"error": "Tören aktif değil"}
        
        current_step = state["current_step"]
        current_award_id = state["current_award_id"]
        
        # Adım geçişleri (jüri notu kazanandan önce)
        step_order = ["showing_award", "showing_note", "showing_winner"]
        
        if current_step in step_order:
            current_index = step_order.index(current_step)
            
            if current_index < len(step_order) - 1:
                # Sonraki adıma geç
                next_step = step_order[current_index + 1]
                self.update_ceremony_state(current_step=next_step, event_id=event_id)
                
                # Ödülü duyuruldu olarak işaretle (showing_winner adımında)
                if next_step == "showing_winner" and current_award_id:
                    self.set_award_announced(current_award_id, True)
                
                return {
                    "success": True,
                    "is_active": True,
                    "current_step": next_step,
                    "current_award": state["current_award"]
                }
            else:
                # Sonraki ödüle geç
                return self.next_ceremony_award(event_id)
        
        return {"error": "Geçersiz adım"}
    
    def next_ceremony_award(self, event_id: int | None = None) -> Dict:
        """
        Bir sonraki ödüle geçer.
        
        Args:
            event_id: Etkinlik ID'si
            
        Returns:
            Dict: Yeni ödül bilgisi
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        if event_id is None:
            return {"error": "Aktif etkinlik yok"}
        
        state = self.get_ceremony_state(event_id)
        winners = self.get_award_winners(event_id, assigned_only=True)
        
        if not winners:
            return {"error": "Ödül kazananı yok"}
        
        current_award_id = state["current_award_id"]
        
        # Şu anki ödülün index'ini bul
        current_index = 0
        for i, w in enumerate(winners):
            if w["id"] == current_award_id:
                current_index = i
                break
        
        # Sonraki ödüle geç
        if current_index < len(winners) - 1:
            next_award = winners[current_index + 1]
            self.update_ceremony_state(
                current_award_id=next_award["id"],
                current_step="showing_award",
                event_id=event_id
            )
            return {
                "success": True,
                "is_active": True,
                "current_award": next_award,
                "current_index": current_index + 1,
                "total_awards": len(winners),
                "current_step": "showing_award"
            }
        else:
            # Son ödül, töreni bitir
            return self.stop_ceremony(event_id)
    
    def show_specific_award(self, award_id: int, event_id: int | None = None) -> Dict:
        """
        Belirli bir ödülü gösterir.
        
        Args:
            award_id: Gösterilecek ödül ID'si
            event_id: Etkinlik ID'si
            
        Returns:
            Dict: Ödül bilgisi
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        
        award = self.get_award_winner(award_id)
        if not award:
            return {"error": "Ödül bulunamadı"}
        
        self.update_ceremony_state(
            is_active=True,
            current_award_id=award_id,
            current_step="showing_award",
            event_id=event_id
        )
        
        return {
            "success": True,
            "is_active": True,
            "current_award": award,
            "current_step": "showing_award"
        }
    
    def stop_ceremony(self, event_id: int | None = None) -> Dict:
        """
        Töreni durdurur.
        
        Args:
            event_id: Etkinlik ID'si
            
        Returns:
            Dict: Sonuç
        """
        if event_id is None:
            event_id = self.get_active_event_id()
        
        self.update_ceremony_state(
            is_active=False,
            current_award_id=0,
            current_step="idle",
            event_id=event_id
        )
        
        return {"success": True, "message": "Tören durduruldu"}
