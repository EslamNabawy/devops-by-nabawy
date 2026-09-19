
/* core/ns.js */
// NTI namespace registry: NTI.define(name, fn) invokes fn immediately
// (concat order in src/manifest.json guarantees dependencies first).
window.NTI = window.NTI || {};
window.NTI._mods = window.NTI._mods || {};
window.NTI.define = window.NTI.define || function (name, fn) {
  window.NTI._mods[name] = fn();
};
window.NTI.require = window.NTI.require || function (name) {
  return window.NTI._mods[name];
};

/* core/storage.js */
﻿// storage.js — safe localStorage + IndexedDB wrappers, memory fallback.
NTI.define("core/storage", function () {
  let mem = {};
  const ls = {
    get(k) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? null : JSON.parse(v);
      } catch { return mem[k] !== undefined ? mem[k] : null; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); }
      catch { mem[k] = v; }
    },
    del(k) {
      try { localStorage.removeItem(k); } catch { delete mem[k]; }
    },
  };
  let idbOk = null;
  function idb() {
    return new Promise((resolve) => {
      if (idbOk === false) return resolve(null);
      try {
        const r = indexedDB.open("nti-local", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("files");
        r.onsuccess = () => { idbOk = true; resolve(r.result); };
        r.onerror = () => { idbOk = false; resolve(null); };
      } catch { idbOk = false; resolve(null); }
    });
  }
  const memFiles = [];
  return {
    ls,
    get available() {
      try {
        localStorage.setItem("__t", "1");
        localStorage.removeItem("__t");
        return true;
      } catch { return false; }
    },
    async filesPut(rec) {
      const db = await idb();
      if (!db) { memFiles.push(rec); return "memory"; }
      return new Promise((resolve, reject) => {
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").put(rec, rec.id);
        tx.oncomplete = () => resolve("idb");
        tx.onerror = () => reject(tx.error);
      });
    },
    async filesAll() {
      const db = await idb();
      if (!db) return memFiles.slice();
      return new Promise((resolve) => {
        try {
          const tx = db.transaction("files", "readonly");
          const q = tx.objectStore("files").getAll();
          q.onsuccess = () => resolve(q.result || []);
          q.onerror = () => resolve([]);
        } catch { resolve([]); }
      });
    },
    async filesDel(id) {
      const i = memFiles.findIndex((f) => f.id === id);
      if (i >= 0) memFiles.splice(i, 1);
      const db = await idb();
      if (!db) return;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction("files", "readwrite");
          tx.objectStore("files").delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch { resolve(); }
      });
    },
  };
});

/* core/store.js */
﻿// store.js — single state store, pure selectors, export/import.
NTI.define("core/store", function () {
  const S = NTI.require("core/storage");
  const listeners = [];
  const state = {
    progress: S.ls.get("nti.v1.progress") || {},
    bookmarks: S.ls.get("nti.v1.bookmarks") || [],
    last: S.ls.get("nti.v1.last") || null,
    settings: Object.assign({ theme: "system", density: "comfortable",
      readingSize: 1, reduceMotion: "system", hideDone: false },
      S.ls.get("nti.v1.settings") || {}),
    filters: S.ls.get("nti.v1.filters") || {},
    recent: S.ls.get("nti.v1.recentSearches") || [],
  };
  function save() {
    S.ls.set("nti.v1.progress", state.progress);
    S.ls.set("nti.v1.bookmarks", state.bookmarks);
    S.ls.set("nti.v1.last", state.last);
    S.ls.set("nti.v1.settings", state.settings);
    S.ls.set("nti.v1.filters", state.filters);
    S.ls.set("nti.v1.recentSearches", state.recent.slice(0, 6));
    listeners.forEach((f) => { try { f(); } catch {} });
  }
  return {
    state,
    on(f) { listeners.push(f); },
    setDone(id, done) {
      if (done) {
        state.progress[id] = { state: "done",
          at: new Date().toISOString() };
      } else delete state.progress[id];
      save();
    },
    setLast(rec) { state.last = rec; save(); },
    toggleBookmark(id, anchor) {
      const i = state.bookmarks.findIndex((b) => b.workId === id);
      if (i >= 0) state.bookmarks.splice(i, 1);
      else {
        state.bookmarks.push({ workId: id, anchor: anchor || null,
          at: new Date().toISOString() });
      }
      save();
      return i < 0;
    },
    setSettings(patch) {
      Object.assign(state.settings, patch); save();
    },
    setFilters(f) { state.filters = f; save(); },
    pushRecent(q) {
      state.recent = [q, ...state.recent.filter((x) => x !== q)]
        .slice(0, 6);
      save();
    },
    export() {
      return JSON.stringify({ v: 1, progress: state.progress,
        bookmarks: state.bookmarks, last: state.last,
        settings: state.settings });
    },
    import(text) {
      const d = JSON.parse(text);
      if (!d || typeof d !== "object" || !d.progress) throw new Error("bad");
      state.progress = d.progress;
      state.bookmarks = d.bookmarks || [];
      state.last = d.last || null;
      Object.assign(state.settings, d.settings || {});
      save();
    },
  };
});

/* core/catalog.js */
﻿// catalog.js — index + progress math (single source).
NTI.define("core/catalog", function () {
  let C = null;
  function init() { C = window.NTI.catalog || null; }
  function works() { return (C && C.works) || []; }
  function ready(w) {
    return (w.formats || []).some((f) => f.status === "ready");
  }
  function isDone(id, progress) {
    return !!(progress[id] && progress[id].state === "done");
  }
  function byTrack(t) {
    return works().filter((w) => w.track === t)
      .sort((a, b) => a.order - b.order);
  }
  function counts(t, progress) {
    const all = byTrack(t).filter(ready);
    const done = all.filter((w) => isDone(w.id, progress)).length;
    return { done, total: all.length };
  }
  function nextWork(trackId, progress) {
    const pinned = ((C && C.externals) || [])
      .filter((e) => e.track === trackId);
    for (const e of pinned) {
      if (!isDone(e.id, progress)) {
        return { id: e.id, track: trackId, kind: "external",
                 title: e.title, external: e };
      }
    }
    return byTrack(trackId).filter(ready)
      .find((w) => !isDone(w.id, progress)) || null;
  }
  function recommendedTrack(progress) {
    const tracks = ((C && C.tracks) || []).slice()
      .sort((a, b) => a.order - b.order);
    for (const t of tracks) {
      const c = counts(t.id, progress);
      if (c.total === 0) continue;
      if (c.done >= c.total) continue;
      const afters = t.after || [];
      const ok = afters.every((a) => {
        const ac = counts(a, progress);
        return ac.done > 0 || Object.keys(progress).some((id) =>
          id.indexOf(a + "-") === 0);
      });
      if (ok || afters.length === 0) return t;
    }
    return tracks.find((t) => {
      const c = counts(t.id, progress);
      return c.total > 0 && c.done < c.total;
    }) || null;
  }
  function get(id) {
    const w = works().find((x) => x.id === id);
    if (w) return w;
    const e = ((C && C.externals) || []).find((x) => x.id === id);
    if (e) {
      return { id: e.id, track: e.track, kind: "external",
               title: e.title, summary: e.summary, external: e,
               formats: [] };
    }
    const b = ((C && C.books) || []).find((x) => x.id === id);
    if (b) {
      return { id: b.id, track: b.track, kind: "book", title: b.title,
               authors: b.authors, chapters: b.chapters,
               formats: b.formats };
    }
    return null;
  }
  return { init, works, byTrack, counts, nextWork, recommendedTrack,
    get, ready, isDone, get data() { return C; } };
});

