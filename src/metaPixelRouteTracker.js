// Analytics loader + SPA pageview tracker.
//
// Loading strategy:
//   - Google Analytics (gtag) + Meta Pixel  -> loaded on IDLE
//     (requestIdleCallback after the load event). They fire for EVERY visitor
//     automatically, no interaction required, just after the page paints so they
//     stay off the render / LCP path.
//   - Microsoft Clarity + Apollo            -> loaded on the FIRST USER
//     INTERACTION (scroll / click / key / touch). These only matter for engaged
//     sessions, so gating them keeps them entirely off the initial load.
//   - Hotjar                                -> removed.
//   - keploy telemetry                      -> stays eager (first-party, ~2 KiB)
//     in docusaurus.config.js.
//
// GA + Meta Pixel pageviews are also re-fired on client-side (SPA) route changes.

const GA_ID = "G-LLS95VWZPC";
const PIXEL_ID = "2006330080011702";

// baseUrl is /docs/, so these resolve under the docs site root.
const INTERACTION_SCRIPTS = [
  "/docs/scripts/clarity.js", // Microsoft Clarity
  "/docs/js/apollo-init.js", // Apollo
];
const INTERACTION_EVENTS = [
  "pointerdown",
  "keydown",
  "scroll",
  "touchstart",
  "mousemove",
];

function injectScript(src) {
  const el = document.createElement("script");
  el.src = src;
  el.async = true;
  document.head.appendChild(el);
}

// --- Google Analytics (gtag) ---------------------------------------------
function loadGA() {
  if (window.gtag) return;
  injectScript(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, {anonymize_ip: true});
}

// --- Meta Pixel ----------------------------------------------------------
function loadPixel() {
  if (window.fbq) return;
  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(
    window,
    document,
    "script",
    "https://connect.facebook.net/en_US/fbevents.js"
  );
  /* eslint-enable */
  window.fbq("init", PIXEL_ID);
  window.fbq("track", "PageView");
}

// --- Core (GA + Pixel), on idle — fires for every visitor ----------------
let coreLoaded = false;
function loadCore() {
  if (coreLoaded || typeof window === "undefined") return;
  coreLoaded = true;
  loadGA();
  loadPixel();
}
function scheduleCore() {
  if (typeof window === "undefined" || coreLoaded) return;
  const onIdle = () => {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(loadCore, {timeout: 3000});
    } else {
      window.setTimeout(loadCore, 500); // Safari has no requestIdleCallback
    }
  };
  if (document.readyState === "complete") {
    onIdle();
  } else {
    window.addEventListener("load", onIdle, {once: true});
  }
}

// --- Engagement (Clarity + Apollo), on first interaction -----------------
let engagementLoaded = false;
function loadEngagement() {
  if (engagementLoaded || typeof window === "undefined") return;
  engagementLoaded = true;
  INTERACTION_EVENTS.forEach((e) =>
    window.removeEventListener(e, loadEngagement)
  );
  INTERACTION_SCRIPTS.forEach(injectScript);
}
function armEngagement() {
  if (typeof window === "undefined") return;
  INTERACTION_EVENTS.forEach((e) =>
    window.addEventListener(e, loadEngagement, {passive: true})
  );
}

export function onRouteDidUpdate({location, previousLocation}) {
  // Initial page load: idle-load GA + Pixel, arm the interaction loader.
  if (!previousLocation) {
    scheduleCore();
    armEngagement();
    return;
  }
  // Client-side navigation is itself engagement.
  if (location.pathname !== previousLocation.pathname) {
    loadEngagement();
    if (coreLoaded) {
      if (typeof window.gtag === "function") {
        window.gtag("event", "page_view", {page_path: location.pathname});
      }
      if (typeof window.fbq === "function") {
        window.fbq("track", "PageView");
      }
    } else {
      loadCore();
    }
  }
}
