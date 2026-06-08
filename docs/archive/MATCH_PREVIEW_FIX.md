# Match Preview WebSocket Fix - Yapılan Değişiklikler

## Problem
"Sıradaki Maçı Yükle" butonuna basıldığında:
1. Referee ekranları hemen güncellenmiyor (sayfa yenilenince geliyor)
2. Önceki maçlardan kalan skorlar karışıyor

## Çözüm

### 1. Backend Değişiklikleri

#### `routes/match_control.py` - `preview_match()` endpoint (satır ~710)
- WebSocket ile `/match` namespace'ine `match_preview` event'i gönderildi
- Yeni maç yüklendiğinde realtime skorlar sıfırlanıyor

```python
# Önceki maç skorlarını temizle
match_key = _build_match_key(event_id, match_id, match_source)
realtime_manager = get_realtime_manager()
realtime_manager.initialize_match(match_key)

# Hakem ekranlarına WebSocket bildirimi
socketio.emit("match_preview", preview_data, namespace="/match")
```

#### `src/core/scoring/realtime.py` - `initialize_match()` metodu (yeni)
- Yeni maç yüklendiğinde önceki maçın skorlarını temizler
- `register_match()` ile temiz bir skor durumu oluşturur

```python
def initialize_match(self, match_key: str) -> None:
    if match_key in self._active_scores:
        del self._active_scores[match_key]
    self.register_match(match_key)
```

### 2. Frontend Değişiklikleri

#### `static/js/match_core.js` - `match_preview` event dinleyicisi
- Match Core kullanan tüm ekranlar için
- Yeni maç geldiğinde:
  - Skorları sıfırlar
  - Maç bilgilerini günceller
  - WebSocket aboneliğini yeni maça geçirir
  - UI'ı yeniler

#### `static/js/referee_panel_sse.js` - `match_preview` event dinleyicisi
- Match Core kullanmayan legacy ekranlar için
- Aynı işlevsellik

## Test Adımları

1. http://localhost:5001 adresine git
2. Admin olarak giriş yap
3. Match Control sayfasını aç
4. Başka bir tarayıcı sekmesinde Referee Panel sayfasını aç
5. Match Control'de "Sıradaki Maçı Yükle" butonuna tıkla
6. Referee Panel'in **sayfa yenilemeden** güncellendiğini doğrula
7. Skorların 0-0'dan başladığını doğrula (önceki maçın skorları görünmemeli)

## Beklenen Davranış

- "Sıradaki Maçı Yükle" tıklandığında:
  1. Backend `/api/match-control/preview` çağrılır
  2. Realtime skorlar temizlenir (`initialize_match()`)
  3. WebSocket ile tüm `/match` namespace'indeki client'lara bildirim gider
  4. Frontend `match_preview` event'ini alır
  5. Referee ekranları anında güncellenir (sayfa yenilemeden)
  6. Skorlar 0-0'dan başlar

## Debug Logları

Browser Console'da şu loglar görülmeli:
```
MatchCore: match_preview alındı: {type: 'match_preview', match: {...}}
MatchCore: Yeni maç yükleniyor - [match_id]
```

Server loglarında şu görülmeli:
```
Preview: Realtime skorlar sıfırlandı - match_key=...
Preview: WebSocket bildirimi gönderildi - match_id=..., namespace=/match
```
