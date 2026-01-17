/**
 * Kullanıcı Yönetimi Modülü
 * 
 * Kullanıcı oluşturma, silme, QR kod oluşturma, yazdırma vb.
 */

// Global değişkenler (rol yönetimi için)
let currentUserRole = null;
let currentUserEventId = null;

/**
 * Kullanıcı rolünü yükler ve UI'ı günceller
 * 
 * Tüm roller setup sayfasına erişebilir, ancak içerik rol bazlı gösterilir:
 * - Admin ve etkinlik_yoneticisi: Tüm bölümleri görebilir
 * - Hakem: Sadece Skorlama bölümünü görebilir
 * - Mufettis: Sadece İnceleme Programı ve Jüri/İnceleme Takibi bölümlerini görebilir
 * - Seremoni: Sadece Ödüller ve Yükselme Raporu bölümlerini görebilir
 */
async function loadUserRole() {
  try {
    const res = await fetch("/api/user/role");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (res.status === 403) {
      // Yetkisiz erişim - ana sayfaya yönlendir
      window.location.href = "/";
      return;
    }
    if (!res.ok) {
      console.error("Failed to load user role");
      return;
    }
    const data = await res.json();
    currentUserRole = data.role || null;
    currentUserEventId = data.event_id || null;
    
    updateUserInfo();
    if (typeof updateUIForRole === "function") {
      updateUIForRole();
    }
    if (typeof updateSectionsForRole === "function") {
      updateSectionsForRole();
    }
  } catch (err) {
    console.error("Load user role error:", err);
  }
}

/**
 * Kullanıcı bilgilerini header'da gösterir
 */
function updateUserInfo() {
  const usernameEl = qs("current-user");
  const roleEl = qs("user-role");
  
  if (usernameEl && currentUserRole) {
    // Username'i API'den al (eğer varsa)
    fetch("/api/user/role")
      .then((res) => res.json())
      .then((data) => {
        if (usernameEl) usernameEl.textContent = data.username || "Kullanıcı";
        if (roleEl) {
          const roleNames = {
            admin: "Yönetici",
            etkinlik_yoneticisi: "Etkinlik Yöneticisi",
            hakem: "Hakem",
            mufettis: "Müfettiş",
            seremoni: "Seremoni",
          };
          roleEl.textContent = roleNames[currentUserRole?.toLowerCase()] || currentUserRole || "";
        }
      })
      .catch(() => {
        if (usernameEl) usernameEl.textContent = "Kullanıcı";
      });
  }
}

/**
 * Kullanıcı rollerine göre bölümleri göster/gizle
 */
function updateSectionsForRole() {
  if (!currentUserRole) return;
  
  const roleLower = currentUserRole.toLowerCase();
  const isAdmin = roleLower === "admin";
  const isEventManager = "etkinlik_yoneticisi" in roleLower || "yonetici" in roleLower;
  const isReferee = "hakem" in roleLower;
  const isInspector = "mufettis" in roleLower;
  const isCeremony = "seremoni" in roleLower;
  
  // Sidebar linklerini güncelle (sadece görünür olanları göster)
  const stepLinks = document.querySelectorAll("#setup-steps a");
  stepLinks.forEach((link) => {
    const stepId = link.getAttribute("href")?.replace("#", "");
    let shouldShow = false;
    
    if (isAdmin || isEventManager) {
      shouldShow = true; // Admin ve etkinlik yöneticisi tüm adımları görebilir
    } else if (isReferee && stepId === "step-scoring") {
      shouldShow = true; // Hakem sadece skorlama adımını görebilir
    } else if (isInspector && (stepId === "step-judging" || stepId === "step-inspection-schedule")) {
      shouldShow = true; // Müfettiş sadece inceleme adımlarını görebilir
    } else if (isCeremony && (stepId === "step-awards" || stepId === "step-advancement")) {
      shouldShow = true; // Seremoni sadece ödül adımlarını görebilir
    }
    
    const listItem = link.closest("li");
    if (listItem) {
      listItem.style.display = shouldShow ? "" : "none";
    }
  });
}

