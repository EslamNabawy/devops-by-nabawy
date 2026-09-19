// catalog.js — index + progress math (single source).
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
