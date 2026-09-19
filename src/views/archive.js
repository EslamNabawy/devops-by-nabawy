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
            <a href="#/read/${w.id}">
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
