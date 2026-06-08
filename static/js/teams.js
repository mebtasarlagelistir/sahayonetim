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
/**
 * 2. Tasarla Geliştir Takım Şablonu (27 takım)
 *
 * "2. TG Takımlarını Yükle" butonu bu listeyi tabloya doldurur (kaydetmez);
 * kullanıcı gözden geçirip "Etkinliği Kaydet" ile kaydeder.
 */
const tgTeamsPreset = [
  { number: "202501", name: "ŞİŞLİ ROBOTICS", school: "ŞİŞLİ BİLİM VE SANAT MERKEZİ", district: "ŞİŞLİ" },
  { number: "202502", name: "ALFA ROBOTICS", school: "ÜMRANİYE ATATÜRK MESLEKİ VE TEKNİK ANADOLU LİSESİ", district: "ÜMRANİYE" },
  { number: "202503", name: "TULPAR", school: "GÜLTEPE MESLEKİ VE TEKNİK ANADOLU LİSESİ", district: "KAĞITHANE" },
  { number: "202504", name: "AKİF TECH", school: "AKİF İNAN ANADOLU İMAM HATİP LİSESİ", district: "BAŞAKŞEHİR" },
  { number: "202506", name: "İTOBOT", school: "İSTANBUL TİCARET ODASI MESLEKİ VE TEKNİK ANADOLU LİSESİ", district: "BAYRAMPAŞA" },
  { number: "202507", name: "CEZERİ ROBOTICS", school: "SULTANGAZİ CEZERİ MESLEKİ VE TEKNİK ANADOLU LİSESİ", district: "SULTANGAZİ" },
  { number: "202508", name: "MAT ROBOTICS", school: "MAÇKA MESLEKİ VE TEKNİK ANADOLU LİSESİ", district: "ŞİŞLİ" },
  { number: "202509", name: "AYYILDIZ ROBOTİM", school: "İMMİB ERKAN AVCI MESLEKİ VE TEKNİK ANADOLU LİSESİ", district: "BAHÇELİEVLER" },
  { number: "202510", name: "QUBİT ROBOTICS", school: "MALTEPE KADİR HAS BİLİM VE SANAT MERKEZİ", district: "MALTEPE" },
  { number: "202511", name: "AQUA ROBOTICS", school: "ZİYA KALKAVAN MESLEKİ VE TEKNİK ANADOLU LİSESİ", district: "BEŞİKTAŞ" },
  { number: "202512", name: "ARAN ROBOT", school: "ŞİLE AYET AZER ARAN SAVUNMA SANAYİ MESLEKİ VE TEKNİK ANADOLU LİSESİ", district: "ŞİLE" },
  { number: "202513", name: "HÜNKAR ROBOTİC", school: "HACI BEKTAŞ VELİ ANADOLU LİSESİ", district: "KÜÇÜKÇEKMECE" },
  { number: "202514", name: "RAVEN ROBOTICS", school: "ŞEHİT YÜZBAŞI YUSUF KENAN MTAL", district: "SANCAKTEPE" },
  { number: "202515", name: "GAL TIGERS", school: "GAZİOSMANPAŞA ANADOLU LİSESİ", district: "GAZİOSMANPAŞA" },
  { number: "202516", name: "SYNTHEX", school: "ESENYURT BİLİM VE SANAT MERKEZİ", district: "ESENYURT" },
  { number: "202519", name: "HİVEMİND", school: "SULTANGAZİ MESLEKİ VE TEKNİK ANADOLU LİSESİ", district: "SULTANGAZİ" },
  { number: "202520", name: "CARACAL ROBOTICS", school: "MEHMET RIFAT EVYAP MESLEKİ VE TEKNİK ANADOLU LİSESİ", district: "SARIYER" },
  { number: "202521", name: "MECHATAK", school: "AHMET KELEŞOĞLU FEN LİSESİ", district: "ATAŞEHİR" },
  { number: "202523", name: "ROBORSA BAŞAKŞEHİR", school: "BORSA İSTANBUL BAŞAKŞEHİR MESLEKİ VE TEKNİK ANADOLU LİSESİ", district: "BAŞAKŞEHİR" },
  { number: "202524", name: "ROBİSTİM", school: "İSTANBUL BİLİM VE SANAT MERKEZİ", district: "ATAŞEHİR" },
  { number: "202525", name: "NEOCHIRON", school: "ŞEHREMİNİ ANADOLU LİSESİ", district: "FATİH" },
  { number: "202530", name: "CYGNUS", school: "ESENYURT TOKİ ALİ DURAN MESLEKİ VE TEKNİK ANADOLU LİSESİ", district: "ESENYURT" },
  { number: "202532", name: "ALKOBOT", school: "ALKOP MESLEKİ VE TEKNİK ANADOLU LİSESİ", district: "ESENYURT" },
  { number: "202533", name: "TEKNOGIRIFT", school: "BAKIRKÖY ANADOLU İMAM HATİP LİSESİ", district: "BAKIRKÖY" },
  { number: "202534", name: "TECHNOKA ROBOTICS", school: "KADIKÖY ANADOLU İMAM HATİP LİSESİ", district: "KADIKÖY" },
  { number: "202535", name: "VOLTX ROBOTICS", school: "BURHAN FELEK ANADOLU LİSESİ", district: "ÜSKÜDAR" },
  { number: "202536", name: "ERDEMLİLER", school: "BEŞİKTAŞ BİLİM VE SANAT MERKEZİ", district: "BEŞİKTAŞ" },
];

