/**
 * Oyun Sonu Bildirimi (paylaşılan modül) — kompakt rozet
 *
 * SKS (driver_controlled) son 30 sn'ye girince maç kontrol, baş hakem ve hakem
 * ekranlarında, sürenin hemen altında küçük, kırmızı vurgulu "OYUN SONU"
 * rozetini gösterir/gizler. Fazla yer kaplamaz.
 *
 * Kendi kendine yeten: ilk çağrıda gerekli stil ve DOM elemanını oluşturur.
 * Şablon/CSS değişikliği gerektirmez; sadece bu script'in sayfaya eklenmesi yeterli.
 *
 * Kullanım: showEndgameBanner(true|false, anchorEl)
 *   anchorEl: rozetin hemen altına yerleşeceği eleman (örn. timer ekranı).
 *             verilmezse sayfanın üstünde küçük bir rozet olarak gösterilir.
 */
(function () {
  "use strict";

  var BADGE_ID = "endgame-badge";
  var STYLE_ID = "endgame-badge-style";

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "#" + BADGE_ID + "{" +
      "display:none;margin:6px auto 0;width:fit-content;max-width:100%;" +
      "padding:3px 12px;border-radius:6px;" +
      "background:#d50000;color:#fff;" +
      "font-weight:900;letter-spacing:.1em;text-transform:uppercase;" +
      "font-size:clamp(.8rem,2.2vw,1.1rem);line-height:1.2;white-space:nowrap;" +
      "text-shadow:0 1px 3px rgba(0,0,0,.4);box-shadow:0 2px 8px rgba(213,0,0,.5);" +
      "animation:endgameBadgePulse .8s ease-in-out infinite;}" +
      "#" + BADGE_ID + ".visible{display:block;}" +
      "#" + BADGE_ID + ".endgame-fixed{position:fixed;top:8px;left:50%;" +
      "transform:translateX(-50%);z-index:99999;margin:0;pointer-events:none;}" +
      "@keyframes endgameBadgePulse{" +
      "0%,100%{background:#d50000;}50%{background:#ff1744;}}";
    document.head.appendChild(style);
  }

  function ensureBadge() {
    ensureStyle();
    var el = document.getElementById(BADGE_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = BADGE_ID;
      el.setAttribute("role", "alert");
      el.setAttribute("aria-live", "assertive");
      el.textContent = "OYUN SONU";
    }
    return el;
  }

  function place(el, anchorEl) {
    if (anchorEl && anchorEl.parentNode) {
      // Sürenin hemen altına demirle (akış içinde, küçük rozet)
      el.classList.remove("endgame-fixed");
      if (el.previousElementSibling !== anchorEl || el.parentNode !== anchorEl.parentNode) {
        anchorEl.insertAdjacentElement("afterend", el);
      }
    } else if (!el.parentNode) {
      // Çapa yoksa: sayfanın üstünde küçük sabit rozet
      el.classList.add("endgame-fixed");
      (document.body || document.documentElement).appendChild(el);
    }
  }

  /**
   * Oyun sonu rozetini gösterir/gizler.
   * @param {boolean} show - true ise göster, false ise gizle
   * @param {Element} [anchorEl] - rozetin hemen altına yerleşeceği eleman
   */
  window.showEndgameBanner = function (show, anchorEl) {
    try {
      var el = ensureBadge();
      if (show) {
        place(el, anchorEl);
        el.classList.add("visible");
      } else {
        el.classList.remove("visible");
      }
    } catch (err) {
      // Sessiz geç: rozet kritik değil
    }
  };
})();
