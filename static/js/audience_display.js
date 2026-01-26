/**
 * Audience Display - Ana Koordinasyon Modülü
 * 
 * Bu dosya tüm audience_display modüllerini koordine eder.
 * 
 * MODÜL YAPISI:
 * =============
 * - audience_display_core.js: State, constants, initialization, screen ID yönetimi
 * - audience_display_preview.js: Preview yönetimi (apply, hide, VS preview, results)
 * - audience_display_sse.js: SSE bağlantı yönetimi
 * - audience_display_views.js: View yükleme (match, inspection, awards)
 * - audience_display_ui.js: UI güncellemeleri (timer, score, teams, overlay)
 * - audience_display.js: Ana koordinasyon (bu dosya)
 * 
 * NOT: Bu dosya diğer audience_display modüllerinden SONRA yüklenmelidir.
 */

/**
 * Screen settings'i yükler ve preview durumunu kontrol eder
 */
async function loadScreenSettings() {
  try {
    const data = await apiGet(`/api/screens/view?screen_id=${encodeURIComponent(screenId)}`);
    const newView = data.active_view || "match";
    overlayEnabled = !!data.overlay_enabled;
    overlayText = data.overlay_text || "";
    
    // Preview payload'ı güncelle ve uygula
    const newPreviewPayload = data.preview_payload || null;
    
    // ÖNEMLİ: Preview payload kontrolü
    if (newPreviewPayload) {
      // Yeni preview geldi veya mevcut preview güncellendi
      const payloadChanged = JSON.stringify(newPreviewPayload) !== JSON.stringify(previewPayload);
      if (payloadChanged || !previewPayload) {
        console.log("Audience: Preview payload alındı/güncellendi", { 
          type: newPreviewPayload?.type, 
          match: newPreviewPayload?.match?.match_number 
        });
        previewPayload = newPreviewPayload;
        // Preview clear attempts'ı sıfırla (yeni preview geldi)
        resetPreviewClearAttempts();
        // Preview varsa hemen uygula
        if (newView === "match") {
          applyPreviewPayload(previewPayload);
          // Preview aktifken SSE'yi durdur
          stopAudienceSSE();
          // Preview aktifken view değişikliğini yapma (preview korunmalı)
          currentView = "match"; // View'ı match olarak tut ama preview göster
          applyOverlay();
          // ÖNEMLİ: switchView() çağrılmasın (preview korunmalı)
          return; // Preview aktifken başka işlem yapma
        }
      } else {
        // Preview değişmedi, sadece koru (yeniden uygulama yapma)
        // Overlay güncellenebilir
        applyOverlay();
        // ÖNEMLİ: Preview aktifken başka işlem yapma (switchView, loadMatchView vb.)
        // Preview zaten aktif ve görünüyor, hiçbir şey yapma
        console.log("Audience: Preview değişmedi, korunuyor (overlay güncellendi)");
        return; // Preview aktifken başka işlem yapma
      }
    } else if (!newPreviewPayload && previewPayload) {
      // Backend'den preview_payload None döndü
      // ÖNEMLİ: Bu durumda iki senaryo var:
      // 1. Preview gerçekten temizlendi (mode: "live" gönderildi) - preview'ı kaldır
      // 2. Backend geçici olarak None döndü (hata/gecikme) - preview'ı koru
      // 
      // Eğer VS preview aktifse ve backend'den None dönüyorsa, 
      // bu muhtemelen bir hata veya geçici bir durumdur.
      // Preview'ı korumak için bir süre bekleyelim (3 kontrol döngüsü = ~6 saniye)
      const attempts = incrementPreviewClearAttempts();
      
      // 3 kontrol döngüsü boyunca preview'ı koru (backend hatası olabilir)
      if (attempts < 3) {
        console.log(`Audience: Backend'den preview_payload None döndü (${attempts}/3), preview korunuyor (geçici hata olabilir)`);
        // Preview'ı koru, sadece overlay güncelle
        applyOverlay();
        return; // Preview aktifken başka işlem yapma
      } else {
        // 3 kontrol döngüsü sonrası hala None dönüyorsa, preview gerçekten temizlenmiş demektir
        console.log("Audience: Preview temizlendi (backend'den 3 kontrol döngüsü boyunca None döndü), normal maç görünümüne geçiliyor");
        resetPreviewClearAttempts();
        previewPayload = null;
        // Normal maç görünümünü yükle
        if (newView === "match") {
          hideVSPreview();
          loadMatchView();
          // SSE'yi başlat (artık preview yok)
          startAudienceSSE();
        }
      }
    } else if (!newPreviewPayload && !previewPayload) {
      // Preview yok, normal işlem devam edebilir
      // Preview clear attempts'ı sıfırla
      resetPreviewClearAttempts();
    } else if (newPreviewPayload && previewPayload) {
      // Preview var ve değişmedi, clear attempts'ı sıfırla
      resetPreviewClearAttempts();
    }
    
    // View değişikliği (preview yoksa)
    if (currentView !== newView && !previewPayload) {
      currentView = newView;
      switchView();
    } else if (!previewPayload) {
      // View aynı ama overlay güncellenebilir
      applyOverlay();
      // View değişmediyse switchView() çağrılmasın (gereksiz)
    }
  } catch (err) {
    console.error("Audience settings error:", err);
  }
}

