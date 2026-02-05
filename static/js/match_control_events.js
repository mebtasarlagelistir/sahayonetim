/**
 * Maç Kontrol - Event Listener Kurulumu Modülü
 * 
 * Tüm event listener'ların kurulumu ve tab yönetimi.
 * 
 * Bağımlılıklar: match_control_core.js, match_control_data.js, match_control_operations.js, match_control_scoring.js, match_control_ui.js
 */

/**
 * Tab'ları değiştirir
 */
function switchTab(tabName) {
  // Tüm tab butonlarını güncelle
  document.querySelectorAll(".tab-button").forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.setAttribute("data-active", "true");
    } else {
      btn.removeAttribute("data-active");
    }
  });
  
  // Tüm tab içeriklerini gizle
  document.querySelectorAll(".tab-content").forEach(content => {
    content.style.display = "none";
  });
  
  // Seçilen tab'ı göster
  const selectedTab = qs(`tab-${tabName}`);
  if (selectedTab) {
    selectedTab.style.display = "block";
  }
  
  // Tab'a özel veri yükleme
  if (tabName === "schedule") {
    const listContainer = qs("schedule_match_list");
    if (listContainer) {
      listContainer.innerHTML = "<div class='loading'>Yükleniyor...</div>";
    }
    // Event ile tetikle (match_control_data.js dinliyor); birkaç kez dene (script sırası gecikmeli olabilir)
    var scheduleRetries = [0, 80, 200];
    scheduleRetries.forEach(function (delay) {
      setTimeout(function () {
        var listEl = qs("schedule_match_list");
        if (listEl && (listEl.querySelector(".match-item") || listEl.querySelector(".empty") || listEl.querySelector(".error"))) {
          return;
        }
        if (typeof window !== "undefined" && window.scheduleLoadInProgress) return;
        document.dispatchEvent(new CustomEvent("match-control-schedule-tab-open"));
        if (delay === 200) {
          // Son denemeden 100ms sonra hâlâ dolmadıysa global fonksiyonu dene veya hata göster
          setTimeout(function () {
            var el = qs("schedule_match_list");
            if (!el || el.querySelector(".match-item") || el.querySelector(".empty") || el.querySelector(".error")) return;
            if (window.scheduleLoadInProgress) return;
            var fn = (typeof window !== "undefined" && window.loadScheduleMatches) || (typeof loadScheduleMatches === "function" ? loadScheduleMatches : null);
            if (typeof fn === "function") {
              fn().catch(function (err) {
                console.error("switchTab: loadScheduleMatches fallback hatası:", err);
                if (el) el.innerHTML = "<div class='error'>Maç listesi yüklenirken hata: " + (err && err.message ? err.message : "Bilinmeyen hata") + "</div>";
              });
            } else if (el && !el.querySelector(".error")) {
              console.warn("switchTab: loadScheduleMatches fonksiyonu bulunamadı (match_control_data.js yüklü mü?)");
              el.innerHTML = "<div class='error'>Maç listesi yüklenemedi. Sayfayı yenileyin (Ctrl+F5).</div>";
            }
          }, 100);
        }
      }, delay);
    });
  } else if (tabName === "incomplete") {
    if (typeof loadIncompleteMatches === "function") {
      loadIncompleteMatches();
    }
  } else if (tabName === "score-edit") {
    if (typeof loadScoreEditMatches === "function") {
      loadScoreEditMatches();
    }
    if (typeof moveDetailedScoringTo === "function") {
      moveDetailedScoringTo("score_edit_detailed_slot");
    }
  } else if (tabName === "settings") {
    // Ayarlar tab'ı açıldığında ekran ayarlarını ve bağlı ekranları yükle
    if (typeof loadMatchControlScreenSettings === "function") {
      loadMatchControlScreenSettings();
    }
    if (typeof loadMatchControlScreens === "function") {
      loadMatchControlScreens();
    }
  } else if (tabName === "ceremony") {
    // Tören tab'ı açıldığında ceremony modülünü başlat
    if (typeof initCeremony === "function") {
      initCeremony();
    }
  }
  if (tabName !== "score-edit") {
    if (typeof moveDetailedScoringTo === "function") {
      moveDetailedScoringTo("detailed_scoring_home");
    }
  }
}

