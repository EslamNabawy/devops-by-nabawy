// track.js — track page: Continue, sections, screenshots gallery.
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
