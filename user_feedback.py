#!/usr/bin/env python3
"""
User Feedback Script - Kullanıcıdan geri bildirim almak için
"""

print("""
╔══════════════════════════════════════════════════════════════════════════════╗
║                    BRANCH MERGE ANALİZİ TAMAMLANDI                          ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  📊 ÖZET:                                                                    ║
║  ────────────────────────────────────────────────────────────────────────    ║
║  • 3 branch tespit edildi: main, Hasan, sudem                               ║
║  • 8 çakışan dosya var (her iki branch'ta değiştirilmiş)                    ║
║  • Hasan: 5 commit (WebSocket refactor, Chroma Key, Ranking, Bracket, Test) ║
║  • Sudem: 1 commit (WebSocket events, Screens modern tasarım)               ║
║                                                                              ║
║  🎯 ÖNERİLEN STRATEJİ:                                                       ║
║  ────────────────────────────────────────────────────────────────────────    ║
║  "Hasan Base + Sudem Cherry-Pick" yaklaşımı                                 ║
║  1. Hasan branch'ı base olarak alınacak (daha kapsamlı)                     ║
║  2. Sudem'in benzersiz özellikleri (screens tasarımı, events) eklenecek     ║
║  3. Çakışmalar manuel olarak çözülecek                                      ║
║                                                                              ║
║  📁 DETAYLAR:                                                                ║
║  • flows.md - Detaylı analiz ve strateji                                    ║
║  • todos.md - Yapılacaklar listesi                                          ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
""")

print("\n🔍 SORULAR:")
print("─" * 60)
print("""
1. Bu strateji sizin için uygun mu? (Hasan base + Sudem ekleme)

2. Öncelik sırası:
   a) Chroma Key özelliği (Hasan) - OBS için yeşil ekran
   b) Modern Screens tasarımı (Sudem) - Ekran yönetimi UI
   c) WebSocket events (Sudem) - inspection/awards/rankings güncellemeleri
   d) Ranking/Bracket sistemi (Hasan) - Turnuva braketleri
   
   Hangilerini kesinlikle dahil etmek istiyorsunuz?

3. Merge işlemini hemen başlatalım mı?

""")

feedback = input("Görüşlerinizi yazın (veya 'evet' ile devam): ")

with open("feedback.txt", "w", encoding="utf-8") as f:
    f.write(feedback)

print(f"\n✅ Geri bildiriminiz kaydedildi: feedback.txt")