/**
 * View değiştirir
 * 
 * @param {string} viewName - Görüntülenecek view adı (opsiyonel, yoksa currentView kullanılır)
 */
function switchView(viewName) {
  const targetView = viewName || currentView;
  
  // ÖNEMLİ: Preview aktifken view değişikliği yapma (preview korunmalı)
  if (previewPayload && targetView === "match") {
    console.log("switchView: Preview aktif, view değişikliği yapılmıyor");
    return;
  }
  
  const views = ["match", "inspection", "rankings", "awards"];
  views.forEach((view) => {
    const el = qs(`audience_${view}_view`);
    if (el) {
      el.style.display = view === targetView ? "block" : "none";
    }
  });
  
  // VS Preview'ı gizle (normal view'a geçildiğinde)
  if (targetView !== "match") {
    hideVSPreview();
  }
  
  // Match view için SSE'yi yönet
  // ÖNEMLİ: Preview aktifken SSE başlatma (preview korunmalı)
  if (targetView === "match" && !previewPayload) {
    startAudienceSSE();
  } else {
    stopAudienceSSE();
  }
}

/**
 * Periyodik güncellemeleri başlatır
 */
function startAudienceLoop() {
  // Screen settings'i kontrol et (preview için)
  // ÖNEMLİ: Preview aktifken daha az sıklıkta kontrol et (preview'ı korumak için)
  // Ancak preview'ın backend'den temizlenip temizlenmediğini kontrol etmek için yine de çağrılmalı
  const settingsInterval = setInterval(() => {
    // Preview aktifken bile kontrol et (backend'den preview temizlenmiş olabilir - "Maçı Göster" ile)
    // loadScreenSettings fonksiyonu preview aktifken gereksiz işlem yapmayacak şekilde düzenlendi
    loadScreenSettings().catch(err => {
      console.warn("loadScreenSettings error:", err);
    });
  }, 2000); // 2 saniye (preview aktifken de aynı sıklıkta, ama fonksiyon içinde koruma var)
  
  // View'ları yükle (SSE varsa daha az sıklıkta)
  const viewInterval = setInterval(() => {
    // ÖNEMLİ: Preview aktifken normal yükleme yapma (preview korunmalı)
    if (previewPayload && currentView === "match") {
      // Preview aktif, normal maç görünümünü yükleme
      return;
    }
    if (currentView === "match" && !matchEventSource && !previewPayload) {
      // SSE yoksa polling yap (ama preview aktifken değil)
      loadMatchView();
    } else if (currentView === "inspection") {
      loadInspectionView();
    } else if (currentView === "awards") {
      loadAwardsView();
    }
  }, 2000);
  
  // Heartbeat'i düzenli gönder
  const heartbeatInterval = setInterval(sendHeartbeat, 5000);
  
  // Cleanup için interval'ları sakla (gerekirse)
  window._audienceIntervals = {
    settings: settingsInterval,
    view: viewInterval,
    heartbeat: heartbeatInterval
  };
}

/**
 * Sayfa yüklendiğinde başlatma
 */
document.addEventListener("DOMContentLoaded", async () => {
  // Screen ID'yi belirle
  ensureScreenId();
  
  // AudioContext'i başlat (kullanıcı etkileşimi için hazır)
  // İlk tıklama veya dokunma ile aktif olacak
  if (typeof initAudioContext === "function") {
    // Sayfa yüklendiğinde context'i oluştur (suspended durumda olabilir)
    initAudioContext();
    
    // İlk kullanıcı etkileşiminde resume et
    const resumeAudio = () => {
      if (typeof initAudioContext === "function") {
        initAudioContext();
      }
      // Event listener'ı kaldır (sadece bir kez çalışsın)
      document.removeEventListener("click", resumeAudio);
      document.removeEventListener("touchstart", resumeAudio);
    };
    document.addEventListener("click", resumeAudio, { once: true });
    document.addEventListener("touchstart", resumeAudio, { once: true });
  }
  
  // İlk heartbeat'i gönder (ekranı backend'e kaydet)
  await sendHeartbeat();
  
  // Screen settings'i yükle (preview dahil)
  await loadScreenSettings();
  
  // Eğer preview yoksa normal maç görünümünü yükle
  if (!previewPayload && currentView === "match") {
    loadMatchView();
    startAudienceSSE();
  }
  
  // Periyodik güncellemeleri başlat
  startAudienceLoop();
  
  // Sayfa kapanırken cleanup yap
  window.addEventListener("beforeunload", () => {
    stopAudienceSSE();
    // AudioContext'i kapat (opsiyonel)
    if (globalAudioContext && typeof globalAudioContext.close === "function") {
      globalAudioContext.close().catch(() => {});
    }
  });
});
