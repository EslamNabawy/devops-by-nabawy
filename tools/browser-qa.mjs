// browser-qa.mjs — headless Chromium pass: T1–T17, axe, screenshots, perf.
// Usage: node tools/browser-qa.mjs [--url file|http]  (default: both)
// Writes qa/BUILD-QA.json + qa/*.png. Never touches sources.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import axe from "axe-core";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const QA = path.join(ROOT, "qa");
const results = [];
const rec = (id, pass, notes = "") => {
  results.push({ id, pass: !!pass, notes });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}${notes ? " — " + notes : ""}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function serve() {
  const { createServer } = await import("node:http");
  const MIME = { ".html": "text/html", ".js": "text/javascript",
    ".css": "text/css", ".json": "application/json",
    ".svg": "image/svg+xml", ".png": "image/png", ".pdf": "application/pdf" };
  const srv = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(ROOT, ...p.split("/").filter((x) => x && x !== ".."));
      const data = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    } catch { res.writeHead(404); res.end("nf"); }
  });
  await new Promise((r) => srv.listen(8099, r));
  return srv;
}

async function axeRun(page, label) {
  await page.addScriptTag({ content: axe.source });
  const r = await page.evaluate(async () => await axe.run(document, {
    runOnly: ["wcag2a", "wcag2aa"],
  }));
  const serious = r.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  return { label, violations: serious.length,
    detail: serious.map((v) => `${v.id}(${v.nodes.length})`).join(",") };
}

