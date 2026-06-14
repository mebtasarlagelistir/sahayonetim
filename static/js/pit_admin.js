/**
 * Pit Yönetimi (Pit Admin) Modülü
 *
 * Pit yöneticisinin takım operasyonel durumlarını yönettiği arayüz:
 * - Alana giriş (check-in), sertifika durumu, kayıp eşya, takım notları.
 * Tablet-uyumlu; tüm aksiyonlar /api/pit/* uç noktalarına gider.
 */
(function () {
  "use strict";

  let teams = [];
  const noteTimers = {};

  const esc = (s) => (typeof escapeHtml === "function" ? escapeHtml(String(s ?? "")) : String(s ?? ""));

  function fmtTime(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }

  async function load() {
    try {
      const data = await apiGet("/api/pit/teams");
      if (!data || !data.ok) {
        document.getElementById("pit_list").innerHTML =
          `<div class="pit-empty">${esc((data && data.error) || "Veri alınamadı. Aktif etkinlik ve takımlar var mı?")}</div>`;
        return;
      }
      teams = data.teams || [];
      renderSummary(data.summary || {});
      render();
    } catch (err) {
      console.error("pit load error:", err);
      document.getElementById("pit_list").innerHTML =
        `<div class="pit-empty">Yüklenemedi (yetki/oturum?).</div>`;
    }
  }

  function renderSummary(s) {
    const el = document.getElementById("pit_summary");
    if (!el) return;
    el.innerHTML = `
      <div class="pit-stat">Takım: <span>${s.total_teams ?? 0}</span></div>
      <div class="pit-stat">Giriş yapan: <span>${s.checked_in ?? 0}</span></div>
      <div class="pit-stat">Sertifika alan: <span>${s.certificate_received ?? 0}</span></div>
      <div class="pit-stat">Açık kayıp eşya: <span>${s.open_lost_items ?? 0}</span></div>`;
  }

  function render() {
    const list = document.getElementById("pit_list");
    if (!list) return;
    const q = (document.getElementById("pit_search")?.value || "").trim().toLowerCase();
    const filtered = teams.filter((t) =>
      !q || String(t.team_number).toLowerCase().includes(q) || (t.team_name || "").toLowerCase().includes(q)
    );
    if (!filtered.length) {
      list.innerHTML = `<div class="pit-empty">Takım bulunamadı.</div>`;
      return;
    }
    list.innerHTML = filtered.map(cardHtml).join("");
  }

  function cardHtml(t) {
    const tn = esc(t.team_number);
    const inYes = !!t.checked_in;
    const cert = t.certificate_status === "received";
    const items = Array.isArray(t.lost_items) ? t.lost_items : [];
    const lostHtml = items.map((it, i) => {
      const resolved = it.status === "resolved";
      return `<div class="pit-lost-row ${resolved ? "resolved" : ""}">
        <span>📦 ${esc(it.desc)}</span>
        <button class="pit-btn ${resolved ? "in-no" : "in-yes"}" data-action="lost-toggle" data-team="${tn}" data-index="${i}" data-resolved="${resolved ? "0" : "1"}" style="min-height:36px;padding:4px 10px;font-size:13px;">
          ${resolved ? "Geri Aç" : "Çözüldü"}
        </button>
      </div>`;
    }).join("");

    return `<div class="pit-card ${inYes ? "is-in" : "is-out"}" data-team="${tn}">
      <div class="pit-card-head">
        <div>
          <span class="pit-team-no">${tn}</span>
          <span class="pit-team-name">${esc(t.team_name || "")}</span>
          ${t.school ? `<div class="pit-team-school">${esc(t.school)}</div>` : ""}
        </div>
      </div>
      <div class="pit-actions">
        <button class="pit-btn ${inYes ? "in-yes" : "in-no"}" data-action="checkin" data-team="${tn}" data-val="${inYes ? "0" : "1"}">
          ${inYes ? "✓ Giriş Yaptı" : "Giriş Yapmadı"}${inYes && t.checked_in_at ? `<span class="pit-meta">${fmtTime(t.checked_in_at)}</span>` : ""}
        </button>
        <button class="pit-btn ${cert ? "cert-yes" : "cert-no"}" data-action="cert" data-team="${tn}" data-val="${cert ? "pending" : "received"}">
          ${cert ? "🎓 Sertifika Alındı" : "Sertifika: Bekliyor"}
        </button>
      </div>
      <div class="pit-lost">
        <h4>Kayıp Eşya</h4>
        ${lostHtml || `<div class="pit-team-school">Kayıt yok.</div>`}
        <div class="pit-lost-add">
          <input type="text" data-lost-input="${tn}" placeholder="Kayıp eşya açıklaması" />
          <button class="pit-btn in-no" data-action="lost-add" data-team="${tn}">Ekle</button>
        </div>
      </div>
      <textarea class="pit-notes" data-action="notes" data-team="${tn}" placeholder="Takım notları (otomatik kaydedilir)...">${esc(t.notes || "")}</textarea>
    </div>`;
  }

  function localTeam(tn) {
    return teams.find((t) => String(t.team_number) === String(tn));
  }

  async function postJson(url, body) {
    return apiPost(url, body);
  }

  async function onClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const team = btn.dataset.team;
    try {
      if (action === "checkin") {
        const val = btn.dataset.val === "1";
        await postJson("/api/pit/status", { team_number: team, checked_in: val });
        await load();
      } else if (action === "cert") {
        await postJson("/api/pit/status", { team_number: team, certificate_status: btn.dataset.val });
        await load();
      } else if (action === "lost-add") {
        const input = document.querySelector(`[data-lost-input="${CSS.escape(team)}"]`);
        const desc = (input?.value || "").trim();
        if (!desc) { if (typeof showToast === "function") showToast("Açıklama girin", "warning"); return; }
        await postJson("/api/pit/lost-item", { team_number: team, description: desc });
        await load();
      } else if (action === "lost-toggle") {
        await postJson("/api/pit/lost-item/resolve", {
          team_number: team, index: parseInt(btn.dataset.index, 10), resolved: btn.dataset.resolved === "1"
        });
        await load();
      }
    } catch (err) {
      console.error("pit action error:", err);
      if (typeof showToast === "function") showToast("İşlem başarısız", "error");
    }
  }

  function onInput(e) {
    const ta = e.target.closest('textarea[data-action="notes"]');
    if (!ta) return;
    const team = ta.dataset.team;
    if (noteTimers[team]) clearTimeout(noteTimers[team]);
    noteTimers[team] = setTimeout(async () => {
      try {
        await postJson("/api/pit/status", { team_number: team, notes: ta.value });
        const t = localTeam(team);
        if (t) t.notes = ta.value;
        if (typeof showToast === "function") showToast(`${team} notu kaydedildi`, "success", 1200);
      } catch (err) {
        console.error("notes save error:", err);
      }
    }, 700);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const list = document.getElementById("pit_list");
    if (list) {
      list.addEventListener("click", onClick);
      list.addEventListener("input", onInput);
    }
    const search = document.getElementById("pit_search");
    if (search) search.addEventListener("input", render);
    const refresh = document.getElementById("pit_refresh");
    if (refresh) refresh.addEventListener("click", load);
    load();
  });
})();
