#!/usr/bin/env python3
"""Build the consolidated series edition (omnibus books) from per-file PDFs.
Usage: python scripts/build_series.py   (run from CI-CD/ root)
Reads: pdf/pdf-*.html
Writes: pdf/series/S01-*.html .. S09-*.html
Each series book = series cover + series TOC + member chapters unchanged
(own CH footers kept), page ids namespaced, asset paths rebased to ../../assets.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, "pdf")
OUT = os.path.join(ROOT, "pdf", "series")

SERIES = [
    ("S01-foundations.html", "Foundations", "CI/CD SYSTEMS · SERIES EDITION · S01",
     "The automated path from commit to production.",
     ["pdf-01-foundations.html"]),
    ("S02-continuous-integration.html", "Continuous Integration", "CI/CD SYSTEMS · SERIES EDITION · S02",
     "Change flow: branches, gates, discipline.",
     ["pdf-02-git-branching-pull-requests.html", "pdf-21-continuous-integration.html"]),
    ("S03-build-test-artifacts.html", "Build, Test & Artifacts", "CI/CD SYSTEMS · SERIES EDITION · S03",
     "Deterministic builds, right-placed tests, immutable artifacts.",
     ["pdf-22-build-systems.html", "pdf-23-testing-strategy.html", "pdf-04-artifact-management.html"]),
    ("S04-pipelines.html", "CI/CD Pipelines", "CI/CD SYSTEMS · SERIES EDITION · S04",
     "Stages, jobs, runners, execution.",
     ["pdf-03-pipelines.html"]),
    ("S05-delivery-and-deployment.html", "Delivery & Deployment", "CI/CD SYSTEMS · SERIES EDITION · S05",
     "Releasable always, deployed by decision — then observed.",
     ["pdf-05-continuous-delivery.html", "pdf-24-continuous-deployment.html",
      "pdf-25-environments-release.html", "pdf-20-deployment-strategies.html",
      "pdf-27-rollback-recovery.html", "pdf-06-observability-feedback.html"]),
    ("S06-jenkins-core.html", "Jenkins Core", "CI/CD SYSTEMS · SERIES EDITION · S06",
     "Controller, agents, setup, pipelines.",
     ["pdf-07-jenkins-domain.html", "pdf-08-jenkins-architecture.html",
      "pdf-09-jenkins-setup.html", "pdf-10-jenkins-pipelines.html",
      "pdf-12-jenkins-agents.html"]),
    ("S07-jenkins-advanced.html", "Jenkins Advanced & Security", "CI/CD SYSTEMS · SERIES EDITION · S07",
     "Groovy, credentials, plugins, webhooks, hardening, supply chain.",
     ["pdf-11-groovy-cheatsheet.html", "pdf-13-jenkins-credentials.html",
      "pdf-14-jenkins-plugins.html", "pdf-15-jenkins-webhooks.html",
      "pdf-16-jenkins-security.html", "pdf-17-jenkins-advanced.html",
      "pdf-18-jenkins-troubleshooting.html", "pdf-26-cicd-security.html"]),
    ("S08-labs.html", "Hands-On Labs", "CI/CD SYSTEMS · SERIES EDITION · S08",
     "Nine labs: first pipeline to backup drill.",
     ["pdf-28-lab-first-pipeline.html", "pdf-29-lab-build-test.html",
      "pdf-30-lab-artifacts.html", "pdf-31-lab-deployment.html",
      "pdf-32-lab-rollback.html", "pdf-33-lab-jenkins-controller.html",
      "pdf-34-lab-shared-library.html", "pdf-35-lab-backup-restore.html",
      "pdf-36-command-cheatsheet.html"]),
    ("S09-github-actions.html", "GitHub Actions", "CI/CD SYSTEMS · SERIES EDITION · S09",
     "Same concepts, other platform: workflows, runners, cost, patterns.",
     ["pdf-19-github-actions.html"]),
]

COVER_TMPL = """<div class="page cover">
<div class="brand">{brand}</div>
<h1>{title_html}</h1>
<div class="sub">{sub}</div>
<div class="tri">{chapters_tri}</div>
<div class="foot"><span>SERIES EDITION · {nch} CHAPTERS</span><span class="sig">Nabawy</span></div>
</div>

