/**
 * Audience Display - UI Module
 * Timer tüm arayüzlerde akıcı ve senkron: sunucudan gelen time_remaining ile yerel geri sayım.
 */

/** Yerel timer (akıcı geri sayım, WebSocket ile senkron) */
let audienceTimerInterval = null;
let audienceTimerStartTime = null;
let audienceTimerInitialTime = null;
let audienceTimerState = null;
// Oyun sonu uyarısı: SKS (driver_controlled) bitimine 30 sn kala bir kez ses çalınır.
// "end_game" artık ayrı bir faz değil; uyarı yerel timer sayımıyla tetiklenir.
let audienceEndgameWarned = false;

/**
 * Zamanı formatlar (MM:SS formatında)
 * 
 * @param {number} seconds - Saniye cinsinden zaman
 * @returns {string} - Formatlanmış zaman (MM:SS)
 */
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Timer görüntüsünü günceller (animasyonlu ve durum bazlı)
 * 
 * @param {number} timeRemaining - Kalan süre (saniye)
 * @param {string} currentState - Mevcut maç durumu
 * @param {number} timeOffset - Client-server zaman farkı (ms, opsiyonel)
 */
function updateTimerDisplay(timeRemaining, currentState, timeOffset = 0) {
  const timerEl = qs("audience_timer_value");
  if (!timerEl) {
    console.warn("updateTimerDisplay: Timer elementi bulunamadı");
    return;
  }

  // Seyirci ekranında maç sonrası (post_match) son 10 sn geri sayımı gösterme.
  if (currentState === "post_match") {
    timeRemaining = 0;
  }

  function applyTimerDisplay(displayTime) {
    const formattedTime = formatTime(displayTime);
    if (timerEl.textContent !== formattedTime) {
      timerEl.textContent = formattedTime;
    }
    timerEl.classList.remove("warning", "critical");
    if (displayTime <= 10 && displayTime > 0) {
      timerEl.classList.add("critical");
    } else if (displayTime <= 30 && displayTime > 10) {
      timerEl.classList.add("warning");
    }
  }

  var isActive = timeRemaining > 0 && currentState && currentState !== "idle" && currentState !== "completed";
  var stateOrTimeChanged = audienceTimerState !== currentState || audienceTimerInitialTime !== timeRemaining;

  // SKS dışındayken oyun sonu uyarı bayrağını sıfırla (bir sonraki SKS için hazır olsun).
  if (currentState !== "driver_controlled") {
    audienceEndgameWarned = false;
  }
  // Oyun sonu uyarısı eşiği (sn): SKS bitimine bu kadar kala ses çalınır.
  var warnThreshold = (typeof MATCH_CONSTANTS !== "undefined" && MATCH_CONSTANTS.END_GAME_DURATION) || 30;

  function maybeWarnEndgame(remaining) {
    if (currentState === "driver_controlled" && !audienceEndgameWarned &&
        remaining > 0 && remaining <= warnThreshold) {
      audienceEndgameWarned = true;
      if (typeof announceState === "function") {
        announceState("end_game");  // mevcut "düşük ton uzun bip" oyun sonu uyarısı
      }
    }
  }

  if (audienceTimerInterval) {
    clearInterval(audienceTimerInterval);
    audienceTimerInterval = null;
  }

  if (isActive && stateOrTimeChanged) {
    audienceTimerState = currentState;
    audienceTimerInitialTime = timeRemaining;
    // Maç kontrol / hakem tabletleri gibi: alınan time_remaining'den YEREL say.
    // server_timestamp offset'i KULLANMA — seyirci ekranı ayrı bir cihaz (TV/
    // projeksiyon) olabilir ve saati sunucudan farklıysa (örn. 26 sn ileri)
    // otonom 30 yerine 4'ten başlardı. Faz geçişinde match_update anında geldiği
    // için tam süreden başlamak <1 sn hatayla doğrudur.
    audienceTimerStartTime = Date.now();
    applyTimerDisplay(timeRemaining);
    maybeWarnEndgame(timeRemaining);
    audienceTimerInterval = setInterval(function () {
      var elapsed = Math.floor((Date.now() - audienceTimerStartTime) / 1000);
      var remaining = Math.max(0, audienceTimerInitialTime - elapsed);
      applyTimerDisplay(remaining);
      maybeWarnEndgame(remaining);
      if (remaining <= 0) {
        clearInterval(audienceTimerInterval);
        audienceTimerInterval = null;
      }
    }, 100);
  } else {
    audienceTimerState = currentState;
    audienceTimerInitialTime = timeRemaining;
    applyTimerDisplay(timeRemaining);
  }
}

