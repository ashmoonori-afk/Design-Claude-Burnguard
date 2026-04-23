export interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FrameSelectHit {
  rect: FrameRect | null;
  selector: string | null;
  tag: string | null;
  text: string | null;
  computed: Record<string, string>;
}

export interface FrameCommentHit {
  selector: string;
  slideIndex: number | null;
}

export interface FrameBgHit {
  rect: FrameRect | null;
  bgId: string | null;
  tag: string | null;
  text: string | null;
  attributes: Record<string, string>;
  computed: Record<string, string>;
  inline: Record<string, string>;
}

type BridgeAction =
  | "hit-select"
  | "hit-comment"
  | "hit-bg"
  | "rect-selector"
  | "rect-bg"
  | "active-slide";

interface BridgeRequest {
  __bgFrameBridge: true;
  type: "request";
  requestId: string;
  action: BridgeAction;
  payload?: Record<string, unknown>;
}

interface BridgeResponse {
  __bgFrameBridge: true;
  type: "response";
  requestId: string;
  payload?: unknown;
}

interface PendingRequest {
  source: Window;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: number;
}

const pending = new Map<string, PendingRequest>();

if (typeof window !== "undefined") {
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as BridgeResponse | undefined;
    if (!data || data.__bgFrameBridge !== true || data.type !== "response") {
      return;
    }
    const request = pending.get(data.requestId);
    if (!request || event.source !== request.source) {
      return;
    }
    pending.delete(data.requestId);
    window.clearTimeout(request.timer);
    request.resolve(data.payload);
  });
}

