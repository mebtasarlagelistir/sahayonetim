#!/usr/bin/env python3
"""
Match Preview WebSocket Test

Sıradaki Maçı Yükle butonunun WebSocket ile referee ekranlarına 
bildirim gönderip göndermediğini test eder.
"""

import requests
import socketio
import time
import threading

BASE_URL = "http://localhost:5001"
session = requests.Session()

# WebSocket bağlantısı için flag
received_preview = threading.Event()
received_data = {}

def login():
    """Login olarak session cookie al"""
    resp = session.post(f"{BASE_URL}/login", data={
        "username": "admin",
        "password": "Saha.2024!"
    }, allow_redirects=False)
    
    if resp.status_code in (302, 200):
        print("✅ Login başarılı")
        return True
    else:
        print(f"❌ Login başarısız: {resp.status_code}")
        return False

def test_preview_api():
    """Preview API'sini çağır ve sonucu kontrol et"""
    # Önce maç listesini al
    resp = session.get(f"{BASE_URL}/api/match-control/matches")
    if resp.status_code != 200:
        print(f"❌ Maç listesi alınamadı: {resp.status_code}")
        return False
    
    matches = resp.json().get("matches", [])
    if not matches:
        print("❌ Hiç maç yok")
        return False
    
    # İlk pending maçı seç
    test_match = None
    for m in matches:
        if m.get("status") in ("pending", "scheduled", None):
            test_match = m
            break
    
    if not test_match:
        test_match = matches[0]
    
    print(f"📋 Test maçı: #{test_match.get('match_number', test_match.get('id'))} (ID: {test_match.get('id')})")
    
    # Preview API'sini çağır
    resp = session.post(f"{BASE_URL}/api/match-control/preview", json={
        "match_id": test_match.get("id"),
        "match_source": test_match.get("match_source", "schedule")
    })
    
    if resp.status_code == 200:
        print("✅ Preview API başarılı")
        return test_match
    else:
        print(f"❌ Preview API hatası: {resp.status_code} - {resp.text}")
        return False

def test_websocket_listener(match_to_watch):
    """WebSocket bağlantısı aç ve match_preview event'ini dinle"""
    global received_data
    
    # Socket.IO client oluştur
    sio = socketio.Client(logger=False, engineio_logger=False)
    
    @sio.on("connect", namespace="/match")
    def on_connect():
        print("🔌 WebSocket bağlantısı kuruldu")
        # Bir maça abone ol (test için)
        sio.emit("subscribe_match", {
            "match_id": match_to_watch.get("id"),
            "match_source": match_to_watch.get("match_source", "schedule")
        }, namespace="/match")
    
    @sio.on("match_preview", namespace="/match")
    def on_match_preview(data):
        print(f"📨 match_preview event alındı!")
        print(f"   Match ID: {data.get('match', {}).get('id')}")
        print(f"   Match #: {data.get('match', {}).get('match_number')}")
        print(f"   Red Score: {data.get('match', {}).get('red_score')}")
        print(f"   Blue Score: {data.get('match', {}).get('blue_score')}")
        received_data = data
        received_preview.set()
    
    @sio.on("error", namespace="/match")
    def on_error(data):
        print(f"❌ WebSocket error: {data}")
    
    try:
        # Bağlan
        sio.connect(BASE_URL, namespaces=["/match"], transports=["websocket"])
        
        # 2 saniye bekle (bağlantı + subscribe için)
        time.sleep(2)
        
        return sio
    except Exception as e:
        print(f"❌ WebSocket bağlantı hatası: {e}")
        return None

def main():
    print("=" * 60)
    print("MATCH PREVIEW WEBSOCKET TESTİ")
    print("=" * 60)
    print()
    
    # 1. Login
    if not login():
        return
    
    # 2. İlk maçı al
    resp = session.get(f"{BASE_URL}/api/match-control/matches")
    if resp.status_code != 200:
        print("❌ Maç listesi alınamadı")
        return
    
    matches = resp.json().get("matches", [])
    if len(matches) < 2:
        print("❌ Test için en az 2 maç gerekli")
        return
    
    first_match = matches[0]
    second_match = matches[1]
    
    print(f"📋 Maç 1: #{first_match.get('match_number')} (ID: {first_match.get('id')})")
    print(f"📋 Maç 2: #{second_match.get('match_number')} (ID: {second_match.get('id')})")
    print()
    
    # 3. WebSocket bağlantısı aç (ilk maça bağlan, sonra ikinci maça geçiş olacak)
    print("🔌 WebSocket bağlantısı açılıyor...")
    sio = test_websocket_listener(first_match)
    if not sio:
        return
    
    print()
    print("⏳ WebSocket bağlandı, şimdi farklı bir maçı preview edeceğiz...")
    print()
    
    # 4. İkinci maçı preview et
    print(f"📤 Maç #{second_match.get('match_number')} için preview API çağrılıyor...")
    resp = session.post(f"{BASE_URL}/api/match-control/preview", json={
        "match_id": second_match.get("id"),
        "match_source": second_match.get("match_source", "schedule")
    })
    
    if resp.status_code != 200:
        print(f"❌ Preview API hatası: {resp.status_code}")
        sio.disconnect()
        return
    
    print("✅ Preview API başarılı")
    
    # 5. WebSocket event'ini bekle (max 5 saniye)
    print("⏳ match_preview event bekleniyor...")
    if received_preview.wait(timeout=5):
        print()
        print("=" * 60)
        print("✅ TEST BAŞARILI!")
        print("   match_preview event'i WebSocket üzerinden alındı.")
        print("   Hakem ekranları artık 'Sıradaki Maçı Yükle' butonuna")
        print("   tıklandığında hemen güncellenecek.")
        print("=" * 60)
    else:
        print()
        print("=" * 60)
        print("❌ TEST BAŞARISIZ!")
        print("   match_preview event'i 5 saniye içinde alınamadı.")
        print("   WebSocket event'i gönderilmiyor olabilir.")
        print("=" * 60)
    
    # Temizlik
    sio.disconnect()

if __name__ == "__main__":
    main()
