/**
 * Audience Display - UI Module
 * 
 * Bu modül UI güncellemeleri ile ilgili tüm fonksiyonları içerir:
 * - Timer güncellemeleri
 * - Skor güncellemeleri
 * - Overlay yönetimi
 * - Takım formatlama
 */

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
 */
function updateTimerDisplay(timeRemaining, currentState) {
  const timerEl = qs("audience_timer_value");
  if (!timerEl) return;
  
  const formattedTime = formatTime(timeRemaining);
  const oldTime = timerEl.textContent;
  
  // Zaman değiştiyse güncelle
  if (formattedTime !== oldTime) {
    timerEl.textContent = formattedTime;
  }
  
  // Durum bazlı stil güncellemeleri
  timerEl.classList.remove("warning", "critical");
  
  if (timeRemaining <= 10 && timeRemaining > 0) {
    // Kritik: Son 10 saniye
    timerEl.classList.add("critical");
  } else if (timeRemaining <= 30 && timeRemaining > 10) {
    // Uyarı: Son 30 saniye
    timerEl.classList.add("warning");
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
  
  const oldScore = parseInt(scoreEl.textContent) || 0;
  const score = parseInt(newScore) || 0;
  
  // Skor değiştiyse güncelle ve animasyon ekle
  if (score !== oldScore) {
    scoreEl.textContent = score;
    
    // Animasyon ekle
    scoreEl.classList.add("updating");
    setTimeout(() => {
      scoreEl.classList.remove("updating");
    }, 500);
  }
}

/**
 * Overlay'i uygular
 */
function applyOverlay() {
  const overlay = qs("audience_overlay");
  const text = qs("audience_overlay_text");
  if (!overlay || !text) return;
  text.textContent = overlayText;
  overlay.style.display = overlayEnabled && overlayText ? "block" : "none";
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
 * ÖNEMLİ: Tüm audience ekranlarında aynı SSE mesajı geldiği için
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
 * - driver_controlled: Orta ton, bip (sürücü kontrol başladı)
 * - end_game: Düşük ton, uzun bip (oyun sonu uyarısı)
 * - post_match: Çift bip (maç bitti)
 * 
 * ÖNEMLİ: Sesler SSE ile senkronize gelir, tüm audience ekranlarında aynı anda çalar
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
  
  // Özel durum: post_match için çift bip
  if (state === "post_match") {
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
