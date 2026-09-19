// about.js — P13 about and help.
NTI.define("views/about", function () {
  const { html } = window.htmPreact;
  function About() {
    const Cat = NTI.require("core/catalog");
    const copy = NTI.require("core/copy");
    const v = (Cat.data && Cat.data.contentVersion) || "";
    return html`<div class="view">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="#/">Home</a><span> / </span><span>${copy.aboutTitle}</span>
      </nav>
      <p class="eyebrow">${copy.aboutEyebrow}</p>
      <h1 class="hero-display">${copy.aboutTitle}</h1>
      <p class="lede">${copy.aboutBody}</p>
      <p><span class="pill">${copy.versionLabel(v || "local")}</span></p>
      <section aria-label="Motivation">
        <h2>${copy.motivationTitle}</h2>
        <p>${copy.motivationBody}</p>
        <p>
          <span class="pill">${copy.worksOffline}</span>
          <span class="pill">${copy.localPrivate}</span>
        </p>
      </section>
      <section aria-label="Pillars">
        <h2>Three core pillars</h2>
        <ol class="cards">
          <li class="card"><div class="pad">
            <strong>${copy.pillarOffline}</strong>
            <p class="muted">${copy.pillarOfflineBody}</p></div></li>
          <li class="card"><div class="pad">
            <strong>${copy.pillarUntethered}</strong>
            <p class="muted">${copy.pillarUntetheredBody}</p></div></li>
          <li class="card"><div class="pad">
            <strong>${copy.pillarNti}</strong>
            <p class="muted">${copy.pillarNtiBody}</p></div></li>
        </ol>
      </section>
      <section aria-label=${copy.aboutTitle}>
        <h2>${copy.aboutTitle}</h2>
        <ul>
          <li>${copy.aboutOpen}</li>
          <li>${copy.aboutVerified}</li>
          <li>${copy.aboutStatic}</li>
        </ul>
        <p class="hero-cta">
          <a class="btn btn-primary" href="#/roadmap">${copy.openRoadmap}</a>
          <a class="btn" href="#/archive">${copy.archiveTitle}</a>
        </p>
      </section>
      <p class="hint">${copy.libraryInfo}</p>
    </div>`;
  }
  return { About };
});
