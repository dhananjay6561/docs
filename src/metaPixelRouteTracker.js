// Meta Pixel loader + SPA PageView tracker.
//
// The base snippet used to run synchronously in docusaurus.config.js headTags,
// which blocked head parsing on every page load while it injected fbevents.js.
// It now loads lazily here: on the initial route we defer the bootstrap until
// the browser is idle (requestIdleCallback), and on client-side navigation we
// re-fire PageView (Docusaurus is an SPA, so in-app nav isn't tracked
// automatically).
const PIXEL_ID = "2006330080011702";

// Standard Meta Pixel bootstrap. The stub queues fbq() calls until
// fbevents.js finishes loading, so init/track are safe to call immediately.
function bootstrapPixel() {
  if (typeof window === "undefined" || window.fbq) return;
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

// Defer the (non-critical, third-party) pixel until the main thread is idle so
// it never competes with hydration / LCP. Falls back to a timeout on browsers
// without requestIdleCallback (e.g. Safari).
function scheduleBootstrap() {
  if (typeof window === "undefined") return;
  const ric =
    window.requestIdleCallback ||
    function (cb) {
      return window.setTimeout(cb, 2000);
    };
  ric(bootstrapPixel);
}

export function onRouteDidUpdate({location, previousLocation}) {
  // Initial page load: previousLocation is null. Kick off the deferred load.
  if (!previousLocation) {
    scheduleBootstrap();
    return;
  }
  if (location.pathname !== previousLocation.pathname) {
    if (typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    } else {
      // Pixel hasn't finished its idle bootstrap yet — schedule it (the stub
      // will queue this navigation's PageView once fbevents.js loads).
      scheduleBootstrap();
    }
  }
}
