/**
 * Ödül Yönetimi Modülü
 *
 * Ödül listesini yükleme, düzenleme ve kaydetme işlemlerini yönetir.
 * TG (Tasarla Geliştir) yarışmaları için optimize edilmiştir.
 */

/**
 * 2. Tasarla Geliştir Ödül Şablonları
 *
 * Bu liste 2. TG için planlanan ödülleri içerir (8 jüri + 1 otonom + 4 ittifak).
 * "TG Şablonları Yükle" butonu ile otomatik yüklenir.
 *
 * NOT: "Robot Performansı Kazanan/Finalist İttifak" ödüllerinin adları backend ile
 * (routes/match_control.py PLAYOFF_AWARD_LABELS) birebir aynı olmalıdır; playoff
 * bitince bu ödüller otomatik doldurulur (sonradan Ödül Atama'dan düzenlenebilir).
 */
const awardPresets = [
  // ============================================
  // JÜRİ DEĞERLENDİRMELİ ÖDÜLLER (8 Adet)
  // Jürilerin mülakat ve portfolyo incelemeleri sonucunda belirlenir.
  // ============================================
  {
    name: "İlham Verici Takım Şampiyonu",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    icon: "🏆",
    description: "Robot performansı, mühendislik süreci, işbirliği çalışmaları ve Tasarla Geliştir değerlerinde dengeli ve üstün başarı gösteren takıma verilir.",
  },
  {
    name: "İletişim Ödülü Şampiyonu",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    icon: "📣",
    description: "STEM topluluğu, kurumlar ve diğer takımlarla kurduğu etkili ve sürdürülebilir iletişim ile takım katkısıyla öne çıkan takıma verilir.",
  },
  {
    name: "Kalite Ödülü Şampiyonu",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    icon: "⭐",
    description: "Yüksek mühendislik standartlarıyla tasarlanmış, güvenilir, düzenli ve istikrarlı çalışan bir robot geliştiren takıma verilir.",
  },
  {
    name: "Kontrol Ödülü Şampiyonu",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    icon: "🎮",
    description: "Yazılım mimarisi, sensör kullanımı ve otonom/sürüş kontrolünde teknik üstünlük gösteren takıma verilir.",
  },
  {
    name: "Tasarım Ödülü Şampiyonu",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    icon: "✏️",
    description: "Özgün mekanik tasarım, yenilikçi ve iyi gerekçelendirilmiş mühendislik temelli tasarım ve güçlü dokümantasyon sergileyen takıma verilir.",
  },
  {
    name: "Takım Ruhu Ödülü Şampiyonu",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    icon: "💪",
    description: "Ekip çalışması, takım içi motivasyon, sahadaki pozitif tutum ve Tasarla Geliştir değerlerini en iyi yansıtan, çevresine ilham veren takıma verilir.",
  },
  {
    name: "Usta–Çırak Ödülü Şampiyonu",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    icon: "🤝",
    description: "Takım içi bilgi aktarımını, mentorluk yaklaşımını ve birlikte öğrenme kültürünü en etkili şekilde hayata geçiren takıma verilir.",
  },
  {
    name: "Jüri Özel Ödülü (Parlayan Takım Ödülü) Şampiyonu",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    icon: "💎",
    description: "Standart ödül kategorilerinin dışında olağanüstü çaba, dikkat çekici gelişim, özgün ve ilham verici yönüyle fark yaratan takıma verilir.",
  },

  // ============================================
  // ROBOT PERFORMANSI ÖDÜLLERİ (1 otonom + 4 ittifak)
  // İttifak ödülleri playoff (çift eleme) sonucuna göre otomatik atanır.
  // ============================================
  {
    name: "Otonom Mod Ödülü Şampiyonu",
    category: "Robot Performansı",
    type: "Performans",
    sponsor: "",
    icon: "🤖",
    description: "Otonom (otomatik) kontrol sürecinde doğru, tutarlı ve stratejik performans sergileyen takıma verilir.",
  },
  {
    name: "Robot Performansı Kazanan İttifak (1)",
    category: "Robot Performansı",
    type: "Performans",
    sponsor: "",
    icon: "🥇",
    description: "Playoff (çift eleme) büyük finalini kazanan ittifağın 1. takımına verilir. Playoff bitince otomatik atanır; Ödül Atama'dan düzenlenebilir.",
  },
  {
    name: "Robot Performansı Kazanan İttifak (2)",
    category: "Robot Performansı",
    type: "Performans",
    sponsor: "",
    icon: "🥇",
    description: "Playoff (çift eleme) büyük finalini kazanan ittifağın 2. takımına verilir. Playoff bitince otomatik atanır; Ödül Atama'dan düzenlenebilir.",
  },
  {
    name: "Robot Performansı Finalist İttifak (1)",
    category: "Robot Performansı",
    type: "Performans",
    sponsor: "",
    icon: "🥈",
    description: "Playoff büyük finalinde finalist (ikinci) olan ittifağın 1. takımına verilir. Playoff bitince otomatik atanır; Ödül Atama'dan düzenlenebilir.",
  },
  {
    name: "Robot Performansı Finalist İttifak (2)",
    category: "Robot Performansı",
    type: "Performans",
    sponsor: "",
    icon: "🥈",
    description: "Playoff büyük finalinde finalist (ikinci) olan ittifağın 2. takımına verilir. Playoff bitince otomatik atanır; Ödül Atama'dan düzenlenebilir.",
  },
];

