// filters.js — filter rail + sheet + active chips (type/format/status).
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
