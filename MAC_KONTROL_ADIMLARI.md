# Maç Kontrol Adımları ve İşlem Akışı

Bu dokümantasyon, maç kontrol sayfasındaki (`/match-control`) tüm adımları ve işlemleri açıklar.

## 📋 Genel Bakış

Maç kontrol sistemi, FTC benzeri bir maç yönetim ekranı sağlar. Maçların seçilmesi, başlatılması, yönetilmesi ve tamamlanması için kapsamlı bir arayüz sunar.

---

## 🔄 Maç Kontrol İşlem Akışı

### 1. **Sayfa Yükleme ve Başlatma**

#### 1.1. Header Yükleme (Kritik)
- `loadUserRole()` - Kullanıcı bilgilerini yükle
- `loadEvents()` - Etkinlik listesini yükle ve dropdown'ı doldur
- `setupEventSwitcher()` - Event selector ve butonları yapılandır
- `updateEventStatus()` - Etkinlik durumunu göster
- `startClock()` - Canlı saati başlat

#### 1.2. Match Control Başlatma
- `setupEventListeners()` - Tüm buton ve form event listener'larını kur
- `switchTab("active-match")` - İlk tab'ı göster
- `loadMatchList()` - Maç listesini yükle (async, hata olsa bile devam et)
- `loadNextMatch()` - Sıradaki maçı yükle (async)
- `checkActiveMatch()` - Aktif maçı kontrol et (async)
- `loadMatchControlScreenSettings()` - Ekran ayarlarını yükle (async)
- `loadMatchControlScreens()` - Bağlı ekranları yükle (async)

---

## 🎯 Maç Seçme ve Yükleme

### 2. **Maç Seçme İşlemleri**

#### 2.1. Sıradaki Maçı Yükle
- **Buton:** `btn_load_next_match` ("Sıradaki Maçı Yükle")
- **Fonksiyon:** `loadNextMatch()`
- **API:** `GET /api/match-control/next-match`
- **İşlem:**
  1. Sıradaki maçı API'den al
  2. Maç bilgilerini göster
  3. "Bu Maçı Seç" butonu ile seçilebilir hale getir

#### 2.2. Maç Seçme
- **Fonksiyon:** `selectMatch(matchId, matches)`
- **API:** `POST /api/match-control/preview` (eğer aktif maç yoksa)
- **İşlem:**
  1. Maç bilgilerini yükle
  2. Maç görünümünü render et (`renderMatchDisplay()`)
  3. Skor verilerini uygula (`applyScoringData()`)
  4. Skor hesaplamalarını yap (`calculateScoreBreakdown()`)
  5. Gerçek zamanlı skor güncellemelerini başlat
  6. Eğer maç aktif değilse ve aktif maç yoksa, preview durumuna al (hakem sayfalarında görünsün)

#### 2.3. Maç Listesinden Seçme
- **Tab:** "Takvim" (Schedule)
- **Fonksiyon:** `loadMatchList(filter)`
- **API:** `GET /api/match-schedule` veya `GET /api/practice-matches`
- **Filtreler:**
  - Saha: Tüm Sahalar / Saha 1 / Saha 2 / ...
  - Maç Tipi: Tüm Tipler / Qualification / Elimination / Final / Practice
- **İşlem:**
  1. Filtrelere göre maç listesini yükle
  2. Her maç için "Bu Maçı Seç" butonu göster
  3. Butona tıklandığında `selectMatch()` çağrılır

---

## 🚀 Maç Başlatma ve Yönetim

### 3. **Maç Önizleme**

#### 3.1. Önizleme Göster
- **Buton:** `btn_show_preview` ("Önizleme Göster")
- **Fonksiyon:** Preview modunu aktif et
- **API:** `POST /api/match-control/preview`
- **İşlem:**
  1. Maçı preview durumuna al
  2. Hakem sayfalarında görünür hale getir (ama aktif değil)
  3. Skor girişi yapılabilir ama maç başlatılmaz

### 4. **Maç Başlatma**

#### 4.1. Maçı Başlat
- **Buton:** `btn_start_match` ("Maçı Başlat")
- **Fonksiyon:** `startMatch()`
- **API:** `POST /api/match-control/start`
- **Body:**
  ```json
  {
    "match_id": 123,
    "field_number": 1,
    "match_source": "schedule" // veya "practice"
  }
  ```
- **İşlem:**
  1. Aktif maç kontrolü yap (aynı anda birden fazla maç başlatılamaz)
  2. Maçı "in_progress" durumuna al
  3. İlk durumu "autonomous" olarak ayarla
  4. Timer'ı başlat
  5. Maç görünümünü güncelle
  6. Gerçek zamanlı skor güncellemelerini başlat

---

## ⏱️ Maç Durumları ve Geçişler

### 5. **Maç Durumları (Sıralı)**

Maç başlatıldığında otomatik olarak şu durumlar sırayla geçilir:

1. **`autonomous`** (Otonom)
   - Süre: 30 saniye (varsayılan)
   - Robotlar otonom modda çalışır

2. **`prepare_teleop`** (Kontrol Ünitelerinizi Hazırlayınız)
   - Süre: 5 saniye (varsayılan)
   - Sürücülere hazırlık süresi

