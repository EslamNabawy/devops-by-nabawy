// store.js — single state store, pure selectors, export/import.
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