/**
 * Skor görüntüsünü günceller (animasyonlu)
 * 
 * @param {string} alliance - İttifak rengi ("red" veya "blue")
 * @param {number} newScore - Yeni skor
 */
function updateScoreDisplay(alliance, newScore) {
  const scoreEl = qs(`audience_${alliance}_score`);
  if (!scoreEl) return;
  
  const oldScore = parseInt(scoreEl.textContent, 10) || 0;
  const score = parseInt(newScore, 10) || 0;
  
  // Her zaman güncelle (ilk yüklemede veya 0 geldiğinde de görünsün)
  scoreEl.textContent = String(score);
  if (score !== oldScore) {
    scoreEl.classList.add("updating");
    setTimeout(() => {
      scoreEl.classList.remove("updating");
    }, 500);
  }
}

/**
 * Overlay'i uygular (üst metin)
 */
function applyOverlay() {
  const overlay = qs("audience_overlay");
  const text = qs("audience_overlay_text");
  if (!overlay || !text) return;
  text.textContent = overlayText;
  overlay.style.display = overlayEnabled && overlayText ? "block" : "none";
}

/**
 * Chroma key arka planı uygular (yeşil ekran / yayın için).
 * - Ön izleme veya canlı maç ekranında: sadece bar altındaki alan chroma olur; bar yayında kalır.
 * - Diğer ekranlarda: tüm sayfa chroma renge boyanır.
 * @param {boolean} enabled - Chroma key açık mı
 * @param {string} color - Hex renk (örn. #00ff00)
 * @param {string} [layoutMode] - "vs_preview" | "match" | null - bar+chroma layout kullanılıyorsa hangi alan
 */
