/**
 * Utility Fonksiyonlar
 * 
 * Genel amaçlı yardımcı fonksiyonlar, validasyon, toast mesajları vb.
 */

/**
 * Element seçici - getElementById kısayolu
 * @param {string} id - Element ID'si
 * @returns {HTMLElement|null} Element veya null
 */
const qs = (id) => document.getElementById(id);

/**
 * Kullanıcıya bildirim mesajı gösterir (toast notification)
 * 
 * @param {string} message - Gösterilecek mesaj
 * @param {string} type - Mesaj tipi: "success", "error", "warning", "info"
 * 
 * Örnek:
 *   showToast("Kayıt başarılı", "success");
 *   showToast("Hata oluştu", "error");
 */
function showToast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-message">${escapeHtml(message)}</div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideIn 0.3s ease-out reverse";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * HTML escape - XSS koruması için
 * @param {string} value - Escape edilecek değer
 * @returns {string} Escape edilmiş değer
 */
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * CSV escape - CSV export için
 * @param {any} value - Escape edilecek değer
 * @returns {string} CSV-safe string
 */
function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

/**
 * Buton loading durumu
 * @param {HTMLElement} button - Buton elementi
 * @param {boolean} loading - Loading durumu
 */
function setButtonLoading(button, loading) {
  if (!button) return;
  if (loading) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = "Yükleniyor...";
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
    }
  }
}

/**
 * Etkinlik kodu validasyonu
 * @param {string} code - Etkinlik kodu
 * @returns {boolean} Geçerli ise true
 */
function validateEventCode(code) {
  if (code.length > 4) {
    showToast("Etkinlik kodu en fazla 4 karakter olabilir", "error");
    return false;
  }
  return true;
}

/**
 * Tarih validasyonu
 * @param {string} startDate - Başlangıç tarihi
 * @param {string} endDate} - Bitiş tarihi
 * @returns {boolean} Geçerli ise true
 */
function validateDates(startDate, endDate) {
  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    showToast("Bitiş tarihi başlangıç tarihinden önce olamaz", "error");
    return false;
  }
  return true;
}

/**
 * E-posta validasyonu
 * @param {string} email - E-posta adresi
 * @returns {boolean} Geçerli ise true
 */
function validateEmail(email) {
  if (!email) return true; // Optional field
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showToast("Geçerli bir e-posta adresi giriniz", "error");
    return false;
  }
  return true;
}

/**
 * Takım validasyonu
 * @param {Array} teams - Takım listesi
 * @returns {boolean} Geçerli ise true
 */
function validateTeams(teams) {
  const teamNumbers = new Set();
  const duplicates = [];
  
  for (const team of teams) {
    const number = (team.number || "").trim();
    if (!number) {
      showToast("Tüm takımların numarası olmalıdır", "error");
      return false;
    }
    
    if (teamNumbers.has(number)) {
      duplicates.push(number);
    } else {
      teamNumbers.add(number);
    }
  }
  
  if (duplicates.length > 0) {
    showToast(`Aynı takım numarası birden fazla kez kullanılamaz: ${duplicates.join(", ")}`, "error");
    return false;
  }
  
  return true;
}