/**
 * Kullanıcı rollerine göre UI elementlerini günceller
 */
function updateUIForRole() {
  if (!currentUserRole) return;
  
  const roleLower = currentUserRole.toLowerCase();
  const isAdmin = roleLower === "admin";
  const isEventManager = "etkinlik_yoneticisi" in roleLower || "yonetici" in roleLower;
  
  // Event selector ve butonları kontrol et
  const eventSelector = qs("event_selector");
  const newEventBtn = qs("new_event");
  const deleteEventBtn = qs("delete_event");
  
  if (eventSelector) {
    eventSelector.disabled = !isAdmin && !isEventManager;
  }
  if (newEventBtn) {
    newEventBtn.style.display = isAdmin ? "" : "none";
  }
  if (deleteEventBtn) {
    deleteEventBtn.style.display = isAdmin ? "" : "none";
  }
  
  // Etkinlik yöneticisi sadece kendi etkinliğini görebilir
  if (isEventManager && !isAdmin && currentUserEventId !== null) {
    if (eventSelector) {
      // Sadece kendi etkinliğini göster
      Array.from(eventSelector.options).forEach((option) => {
        if (Number(option.value) !== currentUserEventId) {
          option.style.display = "none";
        }
      });
    }
  }
}

/**
 * Kullanıcıları yükler ve tabloya ekler
 * 
 * API: GET /api/users?include_password=1
 */
async function loadUsers() {
  const res = await fetch("/api/users?include_password=1");
  if (res.status === 401) {
    window.location.href = "/login";
    return;
  }
  if (!res.ok) return;
  const users = await res.json();
  const table = qs("users_table");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const qrMap = await fetchQrMap();
  users.forEach((user) => {
    const tr = document.createElement("tr");
    const qr = qrMap[user.username];
    const isAdmin = user.username.toLowerCase() === "admin";
    tr.innerHTML = `
      <td>${escapeHtml(user.username)}</td>
      <td>${escapeHtml(user.role)}</td>
      <td>${escapeHtml(user.password ?? "")}</td>
      <td class="qr-cell">${qr ? `<img src="${qr}" alt="QR">` : ""}</td>
      <td>${isAdmin ? '<span style="color: #999; font-style: italic;">Korumalı</span>' : `<button class="danger" data-user="${escapeHtml(user.username)}">Sil</button>`}</td>
    `;
    if (!isAdmin) {
      tr.querySelector("button").addEventListener("click", () =>
        deleteUser(user.username)
      );
    }
    tbody.appendChild(tr);
  });
  if (typeof updateAccountStatus === "function") {
    updateAccountStatus(users.length);
  }
}

/**
 * Yeni kullanıcı oluşturur
 * 
 * Validasyon:
 * - Kullanıcı adı ve şifre boş olamaz
 * - Admin kullanıcısı oluşturulamaz (korunur)
 */
async function createUser() {
  const username = qs("user_username")?.value.trim();
  const password = qs("user_password")?.value.trim();
  const role = qs("user_role")?.value.trim() || "admin";
  
  if (!username || !password) {
    showToast("Kullanıcı adı ve şifre gereklidir", "warning");
    return;
  }
  
  if (username.toLowerCase() === "admin") {
    showToast("Admin kullanıcısı oluşturulamaz", "error");
    return;
  }
  
  try {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role }),
    });
    
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (res.status === 403) {
      const error = await res.json().catch(() => ({ message: "Bu işlem için yetkiniz yok" }));
      showToast(error.message || "Bu işlem için yetkiniz yok", "error");
      return;
    }
    
    if (res.ok) {
      if (qs("user_username")) qs("user_username").value = "";
      if (qs("user_password")) qs("user_password").value = "";
      if (qs("user_role")) qs("user_role").value = "admin";
      showToast("Kullanıcı başarıyla oluşturuldu", "success");
      await loadUsers();
    } else {
      const error = await res.json().catch(() => ({ error: "Bilinmeyen hata" }));
      showToast(`Kullanıcı oluşturulamadı: ${error.error || res.statusText}`, "error");
    }
  } catch (err) {
    console.error("Create user error:", err);
    showToast(`Kullanıcı oluşturulurken hata oluştu: ${err.message}`, "error");
  }
}

