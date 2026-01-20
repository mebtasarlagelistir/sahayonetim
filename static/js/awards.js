/**
 * Ödül Yönetimi Modülü
 *
 * Ödül listesini yükleme, düzenleme ve kaydetme işlemlerini yönetir.
 */

/**
 * FTC Kılavuzundaki Ödül Şablonları
 * 
 * Bu liste, FTC kılavuzunda belirtilen ödülleri içerir.
 * "FTC Örnekleri Yükle" butonu ile bu ödüller otomatik olarak yüklenir.
 */
const awardPresets = [
  // Jüri Değerlendirmeli Ödüller (9 Adet)
  // Bu ödüller, jürilerin takımlarla yaptığı mülakatlar ve inceledikleri portfolyolar sonucunda belirlenir.
  {
    name: "İlham Verici Takım Ödülü",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    description: "Diğer takımlara ilham kaynağı olan, \"Bilinçli Profesyonellik\" ile hareket eden takıma verilir.",
  },
  {
    name: "Yaratıcı Tasarım Ödülü",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    description: "Robot tasarımı yaratıcı, benzersiz ve zarif olan takıma verilir.",
  },
  {
    name: "Kontrol Ödülü",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    description: "Sensör ve yazılımı yenilikçi kullanarak robot işlevselliğini artıran takıma verilir.",
  },
  {
    name: "Kalite Ödülü",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    description: "Robot yapısı düzenli, dayanıklı ve güvenli olan takıma verilir.",
  },
  {
    name: "İletişim Ödülü",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    description: "STEM topluluğuyla bağlantılar kuran ve bilgisini paylaşan takıma verilir.",
  },
  {
    name: "Takım Ruhu Ödülü",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    description: "Takım içi uyumu, ortak hedefleri ve coşkusu yüksek olan takıma verilir.",
  },
  {
    name: "Usta-Çırak Ödülü",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    description: "Lise öğrencilerinin ortaokul öğrencilerine etkili mentörlük yaptığı takıma verilir.",
  },
  {
    name: "İlham Veren Danışman Ödülü",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    description: "Takıma olağanüstü rehberlik eden öğretmene/danışmana verilir.",
  },
  {
    name: "Jüri Özel Ödülü (Parlak Takım Ödülü)",
    category: "Jüri Değerlendirmeli",
    type: "Jüri",
    sponsor: "",
    description: "Sezon boyunca olağanüstü çaba ve gelişim gösteren takıma verilir.",
  },
  
  // Robot Performansına Dayalı Ödüller (5 Adet)
  // Bu ödüller, saha içindeki maç sonuçlarına ve robotun oyun sırasındaki yeteneklerine göre belirlenir.
  {
    name: "Kazanan İttifak Ödülü (Robot Performansı 1.'lik Ödülü)",
    category: "Robot Performansı",
    type: "Performans",
    sponsor: "",
    description: "Final maçını kazanan ittifaktaki her takıma verilir.",
  },
  {
    name: "Finalist İttifak Ödülü (Robot Performansı 2.'lik Ödülü)",
    category: "Robot Performansı",
    type: "Performans",
    sponsor: "",
    description: "Final maçını kaybeden ittifaktaki her takıma verilir.",
  },
  {
    name: "Otonom Mod Ödülü",
    category: "Robot Performansı",
    type: "Performans",
    sponsor: "",
    description: "Otonom süreçte üstün performans gösteren takıma verilir.",
  },
  {
    name: "Hızlı Başlangıç Ödülü",
    category: "Robot Performansı",
    type: "Performans",
    sponsor: "",
    description: "Maç başlangıcında hızlı ve etkili puan toplayan takıma verilir.",
  },
  {
    name: "Savunma Ödülü",
    category: "Robot Performansı",
    type: "Performans",
    sponsor: "",
    description: "Rakiplerinin puan kazanmasını engellemede en etkili savunma stratejilerini sergileyen takıma verilir.",
  },
];

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
        "Mevcut liste silinip FTC örnek ödülleri yüklenecek. Devam edilsin mi?"
      );
      if (confirmed) {
        loadAwardPresets();
      }
    });
  }
}