/**
 * Ödül kazananları state'i (global)
 */
let awardWinners = [];
let teamsCache = [];

async function loadAwards() {
  const table = qs("awards_table");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  try {
    const awards = await apiGet("/api/awards");
    if (Array.isArray(awards) && awards.length) {
      awards.forEach((award) => addAwardRow(award));
    } else {
      addAwardRow();
    }
    updateAwardsStatus(awards.length);
  } catch (err) {
    console.error("Load awards error:", err);
    showToast("Ödüller yüklenirken hata oluştu", "error");
    addAwardRow();
  }
}

function addAwardRow(award = {}) {
  const table = qs("awards_table");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" data-field="name" value="${escapeHtml(award.name || "")}" placeholder="Ödül adı" /></td>
    <td><input type="text" data-field="category" value="${escapeHtml(award.category || "")}" placeholder="Kategori" /></td>
    <td>
      <select data-field="type">
        <option value="Jüri">Jüri</option>
        <option value="Performans">Performans</option>
        <option value="Özel">Özel</option>
        <option value="Diğer">Diğer</option>
      </select>
    </td>
    <td><input type="text" data-field="sponsor" value="${escapeHtml(award.sponsor || "")}" placeholder="Sponsor" /></td>
    <td>
      <textarea data-field="description" rows="2" placeholder="Açıklama / kriter">${escapeHtml(
        award.description || ""
      )}</textarea>
    </td>
    <td><button type="button" class="btn-danger">Sil</button></td>
  `;

  tbody.appendChild(tr);

  const select = tr.querySelector('select[data-field="type"]');
  if (select) {
    const value = (award.type || "").trim() || "Jüri";
    select.value = value;
  }

  const removeBtn = tr.querySelector("button");
  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      tr.remove();
      updateAwardsStatus(tbody.querySelectorAll("tr").length);
    });
  }
}

function collectAwards() {
  const table = qs("awards_table");
  if (!table) return [];
  const tbody = table.querySelector("tbody");
  if (!tbody) return [];
  const rows = tbody.querySelectorAll("tr");
  const awards = [];
  rows.forEach((row) => {
    const name = row.querySelector('input[data-field="name"]')?.value.trim() || "";
    const category = row.querySelector('input[data-field="category"]')?.value.trim() || "";
    const type = row.querySelector('select[data-field="type"]')?.value.trim() || "";
    const sponsor = row.querySelector('input[data-field="sponsor"]')?.value.trim() || "";
    const description = row.querySelector('textarea[data-field="description"]')?.value.trim() || "";
    if (name || category || description || sponsor) {
      awards.push({ name, category, type, sponsor, description });
    }
  });
  return awards;
}

async function saveAwards() {
  const payload = collectAwards();
  const button = qs("save_awards");
  setButtonLoading(button, true);

  try {
    await apiPost("/api/awards", payload);
    showToast("Ödüller kaydedildi", "success");
    updateAwardsStatus(payload.length);
    // Adım durumunu güncelle
    if (typeof checkAllStepStatuses === "function") {
      await checkAllStepStatuses();
    }
  } catch (err) {
    console.error("Save awards error:", err);
    if (err.message && err.message.toLowerCase().includes("yetkiniz yok")) {
      showToast("Bu işlem için yetkiniz yok", "error");
    } else {
      showToast("Ödüller kaydedilirken hata oluştu", "error");
    }
  } finally {
    setButtonLoading(button, false);
  }
}

function loadAwardPresets() {
  const table = qs("awards_table");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  awardPresets.forEach((award) => addAwardRow(award));
  updateAwardsStatus(awardPresets.length);
}

function updateAwardsStatus(count) {
  if (typeof setStepStatus !== "function" || typeof setStepCount !== "function") return;
  if (count > 0) {
    setStepStatus("step-awards", "Done");
    setStepCount("step-awards", count);
  } else {
    setStepStatus("step-awards", "Not Started");
    setStepCount("step-awards", null);
  }
}

function setupAwardsListeners() {
  if (qs("add_award")) {
    qs("add_award").addEventListener("click", () => addAwardRow());
  }
  if (qs("save_awards")) {
    qs("save_awards").addEventListener("click", saveAwards);
  }
  if (qs("load_award_presets")) {
    qs("load_award_presets").addEventListener("click", () => {
      const confirmed = window.confirm(
        "Mevcut liste silinip 2. Tasarla Geliştir ödül şablonu (13 ödül) yüklenecek. Devam edilsin mi?"
      );
      if (confirmed) {
        loadAwardPresets();
      }
    });
  }
}
