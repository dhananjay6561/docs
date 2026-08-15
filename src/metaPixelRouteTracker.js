// Idle-loads every non-critical tracker so they fire for *every* visitor
// automatically (no user interaction required) but only AFTER the page has
// rendered — via requestIdleCallback — so they don't compete with React
// hydration / the LCP paint.
//
// Covers: Google Analytics (gtag), Meta Pixel, Microsoft Clarity, Hotjar
// (feedback widget) and Apollo. All were previously eager (GA via the gtag
// preset in <head>; the rest as eager <script> tags in docusaurus.config.js).
// keploy's own first-party telemetry stays eager (tiny, and first-party).
//
// Also fires GA + Meta Pixel pageviews on client-side (SPA) route changes.

const GA_ID = "G-LLS95VWZPC";
const PIXEL_ID = "2006330080011702";

// baseUrl is /docs/, so these resolve under the docs site root.
const DEFERRED_SCRIPTS = [
  "/docs/scripts/feedback.js", // feedback widget + Hotjar
  "/docs/scripts/clarity.js", // Microsoft Clarity
  "/docs/js/apollo-init.js", // Apollo
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

// --- Load everything once, on idle ---------------------------------------
let loaded = false;
function loadAll() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  loadGA();
  loadPixel();
  DEFERRED_SCRIPTS.forEach(injectScript);
}

function scheduleLoad() {
  if (typeof window === "undefined" || loaded) return;
  // Fire AFTER the window `load` event (i.e. after the LCP paint), then on the
  // next idle. This keeps the trackers entirely off the render/LCP path while
  // still firing automatically for every visitor — no interaction required.
  const onIdle = () => {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(loadAll, {timeout: 3000});
    } else {
      window.setTimeout(loadAll, 500); // Safari has no requestIdleCallback
    }
  };
  if (document.readyState === "complete") {
    onIdle(); // load already fired (e.g. late hydration / SPA re-entry)
  } else {
    window.addEventListener("load", onIdle, {once: true});
  }
}

export function onRouteDidUpdate({location, previousLocation}) {
  // Initial page load: defer all trackers to idle.
  if (!previousLocation) {
    scheduleLoad();
    return;
  }
  // Client-side navigation.
  if (location.pathname !== previousLocation.pathname) {
    if (loaded) {
      // Trackers already up — record the SPA pageview on GA + the Pixel.
      if (typeof window.gtag === "function") {
        window.gtag("event", "page_view", {page_path: location.pathname});
      }
      if (typeof window.fbq === "function") {
        window.fbq("track", "PageView");
      }
    } else {
      // A navigation before idle fired — bring everything up now (loadGA/
      // loadPixel fire the initial pageview for this route).
      loadAll();
    }
  }
}