export function buildSandboxedArtifactSrcDoc(
  html: string,
  baseHref: string,
): string {
  const baseTag = `<base href="${escapeHtmlAttr(baseHref)}">`;
  const scriptTag = `<script>${BRIDGE_SCRIPT}<\/script>`;
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${scriptTag}`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(
      /<html([^>]*)>/i,
      `<html$1><head>${baseTag}${scriptTag}</head>`,
    );
  }
  return `<!doctype html><html><head>${baseTag}${scriptTag}</head><body>${html}</body></html>`;
}

export async function requestFrameSelectAtPoint(
  iframe: HTMLIFrameElement | null,
  x: number,
  y: number,
): Promise<FrameSelectHit | null> {
  return (await requestFrameBridge(iframe, "hit-select", { x, y })) as
    | FrameSelectHit
    | null;
}

export async function requestFrameCommentAtPoint(
  iframe: HTMLIFrameElement | null,
  x: number,
  y: number,
): Promise<FrameCommentHit | null> {
  return (await requestFrameBridge(iframe, "hit-comment", { x, y })) as
    | FrameCommentHit
    | null;
}

export async function requestFrameBgAtPoint(
  iframe: HTMLIFrameElement | null,
  x: number,
  y: number,
): Promise<FrameBgHit | null> {
  return (await requestFrameBridge(iframe, "hit-bg", { x, y })) as
    | FrameBgHit
    | null;
}

export async function requestFrameRectForSelector(
  iframe: HTMLIFrameElement | null,
  selector: string,
): Promise<FrameRect | null> {
  return (await requestFrameBridge(iframe, "rect-selector", {
    selector,
  })) as FrameRect | null;
}

export async function requestFrameRectForBgId(
  iframe: HTMLIFrameElement | null,
  bgId: string,
): Promise<FrameRect | null> {
  return (await requestFrameBridge(iframe, "rect-bg", {
    bgId,
  })) as FrameRect | null;
}

export async function requestFrameActiveSlide(
  iframe: HTMLIFrameElement | null,
): Promise<number | null> {
  return (await requestFrameBridge(iframe, "active-slide")) as number | null;
}

async function requestFrameBridge(
  iframe: HTMLIFrameElement | null,
  action: BridgeAction,
  payload?: Record<string, unknown>,
): Promise<unknown> {
  const target = iframe?.contentWindow ?? null;
  if (!target) {
    return null;
  }

  const requestId = `bg-${crypto.randomUUID()}`;
  const request: BridgeRequest = {
    __bgFrameBridge: true,
    type: "request",
    requestId,
    action,
    payload,
  };

  return await new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(requestId);
      resolve(null);
    }, 200);
    pending.set(requestId, { source: target, resolve, reject, timer });
    try {
      target.postMessage(request, "*");
    } catch (error) {
      pending.delete(requestId);
      window.clearTimeout(timer);
      reject(error);
    }
  });
}

function escapeHtmlAttr(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const BRIDGE_SCRIPT = String.raw`(function () {
  if (window.__BG_FRAME_BRIDGE__) return;
  window.__BG_FRAME_BRIDGE__ = true;

  var STYLE_KEYS = [
    "font-family",
    "font-size",
    "font-weight",
    "color",
    "line-height",
    "letter-spacing",
    "width",
    "height",
    "padding",
    "margin",
    "border",
    "border-radius",
    "background",
    "background-color"
  ];

  function toRect(node) {
    if (!node || !node.getBoundingClientRect) return null;
    var rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  }

  function selectorOf(node) {
    if (!node || !node.getAttribute) return null;
    var bg = node.getAttribute("data-bg-node-id");
    if (bg) return '[data-bg-node-id="' + String(bg).replace(/"/g, '\\"') + '"]';
    if (node.id) return "#" + node.id;
    return String(node.tagName || "body").toLowerCase();
  }

  function slideIndexOf(node) {
    if (!node || !node.closest) return null;
    var slide = node.closest("[data-slide]");
    if (!slide) return null;
    var slides = Array.prototype.slice.call(document.querySelectorAll("[data-slide]"));
    var idx = slides.indexOf(slide);
    return idx >= 0 ? idx : null;
  }

  function readComputed(node) {
    var out = {};
    if (!node || !window.getComputedStyle) return out;
    try {
      var style = window.getComputedStyle(node);
      for (var i = 0; i < STYLE_KEYS.length; i++) {
        var key = STYLE_KEYS[i];
        out[key] = String(style.getPropertyValue(key) || "").trim();
      }
    } catch (e) {
      return {};
    }
    return out;
  }

  function readInline(node) {
    var out = {};
    if (!node || !node.getAttribute) return out;
    var raw = node.getAttribute("style") || "";
    var parts = raw.split(";");
    for (var i = 0; i < parts.length; i++) {
      var decl = parts[i].trim();
      if (!decl) continue;
      var colon = decl.indexOf(":");
      if (colon <= 0) continue;
      var key = decl.slice(0, colon).trim();
      var value = decl.slice(colon + 1).trim();
      if (key && value) out[key] = value;
    }
    return out;
  }

  function readAttributes(node) {
    var out = {};
    if (!node || !node.attributes) return out;
    for (var i = 0; i < node.attributes.length; i++) {
      var attr = node.attributes[i];
      out[attr.name] = attr.value;
    }
    return out;
  }

  function resolveTargetAtPoint(x, y) {
    try {
      return document.elementFromPoint(Number(x) || 0, Number(y) || 0);
    } catch (e) {
      return null;
    }
  }

  function queryByBgId(bgId) {
    if (!bgId || !document.querySelector) return null;
    if (window.CSS && typeof window.CSS.escape === "function") {
      return document.querySelector('[data-bg-node-id="' + window.CSS.escape(bgId) + '"]');
    }
    return document.querySelector('[data-bg-node-id="' + String(bgId).replace(/"/g, '\\"') + '"]');
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.__bgFrameBridge !== true || data.type !== "request") {
      return;
    }
    if (event.source !== window.parent) return;

    var payload = data.payload || {};
    var response = null;

    if (data.action === "hit-select") {
      var selectNode = resolveTargetAtPoint(payload.x, payload.y);
      response = selectNode ? {
        rect: toRect(selectNode),
        selector: selectorOf(selectNode),
        tag: String(selectNode.tagName || "").toLowerCase(),
        text: String(selectNode.textContent || ""),
        computed: readComputed(selectNode)
      } : null;
    } else if (data.action === "hit-comment") {
      var commentNode = resolveTargetAtPoint(payload.x, payload.y);
      response = commentNode ? {
        selector: selectorOf(commentNode) || "body",
        slideIndex: slideIndexOf(commentNode)
      } : { selector: "body", slideIndex: null };
    } else if (data.action === "hit-bg") {
      var rawNode = resolveTargetAtPoint(payload.x, payload.y);
      var bgNode = rawNode && rawNode.closest ? rawNode.closest("[data-bg-node-id]") : null;
      response = bgNode ? {
        rect: toRect(bgNode),
        bgId: bgNode.getAttribute("data-bg-node-id"),
        tag: String(bgNode.tagName || "").toLowerCase(),
        text: String(bgNode.textContent || ""),
        attributes: readAttributes(bgNode),
        computed: readComputed(bgNode),
        inline: readInline(bgNode)
      } : null;
    } else if (data.action === "rect-selector") {
      try {
        var rectNode = payload.selector ? document.querySelector(String(payload.selector)) : null;
        response = rectNode ? toRect(rectNode) : null;
      } catch (e) {
        response = null;
      }
    } else if (data.action === "rect-bg") {
      var bgRectNode = queryByBgId(payload.bgId);
      response = bgRectNode ? toRect(bgRectNode) : null;
    } else if (data.action === "active-slide") {
      var slides = document.querySelectorAll("[data-slide]");
      if (!slides || slides.length === 0) {
        response = null;
      } else {
        var active = document.querySelector("[data-slide][data-active]");
        response = active ? Array.prototype.indexOf.call(slides, active) : 0;
      }
    }

    window.parent.postMessage({
      __bgFrameBridge: true,
      type: "response",
      requestId: data.requestId,
      payload: response
    }, "*");
  });
})();`;
