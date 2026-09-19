// keys.js — shortcut registry (ignores inputs, g-sequences).
NTI.define("core/keys", function () {
  const routes = {};
  let pending_g = false, gTimer = null;
  function on(keys, fn) { routes[keys] = fn; }
  function typing() {
    const t = document.activeElement;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
      t.isContentEditable);
  }
  document.addEventListener("keydown", (e) => {
    if (typing()) {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) {
      if ((e.key === "k" || e.key === "K") &&
          (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        (routes["/"] || (() => {}))();
      }
      return;
    }
    if (pending_g) {
      pending_g = false; clearTimeout(gTimer);
      const fn = routes["g " + e.key];
      if (fn) { e.preventDefault(); fn(); }
      return;
    }
    if (e.key === "g") {
      pending_g = true;
      gTimer = setTimeout(() => { pending_g = false; }, 800);
      return;
    }
    const fn = routes[e.key];
    if (fn) { e.preventDefault(); fn(); }
  });
  return { on };
});
