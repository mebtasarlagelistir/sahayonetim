# MEMSKOR — Tam Sistem Otonom Test Raporu

**Tarih:** 2026-06-16 22:16:30  
**Sunucu:** http://127.0.0.1:5001  
**Sonuç:** ✅ SİSTEM ETKİNLİĞE HAZIR  
**Özet:** 34 PASS · 0 FAIL · 0 WARN

> Test izole bir etkinlikte çalıştı; test etkinliği silindi, önceki aktif etkinlik geri yüklendi. Gerçek veriye dokunulmadı.

## Adım adım sonuçlar

✅ [0-Kurulum] Giriş — HTTP 200
&nbsp;&nbsp;&nbsp;Önceki aktif etkinlik id=None (sonra geri yüklenecek)
✅ [0-Kurulum] İzole test etkinliği oluşturuldu + aktif — id=241
✅ [0-Kurulum] 16 takım eklendi — HTTP 200
✅ [1-İnceleme] İnceleme slot API yanıtı — HTTP 200
✅ [1-Sıralama] Sıralama takvimi oluşturuldu — 12 maç
✅ [1-Sıralama] Tüm sıralama maçları oynandı — 12/12
✅ [1-Sıralama] SP sıralaması hesaplandı — 16 takım sıralandı
&nbsp;&nbsp;&nbsp;İlk 6 (SP): 88005(18), 88004(18), 88010(12), 88001(12), 88007(12), 88014(12)
✅ [3-Playoff] Çift-eleme finalleri üretildi (M1–M11) — created=11
✅ [2-Timer] Durum süreleri (otonom30/haz5/SKS120/maçsonu10)
✅ [3-Playoff] Tüm playoff maçları ittifakları dolu oynandı (advancement) — boş=0
✅ [3-Playoff] Bracket endpoint çift-eleme yapısı — ['Üst Kademe', 'Alt Kademe', 'Büyük Final']
✅ [3-Playoff] Büyük Final (M10) tamamlandı + kazanan belli — winner=red, status=completed
&nbsp;&nbsp;&nbsp;Tamamlanan playoff maçı: 10
✅ [3-Playoff] İttifak (seçim töreni) endpoint — HTTP 200
✅ [5-Yan Sistem] Sıralama (public) — HTTP 200
✅ [5-Yan Sistem] İnceleme durumu (public) — HTTP 200
✅ [5-Yan Sistem] Ödüller — HTTP 200
✅ [5-Yan Sistem] Ödül kazananları — HTTP 200
✅ [5-Yan Sistem] Tören durumu — HTTP 200
✅ [5-Yan Sistem] Sponsorlar — HTTP 200
✅ [5-Yan Sistem] Jüri slotları — HTTP 200
✅ [5-Yan Sistem] Jüri üyeleri — HTTP 200
✅ [4-Ekran] Seyirci görünümü 'match' (JS hatasız + panel) — panel görünür
✅ [4-Ekran] Seyirci görünümü 'rankings' (JS hatasız + panel) — panel görünür
✅ [4-Ekran] Seyirci görünümü 'inspection' (JS hatasız + panel) — panel görünür
✅ [4-Ekran] Seyirci görünümü 'alliances' (JS hatasız + panel) — panel görünür
✅ [4-Ekran] Seyirci görünümü 'playoff' (JS hatasız + panel) — panel görünür
✅ [4-Ekran] Seyirci görünümü 'awards' (JS hatasız + panel) — panel görünür
✅ [4-Ekran] Seyirci görünümü 'ceremony' (JS hatasız + panel) — panel görünür
✅ [4-Çıktı] Playoff raporu bracket çizdi — 11 kart
✅ [4-Çıktı] Bracket kağıdı çıktısı — 11 öğe
✅ [4-Çıktı] Zaman çizelgesi çıktısı — 11 öğe
✅ [4-Çıktı] Playoff rapor sayfası JS hatasız
✅ [6-Temizlik] Test etkinliği silindi + aktif etkinlik geri yüklendi — delete HTTP 200, aktif geri=None
✅ [6-Temizlik] Aktif etkinlik doğrulandı — aktif=None

---
_Otonom test harness'i tarafından üretildi (test_full_system_e2e.py)._