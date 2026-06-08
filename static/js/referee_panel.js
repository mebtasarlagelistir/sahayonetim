/**
 * Referee Panel - Ana Koordinasyon Modülü
 * 
 * Bu dosya tüm referee_panel modüllerini koordine eder.
 * 
 * MODÜL YAPISI:
 * =============
 * - referee_panel_core.js: State, constants, initialization, alliance belirleme
 * - referee_panel_sse.js: WebSocket bağlantı yönetimi (SSE yerine WebSocket kullanılıyor)
 * - referee_panel_scoring.js: Skorlama ve otomatik kaydetme
 * - referee_panel_robot_status.js: Robot durumu yönetimi
 * - referee_panel_ui.js: UI güncellemeleri ve render
 * - referee_panel.js: Ana koordinasyon (bu dosya)
 * 
 * NOT: Bu dosya diğer referee_panel modüllerinden SONRA yüklenmelidir.
 */

/**
 * Hakem panelini başlatır
 */
async function initializeRefereePanel() {
  console.log("initializeRefereePanel: Başlatılıyor...");
  
  try {
    // Kullanıcı bilgilerini yükle (eğer fonksiyon tanımlıysa)
    // loadUserRole fonksiyonu users.js'de tanımlı, ama eğer yüklenmemişse
    // direkt API çağrısı yapabiliriz
    if (typeof loadUserRole === "function") {
      console.log("initializeRefereePanel: Kullanıcı bilgileri yükleniyor (loadUserRole fonksiyonu ile)...");
      try {
        await loadUserRole();
        console.log("initializeRefereePanel: Kullanıcı bilgileri yüklendi");
      } catch (err) {
        console.error("initializeRefereePanel: loadUserRole hatası:", err);
      }
    } else {
      console.warn("initializeRefereePanel: loadUserRole fonksiyonu bulunamadı - users.js yüklenmemiş olabilir, direkt API çağrısı yapılıyor...");
      // Fallback: Direkt API çağrısı yap
      try {
        const data = await apiGet("/api/user/role");
        console.log("initializeRefereePanel: Kullanıcı bilgileri yüklendi (fallback):", data);
        // Kullanıcı bilgilerini header'da göster
        const usernameEl = qs("current-user");
        const roleEl = qs("user-role");
        if (usernameEl) usernameEl.textContent = data.username || "Kullanıcı";
        if (roleEl) {
          const roleNames = {
            admin: "Yönetici",
            etkinlik_yoneticisi: "Etkinlik Yöneticisi",
            hakem: "Hakem",
            mufettis: "Müfettiş",
            seremoni: "Seremoni",
          };
          roleEl.textContent = roleNames[data.role?.toLowerCase()] || data.role || "";
        }
      } catch (err) {
        console.error("initializeRefereePanel: Kullanıcı bilgileri yüklenirken hata:", err);
      }
    }
    
    // Etkinlik bilgilerini yükle (header'da gösterilmek için)
    try {
      const eventData = await apiGet("/api/event");
      const eventNameEl = qs("event-name-display");
      const statusIndicator = qs("status-indicator");
      if (eventNameEl) {
        eventNameEl.textContent = eventData.name || "Etkinlik seçilmedi";
      }
      if (statusIndicator) {
        const isActive = eventData.name && eventData.name !== "Etkinlik seçilmedi";
        statusIndicator.classList.toggle("active", isActive);
        statusIndicator.classList.toggle("inactive", !isActive);
        statusIndicator.title = isActive ? "Aktif" : "Pasif";
      }
      console.log("initializeRefereePanel: Etkinlik bilgileri yüklendi:", eventData.name);
    } catch (err) {
      console.error("initializeRefereePanel: Etkinlik bilgileri yüklenirken hata:", err);
    }
    
    // Match Core'a subscribe ol (merkezi state yönetimi)
    let matchCoreUnsubscribe = null;
    let matchCoreInstance = null; // Scope için dışarıda tanımla
    
    // Match Core'un yüklendiğinden emin ol (retry mekanizması)
    let matchCoreRetryCount = 0;
    const MAX_MATCHCORE_RETRY = 10;
    const MATCHCORE_RETRY_DELAY = 100;
    
    const waitForMatchCore = () => {
      return new Promise((resolve) => {
        const checkMatchCore = () => {
          // Önce window.MatchCore'u kontrol et (match_core.js'de window'a ekleniyor)
          const mc = (typeof window !== "undefined" && window.MatchCore) || 
                     (typeof MatchCore !== "undefined" && MatchCore) ||
                     (typeof globalThis !== "undefined" && globalThis.MatchCore);
          
          if (mc && typeof mc.loadActiveMatch === "function") {
            console.log("initializeRefereePanel: Match Core bulundu ve fonksiyonlar mevcut");
            resolve(mc);
          } else if (matchCoreRetryCount < MAX_MATCHCORE_RETRY) {
            matchCoreRetryCount++;
            setTimeout(checkMatchCore, MATCHCORE_RETRY_DELAY);
          } else {
            console.error("initializeRefereePanel: MatchCore yüklenemedi veya fonksiyonlar eksik, fallback kullanılıyor", {
              windowMatchCore: typeof window !== "undefined" && !!window.MatchCore,
              globalMatchCore: typeof MatchCore !== "undefined",
              hasLoadActiveMatch: mc && typeof mc.loadActiveMatch === "function"
            });
            resolve(null);
          }
        };
        checkMatchCore();
      });
    };
    
    matchCoreInstance = await waitForMatchCore();
    
    if (matchCoreInstance) {
      console.log("initializeRefereePanel: Match Core bulundu, subscribe olunuyor...");
      let lastRefereeMatchId = null;
      /** Robot durumunu sadece backend verisi gerçekten değiştiğinde uygula (seçimlerin kaybolmasını önler) */
      let lastAppliedTeamStatusesKey = "";
      matchCoreUnsubscribe = matchCoreInstance.subscribe((state) => {
        // State değiştiğinde UI'ı güncelle
        if (state.match) {
          currentMatch = state.match;
          if (!currentMatch.match_source && currentMatch.source) {
            currentMatch.match_source = currentMatch.source;
          } else if (!currentMatch.match_source) {
            currentMatch.match_source = "schedule";
          }
          if (!currentMatch.source && currentMatch.match_source) {
            currentMatch.source = currentMatch.match_source;
          } else if (!currentMatch.source) {
            currentMatch.source = "schedule";
          }
          
          // Sadece maç değiştiğinde tam yükleme (loadMatchForReferee API çağırır; her notify'da çağırmak seçimleri siliyordu)
          const matchChanged = state.match.id !== lastRefereeMatchId;
          if (matchChanged) {
            lastRefereeMatchId = state.match.id;
            lastAppliedTeamStatusesKey = "";
            if (typeof clearRefereeScoringForm === "function") {
              clearRefereeScoringForm();
            }
            if (typeof loadMatchForReferee === "function") {
              loadMatchForReferee();
            }
            // İlk yüklemede backend'den gelen robot durumlarını hemen uygula
            const tsInitial = state.teamStatuses != null ? state.teamStatuses : {};
            const tsKeyInitial = JSON.stringify(tsInitial);
            if (tsKeyInitial && typeof loadRefereeRobotStatuses === "function") {
              loadRefereeRobotStatuses({ team_statuses: tsInitial });
              lastAppliedTeamStatusesKey = tsKeyInitial;
            }
          } else {
            // Aynı maç: WebSocket'ten gelen skorları uygula (formu silmeden).
            // Timer ve referee_meta aşağıdaki "her zaman güncelle" bloğunda işlenir
            // (burada tekrar çağırmaya gerek yok).
            if (!isUserEditing && state.scores) {
              if (assignedAlliance === "red" && state.scores.red && typeof applyScoringDataToForm === "function") {
                applyScoringDataToForm(state.scores.red);
              } else if (assignedAlliance === "blue" && state.scores.blue && typeof applyScoringDataToForm === "function") {
                applyScoringDataToForm(state.scores.blue);
              }
              // Robot durumlarını sadece teamStatuses gerçekten değiştiğinde uygula (tek kaynak: backend)
              const ts = state.teamStatuses != null ? state.teamStatuses : {};
              const tsKey = JSON.stringify(ts);
              if (tsKey !== lastAppliedTeamStatusesKey && typeof loadRefereeRobotStatuses === "function") {
                loadRefereeRobotStatuses({ team_statuses: ts });
                lastAppliedTeamStatusesKey = tsKey;
              }
            }
          }
          
          // Timer ve referee meta her zaman güncelle
          if (typeof updateRefereeTimer === "function") {
            updateRefereeTimer(state.currentState, state.timeRemaining);
          }
          if (state.scores && state.scores.referee_meta && typeof updateSubmitStatus === "function") {
            refereeMeta = state.scores.referee_meta;
            updateSubmitStatus();
          }
          
          // Preview durumundaki maçlar için mesaj göster (metin yapıyı bozmadan sadece mesaj alanını güncelle)
          if (state.isPreview) {
            const noMatchMsg = qs("no_match_message");
            if (noMatchMsg) {
              noMatchMsg.style.display = "block";
              const textEl = noMatchMsg.querySelector("#no_match_message_text");
              if (textEl) textEl.textContent = "Maç önizleme modunda. Maç kontrol sayfasından maçı başlatın.";
              else noMatchMsg.textContent = "Maç önizleme modunda. Maç kontrol sayfasından maçı başlatın.";
            }
          } else {
            const noMatchMsg = qs("no_match_message");
            if (noMatchMsg) {
              noMatchMsg.style.display = "none";
            }
          }
        } else {
          // Aktif maç yok
          console.log("initializeRefereePanel: Match Core'dan maç gelmedi, UI temizleniyor...");
          currentMatch = null;
          if (typeof clearRefereeUI === "function") {
            clearRefereeUI("Aktif maç bulunmuyor. Maç kontrol sayfasından bir maç başlatın.");
          } else {
            console.warn("initializeRefereePanel: clearRefereeUI fonksiyonu bulunamadı");
          }
        }
      });
      
      // Aktif maçı yükle
      console.log("initializeRefereePanel: Match Core ile aktif maç yükleniyor...");
      await matchCoreInstance.loadActiveMatch();
      console.log("initializeRefereePanel: Match Core aktif maç yükleme tamamlandı");
      
      // Periyodik kontrol başlat (Match Core'da)
      matchCoreInstance.startPeriodicCheck(5000);
    } else {
      console.warn("initializeRefereePanel: MatchCore tanımlı değil, eski yöntem kullanılıyor");
      // Fallback: Eski yöntem
      await checkActiveMatch();
      const checkInterval = typeof UI_CONSTANTS !== "undefined" && UI_CONSTANTS?.REFEREE_PANEL_CHECK_INTERVAL 
        ? UI_CONSTANTS.REFEREE_PANEL_CHECK_INTERVAL 
        : 5000;
      setInterval(async () => {
        await checkActiveMatch();
      }, checkInterval);
    }
    
    // Event listener'ları kur
    console.log("initializeRefereePanel: Event listener'lar kuruluyor...");
    setupRefereeEventListeners();
    
    // Sayfa kapanırken cleanup yap
    window.addEventListener("beforeunload", () => {
      if (matchCoreUnsubscribe) {
        matchCoreUnsubscribe();
      }
      // Match Core cleanup
      if (matchCoreInstance) {
        matchCoreInstance.cleanup();
      } else if (typeof MatchCore !== "undefined" || (typeof window !== "undefined" && window.MatchCore)) {
        const mc = window.MatchCore || MatchCore;
        if (mc && typeof mc.cleanup === "function") {
          mc.cleanup();
        }
      }
      // Eski WebSocket bağlantısını kapat (fallback için)
      if (typeof stopRealtimeUpdates === "function") {
        stopRealtimeUpdates();
      }
      // Timer interval'ini temizle
      if (typeof clearRefereeUI === "function") {
        clearRefereeUI();
      }
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
    });
    
    console.log("initializeRefereePanel: Başlatma tamamlandı");
  } catch (err) {
    console.error("initializeRefereePanel: Başlatma hatası:", err);
  }
}

