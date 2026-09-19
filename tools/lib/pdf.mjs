// pdf.mjs — Stage 3b ingest: inbox -> content/pdf/, attach/create, covers,
// per-page text, slots resolution. Idempotent via .ingest-ledger.json.
// Every file wrapped in try/catch; one bad PDF never blocks others.
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { safeWrite, readJson } from "./safe-write.mjs";

const TRACKS = ["linux", "aws", "docker", "kubernetes", "terraform",
  "ansible", "jenkins", "cicd", "aiops"];
const KIND_RE = {
  book: /book/i,
  lab: /lab|exercise|practice|hands-?on|workshop/i,
  reference: /cheat\s?sheet|reference|glossary|syllabus|summary/i,
};

function normTitle(s) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(lecture|lesson|day|session|slides|pdf|notes|copy|final|v\d+)\b/gi, " ")
    .replace(/[^a-z0-9\u0600-\u06ff ]+/g, " ").replace(/\s+/g, " ").trim();
}

function toks(s) {
  const stop = new Set("the a an and or of to in on for with is are".split(" "));
  return normTitle(s).split(" ").filter((w) => w.length > 2 && !stop.has(w));
}

function fuzzy(a, b) {
  const A = new Set(toks(a)), B = new Set(toks(b));
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((x) => B.has(x)).length;
  const jac = inter / (A.size + B.size - inter);
  const tri = (s) => {
    const t = new Set();
    const x = `#${s}#`;
    for (let i = 0; i < x.length - 2; i++) t.add(x.slice(i, i + 3));
    return t;
  };
  const TA = tri(normTitle(a)), TB = tri(normTitle(b));
  const ti = [...TA].filter((x) => TB.has(x)).length;
  const dice = (2 * ti) / (TA.size + TB.size || 1);
  return 0.6 * jac + 0.4 * dice;
}

function trackByKeywords(name, title, outline, sample) {
  const kws = {
    linux: ["linux", "rhel", "bash", "shell", "systemd"],
    aws: ["aws", "amazon", "ec2", "s3", "iam", "vpc"],
    docker: ["docker", "container", "compose", "podman"],
    kubernetes: ["kubernetes", "k8s", "kubectl", "helm"],
    terraform: ["terraform", "opentofu", "tfstate"],
    ansible: ["ansible", "playbook", "galaxy"],
    jenkins: ["jenkins", "groovy"],
    cicd: ["cicd", "continuous", "pipeline", "gitops", "devops"],
    aiops: ["aiops", "sre", "observability", "prometheus", "grafana"],
  };
  const scores = {};
  const count = (text, w) => {
    const t = ` ${text.toLowerCase()} `;
    let s = 0;
    for (const k of kws[w] || []) s += t.split(k).length - 1;
    return s;
  };
  for (const t of TRACKS) {
    scores[t] = 3 * count(name, t) + 3 * count(title, t) +
      2 * count(outline, t) + count(sample, t);
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] >= 4 && ranked[0][1] >= 1.5 * (ranked[1][1] || 0)) {
    return ranked[0][0];
  }
  return null;
}