<div class="page opener">
<div class="phead"><span class="ch">Series Edition</span> &nbsp; {code}<hr><h2>Contents</h2>Chapters</div>
<div class="vflow">
{toc_rows}
</div>
<div class="printnote">OMNIBUS — member chapters keep their original page numbers. Print: Ctrl/Cmd+P → Save as PDF → Background graphics on → A4.</div>
<div class="pfoot"><span>CI/CD Engineering Manual</span><span>{code}</span><span>02 / {total}</span></div>
</div>
"""


def split_pages(path):
    from html.parser import HTMLParser

    class G(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=False)
            self.pages, self._buf, self._d = [], None, 0

        def handle_starttag(self, tag, attrs):
            d = dict(attrs)
            if tag == "div" and self._buf is None and "page" in d.get("class", "").split():
                self._buf, self._d = [self.get_starttag_text()], 1
                return
            if self._buf is not None:
                self._buf.append(self.get_starttag_text())
                if tag == "div":
                    self._d += 1

        def handle_endtag(self, tag):
            if self._buf is not None:
                self._buf.append(f"</{tag}>")
                if tag == "div":
                    self._d -= 1
                    if self._d == 0:
                        self.pages.append("".join(self._buf))
                        self._buf = None

        def handle_data(self, data):
            if self._buf is not None:
                self._buf.append(data)

        def handle_entityref(self, n):
            if self._buf is not None:
                self._buf.append(f"&{n};")

        def handle_charref(self, n):
            if self._buf is not None:
                self._buf.append(f"&#{n};")

    src = open(path, encoding="utf-8").read()
    css = re.findall(r"<style>(.*?)</style>", src, re.S)
    g = G()
    g.feed(src)
    title = re.search(r"<title>(.*?)</title>", src, re.S)
    return (css[0] if css else ""), g.pages, title.group(1).strip() if title else "?"


def build():
    os.makedirs(OUT, exist_ok=True)
    for fname, title, brand, sub, members in SERIES:
        code = fname[:3]
        css_seen, css_all, body, toc_rows, total = set(), [], [], [], 0
        member_names = []
        for m in members:
            css, pages, t = split_pages(os.path.join(PDF, m))
            member_names.append(t.split("—")[-1].strip())
            if css not in css_seen:
                css_seen.add(css)
                css_all.append(css)
            for i, p in enumerate(pages):
                total += 1
                p = p.replace('src="../assets/', 'src="../../assets/')
                p = re.sub(r'class="page', f'id="{code.lower()}-p{total}" class="page', p, count=1)
                body.append(p)
            toc_rows.append(
                f'<div class="fnode"><b>{t.split("—")[-1].strip()[:52]}</b>'
                f"<small>{len(pages)} pages</small></div><div class=\"farrow\">↓</div>"
            )
        title_html = "<br>".join(w.upper() for w in title.split(" ", 1)) if " " in title else title.upper()
        tri = "<br>".join(n.upper()[:34] for n in member_names[:5])
        if len(member_names) > 5:
            tri += f"<br>+ {len(member_names) - 5} MORE"
        cover = COVER_TMPL.format(
            brand=brand, title_html=title_html, sub=sub, chapters_tri=tri,
            nch=len(members), code=code, toc_rows="".join(toc_rows), total=total + 2,
        )
        doc = ("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n"
               "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
               f"<title>CI/CD Engineering — Series {code}: {title}</title>\n<style>"
               + "\n".join(css_all) + "</style>\n</head>\n<body>\n\n" + cover + "\n".join(body)
               + "\n</body>\n</html>\n")
        open(os.path.join(OUT, fname), "w", encoding="utf-8").write(doc)
        print(f"BUILT {fname}: {len(members)} chapters, {total + 2} pages")


if __name__ == "__main__":
    build()
