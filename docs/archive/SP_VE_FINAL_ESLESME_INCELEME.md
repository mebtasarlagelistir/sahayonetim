# SP Puanları ve Final Maçları Eşleşme – İnceleme ve Modüler Yapı

Bu belge, **SP (Sıralama Puanları) hesaplama** ve **final maçları eşleşme** mantığını özetler; modüler yapı ve değişiklik noktaları açıklanır.

---

## 1. SP Puanları Hesaplama

### 1.1 Akış Özeti

1. **Maç tamamlanır** (Maç Kontrol → “Maçı Tamamla”) → `POST /api/match-control/complete`.
2. **RealtimeManager** içinde `calculate_and_store_ranking_points()` çağrılır.
3. **RankingPointsCalculator** (`ranking_points.py`), **RankingPointsConfig** (`ranking_config.py`) değerlerini kullanarak SP hesaplar.
4. Sonuç `realtime_manager` ve maç kaydındaki `scoring_data.ranking_points` içine yazılır.
5. **TeamRankingsCalculator** (`team_rankings.py`), tamamlanmış sıralama maçlarındaki `scoring_data.ranking_points` değerlerini toplayıp takım sıralaması üretir (final maçları oluşturmak için kullanılır).

### 1.2 SP Kuralları (Konfigürasyon)

Tüm SP değerleri ve eşikler **`src/core/scoring/ranking_config.py`** içinde tanımlıdır. Değişiklik yalnızca bu dosyada yapılır:

| Kural / Eşik | Varsayılan | Açıklama |
|--------------|------------|----------|
| `win` | 2 | Galibiyet (her ittifak takımına) |
| `tie` | 1 | Beraberlik (her ittifak takımına) |
| `climb_both` | 2 | Kemere yükselme – 2 robot (ittifak başına) |
| `auto_4_balls` | 2 | Otonom 4 küre (ittifak başına) |
| `climb_robots_min` | 2 | En az kaç robot kemere yükselirse climb SP verilir |
| `auto_balls_min` | 4 | Otonomda en az kaç küre (kendi rengine) için auto SP verilir |

Otonom küre sayısı hesaplamasında kullanılan alanlar da config’te listelenir: `auto_bent1_own`, `auto_bent2_correct`, `auto_bent3_correct`, `auto_tank_own` (scoring_data ile uyumlu).

### 1.3 Veri Sözleşmesi (SP için)

- **RankingPointsCalculator** girişi: `scoring_data` = `{"red": {...}, "blue": {...}}`; her ittifak verisi hakem/maç kontrolünden gelen ham skor alanlarını içerir.
- **Kullanılan alanlar (kırmızı/mavi için):**
  - Maç sonucu: `red_score`, `blue_score` (realtime’daki `calculated_scores`’tan).
  - Climb: `teleop_climb` (robot sayısı, 0/1/2).
  - Otonom küre: `auto_bent1_own`, `auto_bent2_correct`, `auto_bent3_correct`, `auto_tank_own`.
- **Çıktı:** `{"red": {"result": int, "climb": int, "auto": int, "total": int}, "blue": {...}}`; maç kaydında `scoring_data.ranking_points` olarak saklanır.

### 1.4 Modüler Dosyalar (SP)

| Dosya | Sorumluluk | Değişiklik |
|-------|------------|------------|
| `src/core/scoring/ranking_config.py` | SP kuralları ve eşikler | SP değerleri / eşikleri değiştirmek |
| `src/core/scoring/ranking_points.py` | SP hesaplama mantığı | Hesaplama algoritması / yeni bonus türü |
| `src/core/scoring/team_rankings.py` | Takım bazlı SP toplama, tie-breaker | Sıralama / tie-breaker kuralları |
| `src/core/scoring/realtime.py` | `calculate_and_store_ranking_points` çağrısı, skor saklama | Çağrı zamanlaması, saklama |
| `routes/match_control.py` | Maç tamamlanınca SP’yi scoring_data’ya yazma | API / iş akışı |

---

## 2. Final Maçları Eşleşme

### 2.1 Eşleşme Mantığı (Single Elimination)

**Format:** `bracket_config.py` içinde `SINGLE_ELIMINATION` (varsayılan).

**Kural:** En yüksek SP’li takımlar (kırmızı ittifak) en düşük SP’li takımlarla (mavi ittifak) eşleşir.

- Sıralama: 1 = en yüksek SP, N = en düşük SP.
- İttifak başına takım sayısı: `teams_per_alliance` (varsayılan 2).

**Örnek (8 takım, 2 takım/ittifak):**

- Maç 1: Kırmızı [1, 2] vs Mavi [8, 7]
- Maç 2: Kırmızı [3, 4] vs Mavi [6, 5]

Yani kırmızı ittifak “baştan”, mavi ittifak “sondan” alınır; maç numarasına göre bloklar kaydırılır.

### 2.2 Akış Özeti

1. **Final maçları oluştur** (Setup → Maç Takvimi → “Final Maçlarını Oluştur”) → `POST /api/match-schedule/generate-finals`.
2. **TeamRankingsCalculator** tamamlanmış sıralama maçlarından takım sıralaması hesaplar.
3. **BracketGenerator** (`bracket_generator.py`), **bracket_config** formatını kullanarak maç listesini üretir.
4. Oluşan maçlar veritabanına `match_type=final` ile yazılır.

### 2.3 Tie-Breaker (Takım Sıralaması)

**TeamRankingsCalculator** (`team_rankings.py`) içinde tanımlı; sıralama skoru:

- `total_sp * 1000 + wins * 100 + ties * 10 + matches_played * 1`  
(Eşit SP’de: galibiyet, beraberlik, oynanan maç sayısı öncelik alır.)

### 2.4 Modüler Dosyalar (Final Eşleşme)

| Dosya | Sorumluluk | Değişiklik |
|-------|------------|------------|
| `src/core/tournament/bracket_config.py` | Bracket formatı, eşleşme stili dokümantasyonu | Varsayılan format, ileride yeni format sabitleri |
| `src/core/tournament/bracket_generator.py` | Bracket üretimi (single elimination vb.) | Yeni format için yeni `_generate_*` metodu |
| `src/core/scoring/team_rankings.py` | Takım sıralaması, tie-breaker | Sıralama / tie-breaker kuralları |
| `routes/match_schedule.py` | Generate-finals API, TeamRankings + BracketGenerator kullanımı | API, tarih/saha parametreleri |

---

## 3. Özet

- **SP kuralları:** Sadece `ranking_config.py`; hesaplama `ranking_points.py`; toplama/sıralama `team_rankings.py`.
- **Final eşleşme:** Format ve dokümantasyon `bracket_config.py`; üretim `bracket_generator.py`; sıralama `team_rankings.py`.
- **Veri:** SP için `scoring_data.ranking_points` ve `scoring_data.red/blue` alanları; final için `rankings` listesi (team, total_sp, rank, wins, ties, losses, matches_played, ranking_points_detail).

Bu yapı ile SP puanları ve final eşleşme mantığı modüler tutulmuş olup; kural veya format değişiklikleri ilgili config ve tek sorumluluklu modüllerde yapılabilir.
