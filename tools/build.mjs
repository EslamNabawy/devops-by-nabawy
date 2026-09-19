// build.mjs — the one command (content -> site data). Idempotent + incremental.
// Flags: --only content|pdf|css|app --watch --dry-run --report --full
// Exit 0 unless catalog unwritable. Steps log to BUILD-LOG.md, each wrapped.
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FINAL = path.join(path.dirname(ROOT), "NTI-DevOps-FINAL");
const rawArgs = process.argv.slice(2);
const args = {};
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (!a.startsWith("--")) continue;
  const eq = a.indexOf("=");
  if (eq >= 0) args[a.slice(2, eq)] = a.slice(eq + 1);
  else if (rawArgs[i + 1] && !rawArgs[i + 1].startsWith("--")) {
    args[a.slice(2)] = rawArgs[++i];
  } else args[a.slice(2)] = true;
}
const ONLY = args.only || "all";
const DRY = !!args["dry-run"];

const log = [];
function say(s) { log.push(s); console.log(s); }
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    say(`ok ${name} (${Date.now() - t0}ms)${r ? " — " + r : ""}`);
  } catch (err) {
    say(`FAIL ${name}: ${err.message}`);
    log.push(String(err.stack || "").split("\n").slice(0, 4).join("\n"));
  }
}
const run = (name, fns) => ONLY === "all" || ONLY === name || fns.includes(ONLY);

const sha8 = (s) => crypto.createHash("sha256").update(s).digest("hex")
  .slice(0, 8);