/**
 * Aktif maçı kontrol eder ve yükler
 */
async function checkActiveMatch() {
  try {
    console.log("checkActiveMatch: API çağrısı yapılıyor...");
    console.log("checkActiveMatch: URL:", "/api/match-control/active");
    
    let data;
    try {
      data = await apiGet("/api/match-control/active");
      console.log("checkActiveMatch: API response başarılı:", data);
    } catch (apiError) {
      console.error("checkActiveMatch: API çağrısı hatası:", apiError);
      console.error("checkActiveMatch: Error details:", {
        message: apiError.message,
        stack: apiError.stack,
        response: apiError.response
      });
      
      // 401 hatası ise kullanıcıya bilgi ver
      if (apiError.message && apiError.message.includes("Unauthorized")) {
        const noMatchMsg = qs("no_match_message");
        if (noMatchMsg) {
          noMatchMsg.style.display = "block";
          const textEl = noMatchMsg.querySelector("#no_match_message_text");
          if (textEl) textEl.textContent = "Giriş yapmanız gerekiyor. Lütfen giriş yapın.";
          else noMatchMsg.textContent = "Giriş yapmanız gerekiyor. Lütfen giriş yapın.";
        }
        return;
      }
      
      throw apiError; // Diğer hataları yukarı fırlat
    }
    
    if (data.match) {
      console.log("checkActiveMatch: Maç bulundu - id:", data.match.id, "status:", data.match.status, "is_preview:", data.match.is_preview);
      
      // Yeni maç varsa veya değiştiyse
      if (!currentMatch || currentMatch.id !== data.match.id) {
        console.log("checkActiveMatch: Yeni maç veya maç değişti, yükleniyor...");
        currentMatch = data.match;
        
        // ÖNEMLİ: match_source alanını ekle (geriye dönük uyumluluk için)
        if (!currentMatch.match_source && currentMatch.source) {
          currentMatch.match_source = currentMatch.source;
        } else if (!currentMatch.match_source) {
          currentMatch.match_source = "schedule";
        }
        // source alanını da ekle (geriye dönük uyumluluk için)
        if (!currentMatch.source && currentMatch.match_source) {
          currentMatch.source = currentMatch.match_source;
        } else if (!currentMatch.source) {
          currentMatch.source = "schedule";
        }
        
        if (typeof loadMatchForReferee === "function") {
          await loadMatchForReferee();
        }
        
        // Preview durumundaki maçlar için mesaj göster
        if (data.match.is_preview || data.match.status === "preview") {
          const noMatchMsg = qs("no_match_message");
          if (noMatchMsg) {
            noMatchMsg.style.display = "block";
            const textEl = noMatchMsg.querySelector("#no_match_message_text");
            if (textEl) textEl.textContent = "Maç önizleme modunda. Maç kontrol sayfasından maçı başlatın.";
            else noMatchMsg.textContent = "Maç önizleme modunda. Maç kontrol sayfasından maçı başlatın.";
          }
        }
      } else {
        // Aynı maç, sadece durumu güncelle
        console.log("checkActiveMatch: Aynı maç, durum güncelleniyor...");
        currentMatch = data.match;
        
        // ÖNEMLİ: match_source alanını ekle (geriye dönük uyumluluk için)
        if (!currentMatch.match_source && currentMatch.source) {
          currentMatch.match_source = currentMatch.source;
        } else if (!currentMatch.match_source) {
          currentMatch.match_source = "schedule";
        }
        // source alanını da ekle (geriye dönük uyumluluk için)
        if (!currentMatch.source && currentMatch.match_source) {
          currentMatch.source = currentMatch.match_source;
        } else if (!currentMatch.source) {
          currentMatch.source = "schedule";
        }
        
        // Preview durumundaki maçlar için mesaj göster
        if (data.match.is_preview || data.match.status === "preview") {
          console.log("checkActiveMatch: Preview maç, mesaj gösteriliyor...");
          const noMatchMsg = qs("no_match_message");
          if (noMatchMsg) {
            noMatchMsg.style.display = "block";
            const textEl = noMatchMsg.querySelector("#no_match_message_text");
            if (textEl) textEl.textContent = "Maç önizleme modunda. Maç kontrol sayfasından maçı başlatın.";
            else noMatchMsg.textContent = "Maç önizleme modunda. Maç kontrol sayfasından maçı başlatın.";
          }
        } else {
          // Preview değilse mesajı gizle
          const noMatchMsg = qs("no_match_message");
          if (noMatchMsg) {
            noMatchMsg.style.display = "none";
          }
        }
      }
    } else {
      console.log("checkActiveMatch: Aktif maç bulunamadı");
      // Aktif maç yok
      currentMatch = null;
      
      const matchCard = qs("active_match_card");
      if (matchCard) matchCard.style.display = "none";
      
      const scoringPanel = qs("scoring_panel");
      if (scoringPanel) scoringPanel.style.display = "none";
      
      const noMatchMsg = qs("no_match_message");
      if (noMatchMsg) {
        noMatchMsg.style.display = "block";
        const textEl = noMatchMsg.querySelector("#no_match_message_text");
        if (textEl) textEl.textContent = "Aktif maç bulunmuyor. Maç kontrol sayfasından bir maç başlatın.";
        else noMatchMsg.textContent = "Aktif maç bulunmuyor. Maç kontrol sayfasından bir maç başlatın.";
      }
      
      // Gerçek zamanlı güncellemeleri durdur
      if (typeof stopRealtimeUpdates === "function") {
        stopRealtimeUpdates();
      }
    }
  } catch (err) {
    console.error("Check active match error:", err);
    const noMatchMsg = qs("no_match_message");
    if (noMatchMsg) {
      noMatchMsg.style.display = "block";
      const textEl = noMatchMsg.querySelector("#no_match_message_text");
      if (textEl) textEl.textContent = "Aktif maç kontrol edilirken hata oluştu. Lütfen sayfayı yenileyin.";
      else noMatchMsg.textContent = "Aktif maç kontrol edilirken hata oluştu. Lütfen sayfayı yenileyin.";
    }
  }
}

