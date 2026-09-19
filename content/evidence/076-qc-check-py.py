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
    for orphan in pdfs - manifest_files:
        flag(f"pdf not in manifest: {orphan}")


def pdfs_qc():
    for f in sorted(glob.glob(os.path.join(ROOT, "pdf/*.html"))):
        n = os.path.basename(f)
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
        if "m-reflow" not in h:
            flag(f"{n}: no mobile marker")
        for s in set(re.findall(r'src="(\.\./assets/[^"]+)"', h)):
            if not os.path.exists(os.path.normpath(os.path.join(ROOT, "pdf", s))):
                flag(f"{n}: bad asset {s}")
        npages = h.count('class="page cover"') + h.count('class="page opener"') + h.count('class="page"')
        feet = re.findall(r'<div class="pfoot">.*?(\d+) / (\d+)</span></div>', h, re.S)
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
    idx = open(os.path.join(dist, "index.html"), encoding="utf-8").read()
    for stale in ("CI/CD Technical Library", "CI/CDLIB", "data-set=\"original\""):
        if stale in idx:
            flag(f"dist stale ref: {stale}")
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


if __name__ == "__main__":
    os.chdir(ROOT)
    md_links()
    glossary()
    parity()
    pdfs_qc()
    icons()
    dist()
    print("QC:", "FAIL" if fails else "ALL GREEN", f"({len(fails)} findings)")
    sys.exit(1 if fails else 0)