/* core/router.js */
﻿// router.js — hash router with params, scroll restore, focus hook.
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
    else if (seg[0] === "archive") r = { view: "archive", params: {}, query };
    else if (seg[0] === "about") r = { view: "about", params: {}, query };
    else if (seg[0] === "track" && seg[1]) {
      r = { view: "track", params: { id: seg[1] }, query };
    } else if (seg[0] === "read" && seg[1]) {
      r = { view: "read", params: { id: seg[1] }, query };
    } else if (seg[0] === "course" && seg[1]) {
      r = { view: "course", params: { id: seg[1] }, query };
    } else if (seg[0] === "me") r = { view: "me", params: {}, query };
    else if (seg[0] === "add") r = { view: "add", params: {}, query };
    else if (seg[0] === "404" || (seg.length && seg[0] !== "")) {
      if (seg.length) r = { view: "notfound", params: {}, query };
    }
    return r;
  }
  function titles(r) {
    return { library: "Library", roadmap: "Roadmap", archive: "Archive",
      about: "About",
      track: "Track", read: "Reader", course: "Course", me: "Me", add: "Add PDF",
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
  Object.defineProperty(api, "current", { get: () => current });
  Object.assign(api, {
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

/* core/loader.js */
﻿// loader.js — lazy <script src> injection with cache, timeout, designed error.
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

/* core/search.js */
﻿// search.js — MiniSearch Tier 1 + lazy Tier 2, grouped results + deep links.
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

/* core/a11y.js */
﻿// a11y.js — live announcer, focus trap, inert helper, reduced motion.
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

/* core/keys.js */
﻿// keys.js — shortcut registry (ignores inputs, g-sequences).
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

/* core/theme.js */
﻿// theme.js — system/light/dark + density + reading + motion -> data-* on <html>.
NTI.define("core/theme", function () {
  function apply(s) {
    const h = document.documentElement;
    const theme = s.theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark" : "light") : s.theme;
    h.setAttribute("data-theme", s.theme === "system" ? theme : s.theme);
    h.setAttribute("data-density", s.density || "comfortable");
    h.setAttribute("data-reading", String(s.readingSize ?? 1));
    h.setAttribute("data-motion", s.reduceMotion || "system");
  }
  return { apply };
});

/* core/dropzone.js */
﻿// dropzone.js — window drag/drop + picker -> IndexedDB My files, Blob URLs.
NTI.define("core/dropzone", function () {
  function isPdf(file) {
    return file && (file.type === "application/pdf" ||
      /\.pdf$/i.test(file.name || ""));
  }
  async function addFile(file, store, copy) {
    const S = NTI.require("core/storage");
    if (!isPdf(file)) {
      NTI.require("ui/primitives").toast(copy.onlyPdf);
      return null;
    }
    if (file.size > 200 * 1024 * 1024) {
      NTI.require("ui/primitives").toast(copy.storageFull);
      return null;
    }
    const rec = { id: "local-" + Math.random().toString(36).slice(2) +
      Date.now().toString(36), name: file.name, track: null,
      bytes: file.size, addedAt: new Date().toISOString(), blob: file };
    try {
      const where = await S.filesPut(rec);
      NTI.require("ui/primitives").toast(copy.savedFiles);
      if (where === "memory") {
        NTI.require("ui/primitives").toast(copy.sessionOnly);
      }
    } catch {
      NTI.require("ui/primitives").toast(copy.storageFull);
      return null;
    }
    return rec;
  }
  function init(store, copy) {
    const overlay = document.createElement("div");
    overlay.className = "drop-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `<div class="drop-card"><strong>${copy.dropPdf}</strong><span>${copy.dropStays}</span></div>`;
    document.body.appendChild(overlay);
    let depth = 0;
    window.addEventListener("dragenter", (e) => {
      if (e.target.closest && e.target.closest(".modal")) return;
      depth++;
      overlay.hidden = false;
      e.preventDefault();
    });
    window.addEventListener("dragleave", () => {
      depth = Math.max(0, depth - 1);
      if (!depth) overlay.hidden = true;
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", async (e) => {
      depth = 0; overlay.hidden = true;
      if (e.target.closest && e.target.closest(".modal")) return;
      e.preventDefault();
      const f = e.dataTransfer && e.dataTransfer.files &&
        e.dataTransfer.files[0];
      if (!f) return;
      const rec = await addFile(f, store, copy);
      if (rec) {
        const A = NTI.require("core/a11y");
        A.announce(copy.savedFiles);
        NTI.require("core/router").go(`#/read/${rec.id}?fmt=local`);
      }
    });
  }
  return { init, addFile, isPdf };
});

/* core/copy.js */
// copy.js — every UI string lives here (UX-FLOWS §7, verbatim).
NTI.define("core/copy", function () {
  return {
    searchPlaceholder: (n) => `Search ${n} items`,
    hint: "Press / to search. Press ? for shortcuts.",
    nothingMatches: "Nothing matches",
    nothingMatchesBody:
      "Try fewer words or remove a filter. Search covers titles, headings and text inside lessons and PDFs.",
    clearFilters: "Clear filters",
    nothingHere: "Nothing here yet",
    nothingHereBody: "This track has no material yet.",
    backToLibrary: "Back to Library",
    noPdfs: "No PDFs yet",
    noPdfsBody:
      "PDFs show up here as soon as they are added. You can also open one from your computer.",
    openPdfFromComputer: "Open a PDF from your computer",
    howToAdd: "How to add PDFs",
    noPdfsMatch: "No PDFs match",
    noPdfsMatchBody: "Try removing a filter.",
    needsInternet: "Needs internet",
    onlineOnly: "This course is online only. Reconnect to open it.",
    fatal: "The library data didn't load",
    fatalBody:
      "Reload the page. If it keeps happening, the content folder may be incomplete.",
    reload: "Reload",
    refreshThenReload: "Run refresh, then reload.",
    lessonFailed: "This lesson didn't load",
    lessonFailedBody: "The file may be missing from the content folder.",
    tryAgain: "Try again",
    backTo: (t) => `Back to ${t}`,
    pdfMissing: "This PDF isn't in the library folder",
    pdfMissingBody: "It may have been moved or renamed.",
    pdfBlocked: "Open this PDF in your PDF app",
    pdfBlockedBody: "Your browser can't show PDFs inside the page.",
    openPdf: "Open PDF",
    download: "Download",
    pdfPendingTip: "The PDF isn't added yet.",
    comingSoon: "Coming soon",
    comingSoonBody: "This PDF hasn't been added yet.",
    noProgress: "Nothing started. Pick a lesson from the Library or follow the Roadmap.",
    openRoadmap: "Open Roadmap",
    noBookmarks: "No bookmarks yet. Press b on a lesson to save it.",
    noFiles: "No files on this device. Drag a PDF onto the page or open one from your computer.",
    storageBlocked: "This browser can't save your progress. Export it to keep it.",
    backupTitle: "Back up your progress",
    backupBody: "Progress is saved in this browser only.",
    exportBtn: "Export",
    importBtn: "Import",
    imported: "Progress imported",
    importFailed: "That file isn't a progress backup.",
    dropPdf: "Drop a PDF to open it",
    dropStays: "It stays on this device.",
    onlyPdf: "Only PDF files can be added.",
    savedFiles: "Saved to My files",
    storageFull: "Couldn't save this file. Free some space or remove old files.",
    sessionOnly: "Opened for this session only.",
    markedDone: "Marked done",
    bookmarked: "Bookmarked",
    removed: "Removed",
    copied: "Copied",
    undo: "Undo",
    loading: "Loading",
    indexing: "Indexing…",
    originalStyle: "Shown in its original style",
    openNewTab: "Open in new tab",
    libraryInfo: "Nothing you do here leaves this device.",
    paletteFooter: "Search covers this library. Course sites open in a new tab.",
    markDone: "Mark done",
    markDoneContinue: "Mark done and continue",
    bookmark: "Bookmark",
    continueBtn: "Continue",
    start: "Start",
    resume: "Resume",
    open: "Open",
    heroEyebrow: "Engineered for NTI Egypt, offline first",
    heroTitleLead: "Learn DevOps,",
    heroTitleAccent: "one page",
    heroTitleTail: "at a time.",
    heroBody: "Read offline, search every page, and track your progress through cloud infrastructure without high-friction signups.",
    searchCta: "What do you want to learn today?",
    searchTip: "Tip: press Ctrl/Cmd + K to search anywhere.",
    popularLabel: "Popular:",
    popular: ["kubernetes ingress", "docker volumes", "ansible roles"],
    continueEyebrow: "Continue reading",
    statsOffline: "100% offline",
    statsOfflineBody: "Local storage caching, zero network loss.",
    howTitle: "How it works",
    howBody: "No complicated registration. Pure offline-ready knowledge transfer.",
    howSteps: [
      ["Pick a track", "Select from curated topics built around industry demands and NTI tracks."],
      ["Read a PDF or open a course", "Open right in your browser or save it locally. Every paragraph and snippet is indexed."],
      ["Watch your progress grow", "Your browser stores checkpoints safely on your device. Zero cloud sync delays."],
    ],
    footerTag: "Free, offline-first DevOps learning. No tracking, no accounts.",
    heroCtaTracks: "Browse tracks",
    heroCtaRoadmap: "Follow the roadmap",
    tracksTitle: "Tracks",
    tracksBody: "Nine jobs in six stages. Nothing is locked, prerequisites are suggestions.",
    openTrack: "Open track",
    cmdDeckTitle: "Quick command deck",
    cmdDeckBody: "One tap to copy. Full lessons below carry the detail.",
    copyCmd: "Copy",
    studyDeckTitle: "Study deck",
    studyDeckBody: "Flip, recall, master. Open the online course for the full deck.",
    onlineCourse: "Online course",
    journeyEyebrow: "NTI Egypt curriculum flow",
    journeyTitle: "Your learning journey",
    journeyBody: "A suggested path. Learn in any order you like. The order is a recommendation, not a rule.",
    savedLocal: "Progress saved only in this browser.",
    overallProgress: "Overall progress",
    tracksRemaining: (n) => `${n} tracks remaining`,
    mapKey: "Map key",
    statusDone: "Done",
    statusProgress: "In progress",
    statusTodo: "Not started",
    nextUp: "Next up in sequence",
    tracksEyebrow: "Curriculum roadmap",
    allTracksTitle: "All tracks",
    allTracksBody: "Nine topics, one friendly place to learn them.",
    continueOf: (d, t) => `Continue (${d}/${t})`,
    crumbTracks: "Tracks",
    interactiveTrack: "Interactive track",
    requiresInternet: "Requires live internet",
    upNext: "Up next",
    offlineReady: "Offline ready",
    worksOffline: "Works offline",
    readAgain: "Read again",
    startReading: "Start reading",
    continueReading: "Continue reading",
    bundleSize: (mb) => `Bundle size: ${mb} MB`,
    suggestedOrder: "Suggested reading order",
    lostEyebrow: "Route unresolved",
    lostTitle: "Oops, this page wandered off.",
    lostBody: "Even the best setups return a 404 sometimes. Get back on track without losing your place.",
    resumeReading: "Resume reading",
    backHome: "Back to home",
    popularJumps: "Popular jump points:",
    resultsCount: (n) => `${n} results`,
    indexedLocal: "Indexed locally, offline query.",
    localPrivate: "100% local and private",
    meBody: "Your offline learning hub. Everything here stays inside this browser.",
    curriculumOverview: "Curriculum overview",
    tracksStatus: "Tracks status breakdown",
    recentActivity: "Recent activity",
    statusUpcoming: "Upcoming",
    archiveTeaser: "Looking for labs and scripts?",
    archiveTeaserLink: "They are in the Archive.",
    archiveTitle: "Archive",
    aboutTitle: "About and help",
    aboutOpen: "Open source",
    aboutVerified: "Verified curriculum",
    aboutStatic: "Static site: no tracking, works from a file or GitHub Pages.",
    archiveEyebrow: "Auxiliary repository",
    archiveTitle: "Archive: labs, scripts and documents",
    archiveBody: "Supplementary material, reference architectures, and standalone scripts. Kept available offline, separate from the primary tracks.",
    filterPlaceholder: "Filter by title or keyword...",
    allTracksFilter: "All tracks",
    alphaSort: "Alphabetical (A-Z)",
    tabAll: "All",
    tabLabs: "Labs",
    tabScripts: "Scripts",
    tabDocs: "Documents",
    itemsAvailable: (n) => `${n} items available`,
    showMore: (n, s, t) => `Show ${n} more items (${s} of ${t} displayed)`,
    backToTracks: "Back to core tracks",
    archiveCrumb: "Archive",
    backToArchive: "Back to Archive",
    cachedLocal: "Cached locally",
    bundleSizeShort: (mb) => `Bundle size: ${mb} MB`,
    attachedGuide: "Attached lab guide",
    openViewer: "Open in viewer",
    labSteps: "Lab steps",
    setupCheck: (d, t) => `Setup check ${d}/${t}`,
    nextStepHint: "Press Alt + J for next step",
    courseView: "Course view",
    courseEyebrow: "External course",
    sandboxState: "Demo sandbox state",
    sandboxLoaded: "Loaded",
    sandboxOffline: "Offline",
    blockedEmbed: "Blocked embed",
    embedNote: "External course sites may block embedding, so this view keeps the course outside the page. Open it in a new tab anytime.",
    httpsVerified: "HTTPS verified",
    syllabusTitle: "Curriculum syllabus",
    offlineSnapshots: "Cached offline snapshots",
    finishCourse: "I finished this course",
    courseDone: "Course done",
    recEyebrow: "Recommended step",
    ntiPathway: "NTI Pathway",
    seeRoadmap: "See full roadmap",
    learnOnline: "Learn online",
    learnOnlineBody: "Interactive courses that open right here in your browser.",
    onlineLabs: "Online labs",
    onlineLabsBody: "Interactive browser courses",
    browseCourses: "Browse courses",
    egyptEyebrow: "Egyptian cloud initiative",
    egyptTitle: "Designed for NTI cohort sync & intermittent connections",
    egyptBody: "Download the syllabus once and keep reading through campus Wi-Fi drops. Zero telemetry, zero logins.",
    recentLink: "Not this one? See recent",
    footLearn: "Learn",
    footCourses: "Courses",
    footCommunity: "Community",
    tracksLink: "Tracks",
    searchLink: "Search",
    preIndexed: "All archive scripts and documents are pre-indexed for offline reading.",
    aboutEyebrow: "NTI mentorship, self-paced cloud engineering",
    aboutTitle: "About DevOps By Nabawy",
    aboutBody: "A free, offline-first curriculum designed for NTI students and aspiring DevOps engineers.",
    motivationTitle: "Built for real students living in the real world.",
    motivationBody: "Zero registration forms, instant local caching in your browser, and zero behavioral telemetry.",
    pillarOffline: "100% offline-first",
    pillarOfflineBody: "PDFs and guides cache into the browser on first load. Study uninterrupted.",
    pillarUntethered: "Zero cloud tether",
    pillarUntetheredBody: "No accounts, no passwords, no analytics, no ads. Progress lives on your device only.",
    pillarNti: "Tailored for NTI",
    pillarNtiBody: "Mapped to the NTI syllabus, hiring standards, and hands-on troubleshooting scenarios.",
    versionLabel: (v) => `Version ${v}, offline ready`,
  };
});

/* ui/primitives.js */
﻿// primitives.js — Button, Chip, Toast, Modal, Skeleton, EmptyState.
NTI.define("ui/primitives", function () {
  const { html } = window.htmPreact;
  let toastTimer = null;
  function toast(msg, action) {
    let el = document.querySelector(".toast-stack");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast-stack";
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.innerHTML = "";
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    if (action) {
      const b = document.createElement("button");
      b.className = "btn btn-ghost";
      b.textContent = action.label;
      b.onclick = () => { action.fn(); el.innerHTML = ""; };
      t.appendChild(b);
    }
    el.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.innerHTML = ""; }, 4000);
  }
  function EmptyState({ title, body, actionLabel, onAction }) {
    return html`<div class="empty">
      <h2>${title}</h2><p>${body}</p>
      ${actionLabel ? html`<button class="btn btn-primary" onClick=${onAction}>${actionLabel}</button>` : null}
    </div>`;
  }
  function Skeleton() {
    return html`<div class="skeleton" aria-label="Loading"><span></span><span></span><span></span></div>`;
  }
  return { toast, EmptyState, Skeleton };
});

/* ui/icons.js */
﻿// icons.js — <Icon name> from the inline sprite.
NTI.define("ui/icons", function () {
  const { html } = window.htmPreact;
  const KNOWN = ["search", "map", "user", "plus", "check", "bookmark",
    "external", "file", "book", "flask", "code", "image", "chevron",
    "x", "menu", "clock", "layers"];
  function Icon({ name }) {
    const n = KNOWN.includes(name) ? name : "file";
    return html`<svg class="icon" aria-hidden="true"><use href="#i-${n}"></use></svg>`;
  }
  return { Icon };
});

/* ui/status.js */
﻿// status.js — StatusGlyph, FormatChips, KindLabel, ProgressRing, SegmentedBar.
NTI.define("ui/status", function () {
  const { html } = window.htmPreact;
  const KIND = { lesson: "Lesson", lab: "Lab", script: "Script",
    book: "Book", evidence: "Screenshot", reference: "Reference",
    external: "Online course" };
  function KindLabel({ kind }) {
    return html`<span class="kind">${KIND[kind] || kind}</span>`;
  }
  function FormatChips({ formats }) {
    return html`<span class="chips">${(formats || []).map((f) =>
      f.status === "pending"
        ? html`<span class="chip chip-pending" title="Coming soon">${String(f.type).toUpperCase()}</span>`
        : html`<span class="chip">${String(f.type).toUpperCase()}</span>`)}</span>`;
  }
  function ProgressRing({ done, total }) {
    const p = total ? Math.round((done / total) * 100) : 0;
    return html`<span class="ring" role="img" aria-label="${done} of ${total} done">
      <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" class="ring-bg"/><circle cx="10" cy="10" r="8" class="ring-fg" stroke-dasharray="${p} 100"/></svg>
      <span class="ring-n">${done}/${total}</span></span>`;
  }
  function SegmentedBar({ done, total }) {
    return html`<progress class="segbar" max=${total} value=${done}
      aria-label="${done} of ${total} done">${done}/${total}</progress>`;
  }
  function StatusGlyph({ state }) {
    return html`<span class="glyph glyph-${state}" aria-hidden="true">${state === "done" ? "✓" : state === "reading" ? "◐" : "○"}</span>`;
  }
  return { KindLabel, FormatChips, ProgressRing, SegmentedBar,
    StatusGlyph, KIND };
});

/* ui/topbar.js */
﻿// topbar.js + bottomnav.js — chrome.
NTI.define("ui/topbar", function () {
  const { html } = window.htmPreact;
  const { Icon } = NTI.require("ui/icons");
  function Topbar({ route, onSearch, count }) {
    const R = NTI.require("core/router");
    const copy = NTI.require("core/copy");
    const Cat = NTI.require("core/catalog");
    const maint = !!(Cat.data.site && Cat.data.site.maintainerMode);
    return html`<header class="topbar">
      <a class="brand" href="#/">DevOps By Nabawy</a>
      <nav class="topnav" aria-label="Primary">
        <a href="#/" aria-current=${route.view === "library" ? "page" : null}>Library</a>
        <a href="#/roadmap" aria-current=${route.view === "roadmap" ? "page" : null}>Roadmap</a>
        <a href="#/archive" aria-current=${route.view === "archive" ? "page" : null}>Archive</a>
        <a href="#/about" aria-current=${route.view === "about" ? "page" : null}>About</a>
        ${maint ? html`<a href="#/add" aria-current=${route.view === "add" ? "page" : null}>Add PDF</a>` : null}
      </nav>
      <button class="search-trigger" onClick=${onSearch} aria-label="Search">
        <${Icon} name="search" /><span>${copy.searchPlaceholder(count)}</span>
      </button>
      <nav class="topnav" aria-label="Personal">
        <a href="#/me">Me</a>
      </nav>
    </header>`;
  }
  return { Topbar };
});
NTI.define("ui/bottomnav", function () {
  const { html } = window.htmPreact;
  function Bottomnav({ route }) {
    return html`<nav class="bottomnav" aria-label="Primary">
      <a href="#/" aria-current=${route.view === "library" ? "page" : null}>Library</a>
      <a href="#/roadmap" aria-current=${route.view === "roadmap" ? "page" : null}>Roadmap</a>
      <a href="#/me" aria-current=${route.view === "me" ? "page" : null}>Me</a>
    </nav>`;
  }
  return { Bottomnav };
});

/* ui/bottomnav.js */
﻿// bottomnav registered inside ui/topbar.js (single chrome module).

/* ui/strip.js */
﻿// strip.js — pipeline strip (toolbar, roving tabindex, aria-pressed).
NTI.define("ui/strip", function () {
  const { html } = window.htmPreact;
  function Strip({ tracks, selected, counts, onToggle }) {
    return html`<div class="strip" role="toolbar" aria-label="Tracks">
      ${tracks.map((t) => {
        const on = (selected || []).includes(t.id);
        const c = counts[t.id] || { done: 0, total: 0 };
        return html`<button class="strip-node" data-track=${t.id}
          aria-pressed=${on ? "true" : "false"} onClick=${() => onToggle(t.id)}
          title="${t.title} — ${c.done}/${c.total}">
          <span class="dot"></span><span>${t.short}</span>
          <span class="n">${c.done}/${c.total}</span></button>`;
      })}
    </div>`;
  }
  return { Strip };
});

/* ui/palette.js */
﻿// palette.js — command palette: Go to / Works / Inside documents + My files.
NTI.define("ui/palette", function () {
  const { html, Component } = window.htmPreact;
  class Palette extends Component {
    constructor(p) {
      super(p);
      this.state = { q: (p && p.initialQ) || "", results: [],
        active: 0, indexing: false };
    }
    componentDidMount() {
      if (this.props.initialQ) this.onInput(this.props.initialQ);
    }
    async onInput(q) {
      this.setState({ q, active: 0 });
      if (!q.trim()) { this.setState({ results: [] }); return; }
      const S = NTI.require("core/search");
      this.setState({ indexing: true });
      S.ensureTier2().finally(() => this.setState({ indexing: false }));
      const r = await S.query(q.trim());
      // My files: name-only entries (never in the shared index).
      try {
        const files = await NTI.require("core/storage").filesAll();
        const ql = q.trim().toLowerCase();
        files.filter((f) => (f.name || "").toLowerCase().includes(ql))
          .slice(0, 5)
          .forEach((f) => r.push({ id: f.id, ref: f.id, track: "",
            kind: "local", title: f.name, heading: "", anchor: null,
            page: null, local: true }));
      } catch { /* ignore */ }
      this.setState({ results: r });
      NTI.require("core/a11y").announce(`${r.length} results`);
    }
    openWork(r) {
      const store = NTI.require("core/store");
      const R = NTI.require("core/router");
      if (r.local) {
        this.props.onClose();
        R.go(`#/read/${r.id}?fmt=local`);
        return;
      }
      store.pushRecent(this.state.q);
      let h = `#/read/${r.id}`;
      const params = [];
      if (r.page) params.push(`fmt=pdf&page=${r.page}`);
      else if (r.anchor) params.push(`a=${r.anchor}`);
      if (params.length) h += "?" + params.join("&");
      this.props.onClose();
      R.go(h);
    }
    render(_, s) {
      const copy = NTI.require("core/copy");
      const A = NTI.require("core/a11y");
      const store = NTI.require("core/store");
      const R = NTI.require("core/router");
      const trap = (el) => { if (el) { this._untrap && this._untrap(); this._untrap = A.trapFocus(el); const i = el.querySelector("input"); if (i) i.focus(); } };
      return html`<div class="modal-back" onClick=${this.props.onClose}>
        <div class="palette modal" role="dialog" aria-label="Search" ref=${trap} onClick=${(e) => e.stopPropagation()}>
          <input placeholder=${copy.searchPlaceholder(this.props.count)}
            value=${s.q} onInput=${(e) => this.onInput(e.target.value)}
            onKeyDown=${(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); this.setState({ active: Math.min(s.active + 1, s.results.length - 1) }); }
              if (e.key === "ArrowUp") { e.preventDefault(); this.setState({ active: Math.max(s.active - 1, 0) }); }
              if (e.key === "Enter" && s.results[s.active]) this.openWork(s.results[s.active]);
              if (e.key === "Escape") this.props.onClose();
            }} aria-label="Search" />
          ${s.indexing ? html`<p class="muted">${copy.indexing}</p>` : null}
          ${s.q && !s.indexing ? html`<p class="muted">${copy.resultsCount(s.results.length)} · ${copy.indexedLocal}</p>` : null}
          <ul class="pal-list">
            ${(s.results || []).map((r, i) => html`<li class=${i === s.active ? "active" : ""}>
              <button onClick=${() => this.openWork(r)}>
                <strong>${r.title || r.id}</strong>
                ${r.heading ? html`<span class="muted"> — ${r.heading}</span>` : null}
                ${r.page ? html`<span class="muted"> — page ${r.page}</span>` : null}
                <span class="muted">${r.track} · ${r.kind}</span>
              </button></li>`)}
          </ul>
          ${s.q && !s.results.length && !s.indexing ? html`<p><strong>${copy.nothingMatches}</strong></p><p>${copy.nothingMatchesBody}</p>` : null}
          ${!s.q && (store.state.recent || []).length ? html`<div class="recent">
            <p class="muted">Recent</p>
            <ul class="pal-list">${store.state.recent.map((r) => html`<li>
              <button onClick=${() => {
                const inp = document.querySelector(".palette input");
                if (inp) { inp.value = r; }
                this.onInput(r);
              }}>${r}</button></li>`)}</ul></div>` : null}
          <p class="muted pal-foot">${copy.paletteFooter}</p>
        </div></div>`;
    }
  }
  return { Palette };
});

/* ui/filters.js */
﻿// filters.js — filter rail + sheet + active chips (type/format/status).
NTI.define("ui/filters", function () {
  const { html } = window.htmPreact;
  const TYPES = ["lesson", "lab", "script", "book", "reference", "external"];
  const FORMATS = ["md", "html", "pdf"];
  const STATUS = ["done", "reading", "not-started"];
  function Filters({ value, onChange }) {
    const v = value || {};
    const tog = (k, opt) => {
      const cur = v[k] || [];
      onChange(Object.assign({}, v, { [k]: cur.includes(opt)
        ? cur.filter((x) => x !== opt) : [...cur, opt] }));
    };
    const active = [...(v.type || []), ...(v.format || []),
      ...(v.status || [])];
    return html`<section class="filters" aria-label="Filters">
      <div class="fgroup"><h3>Type</h3>${TYPES.map((t) =>
        html`<button class="chip ${((v.type || []).includes(t)) ? "on" : ""}"
          aria-pressed=${((v.type || []).includes(t))} onClick=${() => tog("type", t)}>${t}</button>`)}</div>
      <div class="fgroup"><h3>Format</h3>${FORMATS.map((t) =>
        html`<button class="chip ${((v.format || []).includes(t)) ? "on" : ""}"
          aria-pressed=${((v.format || []).includes(t))} onClick=${() => tog("format", t)}>${t.toUpperCase()}</button>`)}</div>
      <div class="fgroup"><h3>Status</h3>${STATUS.map((t) =>
        html`<button class="chip ${((v.status || []).includes(t)) ? "on" : ""}"
          aria-pressed=${((v.status || []).includes(t))} onClick=${() => tog("status", t)}>${t}</button>`)}</div>
      ${active.length ? html`<div class="chips">
        ${active.map((a) => html`<span class="chip on">${a}</span>`)}
        <button class="btn btn-ghost" onClick=${() => onChange({})}>Clear filters</button>
      </div>` : null}
    </section>`;
  }
  function matchWork(w, f, store) {
    if (!f) return true;
    const Cat = NTI.require("core/catalog");
    if ((f.type || []).length && !f.type.includes(w.kind)) return false;
    if ((f.format || []).length) {
      const fmts = (w.formats || []).filter((x) => x.status === "ready")
        .map((x) => x.type);
      if (!f.format.some((x) => fmts.includes(x))) return false;
    }
    if ((f.status || []).length) {
      const st = Cat.isDone(w.id, store.state.progress) ? "done"
        : (store.state.progress[w.id] ? "reading" : "not-started");
      if (!f.status.includes(st)) return false;
    }
    return true;
  }
  return { Filters, matchWork };
});

/* views/library.js */
﻿// library.js — Continue block, Books group, track groups, My files group.
NTI.define("views/library", function () {
  const { html } = window.htmPreact;
  const { KindLabel, FormatChips, StatusGlyph } = NTI.require("ui/status");
  const { EmptyState } = NTI.require("ui/primitives");
  const { matchWork } = NTI.require("ui/filters");
  function metaLine(w) {
    const bits = [];
    if (w.minutes) {
      bits.push(w.minutes < 60 ? `${w.minutes} min`
        : `${Math.floor(w.minutes / 60)} h ${w.minutes % 60} min`);
    }
    const pdf = (w.formats || []).find((f) => f.type === "pdf" &&
      f.status === "ready");
    if (pdf && pdf.pages) bits.push(`${pdf.pages} pages`);
    return bits.join(" · ");
  }
  function Row({ w, store }) {
    const Cat = NTI.require("core/catalog");
    const done = Cat.isDone(w.id, store.state.progress);
    const reading = !!store.state.progress[w.id];
    const R = NTI.require("core/router");
    const open = (e) => {
      e.preventDefault();
      if (w.kind === "external") {
        if (!navigator.onLine) {
          NTI.require("ui/primitives").toast(
            NTI.require("core/copy").onlineOnly);
        }
        window.open(w.external.url, "_blank", "noopener");
        return;
      }
      store.setLast({ workId: w.id, anchor: null, page: null,
        at: new Date().toISOString() });
      R.go(`#/read/${w.id}`);
    };
    return html`<li class="row" data-kind=${w.kind}>
      <a href="#/read/${w.id}" onClick=${open}>
        <${StatusGlyph} state=${done ? "done" : reading ? "reading" : "todo"} />
        <span class="row-t"><strong>${w.title}</strong>
          <span class="muted">${metaLine(w)}${w.kind === "external" ? ` · ${w.external.host} · Online` : ""}${!navigator.onLine && w.kind === "external" ? " · Needs internet" : ""}</span></span>
        <${KindLabel} kind=${w.kind} />
        <${FormatChips} formats=${w.formats} />
      </a>
      <button class="iconbtn" aria-label="Toggle done" onClick=${() => {
        store.setDone(w.id, !done);
        NTI.require("ui/primitives").toast(NTI.require("core/copy").markedDone,
          done ? null : { label: NTI.require("core/copy").undo,
            fn: () => store.setDone(w.id, done) });
      }}>${done ? "✓" : "○"}</button>
    </li>`;
  }
  function sortItems(items, sort) {
    const arr = items.slice();
    if (sort === "title") {
      arr.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "shortest") {
      arr.sort((a, b) => (a.minutes || 0) - (b.minutes || 0));
    } else if (sort === "recent") {
      arr.sort((a, b) => String(b.addedAt || "").localeCompare(
        String(a.addedAt || "")) || b.order - a.order);
    } else {
      arr.sort((a, b) => a.order - b.order);
    }
    return arr;
  }
  function Library({ store, filters, myFiles, onSearch }) {
    const Cat = NTI.require("core/catalog");
    const copy = NTI.require("core/copy");
    const R = NTI.require("core/router");
    const tracks = (Cat.data.tracks || []).slice()
      .sort((a, b) => a.order - b.order);
    const sort = (filters.sort && filters.sort[0]) || "order";
    const group = (filters.group && filters.group[0]) || "track";
    const setList = (k, v) => {
      const nf = Object.assign({}, filters, { [k]: v ? [v] : [] });
      R.go(R.filterUrl(nf, "library"));
    };
    const ask = (q) => { if (onSearch) onSearch(q || ""); };
    // Continue block
    let cont = null;
    if (store.state.last && !Cat.isDone(store.state.last.workId,
        store.state.progress)) {
      cont = Cat.get(store.state.last.workId);
    }
    if (!cont) {
      const rec = Cat.recommendedTrack(store.state.progress);
      if (rec) cont = Cat.nextWork(rec.id, store.state.progress);
    }
    // Live stats: tracks carrying PDFs, total PDF pages.
    let pdfTracks = 0, pdfPages = 0;
    tracks.forEach((t) => {
      let has = false;
      Cat.byTrack(t.id).forEach((w) => {
        (w.formats || []).forEach((f) => {
          if (f.type === "pdf" && f.status === "ready") {
            has = true;
            if (f.pages) pdfPages += f.pages;
          }
        });
      });
      if (has) pdfTracks += 1;
    });
    const books = (Cat.data.books || []);
    const fTrack = filters.track || [];
    return html`<div class="view">
      <h1 class="sr-only">Library</h1>
      <section class="hero" aria-label="DevOps By Nabawy">
        <p class="eyebrow">${copy.heroEyebrow}</p>
        <h2 class="hero-display">${copy.heroTitleLead}
          <span class="accent">${copy.heroTitleAccent}</span>
          ${copy.heroTitleTail}</h2>
        <p class="lede">${copy.heroBody}</p>
        <button class="search-hero" onClick=${() => ask("")}
          aria-label="Search">
          <span>${copy.searchCta}</span>
          <span class="kbd">Ctrl K</span>
        </button>
        <p class="hint">${copy.searchTip}</p>
        <p class="popular"><span>${copy.popularLabel}</span>
          ${copy.popular.map((p) => html`<button class="chip"
            onClick=${() => ask(p)}>${p}</button>`)}</p>
        <p class="hero-cta">
          <a class="btn btn-primary" href="#/roadmap">${copy.heroCtaRoadmap}</a>
          <a class="btn" href="#track-cards">${copy.heroCtaTracks}</a>
        </p>
      </section>
      <p class="hint">${copy.hint}</p>
      ${cont ? (() => {
        const ct = (Cat.data.tracks || []).find((t) => t.id === cont.track) || {};
        const cc = Cat.counts(cont.track, store.state.progress);
        const pct = cc.total ? Math.round((cc.done / cc.total) * 100) : 0;
        return html`<section class="continue hero" aria-label="Continue">
          <p class="eyebrow">${copy.continueEyebrow}</p>
          <p><span class="pill">${copy.offlineReady}</span></p>
          <h2 dir="auto">${cont.title}</h2>
          <p class="muted">${ct.title || cont.track} · ${cont.kind} · ${pct}% of track read</p>
          <p class="hero-cta">
            <a class="btn btn-primary" href="#/read/${cont.id}">${copy.resume}</a>
            <a class="btn" href="#/me">${copy.recentLink}</a>
          </p>
        </section>`;
      })() : null}
      <section class="stats" aria-label="Library stats">
        <div><strong>${pdfTracks} PDF tracks</strong>
          <span class="muted">${pdfPages} pages of structured curation</span></div>
        <div><strong>${(Cat.data.externals || []).length} ${copy.onlineLabs}</strong>
          <span class="muted">${copy.onlineLabsBody}</span>
          <a href="#learn-online">${copy.browseCourses}</a></div>
        <div><strong>${copy.statsOffline}</strong>
          <span class="muted">${copy.statsOfflineBody}</span></div>
      </section>
      <section class="trackcards" id="track-cards" aria-label=${copy.tracksTitle}>
        <p class="eyebrow">${copy.tracksEyebrow}</p>
        <h2>${copy.allTracksTitle}</h2>
        <p class="muted">${copy.allTracksBody}</p>
        <p class="muted">${(() => {
          let d = 0, n = 0;
          tracks.forEach((t) => {
            const cc = Cat.counts(t.id, store.state.progress);
            if (!cc.total) return;
            n += 1;
            if (cc.done >= cc.total) d += 1;
          });
          return `${d} of ${n} tracks done`;
        })()}</p>
        <ul class="cards">
        ${tracks.map((t) => {
          const cc = Cat.counts(t.id, store.state.progress);
          const pct = cc.total ? Math.round((cc.done / cc.total) * 100) : 0;
          const st = (Cat.data.stages || []).find((x) => x.id === t.stage);
          const status = cc.total && cc.done >= cc.total ? copy.statusDone
            : cc.done > 0 ? copy.statusProgress : copy.statusTodo;
          let npdf = 0, npages = 0;
          Cat.byTrack(t.id).forEach((w) => {
            (w.formats || []).forEach((f) => {
              if (f.type === "pdf" && f.status === "ready") {
                npdf += 1;
                if (f.pages) npages += f.pages;
              }
            });
          });
          return html`<li class="card" data-track=${t.id}>
            <a href="#/track/${t.id}">
              <span class="eyebrow">${st ? st.title : ""}</span>
              <strong>${t.title}</strong>
              <span class="muted">${npdf} PDFs · ${npages} pages</span>
              <span class="muted">${t.summary || ""}</span>
              <span class="cardfoot"><span class="pill">${status}</span>
                <span class="muted">${copy.continueOf(cc.done, cc.total)}</span></span>
            </a>
          </li>`;
        })}
        </ul>
      </section>
      ${books.length && !fTrack.length ? html`<section aria-label="Books">
        <h2>Books</h2><ul class="rows">
        ${books.map((b) => html`<${Row} w=${{ id: b.id, track: b.track,
          kind: "book", title: b.title, minutes: 0,
          formats: b.formats }} store=${store} />`)}</ul></section>` : null}
      <div class="sortbar" role="group" aria-label="Sort and group">
        <label>Sort <select value=${sort} onChange=${(e) =>
          setList("sort", e.target.value)}>
          <option value="order">Learning order</option>
          <option value="title">Title</option>
          <option value="recent">Recently added</option>
          <option value="shortest">Shortest</option>
        </select></label>
        <label>Group <select value=${group} onChange=${(e) =>
          setList("group", e.target.value)}>
          <option value="track">Track</option>
          <option value="type">Type</option>
          <option value="none">None</option>
        </select></label>
      </div>
      ${group === "none" ? html`<section aria-label="All works"><ul class="rows">
        ${sortItems(tracks.flatMap((t) =>
          (!fTrack.length || fTrack.includes(t.id))
            ? [...(Cat.data.externals || []).filter((e) => e.track === t.id)
              .map((e) => ({ id: e.id, track: t.id, kind: "external",
                title: e.title, summary: e.summary, minutes: 0,
                formats: [], external: e })),
              ...Cat.byTrack(t.id)] : []), sort)
          .filter((w) => matchWork(w, filters, store))
          .map((w) => html`<${Row} w=${w} store=${store} />`)}
        </ul></section>`
      : group === "type" ? ["lesson", "lab", "script", "book",
          "reference", "evidence", "external"].map((k) => {
          const items = sortItems(tracks.flatMap((t) =>
            (!fTrack.length || fTrack.includes(t.id))
              ? [...(Cat.data.externals || []).filter((e) => e.track === t.id)
                .map((e) => ({ id: e.id, track: t.id, kind: "external",
                  title: e.title, summary: e.summary, minutes: 0,
                  formats: [], external: e })),
                ...Cat.byTrack(t.id)] : [])
            .filter((w) => w.kind === k)
            .filter((w) => matchWork(w, filters, store)), sort);
          if (!items.length) return null;
          return html`<section aria-label=${k}><h2>${k}</h2>
            <ul class="rows">${items.map((w) =>
              html`<${Row} w=${w} store=${store} />`)}</ul></section>`;
        })
      : tracks.filter((t) => !fTrack.length || fTrack.includes(t.id))
        .map((t) => {
          let items = Cat.byTrack(t.id).filter((w) =>
            matchWork(w, filters, store));
          if (store.state.settings.hideDone) {
            items = items.filter((w) =>
              !Cat.isDone(w.id, store.state.progress));
          }
          const exts = (Cat.data.externals || [])
            .filter((e) => e.track === t.id)
            .map((e) => ({ id: e.id, track: t.id, kind: "external",
              title: e.title, summary: e.summary, minutes: 0,
              formats: [], external: e }))
            .filter((w) => matchWork(
              Object.assign({ formats: [] }, w), filters, store));
          const all = sortItems([...exts, ...items], sort);
          if (!all.length) return null;
          return html`<section aria-label=${t.title} data-track=${t.id}>
            <h2>${t.title}</h2>
            <ul class="rows">${all.map((w) =>
              html`<${Row} w=${w} store=${store} />`)}</ul>
          </section>`;
        })}
      ${Cat.data.site && Cat.data.site.maintainerMode ?
        (() => {
          const un = Cat.byTrack("_unsorted")
            .filter((w) => matchWork(w, filters, store));
          if (!un.length) return null;
          const ids = (Cat.data.tracks || []).map((t) => t.id).join(", ");
          return html`<section aria-label="Needs a track" data-track="_unsorted">
            <h2>Needs a track (maintainer)</h2>
            <p class="muted">Rename with a track prefix (${ids}), then refresh.</p>
            <ul class="rows">${un.map((w) =>
              html`<${Row} w=${w} store=${store} />`)}</ul>
          </section>`;
        })() : null}
      ${(myFiles || []).length ? html`<section aria-label="My files">
        <h2>My files</h2><ul class="rows">
        ${myFiles.map((f) => html`<li class="row"><a href="#/read/${f.id}?fmt=local">
          <span class="row-t"><strong>${f.name}</strong>
          <span class="muted">${(f.bytes / 1024).toFixed(0)} KB</span></span>
          <span class="kind">PDF</span></a></li>`)}</ul></section>` : null}
      <section class="steps" aria-label=${copy.howTitle} id="how-it-works">
        <p class="muted">${copy.archiveTeaser}
          ${(() => {
            let n = 0;
            Cat.works().forEach((w) => {
              if (["lab", "script", "evidence"].includes(w.kind)) n += 1;
            });
            return html`<a href="#/archive">${copy.archiveTeaserLink} (${n})</a>`;
          })()}</p>
        <h2>${copy.howTitle}</h2>
        <p class="muted">${copy.howBody}</p>
        <ol>${copy.howSteps.map(([h, b], i) => html`<li>
          <strong>${i + 1}. ${h}</strong>
          <span class="muted">${b}</span></li>`)}</ol>
      </section>
      ${(() => {
        const rec = Cat.recommendedTrack(store.state.progress);
        if (!rec) return null;
        return html`<section class="hero" aria-label=${copy.recEyebrow}>
          <p class="eyebrow">${copy.recEyebrow} · ${copy.ntiPathway}</p>
          <h2>Next up: ${rec.title}</h2>
          <p class="muted">${rec.summary || ""}</p>
          <p class="hero-cta">
            <a class="btn btn-primary" href="#/track/${rec.id}">${copy.openTrack}</a>
            <a class="btn" href="#/roadmap">${copy.seeRoadmap}</a>
          </p>
        </section>`;
      })()}
      ${(() => {
        const exts = Cat.data.externals || [];
        if (!exts.length) return null;
        return html`<section id="learn-online" aria-label=${copy.learnOnline}>
          <p class="eyebrow">${copy.onlineLabs}</p>
          <h2>${copy.learnOnline}</h2>
          <p class="muted">${copy.learnOnlineBody}</p>
          <ul class="cards">${exts.map((e) => {
            const t = tracks.find((x) => x.id === e.track) || {};
            return html`<li class="card" data-track=${e.track}>
              <a href="#/course/${e.id}">
                <span class="eyebrow">${t.title || e.track}</span>
                <strong dir="auto">${e.title}</strong>
                <span class="muted">${e.host} · ${!navigator.onLine ? copy.needsInternet : copy.requiresInternet}</span>
                <span class="cardfoot"><span class="pill">Online</span></span>
              </a>
            </li>`;
          })}</ul>
        </section>`;
      })()}
      <section class="hero" aria-label=${copy.egyptEyebrow}>
        <p class="eyebrow">${copy.egyptEyebrow}</p>
        <h2>${copy.egyptTitle}</h2>
        <p class="muted">${copy.egyptBody}</p>
        <p class="hero-cta">
          <a class="btn btn-primary" href="#/roadmap">${copy.seeRoadmap}</a>
          <a class="btn" href="#how-it-works">${copy.howTitle}</a>
        </p>
      </section>
      <footer class="sitefoot">
        <strong>DevOps By Nabawy</strong>
        <span class="muted">${copy.footerTag} ${copy.libraryInfo}</span>
        <div class="footgrid">
          <div><h2>${copy.footLearn}</h2>
            <p><a href="#/">${copy.tracksLink}</a></p>
            <p><a href="#/roadmap">${copy.openRoadmap}</a></p>
            <p><a href="#/archive">${copy.archiveTitle}</a></p>
          </div>
          <div><h2>${copy.footCourses}</h2>
            ${(Cat.data.externals || []).map((e) =>
              html`<p><a href="#/course/${e.id}">${e.title}</a></p>`)}
          </div>
          <div><h2>${copy.footCommunity}</h2>
            <p>${copy.aboutOpen}</p>
            <p>${copy.aboutVerified}</p>
            <p>${copy.aboutStatic}</p>
          </div>
        </div>
        <p><a href="#/about">${copy.aboutTitle}</a></p>
      </footer>
    </div>`;
  }
  return { Library };
});

/* views/roadmap.js */
﻿// roadmap.js — pipeline graph, connectors, drawer, the run.
NTI.define("views/roadmap", function () {
  const { html, Component } = window.htmPreact;
  class Roadmap extends Component {
    constructor(p) {
      super(p);
      this.state = { open: p.open || null, ran: false };
    }
    componentDidMount() {
      let ran = false;
      try { ran = sessionStorage.getItem("nti.roadmap.ran") === "1"; } catch {}
      if (ran) { this.setState({ ran: true }); return; }
      const A = NTI.require("core/a11y");
      if (!A.reducedMotion(NTI.require("core/store"))) {
        setTimeout(() => {
          this.setState({ ran: true });
          try { sessionStorage.setItem("nti.roadmap.ran", "1"); } catch {}
        }, 60);
      } else {
        this.setState({ ran: true });
        try { sessionStorage.setItem("nti.roadmap.ran", "1"); } catch {}
      }
    }
    render({ store }, s) {
      const Cat = NTI.require("core/catalog");
      const copy = NTI.require("core/copy");
      const stages = (Cat.data.stages || []).slice()
        .sort((a, b) => a.order - b.order);
      const tmap = {};
      (Cat.data.tracks || []).forEach((t) => { tmap[t.id] = t; });
      const counts = {};
      Object.keys(tmap).forEach((id) => {
        counts[id] = Cat.counts(id, store.state.progress);
      });
      const rec = Cat.recommendedTrack(store.state.progress);
      const R = NTI.require("core/router");
      const ids = Object.keys(tmap);
      const withWorks = ids.filter((id) =>
        (counts[id] || { total: 0 }).total > 0);
      const doneTracks = withWorks.filter((id) =>
        counts[id].done >= counts[id].total).length;
      const remaining = withWorks.length - doneTracks;
      return html`<div class="view roadmap ${s.ran ? "ran" : "run"}">
        <p class="eyebrow">${copy.journeyEyebrow}</p>
        <h1 class="hero-display">${copy.journeyTitle}</h1>
        <p class="lede">${copy.journeyBody}</p>
        <p class="hint">${copy.savedLocal}</p>
        <section class="stats" aria-label=${copy.overallProgress}>
          <div><strong>${doneTracks} of ${withWorks.length}</strong>
            <span class="muted">${copy.overallProgress.toLowerCase()} · ${copy.tracksRemaining(remaining)}</span></div>
          ${rec ? html`<div><span class="eyebrow">${copy.nextUp}</span>
            <strong>${rec.title}</strong>
            <span class="muted">${rec.summary || ""}</span>
            <p><a class="btn btn-primary" href="#/track/${rec.id}">${copy.openTrack}</a></p>
          </div>` : null}
        </section>
        <section class="mapkey" aria-label=${copy.mapKey}>
          <h2>${copy.mapKey}</h2>
          <p><span class="pill">${copy.statusDone}</span>
            <span class="pill">${copy.statusProgress}</span>
            <span class="pill">${copy.statusTodo}</span></p>
        </section>
        <ol class="stages">
        ${stages.map((st) => html`<li class="stage">
          <h2>${st.title}</h2>
          <ol class="jobs">${(st.tracks || []).map((tid) => {
            const t = tmap[tid];
            if (!t) return null;
            const c = counts[tid] || { done: 0, total: 0 };
            const here = rec && rec.id === tid;
            const st = c.total && c.done >= c.total ? copy.statusDone
              : c.done > 0 ? copy.statusProgress : copy.statusTodo;
            return html`<li><button class="job ${here ? "here" : ""}"
              data-track=${tid}
              onClick=${() => this.setState({ open: tid })}
              onKeyDown=${(e) => {
                if (e.key === "Enter") this.setState({ open: tid });
              }}>
              <span class="dot"></span><strong>${t.title}</strong>
              <span class="n">${c.done}/${c.total}</span>
              <span class="pill">${st}</span>
              ${here ? html`<span class="here-tag">Continue here</span>` : null}
            </button></li>`;
          })}</ol></li>`)}
        </ol>
        ${s.open ? html`<${Drawer} trackId=${s.open} store=${store}
          onClose=${() => {
            const tid = s.open;
            this.setState({ open: null });
            requestAnimationFrame(() => {
              const b = document.querySelector(`.job[data-track="${tid}"]`);
              if (b) b.focus();
            });
          }} />` : null}
      </div>`;
    }
  }
  function Drawer({ trackId, store, onClose }) {
    const Cat = NTI.require("core/catalog");
    const t = (Cat.data.tracks || []).find((x) => x.id === trackId);
    const R = NTI.require("core/router");
    const A = NTI.require("core/a11y");
    const ref = (el) => {
      if (el) {
        if (ref._untrap) ref._untrap();
        ref._untrap = A.trapFocus(el);
        const first = el.querySelector("button,a");
        if (first) first.focus();
      }
    };
    window.htmPreact.useEffect(() => {
      const onKey = (e) => {
        if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      };
      document.addEventListener("keydown", onKey, true);
      return () => document.removeEventListener("keydown", onKey, true);
    }, []);
    const items = Cat.byTrack(trackId);
    const exts = ((Cat.data.externals || []).filter((e) =>
      e.track === trackId));
    const next = Cat.nextWork(trackId, store.state.progress);
    return html`<div class="modal-back" onClick=${onClose}>
      <div class="drawer modal" role="dialog" aria-label=${t ? t.title : trackId}
        ref=${ref} onClick=${(e) => e.stopPropagation()}>
        <h2>${t ? t.title : trackId}</h2>
        ${next ? html`<button class="btn btn-primary" onClick=${() => {
          onClose(); R.go(`#/read/${next.id}`);
        }}>${store.state.progress[next.id] ? "Continue" : "Start"}: ${next.title}</button>` : null}
        <ol>
        ${exts.map((e) => html`<li>
          <a href="#/course/${e.id}" onClick=${() => onClose()}>${e.title} (Online course)</a>
          <a href="${e.url}" target="_blank" rel="noopener noreferrer" aria-label="Open ${e.title} in new tab">↗</a>
        </li>`)}
        ${items.map((w) => html`<li>
          <a href="#/read/${w.id}" onClick=${() => onClose()}>${w.title}</a>
          <span class="muted">${Cat.isDone(w.id, store.state.progress) ? "✓" : ""}</span>
        </li>`)}</ol>
        <button class="btn" onClick=${onClose}>Close</button>
      </div></div>`;
  }
  return { Roadmap };
});

/* views/track.js */
﻿// track.js — track page: Continue, sections, screenshots gallery.
NTI.define("views/track", function () {
  const { html } = window.htmPreact;
  const { ProgressRing } = NTI.require("ui/status");
  function Track({ id, store }) {
    const Cat = NTI.require("core/catalog");
    const copy = NTI.require("core/copy");
    const t = (Cat.data.tracks || []).find((x) => x.id === id);
    if (!t) {
      NTI.require("core/router").go("#/404");
      return null;
    }
    const items = Cat.byTrack(id);
    const c = Cat.counts(id, store.state.progress);
    const next = Cat.nextWork(id, store.state.progress);
    const R = NTI.require("core/router");
    const shots = ((Cat.data.assets || []).filter((a) =>
      a.track === id && a.kind === "evidence"));
    const exts = ((Cat.data.externals || []).filter((e) => e.track === id));
    const CMDS = id === "terraform" ? [
      ["terraform init -upgrade", "Downloads providers, configures backend"],
      ["terraform plan -out=tfplan", "Preview exactly what will run"],
      ["terraform apply tfplan", "Run the saved plan"],
      ["terraform destroy", "Safe teardown with confirm"],
      ["terraform state list", "List addresses in state"],
      ["terraform fmt -recursive -check", "Pre-commit style gate"],
      ["terraform plan -refresh-only", "Drift audit without edits"],
    ] : id === "docker" ? [
      ["docker build -t app:local .", "Build image from Dockerfile"],
      ["docker run --rm -p 8080:80 app:local", "Run container, remove on stop"],
      ["docker ps -a", "List containers"],
      ["docker compose up --build", "Build and start the stack"],
    ] : id === "kubernetes" ? [
      ["kubectl get pods -A", "List pods everywhere"],
      ["kubectl describe pod <name>", "Inspect one pod"],
      ["kubectl apply -f deploy.yaml", "Apply manifests"],
      ["helm list -A", "List releases"],
    ] : [];
    const copyCmd = (cmd) => {
      const done = () => NTI.require("ui/primitives")
        .toast(NTI.require("core/copy").copied);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cmd).then(done, done);
      } else { done(); }
    };
    const secs = [];
    for (const w of items) {
      let s = secs.find((x) => x.name === (w.section || "More"));
      if (!s) { s = { name: w.section || "More", items: [] }; secs.push(s); }
      s.items.push(w);
    }
    const stage = (Cat.data.stages || []).find((x) => x.id === t.stage);
    const ordered = (Cat.data.tracks || []).slice()
      .sort((a, b) => a.order - b.order);
    const upNext = ordered[ordered.findIndex((x) => x.id === id) + 1] || null;
    const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
    let bundleBytes = 0;
    items.forEach((w) => {
      (w.formats || []).forEach((f) => {
        if (f.status === "ready" && f.bytes) bundleBytes += f.bytes;
      });
    });
    const mb = (b) => b > 0 ? (b / 1048576).toFixed(1) + " MB" : "";
    return html`<div class="view" data-track=${id}>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="#/">${copy.crumbTracks}</a><span> / </span><span>${t.title}</span>
      </nav>
      <section class="hero hero-track" aria-label=${t.title}>
        <p class="eyebrow">${exts.length ? copy.interactiveTrack : (stage ? stage.title : "")}</p>
        <h1>${t.title}</h1>
        <p class="muted">${t.summary || ""}</p>
        <p class="hero-cta">
          ${next ? html`<button class="btn btn-primary" onClick=${() =>
            R.go(`#/read/${next.id}`)}>${copy.continueBtn}: ${next.title}</button>`
          : items.length ? html`<span class="muted">All done.</span>`
          : null}
          <a class="btn" href="#/roadmap">${copy.openRoadmap}</a>
        </p>
        <${ProgressRing} done=${c.done} total=${c.total} />
        <p><strong>${pct}%</strong>
          <span class="muted">${c.done} of ${c.total} read${bundleBytes ? ` · ${copy.bundleSize(mb(bundleBytes).replace(" MB", ""))}` : ""} · ${copy.worksOffline}</span></p>
      </section>
      ${exts.length ? html`<section aria-label=${copy.onlineCourse}>
        <h2>${copy.onlineCourse}</h2>
        <ul class="rows">${exts.map((e) => html`<li class="row">
          <span class="row-t"><strong>${e.title}</strong>
          <span class="muted">${e.host} · ${!navigator.onLine ? copy.needsInternet : copy.requiresInternet}</span></span>
          <a class="btn btn-primary" href="#/course/${e.id}">${copy.courseView}</a>
          <a class="btn" href=${e.url} target="_blank" rel="noopener noreferrer">${copy.openNewTab}</a></li>`)}</ul>
      </section>` : null}
      ${!items.length && !exts.length ? html`<section>
        <h2>${copy.nothingHere}</h2><p>${copy.nothingHereBody}</p>
        <a class="btn" href="#/">${copy.backToLibrary}</a>
      </section>` : null}
      ${CMDS.length ? html`<section aria-label=${copy.cmdDeckTitle}>
        <h2>${copy.cmdDeckTitle}</h2>
        <p class="muted">${copy.cmdDeckBody}</p>
        <ul class="rows">${CMDS.map(([cmd, what]) => html`<li class="row">
          <span class="row-t"><strong><code>${cmd}</code></strong>
          <span class="muted">${what}</span></span>
          <button class="btn" onClick=${() => copyCmd(cmd)}>${copy.copyCmd}</button>
        </li>`)}</ul>
      </section>` : null}
      ${id === "cicd" ? html`<section aria-label=${copy.studyDeckTitle}>
        <h2>${copy.studyDeckTitle}</h2>
        <p class="muted">${copy.studyDeckBody}</p>
      </section>` : null}
      ${secs.map((s) => html`<section><h2>${s.name}</h2><ul class="rows">
        ${s.items.map((w) => {
          const done = Cat.isDone(w.id, store.state.progress);
          const reading = !!store.state.progress[w.id];
          const pdf = (w.formats || []).find((f) => f.type === "pdf" &&
            f.status === "ready");
          const bits = [];
          if (w.minutes) bits.push(`${w.minutes} min`);
          if (pdf && pdf.pages) bits.push(`${pdf.pages} pages`);
          if (pdf && pdf.bytes) bits.push(mb(pdf.bytes));
          const st = done ? copy.statusDone
            : reading ? copy.statusProgress : copy.statusTodo;
          const act = done ? copy.readAgain
            : reading ? copy.continueReading : copy.startReading;
          return html`<li class="row rownum"><a href="#/read/${w.id}">
            <span class="num">${w.order}</span>
            <span class="row-t"><strong dir="auto">${w.title}</strong>
            <span class="muted">${bits.join(" · ")} · ${w.kind}</span></span>
            <span class="pill">${st}</span>
            <span class="kind">${act}</span></a></li>`;
        })}</ul></section>`)}
      ${!items.length && exts.length ? html`<section>
        <h2>${copy.suggestedOrder}</h2>
        <p class="muted">${copy.studyDeckBody}</p>
      </section>` : null}
      ${shots.length ? html`<section aria-label="Screenshots"><h2>Screenshots</h2>
        <div class="shots">${shots.map((a) => html`<a href="${a.path}" target="_blank" rel="noopener noreferrer">
          <img src="${a.path}" alt="${a.title}" loading="lazy" />
          <span>${a.title}</span></a>`)}</div></section>` : null}
      ${upNext ? html`<section aria-label=${copy.upNext}>
        <p class="eyebrow">${copy.upNext}</p>
        <h2>${upNext.title}</h2>
        <p><a class="btn" href="#/track/${upNext.id}">${copy.openTrack}</a></p>
      </section>` : null}
    </div>`;
  }
  return { Track };
});

