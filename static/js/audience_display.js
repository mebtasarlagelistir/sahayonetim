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
 * 
 * ÖNEMLİ: Audience Core kullanılıyorsa bu fonksiyon çağrılmamalı.
 * Sadece fallback için korunuyor.
 */
async function loadScreenSettings() {
  // Audience Core kullanılıyorsa, bu fonksiyon çağrılmamalı
  if (typeof AudienceCore !== "undefined") {
    console.log("loadScreenSettings: Audience Core kullanılıyor, bu fonksiyon çağrılmamalı");
    return;
  }
  
  // Fallback: Eski yöntem
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
          // Preview aktifken WebSocket'i durdur
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
          // WebSocket'i başlat (artık preview yok)
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
 * ÖNEMLİ: Audience Core kullanılıyorsa bu fonksiyon Audience Core üzerinden çalışır.
 * 
 * @param {string} viewName - Görüntülenecek view adı (opsiyonel, yoksa currentView kullanılır)
 */
function switchView(viewName) {
  // Audience Core kullanılıyorsa, view değişikliği Audience Core'da yapılıyor
  if (typeof AudienceCore !== "undefined") {
    const targetView = viewName || currentView;
    AudienceCore.switchView(targetView);
    return;
  }
  
  // Fallback: Eski yöntem
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
 * 
 * ÖNEMLİ: Audience Core kullanılıyorsa bu fonksiyon çağrılmamalı.
 * Sadece fallback için korunuyor.
 */
function startAudienceLoop() {
  // Audience Core kullanılıyorsa, periyodik kontroller Audience Core'da yapılıyor
  if (typeof AudienceCore !== "undefined") {
    console.log("startAudienceLoop: Audience Core kullanılıyor, bu fonksiyon çağrılmamalı");
    return;
  }
  
  // Fallback: Eski yöntem
  const settingsInterval = setInterval(() => {
    loadScreenSettings().catch(err => {
      console.warn("loadScreenSettings error:", err);
    });
  }, 2000);
  
  const viewInterval = setInterval(() => {
    if (previewPayload && currentView === "match") {
      return;
    }
    if (currentView === "match" && !audienceSocket && !previewPayload) {
      loadMatchView();
    } else if (currentView === "inspection") {
      loadInspectionView();
    } else if (currentView === "awards") {
      loadAwardsView();
    }
  }, 2000);
  
  const heartbeatInterval = setInterval(sendHeartbeat, 5000);
  
  window._audienceIntervals = {
    settings: settingsInterval,
    view: viewInterval,
    heartbeat: heartbeatInterval
  };
}

/**
 * Sayfa yüklendiğinde başlatma
 * 
 * ÖNEMLİ: Audience Core kullanılıyor - tüm state yönetimi Audience Core'da.
 */
document.addEventListener("DOMContentLoaded", async () => {
  // Screen ID'yi belirle
  ensureScreenId();
  
  // AudioContext'i başlat (kullanıcı etkileşimi için hazır)
  if (typeof initAudioContext === "function") {
    initAudioContext();
    
    const resumeAudio = () => {
      if (typeof initAudioContext === "function") {
        initAudioContext();
      }
      document.removeEventListener("click", resumeAudio);
      document.removeEventListener("touchstart", resumeAudio);
    };
    document.addEventListener("click", resumeAudio, { once: true });
    document.addEventListener("touchstart", resumeAudio, { once: true });
  }
  
  // Audience Core'u başlat
  let audienceCoreUnsubscribe = null;
  if (typeof AudienceCore !== "undefined") {
    // Audience Core'u initialize et
    await AudienceCore.initialize(screenId);
    
    // State değişikliklerini dinle
    audienceCoreUnsubscribe = AudienceCore.subscribe((state) => {
      // Global state değişkenlerini güncelle (geriye dönük uyumluluk için)
      currentView = state.currentView;
      previewPayload = state.previewPayload;
      overlayEnabled = state.overlayEnabled;
      overlayText = state.overlayText;
      
      // UI güncellemeleri
      if (state.hasPreview) {
        // Preview aktif
        if (state.previewState === "vs_preview" && typeof applyVSPreviewPayload === "function") {
          applyVSPreviewPayload(state.previewPayload);
        } else if (state.previewState === "results" && typeof applyResultsPayload === "function") {
          applyResultsPayload(state.previewPayload);
        } else if (state.previewState === "normal_preview" && typeof applyPreviewPayload === "function") {
          applyPreviewPayload(state.previewPayload);
        }
      } else {
        // Preview yok, normal maç görünümü
        if (state.currentView === "match") {
          if (state.match) {
            // Maç var, görünümü güncelle
            if (typeof updateMatchView === "function") {
              // State değişikliği kontrolü (ses efekti için)
              // Audience Core'da _stateChanged flag'i set edilmişse ses efekti çal
              if (state.match._stateChanged && typeof announceState === "function") {
                announceState(state.currentState);
                // Flag'i temizle (bir sonraki güncelleme için)
                delete state.match._stateChanged;
              }
              
              updateMatchView(state.match);
            }
          } else {
            // Maç yok, boş görünüm göster
            if (typeof updateMatchView === "function") {
              updateMatchView(null);
            }
          }
        } else if (state.currentView === "inspection") {
          if (typeof loadInspectionView === "function") {
            loadInspectionView();
          }
        } else if (state.currentView === "awards") {
          if (typeof loadAwardsView === "function") {
            loadAwardsView();
          }
        }
      }
      
      // Overlay güncelle
      if (typeof applyOverlay === "function") {
        applyOverlay();
      }
      
      // View değişikliği için UI güncellemesi (sadece preview yoksa)
      if (!state.hasPreview) {
        // View elementlerini güncelle
        const views = ["match", "inspection", "rankings", "awards"];
        views.forEach((view) => {
          const el = qs(`audience_${view}_view`);
          if (el) {
            el.style.display = view === state.currentView ? "block" : "none";
          }
        });
        
        // VS Preview'ı gizle (normal view'a geçildiğinde)
        if (state.currentView !== "match") {
          if (typeof hideVSPreview === "function") {
            hideVSPreview();
          }
        }
        
        // View'a göre içerik yükle
        if (state.currentView === "inspection" && typeof loadInspectionView === "function") {
          loadInspectionView();
        } else if (state.currentView === "awards" && typeof loadAwardsView === "function") {
          loadAwardsView();
        }
      }
    });
    
    // İlk maç görünümünü yükle (preview yoksa)
    if (!AudienceCore.previewPayload && AudienceCore.currentView === "match") {
      await AudienceCore.loadMatchView();
    }
  } else {
    console.error("AudienceCore tanımlı değil! audience_core.js yüklenmemiş olabilir.");
    // Fallback: Eski yöntem
    await sendHeartbeat();
    await loadScreenSettings();
    if (!previewPayload && currentView === "match") {
      loadMatchView();
      startAudienceSSE();
    }
    startAudienceLoop();
  }
  
  // Sayfa kapanırken cleanup yap
  window.addEventListener("beforeunload", () => {
    if (audienceCoreUnsubscribe) {
      audienceCoreUnsubscribe();
    }
    if (typeof AudienceCore !== "undefined") {
      AudienceCore.cleanup();
    } else {
      // Fallback: Eski yöntem
      stopAudienceSSE();
    }
    // AudioContext'i kapat
    if (globalAudioContext && typeof globalAudioContext.close === "function") {
      globalAudioContext.close().catch(() => {});
    }
  });
});
