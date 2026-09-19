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
  function NotFound() {
    return html`<div class="view"><h1>Not found</h1>
      <p>This page doesn't exist.</p>
      <a class="btn" href="#/">Back to Library</a></div>`;
  }
  return { NotFound };
});
