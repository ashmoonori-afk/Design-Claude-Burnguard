/**
 * Deck stage runtime — served at /runtime/deck-stage.js.
 *
 * Embedded as a string rather than a separate .js file so `bun build --compile`
 * bundles it into the Windows binary without extra asset copying. The string
 * is served verbatim with `Content-Type: application/javascript` by
 * `routes/runtime.ts`.
 *
 * Contract (shared with slide-deck template and exporters):
 *   - Every slide is a top-level element matching `[data-slide]`.
 *   - Exactly one slide at a time carries `data-active`.
 *   - <body> gets `data-deck-ready` once boot finishes (CSS in the template
 *     uses this to switch from stacked preview to single-slide display).
 *   - `?present` or `?presenter` query flags set `data-presenter` on <body>
 *     so CSS can reveal speaker notes.
 *   - Hash `#slide-N` reflects and drives the current slide (1-indexed).
 *
 * Keyboard:
 *   →, Space, PageDown → next
 *   ←, PageUp          → prev
 *   Home / End         → jump to first / last
 *   f                  → toggle fullscreen
 *   Esc                → exit presenter
 */
export const DECK_STAGE_JS = `(function() {
  "use strict";

  var SLIDE_SELECTOR = "[data-slide]";
  var ACTIVE_ATTR = "data-active";

  function slides() {
    return Array.prototype.slice.call(document.querySelectorAll(SLIDE_SELECTOR));
  }

  function setActive(list, index) {
    for (var i = 0; i < list.length; i++) {
      if (i === index) list[i].setAttribute(ACTIVE_ATTR, "");
      else list[i].removeAttribute(ACTIVE_ATTR);
    }
  }

  function parseHashIndex() {
    var m = /^#slide-(\\d+)/.exec(location.hash || "");
    if (!m) return 0;
    var n = parseInt(m[1], 10);
    return isFinite(n) && n > 0 ? n - 1 : 0;
  }

  function writeHash(index) {
    var next = "#slide-" + (index + 1);
    if (location.hash !== next) {
      try { history.replaceState(null, "", next); }
      catch (e) { location.hash = next; }
    }
  }

  function init() {
    var all = slides();
    if (all.length === 0) return;

    var current = Math.min(parseHashIndex(), all.length - 1);
    setActive(all, current);
    writeHash(current);
    document.body.setAttribute("data-deck-ready", "");

    var params = new URLSearchParams(location.search || "");
    if (params.has("present") || params.has("presenter")) {
      document.body.setAttribute("data-presenter", "");
    }

    function go(delta) {
      var list = slides();
      if (list.length === 0) return;
      var next = Math.max(0, Math.min(list.length - 1, current + delta));
      if (next === current) return;
      current = next;
      setActive(list, current);
      writeHash(current);
    }

    function goTo(index) {
      var list = slides();
      if (list.length === 0) return;
      var next = Math.max(0, Math.min(list.length - 1, index));
      current = next;
      setActive(list, current);
      writeHash(current);
    }

    document.addEventListener("keydown", function(e) {
      var target = e.target;
      if (target && target.nodeType === 1) {
        var el = target;
        if (el.matches && el.matches("input, textarea, [contenteditable='true'], [contenteditable='']")) {
          return;
        }
      }
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
          e.preventDefault();
          go(1);
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          go(-1);
          break;
        case "Home":
          e.preventDefault();
          goTo(0);
          break;
        case "End":
          e.preventDefault();
          goTo(slides().length - 1);
          break;
        case "Escape":
          if (document.body.hasAttribute("data-presenter")) {
            document.body.removeAttribute("data-presenter");
          }
          break;
        case "f":
        case "F":
          e.preventDefault();
          var docEl = document.documentElement;
          if (!document.fullscreenElement && docEl.requestFullscreen) {
            docEl.requestFullscreen();
          } else if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen();
          }
          break;
      }
    });

    // Touch swipe (tablet-friendly).
    var touchX = null;
    document.addEventListener("touchstart", function(e) {
      if (e.touches.length === 1) touchX = e.touches[0].clientX;
    }, { passive: true });
    document.addEventListener("touchend", function(e) {
      if (touchX == null) return;
      var endX = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX : touchX;
      var dx = endX - touchX;
      touchX = null;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    }, { passive: true });

    // If the CLI rewrites the deck mid-session, keep the active attribute
    // on whatever slide lives at the same index (or clamp to last).
    var mo = new MutationObserver(function() {
      var list = slides();
      if (list.length === 0) return;
      var idx = Math.min(current, list.length - 1);
      current = idx;
      setActive(list, idx);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("hashchange", function() {
      var list = slides();
      var target = Math.min(parseHashIndex(), Math.max(0, list.length - 1));
      if (target !== current) {
        current = target;
        setActive(list, target);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
`;
