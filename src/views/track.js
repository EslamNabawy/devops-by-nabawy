// track.js — track page: Continue, sections, screenshots gallery.
NTI.define("views/track", function () {
  const { html } = window.htmPreact;
  const { ProgressRing } = NTI.require("ui/status");
  function Track({ id, store }) {
    const Cat = NTI.require("core/catalog");
    const copy = NTI.require("core/copy");
    const t = (Cat.data.tracks || []).find((x) => x.id === id);
    if (!t) {
      NTI.require("core/router").go("#/404");
      return null;
    }
    const items = Cat.byTrack(id);
    const c = Cat.counts(id, store.state.progress);
    const next = Cat.nextWork(id, store.state.progress);
    const R = NTI.require("core/router");
    const shots = ((Cat.data.assets || []).filter((a) =>
      a.track === id && a.kind === "evidence"));
    const exts = ((Cat.data.externals || []).filter((e) => e.track === id));
    const CMDS = id === "terraform" ? [
      ["terraform init -upgrade", "Downloads providers, configures backend"],
      ["terraform plan -out=tfplan", "Preview exactly what will run"],
      ["terraform apply tfplan", "Run the saved plan"],
      ["terraform destroy", "Safe teardown with confirm"],
      ["terraform state list", "List addresses in state"],
      ["terraform fmt -recursive -check", "Pre-commit style gate"],
      ["terraform plan -refresh-only", "Drift audit without edits"],
    ] : id === "docker" ? [
      ["docker build -t app:local .", "Build image from Dockerfile"],
      ["docker run --rm -p 8080:80 app:local", "Run container, remove on stop"],
      ["docker ps -a", "List containers"],
      ["docker compose up --build", "Build and start the stack"],
    ] : id === "kubernetes" ? [
      ["kubectl get pods -A", "List pods everywhere"],
      ["kubectl describe pod <name>", "Inspect one pod"],
      ["kubectl apply -f deploy.yaml", "Apply manifests"],
      ["helm list -A", "List releases"],
    ] : [];
    const copyCmd = (cmd) => {
      const done = () => NTI.require("ui/primitives")
        .toast(NTI.require("core/copy").copied);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cmd).then(done, done);
      } else { done(); }
    };
    const secs = [];
    for (const w of items) {
      let s = secs.find((x) => x.name === (w.section || "More"));
      if (!s) { s = { name: w.section || "More", items: [] }; secs.push(s); }
      s.items.push(w);
    }
    const stage = (Cat.data.stages || []).find((x) => x.id === t.stage);
    const ordered = (Cat.data.tracks || []).slice()
      .sort((a, b) => a.order - b.order);
    const upNext = ordered[ordered.findIndex((x) => x.id === id) + 1] || null;
    const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
    let bundleBytes = 0;
    items.forEach((w) => {
      (w.formats || []).forEach((f) => {
        if (f.status === "ready" && f.bytes) bundleBytes += f.bytes;
      });
    });
    const mb = (b) => b > 0 ? (b / 1048576).toFixed(1) + " MB" : "";
    return html`<div class="view" data-track=${id}>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="#/">${copy.crumbTracks}</a><span> / </span><span>${t.title}</span>
      </nav>
      <section class="hero hero-track" aria-label=${t.title}>
        <p class="eyebrow">${exts.length ? copy.interactiveTrack : (stage ? stage.title : "")}</p>
        <h1>${t.title}</h1>
        <p class="muted">${t.summary || ""}</p>
        <p class="hero-cta">
          ${next ? html`<button class="btn btn-primary" onClick=${() =>
            R.go(`#/read/${next.id}`)}>${copy.continueBtn}: ${next.title}</button>`
          : items.length ? html`<span class="muted">All done.</span>`
          : null}
          <a class="btn" href="#/roadmap">${copy.openRoadmap}</a>
        </p>
        <${ProgressRing} done=${c.done} total=${c.total} />
        <p><strong>${pct}%</strong>
          <span class="muted">${c.done} of ${c.total} read${bundleBytes ? ` · ${copy.bundleSize(mb(bundleBytes).replace(" MB", ""))}` : ""} · ${copy.worksOffline}</span></p>
      </section>
      ${exts.length ? html`<section aria-label=${copy.onlineCourse}>
        <h2>${copy.onlineCourse}</h2>
        <ul class="rows">${exts.map((e) => html`<li class="row">
          <span class="row-t"><strong>${e.title}</strong>
          <span class="muted">${e.host} · ${!navigator.onLine ? copy.needsInternet : copy.requiresInternet}</span></span>
          <a class="btn btn-primary" href="#/course/${e.id}">${copy.courseView}</a>
          <a class="btn" href=${e.url} target="_blank" rel="noopener noreferrer">${copy.openNewTab}</a></li>`)}</ul>
      </section>` : null}
      ${!items.length && !exts.length ? html`<section>
        <h2>${copy.nothingHere}</h2><p>${copy.nothingHereBody}</p>
        <a class="btn" href="#/">${copy.backToLibrary}</a>
      </section>` : null}
      ${CMDS.length ? html`<section aria-label=${copy.cmdDeckTitle}>
        <h2>${copy.cmdDeckTitle}</h2>
        <p class="muted">${copy.cmdDeckBody}</p>
        <ul class="rows">${CMDS.map(([cmd, what]) => html`<li class="row">
          <span class="row-t"><strong><code>${cmd}</code></strong>
          <span class="muted">${what}</span></span>
          <button class="btn" onClick=${() => copyCmd(cmd)}>${copy.copyCmd}</button>
        </li>`)}</ul>
      </section>` : null}
      ${id === "cicd" ? html`<section aria-label=${copy.studyDeckTitle}>
        <h2>${copy.studyDeckTitle}</h2>
        <p class="muted">${copy.studyDeckBody}</p>
      </section>` : null}
      ${secs.map((s) => html`<section><h2>${s.name}</h2><ul class="rows">
        ${s.items.map((w) => {
          const done = Cat.isDone(w.id, store.state.progress);
          const reading = !!store.state.progress[w.id];
          const pdf = (w.formats || []).find((f) => f.type === "pdf" &&
            f.status === "ready");
          const bits = [];
          if (w.minutes) bits.push(`${w.minutes} min`);
          if (pdf && pdf.pages) bits.push(`${pdf.pages} pages`);
          if (pdf && pdf.bytes) bits.push(mb(pdf.bytes));
          const st = done ? copy.statusDone
            : reading ? copy.statusProgress : copy.statusTodo;
          const act = done ? copy.readAgain
            : reading ? copy.continueReading : copy.startReading;
          return html`<li class="row rownum"><a href="#/read/${w.id}">
            <span class="num">${w.order}</span>
            <span class="row-t"><strong dir="auto">${w.title}</strong>
            <span class="muted">${bits.join(" · ")} · ${w.kind}</span></span>
            <span class="pill">${st}</span>
            <span class="kind">${act}</span></a></li>`;
        })}</ul></section>`)}
      ${!items.length && exts.length ? html`<section>
        <h2>${copy.suggestedOrder}</h2>
        <p class="muted">${copy.studyDeckBody}</p>
      </section>` : null}
      ${shots.length ? html`<section aria-label="Screenshots"><h2>Screenshots</h2>
        <div class="shots">${shots.map((a) => html`<a href="${a.path}" target="_blank" rel="noopener noreferrer">
          <img src="${a.path}" alt="${a.title}" loading="lazy" />
          <span>${a.title}</span></a>`)}</div></section>` : null}
      ${upNext ? html`<section aria-label=${copy.upNext}>
        <p class="eyebrow">${copy.upNext}</p>
        <h2>${upNext.title}</h2>
        <p><a class="btn" href="#/track/${upNext.id}">${copy.openTrack}</a></p>
      </section>` : null}
    </div>`;
  }
  return { Track };
});
