// reader.js — lesson/book/script reading: outline, copy, prev/next, done.
NTI.define("views/reader", function () {
  const { html, Component } = window.htmPreact;
  const { Skeleton, EmptyState } = NTI.require("ui/primitives");
  class Reader extends Component {
    constructor(p) {
      super(p);
      this.state = { doc: null, failed: false, focus: false, steps: {} };
      this.onKey = (e) => {
        if (!e.altKey || e.key.toLowerCase() !== "j") return;
        const { id, query } = this.props;
        if (!query || query.from !== "archive" || !this.state.doc) return;
        const Cat = NTI.require("core/catalog");
        const w = Cat.get(id);
        if (!w || w.kind !== "lab") return;
        const all = (this.state.doc.toc || []).filter((h) => h.level === 2);
        if (!all.length) return;
        const done = this.state.steps[id] || [];
        const next = all.find((h) => !done.includes(h.id)) || all[0];
        e.preventDefault();
        const el = next && document.getElementById(next.id);
        if (el) {
          el.scrollIntoView({ block: "start" });
          el.setAttribute("tabindex", "-1");
          el.focus({ preventScroll: true });
        }
        NTI.require("core/a11y").announce(next.text);
      };
    }
    componentDidMount() {
      this.load(this.props);
      document.addEventListener("keydown", this.onKey);
    }
    componentWillUnmount() {
      document.removeEventListener("keydown", this.onKey);
    }
    componentDidUpdate(prev) {
      if (prev.id !== this.props.id ||
          JSON.stringify(prev.query) !== JSON.stringify(this.props.query)) {
        this.load(this.props);
      }
    }
    async load({ id, query }) {
      this.setState({ doc: null, failed: false });
      const CC = NTI.require("core/catalog");
      const w = CC.get(id);
      const fmt = (query && query.fmt) ||
        ((w && (w.formats || []).some((f) => f.type === "md" &&
          f.status === "ready")) ? "md"
          : (w && (w.formats || []).some((f) => f.type === "pdf" &&
            f.status === "ready")) ? "pdf" : "md");
      // PDF/local/script-external works never need the docs bundle.
      if (!w || fmt === "pdf" || fmt === "local" || w.kind === "external") {
        return;
      }
      const t0 = Date.now();
      const show = () => {
        const d = window.NTI.docs && window.NTI.docs[id];
        if (d) this.setState({ doc: d });
        else this.setState({ failed: true });
      };
      if (window.NTI.docs && window.NTI.docs[id]) { show(); return; }
      const L = NTI.require("core/loader");
      const Cat = NTI.require("core/catalog");
      const v = (Cat.data && Cat.data.contentVersion) || "";
      try {
        await L.load(`content/docs/${id}.js?v=${v}`, 10000);
        show();
      } catch { this.setState({ failed: true }); }
      void t0;
    }
    render({ id, store, query }, s) {
      const Cat = NTI.require("core/catalog");
      const copy = NTI.require("core/copy");
      const R = NTI.require("core/router");
      const w = Cat.get(id);
      if (!w) return html`<${EmptyState} title="Not found" body="" />`;
      if (w.kind === "external") {
        return html`<div class="view"><h1>${w.title}</h1><p>${w.summary || ""}</p>
          <a class="btn btn-primary" href="${w.external.url}" target="_blank" rel="noopener noreferrer">${copy.openNewTab}</a></div>`;
      }
      const fmt = (query && query.fmt) ||
        ((w.formats || []).some((f) => f.type === "md" && f.status === "ready")
          ? "md" : (w.formats || []).some((f) => f.type === "pdf" &&
            f.status === "ready") ? "pdf" : "md");
      if (fmt === "pdf" || fmt === "local") {
        const P = NTI.require("views/pdf");
        return html`<${P.PdfReader} id=${id} store=${store} query=${query} />`;
      }
      const fromArchive = query && query.from === "archive";
      const track = (Cat.data.tracks || []).find((t) => t.id === w.track) || {};
      const rhref = (nid, extra) => {
        const q = new URLSearchParams();
        if (fromArchive) q.set("from", "archive");
        if (extra) Object.keys(extra).forEach((k) => {
          if (extra[k] !== undefined && extra[k] !== null &&
            extra[k] !== "") q.set(k, extra[k]);
        });
        const s = q.toString();
        return `#/read/${nid}${s ? "?" + s : ""}`;
      };
      const mb = (b) => b > 0 ? (b / 1048576).toFixed(1) : "";
      let bundleBytes = 0;
      (w.formats || []).forEach((f) => {
        if (f.status === "ready" && f.bytes) bundleBytes += f.bytes;
      });
      const pdf = (w.formats || []).find((f) => f.type === "pdf" &&
        f.status === "ready");
      const items = Cat.byTrack(w.track);
      const i = items.findIndex((x) => x.id === id);
      const prev = items[i - 1], next = items[i + 1];
      const done = Cat.isDone(id, store.state.progress);
      if (s.failed) {
        return html`<div class="view"><h1>${copy.lessonFailed}</h1>
          <p>${copy.lessonFailedBody}</p>
          <button class="btn" onClick=${() => this.load({ id })}>${copy.tryAgain}</button>
          ${fromArchive
            ? html`<a class="btn" href="#/archive">${copy.backToArchive}</a>`
            : html`<a class="btn" href="#/track/${w.track}">${copy.backTo(track.title || w.track)}</a>`}</div>`;
      }
      if (!s.doc) return html`<div class="view"><${Skeleton} /></div>`;
      const anchor = query && query.a;
      const labSteps = fromArchive && w.kind === "lab" && s.doc
        ? (s.doc.toc || []).filter((h) => h.level === 2) : [];
      const checkedSteps = (s.steps && s.steps[id]) || [];
      const toggleStep = (hid) => {
        const has = checkedSteps.includes(hid);
        const next = has ? checkedSteps.filter((x) => x !== hid)
          : [...checkedSteps, hid];
        this.setState({ steps: Object.assign({}, s.steps, { [id]: next }) });
      };
      return html`<div class="view reader ${s.focus ? "focus" : ""}" data-track=${w.track}>
        ${fromArchive ? html`<nav class="crumbs" aria-label="Breadcrumb">
          <a href="#/archive">${copy.archiveCrumb}</a><span> / </span>
          <a href="#/track/${w.track}">${track.title || w.track}</a>
          <span> / </span><span>${w.title}</span>
        </nav>
        <p><a class="btn" href="#/archive">${copy.backToArchive}</a></p>` : null}
        <h1 dir="auto">${Cat.plain(w.title)}</h1>
        ${fromArchive ? html`<p>
          <span class="pill">${copy.cachedLocal}</span>
          ${bundleBytes ? html`<span class="muted">${copy.bundleSizeShort(mb(bundleBytes))}</span>` : null}
          <span class="muted">${w.kind}${w.minutes ? ` · ${w.minutes} min` : ""}</span>
        </p>` : null}
        ${w.kind === "book" ? html`<p class="muted">${copy.originalStyle}
          ${(w.formats || []).some((f) => f.type === "html" && f.status === "ready")
            ? html` <a href="content/html/${id}/index.html" target="_blank" rel="noopener noreferrer">${copy.openNewTab}</a>` : null}</p>` : null}
        <div class="readbar">
          <span class="muted">${w.kind} · ${w.minutes ? w.minutes + " min" : ""}</span>
          <button class="btn btn-ghost" onClick=${() =>
            this.setState({ focus: !s.focus })} aria-pressed=${s.focus}>Focus (f)</button>
          <button class="btn btn-ghost" onClick=${() =>
            store.toggleBookmark(id, anchor || null)}>
            ${store.state.bookmarks.some((b) => b.workId === id) ? "★" : "☆"}</button>
          <details class="readsettings">
            <summary class="btn btn-ghost">Aa</summary>
            <div class="readsettings-pop">
              <div role="group" aria-label="Text size">
                <button class="btn btn-ghost" aria-label="Smaller text" onClick=${() => {
                  const v = Math.max(0, store.state.settings.readingSize - 1);
                  store.setSettings({ readingSize: v });
                  NTI.require("core/theme").apply(store.state.settings);
                }}>A-</button>
                <button class="btn btn-ghost" aria-label="Larger text" onClick=${() => {
                  const v = Math.min(2, store.state.settings.readingSize + 1);
                  store.setSettings({ readingSize: v });
                  NTI.require("core/theme").apply(store.state.settings);
                }}>A+</button>
              </div>
              <label>Theme <select value=${store.state.settings.theme} onChange=${(e) => {
                store.setSettings({ theme: e.target.value });
                NTI.require("core/theme").apply(store.state.settings);
              }}>
                <option value="system">system</option>
                <option value="light">light</option>
                <option value="dark">dark</option>
              </select></label>
            </div>
          </details>
        </div>
        ${(s.doc.toc || []).length ? html`<details class="outline"><summary>Outline</summary><ol>
          ${(s.doc.toc || []).map((h) => html`<li><a href="${rhref(id, { a: h.id })}">${h.text}</a></li>`)}
        </ol></details>` : null}
        ${fromArchive && pdf && fmt !== "pdf" ? html`<section class="card" aria-label=${copy.attachedGuide}>
          <div class="pad">
            <strong>${copy.attachedGuide}</strong>
            <span class="muted">${w.title}${pdf.pages ? ` · ${pdf.pages} pages` : ""}${pdf.bytes ? ` · ${mb(pdf.bytes)} MB` : ""}</span>
            <p class="hero-cta">
              <a class="btn btn-primary" href="${rhref(id, { fmt: "pdf" })}">${copy.openViewer}</a>
              <a class="btn" href="${pdf.path}" download>${copy.download}</a>
            </p>
          </div>
        </section>` : null}
        ${labSteps.length ? html`<section aria-label=${copy.labSteps}>
          <h2>${copy.labSteps}</h2>
          <p class="muted">${copy.setupCheck(checkedSteps.length, labSteps.length)} · ${copy.nextStepHint}</p>
          <ol>${labSteps.map((h, i) => html`<li>
            <label><input type="checkbox" checked=${checkedSteps.includes(h.id)}
              onChange=${() => toggleStep(h.id)} />
              <a href="${rhref(id, { a: h.id })}">${i + 1}. ${h.text}</a>
            </label>
          </li>`)}</ol>
        </section>` : null}
        ${(w.formats || []).some((f) => (f.type === "html") && f.status === "ready" && f.path)
          ? html`<p><a href="${(w.formats || []).find((f) => f.type === "html").path}" target="_blank" rel="noopener noreferrer">View original</a></p>` : null}
        <article class="article" ref=${(el) => {
          if (el && anchor) {
            const t = el.querySelector("#" + CSS.escape(anchor));
            if (t) t.scrollIntoView();
          }
          if (el) {
            el.querySelectorAll("pre.code").forEach((pre) => {
              if (pre.querySelector(".copybtn")) return;
              const b = document.createElement("button");
              b.className = "copybtn";
              b.textContent = "Copy";
              b.onclick = () => {
                const c = pre.querySelector("code");
                if (c) navigator.clipboard.writeText(c.innerText)
                  .then(() => NTI.require("ui/primitives").toast(copy.copied));
                NTI.require("core/a11y").announce(copy.copied);
              };
              pre.appendChild(b);
            });
            el.querySelectorAll("img").forEach((img) => {
              img.loading = "lazy";
              img.onclick = () => window.open(img.src, "_blank", "noopener");
            });
          }
        }} dangerouslySetInnerHTML=${{ __html: s.doc.html }}></article>
        <div class="readnav">
          ${prev ? html`<a class="btn" href="${rhref(prev.id)}">← ${prev.title}</a>` : html`<span></span>`}
          ${next ? html`<button class="btn btn-primary" onClick=${() => {
            store.setDone(id, true);
            store.setLast({ workId: next.id, anchor: null, page: null,
              at: new Date().toISOString() });
            R.go(rhref(next.id));
          }}>${copy.markDoneContinue}</button>`
          : html`<button class="btn btn-primary" onClick=${() => {
            store.setDone(id, true);
            NTI.require("ui/primitives").toast(copy.markedDone,
              { label: copy.undo, fn: () => store.setDone(id, false) });
          }}>${done ? "Done ✓" : copy.markDone}</button>`}
        </div>
        ${prev || next ? html`<div class="readnav2">
          ${prev ? html`<a href="${rhref(prev.id)}">[${"prev"}]</a>` : null}
          ${next ? html`<a href="${rhref(next.id)}">[${"next"}]</a>` : null}
        </div>` : null}
      </div>`;
    }
  }
  return { Reader };
});