/**
 * 2. TG takım şablonunu tabloya yükler (kaydetmez; kullanıcı sonra kaydeder).
 */
function loadTGTeamsPreset() {
  const table = qs("teams_table");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  tgTeamsPreset.forEach((team) => addTeamRow(team));
  if (typeof showToast === "function") {
    showToast(`${tgTeamsPreset.length} takım tabloya yüklendi. Kaydetmek için "Etkinliği Kaydet"e basın.`, "success");
  }
}

async function loadTeams() {
  try {
    const teams = await apiGet("/api/teams");
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
  if (button && typeof setButtonLoading === "function") {
    setButtonLoading(button, true);
  }
  
  try {
    await apiPost("/api/teams", payload);
    if (typeof updateTeamStatus === "function") {
      updateTeamStatus(payload.length);
    }
    showToast(`${payload.length} takım başarıyla kaydedildi`, "success");
    // Adım durumunu güncelle
    if (typeof checkAllStepStatuses === "function") {
      await checkAllStepStatuses();
    }
  } catch (err) {
    console.error("Save teams error:", err);
    showToast(`Kaydetme sırasında hata oluştu: ${err.message}`, "error");
  } finally {
    if (button && typeof setButtonLoading === "function") {
      setButtonLoading(button, false);
    }
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
    try {
      const data = await apiPost("/api/teams/seed", {});
      showToast(`${data.count || 0} takım yüklendi`, "success");
      await loadTeams();
      return;
    } catch (err) {
      // API endpoint yoksa static JSON dosyasını yükle
      const res = await fetchWithRetry("/static/seed_teams.json", { method: "GET" });
      if (!res.ok) {
        showToast("Seed verileri yüklenemedi", "error");
        return;
      }
      
      const seedData = await res.json();
      const teamsList = Array.isArray(seedData) ? seedData : seedData.teams || [];
      if (!teamsList.length) {
        showToast("Seed verileri boş veya hatalı", "error");
        return;
      }
      
      // Takımları kaydet (kategori alanındaki mentor bilgilerini temizle)
      const teams = teamsList.map((team) => {
        if (team.category && team.category.toLowerCase().includes("mentor")) {
          team.category = ""; // Mentorlar bilgisini kaldır
        }
        return team;
      });
      
      await apiPost("/api/teams", teams);
      
      showToast(`${teams.length} takım yüklendi`, "success");
      await loadTeams();
    }
  } catch (err) {
    console.error("Seed teams error:", err);
    showToast("Takımlar yüklenirken hata oluştu", "error");
  }
}