3. **`driver_controlled`** (Sürücü Kontrollü)
   - Süre: 120 saniye (varsayılan)
   - Ana oyun süresi

4. **`end_game`** (Oyun Sonu)
   - Süre: 30 saniye (varsayılan)
   - Son hamleler için ek süre

5. **`post_match`** (Maç Sonrası)
   - Süre: 0 saniye (timer durur)
   - Skor girişi ve doğrulama için bekleme

### 6. **Durum Geçişleri**

#### 6.1. Sonraki Aşama
- **Buton:** `btn_next_state` ("Sonraki Aşama")
- **Fonksiyon:** `nextMatchState()`
- **API:** `POST /api/match-control/state`
- **Body:**
  ```json
  {
    "match_id": 123,
    "state": "prepare_teleop", // veya driver_controlled, end_game, post_match
    "match_source": "schedule"
  }
  ```
- **İşlem:**
  1. Mevcut durumdan sonraki duruma geç
  2. Timer'ı yeni durumun süresiyle başlat
  3. Durum göstergesini güncelle
  4. Önemli anları göster (bildirim)

#### 6.2. Maçı Durdur
- **Buton:** `btn_stop_match` ("Maçı Durdur")
- **Fonksiyon:** `stopMatch()`
- **API:** `POST /api/match-control/stop`
- **İşlem:**
  1. Onay iste
  2. Maçı "scheduled" durumuna al
  3. Timer'ı durdur
  4. Maç görünümünü güncelle

---

## 📊 Skor Yönetimi

### 7. **Skor Girişi ve Güncelleme**

#### 7.1. Gerçek Zamanlı Skor Güncelleme
- **Mekanizma:** Server-Sent Events (SSE)
- **Endpoint:** `GET /api/match-control/realtime/<match_id>`
- **Fonksiyon:** `startRealtimeScoreUpdates(matchId, matchSource)`
- **İşlem:**
  - Hakem panellerinden gelen skor güncellemelerini dinle
  - Skorları otomatik olarak hesapla ve göster
  - Kırmızı ve Mavi ittifak skorlarını güncelle

#### 7.2. Skor Hesaplama
- **Fonksiyon:** `calculateScoreBreakdown()`
- **İşlem:**
  1. Her ittifak için skor bileşenlerini hesapla
  2. Toplam skorları göster
  3. Ranking puanlarını hesapla (result, climb, auto, total)

---

## ✅ Maç Tamamlama

### 8. **Maç Sonu İşlemleri**

#### 8.1. Sonuçları Göster
- **Buton:** `btn_show_results` ("Sonuçları Göster")
- **Fonksiyon:** Sonuç ekranını göster
- **İşlem:**
  1. Final skorları göster
  2. Kazanan ittifakı vurgula
  3. Detaylı skor bileşenlerini göster

#### 8.2. Maçı Tamamla
- **Buton:** `btn_complete_match` ("Maçı Tamamla")
- **Fonksiyon:** `completeMatch()`
- **API:** `POST /api/match-control/complete`
- **Body:**
  ```json
  {
    "match_id": 123,
    "red_score": 45,
    "blue_score": 38,
    "match_source": "schedule"
  }
  ```
- **İşlem:**
  1. Skorları hesapla ve doğrula
  2. Onay iste (skorları göster)
  3. Maçı "completed" durumuna al
  4. Skorları veritabanına kaydet
  5. Timer'ı durdur
  6. Maç listesini güncelle
  7. Sıradaki maçı yükle