/**
 * Match-control sayfası için event switcher'ı kurar (fallback)
 * Eğer dashboard.js'deki setupEventSwitcher yüklenmemişse bu kullanılır
 */
function setupMatchControlEventSwitcher() {
  const eventSelector = qs("event_selector");
  if (eventSelector) {
    eventSelector.addEventListener("change", async (event) => {
      const eventId = Number(event.target.value);
      if (!eventId) return;
      try {
        await apiPost("/api/events/active", { id: eventId });
        if (window.localStorage) {
          window.localStorage.setItem("active_event_id", String(eventId));
        }
        // Event status'u güncelle
        if (typeof updateEventStatus === "function") {
          const eventData = await apiGet("/api/event");
          updateEventStatus(eventData);
        } else {
          // Fallback: Sayfayı yenile
          window.location.reload();
        }
      } catch (err) {
        console.error("Change event error:", err);
        showToast("Etkinlik değiştirilirken hata oluştu", "error");
      }
    });
  }
  
  const newEventBtn = qs("new_event");
  if (newEventBtn) {
    newEventBtn.addEventListener("click", async () => {
      const name = window.prompt("Etkinlik adı", "Yeni Etkinlik");
      if (!name) return;
      try {
        await apiPost("/api/events", { name });
        showToast("Yeni etkinlik oluşturuldu", "success");
        if (typeof loadEvents === "function") await loadEvents();
        if (typeof updateEventStatus === "function") {
          const eventData = await apiGet("/api/event");
          updateEventStatus(eventData);
        }
      } catch (err) {
        console.error("Create event error:", err);
        showToast(`Hata: ${err.message}`, "error");
      }
    });
  }
  
  const deleteEventBtn = qs("delete_event");
  if (deleteEventBtn) {
    deleteEventBtn.addEventListener("click", async () => {
      const selector = qs("event_selector");
      const eventId = Number(selector?.value);
      if (!eventId) {
        showToast("Silinecek etkinlik seçilmedi", "warning");
        return;
      }
      const eventName = selector.options[selector.selectedIndex]?.textContent || "Etkinlik";
      const confirmed = window.confirm(
        `"${eventName}" etkinliğini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`
      );
      if (!confirmed) return;
      try {
        await apiDelete(`/api/events/${eventId}`);
        showToast("Etkinlik başarıyla silindi", "success");
        if (typeof loadEvents === "function") await loadEvents();
        if (typeof updateEventStatus === "function") {
          const eventData = await apiGet("/api/event");
          updateEventStatus(eventData);
        }
      } catch (err) {
        console.error("Delete event error:", err);
        showToast(`Hata: ${err.message}`, "error");
      }
    });
  }
}

/**
 * Event listener'ları kurar
 */
