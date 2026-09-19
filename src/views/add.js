// add.js — maintainer Add PDFs page (hidden unless maintainerMode).
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
