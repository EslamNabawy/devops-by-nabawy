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
      ${cont ? html`<section class="continue" aria-label="Continue">
        <p class="eyebrow">${copy.continueEyebrow}</p>
        <a class="btn btn-primary" href="#/read/${cont.id}">${copy.resume}: ${cont.title}</a>
      </section>` : null}
      <section class="stats" aria-label="Library stats">
        <div><strong>${pdfTracks} PDF tracks</strong>
          <span class="muted">${pdfPages} pages of structured curation</span></div>
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
      <section class="steps" aria-label=${copy.howTitle}>
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
      <footer class="sitefoot">
        <strong>DevOps By Nabawy</strong>
        <span class="muted">${copy.footerTag} ${copy.libraryInfo}</span>
        <p><a href="#/archive">${copy.archiveTitle}</a> ·
          <a href="#/about">${copy.aboutTitle}</a> ·
          <a href="#/roadmap">${copy.openRoadmap}</a></p>
      </footer>
    </div>`;
  }
  return { Library };
});
