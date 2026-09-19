// me.js — progress, bookmarks, My files, settings, backup.
NTI.define("views/me", function () {
  const { html, Component } = window.htmPreact;
  class Me extends Component {
    constructor(p) {
      super(p);
      this.state = { files: [], confirmId: null };
    }
    componentDidMount() {
      NTI.require("core/storage").filesAll()
        .then((files) => this.setState({ files }));
    }
    render({ store }, s) {
      const copy = NTI.require("core/copy");
      const Cat = NTI.require("core/catalog");
      const S = NTI.require("core/storage");
      const tracks = (Cat.data.tracks || []).slice()
        .sort((a, b) => a.order - b.order);
      let totalWorks = 0, totalDone = 0, tDone = 0, tProg = 0;
      const rows = tracks.map((t) => {
        const cc = Cat.counts(t.id, store.state.progress);
        totalWorks += cc.total;
        totalDone += cc.done;
        let st = copy.statusUpcoming;
        if (cc.total && cc.done >= cc.total) { st = copy.statusDone; tDone += 1; }
        else if (cc.done > 0) { st = copy.statusProgress; tProg += 1; }
        return { t, cc, st };
      });
      const pct = totalWorks ? Math.round((totalDone / totalWorks) * 100) : 0;
      const last = store.state.last ? Cat.get(store.state.last.workId) : null;
      return html`<div class="view">
        <nav class="crumbs" aria-label="Breadcrumb">
          <a href="#/">Home</a><span> / </span><span>Me</span>
        </nav>
        <p class="eyebrow">${copy.localPrivate}</p>
        <h1 class="hero-display">Me</h1>
        <p class="lede">${copy.meBody}</p>
        ${!S.available ? html`<p class="warn">${copy.storageBlocked}</p>` : null}
        <section aria-label=${copy.curriculumOverview}>
          <h2>${copy.curriculumOverview}</h2>
          <section class="stats">
            <div><strong>${pct}%</strong>
              <span class="muted">${tDone} of ${tracks.length} tracks</span></div>
            <div><strong>${tDone}</strong>
              <span class="muted">${copy.statusDone}</span></div>
            <div><strong>${tProg}</strong>
              <span class="muted">${copy.statusProgress}</span></div>
          </section>
        </section>
        <section aria-label=${copy.tracksStatus}>
          <h2>${copy.tracksStatus}</h2>
          <ul class="rows">${rows.map(({ t, cc, st }) => html`<li class="row">
            <a href="#/track/${t.id}">
              <span class="row-t"><strong>${t.title}</strong>
              <span class="muted">${cc.done}/${cc.total}</span></span>
              <span class="pill">${st}</span></a></li>`)}</ul>
        </section>
        ${last && last.kind !== "external" ? html`<section aria-label=${copy.recentActivity}>
          <h2>${copy.recentActivity}</h2>
          <p><a class="btn btn-primary" href="#/read/${last.id}">${copy.resumeReading}: ${last.title}</a></p>
        </section>` : null}
        <section><h2>Bookmarks</h2>
          ${store.state.bookmarks.length ? html`<ul class="rows">
            ${store.state.bookmarks.map((b) => {
              const w = Cat.get(b.workId);
              return html`<li class="row"><a href="#/read/${b.workId}">${w ? w.title : b.workId}</a></li>`;
            })}</ul>` : html`<p>${copy.noBookmarks}</p>`}
        </section>
        <section id="my-files"><h2>My files</h2>
          ${s.files.length ? html`<ul class="rows">
            ${s.files.map((f) => html`<li class="row">
              <a href="#/read/${f.id}?fmt=local">${f.name}</a>
              ${s.confirmId === f.id
                ? html`<span><button class="btn btn-ghost" onClick=${() => this.setState({ confirmId: null })}>Keep</button>
                  <button class="btn" onClick=${async () => {
                    await S.filesDel(f.id);
                    this.setState({ files: (await S.filesAll()), confirmId: null });
                    NTI.require("ui/primitives").toast(copy.removed);
                  }}>Confirm remove</button></span>`
                : html`<button class="btn btn-ghost" onClick=${() =>
                  this.setState({ confirmId: f.id })}>Remove</button>`}</li>`)}</ul>`
            : html`<p>${copy.noFiles}</p>`}
          <button class="btn" onClick=${() => {
            const inp = document.createElement("input");
            inp.type = "file"; inp.accept = "application/pdf";
            inp.onchange = async () => {
              const rec = await NTI.require("core/dropzone")
                .addFile(inp.files[0], store, copy);
              if (rec) {
                this.setState({ files: (await S.filesAll()) });
                NTI.require("core/router").go(`#/read/${rec.id}?fmt=local`);
              }
            };
            inp.click();
          }}>${copy.openPdfFromComputer}</button>
        </section>
        <section><h2>Settings</h2>
          <label>Theme <select value=${store.state.settings.theme} onChange=${(e) => {
            store.setSettings({ theme: e.target.value });
            NTI.require("core/theme").apply(store.state.settings);
          }}>
            <option value="system">system</option><option value="light">light</option><option value="dark">dark</option>
          </select></label>
          <label>Density <select value=${store.state.settings.density} onChange=${(e) => {
            store.setSettings({ density: e.target.value });
            NTI.require("core/theme").apply(store.state.settings);
          }}>
            <option value="compact">compact</option><option value="comfortable">comfortable</option><option value="roomy">roomy</option>
          </select></label>
          <label><input type="checkbox" checked=${store.state.settings.hideDone} onChange=${(e) => {
            store.setSettings({ hideDone: e.target.checked });
          }} /> Hide done</label>
        </section>
        <section><h2>${copy.backupTitle}</h2>
          <p>${copy.backupBody}</p>
          <button class="btn" onClick=${() => {
            const blob = new Blob([store.export()],
              { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "nti-progress.json";
            a.click();
          }}>${copy.exportBtn}</button>
          <button class="btn" onClick=${() => {
            const inp = document.createElement("input");
            inp.type = "file"; inp.accept = "application/json";
            inp.onchange = () => {
              const r = new FileReader();
              r.onload = () => {
                try { store.import(r.result);
                  NTI.require("ui/primitives").toast(copy.imported);
                } catch {
                  NTI.require("ui/primitives").toast(copy.importFailed);
                }
                this.forceUpdate();
              };
              r.readAsText(inp.files[0]);
            };
            inp.click();
          }}>${copy.importBtn}</button>
        </section>
        <section><h2>Library info</h2><p>${copy.libraryInfo}</p>
        ${Cat.data.site && Cat.data.site.maintainerMode
          ? html`<p><a class="btn" href="#/add">Add PDF</a></p>` : null}</section>
        <section aria-label=${copy.aboutTitle}>
          <h2>${copy.aboutTitle}</h2>
          <ul>
            <li>${copy.aboutOpen}</li>
            <li>${copy.aboutVerified}</li>
            <li>${copy.aboutStatic}</li>
          </ul>
        </section>
      </div>`;
    }
  }
  return { Me };
});
