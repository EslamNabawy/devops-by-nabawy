// search.js — MiniSearch Tier 1 + lazy Tier 2, grouped results + deep links.
NTI.define("core/search", function () {
  let idx = null;
  const bodies = {};
  const tier2Loaded = {};
  function build() {
    const docs = (window.NTI.searchIndex &&
      window.NTI.searchIndex.docs) || [];
    idx = new MiniSearch({ fields: ["title", "tags", "heading", "summary"],
      storeFields: ["id", "ref", "track", "kind", "title", "heading",
        "anchor", "page"],
      searchOptions: { prefix: true, fuzzy: 0.2,
        combineWith: "AND", boost: { title: 3, tags: 2, heading: 2 } } });
    const mapped = docs.map((d, i) => Object.assign({ _n: i }, d));
    idx.addAll(mapped);
  }
  function registerBodies(track, body) {
    bodies[track] = body;
    if (!idx) return;
    const add = [];
    for (const [id, b] of Object.entries(body)) {
      (b.chunks || []).forEach((c, i) => {
        add.push({ _n: 1000000 + i, id, ref: id, track, kind: "body",
          title: "", tags: [], heading: "",
          summary: (c.text || "").slice(0, 400),
          anchor: c.anchor || null, page: c.page || null });
      });
    }
    try { idx.addAll(add); } catch {}
  }
  window.NTI.registerBodies = registerBodies;
  async function ensureTier2() {
    const L = NTI.require("core/loader");
    const Cat = NTI.require("core/catalog");
    const tracks = ((Cat.data && Cat.data.tracks) || []).map((t) => t.id);
    const v = (Cat.data && Cat.data.contentVersion) || "";
    await Promise.all(tracks.map(async (t) => {
      if (tier2Loaded[t]) return;
      tier2Loaded[t] = true;
      try {
        await L.load(`content/search-bodies-${t}.js?v=${v}`, 8000);
      } catch { /* tier1 only */ }
    }));
  }
  async function query(q) {
    if (!idx) build();
    let res = [];
    try { res = idx.search(q).slice(0, 40); } catch { res = []; }
    if (!res.length) {
      try {
        res = idx.search(q, { combineWith: "OR" }).slice(0, 40);
      } catch { res = []; }
    }
    return res;
  }
  return { build, query, ensureTier2, registerBodies };
});
