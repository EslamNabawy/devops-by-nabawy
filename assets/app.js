
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
  const bus = {};
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
    bus,
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
    const p = total ? (done / total) * 100 : 0;
    return html`<span class="segbar"><span class="segbar-f" style="width:${p}%"></span></span>`;
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
    return html`<header class="topbar">
      <a class="brand" href="#/">DevOps By Nabawy</a>
      <nav class="topnav" aria-label="Primary">
        <a href="#/" aria-current=${route.view === "library" ? "page" : null}>Library</a>
        <a href="#/roadmap" aria-current=${route.view === "roadmap" ? "page" : null}>Roadmap</a>
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
      this.state = { q: "", results: [], active: 0, indexing: false };
    }
    async onInput(q) {
      this.setState({ q, active: 0 });
      if (!q.trim()) { this.setState({ results: [] }); return; }
      const S = NTI.require("core/search");
      this.setState({ indexing: true });
      S.ensureTier2().finally(() => this.setState({ indexing: false }));
      const r = await S.query(q.trim());
      this.setState({ results: r });
      NTI.require("core/a11y").announce(`${r.length} results`);
    }
    openWork(r) {
      const store = NTI.require("core/store");
      store.pushRecent(this.state.q);
      const R = NTI.require("core/router");
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
  function Library({ store, filters, myFiles }) {
    const Cat = NTI.require("core/catalog");
    const copy = NTI.require("core/copy");
    const tracks = (Cat.data.tracks || []).slice()
      .sort((a, b) => a.order - b.order);
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
    const books = (Cat.data.books || []);
    const fTrack = filters.track || [];
    return html`<div class="view">
      <h1 class="sr-only">Library</h1>
      <p class="hint">${copy.hint}</p>
      ${cont ? html`<section class="continue" aria-label="Continue">
        <h2>${copy.continueBtn}</h2>
        <a class="btn btn-primary" href="#/read/${cont.id}">${copy.resume}: ${cont.title}</a>
      </section>` : null}
      ${books.length && !fTrack.length ? html`<section aria-label="Books">
        <h2>Books</h2><ul class="rows">
        ${books.map((b) => html`<${Row} w=${{ id: b.id, track: b.track,
          kind: "book", title: b.title, minutes: 0,
          formats: b.formats }} store=${store} />`)}</ul></section>` : null}
      ${tracks.filter((t) => !fTrack.length || fTrack.includes(t.id))
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
          const all = [...exts, ...items];
          if (!all.length) return null;
          return html`<section aria-label=${t.title} data-track=${t.id}>
            <h2>${t.title}</h2>
            <ul class="rows">${all.map((w) =>
              html`<${Row} w=${w} store=${store} />`)}</ul>
          </section>`;
        })}
      ${(myFiles || []).length ? html`<section aria-label="My files">
        <h2>My files</h2><ul class="rows">
        ${myFiles.map((f) => html`<li class="row"><a href="#/read/${f.id}?fmt=local">
          <span class="row-t"><strong>${f.name}</strong>
          <span class="muted">${(f.bytes / 1024).toFixed(0)} KB</span></span>
          <span class="kind">PDF</span></a></li>`)}</ul></section>` : null}
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
      const A = NTI.require("core/a11y");
      if (!A.reducedMotion(NTI.require("core/store"))) {
        setTimeout(() => this.setState({ ran: true }), 60);
      } else this.setState({ ran: true });
    }
    render({ store }, s) {
      const Cat = NTI.require("core/catalog");
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
      return html`<div class="view roadmap ${s.ran ? "ran" : "run"}">
        <h1>Roadmap</h1>
        <ol class="stages">
        ${stages.map((st, si) => html`<li class="stage" style="--si:${si}">
          <h2>${st.title}</h2>
          <ol class="jobs">${(st.tracks || []).map((tid) => {
            const t = tmap[tid];
            if (!t) return null;
            const c = counts[tid] || { done: 0, total: 0 };
            const here = rec && rec.id === tid;
            return html`<li><button class="job ${here ? "here" : ""}"
              data-track=${tid}
              onClick=${() => this.setState({ open: tid })}
              onKeyDown=${(e) => {
                if (e.key === "Enter") this.setState({ open: tid });
              }}>
              <span class="dot"></span><strong>${t.title}</strong>
              <span class="n">${c.done}/${c.total}</span>
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
    const ref = (el) => {
      if (el) {
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
          <a href="${e.url}" target="_blank" rel="noopener noreferrer">${e.title} (Online course)</a>
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
    const secs = [];
    for (const w of items) {
      let s = secs.find((x) => x.name === (w.section || "More"));
      if (!s) { s = { name: w.section || "More", items: [] }; secs.push(s); }
      s.items.push(w);
    }
    return html`<div class="view" data-track=${id}>
      <h1>${t.title}</h1>
      <p class="muted">${t.summary || ""}</p>
      <${ProgressRing} done=${c.done} total=${c.total} />
      ${next ? html`<button class="btn btn-primary" onClick=${() =>
        R.go(`#/read/${next.id}`)}>${copy.continueBtn}: ${next.title}</button>`
        : items.length ? html`<p>All done.</p>`
        : html`<h2>${copy.nothingHere}</h2><p>${copy.nothingHereBody}</p>
          <a class="btn" href="#/">${copy.backToLibrary}</a>`}
      ${secs.map((s) => html`<section><h2>${s.name}</h2><ul class="rows">
        ${s.items.map((w) => html`<li class="row"><a href="#/read/${w.id}">
          <span class="row-t"><strong>${w.title}</strong>
          <span class="muted">${w.minutes ? w.minutes + " min" : ""}</span></span>
          <span class="kind">${w.kind}</span></a></li>`)}</ul></section>`)}
      ${shots.length ? html`<section aria-label="Screenshots"><h2>Screenshots</h2>
        <div class="shots">${shots.map((a) => html`<a href="${a.path}" target="_blank" rel="noopener noreferrer">
          <img src="${a.path}" alt="${a.title}" loading="lazy" />
          <span>${a.title}</span></a>`)}</div></section>` : null}
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
      this.state = { doc: null, failed: false, focus: false };
    }
    componentDidMount() { this.load(this.props); }
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
      const items = Cat.byTrack(w.track);
      const i = items.findIndex((x) => x.id === id);
      const prev = items[i - 1], next = items[i + 1];
      const done = Cat.isDone(id, store.state.progress);
      if (s.failed) {
        return html`<div class="view"><h1>${copy.lessonFailed}</h1>
          <p>${copy.lessonFailedBody}</p>
          <button class="btn" onClick=${() => this.load({ id })}>${copy.tryAgain}</button>
          <a class="btn" href="#/track/${w.track}">${copy.backTo((Cat.data.tracks.find((t) => t.id === w.track) || {}).title || w.track)}</a></div>`;
      }
      if (!s.doc) return html`<div class="view"><${Skeleton} /></div>`;
      const anchor = query && query.a;
      return html`<div class="view reader ${s.focus ? "focus" : ""}" data-track=${w.track}>
        <h1 dir="auto">${w.title}</h1>
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
        </div>
        ${(s.doc.toc || []).length ? html`<details class="outline"><summary>Outline</summary><ol>
          ${(s.doc.toc || []).map((h) => html`<li><a href="#/read/${id}?a=${h.id}">${h.text}</a></li>`)}
        </ol></details>` : null}
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
          ${prev ? html`<a class="btn" href="#/read/${prev.id}">← ${prev.title}</a>` : html`<span></span>`}
          ${next ? html`<button class="btn btn-primary" onClick=${() => {
            store.setDone(id, true);
            store.setLast({ workId: next.id, anchor: null, page: null,
              at: new Date().toISOString() });
            R.go(`#/read/${next.id}`);
          }}>${copy.markDoneContinue}</button>`
          : html`<button class="btn btn-primary" onClick=${() => {
            store.setDone(id, true);
            NTI.require("ui/primitives").toast(copy.markedDone,
              { label: copy.undo, fn: () => store.setDone(id, false) });
          }}>${done ? "Done ✓" : copy.markDone}</button>`}
        </div>
        ${prev || next ? html`<div class="readnav2">
          ${prev ? html`<a href="#/read/${prev.id}">[${"prev"}]</a>` : null}
          ${next ? html`<a href="#/read/${next.id}">[${"next"}]</a>` : null}
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
      return html`<div class="view"><h1>${copy.pdfBlocked}</h1>
        <p>${copy.pdfBlockedBody}</p>
        <a class="btn btn-primary" href="${readyPdf.path}" target="_blank" rel="noopener noreferrer">${copy.openPdf}</a>
        <a class="btn" href="${readyPdf.path}" download>${copy.download}</a></div>`;
    }
    return html`<div class="view pdfview">
      <h1 dir="auto">${w.title}</h1>
      <div class="pdfbar"><span class="muted">${readyPdf.pages || ""} ${readyPdf.pages ? "pages" : ""}</span>
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
      this.state = { files: [] };
    }
    componentDidMount() {
      NTI.require("core/storage").filesAll()
        .then((files) => this.setState({ files }));
    }
    render({ store }, s) {
      const copy = NTI.require("core/copy");
      const Cat = NTI.require("core/catalog");
      const S = NTI.require("core/storage");
      const doneCount = Object.keys(store.state.progress).length;
      return html`<div class="view">
        <h1>Me</h1>
        ${!S.available ? html`<p class="warn">${copy.storageBlocked}</p>` : null}
        <section><h2>Progress</h2>
          ${doneCount ? html`<p>${doneCount} items in progress or done.</p>`
            : html`<p>${copy.noProgress} <a href="#/roadmap">${copy.openRoadmap}</a></p>`}
        </section>
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
              <button class="btn btn-ghost" onClick=${async () => {
                if (!confirm("Remove?")) return;
                await S.filesDel(f.id);
                this.setState({ files: (await S.filesAll()) });
                NTI.require("ui/primitives").toast(copy.removed);
              }}>Remove</button></li>`)}</ul>`
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
        <section><h2>Library info</h2><p>${copy.libraryInfo}</p></section>
      </div>`;
    }
  }
  return { Me };
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
  function NotFound() {
    return html`<div class="view"><h1>Not found</h1>
      <p>This page doesn't exist.</p>
      <a class="btn" href="#/">Back to Library</a></div>`;
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
    const [pal, setPal] = window.htmPreact.useState(false);
    const [filters, setFilters] = window.htmPreact.useState(
      store.state.filters || {});
    const [files, setFiles] = window.htmPreact.useState([]);
    // URL <-> filter sync (Back restores previous filter state).
    function pushFilterUrl(nf, view) {
      const q = new URLSearchParams();
      (nf.track || []).forEach((t) => q.append("track", t));
      (nf.type || []).forEach((t) => q.append("type", t));
      (nf.format || []).forEach((t) => q.append("format", t));
      (nf.status || []).forEach((t) => q.append("status", t));
      const qs = q.toString();
      R.go(`#/${view === "library" ? "" : view}${qs ? "?" + qs : ""}`);
    }
    function urlFilters(query) {
      const g = (k) => {
        const v = query[k];
        if (v === undefined) return [];
        return Array.isArray(v) ? v : [v];
      };
      // URLSearchParams drops repeated keys via Object.fromEntries —
      // reparse from the raw hash for multi-values.
      const raw = (location.hash.split("?")[1] || "");
      const rp = new URLSearchParams(raw);
      return { track: rp.getAll("track"), type: rp.getAll("type"),
        format: rp.getAll("format"), status: rp.getAll("status") };
    }
    window.htmPreact.useEffect(() => {
      const off = R.on((r) => {
        setRoute(r);
        if (r.view === "library" && location.hash.includes("?")) {
          const nf = urlFilters(r.query);
          setFilters(nf); store.setFilters(nf);
        }
      });
      store.on(() => setFilters(Object.assign({}, store.state.filters)));
      NTI.require("core/storage").filesAll().then(setFiles);
      void off;
    }, []);
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
        myFiles=${files} />`;
    } else if (route.view === "roadmap") {
      const V = NTI.require("views/roadmap");
      view = html`<${V.Roadmap} store=${store} open=${q.open} />`;
    } else if (route.view === "track") {
      const V = NTI.require("views/track");
      view = html`<${V.Track} id=${route.params.id} store=${store} />`;
    } else if (route.view === "read") {
      const V = NTI.require("views/reader");
      view = html`<${V.Reader} id=${route.params.id} store=${store} query=${q} />`;
    } else if (route.view === "me") {
      const V = NTI.require("views/me");
      view = html`<${V.Me} store=${store} />`;
    } else if (route.view === "add") {
      const V = NTI.require("views/add");
      view = html`<${V.Add} />`;
    } else {
      const V = NTI.require("views/notfound");
      view = html`<${V.NotFound} />`;
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
        onClose=${() => setPal(false)} />` : null}
    <//>`;
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
    K.on("?", () => alert("/ search · g l library · g r roadmap · g m me · j/k rows · m done · b bookmark · f focus · t theme · Esc close"));
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
