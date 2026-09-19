// router.js — hash router with params, scroll restore, focus hook.
NTI.define("core/router", function () {
  const mem = {};
  let current = { view: "library", params: {}, query: {} };
  const subs = [];
  function parse() {
    const h = location.hash.replace(/^#/, "") || "/";
    const [p, q] = h.split("?");
    const seg = p.split("/").filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(q || ""));
    let r = { view: "library", params: {}, query };
    if (seg[0] === "roadmap") r = { view: "roadmap", params: {}, query };
    else if (seg[0] === "track" && seg[1]) {
      r = { view: "track", params: { id: seg[1] }, query };
    } else if (seg[0] === "read" && seg[1]) {
      r = { view: "read", params: { id: seg[1] }, query };
    } else if (seg[0] === "me") r = { view: "me", params: {}, query };
    else if (seg[0] === "add") r = { view: "add", params: {}, query };
    else if (seg[0] === "404" || (seg.length && seg[0] !== "")) {
      if (seg.length) r = { view: "notfound", params: {}, query };
    }
    return r;
  }
  function titles(r) {
    return { library: "Library", roadmap: "Roadmap",
      track: "Track", read: "Reader", me: "Me", add: "Add PDF",
      notfound: "Not found" }[r.view] || "Library";
  }
  window.addEventListener("hashchange", () => {
    const prev = location.href;
    void prev;
    current = parse();
    document.title = titles(current) + " — DevOps By Nabawy";
    subs.forEach((f) => { try { f(current); } catch {} });
    const A = NTI.require("core/a11y");
    if (A && current.view === "read") {
      const Cat = NTI.require("core/catalog");
      const w = Cat.get(current.params.id);
      if (w) A.announce(`${w.title}, ${w.kind}`);
    }
  });
  return {
    get current() { return current; },
    on(f) { subs.push(f); },
    go(h) { location.hash = h; },
    init() {
      current = parse();
      document.title = titles(current) + " — DevOps By Nabawy";
    },
    saveScroll(k, y) { mem[k] = y; },
    restoreScroll(k) { return mem[k] || 0; },
  };
});
