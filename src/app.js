// app.js — boot: catalog, store/router/theme/keys, render, error boundary.
NTI.define("app", function () {
  const { html, render, Component } = window.htmPreact;
  class Boundary extends Component {
    constructor(p) { super(p); this.state = { err: null }; }
    componentDidCatch(e) { this.setState({ err: e }); }
    render(p, s) {
      if (s.err) {
        return html`<div class="view"><h1>The library data didn't load</h1>
          <p>Reload the page.</p>
          <button class="btn" onClick=${() => location.reload()}>Reload</button></div>`;
      }
      return p.children;
    }
  }
  function Shell() {
    const R = NTI.require("core/router");
    const store = NTI.require("core/store");
    const Cat = NTI.require("core/catalog");
    const copy = NTI.require("core/copy");
    const [route, setRoute] = window.htmPreact.useState(R.current);
    const [pal, setPal] = window.htmPreact.useState(false);    const [help, setHelp] = window.htmPreact.useState(false);
    const [filters, setFilters] = window.htmPreact.useState(
      store.state.filters || {});
    const [files, setFiles] = window.htmPreact.useState([]);
    // URL <-> filter sync (Back restores previous filter state).
    function pushFilterUrl(nf, view) {
      R.go(R.filterUrl(nf, view));
    }
    window.htmPreact.useEffect(() => {
      const off = R.on((r) => {
        if (R._lastHash !== undefined) {
          R.saveScroll(R._lastHash, window.scrollY);
        }
        R._lastHash = location.hash;
        setRoute(r);
        if (r.view === "library" && location.hash.includes("?")) {
          const nf = R.readFilterQuery();
          setFilters(nf); store.setFilters(nf);
        }
      });
      store.on(() => setFilters(Object.assign({}, store.state.filters)));
      NTI.require("core/storage").filesAll().then(setFiles);
      void off;
    }, []);
    window.htmPreact.useEffect(() => {
      const onHelp = () => setHelp(true);
      const onEsc = () => { setHelp(false); setPal(false); };
      document.addEventListener("nti:help", onHelp);
      document.addEventListener("nti:escape", onEsc);
      return () => {
        document.removeEventListener("nti:help", onHelp);
        document.removeEventListener("nti:escape", onEsc);
      };
    }, []);
    window.htmPreact.useEffect(() => {
      const y = R.restoreScroll(location.hash);
      if (y) requestAnimationFrame(() => window.scrollTo(0, y));
      else if (window.scrollY) window.scrollTo(0, 0);
    }, [route]);
    const { Topbar } = NTI.require("ui/topbar");
    const { Bottomnav } = NTI.require("ui/bottomnav");
    const { Strip } = NTI.require("ui/strip");
    const { Palette } = NTI.require("ui/palette");
    const counts = {};
    (Cat.data.tracks || []).forEach((t) => {
      counts[t.id] = Cat.counts(t.id, store.state.progress);
    });
    const total = Cat.works().length;
    let view = null;
    const q = route.query || {};
    if (route.view === "library") {
      const L = NTI.require("views/library");
      view = html`<${L.Library} store=${store}
        filters=${filters}
        myFiles=${files}
        onSearch=${(q) => setPal(q || true)} />`;
    } else if (route.view === "roadmap") {
      const V = NTI.require("views/roadmap");
      view = html`<${V.Roadmap} store=${store} open=${q.open} />`;
    } else if (route.view === "track") {
      const V = NTI.require("views/track");
      view = html`<${V.Track} id=${route.params.id} store=${store} />`;
    } else if (route.view === "archive") {
      const V = NTI.require("views/archive");
      view = html`<${V.Archive} />`;
    } else if (route.view === "about") {
      const V = NTI.require("views/about");
      view = html`<${V.About} />`;
    } else if (route.view === "read") {
      const V = NTI.require("views/reader");
      view = html`<${V.Reader} id=${route.params.id} store=${store} query=${q} />`;
    } else if (route.view === "course") {
      const V = NTI.require("views/course");
      view = html`<${V.Course} id=${route.params.id} store=${store} />`;
    } else if (route.view === "me") {
      const V = NTI.require("views/me");
      view = html`<${V.Me} store=${store} />`;
    } else if (route.view === "add") {
      const V = NTI.require("views/add");
      view = html`<${V.Add} />`;
    } else {
      const V = NTI.require("views/notfound");
      view = html`<${V.NotFound} store=${store} />`;
    }
    return html`<${Boundary}>
      <${Topbar} route=${route} count=${total}
        onSearch=${() => setPal(true)} />
      <${Strip} tracks=${(Cat.data.tracks || []).slice().sort((a, b) => a.order - b.order)}
        selected=${filters.track || []} counts=${counts}
        onToggle=${(id) => {
          const cur = filters.track || [];
          const next = cur.includes(id) ? cur.filter((x) => x !== id)
            : [...cur, id];
          const nf = Object.assign({}, filters, { track: next });
          setFilters(nf); store.setFilters(nf);
          pushFilterUrl(nf, route.view);
        }} />
      ${route.view === "library" ? (() => {
        const F = NTI.require("ui/filters");
        return html`<${F.Filters} value=${filters} onChange=${(nf) => {
          setFilters(nf); store.setFilters(nf);
          pushFilterUrl(nf, route.view);
        }} />`;
      })() : null}
      ${view}
      <${Bottomnav} route=${route} />
      ${pal ? html`<${Palette} count=${total}
        initialQ=${typeof pal === "string" ? pal : ""}
        onClose=${() => setPal(false)} />` : null}
      ${help ? html`<${HelpModal} onClose=${() => setHelp(false)} />` : null}
    <//>`;
  }
  function HelpModal({ onClose }) {
    const rows = [
      ["/ or Ctrl+K", "Open search"], ["g l", "Go to Library"],
      ["g r", "Go to Roadmap"], ["g m", "Go to Me"],
      ["j / k", "Next / previous row"], ["Enter", "Open focused row"],
      ["[ / ]", "Previous / next work"], ["m", "Toggle done"],
      ["b", "Toggle bookmark"], ["f", "Focus mode"], ["t", "Cycle theme"],
      ["?", "This list"], ["Esc", "Close overlay"],
    ];
    return html`<div class="modal-back" onClick=${onClose}>
      <div class="modal" role="dialog" aria-label="Keyboard shortcuts"
        ref=${(el) => {
          if (el) {
            const first = el.querySelector("button");
            if (first) first.focus();
          }
        }}
        onClick=${(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <ul>${rows.map(([k, v]) => html`<li><code>${k}</code> — ${v}</li>`)}</ul>
        <button class="btn" onClick=${onClose}>Close</button>
      </div></div>`;
  }
  function boot() {
    if (!window.htmPreact || !window.MiniSearch) {
      document.getElementById("app").innerHTML =
        "<p>The library data didn't load. Reload the page.</p>";
      return;
    }
    if (!window.NTI.catalog) {
      document.getElementById("app").innerHTML =
        "<p>The library data didn't load. Reload the page.</p>";
      return;
    }
    const Cat = NTI.require("core/catalog");
    Cat.init();
    const store = NTI.require("core/store");
    const R = NTI.require("core/router");
    R.init();
    NTI.require("core/theme").apply(store.state.settings);
    NTI.require("core/search").build();
    NTI.require("core/dropzone").init(store, NTI.require("core/copy"));
    const K = NTI.require("core/keys");
    const palOpen = () => setPal(true);
    K.on("/", palOpen);
    K.on("g l", () => R.go("#/"));
    K.on("g r", () => R.go("#/roadmap"));
    K.on("g m", () => R.go("#/me"));
    K.on("?", () => {
      const ev = new CustomEvent("nti:help");
      document.dispatchEvent(ev);
    });
    K.on("Escape", () => {
      document.dispatchEvent(new CustomEvent("nti:escape"));
    });
    // Row navigation (j/k) + row actions (m) across list views.
    function rows() {
      return [...document.querySelectorAll(".rows .row a, .jobs .job")];
    }
    K.on("j", () => {
      const r = rows();
      const i = r.indexOf(document.activeElement);
      (r[i + 1] || r[0]).focus();
    });
    K.on("k", () => {
      const r = rows();
      const i = r.indexOf(document.activeElement);
      (r[i - 1] || r[r.length - 1]).focus();
    });
    K.on("m", () => {
      const idm = location.hash.match(/#\/read\/([\w-]+)/);
      if (idm) {
        store.setDone(idm[1], !Cat.isDone(idm[1], store.state.progress));
        return;
      }
      const el = document.activeElement &&
        document.activeElement.closest(".row");
      const btn = el && el.querySelector(".iconbtn");
      if (btn) btn.click();
    });
    K.on("b", () => {
      const idm = location.hash.match(/#\/read\/([\w-]+)/);
      if (idm) store.toggleBookmark(idm[1], null);
    });
    K.on("f", () => {
      if (R.current.view === "read") {
        const b = [...document.querySelectorAll(".readbar button")]
          .find((x) => x.textContent.indexOf("Focus") === 0);
        if (b) b.click();
      }
    });
    // Roadmap arrow traversal (follows the job graph order).
    ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].forEach((key) => {
      K.on(key, () => {
        if (R.current.view !== "roadmap") return;
        const jobs = [...document.querySelectorAll(".roadmap .job")];
        if (!jobs.length) return;
        const i = jobs.indexOf(document.activeElement);
        const fwd = key === "ArrowRight" || key === "ArrowDown";
        const n = i < 0 ? (fwd ? 0 : jobs.length - 1)
          : (i + (fwd ? 1 : -1) + jobs.length) % jobs.length;
        jobs[n].focus();
      });
    });
    K.on("[", () => {
      const l = document.querySelector(".readnav2 a:first-child");
      if (l) l.click();
    });
    K.on("]", () => {
      const l = document.querySelector(".readnav2 a:last-child");
      if (l) l.click();
    });
    K.on("t", () => {
      const cur = store.state.settings.theme;
      const next = cur === "light" ? "dark" : cur === "dark" ? "system" : "light";
      store.setSettings({ theme: next });
      NTI.require("core/theme").apply(store.state.settings);
    });
    R.on(() => render(html`<${Shell} />`,
      document.getElementById("app")));
    render(html`<${Shell} />`, document.getElementById("app"));
  }
  return { boot };
});

// auto-boot (defer guarantees catalog/search-index loaded first)
(function () {
  function ready() {
    try { NTI.require("app").boot(); }
    catch (e) {
      console.error(e);
      document.getElementById("app").innerHTML =
        "<p>The library data didn't load. Reload the page.</p>";
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else ready();
})();
