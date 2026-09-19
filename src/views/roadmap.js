// roadmap.js — pipeline graph, connectors, drawer, the run.
NTI.define("views/roadmap", function () {
  const { html, Component } = window.htmPreact;
  class Roadmap extends Component {
    constructor(p) {
      super(p);
      this.state = { open: p.open || null, ran: false };
    }
    componentDidMount() {
      let ran = false;
      try { ran = sessionStorage.getItem("nti.roadmap.ran") === "1"; } catch {}
      if (ran) { this.setState({ ran: true }); return; }
      const A = NTI.require("core/a11y");
      if (!A.reducedMotion(NTI.require("core/store"))) {
        setTimeout(() => {
          this.setState({ ran: true });
          try { sessionStorage.setItem("nti.roadmap.ran", "1"); } catch {}
        }, 60);
      } else {
        this.setState({ ran: true });
        try { sessionStorage.setItem("nti.roadmap.ran", "1"); } catch {}
      }
    }
    render({ store }, s) {
      const Cat = NTI.require("core/catalog");
      const copy = NTI.require("core/copy");
      const stages = (Cat.data.stages || []).slice()
        .sort((a, b) => a.order - b.order);
      const tmap = {};
      (Cat.data.tracks || []).forEach((t) => { tmap[t.id] = t; });
      const counts = {};
      Object.keys(tmap).forEach((id) => {
        counts[id] = Cat.counts(id, store.state.progress);
      });
      const rec = Cat.recommendedTrack(store.state.progress);
      const R = NTI.require("core/router");
      const ids = Object.keys(tmap);
      const withWorks = ids.filter((id) =>
        (counts[id] || { total: 0 }).total > 0);
      const doneTracks = withWorks.filter((id) =>
        counts[id].done >= counts[id].total).length;
      const remaining = withWorks.length - doneTracks;
      return html`<div class="view roadmap ${s.ran ? "ran" : "run"}">
        <p class="eyebrow">${copy.journeyEyebrow}</p>
        <h1 class="hero-display">${copy.journeyTitle}</h1>
        <p class="lede">${copy.journeyBody}</p>
        <p class="hint">${copy.savedLocal}</p>
        <section class="stats" aria-label=${copy.overallProgress}>
          <div><strong>${doneTracks} of ${withWorks.length}</strong>
            <span class="muted">${copy.overallProgress.toLowerCase()} · ${copy.tracksRemaining(remaining)}</span></div>
          ${rec ? html`<div><span class="eyebrow">${copy.nextUp}</span>
            <strong>${rec.title}</strong>
            <span class="muted">${rec.summary || ""}</span>
            <p><a class="btn btn-primary" href="#/track/${rec.id}">${copy.openTrack}</a></p>
          </div>` : null}
        </section>
        <section class="mapkey" aria-label=${copy.mapKey}>
          <h2>${copy.mapKey}</h2>
          <p><span class="pill">${copy.statusDone}</span>
            <span class="pill">${copy.statusProgress}</span>
            <span class="pill">${copy.statusTodo}</span></p>
        </section>
        <ol class="stages">
        ${stages.map((st) => html`<li class="stage">
          <h2>${st.title}</h2>
          <ol class="jobs">${(st.tracks || []).map((tid) => {
            const t = tmap[tid];
            if (!t) return null;
            const c = counts[tid] || { done: 0, total: 0 };
            const here = rec && rec.id === tid;
            const st = c.total && c.done >= c.total ? copy.statusDone
              : c.done > 0 ? copy.statusProgress : copy.statusTodo;
            return html`<li><button class="job ${here ? "here" : ""}"
              data-track=${tid}
              onClick=${() => this.setState({ open: tid })}
              onKeyDown=${(e) => {
                if (e.key === "Enter") this.setState({ open: tid });
              }}>
              <span class="dot"></span><strong>${t.title}</strong>
              <span class="n">${c.done}/${c.total}</span>
              <span class="pill">${st}</span>
              ${here ? html`<span class="here-tag">Continue here</span>` : null}
            </button></li>`;
          })}</ol></li>`)}
        </ol>
        ${s.open ? html`<${Drawer} trackId=${s.open} store=${store}
          onClose=${() => {
            const tid = s.open;
            this.setState({ open: null });
            requestAnimationFrame(() => {
              const b = document.querySelector(`.job[data-track="${tid}"]`);
              if (b) b.focus();
            });
          }} />` : null}
      </div>`;
    }
  }
  function Drawer({ trackId, store, onClose }) {
    const Cat = NTI.require("core/catalog");
    const t = (Cat.data.tracks || []).find((x) => x.id === trackId);
    const R = NTI.require("core/router");
    const A = NTI.require("core/a11y");
    const ref = (el) => {
      if (el) {
        if (ref._untrap) ref._untrap();
        ref._untrap = A.trapFocus(el);
        const first = el.querySelector("button,a");
        if (first) first.focus();
      }
    };
    window.htmPreact.useEffect(() => {
      const onKey = (e) => {
        if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      };
      document.addEventListener("keydown", onKey, true);
      return () => document.removeEventListener("keydown", onKey, true);
    }, []);
    const items = Cat.byTrack(trackId);
    const exts = ((Cat.data.externals || []).filter((e) =>
      e.track === trackId));
    const next = Cat.nextWork(trackId, store.state.progress);
    return html`<div class="modal-back" onClick=${onClose}>
      <div class="drawer modal" role="dialog" aria-label=${t ? t.title : trackId}
        ref=${ref} onClick=${(e) => e.stopPropagation()}>
        <h2>${t ? t.title : trackId}</h2>
        ${next ? html`<button class="btn btn-primary" onClick=${() => {
          onClose(); R.go(`#/read/${next.id}`);
        }}>${store.state.progress[next.id] ? "Continue" : "Start"}: ${next.title}</button>` : null}
        <ol>
        ${exts.map((e) => html`<li>
          <a href="#/course/${e.id}" onClick=${() => onClose()}>${e.title} (Online course)</a>
          <a href="${e.url}" target="_blank" rel="noopener noreferrer" aria-label="Open ${e.title} in new tab">↗</a>
        </li>`)}
        ${items.map((w) => html`<li>
          <a href="#/read/${w.id}" onClick=${() => onClose()}>${Cat.plain(w.title)}</a>
          <span class="muted">${Cat.isDone(w.id, store.state.progress) ? "✓" : ""}</span>
        </li>`)}</ol>
        <button class="btn" onClick=${onClose}>Close</button>
      </div></div>`;
  }
  return { Roadmap };
});
