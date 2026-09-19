// palette.js — command palette: Go to / Works / Inside documents + My files.
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
