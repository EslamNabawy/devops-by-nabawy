// course.js — P05 external course view (no iframe): sandbox state,
// verified link, track syllabus, cached offline snapshots, finish toggle.
NTI.define("views/course", function () {
  const { html } = window.htmPreact;
  function Course({ id, store }) {
    const Cat = NTI.require("core/catalog");
    const copy = NTI.require("core/copy");
    const R = NTI.require("core/router");
    const e = ((Cat.data.externals || []).find((x) => x.id === id));
    if (!e) {
      R.go("#/404");
      return null;
    }
    const t = (Cat.data.tracks || []).find((x) => x.id === e.track) || {};
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    const https = /^https:/i.test(e.url || "");
    const items = Cat.byTrack(e.track).filter((w) => Cat.ready(w));
    const secs = [];
    (t.sections || []).forEach((name) => {
      const n = items.filter((w) => (w.section || "More") === name).length;
      if (n) secs.push([name, n]);
    });
    const snaps = items.filter((w) =>
      ["lesson", "lab", "script", "reference"].includes(w.kind)).slice(0, 4);
    const done = Cat.isDone(e.id, store.state.progress);
    return html`<div class="view" data-track=${e.track}>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="#/">${copy.crumbTracks}</a><span> / </span>
        <a href="#/track/${e.track}">${t.title || e.track}</a>
        <span> / </span><span>${copy.courseView}</span>
      </nav>
      <p class="eyebrow">${copy.courseEyebrow}</p>
      <h1 class="hero-display" dir="auto">${e.title}</h1>
      <p class="lede" dir="auto">${e.summary || ""}</p>
      <section class="hero" aria-label=${copy.sandboxState}>
        <p class="eyebrow">${copy.sandboxState}</p>
        <p>
          <span class="pill">${online ? copy.sandboxLoaded : copy.sandboxOffline}</span>
          <span class="pill">${copy.blockedEmbed}</span>
          ${https ? html`<span class="pill">${copy.httpsVerified}</span>` : null}
        </p>
        <p class="muted">${copy.embedNote}</p>
        <p class="muted" dir="auto">${e.host || ""}</p>
        <p class="hero-cta">
          <a class="btn btn-primary" href=${e.url} target="_blank" rel="noopener noreferrer">${copy.openNewTab}</a>
          <button class="btn" onClick=${() => {
            store.setDone(e.id, !done);
            NTI.require("ui/primitives").toast(done ? copy.removed : copy.markedDone);
          }}>${done ? copy.courseDone + " ✓" : copy.finishCourse}</button>
        </p>
      </section>
      ${secs.length ? html`<section aria-label=${copy.syllabusTitle}>
        <h2>${copy.syllabusTitle}</h2>
        <ol class="rows">${secs.map(([name, n], i) => html`<li class="row rownum">
          <span class="num">${i + 1}</span>
          <span class="row-t"><strong dir="auto">${name}</strong>
          <span class="muted">${n} cached ${n === 1 ? "item" : "items"}</span></span>
        </li>`)}</ol>
      </section>` : null}
      ${snaps.length ? html`<section aria-label=${copy.offlineSnapshots}>
        <h2>${copy.offlineSnapshots}</h2>
        <ul class="cards">${snaps.map((w) => html`<li class="card" data-track=${w.track}>
          <a href="#/read/${w.id}">
            <span class="eyebrow">${t.title || w.track}</span>
            <strong dir="auto">${w.title}</strong>
            <span class="cardfoot"><span class="pill">${w.kind}</span>
              ${w.minutes ? html`<span class="muted">${w.minutes} min</span>` : null}</span>
          </a>
        </li>`)}</ul>
        <p class="hint">${copy.preIndexed}</p>
      </section>` : null}
      <p><a class="btn" href="#/track/${e.track}">${copy.backTo(t.title || e.track)}</a></p>
    </div>`;
  }
  return { Course };
});