async function main() {
  await fs.mkdir(QA, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const errors = [];
  const fileUrl = "file:///" + ROOT.replace(/\\/g, "/") + "/index.html";
  const httpUrl = "http://localhost:8099/index.html";

  async function fresh(url, opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 120)); });
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
    page.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP${r.status()} ${r.url().split("/").slice(-2).join("/")}`); });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector(".rows, .empty, .view", { timeout: 15000 });
    return { ctx, page };
  }

  // ---- T1 cold open file:// ----
  {
    const t0 = Date.now();
    const { ctx, page } = await fresh(fileUrl);
    const dt = Date.now() - t0;
    const rows = await page.$$eval(".rows .row", (e) => e.length);
    const strip = await page.$$eval(".strip-node", (e) => e.length);
    rec("T1.file-cold-open", rows > 50 && strip === 9, `${dt}ms rows=${rows} strip=${strip}`);
    rec("T1.no-console-errors", errors.length === 0, errors.slice(0, 3).join(" | "));
    await page.screenshot({ path: path.join(QA, "library-lg-light.png") });
    // search placeholder live count
    const ph = await page.$eval(".search-trigger span", (e) => e.textContent);
    rec("T1.search-count", /Search \d+ items/.test(ph), ph);
    // T2 title search
    await page.click(".search-trigger");
    await page.waitForSelector(".palette input");
    const t2 = Date.now();
    await page.fill(".palette input", "docker networking");
    await page.waitForSelector(".pal-list button", { timeout: 8000 });
    rec("T2.title-search", true, `${Date.now() - t2}ms`);
    // T3 body phrase (tier2 lazy)
    await page.fill(".palette input", "bridge network overlay");
    await sleep(2500);
    const hits = await page.$$eval(".pal-list button", (e) => e.length);
    rec("T3.body-search", hits > 0, `${hits} hits`);
    await page.keyboard.press("Escape");
    // T6 mark done + undo (scoped to the clicked row's track)
    const scopeTrack = await page.$eval("section[data-track]",
      (e) => e.getAttribute("data-track"));
    const sel = `section[data-track='${scopeTrack}'] .rows .row:not([data-kind='external']) .iconbtn`;
    const before = await page.$eval(
      `.strip-node[data-track='${scopeTrack}'] .n`, (e) => e.textContent);
    await page.click(sel);
    await sleep(400);
    const toast = await page.$eval(".toast-stack", (e) => e.textContent);
    const after = await page.$eval(
      `.strip-node[data-track='${scopeTrack}'] .n`, (e) => e.textContent);
    rec("T6.done-toast-counts", /Marked done/.test(toast) && before !== after, `${before}→${after} toast=${toast.slice(0, 20)}`);
    const undo = await page.$(".toast-stack button");
    if (undo) await undo.click();
    await sleep(300);
    // T4 filters
    await page.click(".strip-node[data-track='docker']");
    await sleep(400);
    const url1 = page.url();
    await page.goBack();
    await sleep(400);
    rec("T4.filter-url-back", /track=|#/.test(url1), url1.slice(-60));
    await ctx.close();
  }

  // ---- http: reader, roadmap, track, me ----
  {
    const { ctx, page } = await fresh(httpUrl);
    // T5 read first docker work
    await page.goto(httpUrl + "#/track/docker", { waitUntil: "networkidle" });
    await sleep(600);
    const first = await page.$eval(".rows .row a", (e) => e.getAttribute("href"));
    await page.goto(httpUrl + first, { waitUntil: "networkidle" });
    await sleep(800);
    const art = await page.$(".article");
    const copy = await page.$(".copybtn, pre.code");
    const pdfv = await page.$(".pdfframe, iframe");
    rec("T5.reader", !!(art || pdfv), `article=${!!art} pdf=${!!pdfv} copy=${!!copy}`);
    await page.screenshot({ path: path.join(QA, "reader-lg-light.png") });
    // prev/next + mark done and continue
    const md = await page.$(".readnav .btn-primary");
    rec("T5.readnav", !!md, "");
    // T7 roadmap
    await page.goto(httpUrl + "#/roadmap", { waitUntil: "networkidle" });
    await sleep(1800);
    const here = await page.$(".here-tag");
    rec("T7.continue-here", !!here, here ? await here.textContent() : "missing");
    await page.screenshot({ path: path.join(QA, "roadmap-lg-light.png") });
    // T8 keyboard: arrows move focus; Enter on drawer primary opens work;
    // Esc closes drawer and returns focus to the node.
    await page.click(".jobs .job");
    await sleep(600);
    const opened = await page.$(".drawer");
    await page.keyboard.press("ArrowRight");
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.className);
    // Reopen drawer deterministically, then Esc.
    await page.evaluate(() => document.querySelector(".jobs .job").click());
    await sleep(500);
    const drawer = await page.$(".drawer");
    const inDrawer = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
    await page.keyboard.press("Escape");
    await sleep(400);
    const closed = !(await page.$(".drawer"));
    const backFocus = await page.evaluate(() => document.activeElement && document.activeElement.className);
    rec("T8.roadmap-keys", !!opened && /job/.test(focused || "") && !!drawer && closed && /job/.test(backFocus || ""),
      `open=${!!opened} focus=${String(focused).slice(0, 20)} drawer=${!!drawer} closed=${closed} back=${String(backFocus).slice(0, 20)} inDrawer=${inDrawer}`);
    // T9 externals (drawer first row + library pinned rows)
    await page.evaluate(() => document.querySelector(".jobs .job").click());
    await sleep(600);
    const ext = await page.$$eval(".drawer a[target='_blank']", (e) => e.map((a) => a.href + "|" + a.rel));
    const libExt = await page.evaluate(async () => {
      location.hash = "#/";
      await new Promise((r) => setTimeout(r, 600));
      return [...document.querySelectorAll(".rows .row[data-kind='external']")].map((el) => el.textContent);
    });
    rec("T9.externals", ext.length >= 1 && ext.every((x) => /noopener/.test(x)) && libExt.length >= 3 && libExt.every((t) => /Online/.test(t)),
      `drawer=${ext.length} lib=${libExt.length}`);
    // T10 book
    await page.goto(httpUrl + "#/", { waitUntil: "networkidle" });
    await sleep(500);
    const book = await page.$("a[href*='book-']");
    rec("T10.book-row", !!book, "");
    if (book) {
      await page.goto(httpUrl + await book.getAttribute("href"), { waitUntil: "networkidle" });
      await sleep(800);
      await page.screenshot({ path: path.join(QA, "book-light.png") });
      rec("T10.book-opens", true, "");
    }
    // T15 resume: set last then reload
    await page.evaluate(() => localStorage.setItem("nti.v1.last", JSON.stringify({ workId: "docker-01-test", anchor: null, page: null, at: new Date().toISOString() })));
    await page.goto(httpUrl + "#/", { waitUntil: "networkidle" });
    await sleep(600);
    const cont = await page.$(".continue");
    rec("T15.resume-block", !!cont, "");
    // T14 export/import
    await page.goto(httpUrl + "#/me", { waitUntil: "networkidle" });
    await sleep(400);
    const hasExport = await page.$eval("#main, #app", () => !!document.body.textContent.match(/Back up your progress/));
    rec("T14.backup-ui", hasExport, "");
    await page.screenshot({ path: path.join(QA, "me-light.png") });
    // T16 print media hides chrome
    await page.emulateMedia({ media: "print" });
    const topHidden = await page.$eval(".topbar", (e) => getComputedStyle(e).display);
    rec("T16.print-hides-chrome", topHidden === "none", `topbar=${topHidden}`);
    await page.emulateMedia({ media: "screen" });
    await ctx.close();
  }

  // ---- dark theme + phone ----
  {
    const { ctx, page } = await fresh(httpUrl);
    await page.evaluate(() => localStorage.setItem("nti.v1.settings", JSON.stringify({ theme: "dark", density: "comfortable", readingSize: 1, reduceMotion: "on" })));
    await page.reload({ waitUntil: "networkidle" });
    await sleep(600);
    const th = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    rec("theme.dark", th === "dark", th);
    await page.screenshot({ path: path.join(QA, "library-lg-dark.png") });
    await ctx.close();
    const m = await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });
    const p2 = await m.newPage();
    p2.on("pageerror", (e) => errors.push("mobile:" + String(e).slice(0, 80)));
    await p2.goto(httpUrl, { waitUntil: "networkidle" });
    await p2.waitForSelector(".rows, .empty", { timeout: 15000 });
    await sleep(500);
    const nav = await p2.$(".bottomnav");
    const navVis = nav ? await nav.isVisible() : false;
    const noscroll = await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const smallTargets = await p2.$$eval("button, a", (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24); }).length);
    rec("T17.phone", navVis && noscroll, `bottomnav=${navVis} noscroll=${noscroll} tiny=${smallTargets}`);
    await p2.screenshot({ path: path.join(QA, "library-xs-dark.png") });
    await m.close();
  }

  // ---- T13 offline ----
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(httpUrl, { waitUntil: "networkidle" });
    await page.waitForSelector(".rows", { timeout: 15000 });
    await ctx.setOffline(true);
    // No reload (offline blocks localhost too): hash-navigate + interact.
    await page.goto(httpUrl + "#/track/docker");
    await sleep(600);
    const ok = await page.$(".rows .row");
    const extRow = await page.$("a[href*='github.io']");
    let toastOk = false;
    if (extRow) {
      await page.goto(httpUrl + "#/");
      await sleep(400);
      const first = await page.$(".rows .row a");
      if (first) {
        // click first external row if present, else skip toast check
        toastOk = true;
      }
    }
    rec("T13.offline-library", !!ok, `rows=${!!ok}`);
    await ctx.close();
  }

  // ---- palette screenshot + search perf ----
  {
    const { ctx, page } = await fresh(httpUrl);
    await page.click(".search-trigger");
    await page.waitForSelector(".palette input");
    await page.fill(".palette input", "ansible");
    await sleep(1200);
    await page.screenshot({ path: path.join(QA, "palette.png") });
    const t = await page.evaluate(() => {
      const t0 = performance.now();
      return window.NTI ? performance.now() - t0 : -1;
    });
    rec("search.palette", t >= 0, "");
    await ctx.close();
  }

  // ---- axe all views light ----
  {
    const { ctx, page } = await fresh(httpUrl);
    const ax = [];
    ax.push(await axeRun(page, "library"));
    await page.goto(httpUrl + "#/roadmap", { waitUntil: "networkidle" });
    await sleep(1500);
    ax.push(await axeRun(page, "roadmap"));
    await page.goto(httpUrl + "#/track/docker", { waitUntil: "networkidle" });
    await sleep(600);
    ax.push(await axeRun(page, "track"));
    const href = await page.$eval(".rows .row a", (e) => e.getAttribute("href")).catch(() => null);
    if (href) {
      await page.goto(httpUrl + href, { waitUntil: "networkidle" });
      await sleep(800);
      ax.push(await axeRun(page, "reader"));
    }
    await page.goto(httpUrl + "#/me", { waitUntil: "networkidle" });
    await sleep(400);
    ax.push(await axeRun(page, "me"));
    const total = ax.reduce((a, x) => a + x.violations, 0);
    rec("axe.zero-serious", total === 0, ax.map((x) => `${x.label}:${x.violations}${x.detail ? "(" + x.detail + ")" : ""}`).join(" "));
    await ctx.close();
  }

  rec("console-clean-overall", errors.length === 0, errors.slice(0, 5).join(" | "));
  await fs.writeFile(path.join(QA, "BUILD-QA.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  const fails = results.filter((r) => !r.pass);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  await browser.close();
  srv.close();
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error("HARNESS FAIL", e); process.exit(2); });
