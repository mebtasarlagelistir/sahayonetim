# Final Maçları Otomatik Eşleştirme Sistemi - Kullanım Kılavuzu

## 📋 Genel Bakış

Final maçları için otomatik eşleştirme sistemi eklendi. Bu sistem:
1. Sıralama maçlarından SP puanlarını toplar
2. Takımları SP puanına göre sıralar
3. Final maçları için bracket (turnuva ağacı) oluşturur
4. Final maçlarını otomatik olarak veritabanına kaydeder

## 🏗️ Modüler Yapı

Sistem modüler bir yapıya sahiptir ve 3 ana modülden oluşur:

### 1. TeamRankingsCalculator (`src/core/scoring/team_rankings.py`)
- **Sorumluluk:** SP puanlarını toplama ve takım sıralaması
- **Bağımlılıklar:** Sadece maç verilerini alır (storage'dan bağımsız)
- **Özellikler:**
  - SP puanlarını takım bazlı toplar
  - Tie-breaker kuralları ile sıralama yapar
  - Galibiyet, beraberlik, mağlubiyet istatistiklerini hesaplar

### 2. BracketGenerator (`src/core/tournament/bracket_generator.py`)
- **Sorumluluk:** Final maçları için bracket oluşturma
- **Bağımlılıklar:** Sadece sıralama verilerini alır (storage'dan bağımsız)
- **Özellikler:**
  - Single elimination bracket formatı
  - SP sıralamasına göre otomatik eşleştirme
  - Gelecekte farklı bracket formatları eklenebilir

### 3. Generate Finals Endpoint (`routes/match_schedule.py`)
- **Sorumluluk:** API endpoint ve iş akışı yönetimi
- **Bağımlılıklar:** TeamRankingsCalculator, BracketGenerator, Storage
- **Özellikler:**
  - RESTful API endpoint
  - Veritabanı işlemleri
  - Hata yönetimi

## 🚀 Kullanım

### API Endpoint

**POST** `/api/match-schedule/generate-finals`

### Request Body

```json
{
  "start_date": "2026-02-06",        // Final maçları başlangıç tarihi (YYYY-MM-DD)
  "start_time": "14:00",              // Final maçları başlangıç saati (HH:MM)
  "field_number": 1,                  // Saha numarası (varsayılan: 1)
  "teams_per_alliance": 2,            // İttifak başına takım sayısı (varsayılan: 2)
  "max_teams": 8,                     // Maksimum takım sayısı (opsiyonel, tüm takımlar için null)
  "match_cycle_minutes": 5,           // Maç döngüsü süresi dakika (opsiyonel)
  "clear_existing": false             // Mevcut final maçlarını temizle (varsayılan: false)
}
```

### Response

```json
{
  "ok": true,
  "created_count": 4,                 // Oluşturulan maç sayısı
  "rankings": [                       // Takım sıralaması
    {
      "team": "202501",
      "total_sp": 15,
      "rank": 1,
      "wins": 5,
      "ties": 1,
      "losses": 0,
      "matches_played": 6,
      "ranking_points_detail": {
        "result": 10,
        "climb": 3,
        "auto": 2
      }
    },
    ...
  ],
  "bracket_info": {                  // Bracket bilgileri
    "total_teams": 8,
    "teams_per_alliance": 2,
    "teams_per_match": 4,
    "num_matches": 2,
    "format": "single_elimination"
  }
}
```

### Örnek Kullanım (JavaScript)

```javascript
async function generateFinalMatches() {
  try {
    const response = await fetch('/api/match-schedule/generate-finals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        start_date: '2026-02-06',
        start_time: '14:00',
        field_number: 1,
        teams_per_alliance: 2,
        max_teams: 8,
        clear_existing: false
      })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      console.log(`${data.created_count} final maçı oluşturuldu`);
      console.log('Takım sıralaması:', data.rankings);
      console.log('Bracket bilgileri:', data.bracket_info);
    } else {
      console.error('Hata:', data.error);
    }
  } catch (error) {
    console.error('API hatası:', error);
  }
}
```

## 📊 Eşleştirme Kuralı

Final maçları **Single Elimination** formatında oluşturulur:

- **1. sıradaki takımlar** (en yüksek SP) ile **son sıradaki takımlar** (en düşük SP) eşleşir
- **2. sıradaki takımlar** ile **sondan 2. takımlar** eşleşir
- ... (ortadan eşleştirme)

### Örnek (8 takım, 2 takım/ittifak):

```
Sıralama:
1. 202501 (SP: 15)
2. 202502 (SP: 14)
3. 202503 (SP: 13)
4. 202504 (SP: 12)
5. 202505 (SP: 11)
6. 202506 (SP: 10)
7. 202507 (SP: 9)
8. 202508 (SP: 8)

Final Maçları:
- Maç 1: [202501, 202502] vs [202508, 202507]
- Maç 2: [202503, 202504] vs [202506, 202505]
```

## 🔧 Tie-Breaker Kuralları

Eşit SP puanı durumunda sıralama önceliği:

1. **Toplam SP puanı** (en önemli)
2. **Galibiyet sayısı**
3. **Beraberlik sayısı**
4. **Oynanan maç sayısı** (daha fazla maç = daha iyi)

## ⚙️ Gereksinimler

Final maçları oluşturmak için:

1. ✅ **Tamamlanmış sıralama maçları** olmalı (`status = "completed"`)
2. ✅ **SP puanları hesaplanmış** olmalı (`scoring_data.ranking_points` mevcut)
3. ✅ **En az 4 takım** olmalı (2 takım/ittifak için)

## 🛠️ Modüler Genişletme

### Yeni Bracket Formatı Eklemek

`BracketGenerator` sınıfına yeni bir bracket formatı eklemek için:

```python
# src/core/tournament/bracket_generator.py

class BracketGenerator:
    BRACKET_FORMAT = "double_elimination"  # Yeni format
    
    def _generate_double_elimination_bracket(self, rankings, teams_per_alliance):
        # Yeni bracket formatı implementasyonu
        pass
    
    def generate_final_matches(self, ...):
        if self.BRACKET_FORMAT == "double_elimination":
            return self._generate_double_elimination_bracket(...)
        # ...
```

### Tie-Breaker Kurallarını Değiştirmek

`TeamRankingsCalculator` sınıfında:

```python
# src/core/scoring/team_rankings.py

class TeamRankingsCalculator:
    TIE_BREAKER_RULES = {
        "total_sp": 1000,
        "wins": 100,
        "ties": 10,
        "matches_played": 1,
        # Yeni kural eklenebilir
        "average_score": 50
    }
```

## 📝 Notlar

- Final maçları `match_type = "final"` ile oluşturulur
- Maçlar `status = "scheduled"` durumunda oluşturulur
- Mevcut final maçları `clear_existing: true` ile temizlenebilir
- Sistem modüler olduğu için kolayca test edilebilir ve genişletilebilir

## 🧪 Test

Modüller bağımsız test edilebilir:

```python
# Test TeamRankingsCalculator
from src.core.scoring.team_rankings import TeamRankingsCalculator

calculator = TeamRankingsCalculator()
rankings = calculator.calculate_team_rankings(qualification_matches)
print(rankings)

# Test BracketGenerator
from src.core.tournament.bracket_generator import BracketGenerator

generator = BracketGenerator()
matches = generator.generate_final_matches(rankings, teams_per_alliance=2)
print(matches)
```
