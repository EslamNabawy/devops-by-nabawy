// a11y.js — live announcer, focus trap, inert helper, reduced motion.
NTI.define("core/a11y", function () {
  function announce(msg) {
    const el = document.getElementById("live");
    if (!el) return;
    el.textContent = "";
    setTimeout(() => { el.textContent = msg; }, 30);
  }
  function trapFocus(container) {
    const sel = "a[href],button:not([disabled]),input,select," +
      "[tabindex]:not([tabindex='-1'])";
    function onKey(e) {
      if (e.key !== "Tab") return;
      const items = [...container.querySelectorAll(sel)]
        .filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    container.addEventListener("keydown", onKey);
    return () => container.removeEventListener("keydown", onKey);
  }
  function reducedMotion(store) {
    if (store.state.settings.reduceMotion === "on") return true;
    if (store.state.settings.reduceMotion === "off") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return { announce, trapFocus, reducedMotion };
});