function applyChromaBackground(enabled, color, layoutMode) {
  const container = document.querySelector(".audience-container");
  const body = document.body;
  const vsChroma = document.getElementById("vs_chroma_area");
  const matchChroma = document.getElementById("match_chroma_area");
  const hex = (color && /^#[0-9A-Fa-f]{6}$/.test(color)) ? color : "#00ff00";
  const darkBg = "#0f172a";
  
  if (layoutMode === "vs_preview" && vsChroma) {
    if (enabled) {
      vsChroma.style.backgroundColor = hex;
      if (matchChroma) matchChroma.style.backgroundColor = "";
    } else {
      vsChroma.style.backgroundColor = "#00ff00";
    }
    if (body) body.style.backgroundColor = darkBg;
    if (container) container.style.backgroundColor = "";
    if (document.documentElement) document.documentElement.style.backgroundColor = darkBg;
    return;
  }
  
  if (layoutMode === "match" && matchChroma) {
    if (enabled) {
      matchChroma.style.backgroundColor = hex;
      if (vsChroma) vsChroma.style.backgroundColor = "";
    } else {
      matchChroma.style.backgroundColor = "#00ff00";
    }
    if (body) body.style.backgroundColor = darkBg;
    if (container) container.style.backgroundColor = "";
    if (document.documentElement) document.documentElement.style.backgroundColor = darkBg;
    return;
  }
  
  if (enabled) {
    if (container) container.style.backgroundColor = hex;
    if (body) body.style.backgroundColor = hex;
    if (document.documentElement) document.documentElement.style.backgroundColor = hex;
    if (vsChroma) vsChroma.style.backgroundColor = "";
    if (matchChroma) matchChroma.style.backgroundColor = "";
  } else {
    if (container) container.style.backgroundColor = "";
    if (body) body.style.backgroundColor = "";
    if (document.documentElement) document.documentElement.style.backgroundColor = "";
    if (vsChroma) vsChroma.style.backgroundColor = "#00ff00";
    if (matchChroma) matchChroma.style.backgroundColor = "#00ff00";
  }
}

/**
 * Takımları sıralama ile formatlar
 * 
 * @param {Array} teams - Takım numaraları dizisi
 * @param {Object} rankings - Sıralama objesi (team_number -> rank)
 * @returns {string} - Formatlanmış takım listesi
 */
function formatTeamsWithRank(teams, rankings) {
  if (!teams || !teams.length) return "-";
  if (!rankings) return teams.join(", ");
  return teams.map((team) => {
    const rank = rankings[team];
    return rank ? `${team} (#${rank})` : team;
  }).join(", ");
}

/**
 * Takım numaralarını isimlerle formatlar (seyirci ekranı maç görünümü için)
 * 
 * @param {Array} teamNumbers - Takım numaraları dizisi
 * @param {Object} teamsMap - Takım numarası -> { name, school } (audienceTeamsMap)
 * @returns {string} - "202520 - Takım Adı, 202523 - Diğer" veya sadece numaralar
 */
function formatTeamsWithNames(teamNumbers, teamsMap) {
  if (!teamNumbers || !teamNumbers.length) return "-";
  const map = teamsMap || (typeof audienceTeamsMap !== "undefined" ? audienceTeamsMap : {});
  return teamNumbers.map((num) => {
    const t = map[String(num)] || {};
    const name = (t.name || "").trim();
    return name ? `${num} – ${name}` : String(num);
  }).join(", ");
}

// Global AudioContext (tüm ses efektleri için tek context - senkronizasyon için önemli)
let globalAudioContext = null;

/**
 * AudioContext'i başlatır (kullanıcı etkileşimi gerektirebilir)
 * 
 * ÖNEMLİ: Browser policy nedeniyle ilk kullanıcı etkileşiminde başlatılmalı
 */
function initAudioContext() {
  if (globalAudioContext) {
    // Eğer suspended ise resume et
    if (globalAudioContext.state === "suspended") {
      globalAudioContext.resume().catch(err => {
        console.warn("AudioContext resume hatası:", err);
      });
    }
    return globalAudioContext;
  }
  
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      console.warn("Web Audio API desteklenmiyor");
      return null;
    }
    
    globalAudioContext = new AudioContext();
    
    // Eğer suspended ise resume et (kullanıcı etkileşimi gerektirebilir)
    if (globalAudioContext.state === "suspended") {
      globalAudioContext.resume().catch(err => {
        console.warn("AudioContext resume hatası:", err);
      });
    }
    
    return globalAudioContext;
  } catch (err) {
    console.warn("AudioContext oluşturulamadı:", err);
    return null;
  }
}

/**
 * Web Audio API ile ses efekti çalar
 * 
 * ÖNEMLİ: Tüm audience ekranlarında aynı WebSocket mesajı geldiği için
 * sesler otomatik olarak senkronize çalar.
 * 
 * @param {number} frequency - Frekans (Hz)
 * @param {number} duration - Süre (saniye)
 * @param {string} type - Ses tipi ("sine", "square", "sawtooth", "triangle")
 * @param {number} volume - Ses seviyesi (0-1)
 */
function playSoundEffect(frequency, duration, type = "sine", volume = 0.3) {
  try {
    // AudioContext'i başlat
    const audioContext = initAudioContext();
    if (!audioContext) {
      return;
    }
    
    // Eğer suspended ise, resume etmeyi dene
    if (audioContext.state === "suspended") {
      audioContext.resume().then(() => {
        // Resume olduktan sonra sesi çal
        playSoundEffectInternal(audioContext, frequency, duration, type, volume);
      }).catch(err => {
        console.warn("AudioContext resume edilemedi:", err);
      });
      return;
    }
    
    // Normal durumda direkt çal
    playSoundEffectInternal(audioContext, frequency, duration, type, volume);
  } catch (err) {
    console.warn("Ses efekti çalınamadı:", err);
  }
}

