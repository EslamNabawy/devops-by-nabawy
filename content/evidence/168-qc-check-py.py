#!/usr/bin/env python3
"""Repo-wide QC gate for the CI/CD knowledge base.
Usage: python scripts/qc-check.py   (run from CI-CD/ root)
Checks: md links, glossary links, manifest<->pdf<->reader parity,
PDF hygiene (doctype, signature, no §/fences/scripts, mobile marker,
assets resolve, footer sequence + totals), icon-id mapping,
dist integrity (pdf/asset links, branding, theme refs).
Exit 0 = ALL GREEN, 1 = flaws found.
"""
import json
import os
import re
import sys
import glob
import html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = []


def flag(msg):
    fails.append(msg)
    print("FAIL:", msg)


def md_links():
    for f in glob.glob("**/*.md", root_dir=ROOT, recursive=True):
        if f.startswith("website"):
            continue
        base = os.path.dirname(os.path.join(ROOT, f))
        for i, line in enumerate(open(os.path.join(ROOT, f), encoding="utf-8"), 1):
            code = "".join(re.findall(r"`([^`]*)`", line))
            for m in set(re.findall(r"\]\(([^)#]+)(?:#[^)]*)?\)", line)):
                if m.startswith(("http", "mailto", "#")) or m in code:
                    continue
                if not os.path.exists(os.path.normpath(os.path.join(base, m))):
                    flag(f"md link {f}:{i} -> {m}")


def glossary():
    g = open(os.path.join(ROOT, "GLOSSARY.md"), encoding="utf-8").read()
    for t, _d, r in re.findall(r"^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|", g, re.M):
        if "Term" in t or "---" in t:
            continue
        for m in re.findall(r"\(([^)#]+)(?:#[^)]*)?\)", r):
            if not os.path.exists(os.path.normpath(os.path.join(ROOT, m))):
                flag(f"glossary link {t.strip()} -> {m}")


def parity():
    books = json.load(open(os.path.join(ROOT, "website/content/books.json"), encoding="utf-8"))
    ids = [b["id"] for b in books]
    if len(ids) != len(set(ids)):
        flag("duplicate book ids")
    for b in books:
        if not os.path.exists(os.path.join(ROOT, "pdf", b["file"])):
            flag(f"manifest pdf missing: {b['file']}")
        if not os.path.exists(os.path.join(ROOT, "website/dist/read", b["id"] + ".html")):
            flag(f"reader missing for: {b['id']}")
    pdfs = {os.path.basename(f) for f in glob.glob(os.path.join(ROOT, "pdf/*.html"))}
    manifest_files = {b["file"] for b in books}
    # Retired single-edition sources: kept on disk as merge inputs for the
    # pdf-merged-* omnibus files (and the pdf/series/ builder). Not orphans.
    RETIRED_MEMBERS = {
        "pdf-01-foundations.html", "pdf-02-git-branching-pull-requests.html",
        "pdf-21-continuous-integration.html", "pdf-03-pipelines.html",
        "pdf-22-build-systems.html", "pdf-23-testing-strategy.html",
        "pdf-05-continuous-delivery.html", "pdf-24-continuous-deployment.html",
        "pdf-25-environments-release.html", "pdf-39-iac-environments.html",
        "pdf-06-observability-feedback.html", "pdf-27-rollback-recovery.html",
        "pdf-26-cicd-security.html", "pdf-07-jenkins-domain.html",
        "pdf-08-jenkins-architecture.html", "pdf-09-jenkins-setup.html",
        "pdf-10-jenkins-pipelines.html", "pdf-12-jenkins-agents.html",
        "pdf-11-groovy-cheatsheet.html", "pdf-13-jenkins-credentials.html",
        "pdf-14-jenkins-plugins.html", "pdf-15-jenkins-webhooks.html",
        "pdf-16-jenkins-security.html", "pdf-17-jenkins-advanced.html",
        "pdf-18-jenkins-troubleshooting.html", "pdf-37-gitlab-ci.html",
        "pdf-38-argocd-gitops.html", "pdf-28-pipeline-labs.html",
        "pdf-30-artifacts-deployment.html", "pdf-32-rollback-jenkins.html",
        "pdf-34-governance-recovery.html",
        "pdf-jenkins-lab-01-webhook.html", "pdf-jenkins-lab-02-docker.html",
        "pdf-jenkins-lab-03-multibranch.html",
        "pdf-jenkins-lab-04-shared-library.html",
        "pdf-jenkins-lab-05-terraform-floci.html",
        "pdf-jenkins-labs.html",
        "pdf-40-jenkins-roadmap-2026.html",
        "pdf-41-github-actions-roadmap-2026.html",
        "pdf-42-cicd-decision-guide.html",
        # v4 merge inputs: retired omnibus members, superseded by
        # pdf-merged-10..14 (single polished books, no merge seams).
        "pdf-merged-02-pipelines-build-test.html",
        "pdf-04-artifact-management.html",
        "pdf-20-deployment-strategies.html",
        "pdf-merged-03-delivery-envs.html",
        "pdf-merged-04-observe-recover-secure.html",
        "pdf-merged-05-jenkins-advanced-ops.html",
        "pdf-19-github-actions.html",
        "pdf-merged-06-gitlab-argocd.html",
        "pdf-merged-07-core-labs.html",
        "pdf-merged-08-jenkins-labs.html",
        "pdf-merged-09-roadmap-choice.html",
    }
    for orphan in pdfs - manifest_files - RETIRED_MEMBERS:
        flag(f"pdf not in manifest: {orphan}")


