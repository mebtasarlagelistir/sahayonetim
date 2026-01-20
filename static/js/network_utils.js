/**
 * Network Utility Modülü
 * 
 * Network hatalarında retry mekanizması ve hata yönetimi için yardımcı fonksiyonlar.
 */

// constants.js yüklenmezse fallback değerler
if (!window.NETWORK_CONSTANTS) {
  window.NETWORK_CONSTANTS = {
    API_RETRY_MAX: 3,
    API_RETRY_DELAY_BASE: 1000,
    API_RETRY_BACKOFF: 2,
    SSE_RETRY_MAX: 3,
    SSE_RETRY_DELAY_BASE: 1000,
    SSE_RETRY_DELAY_MAX: 8000,
    SSE_RETRY_BACKOFF: 2,
    UPDATE_INTERVAL: 1000,
    TIMER_UPDATE_INTERVAL: 1000
  };
}

/**
 * Network hatası durumunda otomatik retry yapan fetch wrapper
 * 
 * @param {string} url - İstek URL'i
 * @param {Object} options - Fetch options
 * @param {number} maxRetries - Maksimum deneme sayısı (varsayılan: 3)
 * @param {number} delay - İlk deneme arası gecikme (ms, varsayılan: 1000)
 * @param {number} backoff - Her denemede gecikmeyi artırma çarpanı (varsayılan: 2)
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}, maxRetries = 3, delay = 1000, backoff = 2) {
  let retryDelay = delay;
  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // 5xx sunucu hataları için retry yap
      if (response.status >= 500 && attempt < maxRetries - 1) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      return response;
    } catch (error) {
      lastError = error;
      
      // Son deneme değilse bekle ve tekrar dene
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay *= backoff;
      }
    }
  }
  
  // Tüm denemeler başarısız oldu
  throw lastError || new Error("Network request failed");
}

/**
 * API çağrısı yapar ve JSON response döner (retry ile)
 * 
 * @param {string} url - API endpoint URL'i
 * @param {Object} options - Fetch options
 * @param {number} maxRetries - Maksimum deneme sayısı
 * @returns {Promise<Object>} JSON response
 */
async function apiCall(url, options = {}, maxRetries = window.NETWORK_CONSTANTS.API_RETRY_MAX) {
  try {
    const response = await fetchWithRetry(url, options, maxRetries);
    
    // 401 Unauthorized - Giriş sayfasına yönlendir
    if (response.status === 401) {
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    
    // 403 Forbidden - Yetki hatası
    if (response.status === 403) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Bu işlem için yetkiniz yok");
    }
    
    // JSON response'u parse et
    if (response.ok) {
      return await response.json();
    } else {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`API call error (${url}):`, error);
    throw error;
  }
}

/**
 * POST isteği yapar (retry ile)
 * 
 * @param {string} url - API endpoint URL'i
 * @param {Object} data - Request body (JSON)
 * @param {Object} headers - Ekstra headers
 * @returns {Promise<Object>} JSON response
 */
async function apiPost(url, data, headers = {}) {
  return apiCall(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(data)
  });
}

/**
 * GET isteği yapar (retry ile)
 * 
 * @param {string} url - API endpoint URL'i
 * @param {Object} params - URL parametreleri
 * @returns {Promise<Object>} JSON response
 */
async function apiGet(url, params = {}) {
  if (Object.keys(params).length > 0) {
    const queryString = new URLSearchParams(params).toString();
    url += (url.includes("?") ? "&" : "?") + queryString;
  }
  
  return apiCall(url, {
    method: "GET"
  });
}

/**
 * DELETE isteği yapar (retry ile)
 * 
 * @param {string} url - API endpoint URL'i
 * @returns {Promise<Object>} JSON response
 */
async function apiDelete(url) {
  return apiCall(url, {
    method: "DELETE"
  });
}