/**
 * Ses efektini çalar (internal fonksiyon)
 */
function playSoundEffectInternal(audioContext, frequency, duration, type, volume) {
  try {
    // Oscillator oluştur
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    // Ses tipini ayarla
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    
    // Ses seviyesini ayarla (fade in/out ile yumuşak geçiş)
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + duration - 0.05);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
    
    // Bağlantıları kur
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Ses çal
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
    
    // Cleanup (oscillator otomatik olarak kapanır, context'i kapatma)
    oscillator.onended = () => {
      // Context'i kapatma, tekrar kullanılabilir
    };
  } catch (err) {
    console.warn("Ses efekti çalma hatası:", err);
  }
}

/**
 * Durum geçişi için ses efekti çalar
 * 
 * Her maç durumu için farklı ses efekti:
 * - autonomous: Yüksek ton, kısa bip (çocuklar otonom başladığını anlasın)
 * - prepare_teleop: Çift bip (otonom bitti, kontrol ünitelerini hazırlayın)
 * - driver_controlled: Orta ton, bip (sürücü kontrol başladı)
 * - end_game: Düşük ton, uzun bip (oyun sonu uyarısı)
 * - post_match: Çift bip (maç bitti)
 * 
 * ÖNEMLİ: Sesler WebSocket ile senkronize gelir, tüm audience ekranlarında aynı anda çalar
 * 
 * @param {string} state - Maç durumu
 */
function announceState(state) {
  if (!state) return;
  
  // Ses efektleri tanımları
  const soundEffects = {
    autonomous: {
      frequency: 800,  // Yüksek ton
      duration: 0.3,
      type: "sine",
      volume: 0.4
    },
    prepare_teleop: {
      frequency: 700,  // Otonom-bitiş uyarısı (çift bip)
      duration: 0.18,
      type: "sine",
      volume: 0.4
    },
    driver_controlled: {
      frequency: 600,  // Orta ton
      duration: 0.25,
      type: "sine",
      volume: 0.35
    },
    end_game: {
      frequency: 400,  // Düşük ton
      duration: 0.6,   // Uzun bip
      type: "sine",
      volume: 0.4
    },
    post_match: {
      frequency: 500,  // Orta ton
      duration: 0.2,
      type: "sine",
      volume: 0.35
    }
  };
  
  const effect = soundEffects[state];
  if (!effect) {
    console.log(`Bilinmeyen maç durumu için ses efekti yok: ${state}`);
    return;
  }
  
  // Özel durum: post_match ve prepare_teleop için çift bip
  if (state === "post_match" || state === "prepare_teleop") {
    playSoundEffect(effect.frequency, effect.duration, effect.type, effect.volume);
    setTimeout(() => {
      playSoundEffect(effect.frequency, effect.duration, effect.type, effect.volume);
    }, effect.duration * 1000 + 100); // 100ms ara ile
  } else {
    // Normal durumlar için tek bip
    playSoundEffect(effect.frequency, effect.duration, effect.type, effect.volume);
  }
  
  console.log(`Maç durumu ses efekti çalındı: ${state}`);
}

/**
 * Maç sonuçları için ses efekti çalar
 * 
 * Maç sonunda özel bir melodi veya çift bip çalar.
 * Çocuklar maçın bittiğini ve sonuçların gösterileceğini anlasın.
 * 
 * @param {Object} results - Maç sonuçları
 */
function announceResults(results) {
  if (!results) return;
  
  // Maç sonu için özel melodi: Üç notalı yükselen melodi
  const notes = [
    { frequency: 523, duration: 0.15 },  // C5
    { frequency: 659, duration: 0.15 },  // E5
    { frequency: 784, duration: 0.3 }    // G5 (uzun)
  ];
  
  let delay = 0;
  notes.forEach((note, index) => {
    setTimeout(() => {
      playSoundEffect(note.frequency, note.duration, "sine", 0.4);
    }, delay);
    delay += note.duration * 1000 + 50; // Her notadan sonra 50ms ara
  });
  
  console.log("Maç sonu ses efekti çalındı");
}