/**
 * Varsayılan kullanıcıları oluşturur
 * 
 * API: POST /api/users/defaults
 */
async function createDefaultUsers() {
  try {
    const res = await fetch("/api/users/defaults", { method: "POST" });
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (res.status === 403) {
      const error = await res.json().catch(() => ({ message: "Bu işlem için yetkiniz yok" }));
      showToast(error.message || "Bu işlem için yetkiniz yok", "error");
      return;
    }
    if (!res.ok) return;
    const created = await res.json();
    const container = qs("created_users");
    if (!created.length) {
      if (container) {
        container.className = "created-users";
        container.textContent = "Varsayılan kullanıcılar zaten mevcut.";
      }
      return;
    }
    if (container) {
      container.className = "created-users";
      container.innerHTML = created
        .map(
          (user) =>
            `<div>${escapeHtml(user.username)} (${escapeHtml(user.role)}): <strong>${escapeHtml(
              user.password
            )}</strong></div>`
        )
        .join("");
    }
    await loadUsers();
  } catch (err) {
    console.error("Create default users error:", err);
    showToast("Varsayılan kullanıcılar oluşturulurken hata oluştu", "error");
  }
}

/**
 * QR kod haritasını yükler
 * @returns {Object} {username: qrImageDataUrl, ...}
 */
async function fetchQrMap() {
  try {
    const res = await fetch("/api/users/qr");
    if (!res.ok) return {};
    const items = await res.json();
    return items.reduce((acc, item) => {
      acc[item.username] = item.qr;
      return acc;
    }, {});
  } catch (err) {
    console.error("Fetch QR map error:", err);
    return {};
  }
}

/**
 * Kullanıcıları CSV olarak dışa aktarır
 */