def pdfs_qc():
    targets = sorted(glob.glob(os.path.join(ROOT, "pdf/*.html")))
    targets += sorted(glob.glob(os.path.join(ROOT, "pdf/series/*.html")))
    for f in targets:
        n = os.path.relpath(f, os.path.join(ROOT, "pdf"))
        h = open(f, encoding="utf-8").read()
        if not h.lstrip().lower().startswith("<!doctype html"):
            flag(f"{n}: no doctype")
        if '<span class="sig">Nabawy</span>' not in h:
            flag(f"{n}: no signature")
        if "§" in h:
            flag(f"{n}: contains §")
        if re.search(r"```", h):
            flag(f"{n}: code fences")
        if "<script" in h.lower():
            flag(f"{n}: script tag")
        if "m-reflow" not in h and not re.search(r"@media\s*(?:screen\s+and\s+)?\(max-width:", h, re.I):
            flag(f"{n}: no mobile marker")
        _base = os.path.dirname(f)
        for s in set(re.findall(r'src="((?:\.\./)+assets/[^"]+)"', h)):
            if not os.path.exists(os.path.normpath(os.path.join(_base, s))):
                flag(f"{n}: bad asset {s}")
        npages = h.count('class="page cover"') + h.count('class="page opener"') + h.count('class="page"')
        feet = re.findall(r'<div class="pfoot">.*?(\d+) / (\d+)</span></div>', h, re.S)
        # Merged omnibus files concatenate member chapters that keep their own
        # page footers by design (same convention as pdf/series/). Skip the
        # single-edition footer sequence/total check for them; the website
        # reader strips print footers and is separately verified.
        if n.startswith("pdf-merged-") or n.startswith("series"):
            feet = []
        if feet:
            seq = [int(a) for a, _b in feet]
            totals = {int(b) for _a, b in feet}
            if seq != list(range(2, 2 + len(feet))):
                flag(f"{n}: footer sequence {seq}")
            if totals != {npages}:
                flag(f"{n}: footer total {totals} != pages {npages}")


def icons():
    reg = open(os.path.join(ROOT, "assets/icons/README.md"), encoding="utf-8").read()
    ready = set(re.findall(r"^\| `([a-z-]+)` \| `[^`]*` \| READY", reg, re.M))
    used = set()
    for f in glob.glob("**/*.md", root_dir=ROOT, recursive=True):
        if f.startswith("website"):
            continue
        for line in open(os.path.join(ROOT, f), encoding="utf-8"):
            code = "".join(re.findall(r"`([^`]*)`", line))
            for m in set(re.findall(r"<!-- icon: ([a-z-]+) -->", line)):
                if m not in code:
                    used.add(m)
    for u in sorted(used - ready):
        flag(f"icon id unmapped: {u}")


def dist():
    dist = os.path.join(ROOT, "website/dist")
    if not os.path.exists(dist):
        flag("dist/ not built")
        return
    for f in glob.glob("**/*.html", root_dir=dist, recursive=True):
        h = open(os.path.join(dist, f), encoding="utf-8").read()
        root = os.path.dirname(os.path.join(dist, f))
        for m in set(re.findall(r'src="(\.\./assets/[^"]+)"', h)):
            if not os.path.exists(os.path.normpath(os.path.join(root, m))):
                flag(f"dist asset {f} -> {m}")
        for p in set(re.findall(r'href="(\.\./pdf/[^"]+)"', h)):
            if not os.path.exists(os.path.normpath(os.path.join(root, p))):
                flag(f"dist pdf link {f} -> {p}")
        for s in set(re.findall(r'href="(pdf/series/[^"]+)"', h)):
            if not os.path.exists(os.path.normpath(os.path.join(dist, s))):
                flag(f"dist series link {f} -> {s}")
    for landing in ("index.html",):
        p = os.path.join(dist, landing)
        if not os.path.exists(p):
            flag(f"dist landing missing: {landing}")
            continue
        idx = open(p, encoding="utf-8").read()
        for stale in ("CI/CD Technical Library", "CI/CDLIB", "data-set=\"original\""):
            if stale in idx:
                flag(f"dist stale ref {landing}: {stale}")
    # roadmap page: every manifest book shown exactly once, links resolve
    books = json.load(open(os.path.join(ROOT, "website/content/books.json"), encoding="utf-8"))
    rm = os.path.join(dist, "roadmap", "index.html")
    if not os.path.exists(rm):
        flag("roadmap page missing: dist/roadmap/index.html")
    else:
        h = open(rm, encoding="utf-8").read()
        cards = re.findall(r'<div class="card book" data-cat="[^"]*" data-title="([^"]*)">', h)
        if len(cards) != len(books):
            flag(f"roadmap shows {len(cards)} cards, manifest has {len(books)}")
        titles = {b["title"] for b in books}
        for t in cards:
            if html.unescape(t) not in titles:
                flag(f"roadmap card not in manifest: {t}")
        for bid in set(re.findall(r'href="\.\./read/([^"]+)\.html"', h)):
            if not os.path.exists(os.path.join(dist, "read", bid + ".html")):
                flag(f"roadmap reader link broken: {bid}")
        anchors = set(re.findall(r'<section class="shelf" id="([^"]+)"', h))
        for a in set(re.findall(r'href="#([^"]+)"', h)):
                if a.startswith("rm-") and a not in anchors:
                    flag(f"roadmap jump anchor broken: #{a}")