#### 8.3. Kaydet ve Yayınla
- **Buton:** `btn_commit_post` ("Kaydet ve Yayınla")
- **Fonksiyon:** `commitMatch()`
- **API:** `POST /api/match-control/complete`
- **İşlem:**
  1. Final skorları hesapla
  2. Maçı tamamla
  3. Skorları yayınla (audience display'de göster)
  4. Maç listelerini güncelle

---

## 📑 Tab'lar ve Görünümler

### 9. **Tab Yapısı**

#### 9.1. Aktif Maç Tab
- **Tab ID:** `tab-active-match`
- **İçerik:**
  - Maç başlığı ve timer
  - Kırmızı ve Mavi ittifak panelleri
  - Merkezi skor göstergesi
  - Durum göstergesi
  - Skor girişi alanları

#### 9.2. Takvim Tab
- **Tab ID:** `tab-schedule`
- **İçerik:**
  - Maç listesi (filtrelenebilir)
  - Saha ve maç tipi filtreleri
  - Her maç için "Bu Maçı Seç" butonu

#### 9.3. Tamamlanmamış Maçlar Tab
- **Tab ID:** `tab-incomplete`
- **Fonksiyon:** `loadIncompleteMatches()`
- **İçerik:**
  - Tamamlanmamış maçların listesi
  - Her maç için "Bu Maçı Seç" butonu

#### 9.4. Skor Düzenle Tab
- **Tab ID:** `tab-score-edit`
- **İçerik:**
  - Detaylı skor girişi formları
  - Skor bileşenleri (autonomous, teleop, endgame)
  - Ranking puanları

#### 9.5. Ayarlar Tab
- **Tab ID:** `tab-settings`
- **İçerik:**
  - Seyirci ekranı kontrolü
  - Aktif ekran seçimi
  - Overlay ayarları
  - Bağlı ekranlar listesi

---

## 🔄 Periyodik Güncellemeler

### 10. **Otomatik Güncellemeler**

#### 10.1. Maç Durumu Güncelleme
- **Interval:** `NETWORK_CONSTANTS.UPDATE_INTERVAL` (varsayılan: 5 saniye)
- **Fonksiyon:** `updateMatchStatus()`
- **İşlem:**
  - Aktif maçın durumunu kontrol et
  - Timer'ı güncelle
  - Skorları güncelle

#### 10.2. Ekran Listesi Güncelleme
- **Interval:** 5 saniye
- **Fonksiyon:** `loadMatchControlScreens()`
- **İşlem:**
  - Bağlı ekranları listele
  - Ekran durumlarını güncelle

---

## 🎮 Buton Durumları ve Görünürlük

### 11. **Buton Görünürlük Mantığı**

Butonlar maç durumuna göre gösterilir/gizlenir:

- **`btn_load_next_match`** - Her zaman görünür
- **`btn_show_preview`** - Maç seçildiğinde görünür
- **`btn_show_live`** - Maç seçildiğinde görünür
- **`btn_start_match`** - Maç seçildiğinde ve aktif değilken görünür
- **`btn_next_state`** - Maç aktifken görünür
- **`btn_stop_match`** - Maç aktifken görünür
- **`btn_show_results`** - Maç tamamlandığında görünür
- **`btn_complete_match`** - Maç aktifken ve post_match durumunda görünür
- **`btn_commit_post`** - Maç tamamlandığında görünür

---

## 📝 Özet: Tipik Maç Akışı

1. **Maç Seçme**
   - "Sıradaki Maçı Yükle" veya "Takvim" tab'ından maç seç
   - `selectMatch()` çağrılır
   - Maç preview durumuna alınır (hakem sayfalarında görünür)

2. **Önizleme (Opsiyonel)**
   - "Önizleme Göster" butonuna tıkla
   - Hakem sayfalarında maç görünür ama aktif değil

3. **Maç Başlatma**
   - "Maçı Başlat" butonuna tıkla
   - Maç "in_progress" durumuna alınır
   - Timer başlar (autonomous durumu)

4. **Durum Geçişleri**
   - "Sonraki Aşama" butonu ile durumlar arasında geçiş yap:
     - autonomous → prepare_teleop → driver_controlled → end_game → post_match

5. **Skor Girişi**
   - Hakem panellerinden skorlar otomatik güncellenir
   - Gerçek zamanlı olarak skorlar hesaplanır ve gösterilir

6. **Maç Tamamlama**
   - "post_match" durumuna gelindiğinde "Maçı Tamamla" butonu görünür
   - Skorları doğrula ve tamamla
   - Skorlar veritabanına kaydedilir

7. **Yayınlama (Opsiyonel)**
   - "Kaydet ve Yayınla" butonu ile skorları audience display'de göster

---

## 🔧 Teknik Detaylar

### API Endpoint'leri

- `GET /api/match-control/active` - Aktif maç bilgisini getir
- `GET /api/match-control/next-match` - Sıradaki maçı getir
- `POST /api/match-control/preview` - Maçı preview durumuna al
- `POST /api/match-control/start` - Maçı başlat
- `POST /api/match-control/stop` - Maçı durdur
- `POST /api/match-control/state` - Maç durumunu güncelle
- `POST /api/match-control/complete` - Maçı tamamla
- `GET /api/match-control/realtime/<match_id>` - Gerçek zamanlı skor stream (SSE)

### Önemli Fonksiyonlar

- `selectMatch(matchId, matches)` - Maç seçme
- `startMatch()` - Maç başlatma
- `nextMatchState()` - Durum geçişi
- `stopMatch()` - Maç durdurma
- `completeMatch()` - Maç tamamlama
- `renderMatchDisplay()` - Maç görünümünü render etme
- `calculateScoreBreakdown()` - Skor hesaplama
- `startMatchTimer()` - Timer başlatma
- `updateMatchStatus()` - Maç durumunu güncelleme

---

## ⚠️ Önemli Notlar

1. **Aynı Anda Tek Aktif Maç:** Sistem aynı anda sadece bir maçın aktif olmasına izin verir.

2. **Preview Durumu:** Maç seçildiğinde otomatik olarak preview durumuna alınır (eğer aktif maç yoksa). Bu sayede hakem sayfalarında görünür ama maç başlatılmaz.

3. **Gerçek Zamanlı Güncelleme:** Skorlar Server-Sent Events (SSE) ile gerçek zamanlı olarak güncellenir.

4. **Hata Toleransı:** Her fonksiyon kendi hatasını yakalar, bir hata diğer işlemleri engellemez.

5. **Timer Yönetimi:** Timer otomatik olarak çalışır ve her saniye güncellenir. Süre bitince otomatik olarak sonraki duruma geçilir.
