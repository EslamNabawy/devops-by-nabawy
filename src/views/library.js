// library.js — Continue block, Books group, track groups, My files group.
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
  function Library({ store, filters, myFiles }) {
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
    </div>`;
  }
  return { Library };
});