/**
 * Event listener'ları kurar
 */
function setupRefereeEventListeners() {
  const saveBtn = qs("btn_save_score");
  const syncBtn = qs("btn_sync_score");
  
  if (saveBtn) {
    saveBtn.addEventListener("click", saveScore);
  }
  
  if (syncBtn) {
    syncBtn.addEventListener("click", syncScore);
  }

  const submitBtn = qs("btn_submit_referee");
  if (submitBtn) {
    submitBtn.addEventListener("click", submitRefereeEntry);
  }

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-score-plus") || e.target.classList.contains("btn-score-minus")) {
      e.preventDefault();
      const fieldId = e.target.dataset.field;
      const field = qs(fieldId);
      if (field) {
        // Kullanıcı input yapıyor - Match Core'dan gelen güncellemeleri ignore et
        isUserEditing = true;
        if (userEditingTimeout) {
          clearTimeout(userEditingTimeout);
        }
        userEditingTimeout = setTimeout(() => {
          isUserEditing = false;
          console.log("initializeRefereePanel: Kullanıcı input durdu, skor güncellemeleri tekrar aktif");
        }, USER_EDITING_TIMEOUT);
        
        const currentValue = parseInt(field.value) || 0;
        const maxValue = field.hasAttribute("max") ? parseInt(field.getAttribute("max")) : null;
        const newValue = e.target.classList.contains("btn-score-plus")
          ? (maxValue !== null ? Math.min(maxValue, currentValue + 1) : currentValue + 1)
          : Math.max(0, currentValue - 1);
        field.value = newValue;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        // Otomatik kaydetme için debounce
        if (typeof scheduleAutoSave === "function") {
          scheduleAutoSave();
        }
      }
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.matches("#scoring_panel input, #scoring_panel select")) {
      if (typeof markLocalDraft === "function") {
        markLocalDraft();
      }
      // Otomatik kaydetme için debounce
      if (typeof scheduleAutoSave === "function") {
        scheduleAutoSave();
      }
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches("#scoring_panel input, #scoring_panel select")) {
      if (typeof markLocalDraft === "function") {
        markLocalDraft();
      }
      // Otomatik kaydetme için debounce
      if (typeof scheduleAutoSave === "function") {
        scheduleAutoSave();
      }
    }
  });
}