/* views/reader.js */
﻿// reader.js — lesson/book/script reading: outline, copy, prev/next, done.
NTI.define("views/reader", function () {
  const { html, Component } = window.htmPreact;
  const { Skeleton, EmptyState } = NTI.require("ui/primitives");
  class Reader extends Component {
    constructor(p) {
      super(p);
      this.state = { doc: null, failed: false, focus: false, steps: {} };
      this.onKey = (e) => {
        if (!e.altKey || e.key.toLowerCase() !== "j") return;
        const { id, query } = this.props;
        if (!query || query.from !== "archive" || !this.state.doc) return;
        const Cat = NTI.require("core/catalog");
        const w = Cat.get(id);
        if (!w || w.kind !== "lab") return;
        const all = (this.state.doc.toc || []).filter((h) => h.level === 2);
        if (!all.length) return;
        const done = this.state.steps[id] || [];
        const next = all.find((h) => !done.includes(h.id)) || all[0];
        e.preventDefault();
        const el = next && document.getElementById(next.id);
        if (el) {
          el.scrollIntoView({ block: "start" });
          el.setAttribute("tabindex", "-1");
          el.focus({ preventScroll: true });
        }
        NTI.require("core/a11y").announce(next.text);
      };
    }
    componentDidMount() {
      this.load(this.props);
      document.addEventListener("keydown", this.onKey);
    }
    componentWillUnmount() {
      document.removeEventListener("keydown", this.onKey);
    }
    componentDidUpdate(prev) {
      if (prev.id !== this.props.id ||
          JSON.stringify(prev.query) !== JSON.stringify(this.props.query)) {
        this.load(this.props);
      }
    }
    async load({ id, query }) {
      this.setState({ doc: null, failed: false });
      const CC = NTI.require("core/catalog");
      const w = CC.get(id);
      const fmt = (query && query.fmt) ||
        ((w && (w.formats || []).some((f) => f.type === "md" &&
          f.status === "ready")) ? "md"
          : (w && (w.formats || []).some((f) => f.type === "pdf" &&
            f.status === "ready")) ? "pdf" : "md");
      // PDF/local/script-external works never need the docs bundle.
      if (!w || fmt === "pdf" || fmt === "local" || w.kind === "external") {
        return;
      }
      const t0 = Date.now();
      const show = () => {
        const d = window.NTI.docs && window.NTI.docs[id];
        if (d) this.setState({ doc: d });
        else this.setState({ failed: true });
      };
      if (window.NTI.docs && window.NTI.docs[id]) { show(); return; }
      const L = NTI.require("core/loader");
      const Cat = NTI.require("core/catalog");
      const v = (Cat.data && Cat.data.contentVersion) || "";
      try {
        await L.load(`content/docs/${id}.js?v=${v}`, 10000);
        show();
      } catch { this.setState({ failed: true }); }
      void t0;
    }
    render({ id, store, query }, s) {
      const Cat = NTI.require("core/catalog");
      const copy = NTI.require("core/copy");
      const R = NTI.require("core/router");
      const w = Cat.get(id);
      if (!w) return html`<${EmptyState} title="Not found" body="" />`;
      if (w.kind === "external") {
        return html`<div class="view"><h1>${w.title}</h1><p>${w.summary || ""}</p>
          <a class="btn btn-primary" href="${w.external.url}" target="_blank" rel="noopener noreferrer">${copy.openNewTab}</a></div>`;
      }
      const fmt = (query && query.fmt) ||
        ((w.formats || []).some((f) => f.type === "md" && f.status === "ready")
          ? "md" : (w.formats || []).some((f) => f.type === "pdf" &&
            f.status === "ready") ? "pdf" : "md");
      if (fmt === "pdf" || fmt === "local") {
        const P = NTI.require("views/pdf");
        return html`<${P.PdfReader} id=${id} store=${store} query=${query} />`;
      }
      const fromArchive = query && query.from === "archive";
      const track = (Cat.data.tracks || []).find((t) => t.id === w.track) || {};
      const rhref = (nid, extra) => {
        const q = new URLSearchParams();
        if (fromArchive) q.set("from", "archive");
        if (extra) Object.keys(extra).forEach((k) => {
          if (extra[k] !== undefined && extra[k] !== null &&
            extra[k] !== "") q.set(k, extra[k]);
        });
        const s = q.toString();
        return `#/read/${nid}${s ? "?" + s : ""}`;
      };
      const mb = (b) => b > 0 ? (b / 1048576).toFixed(1) : "";
      let bundleBytes = 0;
      (w.formats || []).forEach((f) => {
        if (f.status === "ready" && f.bytes) bundleBytes += f.bytes;
      });
      const pdf = (w.formats || []).find((f) => f.type === "pdf" &&
        f.status === "ready");
      const items = Cat.byTrack(w.track);
      const i = items.findIndex((x) => x.id === id);
      const prev = items[i - 1], next = items[i + 1];
      const done = Cat.isDone(id, store.state.progress);
      if (s.failed) {
        return html`<div class="view"><h1>${copy.lessonFailed}</h1>
          <p>${copy.lessonFailedBody}</p>
          <button class="btn" onClick=${() => this.load({ id })}>${copy.tryAgain}</button>
          ${fromArchive
            ? html`<a class="btn" href="#/archive">${copy.backToArchive}</a>`
            : html`<a class="btn" href="#/track/${w.track}">${copy.backTo(track.title || w.track)}</a>`}</div>`;
      }
      if (!s.doc) return html`<div class="view"><${Skeleton} /></div>`;
      const anchor = query && query.a;
      const labSteps = fromArchive && w.kind === "lab" && s.doc
        ? (s.doc.toc || []).filter((h) => h.level === 2) : [];
      const checkedSteps = (s.steps && s.steps[id]) || [];
      const toggleStep = (hid) => {
        const has = checkedSteps.includes(hid);
        const next = has ? checkedSteps.filter((x) => x !== hid)
          : [...checkedSteps, hid];
        this.setState({ steps: Object.assign({}, s.steps, { [id]: next }) });
      };
      return html`<div class="view reader ${s.focus ? "focus" : ""}" data-track=${w.track}>
        ${fromArchive ? html`<nav class="crumbs" aria-label="Breadcrumb">
          <a href="#/archive">${copy.archiveCrumb}</a><span> / </span>
          <a href="#/track/${w.track}">${track.title || w.track}</a>
          <span> / </span><span>${w.title}</span>
        </nav>
        <p><a class="btn" href="#/archive">${copy.backToArchive}</a></p>` : null}
        <h1 dir="auto">${w.title}</h1>
        ${fromArchive ? html`<p>
          <span class="pill">${copy.cachedLocal}</span>
          ${bundleBytes ? html`<span class="muted">${copy.bundleSizeShort(mb(bundleBytes))}</span>` : null}
          <span class="muted">${w.kind}${w.minutes ? ` · ${w.minutes} min` : ""}</span>
        </p>` : null}
        ${w.kind === "book" ? html`<p class="muted">${copy.originalStyle}
          ${(w.formats || []).some((f) => f.type === "html" && f.status === "ready")
            ? html` <a href="content/html/${id}/index.html" target="_blank" rel="noopener noreferrer">${copy.openNewTab}</a>` : null}</p>` : null}
        <div class="readbar">
          <span class="muted">${w.kind} · ${w.minutes ? w.minutes + " min" : ""}</span>
          <button class="btn btn-ghost" onClick=${() =>
            this.setState({ focus: !s.focus })} aria-pressed=${s.focus}>Focus (f)</button>
          <button class="btn btn-ghost" onClick=${() =>
            store.toggleBookmark(id, anchor || null)}>
            ${store.state.bookmarks.some((b) => b.workId === id) ? "★" : "☆"}</button>
          <details class="readsettings">
            <summary class="btn btn-ghost">Aa</summary>
            <div class="readsettings-pop">
              <div role="group" aria-label="Text size">
                <button class="btn btn-ghost" aria-label="Smaller text" onClick=${() => {
                  const v = Math.max(0, store.state.settings.readingSize - 1);
                  store.setSettings({ readingSize: v });
                  NTI.require("core/theme").apply(store.state.settings);
                }}>A-</button>
                <button class="btn btn-ghost" aria-label="Larger text" onClick=${() => {
                  const v = Math.min(2, store.state.settings.readingSize + 1);
                  store.setSettings({ readingSize: v });
                  NTI.require("core/theme").apply(store.state.settings);
                }}>A+</button>
              </div>
              <label>Theme <select value=${store.state.settings.theme} onChange=${(e) => {
                store.setSettings({ theme: e.target.value });
                NTI.require("core/theme").apply(store.state.settings);
              }}>
                <option value="system">system</option>
                <option value="light">light</option>
                <option value="dark">dark</option>
              </select></label>
            </div>
          </details>
        </div>
        ${(s.doc.toc || []).length ? html`<details class="outline"><summary>Outline</summary><ol>
          ${(s.doc.toc || []).map((h) => html`<li><a href="${rhref(id, { a: h.id })}">${h.text}</a></li>`)}
        </ol></details>` : null}
        ${fromArchive && pdf && fmt !== "pdf" ? html`<section class="card" aria-label=${copy.attachedGuide}>
          <div class="pad">
            <strong>${copy.attachedGuide}</strong>
            <span class="muted">${w.title}${pdf.pages ? ` · ${pdf.pages} pages` : ""}${pdf.bytes ? ` · ${mb(pdf.bytes)} MB` : ""}</span>
            <p class="hero-cta">
              <a class="btn btn-primary" href="${rhref(id, { fmt: "pdf" })}">${copy.openViewer}</a>
              <a class="btn" href="${pdf.path}" download>${copy.download}</a>
            </p>
          </div>
        </section>` : null}
        ${labSteps.length ? html`<section aria-label=${copy.labSteps}>
          <h2>${copy.labSteps}</h2>
          <p class="muted">${copy.setupCheck(checkedSteps.length, labSteps.length)} · ${copy.nextStepHint}</p>
          <ol>${labSteps.map((h, i) => html`<li>
            <label><input type="checkbox" checked=${checkedSteps.includes(h.id)}
              onChange=${() => toggleStep(h.id)} />
              <a href="${rhref(id, { a: h.id })}">${i + 1}. ${h.text}</a>
            </label>
          </li>`)}</ol>
        </section>` : null}
        ${(w.formats || []).some((f) => (f.type === "html") && f.status === "ready" && f.path)
          ? html`<p><a href="${(w.formats || []).find((f) => f.type === "html").path}" target="_blank" rel="noopener noreferrer">View original</a></p>` : null}
        <article class="article" ref=${(el) => {
          if (el && anchor) {
            const t = el.querySelector("#" + CSS.escape(anchor));
            if (t) t.scrollIntoView();
          }
          if (el) {
            el.querySelectorAll("pre.code").forEach((pre) => {
              if (pre.querySelector(".copybtn")) return;
              const b = document.createElement("button");
              b.className = "copybtn";
              b.textContent = "Copy";
              b.onclick = () => {
                const c = pre.querySelector("code");
                if (c) navigator.clipboard.writeText(c.innerText)
                  .then(() => NTI.require("ui/primitives").toast(copy.copied));
                NTI.require("core/a11y").announce(copy.copied);
              };
              pre.appendChild(b);
            });
            el.querySelectorAll("img").forEach((img) => {
              img.loading = "lazy";
              img.onclick = () => window.open(img.src, "_blank", "noopener");
            });
          }
        }} dangerouslySetInnerHTML=${{ __html: s.doc.html }}></article>
        <div class="readnav">
          ${prev ? html`<a class="btn" href="${rhref(prev.id)}">← ${prev.title}</a>` : html`<span></span>`}
          ${next ? html`<button class="btn btn-primary" onClick=${() => {
            store.setDone(id, true);
            store.setLast({ workId: next.id, anchor: null, page: null,
              at: new Date().toISOString() });
            R.go(rhref(next.id));
          }}>${copy.markDoneContinue}</button>`
          : html`<button class="btn btn-primary" onClick=${() => {
            store.setDone(id, true);
            NTI.require("ui/primitives").toast(copy.markedDone,
              { label: copy.undo, fn: () => store.setDone(id, false) });
          }}>${done ? "Done ✓" : copy.markDone}</button>`}
        </div>
        ${prev || next ? html`<div class="readnav2">
          ${prev ? html`<a href="${rhref(prev.id)}">[${"prev"}]</a>` : null}
          ${next ? html`<a href="${rhref(next.id)}">[${"next"}]</a>` : null}
        </div>` : null}
      </div>`;
    }
  }
  return { Reader };
});

