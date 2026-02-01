/**
 * Audience Ceremony Module
 * Seyirci ekranında ödül töreni görünümünü yönetir
 */

(function() {
  'use strict';

  // Ceremony state
  let currentCeremonyState = null;
  let currentAwardData = null;

  /**
   * Initialize ceremony view
   */
  function initCeremony() {
    console.log('[Ceremony] Initializing audience ceremony view...');
    
    // Socket listeners - AudienceCore üzerinden gelecek
    // Eski socket listener'ı kaldırıyoruz, artık AudienceCore ceremony_update'i yönetiyor
    
    // Load initial state
    loadCeremonyState();
  }

  /**
   * Load ceremony state from API
   */
  async function loadCeremonyState() {
    try {
      const response = await fetch('/api/public/ceremony');
      if (!response.ok) {
        console.warn('[Ceremony] Could not load ceremony state');
        return;
      }
      
      const data = await response.json();
      handleCeremonyUpdate(data);
    } catch (error) {
      console.error('[Ceremony] Error loading ceremony state:', error);
    }
  }

  /**
   * Handle ceremony state update (WebSocket veya API'den)
   */
  function handleCeremonyUpdate(data) {
    console.log('[Ceremony] State update:', data);
    currentCeremonyState = data;
    
    if (data.current_award) {
      currentAwardData = data.current_award;
    }
    
    // Update the ceremony view
    renderCeremonyView(data);
  }

  /**
   * Render ceremony view based on state
   * 
   * Adım sırası:
   * 1. showing_award - Ödül adı ve açıklaması
   * 2. showing_note - Jüri notu (açıklamayla aynı font)
   * 3. showing_winner - Takım numarası ve adı
   * 
   * NOT: Bu fonksiyon view gizli olsa bile çağrılabilir.
   * State'i saklar ve view görünür olduğunda doğru içeriği gösterir.
   */
  function renderCeremonyView(state) {
    // State'i sakla (view gizli olsa bile)
    currentCeremonyState = state;
    
    const ceremonyView = document.getElementById('audience_ceremony_view');
    if (!ceremonyView) {
      console.log('[Ceremony] View element bulunamadı, state saklandı');
      return;
    }
    
    const idle = document.getElementById('ceremony-idle');
    const awardName = document.getElementById('ceremony-award-name');
    const awardDesc = document.getElementById('ceremony-award-description');
    const juryNote = document.getElementById('ceremony-jury-note');
    const winner = document.getElementById('ceremony-winner');
    
    // Hide all elements first
    [idle, awardName, awardDesc, juryNote, winner].forEach(el => {
      if (el) el.classList.add('hidden');
    });
    
    if (!state.is_active) {
      // Show idle state
      if (idle) {
        idle.classList.remove('hidden');
      }
      return;
    }
    
    const award = state.current_award;
    if (!award) {
      if (idle) idle.classList.remove('hidden');
      return;
    }
    
    const step = state.current_step || 'showing_award';
    
    // Update award name content
    if (awardName) {
      const iconEl = awardName.querySelector('.award-icon');
      const titleEl = awardName.querySelector('.award-title');
      if (iconEl) iconEl.textContent = award.icon || '🏆';
      if (titleEl) titleEl.textContent = award.award_name || '';
    }
    
    // Update award description
    if (awardDesc) {
      const descEl = awardDesc.querySelector('.description-text');
      if (descEl) descEl.textContent = award.award_description || '';
    }
    
    // Update jury note (aynı font boyutu açıklamayla)
    if (juryNote) {
      const noteEl = juryNote.querySelector('.jury-note-text');
      if (noteEl) noteEl.textContent = award.jury_note || '';
    }
    
    // Update winner info
    if (winner) {
      const numEl = winner.querySelector('.winner-team-number');
      const nameEl = winner.querySelector('.winner-team-name');
      if (numEl) numEl.textContent = award.winner_team_number || '—';
      if (nameEl) nameEl.textContent = award.winner_team_name || '';
    }
    
    // Show elements based on current step
    // Sıralama: award -> note -> winner (jüri notu takımdan önce)
    switch (step) {
      case 'showing_award':
        if (awardName) {
          awardName.classList.remove('hidden');
          // Trigger animation by removing and re-adding class
          awardName.style.animation = 'none';
          awardName.offsetHeight; // Trigger reflow
          awardName.style.animation = null;
        }
        if (awardDesc && award.award_description) {
          awardDesc.classList.remove('hidden');
        }
        break;
        
      case 'showing_note':
        // Ödül adı ve açıklaması gösterilmeye devam eder
        if (awardName) awardName.classList.remove('hidden');
        if (awardDesc && award.award_description) awardDesc.classList.remove('hidden');
        // Jüri notu gösterilir (varsa)
        if (juryNote && award.jury_note) {
          juryNote.classList.remove('hidden');
          // Trigger animation
          juryNote.style.animation = 'none';
          juryNote.offsetHeight;
          juryNote.style.animation = null;
        }
        break;
        
      case 'showing_winner':
        // Ödül adı, açıklaması ve jüri notu gösterilmeye devam eder
        if (awardName) awardName.classList.remove('hidden');
        if (awardDesc && award.award_description) awardDesc.classList.remove('hidden');
        if (juryNote && award.jury_note) juryNote.classList.remove('hidden');
        // Kazanan gösterilir
        if (winner && award.winner_team_number) {
          winner.classList.remove('hidden');
          // Trigger animation
          winner.style.animation = 'none';
          winner.offsetHeight;
          winner.style.animation = null;
          // Optional: Create confetti effect
          createConfetti();
        }
        break;
        
      default:
        if (idle) idle.classList.remove('hidden');
    }
  }

  /**
   * Create confetti effect
   */
  function createConfetti() {
    const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ff9ff3'];
    const ceremonyView = document.getElementById('audience_ceremony_view');
    if (!ceremonyView) return;
    
    // Clear existing confetti
    const existingConfetti = ceremonyView.querySelectorAll('.confetti-particle');
    existingConfetti.forEach(c => c.remove());
    
    // Create new confetti particles
    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti-particle';
      confetti.style.left = Math.random() * 100 + 'vw';
      confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.animationDelay = Math.random() * 3 + 's';
      confetti.style.animationDuration = (3 + Math.random() * 2) + 's';
      confetti.style.width = (5 + Math.random() * 10) + 'px';
      confetti.style.height = (5 + Math.random() * 10) + 'px';
      confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
      ceremonyView.appendChild(confetti);
      
      // Remove after animation
      setTimeout(() => confetti.remove(), 5000);
    }
  }

  /**
   * Check if ceremony view is active
   */
  function isCeremonyViewActive() {
    const ceremonyView = document.getElementById('audience_ceremony_view');
    return ceremonyView && ceremonyView.style.display !== 'none';
  }

  /**
   * Show ceremony view
   */
  function showCeremonyView() {
    // Hide all other panels
    document.querySelectorAll('.audience-panel').forEach(panel => {
      panel.style.display = 'none';
    });
    
    const ceremonyView = document.getElementById('audience_ceremony_view');
    if (ceremonyView) {
      ceremonyView.style.display = 'flex';
      
      // Eğer zaten state varsa hemen render et (WebSocket'ten gelmiş olabilir)
      if (currentCeremonyState) {
        console.log('[Ceremony] Mevcut state render ediliyor:', currentCeremonyState);
        renderCeremonyView(currentCeremonyState);
      } else {
        // State yoksa API'den yükle
        loadCeremonyState();
      }
    }
  }

  // Export functions
  window.AudienceCeremony = {
    init: initCeremony,
    loadState: loadCeremonyState,
    show: showCeremonyView,
    isActive: isCeremonyViewActive,
    handleUpdate: handleCeremonyUpdate  // WebSocket üzerinden çağrılacak
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCeremony);
  } else {
    initCeremony();
  }
})();
