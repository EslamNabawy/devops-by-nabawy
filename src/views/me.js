// me.js — progress, bookmarks, My files, settings, backup.
NTI.define("views/me", function () {
  const { html, Component } = window.htmPreact;
  class Me extends Component {
    constructor(p) {
      super(p);
      this.state = { files: [] };
    }
    componentDidMount() {
      NTI.require("core/storage").filesAll()
        .then((files) => this.setState({ files }));
    }
    render({ store }, s) {
      const copy = NTI.require("core/copy");
      const Cat = NTI.require("core/catalog");
      const S = NTI.require("core/storage");
      const doneCount = Object.keys(store.state.progress).length;
      return html`<div class="view">
        <h1>Me</h1>
        ${!S.available ? html`<p class="warn">${copy.storageBlocked}</p>` : null}
        <section><h2>Progress</h2>
          ${doneCount ? html`<p>${doneCount} items in progress or done.</p>`
            : html`<p>${copy.noProgress} <a href="#/roadmap">${copy.openRoadmap}</a></p>`}
        </section>
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
              <button class="btn btn-ghost" onClick=${async () => {
                if (!confirm("Remove?")) return;
                await S.filesDel(f.id);
                this.setState({ files: (await S.filesAll()) });
                NTI.require("ui/primitives").toast(copy.removed);
              }}>Remove</button></li>`)}</ul>`
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
        <section><h2>Library info</h2><p>${copy.libraryInfo}</p></section>
      </div>`;
    }
  }
  return { Me };
});