/* views/pdf.js */
﻿// pdf.js — PDF viewer + pending states + fallbacks + My files local open.
NTI.define("views/pdf", function () {
  const { html } = window.htmPreact;
  const { EmptyState, Skeleton } = NTI.require("ui/primitives");
  function PdfReader({ id, store, query }) {
    const Cat = NTI.require("core/catalog");
    const copy = NTI.require("core/copy");
    const R = NTI.require("core/router");
    const t = (Cat.data.tracks.find((x) => x.id ===
      ((Cat.get(id) || {}).track)) || {});
    // Local file?
    if ((query && query.fmt === "local") || String(id).startsWith("local-")) {
      return html`<${LocalPdf} id=${id} store=${store} />`;
    }
    const w = Cat.get(id);
    if (!w) return html`<${EmptyState} title="Not found" body="" />`;
    const pdfs = (w.formats || []).filter((f) => f.type === "pdf");
    const readyPdf = pdfs.find((f) => f.status === "ready");
    const page = query && query.page ? Number(query.page) : null;
    if (!readyPdf) {
      const pending = pdfs.find((f) => f.status === "pending");
      const hasOther = (w.formats || []).some((f) =>
        f.status === "ready");
      if (hasOther) {
        return html`<div class="view"><h1 dir="auto">${w.title}</h1>
          <p class="muted" title=${copy.pdfPendingTip}>PDF — ${copy.comingSoon}</p>
          <a class="btn" href="#/read/${id}">${copy.backTo(t.title || w.track)}</a></div>`;
      }
      return html`<div class="view"><h1>${copy.comingSoon}</h1>
        <p>${copy.comingSoonBody}</p>
        <a class="btn" href="#/track/${w.track}">${copy.backTo(t.title || w.track)}</a></div>`;
    }
    const v = (Cat.data && Cat.data.contentVersion) || "";
    const src = `${readyPdf.path}?v=${v}${page ? `#page=${page}` : ""}`;
    const chapters = (w.chapters || []).filter((c) => c.page);
    const blocked = (typeof navigator !== "undefined" &&
      navigator.pdfViewerEnabled === false);
    const coarse = window.matchMedia &&
      window.matchMedia("(pointer: coarse)").matches &&
      window.innerWidth < 500;
    if (blocked || coarse) {
      const chapters = (w.chapters || []).filter((c) => c.page);
      return html`<div class="view"><h1>${copy.pdfBlocked}</h1>
        <p>${copy.pdfBlockedBody}</p>
        <a class="btn btn-primary" href="${readyPdf.path}" target="_blank" rel="noopener noreferrer">${copy.openPdf}</a>
        <a class="btn" href="${readyPdf.path}" download>${copy.download}</a>
        ${chapters.length ? html`<details class="outline" open>
          <summary>Chapters</summary><ol>
          ${chapters.map((c) => html`<li>${c.title} <span class="muted">p.${c.page}</span></li>`)}
          </ol></details>` : null}</div>`;
    }
    return html`<div class="view pdfview">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="#/">${copy.crumbTracks}</a><span> / </span>
        <a href="#/track/${w.track}">${t.title || w.track}</a>
      </nav>
      <h1 dir="auto">${w.title}</h1>
      <p><span class="pill">${copy.offlineReady}${readyPdf.pages ? ` (${readyPdf.pages} pages)` : ""}</span>
        <span class="muted">${copy.worksOffline}${readyPdf.bytes ? ` · ${(readyPdf.bytes / 1048576).toFixed(1)} MB` : ""}</span></p>
      <div class="pdfbar">
        <a class="btn btn-ghost" href="${readyPdf.path}" target="_blank" rel="noopener noreferrer">${copy.openNewTab}</a>
        <button class="btn btn-ghost" onClick=${() =>
          store.setDone(id, !Cat.isDone(id, store.state.progress))}>
          ${Cat.isDone(id, store.state.progress) ? "Done ✓" : copy.markDone}</button>
      </div>
      <iframe class="pdfframe" src="${src}" title="${w.title}"></iframe>
      ${w.kind === "book" && chapters.length ? html`<details class="outline">
        <summary>Chapters</summary><ol>
        ${chapters.map((c) => html`<li><a href="#/read/${id}?fmt=pdf&page=${c.page}">${c.title}</a> <span class="muted">p.${c.page}</span></li>`)}
        </ol></details>` : null}
    </div>`;
  }
  function LocalPdf({ id }) {
    const copy = NTI.require("core/copy");
    const [url, setUrl] = window.htmPreact.useState(null);
    window.htmPreact.useEffect(() => {
      let alive = true, obj = null;
      NTI.require("core/storage").filesAll().then((all) => {
        const f = all.find((x) => x.id === id);
        if (f && f.blob && alive) {
          obj = URL.createObjectURL(f.blob);
          setUrl(obj);
        }
      });
      return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
    }, [id]);
    if (!url) return html`<div class="view"><p>${copy.loading}</p></div>`;
    return html`<div class="view pdfview"><h1>My file</h1>
      <iframe class="pdfframe" src="${url}" title="PDF"></iframe></div>`;
  }
  return { PdfReader };
});