function setupEventListeners() {
  // Tab switching
  document.querySelectorAll(".tab-button").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });
  
  // Load Next Match
  const btnLoadNext = qs("btn_load_next_match");
  if (btnLoadNext) {
    btnLoadNext.addEventListener("click", () => {
      if (typeof loadNextMatchAndSelect === "function") {
        loadNextMatchAndSelect();
      }
    });
  }
  
  // Show Preview
  // ÖNEMLİ: Bu buton, takvimden seçip yüklenen maç bilgisini (currentMatch) 
  // Audience display'e gönderir ve hakem tabletlerini bu maçı kontrol etmek üzere hazırlar.
  const btnPreview = qs("btn_show_preview");
  if (btnPreview) {
    btnPreview.addEventListener("click", async () => {
      // Çift tıklamayı önle
      if (btnPreview.disabled) {
        return; // Zaten işlem yapılıyor
      }
      
      // Buton loading state
      if (typeof setButtonLoading === "function") {
        setButtonLoading(btnPreview, true);
      }
      
      try {
        console.log("Ön izleme göster butonuna tıklandı");
        console.log("Ön izleme göster: Mevcut durum - currentMatch:", currentMatch);
        console.log("Ön izleme göster: Mevcut durum - manuallySelectedMatchId:", manuallySelectedMatchId);
        console.log("Ön izleme göster: Mevcut durum - manuallySelectedMatchSource:", manuallySelectedMatchSource);
        
        // ÖNEMLİ: currentMatch'i kullan, next.match'i değil!
        // Kullanıcı zaten takvimden bir maç seçmiş, onu kullanmalıyız
        if (!currentMatch) {
          console.warn("Ön izleme göster: currentMatch YOK! Sıradaki maç kullanılacak (fallback)");
          // Eğer currentMatch yoksa, sıradaki maçı kullan (fallback)
          const next = await apiGet("/api/match-control/next-match");
          if (!next.match) {
            console.error("Ön izleme göster: Sıradaki maç da bulunamadı!");
            showToast("Seçili maç yok ve sıradaki maç bulunamadı", "warning");
            return;
          }
          // Fallback: next.match'i currentMatch olarak kullan
          currentMatch = next.match;
          console.log(`Ön izleme göster: currentMatch yok, sıradaki maç kullanılıyor - ID: ${currentMatch.id}, Number: ${currentMatch.match_number}`);
        } else {
          console.log(`Ön izleme göster: Seçili maç kullanılıyor - ID: ${currentMatch.id}, Number: ${currentMatch.match_number}, Source: ${currentMatch.source || currentMatch.match_source || "schedule"}`);
        }
        
        // currentMatch objesini normalize et (eksik field'ları tamamla)
        const matchSource = currentMatch.source || currentMatch.match_source || "schedule";
        const normalizedMatch = {
          ...currentMatch,
          source: matchSource,
          match_source: matchSource,
          status: "preview", // Preview olarak işaretle
          match_type: currentMatch.match_type || (matchSource === "practice" ? "practice" : "qualification")
        };
        
        console.log(`Ön izleme göster: Normalize edilmiş maç - ID: ${normalizedMatch.id}, Number: ${normalizedMatch.match_number}, Source: ${matchSource}`);
        
        // Backend'e preview bildir (hakem tabletleri için)
        await apiPost("/api/match-control/preview", {
          match_id: normalizedMatch.id,
          match_source: matchSource
        });
        
        console.log(`Ön izleme göster: Preview yapıldı - ID: ${normalizedMatch.id}`);
        
        // ÖNEMLİ: Manuel seçimi kaydet - checkActiveMatch ve updateMatchStatus bunu override etmemeli
        manuallySelectedMatchId = normalizedMatch.id;
        manuallySelectedMatchSource = matchSource;
        
        console.log(`Ön izleme göster: Manuel seçim kaydedildi - ID: ${normalizedMatch.id}, Source: ${matchSource}`);
        
        // currentMatch'i güncelle (preview olarak işaretle)
        currentMatch = normalizedMatch;
        
        // MatchCore'u önizleme maçı ile güncelle (ekranda maç bilgisinin görünmesi için)
        const matchCoreInstance = typeof getMatchCoreInstance === "function" ? getMatchCoreInstance() : null;
        if (matchCoreInstance && typeof matchCoreInstance.setManualSelection === "function") {
          matchCoreInstance.setManualSelection(normalizedMatch.id, matchSource);
        }
        if (matchCoreInstance && typeof matchCoreInstance.setMatch === "function") {
          matchCoreInstance.setMatch(
            { ...normalizedMatch, match_source: matchSource, source: matchSource },
            true
          );
        }
        
        // UI'ı güncelle
        if (typeof renderMatchDisplay === "function") {
          renderMatchDisplay();
        }
        
        // Önizleme maç bilgisini ekranda göstermek için "Aktif Maç" sekmesine geç
        if (typeof switchTab === "function") {
          switchTab("active-match");
        }
        
        // Skorlama verilerini uygula
        if (typeof applyScoringData === "function") {
          applyScoringData(normalizedMatch.scoring_data || {});
        }
        if (typeof calculateScoreBreakdown === "function") {
          calculateScoreBreakdown();
        }
        
        // Event ve takım bilgilerini al (Audience display için)
        const eventData = await apiGet("/api/event");
        const rankings = {};
        const rankingList = Array.isArray(eventData.rankings) ? eventData.rankings : [];
        rankingList.forEach((row) => {
          if (row?.team_number && row?.rank) {
            rankings[String(row.team_number)] = row.rank;
          }
        });
        
        // Takım bilgilerini al
        const teamsData = await apiGet("/api/teams");
        const teamsMap = {};
        if (Array.isArray(teamsData)) {
          teamsData.forEach(team => {
            if (team.number) {
              teamsMap[String(team.number)] = {
                number: team.number,
                name: team.name || "",
                school: team.school || ""
              };
            }
          });
        }
        
        // Seyirci ekranlarına preview gönder (VS sayfası için; üst bar + bar altı yeşil ekran)
        await apiPost("/api/screens/preview", {
          view: "match",
          mode: "preview",
          duration_seconds: 0,
          payload: { 
            match: normalizedMatch,
            rankings,
            teams: teamsMap,
            type: "vs_preview",
            event_name: eventData?.name || eventData?.event_name || "Maç Önizlemesi"
          }
        });
        
        console.log(`Ön izleme göster: Tamamlandı - currentMatch ID: ${currentMatch?.id}, Number: ${currentMatch?.match_number}`);
        
        showToast(`Maç ${normalizedMatch.match_number} önizlemesi gönderildi`, "success");
      } catch (err) {
        console.error("Ön izleme göster: Hata:", err);
        showToast("Önizleme gönderilemedi", "error");
      } finally {
        // Buton loading state'i kaldır
        if (typeof setButtonLoading === "function") {
          setButtonLoading(btnPreview, false);
        }
      }
    });
  }

  const btnShowLive = qs("btn_show_live");
  if (btnShowLive) {
    btnShowLive.addEventListener("click", async () => {
      if (btnShowLive.disabled) return;
      if (typeof setButtonLoading === "function") {
        setButtonLoading(btnShowLive, true);
      }
      try {
        // Maç sonrası görüntü: Sonuçları göster ile aynı yeri çağır (seyirci ekranında bar + sonuçlar)
        if (typeof sendMatchResultsToScreens === "function" && currentMatch) {
          await sendMatchResultsToScreens();
        } else {
          // Seçili maç yoksa preview'i temizle, canlı maç görünümü gelsin
          await apiPost("/api/screens/preview", {
            view: "match",
            mode: "live"
          });
          showToast("Maç ekranı canlı moda alındı", "success");
        }
      } catch (err) {
        console.error("Maçı göster error:", err);
        showToast("Maç ekranı güncellenemedi", "error");
      } finally {
        if (typeof setButtonLoading === "function") {
          setButtonLoading(btnShowLive, false);
        }
      }
    });
  }
  
  // Maç başlatma (üst bar'dan)
  const btnStart = qs("btn_start_match");
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      if (typeof startMatch === "function") {
        startMatch();
      }
    });
  }
  
  // Sonraki aşama
  const btnNextState = qs("btn_next_state");
  if (btnNextState) {
    btnNextState.addEventListener("click", () => {
      if (typeof nextMatchState === "function") {
        nextMatchState();
      }
    });
  }
  
  // Maç durdurma
  const btnStop = qs("btn_stop_match");
  if (btnStop) {
    btnStop.addEventListener("click", () => {
      if (typeof stopMatch === "function") {
        stopMatch();
      }
    });
  }

  // Aktif maçı sıfırla (takılı kalan maç için)
  const btnResetActive = qs("btn_reset_active");
  if (btnResetActive) {
    btnResetActive.addEventListener("click", () => {
      if (typeof resetActiveMatch === "function") {
        resetActiveMatch();
      }
    });
  }

  // Sonuçları göster
  const btnShowResults = qs("btn_show_results");
  if (btnShowResults) {
    btnShowResults.addEventListener("click", () => {
      if (typeof sendMatchResultsToScreens === "function") {
        sendMatchResultsToScreens();
      }
    });
  }
  
  // Maç tamamlama
  const btnComplete = qs("btn_complete_match");
  if (btnComplete) {
    btnComplete.addEventListener("click", () => {
      if (typeof completeMatch === "function") {
        completeMatch();
      }
    });
  }
  
  // Commit & Post
  const btnCommit = qs("btn_commit_post");
  if (btnCommit) {
    btnCommit.addEventListener("click", () => {
      if (typeof commitAndPostMatch === "function") {
        commitAndPostMatch();
      }
    });
  }

  // Skor düzenleme kaydet
  const btnScoreEditSave = qs("btn_score_edit_save");
  if (btnScoreEditSave) {
    btnScoreEditSave.addEventListener("click", () => {
      if (typeof saveScoreEdit === "function") {
        saveScoreEdit();
      }
    });
  }
  const btnScoreEditShowResults = qs("btn_score_edit_show_results");
  if (btnScoreEditShowResults) {
    btnScoreEditShowResults.addEventListener("click", () => {
      if (typeof showScoreEditResults === "function") {
        showScoreEditResults();
      }
    });
  }
  
  // Skor güncelleme (detaylı skorlama alanlarından)
  document.querySelectorAll(".score-field").forEach(input => {
    input.addEventListener("change", () => {
      if (typeof calculateScoreBreakdown === "function") {
        calculateScoreBreakdown();
      }
    });
    input.addEventListener("input", () => {
      if (typeof calculateScoreBreakdown === "function") {
        calculateScoreBreakdown();
      }
    });
  });
  
  // "Güncelle" butonları ekle (her ittifak için)
  const updateButtons = document.createElement("div");
  updateButtons.className = "score-update-buttons";
  updateButtons.innerHTML = `
    <button class="btn-primary btn-medium" onclick="updateScoreFromDetailedScoring()">Tüm Skorları Güncelle</button>
  `;
  
  // Skor güncelleme butonunu ekle (detaylı skorlama panellerinin altına)
  document.querySelectorAll(".detailed-scoring-panel").forEach(panel => {
    const existingButtons = panel.querySelector(".score-update-buttons");
    if (!existingButtons) {
      const buttonsDiv = document.createElement("div");
      buttonsDiv.className = "score-update-buttons";
      buttonsDiv.style.marginTop = "16px";
      buttonsDiv.innerHTML = `
        <button class="btn-primary btn-small" onclick="updateScoreFromDetailedScoring()">Skorları Güncelle</button>
      `;
      panel.appendChild(buttonsDiv);
    }
  });
  
  // Checkbox'lar için event listener'lar
  document.querySelectorAll("input[type='checkbox'][data-points]").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      if (typeof calculateScoreBreakdown === "function") {
        calculateScoreBreakdown();
      }
    });
  });
  
  // Kırmızı kart checkbox'ları
  document.querySelectorAll("input[type='checkbox'][id$='_red_card_r1'], input[type='checkbox'][id$='_red_card_r2']").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      if (typeof calculateScoreBreakdown === "function") {
        calculateScoreBreakdown();
      }
      // Kırmızı kart durumunda uyarı göster
      if (checkbox.checked) {
        const alliance = checkbox.id.includes("blue") ? "Mavi" : "Kırmızı";
        showToast(`${alliance} ittifakında kırmızı kart verildi - Diskalifiye`, "warning");
      }
    });
  });
  
  // Filtreler
  const fieldSelector = qs("field_selector");
  const matchTypeSelector = qs("match_type_selector");
  if (fieldSelector) {
    fieldSelector.addEventListener("change", () => {
      if (typeof loadMatchList === "function") {
        loadMatchList();
      }
    });
  }
  if (matchTypeSelector) {
    matchTypeSelector.addEventListener("change", () => {
      if (typeof loadMatchList === "function") {
        loadMatchList();
      }
    });
  }
  
  // Schedule tab filtreleri
  const scheduleFieldSelector = qs("schedule_field_selector");
  const scheduleMatchTypeSelector = qs("schedule_match_type_selector");
  if (scheduleFieldSelector) {
    scheduleFieldSelector.addEventListener("change", () => {
      if (typeof loadScheduleMatches === "function") {
        loadScheduleMatches();
      }
    });
  }
  if (scheduleMatchTypeSelector) {
    scheduleMatchTypeSelector.addEventListener("change", () => {
      if (typeof loadScheduleMatches === "function") {
        loadScheduleMatches();
      }
    });
  }

  // Seyirci ekranları ayarları
  const btnSaveScreenSettings = qs("mc_save_screen_settings");
  if (btnSaveScreenSettings) {
    btnSaveScreenSettings.addEventListener("click", async () => {
      if (typeof saveMatchControlScreenSettings === "function") {
        await saveMatchControlScreenSettings();
      }
    });
  }
  // Chroma key: renk seçici ile hex alanını senkron tut
  const chromaColorPicker = qs("mc_screen_overlay_chroma_color");
  const chromaHexInput = qs("mc_screen_overlay_chroma_color_hex");
  if (chromaColorPicker && chromaHexInput) {
    chromaColorPicker.addEventListener("input", () => {
      chromaHexInput.value = chromaColorPicker.value;
    });
    chromaHexInput.addEventListener("input", () => {
      const hex = chromaHexInput.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) chromaColorPicker.value = hex;
    });
  }

  // Kompakt skor butonları için event listener'lar
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-score-plus") || e.target.classList.contains("btn-score-minus")) {
      e.preventDefault();
      e.stopPropagation();
      const fieldId = e.target.dataset.field;
      const field = qs(fieldId);
      if (field) {
        const currentValue = parseInt(field.value) || 0;
        const maxValue = field.hasAttribute("max") ? parseInt(field.getAttribute("max")) : null;
        const newValue = e.target.classList.contains("btn-score-plus") 
          ? (maxValue !== null ? Math.min(maxValue, currentValue + 1) : currentValue + 1)
          : Math.max(0, currentValue - 1);
        field.value = newValue;
        // Input event'ini tetikle ki diğer listener'lar da çalışsın
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        // Skor dökümünü hesapla
        if (typeof calculateScoreBreakdown === "function") {
          calculateScoreBreakdown();
        }
      }
    }
  });
  
  // Skor alanları değiştiğinde hesapla ve otomatik kaydet
  document.addEventListener("input", (e) => {
    // Skor alanları için
    if (e.target.classList.contains("score-field-compact") || 
        e.target.classList.contains("score-field") ||
        e.target.matches("#detailed_scoring input, #detailed_scoring select")) {
      // Skor dökümünü hesapla
      if (typeof calculateScoreBreakdown === "function") {
        calculateScoreBreakdown();
      }
      // Otomatik kaydetmeyi planla (debounce)
      if (typeof scheduleAutoSaveScore === "function") {
        scheduleAutoSaveScore();
      }
    }
  });
  
  // Checkbox değişiklikleri için de otomatik kaydet
  document.addEventListener("change", (e) => {
    if (e.target.matches("#detailed_scoring input[type='checkbox'], #detailed_scoring input[type='number']")) {
      // Skor dökümünü hesapla
      if (typeof calculateScoreBreakdown === "function") {
        calculateScoreBreakdown();
      }
      // Otomatik kaydetmeyi planla (debounce)
      if (typeof scheduleAutoSaveScore === "function") {
        scheduleAutoSaveScore();
      }
    }
  });
}
