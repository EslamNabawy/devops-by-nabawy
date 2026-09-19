// pdf.js — PDF viewer + pending states + fallbacks + My files local open.
NTI.define("views/pdf", function () {
  const { html } = window.htmPreact;
  const { EmptyState, Skeleton } = NTI.require("ui/primitives");
  function PdfReader({ id, store, query }) {
    const Cat = NTI.require("core/catalog");
    const copy = NTI.require("core/copy");
    const R = NTI.require("core/router");
    const t = (Cat.data.tracks.find((x) => x.id ===
      ((Cat.get(id) || {}).track)) || {});
    // Local file?
    if ((query && query.fmt === "local") || String(id).startsWith("local-")) {
      return html`<${LocalPdf} id=${id} store=${store} />`;
    }
    const w = Cat.get(id);
    if (!w) return html`<${EmptyState} title="Not found" body="" />`;
    const pdfs = (w.formats || []).filter((f) => f.type === "pdf");
    const readyPdf = pdfs.find((f) => f.status === "ready");
    const page = query && query.page ? Number(query.page) : null;
    if (!readyPdf) {
      const pending = pdfs.find((f) => f.status === "pending");
      const hasOther = (w.formats || []).some((f) =>
        f.status === "ready");
      if (hasOther) {
        return html`<div class="view"><h1 dir="auto">${w.title}</h1>
          <p class="muted" title=${copy.pdfPendingTip}>PDF — ${copy.comingSoon}</p>
          <a class="btn" href="#/read/${id}">${copy.backTo(t.title || w.track)}</a></div>`;
      }
      return html`<div class="view"><h1>${copy.comingSoon}</h1>
        <p>${copy.comingSoonBody}</p>
        <a class="btn" href="#/track/${w.track}">${copy.backTo(t.title || w.track)}</a></div>`;
    }
    const v = (Cat.data && Cat.data.contentVersion) || "";
    const src = `${readyPdf.path}?v=${v}${page ? `#page=${page}` : ""}`;
    const chapters = (w.chapters || []).filter((c) => c.page);
    const blocked = (typeof navigator !== "undefined" &&
      navigator.pdfViewerEnabled === false);
    const coarse = window.matchMedia &&
      window.matchMedia("(pointer: coarse)").matches &&
      window.innerWidth < 500;
    if (blocked || coarse) {
      return html`<div class="view"><h1>${copy.pdfBlocked}</h1>
        <p>${copy.pdfBlockedBody}</p>
        <a class="btn btn-primary" href="${readyPdf.path}" target="_blank" rel="noopener noreferrer">${copy.openPdf}</a>
        <a class="btn" href="${readyPdf.path}" download>${copy.download}</a></div>`;
    }
    return html`<div class="view pdfview">
      <h1 dir="auto">${w.title}</h1>
      <div class="pdfbar"><span class="muted">${readyPdf.pages || ""} ${readyPdf.pages ? "pages" : ""}</span>
        <a class="btn btn-ghost" href="${readyPdf.path}" target="_blank" rel="noopener noreferrer">${copy.openNewTab}</a>
        <button class="btn btn-ghost" onClick=${() =>
          store.setDone(id, !Cat.isDone(id, store.state.progress))}>
          ${Cat.isDone(id, store.state.progress) ? "Done ✓" : copy.markDone}</button>
      </div>
      <iframe class="pdfframe" src="${src}" title="${w.title}"></iframe>
      ${w.kind === "book" && chapters.length ? html`<details class="outline">
        <summary>Chapters</summary><ol>
        ${chapters.map((c) => html`<li><a href="#/read/${id}?fmt=pdf&page=${c.page}">${c.title}</a> <span class="muted">p.${c.page}</span></li>`)}
        </ol></details>` : null}
    </div>`;
  }
  function LocalPdf({ id }) {
    const copy = NTI.require("core/copy");
    const [url, setUrl] = window.htmPreact.useState(null);
    window.htmPreact.useEffect(() => {
      let alive = true, obj = null;
      NTI.require("core/storage").filesAll().then((all) => {
        const f = all.find((x) => x.id === id);
        if (f && f.blob && alive) {
          obj = URL.createObjectURL(f.blob);
          setUrl(obj);
        }
      });
      return () => { alive = false; if (obj) URL.revokeObjectURL(obj); };
    }, [id]);
    if (!url) return html`<div class="view"><p>${copy.loading}</p></div>`;
    return html`<div class="view pdfview"><h1>My file</h1>
      <iframe class="pdfframe" src="${url}" title="PDF"></iframe></div>`;
  }
  return { PdfReader };
});