def reader_chrome():
    """Guard the reader controls that have regressed in prior deployments."""
    read_dir = os.path.join(ROOT, "website/dist/read")
    for f in glob.glob(os.path.join(read_dir, "*.html")):
        name = os.path.basename(f)
        h = open(f, encoding="utf-8").read()
        if h.count('id="mobilemenubtn"') != 1:
            flag(f"{name}: expected one mobile menu trigger")
        if h.count('id="tocbtn"') != 1:
            flag(f"{name}: expected one contents trigger")
        if 'aria-label="Open table of contents"' not in h:
            flag(f"{name}: contents trigger is not labeled")
        if 'aria-label="Open reader menu"' not in h:
            flag(f"{name}: mobile menu trigger is not labeled")
        if h.count('id="backbtn"') != 1:
            flag(f"{name}: expected one Back control")
        for stale in ('id="ratebox"', 'id="rateup"', 'id="ratedown"',
                      'feedback-widget', 'suggest-edit-widget'):
                if stale in h:
                    flag(f"{name}: removed reader widget reintroduced: {stale}")


def reader_content():
    """Ensure every manifest reader has real article content, not a print shell."""
    books = json.load(open(os.path.join(ROOT, "website/content/books.json"), encoding="utf-8"))
    for b in books:
        path = os.path.join(ROOT, "website/dist/read", b["id"] + ".html")
        if not os.path.exists(path):
            continue
        h = open(path, encoding="utf-8").read()
        start = h.find('<div class="readbody">')
        end = h.rfind('</div></main>')
        body = h[start + len('<div class="readbody">'):end] if start >= 0 and end > start else ""
        text = re.sub(r"<[^>]+>", " ", html.unescape(body))
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) < 500 or not re.search(r"<h[234][ >]", body):
            flag(f"{b['id']}: reader content is empty or missing headings")


def a11y():
    for f in sorted(glob.glob(os.path.join(ROOT, "pdf/*.html"))):
        n = os.path.basename(f)
        if n.startswith("pdf-merged-0") and n not in (
            "pdf-merged-01-start-here.html", "pdf-merged-10-build-artifacts.html",
            "pdf-merged-11-deliver-operate.html", "pdf-merged-12-jenkins-complete.html",
            "pdf-merged-13-platforms-roadmaps.html", "pdf-merged-14-labs-handbook.html"):
            continue
        h = open(f, encoding="utf-8").read()
        for m in re.finditer(r'<div class="mark (m-[a-z]+)">(.*?)</div>', h, re.S):
            if '<span class="tag">' not in m.group(2) and 'class="tag"' not in m.group(2):
                flag(f"{n}: mark {m.group(1)} missing non-color tag label")
                break
        for img in set(re.findall(r"<img((?:(?!>).)*)>", h)):
            if "alt=" not in img:
                flag(f"{n}: img missing alt")
                break
    for f in glob.glob(os.path.join(ROOT, "website/dist/read", "*.html")):
        name = os.path.basename(f)
        h = open(f, encoding="utf-8").read()
        if 'id="tocbtn"' in h and 'aria-label="Open table of contents"' not in h:
            flag(f"{name}: contents trigger missing label")


if __name__ == "__main__":
    os.chdir(ROOT)
    md_links()
    glossary()
    parity()
    pdfs_qc()
    icons()
    dist()
    reader_chrome()
    reader_content()
    a11y()
    print("QC:", "FAIL" if fails else "ALL GREEN", f"({len(fails)} findings)")
    sys.exit(1 if fails else 0)