export async function ingestPdfs(root, ctx) {
  // ctx: { works, slots, overrides, ledger, report[], catalog updates }
  const t0 = Date.now();
  const inbox = path.join(root, "content", "_inbox");
  const pdfDir = path.join(root, "content", "pdf");
  const ledger = await readJson(
    path.join(root, "content", ".ingest-ledger.json"), {});
  const cachePath = path.join(root, "content", ".pdf-text-cache.json");
  const cache = await readJson(cachePath, {});
  ctx.cache = cache;
  ctx.cachePath = cachePath;
  ctx.cacheDirty = false;
  const report = [];
  const found = [];

  async function* walk(dir, skipNames = []) {
    try {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (skipNames.includes(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* walk(p);
        else if (/\.pdf$/i.test(e.name)) yield p;
      }
    } catch { /* missing dir */ }
  }
  for await (const p of walk(inbox, ["_processed"])) found.push(p);
  for await (const p of walk(pdfDir)) {
    if (p.includes("_versions")) continue;
    found.push(p);
  }

  let n = 0;
  for (const file of found) {
    n++;
    if (n % 10 === 0) console.log(`pdf: ${n}/${found.length}…`);
    try {
      await ingestOne(root, file, ctx, ledger, report);
    } catch (err) {
      report.push({ file: path.basename(file), result: "rejected",
                    notes: String(err.message || err).slice(0, 120) });
    }
  }
  // move processed inbox originals is done inside ingestOne
  await safeWrite(path.join(root, "content", ".ingest-ledger.json"),
    JSON.stringify(ledger, null, 2));
  if (ctx.cacheDirty) await safeWrite(ctx.cachePath,
    JSON.stringify(ctx.cache));
  const added = report.filter((r) => r.result === "new").length;
  const attached = report.filter((r) => r.result === "attached").length;
  const rejected = report.filter((r) => r.result === "rejected").length;
  const unsorted = report.filter((r) => r.result === "needs a track").length;
  const summary = `Added ${added}, attached ${attached}, ` +
    `needs a track ${unsorted}, rejected ${rejected}.`;
  const md = `# INGEST-REPORT\n\n| File | Result | Track | Work | ` +
    `Format | Pages | Notes |\n|---|---|---|---|---|---|---|\n` +
    report.map((r) => `| ${r.file} | ${r.result} | ${r.track || "–"} | ` +
      `${r.work || "–"} | ${r.format || "–"} | ${r.pages ?? "–"} | ` +
      `${r.notes || ""} |`).join("\n") + `\n\n**${summary}**\n`;
  await safeWrite(path.join(root, "INGEST-REPORT.md"), md);
  console.log(summary);
  return { report, summary };
}

async function ingestOne(root, file, ctx, ledger, report) {
  const name = path.basename(file);
  const buf = await fs.readFile(file);
  if (!buf.length || buf.slice(0, 5).toString() !== "%PDF-") {
    report.push({ file: name, result: "rejected", notes: "not a PDF" });
    return;
  }
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (ledger[sha]) {
    report.push({ file: name, result: "Already added",
                  work: ledger[sha].workId, notes: "duplicate content" });
    // Incremental builds must still feed Tier 2 + catalog attaches:
    // replay cached format metadata.
    const hit = ctx.cache[sha];
    if (hit && hit.format && ledger[sha].workId) {
      ctx.pdfFormats.push({ workId: ledger[sha].workId, ...hit.format,
        texts: hit.texts || [] });
    }
    await moveToProcessed(root, file);
    return;
  }
  let info = { pages: 0, title: "", author: "", outline: [], texts: [] };
  // pdfjs extraction flakes on some files (process-dependent) — retry once.
  for (let attempt = 0; attempt < 2 && !info.pages; attempt++) {
  try {
    // NOTE: import inner lib directly — package index runs a debug
    // self-test on load under ESM (!module.parent) and crashes.
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default ||
      (await import("pdf-parse/lib/pdf-parse.js"));
    const parse = typeof pdfParse === "function" ? pdfParse
      : pdfParse.default;
    // Per-page texts via pagerender collector (data.text join order is
    // not a reliable page split).
    const pages = [];
    const data = await parse(buf, { max: 400,
      pagerender: async (pageData) => {
        try {
          const tc = await pageData.getTextContent();
          pages.push((tc.items || []).map((i) => i.str || "")
            .join(" ").replace(/\s+/g, " ").trim());
        } catch { pages.push(""); }
        return "";
      } });
    info.pages = data.numpages;
    info.title = (data.info && data.info.Title) || "";
    info.author = (data.info && data.info.Author) || "";
    info.texts = pages.length ? pages : (data.text || "").split("")
      .map((t) => t.replace(/\s+/g, " ").trim());
    // Drop pdf2htmlEX-wrapper noise (embedded CSS / base64 font blobs):
    // a page is junk when it mentions the wrapper or carries a 200+ char
    // token run (base64) covering >40% of its text.
    info.texts = info.texts.map((t) => {
      if (/pdf2htmlEX/i.test(t)) return "";
      const long = (t.match(/[A-Za-z0-9+/=]{200,}/g) || [])
        .reduce((a, m) => a + m.length, 0);
      if (t.length > 500 && long / t.length > 0.4) return "";
      return t;
    });
    } catch {
      info.pages = 0;
    }
  }
  const ov = (ctx.overrides || []).find((o) =>
    (o.match.file && o.match.file.toLowerCase() === name.toLowerCase()) ||
    (o.match.sha256 && o.match.sha256 === sha) ||
    (o.match.glob && new RegExp("^" + o.match.glob.replace(/\*/g, ".*") +
      "$", "i").test(name)));
  let track = ov && ov.track;
  const rel = path.relative(path.join(root, "content", "pdf"), file);
  if (!track && TRACKS.includes(rel.split(path.sep)[0])) {
    track = rel.split(path.sep)[0];
  }
  if (!track) {
    const m = name.match(/^(linux|aws|docker|k8s|kubernetes|terraform|tf|ansible|jenkins|cicd|aiops)[-_]/i);
    if (m) {
      track = { k8s: "kubernetes", tf: "terraform" }[m[1].toLowerCase()] ||
        m[1].toLowerCase();
    }
  }
  if (!track) {
    track = trackByKeywords(name, info.title,
      info.outline.join(" "), info.texts.slice(0, 3).join(" "));
  }
  if (ov && ov.ignore) {
    report.push({ file: name, result: "ignored",
                  notes: "matched ignore override" });
    return;
  }
  if (!track) {
    const dest = path.join(root, "content", "pdf", "_unsorted", name);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(file, dest);
    ledger[sha] = { file: dest, workId: null, ingestedAt: new Date().toISOString() };
    report.push({ file: name, result: "needs a track",
                  notes: "Rename to <track>__name.pdf" });
    await moveToProcessed(root, file);
    return;
  }

  // attach vs create
  const works = ctx.works.filter((w) => w.track === track);
  let target = null, how = "";
  const canon = name.match(/^([a-z]+)__(\d+)-(.+)\.pdf$/i);
  if (canon) {
    const id = `${track}-${canon[2]}-${canon[3].toLowerCase()}`;
    target = works.find((w) => w.id === id) || null;
    how = target ? "exact id" : "new (canonical name)";
  }
  if (!target && ov && ov.forWork) {
    target = ctx.works.find((w) => w.id === ov.forWork) || null;
    how = "override";
  }
  if (!target) {
    const slot = (ctx.slots || []).find((s) =>
      (s.file && s.file.toLowerCase() === name.toLowerCase()) ||
      (s.forWork && works.some((w) => w.id === s.forWork)));
    if (slot && slot.forWork) {
      target = works.find((w) => w.id === slot.forWork) || null;
      how = `slot ${slot.id}`;
    } else if (slot && !slot.forWork) {
      // Standalone pending slot with matching filename: the arriving PDF
      // resolves it — the new work adopts the slot's id.
      ctx.slotStandalone = { slot, name };
      how = `slot ${slot.id}`;
    }
  }
  if (!target) {
    let best = null, bestScore = 0, second = 0;
    for (const w of works) {
      const s = fuzzy(name.replace(/\.pdf$/i, ""), w.title);
      if (s > bestScore) { second = bestScore; bestScore = s; best = w; }
      else if (s > second) second = s;
    }
    const numM = name.match(/(\d+)/);
    if (best && (bestScore >= 0.72 && bestScore - second >= 0.10)) {
      target = best; how = `fuzzy ${bestScore.toFixed(2)}`;
    } else if (best && numM && bestScore >= 0.55) {
      target = best; how = `number+fuzzy ${bestScore.toFixed(2)}`;
    }
  }

  let kind = "lesson";
  if (info.pages >= 120 ||
      (info.pages >= 60 && info.title && info.author) ||
      (info.outline.length >= 8 && info.pages >= 50)) kind = "book";
  else if (KIND_RE.lab.test(name + info.title)) kind = "lab";
  else if (KIND_RE.reference.test(name + info.title)) kind = "reference";

  const slugBase = (canon ? canon[3] : name.replace(/\.pdf$/i, ""))
    .toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
    "document";
  let workId, nn;
  if (target) {
    workId = target.id;
    nn = target.id.split("-")[1] || "01";
    ctx.slotStandalone = null;
  } else if (ctx.slotStandalone && ctx.slotStandalone.name === name) {
    workId = ctx.slotStandalone.slot.id;
    // Keep canonical destination naming from the slot's declared file.
    const sm = (ctx.slotStandalone.slot.file || "")
      .match(/^([a-z]+)__(\d+)-(.+)\.pdf$/i);
    nn = sm ? sm[2] : "01";
    ctx.slotStandalone = null;
    how = `${how} (slot resolved)`;
  } else {
    const nums = works.map((w) => Number((w.id.split("-")[1] || "0")) || 0);
    nn = String((canon ? Number(canon[2]) : Math.max(0, ...nums) + 1))
      .padStart(2, "0");
    workId = kind === "book" ? `book-${slugBase}` : `${track}-${nn}-${slugBase}`;
  }
  const destDir = kind === "book"
    ? path.join(root, "content", "pdf", "_books")
    : path.join(root, "content", "pdf", track);
  await fs.mkdir(destDir, { recursive: true });
  const destName = kind === "book" ? `${slugBase}.pdf`
    : `${track}__${nn}-${slugBase}.pdf`;
  const dest = path.join(destDir, destName);
  try {
    const old = await fs.readFile(dest);
    const oldSha = crypto.createHash("sha256").update(old).digest("hex");
    if (oldSha !== sha) {
      const vdir = path.join(root, "content", "pdf", "_versions");
      await fs.mkdir(vdir, { recursive: true });
      await fs.copyFile(dest,
        path.join(vdir, `${destName}.${oldSha.slice(0, 8)}.pdf`));
    }
  } catch { /* new file */ }
  await fs.copyFile(file, dest);
  ledger[sha] = { file: dest, workId, ingestedAt: new Date().toISOString() };
  const fmt = { track, kind,
    path: path.relative(root, dest).replace(/\\/g, "/"),
    pages: info.pages, bytes: buf.length, cover: null,
    textIndexed: info.texts.some((t) => t.length >= 20),
    sha256: sha, originalName: name,
    title: info.title || null, isNewWork: !target,
    newTitle: !target ? (info.title && !/\.pdf$/i.test(info.title)
      ? info.title : slugBase.replace(/-/g, " ")) : null,
    minutes: Math.max(1, Math.ceil(info.pages * 2)) };
  ctx.cache[sha] = { format: fmt,
    texts: info.texts.filter((t) => t.length >= 20)
      .map((t) => t.slice(0, 1200)) };
  ctx.cacheDirty = true;
  ctx.pdfFormats.push({ workId, ...fmt,
    texts: info.texts });
  report.push({ file: name, result: target ? "attached" : "new",
                track, work: workId, format: "pdf", pages: info.pages,
                notes: how || `new ${kind}` });
  await moveToProcessed(root, file);
}

async function moveToProcessed(root, file) {
  const inbox = path.join(root, "content", "_inbox");
  const rel = path.relative(inbox, file);
  if (rel.startsWith("..") || rel === "") return; // only inbox files move
  const dest = path.join(inbox, "_processed",
    `${Date.now()}-${path.basename(file)}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try { await fs.rename(file, dest); } catch { /* already moved */ }
}

// outlineChapters: PDF outline (bookmarks) top two levels.
// Returns [{title, page|null, level}]. Never throws.
export async function outlineChapters(absPath, limit = 80) {
  try {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const pdfjs = req("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");
    const buf = await fs.readFile(absPath);
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf),
      verbosity: 0 }).promise;
    const outline = await pdf.getOutline().catch(() => null);
    if (!outline) { await pdf.destroy().catch(() => {}); return []; }
    const out = [];
    async function walk(items, level) {
      for (const it of items || []) {
        if (out.length >= limit) break;
        let page = null;
        try {
          const dest = it.dest;
          const ref = Array.isArray(dest) ? dest[0] : null;
          if (ref) {
            const idx = await pdf.getPageIndex(ref).catch(() => null);
            if (idx !== null && idx !== undefined) page = idx + 1;
          }
        } catch { /* keep page null */ }
        out.push({ title: String(it.title || "Untitled").slice(0, 120),
                   page, level });
        if (it.items && it.items.length && level < 2) {
          await walk(it.items, level + 1);
        }
      }
    }
    await walk(outline, 1);
    await pdf.destroy().catch(() => {});
    return out;
  } catch {
    return [];
  }
}
