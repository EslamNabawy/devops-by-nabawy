// router.js — hash router with params, scroll restore, focus hook.
NTI.define("core/router", function () {
  const api = {};
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
  Object.assign(api, {
    get current() { return current; },
    on(f) { subs.push(f); },
    go(h) { location.hash = h; },
    filterUrl(nf, view) {
      const q = new URLSearchParams();
      ["track", "type", "format", "status"].forEach((k) =>
        (nf[k] || []).forEach((v) => q.append(k, v)));
      ["sort", "group"].forEach((k) => {
        if (nf[k] && nf[k][0]) q.append(k, nf[k][0]);
      });
      const qs = q.toString();
      return `#/${view === "library" ? "" : view}${qs ? "?" + qs : ""}`;
    },
    readFilterQuery() {
      // Multi-values need raw reparse (fromEntries drops repeats).
      const raw = (location.hash.split("?")[1] || "");
      const rp = new URLSearchParams(raw);
      const out = { track: rp.getAll("track"), type: rp.getAll("type"),
        format: rp.getAll("format"), status: rp.getAll("status") };
      const s = rp.get("sort"), g = rp.get("group");
      if (s) out.sort = [s];
      if (g) out.group = [g];
      return out;
    },
    init() {
      current = parse();
      document.title = titles(current) + " — DevOps By Nabawy";
      api._lastHash = location.hash;
    },
    saveScroll(k, y) { mem[k] = y; },
    restoreScroll(k) { return mem[k] || 0; },
  });
  return api;
});