async function exportUsers() {
  try {
    const res = await fetch("/api/users?include_password=1");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) return;
    const users = await res.json();
    const qrItems = await fetch("/api/users/qr").then((r) => (r.ok ? r.json() : []));
    const qrMap = qrItems.reduce((acc, item) => {
      acc[item.username] = item.url;
      return acc;
    }, {});
    const lines = ["username,role,password,login_url"];
    users.forEach((user) => {
      lines.push(
        [
          csvEscape(user.username),
          csvEscape(user.role),
          csvEscape(user.password ?? ""),
          csvEscape(qrMap[user.username] ?? ""),
        ].join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "kullanicilar.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    console.error("Export users error:", err);
    showToast("Dışa aktarma sırasında hata oluştu", "error");
  }
}

/**
 * Kullanıcı siler
 * @param {string} username - Silinecek kullanıcı adı
 */
async function deleteUser(username) {
  if (username.toLowerCase() === "admin") {
    alert("Admin kullanıcısı silinemez!");
    return;
  }
  if (!window.confirm(`${username} kullanıcısı silinsin mi?`)) return;
  try {
    const res = await fetch("/api/users/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (res.status === 403) {
      const error = await res.json().catch(() => ({ message: "Bu işlem için yetkiniz yok" }));
      showToast(error.message || "Bu işlem için yetkiniz yok", "error");
      return;
    }
    if (res.ok) {
      await loadUsers();
      showToast("Kullanıcı başarıyla silindi", "success");
    } else {
      const error = await res.json().catch(() => ({ error: "Bilinmeyen hata" }));
      showToast(`Silme işlemi başarısız: ${error.error || res.statusText}`, "error");
    }
  } catch (err) {
    console.error("Delete user error:", err);
    showToast(`Silme işlemi sırasında hata oluştu: ${err.message}`, "error");
  }
}

/**
 * Tüm kullanıcıları siler (admin hariç)
 */
async function deleteAllUsers() {
  if (!window.confirm("Tüm kullanıcılar silinsin mi? (Admin kullanıcısı korunacak)")) return;
  try {
    const res = await fetch("/api/users/delete_all", { method: "POST" });
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (res.status === 403) {
      const error = await res.json().catch(() => ({ message: "Bu işlem için yetkiniz yok" }));
      showToast(error.message || "Bu işlem için yetkiniz yok", "error");
      return;
    }
    if (res.ok) {
      await loadUsers();
      showToast("Tüm kullanıcılar silindi. (Admin kullanıcısı korundu)", "success");
    } else {
      const error = await res.json().catch(() => ({ error: "Bilinmeyen hata" }));
      showToast(`Silme işlemi başarısız: ${error.error || res.statusText}`, "error");
    }
  } catch (err) {
    console.error("Delete all users error:", err);
    showToast(`Silme işlemi sırasında hata oluştu: ${err.message}`, "error");
  }
}

/**
 * Kullanıcı listesini yazdırır (sadece kullanıcılar, şifreler ve QR kodları)
 * 
 * Yeni bir pencere açıp sadece kullanıcı tablosunu gösterir ve yazdırır.
 */
async function printUsers() {
  try {
    // Kullanıcıları ve QR kodlarını yükle
    const usersRes = await fetch("/api/users?include_password=1");
    if (usersRes.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!usersRes.ok) {
      showToast("Kullanıcılar yüklenemedi", "error");
      return;
    }
    const users = await usersRes.json();
    
    // QR kodlarını al
    const qrMap = await fetchQrMap();
    
    // Kullanıcı verilerini hazırla
    const printData = users.map((user) => ({
      username: user.username || "",
      role: user.role || "",
      password: user.password || "",
      qr: qrMap[user.username] || "",
    }));

    // Yazdırma için yeni pencere oluştur
    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) {
      showToast("Pop-up engelleyici nedeniyle yazdırma penceresi açılamadı", "error");
      return;
    }

    // HTML içeriği oluştur
    const html = `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="utf-8">
        <title>Kullanıcı Listesi</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: "Segoe UI", Arial, sans-serif;
            padding: 20px;
            color: #1f2328;
          }
          h1 {
            margin-bottom: 20px;
            font-size: 24px;
            color: #1f2328;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th, td {
            border: 1px solid #e1e4ee;
            padding: 10px;
            text-align: left;
            font-size: 12px;
          }
          th {
            background-color: #f5f6fa;
            font-weight: 600;
          }
          .qr-cell {
            text-align: center;
          }
          .qr-cell img {
            width: 80px;
            height: 80px;
            image-rendering: pixelated;
          }
          @media print {
            body {
              padding: 10px;
            }
            @page {
              margin: 1cm;
            }
          }
        </style>
      </head>
      <body>
        <h1>Kullanıcı Listesi</h1>
        <table>
          <thead>
            <tr>
              <th>Kullanıcı Adı</th>
              <th>Rol</th>
              <th>Şifre</th>
              <th>QR Kod</th>
            </tr>
          </thead>
          <tbody>
            ${printData.map((user) => `
              <tr>
                <td>${escapeHtml(user.username)}</td>
                <td>${escapeHtml(user.role)}</td>
                <td>${escapeHtml(user.password)}</td>
                <td class="qr-cell">${user.qr ? `<img src="${user.qr}" alt="QR">` : ""}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  } catch (err) {
    console.error("Print users error:", err);
    showToast("Yazdırma sırasında hata oluştu", "error");
  }
}

/**
 * Hesap durumunu günceller (step status için)
 * @param {number} count - Kullanıcı sayısı
 */
function updateAccountStatus(count) {
  if (typeof setStepStatus === "function") {
    const status = count > 0 ? "Done" : "Not Started";
    setStepStatus("step-accounts", status);
    if (typeof setStepCount === "function") {
      setStepCount("step-accounts", count > 0 ? count : null);
    }
  }
}
