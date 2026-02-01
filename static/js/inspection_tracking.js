/**
 * İnceleme Takip Paneli Modülü
 * 
 * Takımların inceleme durumlarını gösteren dashboard.
 * Bar chart ve liste görünümü içerir.
 */

(function() {
  'use strict';

  // State
  let teamsData = [];
  let slotsData = [];
  let currentFilter = 'all';
  let autoRefreshInterval = null;

  /**
   * Modülü başlatır
   */
  async function init() {
    console.log('[InspectionTracking] Initializing...');
    
    // Event listener'ları ekle
    setupEventListeners();
    
    // İlk verileri yükle
    await loadData();
    
    // Otomatik yenileme başlat
    startAutoRefresh();
  }

  /**
   * Event listener'ları ayarlar
   */
  function setupEventListeners() {
    // Filter butonları
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderTeamsList();
      });
    });
    
    // Yenile butonu
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadData);
    }
    
    // Otomatik yenileme checkbox
    const autoRefreshCheckbox = document.getElementById('auto-refresh');
    if (autoRefreshCheckbox) {
      autoRefreshCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          startAutoRefresh();
        } else {
          stopAutoRefresh();
        }
      });
    }
  }

  /**
   * Verileri API'den yükler
   */
  async function loadData() {
    try {
      const response = await fetch('/api/public/inspection-status');
      if (!response.ok) throw new Error('API hatası');
      
      const data = await response.json();
      teamsData = data.teams || [];
      slotsData = data.slots || [];
      
      // UI güncelle
      updateSummary();
      updateProgressBar();
      renderTeamsList();
      
      console.log('[InspectionTracking] Data loaded:', teamsData.length, 'teams');
    } catch (error) {
      console.error('[InspectionTracking] Load error:', error);
      showError('Veriler yüklenirken hata oluştu');
    }
  }

  /**
   * Takımların inceleme durumlarını hesaplar
   */
  function calculateStats() {
    const stats = {
      passed: 0,
      failed: 0,
      'not-started': 0,
      total: teamsData.length
    };
    
    // Her takım için en son slot durumunu al
    const teamStatuses = {};
    
    slotsData.forEach(slot => {
      const teamNum = slot.team_number;
      const ts = `${slot.slot_date} ${slot.slot_time}`;
      
      if (!teamStatuses[teamNum] || ts > teamStatuses[teamNum].ts) {
        teamStatuses[teamNum] = {
          status: slot.status,
          ts: ts,
          notes: slot.notes || ''
        };
      }
    });
    
    teamsData.forEach(team => {
      const statusInfo = teamStatuses[team.number];
      if (!statusInfo) {
        stats['not-started']++;
      } else {
        const status = mapStatus(statusInfo.status);
        stats[status]++;
      }
    });
    
    return { stats, teamStatuses };
  }

  /**
   * API durumunu UI durumuna çevirir
   */
  function mapStatus(apiStatus) {
    const statusMap = {
      'completed': 'passed',
      'passed': 'passed',
      'failed': 'failed',
      'pending': 'not-started',
      'in_progress': 'not-started',
      'scheduled': 'not-started',
      'planned': 'not-started',
      'not_started': 'not-started'
    };
    return statusMap[apiStatus] || 'not-started';
  }

  /**
   * Özet kartlarını günceller
   */
  function updateSummary() {
    const { stats } = calculateStats();
    
    document.getElementById('count-passed').textContent = stats.passed;
    document.getElementById('count-failed').textContent = stats.failed;
    document.getElementById('count-not-started').textContent = stats['not-started'];
  }

  /**
   * İlerleme çubuğunu günceller
   */
  function updateProgressBar() {
    const { stats } = calculateStats();
    const total = stats.total || 1;
    
    const passedPct = Math.round((stats.passed / total) * 100);
    const failedPct = Math.round((stats.failed / total) * 100);
    const notStartedPct = 100 - passedPct - failedPct;
    
    // Bar segmentlerini güncelle
    document.getElementById('bar-passed').style.width = passedPct + '%';
    document.getElementById('bar-passed').textContent = passedPct > 5 ? passedPct + '%' : '';
    
    document.getElementById('bar-failed').style.width = failedPct + '%';
    document.getElementById('bar-failed').textContent = failedPct > 5 ? failedPct + '%' : '';
    
    document.getElementById('bar-not-started').style.width = notStartedPct + '%';
    document.getElementById('bar-not-started').textContent = notStartedPct > 5 ? notStartedPct + '%' : '';
    
    // Legend güncelle
    document.getElementById('legend-passed').textContent = passedPct;
    document.getElementById('legend-failed').textContent = failedPct;
    document.getElementById('legend-not-started').textContent = notStartedPct;
  }

  /**
   * Takım listesini render eder
   */
  function renderTeamsList() {
    const tbody = document.getElementById('teams-table-body');
    if (!tbody) return;
    
    const { teamStatuses } = calculateStats();
    
    // Takımları filtrele ve sırala
    let filteredTeams = teamsData.map(team => {
      const statusInfo = teamStatuses[team.number];
      const status = statusInfo ? mapStatus(statusInfo.status) : 'not-started';
      return {
        ...team,
        status: status,
        lastInspection: statusInfo?.ts || null,
        notes: statusInfo?.notes || ''
      };
    });
    
    // Filtre uygula
    if (currentFilter !== 'all') {
      filteredTeams = filteredTeams.filter(t => t.status === currentFilter);
    }
    
    // Sırala (duruma göre: failed > not-started > passed)
    const statusOrder = { 'failed': 0, 'not-started': 1, 'passed': 2 };
    filteredTeams.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return a.number.localeCompare(b.number);
    });
    
    if (filteredTeams.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 40px; color: #666;">
            ${currentFilter === 'all' ? 'Henüz takım kaydı yok' : 'Bu filtreye uygun takım yok'}
          </td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = filteredTeams.map(team => `
      <tr>
        <td><strong>${escapeHtml(team.number)}</strong></td>
        <td>${escapeHtml(team.name || '-')}</td>
        <td>
          <span class="status-badge ${team.status}">
            ${getStatusLabel(team.status)}
          </span>
        </td>
        <td class="inspection-time">
          ${team.lastInspection ? formatDateTime(team.lastInspection) : '-'}
        </td>
        <td>${escapeHtml(team.notes) || '-'}</td>
      </tr>
    `).join('');
  }

  /**
   * Durum etiketini döndürür
   */
  function getStatusLabel(status) {
    const labels = {
      'passed': '✅ Geçti',
      'failed': '❌ Kaldı',
      'not-started': '📋 Başlamadı'
    };
    return labels[status] || status;
  }

  /**
   * Tarih/saat formatlar
   */
  function formatDateTime(datetime) {
    if (!datetime) return '-';
    try {
      const parts = datetime.split(' ');
      if (parts.length >= 2) {
        return `${parts[0]} ${parts[1]}`;
      }
      return datetime;
    } catch (e) {
      return datetime;
    }
  }

  /**
   * HTML escape
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Hata mesajı gösterir
   */
  function showError(message) {
    const tbody = document.getElementById('teams-table-body');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 40px; color: #f44336;">
            ${message}
          </td>
        </tr>
      `;
    }
  }

  /**
   * Otomatik yenilemeyi başlatır
   */
  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(loadData, 30000); // 30 saniye
    console.log('[InspectionTracking] Auto-refresh started');
  }

  /**
   * Otomatik yenilemeyi durdurur
   */
  function stopAutoRefresh() {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
      console.log('[InspectionTracking] Auto-refresh stopped');
    }
  }

  // Sayfa yüklendiğinde başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Sayfa kapatılırken interval'i temizle
  window.addEventListener('beforeunload', stopAutoRefresh);

})();