async function copyFile(src, dest) {
  if (DRY) return;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function main() {
  const { safeWrite, readJson } = await import("./lib/safe-write.mjs");
  const site = await readJson(path.join(ROOT, "config", "site.json"), {});
  const tracksCfg = await readJson(
    path.join(ROOT, "config", "tracks.json"), { stages: [], tracks: [] });
  let externals = await readJson(
    path.join(ROOT, "config", "external-sites.json"), { sites: [] });
  const slotsCfg = await readJson(
    path.join(ROOT, "config", "expected-pdfs.json"), { slots: [] });
  const overridesCfg = await readJson(
    path.join(ROOT, "config", "pdf-overrides.json"), { overrides: [] });

  // Step 1: externals enrichment (once, 8s timeout, never blocking).
  // Cached in .build-cache.json so rebuilds stay byte-identical;
  // refetch only with --full.
  const cachePath = path.join(ROOT, "content", ".build-cache.json");
  const bcache = await readJson(cachePath, {});
  await step("config", async () => {
    let enriched = 0;
    const useCache = bcache.externals && !args.full;
    for (const s of externals.sites || []) {
      if (useCache && bcache.externals[s.id]) {
        Object.assign(s, bcache.externals[s.id]);
        if (s.enriched) enriched++;
        continue;
      }
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch(s.url, { signal: ctl.signal,
          redirect: "follow" });
        clearTimeout(t);
        const html = await r.text();
        const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1];
        const desc = (html.match(
          /<meta[^>]+name="description"[^>]+content="([^"]+)"/i) || [])[1];
        if (title) {
          const clean = title.replace(/\s*[|\-–—]\s*[^|\-–—]*$/, "").trim();
          if (clean.length >= 3 && clean.length <= 70 &&
              !/^(document|home)$/i.test(clean)) {
            s.title = clean; s.enriched = true; enriched++;
          }
        }
        if (desc && desc.length >= 20 && desc.length <= 160) {
          s.summary = desc;
        }
      } catch { s.enriched = false; }
    }
    bcache.externals = Object.fromEntries((externals.sites || []).map(
      (s) => [s.id, { title: s.title, summary: s.summary,
        enriched: !!s.enriched }]));
    if (!DRY) {
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(bcache, null, 2));
    }
    return `${(externals.sites || []).length} externals` +
      (enriched ? `, ${enriched} enriched` : ", offline defaults kept");
  });

  // Step 2: read manifest, copy non-md refs
  let manifest = { works: [], books: [], assets: [],
    counts: { works: 0 } };
  await step("manifest", async () => {
    try {
      manifest = JSON.parse(await fs.readFile(
        path.join(FINAL, "content.manifest.json"), "utf8"));
    } catch {
      say("warn: content.manifest.json missing — empty catalog build");
    }
    for (const w of manifest.works || []) {
      for (const f of w.formats || []) {
        const src = path.join(FINAL, f.path);
        const ext = (f.path.split(".").pop() || "").toLowerCase();
        if (["md", "markdown", "mdx"].includes(ext)) continue;
        if (ext === "pdf") {
          const nn = w.id.split("-")[1] || "01";
          const slug = w.id.split("-").slice(2).join("-");
          const dest = path.join(ROOT, "content", "pdf", w.track,
            `${w.track}__${nn}-${slug}.pdf`);
          await copyFile(src, dest);
          f.sitePath = path.relative(ROOT, dest).replace(/\\/g, "/");
        } else if (["html", "htm"].includes(ext)) {
          const dest = path.join(ROOT, "content", "html", w.id,
            "index.html");
          await copyFile(src, dest);
          f.sitePath = path.relative(ROOT, dest).replace(/\\/g, "/");
        } else {
          const kind = w.kind === "lab" ? "labs"
            : w.kind === "script" ? "scripts" : "evidence";
          const dest = path.join(ROOT, "content", kind,
            path.basename(f.path));
          await copyFile(src, dest);
          f.sitePath = path.relative(ROOT, dest).replace(/\\/g, "/");
        }
      }
    }
    // Manifest assets (evidence gallery, lab downloads): copy into served
    // dirs and rewrite site paths (F1 — FINAL-relative paths 404 live).
    manifest.siteAssets = [];
    for (const a of manifest.assets || []) {
      const ext = ((a.path || "").split(".").pop() || "").toLowerCase();
      const dir = ["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext)
        ? "evidence" : a.kind === "evidence" ? "evidence"
        : a.kind === "script" ? "scripts" : "labs";
      const dest = path.join(ROOT, "content", dir,
        path.basename(a.path || a.id));
      try {
        await copyFile(path.join(FINAL, a.path || ""), dest);
        manifest.siteAssets.push({ ...a,
          path: path.relative(ROOT, dest).replace(/\\/g, "/") });
      } catch {
        manifest.siteAssets.push({ ...a, path: null });
      }
    }
    return `${manifest.works.length} works, ${manifest.books.length} books`;
  });

  // Steps 3-5: render lessons -> docs/<id>.js
  const docMeta = {}; // id -> {headings, words, minutes, chunks}
  await step("content", async () => {
    if (!(run("content", []))) return "skipped (--only)";
    const { renderMarkdown, sanitize, assignHeadingIds, stripToText,
      kebab } = await import("./lib/md-render.mjs");
    const { chunkText } = await import("./lib/search-index.mjs");
    let n = 0;
    for (const w of manifest.works || []) {
      const mdf = (w.formats || []).find((f) =>
        ["md", "html"].includes(f.type) ||
        /\.(md|markdown|mdx|html?)$/i.test(f.path));
      if (w.kind === "script") {
        const src = path.join(FINAL, (w.formats[0] || {}).path || "");
        let code = "";
        try { code = await fs.readFile(src, "utf8"); } catch { code = ""; }
        const esc = code.replace(/&/g, "&amp;").replace(/</g, "&lt;")
          .slice(0, 200000);
        const html = `<pre class="code" data-lang="${w.formats[0]
          ? w.formats[0].type : "txt"}"><code>${esc}</code></pre>`;
        const js = `window.NTI=window.NTI||{};` +
          `(window.NTI.docs=window.NTI.docs||{})[${JSON.stringify(w.id)}]=` +
          JSON.stringify({ html, toc: [], words: code.split(/\s+/).length,
                           assets: [] }) + ";";
        if (!DRY) {
          await fs.mkdir(path.join(ROOT, "content", "docs"),
            { recursive: true });
          await fs.writeFile(
            path.join(ROOT, "content", "docs", `${w.id}.js`), js);
        }
        docMeta[w.id] = { headings: [], words: 0,
          chunks: chunkText(code).map((text) => ({ text })) };
        n++;
        continue;
      }
      if (!mdf) continue; // pdf-only: viewer path
      const src = path.join(FINAL, mdf.path);
      let raw = "";
      try { raw = await fs.readFile(src, "utf8"); } catch { continue; }
      if (/\.mdx?$/i.test(mdf.path) || /^[^<]*#/.test(raw.slice(0, 2000))) {
        if (raw.startsWith("---\n")) {
          raw = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
        }
      }
      let html = /\.html?$/i.test(mdf.path)
        ? raw.replace(/<script[\s\S]*?<\/script\s*>/gi, "")
        : renderMarkdown(raw);
      html = sanitize(html);
      const { html: withIds, toc } = assignHeadingIds(html);
      const boxed = withIds.replace(/<table[\s\S]*?<\/table>/gi,
        (m) => `<div class="table-scroll">${m}</div>`);
      const words = stripToText(raw).split(/\s+/).filter(Boolean).length;
      const js = `window.NTI=window.NTI||{};` +
        `(window.NTI.docs=window.NTI.docs||{})[${JSON.stringify(w.id)}]=` +
        JSON.stringify({ html: boxed, toc, words, assets: [] }) + ";";
      if (!DRY) {
        await fs.mkdir(path.join(ROOT, "content", "docs"),
          { recursive: true });
        await fs.writeFile(
          path.join(ROOT, "content", "docs", `${w.id}.js`), js);
      }
      w.headings = toc;
      docMeta[w.id] = { headings: toc, words,
        chunks: chunkText(stripToText(raw)).map((text, i) => ({
          anchor: (toc[Math.min(i, toc.length - 1)] || {}).id || null,
          text })) };
      // HTML books: copy intact + parse chapters
      if (w.kind === "book" || /\.html?$/i.test(mdf.path) &&
          (toc.length >= 8)) {
        const dest = path.join(ROOT, "content", "html", w.id,
          "index.html");
        await copyFile(src, dest);
      }
      n++;
    }
    // books html copies + rendered docs (reader treats books as works)
    for (const b of manifest.books || []) {
      const f = (b.formats || [])[0];
      if (f && /\.html?$/i.test(f.path)) {
        await copyFile(path.join(FINAL, f.path),
          path.join(ROOT, "content", "html", b.id, "index.html"));
        try {
          const raw = await fs.readFile(path.join(FINAL, f.path), "utf8");
          let html = raw.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
          html = sanitize(html);
          const { html: withIds, toc } = assignHeadingIds(html);
          const chapters = (b.chapters || []).map((c) => ({
            id: c.anchor || kebab(c.title), text: c.title,
            level: c.level || 1 }));
          const useToc = toc.length >= chapters.length ? toc : chapters;
          const js = `window.NTI=window.NTI||{};` +
            `(window.NTI.docs=window.NTI.docs||{})[${JSON.stringify(b.id)}]=` +
            JSON.stringify({ html: withIds, toc: useToc,
              words: stripToText(raw).split(/\s+/).length,
              assets: [] }) + ";";
          if (!DRY) {
            await fs.writeFile(
              path.join(ROOT, "content", "docs", `${b.id}.js`), js);
          }
          b.headings = useToc;
          docMeta[b.id] = { headings: useToc, words: 0,
            chunks: chunkText(stripToText(raw)).map((text) => ({ text })) };
        } catch { /* book stays viewer-only */ }
      }
    }
    return `${n} docs rendered`;
  });

  // Step 6: PDF pass (ingest inbox + pdf/**)
  const pdfFormats = []; // {workId,...} appended by ingest
  await step("pdf", async () => {
    if (!(ONLY === "all" || ONLY === "pdf" || ONLY === "content")) {
      return "skipped (--only)";
    }
    const { ingestPdfs } = await import("./lib/pdf.mjs");
    const works = [...(manifest.works || []).map((w) => ({
      id: w.id, track: w.track, title: w.title }))];
    const r = await ingestPdfs(ROOT, {
      works, slots: slotsCfg.slots || [],
      overrides: overridesCfg.overrides || [], pdfFormats,
    });
    return r.summary;
  });

  // Step 7: catalog merge
  let catalogJs = "";
  await step("catalog", async () => {
    const byId = new Map();
    const works = [];
    // Books: copy into served locations + rewrite site paths.
    const books = [];
    const { outlineChapters } = await import("./lib/pdf.mjs");
    for (const b of manifest.books || []) {
      const f = (b.formats || [])[0] || {};
      let sitePath = null;
      if (/\.pdf$/i.test(f.path || "")) {
        sitePath = `content/pdf/_books/${b.id.replace(/^book-/, "")
          .slice(0, 50)}.pdf`;
        await copyFile(path.join(FINAL, f.path),
          path.join(ROOT, sitePath));
        if (!(b.chapters || []).length) {
          b.chapters = (await outlineChapters(
            path.join(ROOT, sitePath)).catch(() => [])) || [];
        }
      } else if (/\.html?$/i.test(f.path || "")) {
        sitePath = `content/html/${b.id}/index.html`;
      }
      books.push({ ...b,
        formats: [{ ...f, path: sitePath || f.path }] });
      byId.set(b.id, true);
    }
    for (const w of manifest.works || []) {
      const formats = (w.formats || []).map((f) => {
        if (f.sitePath) {
          return { type: f.type, path: f.sitePath, role: f.role,
                   status: "ready" };
        }
        if (f.type === "pdf") {
          return { type: "pdf", path: f.sitePath || null,
                   role: f.role || "alt", status: "ready" };
        }
        if (["md", "html"].includes(f.type)) {
          return { type: f.type,
                   path: `content/docs/${w.id}.js`, role: f.role,
                   status: "ready",
                   headings: (docMeta[w.id] || {}).headings || [] };
        }
        return { type: f.type, path: f.sitePath || f.path,
                 role: f.role, status: "ready" };
      });
      // pending slots for this work
      for (const s of slotsCfg.slots || []) {
        if (s.forWork === w.id) {
          formats.push({ type: "pdf", path: null, role: "alt",
                         status: "pending", slot: s.id });
        }
      }
      const ready = formats.some((f) => f.status === "ready");
      works.push({ id: w.id, track: w.track, kind: w.kind,
                   title: w.title, summary: w.summary,
                   section: w.section, order: w.order,
                   minutes: w.minutes, tags: w.tags, prereqs: [],
                   addedAt: manifest.generatedAt || null,
                   formats, _ready: ready });
      byId.set(w.id, true);
    }
    // new PDF-only works from ingest (books route to catalog.books)
    for (const pf of pdfFormats) {
      if (byId.has(pf.workId)) {
        const w = works.find((x) => x.id === pf.workId);
        if (w && !w.formats.some((f) => f.path === pf.path)) {
          const wasOnlyPending = w.formats.every((f) =>
            f.status !== "ready");
          w.formats.push({ type: "pdf", path: pf.path,
                           role: wasOnlyPending ? "primary" : "alt",
                           status: "ready", pages: pf.pages,
                           bytes: pf.bytes, cover: pf.cover,
                           textIndexed: pf.textIndexed,
                           sha256: pf.sha256,
                           originalName: pf.originalName });
          w._ready = true;
        }
        continue;
      }
      const nn = pf.workId.split("-")[1] || "99";
      const fmt = { type: "pdf", path: pf.path,
                    role: "primary", status: "ready",
                    pages: pf.pages, bytes: pf.bytes,
                    cover: pf.cover,
                    textIndexed: pf.textIndexed,
                    sha256: pf.sha256,
                    originalName: pf.originalName };
      if (pf.kind === "book") {
        // Same file already listed as a manifest book? (match site path)
        const same = [];
        for (const b of books) {
          for (const bf of b.formats || []) {
            if (bf.path === pf.path) same.push(b);
          }
        }
        if (!same.length) {
          const chaps = await outlineChapters(
            path.join(ROOT, pf.path)).catch(() => []);
          books.push({ id: pf.workId, track: pf.track,
            title: pf.newTitle || pf.workId, authors: [],
            chapters: chaps, formats: [fmt],
            signals: { score: 0, matched: ["ingest-kind"] } });
        }
        byId.set(pf.workId, true);
        continue;
      }
      works.push({ id: pf.workId, track: pf.track, kind: pf.kind,
                   title: pf.newTitle || pf.workId,
                   summary: "", section: "More",
                   order: 1000 + works.length, minutes: pf.minutes,
                   tags: [], prereqs: [],
                   addedAt: manifest.generatedAt || null,
                   formats: [fmt],
                   _ready: true });
      byId.set(pf.workId, true);
    }
    // standalone pending slots (forWork null)
    for (const s of slotsCfg.slots || []) {
      if (!s.forWork && !byId.has(s.id)) {
        works.push({ id: s.id, track: s.track, kind: s.kind || "lesson",
                     title: s.title, summary: s.note || "",
                     section: "More", order: 2000 + works.length,
                     minutes: 0, tags: [], prereqs: [],
                     formats: [{ type: "pdf", path: null, role: "primary",
                                 status: "pending", slot: s.id }],
                     _ready: false });
      }
    }
    const tracks = (tracksCfg.tracks || []).map((t) => {
      const tw = works.filter((w) => w.track === t.id);
      const ready = tw.filter((w) => w._ready);
      return { ...t, counts: {
        works: tw.length, ready: ready.length,
        pendingPdf: (slotsCfg.slots || []).filter((s) =>
          s.track === t.id).length,
        minutes: ready.reduce((a, w) => a + (w.minutes || 0), 0),
        pdfs: ready.filter((w) => w.formats.some((f) =>
          f.type === "pdf" && f.status === "ready")).length } };
    });
    // Inbox + unsorted feed for the Add page (F3 — names only, no parse).
    let inboxWaiting = 0;
    const inboxUnsorted = [];
    try {
      const inboxFiles = await fs.readdir(
        path.join(ROOT, "content", "_inbox"));
      inboxWaiting = inboxFiles.filter((f) => /\.pdf$/i.test(f)).length;
    } catch { /* no inbox */ }
    try {
      const uns = await fs.readdir(
        path.join(ROOT, "content", "pdf", "_unsorted"));
      for (const f of uns.filter((x) => /\.pdf$/i.test(x))) {
        inboxUnsorted.push({ file: f,
          reason: "Track unknown — rename to <track>__name.pdf " +
            "(tracks: linux, aws, docker, kubernetes, terraform, ansible, " +
            "jenkins, cicd, aiops)" });
      }
    } catch { /* none */ }
    const catalog = { schemaVersion: 1,
      generatedAt: manifest.generatedAt || new Date().toISOString(),
      contentVersion: "tmp",
      site, stages: tracksCfg.stages || [], tracks,
      works: works.map(({ _ready, ...w }) => w),
      books,
      externals: (externals.sites || []).map((s) => ({
        id: s.id, track: s.track, title: s.title, summary: s.summary,
        url: s.url, host: (() => { try {
          return new URL(s.url).host; } catch { return ""; } })(),
        badge: "Online", pinned: true })),
      assets: (manifest.siteAssets || manifest.assets || [])
        .filter((a) => a.path),
      inbox: { waiting: inboxWaiting, unsorted: inboxUnsorted },
      slots: (slotsCfg.slots || []).map((s) => {
        const direct = works.find((w) => w.id === s.id &&
          (w.formats || []).some((f) => f.status === "ready"));
        const viaWork = s.forWork && works.find((w) => w.id === s.forWork &&
          (w.formats || []).some((f) => f.type === "pdf" &&
            f.status === "ready"));
        return { ...s, status: (direct || viaWork) ? "ready" : "waiting" };
      }) };
    const ver = sha8(JSON.stringify(catalog));
    catalog.contentVersion = ver;
    catalogJs = `window.NTI=window.NTI||{};\nwindow.NTI.catalog=` +
      JSON.stringify(catalog) + ";";
    if (!DRY) {
      await fs.mkdir(path.join(ROOT, "content"), { recursive: true });
      await fs.writeFile(path.join(ROOT, "content", "catalog.js"),
        catalogJs);
    }
    // stash for search step
    globalThis.__works = works;
    globalThis.__pdfFormats = pdfFormats;
    globalThis.__docMeta = docMeta;
    globalThis.__contentVersion = ver;
    return `${works.length} works, v=${ver}`;
  });

  // Step 8: search tiers
  await step("search", async () => {
    const { tier1Entry, headingEntries } =
      await import("./lib/search-index.mjs");
    const works = globalThis.__works || [];
    const docs = [];
    for (const w of works) {
      docs.push(tier1Entry(w));
      docs.push(...headingEntries(w));
    }
    // Books are first-class searchable works too.
    for (const b of manifest.books || []) {
      const bw = { id: b.id, track: b.track, kind: "book",
        title: b.title, summary: "", tags: [],
        formats: b.formats || [], headings: b.headings || [] };
      docs.push(tier1Entry(bw));
      docs.push(...headingEntries(bw));
    }
    // Externals indexed by title/summary/host (never inside-site claims).
    for (const s of externals.sites || []) {
      let host = "";
      try { host = new URL(s.url).host; } catch { /* keep empty */ }
      docs.push({ id: s.id, ref: s.id, track: s.track, kind: "external",
        title: s.title, summary: s.summary || "", tags: [host, s.track],
        heading: null, format: [] });
    }
    const tier1 = `window.NTI=window.NTI||{};window.NTI.searchIndex=` +
      JSON.stringify({ schemaVersion: 1, docs }) + ";";
    if (!DRY) {
      await fs.writeFile(path.join(ROOT, "content", "search-index.js"),
        tier1);
      const byTrack = {};
      for (const w of works) {
        const meta = (globalThis.__docMeta || {})[w.id];
        // F18: cap Tier2 at 25 chunks/work (worst-case weight control).
        const chunks = ((meta ? meta.chunks : []) || []).slice(0, 25);
        (byTrack[w.track] = byTrack[w.track] || {})[w.id] = { chunks };
      }
      const pdfs = globalThis.__pdfFormats || [];
      for (const pf of pdfs) {
        const chunks = (pf.texts || []).filter((t) => t.length >= 20)
          .slice(0, 60)
          .map((text, i) => ({ page: i + 1,
            text: text.slice(0, 1200) }));
        if (chunks.length) {
          (byTrack[pf.track] = byTrack[pf.track] || {})[pf.workId] =
            { chunks };
        }
      }
      for (const [t, body] of Object.entries(byTrack)) {
        await fs.writeFile(
          path.join(ROOT, "content", `search-bodies-${t}.js`),
          `window.NTI=window.NTI||{};window.NTI.registerBodies(` +
          JSON.stringify(t) + `,` + JSON.stringify(body) + ");");
      }
    }
    return `${docs.length} tier1 docs`;
  });

  // Step 9: CSS concat
  await step("css", async () => {
    if (!(ONLY === "all" || ONLY === "css")) return "skipped (--only)";
    const order = ["tokens.css", "base.css", "components.css",
      "views.css", "print.css"];
    let out = "";
    for (const f of order) {
      try {
        out += `/* ${f} */\n` + await fs.readFile(
          path.join(ROOT, "assets", "css", f), "utf8") + "\n";
      } catch { /* keep going */ }
    }
    if (!DRY) {
      await fs.writeFile(path.join(ROOT, "assets", "site.css"), out);
    }
    return `${out.length} bytes`;
  });

  // Step 10: app concat
  await step("app", async () => {
    if (!(ONLY === "all" || ONLY === "app")) return "skipped (--only)";
    const man = JSON.parse(await fs.readFile(
      path.join(ROOT, "src", "manifest.json"), "utf8"));
    let out = "";
    for (const f of man.order) {
      try {
        out += `\n/* ${f} */\n` + await fs.readFile(
          path.join(ROOT, "src", f), "utf8");
      } catch (e) {
        say(`warn: src missing ${f}`);
      }
    }
    if (!DRY) {
      await fs.writeFile(path.join(ROOT, "assets", "app.js"), out);
      await fs.writeFile(path.join(ROOT, "assets", "app.js.map"),
        JSON.stringify({ version: 3, sources: man.order,
                         mappings: "" }));
    }
    return `${out.length} bytes`;
  });

  // Step 11: shell regen with ?v=
  await step("shell", async () => {
    const v = globalThis.__contentVersion || "dev";
    let sprite = "";
    try {
      sprite = await fs.readFile(path.join(ROOT, "assets", "icons.svg"),
        "utf8");
    } catch { /* keep going */ }
    const html = `<!DOCTYPE html>
<html lang="en" data-theme="system" data-density="comfortable" data-reading="1" data-motion="system">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DevOps By Nabawy</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="assets/site.css?v=${v}">
<script>
try {
  var s = JSON.parse(localStorage.getItem("nti.v1.settings") || "{}");
  var h = document.documentElement;
  if (s.theme) h.setAttribute("data-theme", s.theme);
  if (s.density) h.setAttribute("data-density", s.density);
  if (typeof s.readingSize !== "undefined") h.setAttribute("data-reading", String(s.readingSize));
  if (s.reduceMotion) h.setAttribute("data-motion", s.reduceMotion);
} catch (e) {}
</script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<div style="display:none" aria-hidden="true">${sprite}</div>
<div id="app"></div>
<main id="main"></main>
<div id="live" class="sr-only" aria-live="polite"></div>
<script defer src="assets/vendor/preact-htm.umd.js?v=${v}"><\/script>
<script defer src="assets/vendor/minisearch.umd.js?v=${v}"><\/script>
<script defer src="content/catalog.js?v=${v}"><\/script>
<script defer src="content/search-index.js?v=${v}"><\/script>
<script defer src="assets/app.js?v=${v}"><\/script>
</body>
</html>
`;
    if (!DRY) await fs.writeFile(path.join(ROOT, "index.html"), html);
    return `v=${v}`;
  });

  // Step 12: verify
  await step("verify", async () => {
    if (DRY) return "dry-run";
    const { execFile } = await import("node:child_process");
    return await new Promise((resolve) => {
      execFile(process.execPath,
        [path.join(ROOT, "tools", "verify.mjs")], (err, stdout) => {
          say((stdout || "").trim().split("\n").slice(-12).join("\n"));
          resolve(err ? "verify FAILURES (see above)" : "verify passed");
        });
    });
  });

  await safeWriteDontFail(safeWrite,
    path.join(ROOT, "BUILD-LOG.md"),
    `# BUILD-LOG\n\nDate: ${new Date().toISOString()}\n\n` +
    log.map((l) => `- ${l}`).join("\n") + "\n");
}

async function safeWriteDontFail(safeWrite, file, content) {
  try { await safeWrite(file, content); } catch (e) {
    console.log("could not write BUILD-LOG: " + e.message);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("catalog could not be written: " + e.message);
  process.exit(1);
});