/**
 * Hakem girişini tamamlar (submit)
 */
async function submitRefereeEntry() {
  if (!currentMatch || !currentMatch.id) {
    if (typeof showToast === "function") {
      showToast("Aktif maç bulunamadı", "error");
    }
    return;
  }
  
  if (!assignedAlliance) {
    if (typeof showToast === "function") {
      showToast("İttifak seçilmedi", "error");
    }
    return;
  }
  
  try {
    await apiPost("/api/referee/submit", {
      match_id: currentMatch.id,
      alliance: assignedAlliance,
      match_source: currentMatch.match_source || "schedule"
    });
    if (typeof showToast === "function") {
      showToast("Maç girişi tamamlandı", "success");
    }
    // Submit sonrası sadece referee meta'yı güncelle, skorları uygulama
    if (typeof loadCurrentScores === "function") {
      await loadCurrentScores(false); // applyScores=false: Sadece referee meta güncellenir
    }
  } catch (err) {
    console.error("Submit referee entry error:", err);
    const message = err?.response?.error || err?.message || "Maç girişi tamamlanamadı";
    if (typeof showToast === "function") {
      showToast(message, "error");
    }
  }
}

// Sayfa yüklendiğinde başlat
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeRefereePanel);
} else {
  initializeRefereePanel();
}
