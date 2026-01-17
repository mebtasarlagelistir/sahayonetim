/**
 * Takım Yönetimi Modülü
 * 
 * Takım verilerini yükleme, kaydetme, seed data yükleme vb.
 */

/**
 * Aktif etkinliğin takımlarını yükler ve tabloya ekler
 * 
 * API: GET /api/teams
 * 
 * Hata durumunda boş liste gösterir.
 */
async function loadTeams() {
  try {
    const res = await fetch("/api/teams");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) {
      showToast("Takımlar yüklenemedi", "error");
      return;
    }
    const teams = await res.json();
    const table = qs("teams_table");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    // Kategori alanındaki mentor bilgilerini temizle
    teams.forEach((team) => {
      if (team.category && team.category.toLowerCase().includes("mentor")) {
        team.category = ""; // Mentorlar bilgisini kaldır
      }
      addTeamRow(team);
    });
    if (typeof updateTeamStatus === "function") {
      updateTeamStatus(teams.length);
    }
  } catch (err) {
    console.error("Load teams error:", err);
    showToast("Takımlar yüklenirken hata oluştu", "error");
  }
}

/**
 * Takım tablosuna yeni satır ekler
 * 
 * @param {Object} team - Takım verisi (number, name, school, district, category)
 */
function addTeamRow(team = {}) {
  const table = qs("teams_table");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  const tr = document.createElement("tr");
  
  // Kategori değerini temizle (Mentorlar bilgisini kaldır)
  let category = team.category || "";
  if (category.toLowerCase().includes("mentor")) {
    category = ""; // Mentorlar bilgisi varsa temizle
  }
  
  tr.innerHTML = `
    <td><input data-number type="text" value="${escapeHtml(team.number || "")}" placeholder="202501"></td>
    <td><input data-name type="text" value="${escapeHtml(team.name || "")}" placeholder="Takım Adı"></td>
    <td><input data-school type="text" value="${escapeHtml(team.school || "")}" placeholder="Okul Adı"></td>
    <td><input data-district type="text" value="${escapeHtml(team.district || team.city || "")}" placeholder="İlçe"></td>
    <td>
      <select data-category>
        <option value="">Seçiniz</option>
        <option value="Rookie" ${category === "Rookie" ? "selected" : ""}>Rookie</option>
        <option value="Veteran" ${category === "Veteran" ? "selected" : ""}>Veteran</option>
      </select>
    </td>
    <td><button class="danger">Sil</button></td>
  `;
  tr.querySelector("button").addEventListener("click", () => tr.remove());
  tbody.appendChild(tr);
}

/**
 * Takım tablosundan verileri toplar
 * 
 * Boş takımlar (tüm alanlar boş) filtrelenir.
 * 
 * @returns {Array} Takım listesi (boş takımlar hariç)
 */
function collectTeams() {
  const table = qs("teams_table");
  if (!table) return [];
  
  const rows = table.querySelectorAll("tbody tr");
  const teams = [];
  rows.forEach((row) => {
    const numberInput = row.querySelector("input[data-number]");
    const nameInput = row.querySelector("input[data-name]");
    const schoolInput = row.querySelector("input[data-school]");
    const districtInput = row.querySelector("input[data-district]");
    const categoryInput = row.querySelector("select[data-category]");
    
    const team = {
      number: numberInput?.value.trim() || "",
      name: nameInput?.value.trim() || "",
      school: schoolInput?.value.trim() || "",
      district: districtInput?.value.trim() || "",
      category: categoryInput?.value || "",
    };
    // Boş takımları filtrele (en azından numara veya isim olmalı)
    if (team.number || team.name) {
      teams.push(team);
    }
  });
  return teams;
}

/**
 * Takım verilerini kaydeder
 * 
 * API: POST /api/teams
 * 
 * Validasyonlar:
 * - Tüm takımların numarası olmalı
 * - Aynı takım numarası birden fazla kez kullanılamaz
 */
async function saveTeams() {
  const payload = collectTeams();
  
  // Validate teams
  if (!validateTeams(payload)) {
    return;
  }
  
  const button = qs("save-teams");
  setButtonLoading(button, true);
  
  try {
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
      if (typeof updateTeamStatus === "function") {
        updateTeamStatus(payload.length);
      }
      showToast(`${payload.length} takım başarıyla kaydedildi`, "success");
    } else {
      const error = await res.json().catch(() => ({ error: "Bilinmeyen hata" }));
      showToast(`Kaydetme başarısız: ${error.error || res.statusText}`, "error");
    }
  } catch (err) {
    console.error("Save teams error:", err);
    showToast(`Kaydetme sırasında hata oluştu: ${err.message}`, "error");
  } finally {
    setButtonLoading(button, false);
  }
}

/**
 * Test verileri olarak "Istanbul ve Su 1" takımlarını yükler
 * 
 * Bu fonksiyon sadece test/development için kullanılmalıdır.
 * Önce /api/teams/seed endpoint'ini dener, yoksa static/seed_teams.json dosyasını yükler.
 */
async function seedTeams() {
  try {
    // Önce API endpoint'ini dene
    let res = await fetch("/api/teams/seed", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      showToast(`${data.count || 0} takım yüklendi`, "success");
      await loadTeams();
      return;
    }
    
    // API endpoint yoksa static JSON dosyasını yükle
    res = await fetch("/static/seed_teams.json");
    if (!res.ok) {
      showToast("Seed verileri yüklenemedi", "error");
      return;
    }
    
    const seedData = await res.json();
    
    // Etkinlik oluştur veya aktif et
    const eventsRes = await fetch("/api/events");
    if (eventsRes.ok) {
      const events = await eventsRes.json();
      let event = events.find((e) => e.name === seedData.event_name);
      
      if (!event) {
        // Etkinlik yoksa oluştur
        const createRes = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: seedData.event_name }),
        });
        if (createRes.ok) {
          const newEvents = await fetch("/api/events").then((r) => r.json());
          event = newEvents.find((e) => e.name === seedData.event_name);
        }
      }
      
      if (event) {
        // Etkinliği aktif et
        await fetch("/api/events/active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_id: event.id }),
        });
      }
    }
    
    // Takımları kaydet (kategori alanındaki mentor bilgilerini temizle)
    const teams = seedData.teams.map((team) => {
      if (team.category && team.category.toLowerCase().includes("mentor")) {
        team.category = ""; // Mentorlar bilgisini kaldır
      }
      return team;
    });
    
    await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teams),
    });
    
    showToast(`${teams.length} takım yüklendi`, "success");
    await loadTeams();
  } catch (err) {
    console.error("Seed teams error:", err);
    showToast("Takımlar yüklenirken hata oluştu", "error");
  }
}
