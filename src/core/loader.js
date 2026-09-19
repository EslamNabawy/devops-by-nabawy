// loader.js — lazy <script src> injection with cache, timeout, designed error.
NTI.define("core/loader", function () {
  const cache = {};
  function load(src, timeoutMs = 10000) {
    if (cache[src]) return cache[src];
    cache[src] = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      const t = setTimeout(() => {
        el.remove(); delete cache[src];
        reject(new Error("timeout"));
      }, timeoutMs);
      el.onload = () => { clearTimeout(t); resolve(true); };
      el.onerror = () => { clearTimeout(t); delete cache[src];
        reject(new Error("load failed")); };
      el.src = src;
      document.head.appendChild(el);
    });
    return cache[src];
  }
  return { load };
});