/* views/me.js */
﻿// me.js — progress, bookmarks, My files, settings, backup.
NTI.define("views/me", function () {
  const { html, Component } = window.htmPreact;
  class Me extends Component {
    constructor(p) {
      super(p);
      this.state = { files: [], confirmId: null, storage: "" };
    }
    componentDidMount() {
      NTI.require("core/storage").filesAll()
        .then((files) => this.setState({ files }));
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then((est) => {
          if (est.usage) this.setState({ storage:
            `${(est.usage / 1048576).toFixed(1)} MB cached locally` });
        }).catch(() => {});
      }
    }
    render({ store }, s) {
      const copy = NTI.require("core/copy");
      const Cat = NTI.require("core/catalog");
      const S = NTI.require("core/storage");
      const tracks = (Cat.data.tracks || []).slice()
        .sort((a, b) => a.order - b.order);
      let totalWorks = 0, totalDone = 0, tDone = 0, tProg = 0;
      const rows = tracks.map((t) => {
        const cc = Cat.counts(t.id, store.state.progress);
        totalWorks += cc.total;
        totalDone += cc.done;
        let st = copy.statusUpcoming;
        if (cc.total && cc.done >= cc.total) { st = copy.statusDone; tDone += 1; }
        else if (cc.done > 0) { st = copy.statusProgress; tProg += 1; }
        return { t, cc, st };
      });
      const pct = totalWorks ? Math.round((totalDone / totalWorks) * 100) : 0;
      const last = store.state.last ? Cat.get(store.state.last.workId) : null;
      return html`<div class="view">
        <nav class="crumbs" aria-label="Breadcrumb">
          <a href="#/">Home</a><span> / </span><span>Me</span>
        </nav>
        <p class="eyebrow">${copy.localPrivate}${s.storage ? ` · ${s.storage}` : ""}</p>
        <h1 class="hero-display">Me</h1>
        <p class="lede">${copy.meBody}</p>
        ${!S.available ? html`<p class="warn">${copy.storageBlocked}</p>` : null}
        <section aria-label=${copy.curriculumOverview}>
          <h2>${copy.curriculumOverview}</h2>
          <section class="stats">
            <div><strong>${pct}%</strong>
              <span class="muted">${tDone} of ${tracks.length} tracks</span></div>
            <div><strong>${tDone}</strong>
              <span class="muted">${copy.statusDone}</span></div>
            <div><strong>${tProg}</strong>
              <span class="muted">${copy.statusProgress}</span></div>
          </section>
        </section>
        <section aria-label=${copy.tracksStatus}>
          <h2>${copy.tracksStatus}</h2>
          <ul class="rows">${rows.map(({ t, cc, st }) => html`<li class="row">
            <a href="#/track/${t.id}">
              <span class="row-t"><strong>${t.title}</strong>
              <span class="muted">${cc.done}/${cc.total}</span></span>
              <span class="pill">${st}</span></a></li>`)}</ul>
        </section>
        ${last && last.kind !== "external" ? html`<section aria-label=${copy.recentActivity}>
          <h2>${copy.recentActivity}</h2>
          <p><a class="btn btn-primary" href="#/read/${last.id}">${copy.resumeReading}: ${last.title}</a></p>
        </section>` : null}
        <section><h2>Bookmarks</h2>
          ${store.state.bookmarks.length ? html`<ul class="rows">
            ${store.state.bookmarks.map((b) => {
              const w = Cat.get(b.workId);
              return html`<li class="row"><a href="#/read/${b.workId}">${w ? w.title : b.workId}</a></li>`;
            })}</ul>` : html`<p>${copy.noBookmarks}</p>`}
        </section>
        <section id="my-files"><h2>My files</h2>
          ${s.files.length ? html`<ul class="rows">
            ${s.files.map((f) => html`<li class="row">
              <a href="#/read/${f.id}?fmt=local">${f.name}</a>
              ${s.confirmId === f.id
                ? html`<span><button class="btn btn-ghost" onClick=${() => this.setState({ confirmId: null })}>Keep</button>
                  <button class="btn" onClick=${async () => {
                    await S.filesDel(f.id);
                    this.setState({ files: (await S.filesAll()), confirmId: null });
                    NTI.require("ui/primitives").toast(copy.removed);
                  }}>Confirm remove</button></span>`
                : html`<button class="btn btn-ghost" onClick=${() =>
                  this.setState({ confirmId: f.id })}>Remove</button>`}</li>`)}</ul>`
            : html`<p>${copy.noFiles}</p>`}
          <button class="btn" onClick=${() => {
            const inp = document.createElement("input");
            inp.type = "file"; inp.accept = "application/pdf";
            inp.onchange = async () => {
              const rec = await NTI.require("core/dropzone")
                .addFile(inp.files[0], store, copy);
              if (rec) {
                this.setState({ files: (await S.filesAll()) });
                NTI.require("core/router").go(`#/read/${rec.id}?fmt=local`);
              }
            };
            inp.click();
          }}>${copy.openPdfFromComputer}</button>
        </section>
        <section><h2>Settings</h2>
          <label>Theme <select value=${store.state.settings.theme} onChange=${(e) => {
            store.setSettings({ theme: e.target.value });
            NTI.require("core/theme").apply(store.state.settings);
          }}>
            <option value="system">system</option><option value="light">light</option><option value="dark">dark</option>
          </select></label>
          <label>Density <select value=${store.state.settings.density} onChange=${(e) => {
            store.setSettings({ density: e.target.value });
            NTI.require("core/theme").apply(store.state.settings);
          }}>
            <option value="compact">compact</option><option value="comfortable">comfortable</option><option value="roomy">roomy</option>
          </select></label>
          <label><input type="checkbox" checked=${store.state.settings.hideDone} onChange=${(e) => {
            store.setSettings({ hideDone: e.target.checked });
          }} /> Hide done</label>
        </section>
        <section><h2>${copy.backupTitle}</h2>
          <p>${copy.backupBody}</p>
          <button class="btn" onClick=${() => {
            const blob = new Blob([store.export()],
              { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "nti-progress.json";
            a.click();
          }}>${copy.exportBtn}</button>
          <button class="btn" onClick=${() => {
            const inp = document.createElement("input");
            inp.type = "file"; inp.accept = "application/json";
            inp.onchange = () => {
              const r = new FileReader();
              r.onload = () => {
                try { store.import(r.result);
                  NTI.require("ui/primitives").toast(copy.imported);
                } catch {
                  NTI.require("ui/primitives").toast(copy.importFailed);
                }
                this.forceUpdate();
              };
              r.readAsText(inp.files[0]);
            };
            inp.click();
          }}>${copy.importBtn}</button>
        </section>
        <section><h2>Library info</h2><p>${copy.libraryInfo}</p>
        ${Cat.data.site && Cat.data.site.maintainerMode
          ? html`<p><a class="btn" href="#/add">Add PDF</a></p>` : null}</section>
        <section aria-label=${copy.aboutTitle}>
          <h2>${copy.aboutTitle}</h2>
          <ul>
            <li>${copy.aboutOpen}</li>
            <li>${copy.aboutVerified}</li>
            <li>${copy.aboutStatic}</li>
          </ul>
        </section>
      </div>`;
    }
  }
  return { Me };
});

/* views/archive.js */
// archive.js — P11 auxiliary repository: labs, scripts, documents.
NTI.define("views/archive", function () {
  const { html, Component } = window.htmPreact;
  const PAGE = 50;
  class Archive extends Component {
    constructor(p) {
      super(p);
      this.state = { q: "", track: "", kind: "all", shown: PAGE };
    }
    kinds() {
      const Cat = NTI.require("core/catalog");
      let labs = 0, scripts = 0, docs = 0;
      Cat.works().forEach((w) => {
        if (w.kind === "lab") labs += 1;
        else if (w.kind === "script") scripts += 1;
        else if (w.kind === "reference" || w.kind === "lesson") docs += 1;
      });
      return { all: labs + scripts + docs, labs, scripts, docs };
    }
    list() {
      const Cat = NTI.require("core/catalog");
      const s = this.state;
      const ql = s.q.trim().toLowerCase();
      let items = Cat.works().filter((w) =>
        ["lab", "script", "reference", "lesson"].includes(w.kind));
      if (s.kind === "labs") items = items.filter((w) => w.kind === "lab");
      else if (s.kind === "scripts") {
        items = items.filter((w) => w.kind === "script");
      } else if (s.kind === "docs") {
        items = items.filter((w) =>
          ["reference", "lesson"].includes(w.kind));
      }
      if (s.track) items = items.filter((w) => w.track === s.track);
      if (ql) {
        items = items.filter((w) =>
          (`${w.title} ${w.summary} ${(w.tags || []).join(" ")}`)
            .toLowerCase().includes(ql));
      }
      return items.slice().sort((a, b) => a.title.localeCompare(b.title));
    }
    render(_, s) {
      const Cat = NTI.require("core/catalog");
      const copy = NTI.require("core/copy");
      const tracks = (Cat.data.tracks || []).slice()
        .sort((a, b) => a.order - b.order);
      const tmap = {};
      tracks.forEach((t) => { tmap[t.id] = t; });
      const k = this.kinds();
      const all = this.list();
      const items = all.slice(0, s.shown);
      const tabs = [
        ["all", copy.tabAll, k.all],
        ["labs", copy.tabLabs, k.labs],
        ["scripts", copy.tabScripts, k.scripts],
        ["docs", copy.tabDocs, k.docs],
      ];
      const meta = (w) => {
        const bits = [];
        const pdf = (w.formats || []).find((f) => f.type === "pdf" &&
          f.status === "ready");
        if (w.minutes) bits.push(`${w.minutes} min`);
        if (pdf && pdf.pages) bits.push(`${pdf.pages} pages`);
        return bits.join(" · ");
      };
      return html`<div class="view">
        <nav class="crumbs" aria-label="Breadcrumb">
          <a href="#/">${copy.backToTracks}</a>
        </nav>
        <p class="eyebrow">${copy.archiveEyebrow}</p>
        <h1 class="hero-display">${copy.archiveTitle}</h1>
        <p class="lede">${copy.archiveBody}</p>
        <p><input class="filter-input" placeholder=${copy.filterPlaceholder}
          value=${s.q} aria-label="Filter archive"
          onInput=${(e) => this.setState({ q: e.target.value, shown: PAGE })} /></p>
        <p class="sortbar-row">
          <label>${copy.allTracksFilter} <select value=${s.track}
            onChange=${(e) => this.setState({ track: e.target.value,
              shown: PAGE })}>
            <option value="">${copy.allTracksFilter}</option>
            ${tracks.map((t) => html`<option value=${t.id}>${t.title}</option>`)}
          </select></label>
        </p>
        <div class="chips" role="group" aria-label="Kind">
          ${tabs.map(([id, label, n]) => html`<button
            class="chip ${s.kind === id ? "on" : ""}"
            aria-pressed=${s.kind === id}
            onClick=${() => this.setState({ kind: id, shown: PAGE })}>
            ${label} ${n}</button>`)}
        </div>
        <p class="muted">${copy.itemsAvailable(all.length)}</p>
        <ul class="cards">
          ${items.map((w) => html`<li class="card" data-track=${w.track}>
            <a href="#/read/${w.id}?from=archive">
              <span class="eyebrow">${(tmap[w.track] || {}).title || w.track}</span>
              <strong dir="auto">${w.title}</strong>
              <span class="muted">${w.summary || ""}</span>
              <span class="cardfoot"><span class="pill">${w.kind}</span>
                <span class="muted">${meta(w)}</span></span>
            </a>
          </li>`)}
        </ul>
        ${all.length > s.shown ? html`<p><button class="btn btn-primary"
          onClick=${() => this.setState({ shown: s.shown + PAGE })}>
          ${copy.showMore(Math.min(PAGE, all.length - s.shown),
            s.shown, all.length)}</button></p>` : null}
        <p class="hint">${copy.preIndexed}</p>
      </div>`;
    }
  }
  return { Archive };
});

/* views/about.js */
// about.js — P13 about and help.
NTI.define("views/about", function () {
  const { html } = window.htmPreact;
  function About() {
    const Cat = NTI.require("core/catalog");
    const copy = NTI.require("core/copy");
    const v = (Cat.data && Cat.data.contentVersion) || "";
    return html`<div class="view">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="#/">Home</a><span> / </span><span>${copy.aboutTitle}</span>
      </nav>
      <p class="eyebrow">${copy.aboutEyebrow}</p>
      <h1 class="hero-display">${copy.aboutTitle}</h1>
      <p class="lede">${copy.aboutBody}</p>
      <p><span class="pill">${copy.versionLabel(v || "local")}</span></p>
      <section aria-label="Motivation">
        <h2>${copy.motivationTitle}</h2>
        <p>${copy.motivationBody}</p>
        <p>
          <span class="pill">${copy.worksOffline}</span>
          <span class="pill">${copy.localPrivate}</span>
        </p>
      </section>
      <section aria-label="Pillars">
        <h2>Three core pillars</h2>
        <ol class="cards">
          <li class="card"><div class="pad">
            <strong>${copy.pillarOffline}</strong>
            <p class="muted">${copy.pillarOfflineBody}</p></div></li>
          <li class="card"><div class="pad">
            <strong>${copy.pillarUntethered}</strong>
            <p class="muted">${copy.pillarUntetheredBody}</p></div></li>
          <li class="card"><div class="pad">
            <strong>${copy.pillarNti}</strong>
            <p class="muted">${copy.pillarNtiBody}</p></div></li>
        </ol>
      </section>
      <section aria-label=${copy.aboutTitle}>
        <h2>${copy.aboutTitle}</h2>
        <ul>
          <li>${copy.aboutOpen}</li>
          <li>${copy.aboutVerified}</li>
          <li>${copy.aboutStatic}</li>
        </ul>
        <p class="hero-cta">
          <a class="btn btn-primary" href="#/roadmap">${copy.openRoadmap}</a>
          <a class="btn" href="#/archive">${copy.archiveTitle}</a>
        </p>
      </section>
      <p class="hint">${copy.libraryInfo}</p>
    </div>`;
  }
  return { About };
});

/* views/course.js */
// course.js — P05 external course view (no iframe): sandbox state,
// verified link, track syllabus, cached offline snapshots, finish toggle.
NTI.define("views/course", function () {
  const { html } = window.htmPreact;
  function Course({ id, store }) {
    const Cat = NTI.require("core/catalog");
    const copy = NTI.require("core/copy");
    const R = NTI.require("core/router");
    const e = ((Cat.data.externals || []).find((x) => x.id === id));
    if (!e) {
      R.go("#/404");
      return null;
    }
    const t = (Cat.data.tracks || []).find((x) => x.id === e.track) || {};
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    const https = /^https:/i.test(e.url || "");
    const items = Cat.byTrack(e.track).filter((w) => Cat.ready(w));
    const secs = [];
    (t.sections || []).forEach((name) => {
      const n = items.filter((w) => (w.section || "More") === name).length;
      if (n) secs.push([name, n]);
    });
    const snaps = items.filter((w) =>
      ["lesson", "lab", "script", "reference"].includes(w.kind)).slice(0, 4);
    const done = Cat.isDone(e.id, store.state.progress);
    return html`<div class="view" data-track=${e.track}>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="#/">${copy.crumbTracks}</a><span> / </span>
        <a href="#/track/${e.track}">${t.title || e.track}</a>
        <span> / </span><span>${copy.courseView}</span>
      </nav>
      <p class="eyebrow">${copy.courseEyebrow}</p>
      <h1 class="hero-display" dir="auto">${e.title}</h1>
      <p class="lede" dir="auto">${e.summary || ""}</p>
      <section class="hero" aria-label=${copy.sandboxState}>
        <p class="eyebrow">${copy.sandboxState}</p>
        <p>
          <span class="pill">${online ? copy.sandboxLoaded : copy.sandboxOffline}</span>
          <span class="pill">${copy.blockedEmbed}</span>
          ${https ? html`<span class="pill">${copy.httpsVerified}</span>` : null}
        </p>
        <p class="muted">${copy.embedNote}</p>
        <p class="muted" dir="auto">${e.host || ""}</p>
        <p class="hero-cta">
          <a class="btn btn-primary" href=${e.url} target="_blank" rel="noopener noreferrer">${copy.openNewTab}</a>
          <button class="btn" onClick=${() => {
            store.setDone(e.id, !done);
            NTI.require("ui/primitives").toast(done ? copy.removed : copy.markedDone);
          }}>${done ? copy.courseDone + " ✓" : copy.finishCourse}</button>
        </p>
      </section>
      ${secs.length ? html`<section aria-label=${copy.syllabusTitle}>
        <h2>${copy.syllabusTitle}</h2>
        <ol class="rows">${secs.map(([name, n], i) => html`<li class="row rownum">
          <span class="num">${i + 1}</span>
          <span class="row-t"><strong dir="auto">${name}</strong>
          <span class="muted">${n} cached ${n === 1 ? "item" : "items"}</span></span>
        </li>`)}</ol>
      </section>` : null}
      ${snaps.length ? html`<section aria-label=${copy.offlineSnapshots}>
        <h2>${copy.offlineSnapshots}</h2>
        <ul class="cards">${snaps.map((w) => html`<li class="card" data-track=${w.track}>
          <a href="#/read/${w.id}">
            <span class="eyebrow">${t.title || w.track}</span>
            <strong dir="auto">${w.title}</strong>
            <span class="cardfoot"><span class="pill">${w.kind}</span>
              ${w.minutes ? html`<span class="muted">${w.minutes} min</span>` : null}</span>
          </a>
        </li>`)}</ul>
        <p class="hint">${copy.preIndexed}</p>
      </section>` : null}
      <p><a class="btn" href="#/track/${e.track}">${copy.backTo(t.title || e.track)}</a></p>
    </div>`;
  }
  return { Course };
});

/* views/add.js */
﻿// add.js — maintainer Add PDFs page (hidden unless maintainerMode).
NTI.define("views/add", function () {
  const { html } = window.htmPreact;
  function Add() {
    const Cat = NTI.require("core/catalog");
    if (!Cat.data.site || !Cat.data.site.maintainerMode) {
      location.hash = "#/me";
      return null;
    }
    const inbox = (Cat.data.inbox || { waiting: 0, unsorted: [] });
    const slots = (Cat.data.slots || []);
    return html`<div class="view">
      <h1>Add PDF</h1>
      <p>Copy PDFs (any names) into <code>content/_inbox/</code>, run
        <code>refresh.bat</code> / <code>./refresh.sh</code>, reload.</p>
      <p>Name it so it attaches itself: <code>docker__04-networking.pdf</code>.
        Track ids: linux, aws, docker, kubernetes, terraform, ansible,
        jenkins, cicd, aiops.</p>
      ${inbox.waiting ? html`<p>${inbox.waiting} files waiting in the inbox; run refresh.</p>` : html`<p>Inbox empty.</p>`}
      ${(inbox.unsorted || []).length ? html`<section><h2>Needs a track</h2><ul>
        ${(inbox.unsorted || []).map((u) => html`<li>${u.file} — ${u.reason}</li>`)}
      </ul></section>` : null}
      ${slots.length ? html`<section><h2>Expected PDFs</h2><ul>
        ${slots.map((s) => html`<li>${s.file} — ${s.status}</li>`)}
      </ul></section>` : null}
      <p class="muted">Viewing needs nothing. Refreshing needs Node 18+ once.
        Without Node, drag a PDF onto the page.</p>
    </div>`;
  }
  return { Add };
});
NTI.define("views/notfound", function () {
  const { html } = window.htmPreact;
  function NotFound({ store }) {
    const Cat = NTI.require("core/catalog");
    const copy = NTI.require("core/copy");
    const last = store && store.state.last
      ? Cat.get(store.state.last.workId) : null;
    const jumps = (Cat.data.tracks || []).slice()
      .sort((a, b) => a.order - b.order).slice(0, 3);
    return html`<div class="view">
      <p class="eyebrow">${copy.lostEyebrow}</p>
      <h1 class="hero-display">${copy.lostTitle}</h1>
      <p class="lede">${copy.lostBody}</p>
      ${last && !(last.kind === "external") ? html`<section class="continue" aria-label="Continue">
        <p class="eyebrow">${copy.continueEyebrow}</p>
        <a class="btn btn-primary" href="#/read/${last.id}">${copy.resumeReading}: ${last.title}</a>
      </section>` : null}
      <p class="hero-cta">
        <a class="btn btn-primary" href="#/">${copy.backHome}</a>
        <a class="btn" href="#/roadmap">${copy.openRoadmap}</a>
        <a class="btn" href="#track-cards">${copy.heroCtaTracks}</a>
      </p>
      <section aria-label="Popular jump points">
        <h2>${copy.popularJumps}</h2>
        <ul class="rows">${jumps.map((t) => html`<li class="row">
          <a href="#/track/${t.id}">
            <span class="row-t"><strong>${t.title}</strong>
            <span class="muted">${t.summary || ""}</span></span>
            <span class="kind">${copy.openTrack}</span></a></li>`)}</ul>
      </section>
      <p class="hint">${copy.libraryInfo}</p>
    </div>`;
  }
  return { NotFound };
});

/* views/notfound.js */
﻿// notfound registered inside views/add.js.

/* app.js */
// app.js — boot: catalog, store/router/theme/keys, render, error boundary.
NTI.define("app", function () {
  const { html, render, Component } = window.htmPreact;
  class Boundary extends Component {
    constructor(p) { super(p); this.state = { err: null }; }
    componentDidCatch(e) { this.setState({ err: e }); }
    render(p, s) {
      if (s.err) {
        return html`<div class="view"><h1>The library data didn't load</h1>
          <p>Reload the page.</p>
          <button class="btn" onClick=${() => location.reload()}>Reload</button></div>`;
      }
      return p.children;
    }
  }
  function Shell() {
    const R = NTI.require("core/router");
    const store = NTI.require("core/store");
    const Cat = NTI.require("core/catalog");
    const copy = NTI.require("core/copy");
    const [route, setRoute] = window.htmPreact.useState(R.current);
    const [pal, setPal] = window.htmPreact.useState(false);    const [help, setHelp] = window.htmPreact.useState(false);
    const [filters, setFilters] = window.htmPreact.useState(
      store.state.filters || {});
    const [files, setFiles] = window.htmPreact.useState([]);
    // URL <-> filter sync (Back restores previous filter state).
    function pushFilterUrl(nf, view) {
      R.go(R.filterUrl(nf, view));
    }
    window.htmPreact.useEffect(() => {
      const off = R.on((r) => {
        if (R._lastHash !== undefined) {
          R.saveScroll(R._lastHash, window.scrollY);
        }
        R._lastHash = location.hash;
        setRoute(r);
        if (r.view === "library" && location.hash.includes("?")) {
          const nf = R.readFilterQuery();
          setFilters(nf); store.setFilters(nf);
        }
      });
      store.on(() => setFilters(Object.assign({}, store.state.filters)));
      NTI.require("core/storage").filesAll().then(setFiles);
      void off;
    }, []);
    window.htmPreact.useEffect(() => {
      const onHelp = () => setHelp(true);
      const onEsc = () => { setHelp(false); setPal(false); };
      document.addEventListener("nti:help", onHelp);
      document.addEventListener("nti:escape", onEsc);
      return () => {
        document.removeEventListener("nti:help", onHelp);
        document.removeEventListener("nti:escape", onEsc);
      };
    }, []);
    window.htmPreact.useEffect(() => {
      const y = R.restoreScroll(location.hash);
      if (y) requestAnimationFrame(() => window.scrollTo(0, y));
      else if (window.scrollY) window.scrollTo(0, 0);
    }, [route]);
    const { Topbar } = NTI.require("ui/topbar");
    const { Bottomnav } = NTI.require("ui/bottomnav");
    const { Strip } = NTI.require("ui/strip");
    const { Palette } = NTI.require("ui/palette");
    const counts = {};
    (Cat.data.tracks || []).forEach((t) => {
      counts[t.id] = Cat.counts(t.id, store.state.progress);
    });
    const total = Cat.works().length;
    let view = null;
    const q = route.query || {};
    if (route.view === "library") {
      const L = NTI.require("views/library");
      view = html`<${L.Library} store=${store}
        filters=${filters}
        myFiles=${files}
        onSearch=${(q) => setPal(q || true)} />`;
    } else if (route.view === "roadmap") {
      const V = NTI.require("views/roadmap");
      view = html`<${V.Roadmap} store=${store} open=${q.open} />`;
    } else if (route.view === "track") {
      const V = NTI.require("views/track");
      view = html`<${V.Track} id=${route.params.id} store=${store} />`;
    } else if (route.view === "archive") {
      const V = NTI.require("views/archive");
      view = html`<${V.Archive} />`;
    } else if (route.view === "about") {
      const V = NTI.require("views/about");
      view = html`<${V.About} />`;
    } else if (route.view === "read") {
      const V = NTI.require("views/reader");
      view = html`<${V.Reader} id=${route.params.id} store=${store} query=${q} />`;
    } else if (route.view === "course") {
      const V = NTI.require("views/course");
      view = html`<${V.Course} id=${route.params.id} store=${store} />`;
    } else if (route.view === "me") {
      const V = NTI.require("views/me");
      view = html`<${V.Me} store=${store} />`;
    } else if (route.view === "add") {
      const V = NTI.require("views/add");
      view = html`<${V.Add} />`;
    } else {
      const V = NTI.require("views/notfound");
      view = html`<${V.NotFound} store=${store} />`;
    }
    return html`<${Boundary}>
      <${Topbar} route=${route} count=${total}
        onSearch=${() => setPal(true)} />
      <${Strip} tracks=${(Cat.data.tracks || []).slice().sort((a, b) => a.order - b.order)}
        selected=${filters.track || []} counts=${counts}
        onToggle=${(id) => {
          const cur = filters.track || [];
          const next = cur.includes(id) ? cur.filter((x) => x !== id)
            : [...cur, id];
          const nf = Object.assign({}, filters, { track: next });
          setFilters(nf); store.setFilters(nf);
          pushFilterUrl(nf, route.view);
        }} />
      ${route.view === "library" ? (() => {
        const F = NTI.require("ui/filters");
        return html`<${F.Filters} value=${filters} onChange=${(nf) => {
          setFilters(nf); store.setFilters(nf);
          pushFilterUrl(nf, route.view);
        }} />`;
      })() : null}
      ${view}
      <${Bottomnav} route=${route} />
      ${pal ? html`<${Palette} count=${total}
        initialQ=${typeof pal === "string" ? pal : ""}
        onClose=${() => setPal(false)} />` : null}
      ${help ? html`<${HelpModal} onClose=${() => setHelp(false)} />` : null}
    <//>`;
  }
  function HelpModal({ onClose }) {
    const rows = [
      ["/ or Ctrl+K", "Open search"], ["g l", "Go to Library"],
      ["g r", "Go to Roadmap"], ["g m", "Go to Me"],
      ["j / k", "Next / previous row"], ["Enter", "Open focused row"],
      ["[ / ]", "Previous / next work"], ["m", "Toggle done"],
      ["b", "Toggle bookmark"], ["f", "Focus mode"], ["t", "Cycle theme"],
      ["?", "This list"], ["Esc", "Close overlay"],
    ];
    return html`<div class="modal-back" onClick=${onClose}>
      <div class="modal" role="dialog" aria-label="Keyboard shortcuts"
        ref=${(el) => {
          if (el) {
            const first = el.querySelector("button");
            if (first) first.focus();
          }
        }}
        onClick=${(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <ul>${rows.map(([k, v]) => html`<li><code>${k}</code> — ${v}</li>`)}</ul>
        <button class="btn" onClick=${onClose}>Close</button>
      </div></div>`;
  }
  function boot() {
    if (!window.htmPreact || !window.MiniSearch) {
      document.getElementById("app").innerHTML =
        "<p>The library data didn't load. Reload the page.</p>";
      return;
    }
    if (!window.NTI.catalog) {
      document.getElementById("app").innerHTML =
        "<p>The library data didn't load. Reload the page.</p>";
      return;
    }
    const Cat = NTI.require("core/catalog");
    Cat.init();
    const store = NTI.require("core/store");
    const R = NTI.require("core/router");
    R.init();
    NTI.require("core/theme").apply(store.state.settings);
    NTI.require("core/search").build();
    NTI.require("core/dropzone").init(store, NTI.require("core/copy"));
    const K = NTI.require("core/keys");
    const palOpen = () => setPal(true);
    K.on("/", palOpen);
    K.on("g l", () => R.go("#/"));
    K.on("g r", () => R.go("#/roadmap"));
    K.on("g m", () => R.go("#/me"));
    K.on("?", () => {
      const ev = new CustomEvent("nti:help");
      document.dispatchEvent(ev);
    });
    K.on("Escape", () => {
      document.dispatchEvent(new CustomEvent("nti:escape"));
    });
    // Row navigation (j/k) + row actions (m) across list views.
    function rows() {
      return [...document.querySelectorAll(".rows .row a, .jobs .job")];
    }
    K.on("j", () => {
      const r = rows();
      const i = r.indexOf(document.activeElement);
      (r[i + 1] || r[0]).focus();
    });
    K.on("k", () => {
      const r = rows();
      const i = r.indexOf(document.activeElement);
      (r[i - 1] || r[r.length - 1]).focus();
    });
    K.on("m", () => {
      const idm = location.hash.match(/#\/read\/([\w-]+)/);
      if (idm) {
        store.setDone(idm[1], !Cat.isDone(idm[1], store.state.progress));
        return;
      }
      const el = document.activeElement &&
        document.activeElement.closest(".row");
      const btn = el && el.querySelector(".iconbtn");
      if (btn) btn.click();
    });
    K.on("b", () => {
      const idm = location.hash.match(/#\/read\/([\w-]+)/);
      if (idm) store.toggleBookmark(idm[1], null);
    });
    K.on("f", () => {
      if (R.current.view === "read") {
        const b = [...document.querySelectorAll(".readbar button")]
          .find((x) => x.textContent.indexOf("Focus") === 0);
        if (b) b.click();
      }
    });
    // Roadmap arrow traversal (follows the job graph order).
    ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].forEach((key) => {
      K.on(key, () => {
        if (R.current.view !== "roadmap") return;
        const jobs = [...document.querySelectorAll(".roadmap .job")];
        if (!jobs.length) return;
        const i = jobs.indexOf(document.activeElement);
        const fwd = key === "ArrowRight" || key === "ArrowDown";
        const n = i < 0 ? (fwd ? 0 : jobs.length - 1)
          : (i + (fwd ? 1 : -1) + jobs.length) % jobs.length;
        jobs[n].focus();
      });
    });
    K.on("[", () => {
      const l = document.querySelector(".readnav2 a:first-child");
      if (l) l.click();
    });
    K.on("]", () => {
      const l = document.querySelector(".readnav2 a:last-child");
      if (l) l.click();
    });
    K.on("t", () => {
      const cur = store.state.settings.theme;
      const next = cur === "light" ? "dark" : cur === "dark" ? "system" : "light";
      store.setSettings({ theme: next });
      NTI.require("core/theme").apply(store.state.settings);
    });
    R.on(() => render(html`<${Shell} />`,
      document.getElementById("app")));
    render(html`<${Shell} />`, document.getElementById("app"));
  }
  return { boot };
});

// auto-boot (defer guarantees catalog/search-index loaded first)
(function () {
  function ready() {
    try { NTI.require("app").boot(); }
    catch (e) {
      console.error(e);
      document.getElementById("app").innerHTML =
        "<p>The library data didn't load. Reload the page.</p>";
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else ready();
})();
