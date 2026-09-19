#!/usr/bin/env python3
"""Build the static CI/CD library website.
Usage: python scripts/build.py
Reads: content/books.json, ../pdf/*.html, ../GLOSSARY.md
Writes: dist/index.html, dist/read/<id>.html, dist/glossary.html
Adding a book = one manifest entry + re-run. No other files change.
"""
import glob
import pathlib
import json, os, re, html, shutil
try:
    from pages_extra import build_extra_pages as _build_extra
except ImportError:
    import sys as _sys
    _sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
    from pages_extra import build_extra_pages as _build_extra
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KB = os.path.dirname(ROOT)
PDF = os.path.join(KB, "pdf")
DIST = os.path.join(ROOT, "dist")
READ = os.path.join(DIST, "read")
SITE_URL = "https://eslamnabawy.github.io/cicd-by-nabawy"
SITE_DESC = "14 merged handbooks: CI/CD fundamentals, pipelines, artifacts, delivery, Jenkins, GitHub Actions, security, reliability \u2014 plus hands-on labs. By Nabawy."

def seo_tags(title, desc, canonical, og_type="website", image=None):
    d = html.escape(desc, quote=True)
    t = html.escape(title, quote=True)
    c = html.escape(canonical, quote=True)
    parts = [
        f'<link rel="icon" type="image/svg+xml" href="{SITE_URL}/favicon.svg">',
        f'<meta name="description" content="{d}">',
        f'<meta name="theme-color" content="#0B0D10">',
        f'<link rel="canonical" href="{c}">',
        f'<meta property="og:title" content="{t}">',
        f'<meta property="og:description" content="{d}">',
        f'<meta property="og:url" content="{c}">',
        f'<meta property="og:type" content="{og_type}">',
        f'<meta property="og:site_name" content="CICD BY Nabawy">',
        f'<meta name="twitter:card" content="summary">',
        f'<meta name="twitter:title" content="{t}">',
        f'<meta name="twitter:description" content="{d}">',
    ]
    if image:
        i = html.escape(image, quote=True)
        parts.append(f'<meta property="og:image" content="{i}">')
    return "\n".join(parts)


FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B0D10"/><g fill="none" stroke="#18E299" stroke-width="5" stroke-linecap="round"><circle cx="17" cy="32" r="7"/><circle cx="47" cy="17" r="7"/><circle cx="47" cy="47" r="7"/><path d="M24 32h11m0 0-6-6m6 6-6 6M36 20l6-2M36 44l6 2"/></g></svg>'

def og_svg(title, category, color):
    t = html.escape(title[:28])
    c = html.escape(category)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0B0D10"/><rect width="1200" height="14" fill="{color}"/><circle cx="120" cy="120" r="34" fill="none" stroke="#18E299" stroke-width="8"/><text x="80" y="330" font-family="monospace" font-size="44" fill="#18E299">{c}</text><text x="80" y="430" font-family="sans-serif" font-weight="bold" font-size="84" fill="#ededed">{t}</text><text x="80" y="500" font-family="sans-serif" font-size="36" fill="#a0a0a0">CICD BY Nabawy</text></svg>'


try:
    from PIL import Image as _PILImage, ImageDraw as _PILDraw, ImageFont as _PILFont
    _PIL = True
except Exception:
    _PIL = False
OG_EXT = "png" if _PIL else "svg"


def og_png(title, category, color):
    """1200x630 social card mirroring og_svg. PNG bytes, or None without Pillow."""
    if not _PIL:
        return None
    import io as _io
    W, H = 1200, 630
    img = _PILImage.new("RGB", (W, H), "#0B0D10")
    dr = _PILDraw.Draw(img)
    dr.rectangle([0, 0, W, 14], fill=color)
    dr.ellipse([86, 86, 154, 154], outline="#18E299", width=8)
    def _font(name, size):
        try:
            return _PILFont.truetype(name, size)
        except Exception:
            return _PILFont.load_default()
    fcat = _font("arial.ttf", 44)
    ftitle = _font("arialbd.ttf", 84)
    ffoot = _font("arial.ttf", 36)
    dr.text((80, 270), str(category)[:28], font=fcat, fill="#18E299")
    words, lines, cur = str(title).split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if dr.textlength(t, font=ftitle) > 1040 and cur:
            lines.append(cur)
            cur = w
        else:
            cur = t
    lines.append(cur)
    lines = lines[:2]
    y = 340
    for ln in lines:
        dr.text((80, y), ln, font=ftitle, fill="#ededed")
        y += 100
    dr.text((80, 500), "CICD BY Nabawy", font=ffoot, fill="#a0a0a0")
    buf = _io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()
BASE_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap');
:root{--bg:#0B0D10;--bg2:#12151a;--card:#12151a;--ink:#ededed;--mut:#a0a0a0;--line:rgba(255,255,255,.1);--line-soft:rgba(255,255,255,.07);--acc:#18E299;--acc-soft:rgba(24,226,153,.12);--brand:#18E299;--warn:#c37d0d;--red:#d45656;--shadow:rgba(0,0,0,.4) 0px 2px 4px;--shadow-btn:rgba(0,0,0,.4) 0px 1px 2px;--shadow-lift:rgba(0,0,0,.5) 0px 12px 28px -8px;--radius:12px;--mono:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
[data-theme=light]{--bg:#ffffff;--bg2:#fafafa;--card:#ffffff;--ink:#0d0d0d;--mut:#666666;--line:rgba(0,0,0,.07);--line-soft:rgba(0,0,0,.05);--acc:#0b9b68;--acc-soft:#d4fae8;--brand:#18E299;--warn:#c37d0d;--red:#d45656;--shadow:rgba(0,0,0,.03) 0px 2px 4px;--shadow-btn:rgba(0,0,0,.06) 0px 1px 2px;--shadow-lift:rgba(0,0,0,.1) 0px 12px 28px -8px;--radius:12px;--mono:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
/* category accents */
[data-cat="CI/CD"]{--cat:#5B8DEF}[data-cat="Build"]{--cat:#F5A524}[data-cat="Testing"]{--cat:#2ECC71}[data-cat="Security"]{--cat:#E5484D}[data-cat="Reliability"]{--cat:#9B7BF0}[data-cat="Jenkins"]{--cat:#22B8CF}[data-cat="Delivery"]{--cat:#F472B6}[data-cat="GitHub"]{--cat:#94A3B8}[data-cat="Platforms"]{--cat:#F97316}[data-cat="Labs"]{--cat:#EAB308}[data-cat="Reference"]{--cat:#64748B}[data-cat="Series"]{--cat:#18E299}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:var(--ink);text-decoration:none}
a:hover{color:var(--acc)}
.wrap{max-width:1200px;margin:0 auto;padding:24px 32px}
header.top{position:sticky;top:0;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid var(--line);box-shadow:0 1px 0 rgba(255,255,255,.04);z-index:20}
header.top .wrap{display:flex;align-items:center;gap:10px;max-width:1320px;padding:10px 28px;min-height:58px}
.logo{display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:.01em;font-size:16px;white-space:nowrap;margin-right:8px}
.logo svg{flex:none}
.logo span{color:var(--ink)}
.search{flex:1;display:flex;max-width:440px;margin:0 auto}
.search input{flex:1;background:var(--card);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:9px 16px;font-size:14px;outline:none;box-shadow:inset 0 1px 2px rgba(0,0,0,.04)}
[data-theme=light] .search input{border-color:rgba(0,0,0,.08)}
.search input:focus{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand)}
.search input::placeholder{color:var(--mut)}
.search kbd{font-family:var(--mono);font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:6px;padding:1px 7px;margin-left:-44px;align-self:center;pointer-events:none}
.btn{background:var(--card);border:1px solid var(--line);color:var(--ink);border-radius:9px;padding:8px 13px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .15s ease,border-color .15s ease,transform .15s ease}
[data-theme=light] .btn{border-color:rgba(0,0,0,.08)}
.btn:hover{opacity:1;background:var(--bg2);border-color:var(--brand);transform:translateY(-1px)}
header.top .wrap>.btn[aria-current="page"]{background:var(--acc-soft);border-color:var(--brand);color:var(--brand)}
header.top #themebtn{min-width:38px;padding-left:9px;padding-right:9px}
header.top .reader-nav{display:flex;align-items:center;gap:8px}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.hero{padding:64px 24px 44px;text-align:center;position:relative;background:radial-gradient(ellipse 70% 60% at 50% 0%,rgba(24,226,153,.16),transparent 70%)}
.hero .eyebrow{display:inline-block;font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--brand);background:rgba(24,226,153,.14);border-radius:9999px;padding:5px 14px;margin-bottom:20px}
[data-theme=light] .hero .eyebrow{color:#0fa76e;background:#d4fae8}
.hero h1{font-size:clamp(38px,5vw,60px);font-weight:600;letter-spacing:-1px;line-height:1.15;max-width:800px;margin:0 auto}
.hero h1 span{color:var(--ink)}
.hero p{color:var(--mut);font-size:18px;line-height:1.5;max-width:640px;margin:16px auto 0}
.hero .stats{display:flex;gap:10px;margin-top:28px;flex-wrap:wrap;justify-content:center}
.hero .stats span{font-size:13px;font-weight:500;color:var(--mut);background:var(--card);border:1px solid var(--line-soft);border-radius:9999px;padding:5px 14px}
.hero .stats b{color:var(--ink);font-weight:600;font-family:var(--mono);font-size:12px}
#resume{display:none !important}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.card{position:relative;background:var(--card);border:1px solid var(--line-soft);border-radius:var(--radius);padding:22px 24px 24px;display:flex;flex-direction:column;gap:9px;box-shadow:var(--shadow);overflow:hidden;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
.card::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:var(--cat,var(--brand))}
.card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lift);border-color:var(--line)}
.card .num{font-family:var(--mono);color:var(--mut);font-size:10px;font-weight:500;letter-spacing:.6px;text-transform:uppercase}
.card h3{font-size:19px;font-weight:600;letter-spacing:-.2px;line-height:1.3}
.card h3 a{color:var(--ink)}
.card p{font-size:13.5px;color:var(--mut);flex:1;line-height:1.55}
.dif{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--ink)}
.dif i{font-style:normal;width:8px;height:8px;border-radius:50%;background:var(--cat,var(--brand));flex:none}
.meta-line{font-size:12px;color:var(--mut)}
.card a.read{margin-top:8px;align-self:flex-start;background:var(--cat,var(--brand));border:2px solid var(--cat,var(--brand));color:#08251b;font-weight:700;font-size:16px;border-radius:9999px;padding:12px 30px;min-height:48px;display:inline-flex;align-items:center;box-shadow:0 3px 10px color-mix(in srgb,var(--cat,var(--brand)) 22%,transparent)}
.card a.read:hover{background:var(--cat,var(--brand));color:#0B0D10;opacity:1}
[data-theme=light] .card a.read:hover{color:#fff}
.card a.read::after{content:" →"}
.prog{height:5px;background:var(--bg2);border-radius:4px;overflow:hidden}
.prog b{display:block;height:100%;background:var(--brand)}
h2.sec{font-size:24px;font-weight:500;letter-spacing:-.24px;margin:64px 0 4px;color:var(--ink)}
.sub{color:var(--mut);font-size:16px;margin-bottom:24px}
footer{border-top:1px solid var(--line-soft);margin-top:64px;color:var(--mut);font-size:13px}
footer .wrap{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:var(--radius);padding:30px;text-align:center;color:var(--mut)}
.empty p{margin:0 0 14px;font-size:14px}
.empty-cats{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 0 16px}
.empty .chip{font-family:var(--mono);font-size:12px;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:9999px;border:1px solid var(--line);background:var(--base);color:var(--mut);text-decoration:none}
.empty .chip:hover{border-color:var(--brand);color:var(--brand)}
.empty a{color:var(--brand);font-weight:600}
/* collection: shelf rows */
.collectlabel{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);margin:56px 0 20px}
.jumpnav{display:flex;gap:8px;flex-wrap:wrap;margin:-6px 0 30px}
.jumpnav a{font-size:13px;font-weight:500;background:var(--card);border:1px solid var(--line-soft);border-radius:9999px;padding:5px 14px;color:var(--mut)}
.jumpnav a:hover{border-color:var(--line);color:var(--ink)}
.morewrap{text-align:center;margin:8px 0 40px}
.shelf{margin:0 0 28px}
.shelf-head{margin-bottom:10px}
.shelf-head h2{font-size:18px}
.jumpnav{margin:-2px 0 18px;gap:6px}
.jumpnav a{font-size:12px;padding:4px 11px}
.hero{padding:48px 24px 20px}
.hero h1{font-size:clamp(32px,4.5vw,52px)}
.hero p{font-size:16px;margin:10px auto 0}
.shelf-head{display:flex;align-items:baseline;gap:14px;margin-bottom:16px}
.shelf-head h2{font-size:20px;font-weight:700;letter-spacing:-.2px;padding-bottom:8px;border-bottom:2px solid var(--cat,var(--brand))}
.shelf-head span{font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.6px;text-transform:uppercase;color:var(--mut)}
.shelf-head .arrows{margin-left:auto;display:flex;gap:8px}
.shelf-head .arrows button{width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:15px;cursor:pointer;line-height:1}
.shelf-head .arrows button:hover{border-color:var(--brand);color:var(--brand)}
.rail{display:flex;gap:20px;overflow-x:auto;padding:4px 24px 16px 2px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
.rail .card{flex:0 0 272px;scroll-snap-align:start}
.rail .card p{-webkit-line-clamp:3}
/* roadmap — dense left-aligned editorial timeline */
.route{list-style:none;position:relative;margin:0;padding:6px 0 10px 36px;display:flex;flex-direction:column;gap:8px}
.route::before{content:"";position:absolute;top:4px;bottom:4px;left:18px;width:2px;background:var(--line);opacity:.5;border-radius:2px}
.stop{position:relative;width:auto;margin:0}
.stop::before{content:attr(data-mile);position:absolute;left:-30px;top:12px;width:24px;height:24px;border-radius:50%;background:var(--card);border:1.5px solid var(--cat,var(--brand));color:var(--ink);font-family:var(--mono);font-size:9px;font-weight:600;display:flex;align-items:center;justify-content:center;z-index:2;box-shadow:0 1px 4px rgba(0,0,0,.1)}
.stop .card{margin:0;padding:13px 14px;gap:5px;border-radius:10px;display:grid;grid-template-columns:1fr auto;align-items:center}
.stop .card .num{grid-column:1 / -1}
.stop .card h3{grid-column:1;font-size:14.5px;line-height:1.25}
.stop .card p{grid-column:1;font-size:12px;line-height:1.45;-webkit-line-clamp:2;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
.stop .card .dif{grid-column:1}
.stop .card a.read{grid-column:2;grid-row:2 / 5;align-self:center;margin:0}
.trip{position:relative;text-align:left;margin:4px 0 6px;padding-left:36px}
.trip span{font-size:9px;padding:4px 10px}
@media(max-width:700px){
.route::before{left:22px}
.stop{width:auto;margin:0 0 14px 52px}
.stop:nth-child(even of .stop){margin-left:52px}
.stop:nth-child(odd of .stop)::before,.stop:nth-child(even of .stop)::before{left:-44px;right:auto}
.trip{text-align:left;padding-left:8px}
}
.cores-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
@media(max-width:1024px){.cores-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:600px){.cores-grid{grid-template-columns:1fr}}
/* reader */
.rlayout{display:flex;max-width:1320px;margin:0 auto;min-height:100vh;min-height:100dvh}
aside.toc{width:300px;flex:none;border-right:1px solid var(--line-soft);padding:0 14px 24px;position:sticky;top:57px;height:calc(100vh - 57px);height:calc(100dvh - 57px);overflow:auto;counter-reset:tocsec;scrollbar-width:thin}
aside.toc .toc-head{position:sticky;top:0;z-index:2;background:var(--bg);margin:0 -14px;padding:20px 14px 12px;border-bottom:1px solid var(--line-soft)}
aside.toc h4{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--mut)}
aside.toc a{position:relative;display:block;font-size:13.5px;font-weight:500;color:var(--mut);text-decoration:none;padding:8px 12px 8px 40px;border-radius:10px;line-height:1.45;transition:background .15s ease,color .15s ease,transform .15s ease}
aside.toc a::before{counter-increment:tocsec;content:counter(tocsec,decimal-leading-zero);position:absolute;left:13px;top:9px;font-family:var(--mono);font-size:10px;color:var(--mut);opacity:.7}
aside.toc a:hover{color:var(--ink);background:var(--bg2);transform:translateX(2px)}
aside.toc a:hover::before{opacity:1}
aside.toc a.cur{background:var(--acc-soft);color:var(--brand);font-weight:700}
aside.toc a.cur::before{color:var(--brand);opacity:1}
[data-theme=light] aside.toc a.cur{color:#0fa76e}
main.read{flex:1;min-width:0;padding:32px 32px 90px}
.readbody{margin:0 auto;max-width:820px}
.readbody .page{width:auto !important;min-height:0 !important;margin:0 auto 22px !important;padding:26px !important;border-radius:14px;scroll-margin-top:80px}
.readbody .page.cover{align-items:flex-start !important}
.readbody .cover{display:grid;grid-template-columns:1fr !important;max-width:100%}
.readbody .cover-left{padding:28px 22px !important}
.readbody .cover-right{padding:28px 22px !important;border-left:none !important;border-top:1px solid #2a2f2d}
.readbody .cover-title{font-size:34px !important;letter-spacing:-.5px}
@media(max-width:700px){.readbody .pipeline,.readbody .map-row,.readbody .arch-row,.readbody .dec-branches,.readbody .lab-step,.readbody .v-stage{flex-wrap:wrap}.readbody .pipeline .stage,.readbody .map-box,.readbody .arch-node{flex:1 1 140px;min-width:0}.readbody .pipeline .connector,.readbody .map-arr{flex-shrink:0}.readbody .lab-step .lab-content,.readbody .lab-step .step-body{min-width:0}.readbody .cmdres{grid-template-columns:1fr !important}.readbody .cmdres .col,.readbody .cmdres .res-block,.readbody .cmdres .term-box,.readbody .cmdres .cmd-block{min-width:0}}
.readbody .cover-sub{font-size:16px !important;margin-bottom:24px !important}
.readbody .cover h1{font-size:32px !important}
.readbody .cover .sig{white-space:normal !important}
.readbody .page,.readbody .cover,.readbody .cover-left,.readbody .cover-right{max-width:100%}
.readbody pre,.readbody .terminal{position:relative;overflow-x:auto;max-width:100%;scrollbar-width:thin;white-space:pre}
.readbody code,.readbody .mono{overflow-wrap:anywhere}.readbody .step .mono{overflow-wrap:break-word}
.readbody .md-fallback{font-size:18px;line-height:var(--lh,1.75)}
.readbody .md-fallback .body{font-size:18px;line-height:inherit;margin:14px 0}
.readbody .md-fallback .sec{font-size:27px;line-height:1.25;margin:30px 0 12px}
.readbody .md-fallback .tight{font-size:17px;line-height:1.7;margin:14px 0 14px 24px}
.readbody .md-fallback .terminal{font-size:15px;line-height:1.6;padding:16px}
.readbody .md-fallback.cover h1{font-size:32px;line-height:1.1}
.copybar{display:flex;justify-content:flex-end;margin:0 0 8px}
.copybtn{position:static;background:var(--bg);border:1px solid rgba(255,255,255,.14);color:var(--ink);border-radius:9999px;font-size:12px;font-weight:500;padding:4px 12px;cursor:pointer}
[data-theme=light] .copybtn{border-color:rgba(0,0,0,.08)}
.copybtn:hover{opacity:.7}
mark{background:var(--acc-soft);color:var(--ink);border-radius:3px;padding:0 2px}
.chapnav{display:flex;justify-content:space-between;gap:12px;margin-top:32px}
.chapnav a{flex:1;background:var(--card);border:1px solid var(--line-soft);border-radius:16px;padding:16px 24px;text-decoration:none;color:var(--ink);font-size:14px;font-weight:500;box-shadow:var(--shadow)}
.chapnav a:hover{border-color:var(--line)}
.chapnav a small{display:block;font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);margin-bottom:4px}
.chapnav a.r{text-align:right}
.drawer{display:none;position:fixed;inset:0;z-index:70}
.drawer.open{display:block}
.drawer .scrim{position:absolute;inset:0;background:rgba(0,0,0,.5)}
.drawer .panel{position:absolute;right:0;top:0;bottom:0;width:320px;background:var(--card);border-left:1px solid var(--line-soft);padding:24px 32px;overflow:auto;box-shadow:var(--shadow)}
.drawer .panel h3{font-size:20px;font-weight:600;letter-spacing:-.2px;margin-bottom:4px}
.setrow{margin:20px 0}
.setrow h5{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);margin-bottom:10px}
.setrow .opts{display:flex;gap:8px;flex-wrap:wrap}
.setrow .opts .btn.on{border-color:var(--ink);background:var(--ink);color:var(--bg)}
.tocbtn{display:inline-flex;align-items:center}
.pdflink{display:inline-block;margin-top:12px;background:var(--ink);color:var(--bg);border-radius:9999px;padding:8px 24px;text-decoration:none;font-size:14px;font-weight:500;box-shadow:var(--shadow-btn)}
.pdflink:hover{opacity:.85;color:var(--bg)}
.crumbs{display:flex;align-items:center;gap:8px;font-size:13.5px;min-width:0}
.crumbs .here{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
.crumbs .sep{color:var(--mut)}
@media(max-width:900px){aside.toc{position:fixed;left:0;top:0;bottom:0;background:var(--card);z-index:60;transform:translateX(-105%);transition:transform .2s;height:100vh;height:100dvh}
aside.toc.open{transform:none}.tocscrim{display:none}@media(max-width:900px){body.toc-open .tocscrim{display:block;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:55}}
aside.toc a{padding:11px 12px 11px 40px;font-size:15px}
.tocbtn{display:inline-block}
main.read{padding:20px 14px 90px}
.crumbs .here{max-width:140px}
.hero{padding:36px 0 6px}
.chapnav{flex-direction:column}
.readbody table,.readbody .terminal,table.gloss{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}
.drawer .panel{width:min(320px,88vw)}}
aside.toc a{scroll-margin-top:0}
body.lock{overflow:hidden}
@media(min-width:901px){body.toc-hide aside.toc{display:none}}
#fsbar{display:none;position:fixed;left:50%;transform:translateX(-50%);bottom:max(14px,env(safe-area-inset-bottom));z-index:80;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:8px 10px;gap:5px;box-shadow:var(--shadow-lift);align-items:center;max-width:96vw}
body.fs #fsbar{display:flex}
body.fs main.read{padding-top:24px}
#fsbar .btn{min-height:44px;padding:7px 14px}
#fsexit-m{display:none;position:fixed;top:12px;right:12px;z-index:90;min-height:44px;min-width:44px;border-radius:12px}
@media(max-width:900px){body.fs #fsbar{display:none !important}body.fs #fsexit-m{display:inline-flex;align-items:center;justify-content:center}}
#fs-prog{font-family:var(--mono);font-size:12px;color:var(--mut);padding:0 8px;white-space:nowrap}
body.fs .topbtn,body.lock .topbtn{display:none !important}
.toc-head{display:flex;align-items:center;gap:8px;margin-bottom:12px}.toc-head h4{flex:1;min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.drawerx{position:static;flex:0 0 auto;width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:1px solid var(--line);border-radius:10px;color:var(--mut);font-size:20px;cursor:pointer}
.drawerx:hover{color:var(--ink);border-color:var(--brand)}
.readbody .step{list-style:none;display:flex;gap:10px;align-items:flex-start;margin:8px 0}
.readbody .step input[type=checkbox]{width:22px;height:22px;flex:none;margin-top:2px;accent-color:var(--brand);cursor:pointer;flex:none}.readbody .stephit{display:inline-flex;padding:11px;margin:-11px;cursor:pointer;flex:none}
.readbody pre,.readbody .terminal{background-image:linear-gradient(to left,rgba(127,127,127,.28),transparent 16px);background-position:right center;background-size:16px 100%;background-repeat:no-repeat;background-attachment:scroll}
@media(max-width:600px){
.wrap{padding:16px 14px}
.search input,#mobileq{font-size:16px}
.grid{grid-template-columns:1fr}
.hero .stats{gap:6px}
main.read{padding:16px 10px 90px}
.readbody .page{padding:18px !important}
.btn{min-height:40px}
.readbody pre,.readbody .terminal{font-size:11px}}
@media(max-width:480px){
header.top .wrap{height:56px;min-height:56px;padding:8px 10px;gap:7px;flex-wrap:nowrap}
header.top .crumbs{flex:1;min-width:0;gap:5px;font-size:12px}
header.top .crumbs .logo{font-size:13px;gap:4px}
header.top .crumbs .logo svg{width:17px;height:17px}
header.top .crumbs .sep,header.top .crumbs .here{display:none}
header.top .search,header.top #qcount,header.top #markbtn,header.top nav.reader-nav{display:none}
header.top .mobilemenu{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;font-size:19px}
header.top #tocbtn{display:inline-flex;order:2;width:78px;height:44px;padding:0;overflow:hidden;font-size:0;align-items:center;justify-content:center;color:transparent}
header.top #tocbtn::before{content:'Contents';font-size:11px;font-family:var(--mono);color:var(--ink)}
header.top #backbtn{display:inline-flex;order:3;font-size:12px;padding:5px 9px;min-height:44px;align-items:center}
.topbtn{right:12px;bottom:14px}
.mobile-controls,.mobile-search{display:flex;gap:8px;flex-wrap:wrap}
.mobile-controls .btn{min-height:38px}
.mobile-search{display:block}.mobile-search label{display:block;font-family:var(--mono);font-size:11px;text-transform:uppercase;color:var(--mut);margin-bottom:7px}.mobile-search input{width:100%;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:9999px;padding:9px 12px}
}
/* shared non-reader chrome: keep the landing, shelf, roadmap and glossary
   inside the viewport instead of letting the nav establish a wide canvas */
@media(max-width:600px){
header.top .wrap{min-width:0;max-width:100%;padding:8px 10px;gap:4px;overflow:hidden}
header.top .logo{font-size:14px;gap:5px;flex:none}
header.top .logo{margin-right:0}
header.top .logo span{display:none}
header.top .search{display:none}
header.top .btn{padding:5px 7px;font-size:11px;min-height:44px}
header.top .wrap>.btn{flex:none}
header.top #themebtn{width:28px;min-width:28px;min-height:44px;padding:0}
}
@media(min-width:601px) and (max-width:900px){
header.top .wrap{min-width:0;max-width:100%;padding:10px 18px;gap:8px;overflow:hidden}
header.top .search{display:none}
header.top .btn{padding:6px 11px;font-size:13px;flex:none}
}


/* icon: dark glyphs (github #181717 + currentColor line icons) invert ONLY on dark surfaces; light/sepia keep native dark svg */
:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="github"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="github"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="workflow"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="hammer"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="package"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="database"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="puzzle"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="server"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="terminal"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="shield"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="activity"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="webhook"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="wrench"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="flask"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="rocket"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="workflow"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="hammer"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="package"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="database"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="puzzle"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="server"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="terminal"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="shield"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="activity"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="webhook"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="wrench"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="flask"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="rocket"]{filter:invert(1) brightness(1.05);}
/* icon: currentColor line glyphs resolve via OS CanvasText (unreliable) — force black strokes on light surfaces */
:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="github"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="github"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="workflow"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="hammer"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="package"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="database"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="puzzle"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="server"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="terminal"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="shield"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="activity"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="webhook"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="wrench"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="flask"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="rocket"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="workflow"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="hammer"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="package"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="database"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="puzzle"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="server"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="terminal"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="shield"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="activity"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="webhook"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="wrench"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="flask"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="rocket"]{filter:brightness(0);}


@media print{body{background:#fff !important;color:#000 !important}header.top,aside.toc,.drawer,.chapnav,.copybtn,.settingsbar,.copybar,.codehead,.topbtn,#resume,#fsbar,.drawerx{display:none !important}
main.read{padding:0}.readbody{max-width:none}}
table.gloss{width:100%;border-collapse:collapse;font-size:14px;margin:16px 0}
table.gloss td,table.gloss th{border:1px solid var(--line);padding:9px 11px;text-align:left}
table.gloss th{background:var(--bg2)}
table.gloss .upd{color:var(--brand);font-weight:700;font-size:11px;white-space:nowrap}
.gtbar{position:sticky;top:57px;z-index:15;background:var(--bg);padding:10px 0 6px}
.gtbar input{width:100%;background:var(--card);border:1px solid var(--line);color:var(--ink);border-radius:9999px;padding:9px 14px;font-size:14px}
.az{display:flex;gap:4px;overflow-x:auto;padding:8px 2px 2px;-webkit-overflow-scrolling:touch}
.az a,.az span.dim{flex:none;min-width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:8px;font-family:var(--mono);font-size:13px;color:var(--ink)}
.az a{background:var(--card)}
.az span.dim{opacity:.3}
table.gloss tr{scroll-margin-top:150px}
table.gloss tbody tr:hover td{background:color-mix(in srgb,var(--brand) 6%,transparent)}
table.gloss tr.gletter td{background:var(--bg2);font-family:var(--mono);font-size:12px;letter-spacing:.15em;border-top:2px solid var(--line)}
table.gloss tr.gletter{scroll-margin-top:150px}
table.gloss tr:target td{background:color-mix(in srgb,var(--brand) 12%,transparent)}
.gtbar .az a:hover{border-color:var(--brand);color:var(--brand)}
@media(max-width:600px){table.gloss,table.gloss tbody{display:block;width:100%;overflow:visible}table.gloss tr:first-child{display:none}table.gloss tr{display:block;background:var(--card);border:1px solid var(--line-soft);border-radius:12px;margin:0 0 10px;padding:12px 14px}table.gloss td{display:block;border:none;padding:3px 0}table.gloss td:first-child{font-size:16px}table.gloss td:last-child a{display:inline-block;padding:10px 16px;border:1px solid var(--line);border-radius:9999px}.gtbar input{min-height:44px;font-size:16px}.az a,.az span.dim{min-width:44px;height:44px}}
/* P0: sepia theme + light leak guards + covers + filters + a11y */
[data-theme=sepia]{--bg:#F6F1E7;--bg2:#EDE3CC;--card:#FFFBF0;--ink:#3B2F1E;--mut:#6F665A;--line:rgba(59,47,30,.16);--line-soft:rgba(59,47,30,.09);--acc:#0B9B68;--acc-soft:rgba(11,155,104,.11);--brand:#0B9B68;--shadow:rgba(59,47,30,.08) 0px 2px 8px;--shadow-btn:rgba(59,47,30,.10) 0px 1px 3px;--shadow-lift:rgba(59,47,30,.16) 0px 16px 32px -10px}
[data-theme=sepia] .readbody{--paper:#FFFBF0;--white:#FFFBF0;--ink:#3B2F1E;--muted:#6F665A;--line:rgba(59,47,30,.14);--panel:#EDE3CC;--text-light:#3B2F1E}
[data-theme=light] .readbody{--paper:#ffffff;--white:#ffffff;--ink:#0d0d0d;--muted:#555;--line:rgba(0,0,0,.1);--panel:#f4f4f4;--text-light:#0d0d0d}
[data-theme=light] .readbody .page,[data-theme=sepia] .readbody .page{background:var(--card) !important;color:var(--ink)}
[data-theme=light] .readbody pre,[data-theme=light] .readbody .terminal,[data-theme=sepia] .readbody pre,[data-theme=sepia] .readbody .terminal{background:var(--bg2) !important;color:var(--ink);border:1px solid var(--line)}
.coverart{height:96px;border-radius:10px 10px 0 0;margin:-22px -24px 12px;background:linear-gradient(135deg,var(--cat,#18E299),transparent 140%),repeating-linear-gradient(90deg,rgba(255,255,255,.08) 0 2px,transparent 2px 10px),var(--card);border-bottom:1px solid var(--line-soft);display:flex;align-items:flex-end;padding:10px 14px;overflow:hidden}
.coverart b{font-family:var(--mono);font-size:28px;font-weight:600;letter-spacing:-1px;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.5)}
[data-theme=light] .coverart b,[data-theme=sepia] .coverart b{color:#fff}
.filterbar{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 6px;align-items:center}
.filterbar select,.filterbar input[type=search]{background:var(--card);border:1px solid var(--line);color:var(--ink);border-radius:9999px;padding:7px 14px;font-size:13px;outline:none}
.filterbar .count{margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--mut)}
.toc-l2{padding-left:50px !important}.toc-l3{padding-left:60px !important}.toc-num{font-family:var(--mono);font-size:11px;color:var(--mut);margin-right:6px}
.codehead{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;color:var(--mut);margin:12px 0 0;background:var(--bg2);border:1px solid var(--line);border-bottom:none;border-radius:8px 8px 0 0;padding:6px 12px}
.codehead .dot{width:8px;height:8px;border-radius:50%;background:var(--brand)}
.codehead button{margin-left:auto;background:transparent;border:1px solid var(--line);color:var(--ink);border-radius:9999px;font-size:11px;padding:2px 10px;cursor:pointer}
.readbody img{max-width:100%;height:auto;border-radius:8px}
.readbody img[data-broken]{display:none}
.imgfallback{display:none;background:var(--bg2);border:1px dashed var(--line);border-radius:8px;padding:12px;font-size:13px;color:var(--mut)}
@media(max-width:900px){header.top .wrap{gap:10px}.crumbs .here{max-width:110px} .search kbd{display:none}}
@media(max-width:600px){header.top .wrap{gap:4px}}
@media(max-width:380px){header.top .wrap>a[href$="glossary.html"]{display:none}}


/* icon: dark glyphs (github #181717 + currentColor line icons) invert ONLY on dark surfaces; light/sepia keep native dark svg */
:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="github"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="github"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="workflow"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="hammer"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="package"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="database"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="puzzle"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="server"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="terminal"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="shield"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="activity"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="webhook"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="wrench"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="flask"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .readbody .page.cover img[src*="rocket"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="workflow"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="hammer"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="package"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="database"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="puzzle"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="server"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="terminal"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="shield"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="activity"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="webhook"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="wrench"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="flask"],:is([data-theme="dark"],[data-theme="dim"],[data-theme="contrast"]) .coverart img[src*="rocket"]{filter:invert(1) brightness(1.05);}
/* icon: currentColor line glyphs resolve via OS CanvasText (unreliable) — force black strokes on light surfaces */
:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="github"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="github"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="workflow"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="hammer"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="package"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="database"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="puzzle"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="server"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="terminal"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="shield"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="activity"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="webhook"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="wrench"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="flask"],:is([data-theme="light"],[data-theme="sepia"]) .readbody .page.cover img[src*="rocket"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="workflow"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="hammer"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="package"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="database"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="puzzle"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="server"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="terminal"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="shield"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="activity"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="webhook"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="wrench"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="flask"],:is([data-theme="light"],[data-theme="sepia"]) .coverart img[src*="rocket"]{filter:brightness(0);}


@media print{header.top,aside.toc,.drawer,.chapnav,.copybtn,.copybar,.codehead,.filterbar,#resume,.jumpnav,.shelf-head .arrows{display:none !important} body{background:#fff !important;color:#000 !important} .card,.readbody .page{break-inside:avoid;border:1px solid #ccc !important;background:#fff !important;color:#000 !important} main.read{padding:0}.readbody{max-width:none;font-size:12pt}}
@media(prefers-reduced-motion:reduce){*{animation:none !important;transition:none !important;scroll-behavior:auto !important}.rail{scroll-snap-type:none}}
/* P1: paths + rubric + search dropdown + bookmarks + related + labs + lightbox */
/* Learning Paths — journey cards reusing the map card system (same gradient/border/shadow tokens, --cat accent, currentColor icons) */
.pathgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;margin:16px 0 8px}
.pathcard{position:relative;background:linear-gradient(135deg,color-mix(in srgb,var(--cat) 7%,var(--card)) 0%,var(--card) 55%);border:1.5px solid color-mix(in srgb,var(--cat) 28%,var(--line-soft));border-radius:16px;padding:0;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06),0 8px 24px -8px color-mix(in srgb,var(--cat) 18%,transparent),0 2px 10px rgba(0,0,0,.06);display:flex;flex-direction:column}
.pathcard::before{content:"";position:absolute;top:0;left:0;right:0;height:5px;background:var(--cat,var(--brand));z-index:2}
.pathcard-head{display:flex;gap:12px;align-items:flex-start;padding:22px 20px 0}
.pathcard-head .map-icon{width:42px;height:42px;border-radius:11px;flex:none}
.pathcard-head .map-icon svg{width:22px;height:22px}
.pathcard-titles h3{font-size:16px;font-weight:700;letter-spacing:-.2px;line-height:1.25}
.pathcount{font-family:var(--mono);font-size:11px;color:var(--mut);font-weight:500}
.pathdesc{font-size:13px;color:var(--mut);line-height:1.55;padding:8px 20px 0}
.pathsteps{list-style:none;margin:12px 0 0;padding:2px 20px 0;position:relative;display:flex;flex-direction:column}
.pathstep{position:relative;padding:2px 0 16px 36px;min-height:44px}
.pathstep::before{content:attr(data-n);position:absolute;left:0;top:0;width:26px;height:26px;border-radius:50%;background:var(--card);border:1.5px solid var(--cat,var(--brand));color:var(--ink);font-family:var(--mono);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;z-index:1}
.pathstep::after{content:"";position:absolute;left:12px;top:28px;bottom:0;width:2px;background:color-mix(in srgb,var(--cat) 32%,var(--line-soft));border-radius:2px}
.pathstep:last-child::after{display:none}
.pathstep.finish::before{background:var(--cat,var(--brand));border-color:var(--cat,var(--brand));color:#0B0D10}
[data-theme=light] .pathstep.finish::before{color:#fff}
.pathsteps.long .pathstep{padding-bottom:9px;min-height:38px}
.steptitle{display:block;font-size:14.5px;font-weight:600;line-height:1.35;color:var(--ink)}
.steptitle:hover{color:var(--cat,var(--brand))}
.stepmeta{display:block;font-family:var(--mono);font-size:11px;color:var(--mut);margin-top:3px}
.finpill{display:inline-block;font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.4px;background:color-mix(in srgb,var(--cat) 12%,transparent);border:1px solid color-mix(in srgb,var(--cat) 35%,transparent);color:var(--cat);border-radius:9999px;padding:1px 8px;margin-left:6px;white-space:nowrap}
.difbadge{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:3px 9px;border-radius:9999px;border:1px solid;color:var(--cat);background:color-mix(in srgb,var(--cat) 10%,var(--bg2));border-color:color-mix(in srgb,var(--cat) 22%,var(--line-soft));white-space:nowrap}
.difbadge.beg{--cat:#2ECC71}
.difbadge.int{--cat:#F5A524}
.difbadge.adv{--cat:#E5484D}
.pathfoot{display:flex;gap:6px;flex-wrap:wrap;padding:14px 20px 18px;margin-top:auto}
@media(max-width:600px){.pathgrid{grid-template-columns:1fr}.pathstep{padding-bottom:14px}.pathsteps.long .pathstep{padding-bottom:8px}}
.rubric{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}
.rubric div{flex:1;min-width:200px;background:var(--card);border:1px solid var(--line-soft);border-radius:10px;padding:12px 16px;font-size:13px;color:var(--mut)}
.rubric b{display:block;color:var(--ink);margin-bottom:4px}
.searchwrap{position:relative}
.searchdrop{position:absolute;top:110%;left:0;right:0;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow-lift);overflow:hidden;z-index:50;display:none;max-height:320px;overflow:auto}
.searchdrop.open{display:block}
.searchdrop a{display:block;padding:9px 16px;font-size:14px;border-bottom:1px solid var(--line-soft)}
.searchdrop a small{display:block;font-size:11px;color:var(--mut)}
.searchdrop a:hover{background:var(--bg2)}
.markbtn{background:transparent;border:1px solid var(--line);color:var(--ink);border-radius:9999px;font-size:12px;padding:4px 12px;cursor:pointer}
.markbtn.on{background:var(--acc-soft);border-color:var(--brand);color:var(--brand)}
.relatedbox{background:var(--card);border:1px solid var(--line-soft);border-radius:14px;padding:18px 22px;margin-top:28px}
.relatedbox h4{font-family:var(--mono);font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);margin-bottom:12px}
.relgrid{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;margin:0;padding:0}
.relcard{position:relative;display:flex;gap:10px;align-items:flex-start;background:var(--bg2);border:1px solid var(--line-soft);border-left:3px solid var(--cat,var(--brand));border-radius:10px;padding:10px 12px}
.rel-icon{width:30px;height:30px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--cat) 12%,var(--bg2));border:1px solid color-mix(in srgb,var(--cat) 18%,var(--line-soft));color:var(--cat)}
.rel-icon svg{width:16px;height:16px;display:block}
.rel-main{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.rel-main>a{font-size:13.5px;font-weight:600;line-height:1.35;color:var(--ink)}
.rel-main>a:hover{color:var(--cat,var(--brand))}
.rel-meta{font-family:var(--mono);font-size:11px;color:var(--mut);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.rel-why{font-family:var(--mono);font-size:10px;font-weight:600;color:var(--cat)}
@media(max-width:600px){.relgrid{grid-template-columns:1fr}}
.upnext{display:flex;justify-content:space-between;gap:10px;background:var(--acc-soft);border:1px solid var(--brand);border-radius:14px;padding:14px 20px;margin-top:20px;font-size:14px}
.labcheck{list-style:none;margin:12px 0}
.labcheck li{display:flex;gap:10px;align-items:flex-start;background:var(--card);border:1px solid var(--line-soft);border-radius:10px;padding:10px 14px;margin-bottom:8px;font-size:14px}
.labcheck li.done{opacity:.6;text-decoration:line-through}
.labcheck input{margin-top:4px;accent-color:var(--brand)}
.labbanner{background:var(--acc-soft);border:1px solid var(--brand);border-radius:12px;padding:12px 18px;margin:0 auto 20px;max-width:820px;font-size:14px}
#lightbox{display:none;position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.85);align-items:center;justify-content:center;padding:24px}
#lightbox.open{display:flex}
#lightbox img{max-width:94vw;max-height:90vh;max-height:90dvh;border-radius:10px}
.readbody table{border-collapse:collapse}
.readbody thead th{position:sticky;top:0;background:var(--bg2);z-index:1}
.readbody tbody tr:nth-child(even){background:rgba(127,127,127,.07)}
.readbody thead th{position:sticky;top:57px;background:var(--bg2);z-index:2}
.bookhero{display:flex;gap:26px;flex-wrap:wrap;margin:30px 0}
.bookhero .coverart{height:190px;flex:0 0 220px;margin:0;border-radius:14px;align-items:center;justify-content:center}
.bookhero .coverart b{font-size:54px}
.chiprow{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.chiprow a,.chiprow span{font-size:12px;border:1px solid var(--line);border-radius:9999px;padding:4px 12px;color:var(--mut)}
.chiprow a:hover{color:var(--ink);border-color:var(--brand)}
.outcomes{background:var(--card);border:1px solid var(--line-soft);border-radius:12px;padding:14px 20px;margin:16px 0}
.outcomes li{margin:4px 0 4px 18px;font-size:14px}
/* P2.1: recommended-path strip — single cold-start path, distinct from shelves */
.recstrip{background:var(--card);border:1px solid var(--brand);border-radius:16px;padding:20px 22px;margin:28px 0 8px;box-shadow:var(--shadow)}
.rec-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.rec-head .eyebrow{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--brand);background:var(--acc-soft);border-radius:9999px;padding:5px 14px}
.rec-meta{font-family:var(--mono);font-size:11px;color:var(--mut)}
.rec-steps{list-style:none;display:flex;gap:10px;margin:0 0 14px;padding:0;flex-wrap:wrap}
.rec-steps li{flex:1;min-width:160px;background:var(--bg2);border:1px solid var(--line-soft);border-radius:12px;padding:10px 14px;font-size:13px;color:var(--mut)}
.rec-steps li b{display:block;color:var(--ink);font-size:14px;font-weight:600;margin:2px 0}
.rec-steps li .n{font-family:var(--mono);font-size:11px;color:var(--brand)}
.rec-steps li a{color:var(--ink)}
.rec-cta{display:inline-block;background:var(--brand);color:#0B0D10;font-weight:600;font-size:14px;border-radius:9999px;padding:10px 22px}
[data-theme=light] .rec-cta{color:#fff}
.rec-cta:hover{opacity:.85;color:#0B0D10}
[data-theme=light] .rec-cta:hover{color:#fff}
@media(max-width:700px){.rec-steps{flex-direction:column}.rec-steps li{min-width:0}}
/* P2.2: reader orientation — breadcrumb + prereq + path position (existing vars only) */
.upnext{background:var(--card);border:0;border-left:3px solid var(--brand);border-radius:0;padding:14px 18px;margin-top:22px;box-shadow:0 1px 0 var(--line-soft)}
.labbanner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--card);border:0;border-left:3px solid var(--brand);border-radius:0;padding:12px 16px;margin:0 auto 24px;max-width:820px;font-size:14px;box-shadow:0 1px 0 var(--line-soft)}
.labbanner a{color:var(--brand);font-weight:600;text-decoration:underline;text-underline-offset:3px}
.labbanner .markbtn{margin-left:auto !important;background:transparent;border:1px solid var(--line);color:var(--ink);border-radius:7px;padding:6px 10px}
/* P2.4: mobile icon-chain reflow (≤480px only, desktop untouched) */
@media(max-width:480px){
.readbody .life{flex-direction:column;gap:0}
.readbody .life .lconn{transform:rotate(90deg);padding:3px 0;align-self:center}
.readbody .life .lnode{display:flex;align-items:center;gap:10px;text-align:left;padding:8px 12px}
.readbody .life .lnode img{margin:0;flex:none}
.readbody .life .lnode b{font-size:11px}
.readbody .two{grid-template-columns:1fr}.readbody .timeline{flex-wrap:wrap;row-gap:6px}
.readbody .fnode{font-size:13px}
.readbody .vflow{margin:8px 0}
}
/* P2: typography, reading preferences, and ratings */
body[data-font=serif] .readbody{font-family:Georgia,'Times New Roman',serif}
body[data-font=serif] .readbody code,body[data-font=serif] .readbody pre,body[data-font=serif] .readbody .terminal{font-family:var(--mono)}
.readbody{line-height:var(--lh,1.7)}
.readback{display:inline-flex;align-items:center;gap:6px;color:var(--mut);text-decoration:none;font-size:13px;font-weight:600;border:1px solid var(--line-soft);border-radius:9999px;padding:5px 12px;white-space:nowrap}
.readback:hover{color:var(--ink);border-color:var(--line);background:var(--bg2)}
.topbtn{position:fixed;right:20px;bottom:20px;z-index:40;width:42px;height:42px;border:1px solid var(--line);border-radius:50%;background:var(--card);color:var(--ink);box-shadow:var(--shadow-lift);font-size:19px;cursor:pointer;opacity:0;visibility:hidden;transform:translateY(8px);transition:opacity .2s ease,transform .2s ease,visibility .2s ease}
.topbtn.on{opacity:1;visibility:visible;transform:none}
.mobilemenu{display:none}
.reader-nav{display:flex;align-items:center;gap:8px}
.mobile-controls,.mobile-search{display:none}
@media(prefers-reduced-motion:reduce){.topbtn{transition:none}}
.popsearch{font-size:12px;color:var(--mut);margin-top:6px}
.popsearch a{color:var(--mut);text-decoration:underline;cursor:pointer}
/* — HOME: SIGNAL contents — */
.hm-hero{position:relative;border:2px solid var(--line);border-radius:18px;background:var(--card);padding:38px 32px 32px;margin:26px 0 8px;overflow:hidden;box-shadow:var(--shadow-lift)}
.hm-hero::before{content:'';position:absolute;top:0;left:0;right:0;height:7px;background:linear-gradient(90deg,var(--brand) 0 55%,#4f46e5 55% 100%)}
.hm-hero::after{content:'';position:absolute;top:-120px;right:-120px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle at center,color-mix(in srgb,var(--brand) 14%,transparent) 0%,transparent 70%);pointer-events:none}
.hm-hero .hm-sub{position:relative}
.hm-band{display:flex;justify-content:center;gap:5px;margin-bottom:18px}
.hm-band i{width:9px;border-radius:3px 3px 0 0;background:var(--brand);opacity:.85;display:block}
.hm-kick{font-family:var(--mono);font-size:11px;font-weight:800;letter-spacing:.3em;text-transform:uppercase;color:var(--brand);text-align:center}
.hm-hero h1{font-size:clamp(34px,5vw,54px);font-weight:800;letter-spacing:-1px;text-align:center;margin:10px 0 4px}
.hm-sub{text-align:center;color:var(--mut);font-size:16px;margin:0 auto;max-width:560px}
.hm-about{text-align:center;color:var(--mut);font-size:14px;line-height:1.65;margin:16px auto 4px;max-width:640px}
.hm-about b{color:var(--ink)}
.hm-about a{color:var(--brand);font-weight:700;text-decoration:none;border-bottom:1px dotted var(--brand)}
.hm-vols{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:22px}
.hm-vol{display:inline-flex;align-items:center;gap:9px;border:2px solid var(--line);border-radius:10px;background:var(--bg);padding:9px 16px;font-size:13px;font-weight:700;color:var(--ink);text-decoration:none;transition:border-color .15s,transform .15s,box-shadow .15s;box-shadow:var(--shadow-btn)}
.hm-vol:hover{border-color:var(--cat);transform:translateY(-2px);box-shadow:var(--shadow-lift)}
.hm-vol i{width:10px;height:10px;border-radius:3px;background:var(--cat);flex:none}
.hm-vol .vc{font-family:var(--mono);font-size:10px;color:var(--mut);font-weight:600}
.hm-label{display:flex;align-items:baseline;gap:12px;font-family:var(--mono);font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--mut);margin:38px 0 6px;padding-top:8px;border-top:1px solid var(--line-soft)}
.hm-label::after{content:'';flex:1;border-bottom:2px dotted var(--line)}
.hm-label .lc{color:var(--cat)}
.hm-list{display:flex;flex-direction:column;margin:6px 0 14px;max-width:880px}
.hm-row{display:flex;align-items:center;gap:14px;padding:14px 12px;text-decoration:none;color:var(--ink);border-bottom:1px solid var(--line-soft);background:var(--bg);transition:background .12s,border-color .12s,transform .12s}
.hm-row:first-child{border-top:1px solid var(--line-soft)}
.hm-row:hover{background:var(--bg2);border-color:var(--line);transform:translateX(3px)}
.hm-row:hover .hm-cat{color:var(--cat)}
.hm-row:hover .hm-ico{background:color-mix(in srgb,var(--cat) 22%,var(--bg2));color:var(--cat);transform:rotate(-6deg)}
.hm-row:focus-visible{outline:2px solid var(--cat);outline-offset:2px;border-radius:10px}
.hm-num{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--cat);width:26px;flex:none;text-align:right;opacity:.85}
.hm-ico{width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--cat) 12%,var(--bg2));border:1px solid color-mix(in srgb,var(--cat) 18%,var(--line-soft));color:var(--cat);flex:none;transition:background .12s,transform .12s}
.hm-ico svg{width:22px;height:22px;display:block}
.hm-main{min-width:0;flex:1}
.hm-kicker{display:block;font-family:var(--mono);font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--cat);margin-bottom:2px}
.hm-cat{display:block;font-size:17px;font-weight:800;letter-spacing:-.25px;line-height:1.15}
.hm-desc{display:block;font-size:13px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.hm-pills{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.hm-dots{flex:1;border-bottom:2px dotted var(--line);transform:translateY(-4px);min-width:16px;opacity:.5}
.hm-go{color:var(--cat);font-weight:800;font-size:18px;opacity:0;transition:opacity .15s,transform .15s;flex:none}
.hm-row:hover .hm-go,.hm-row:focus-visible .hm-go{opacity:1;transform:translateX(2px)}
.hm-row.hm-series{background:linear-gradient(180deg,color-mix(in srgb,#18E299 10%,var(--bg)) 0%,var(--bg) 45%);border-color:color-mix(in srgb,#18E299 30%,var(--line))}
.hm-row.hm-series .hm-ico{background:color-mix(in srgb,#18E299 22%,var(--bg2));color:#18E299}


.series-card:hover{border-color:#18E299;transform:translateY(-2px);box-shadow:var(--shadow-lift)}



.map-pill.dif-beginner{background:color-mix(in srgb,#2ECC71 16%,var(--bg2));border-color:color-mix(in srgb,#2ECC71 30%,var(--line-soft));color:#2ECC71}
.map-pill.dif-intermediate{background:color-mix(in srgb,#F5A524 16%,var(--bg2));border-color:color-mix(in srgb,#F5A524 30%,var(--line-soft));color:#F5A524}
.map-pill.dif-advanced{background:color-mix(in srgb,#E5484D 16%,var(--bg2));border-color:color-mix(in srgb,#E5484D 30%,var(--line-soft));color:#E5484D}
@media(max-width:600px){.hm-desc{display:none}.hm-ico{width:34px;height:34px}.hm-ico svg{width:18px;height:18px}.hm-pills{display:none}.hm-vols{gap:8px}.hm-hero{padding:30px 18px 26px}.hm-meta{font-size:10.5px}}
.map-icon{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--cat) 12%,var(--bg2));border:1px solid color-mix(in srgb,var(--cat) 18%,var(--line-soft));color:var(--cat);flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
[data-theme=dark] .map-icon,[data-theme=dim] .map-icon{box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
.map-icon svg{width:28px;height:28px;display:block}
.map-pill{font-family:var(--mono);font-size:11px;font-weight:600;padding:3px 9px;border-radius:9999px;background:color-mix(in srgb,var(--cat) 8%,var(--bg2));border:1px solid color-mix(in srgb,var(--cat) 14%,var(--line-soft));color:var(--mut)}
.map-pill b{color:var(--ink)}
@media(max-width:768px){
.wrap{padding:16px}
.hm-hero{padding:24px 18px 20px;margin:14px 0 6px;border-radius:14px}
.hm-hero h1{font-size:32px}
.hm-hero .hm-sub{font-size:15px}
.hm-hero .hm-about{font-size:13px}

.toolgrid{grid-template-columns:1fr}
.stackgrid{grid-template-columns:1fr}
.projgrid{grid-template-columns:1fr}
.pathgrid{grid-template-columns:1fr}
.thread-grid{grid-template-columns:1fr}
.fgrid{grid-template-columns:1fr}
.readbody{padding:16px}
.readbody .page{padding:18px}
.searchwrap input{font-size:16px}
}
@media(max-width:600px){
.hm-row{padding:12px 10px;gap:10px;align-items:flex-start}
.hm-row .hm-num{width:22px;font-size:11px}
.hm-row .hm-ico{width:36px;height:36px;flex:none}
.hm-row .hm-ico svg{width:20px;height:20px}
.hm-cat{font-size:15px}
.hm-desc{font-size:12px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.hm-pills{display:flex;gap:5px;margin-top:4px}
.hm-pills .map-pill{font-size:10px;padding:2px 7px}
.hm-go{opacity:1;font-size:16px}


.toolcard{padding:14px}
.stackcard{padding:14px}
.projcard{padding:14px}
.pathcard-head{padding:16px 14px 0}
.pathdesc{padding:6px 14px 0;font-size:12px}
.pathsteps{padding:2px 14px 0}
.pathfoot{padding:10px 14px 14px}
.thread-card{padding:12px 14px}
.fcard{perspective:none}
.fcard-inner{height:auto;min-height:140px}
.fcard-front,.fcard-back{position:relative;inset:auto;transform:none !important;height:auto;min-height:140px}
.fcard.flipped .fcard-inner{transform:none}
.fcard-back{transform:none;display:none}
.fcard.flipped .fcard-front{display:none}
.fcard.flipped .fcard-back{display:flex}
.gtbar{top:52px;padding:8px 0 6px}
.gtbar input{min-height:44px;font-size:16px}
.az{padding:6px 0 2px;gap:3px}
.az a,.az span.dim{min-width:40px;height:40px;font-size:12px}
.qcard{margin:14px auto;padding:18px}
.qcard .opts .btn{flex:1 1 100%;min-height:44px;font-size:14px}
.tcard{padding:14px}
.stack-icons .stack-icon{width:36px;height:36px}
.stack-icons .stack-icon img{width:22px;height:22px}
.proj-icons .stack-icon.sm{width:32px;height:32px}
.wrap{padding:14px}
footer .wrap{flex-direction:column;gap:8px;text-align:center}
.searchwrap{width:100%}
}
@media(max-width:380px){
.hm-hero h1{font-size:28px;letter-spacing:-0.8px}
.hm-hero .hm-kick{font-size:10px;letter-spacing:.2em}
.hm-cat{font-size:14px}
.hm-num{display:none}
.wrap{padding:12px}
header.top .wrap{padding:6px 8px}
.fgrid{grid-template-columns:1fr;gap:10px}
.toolgrid{gap:10px}
}
@media(prefers-reduced-motion:reduce){
*{animation:none !important;transition:none !important;scroll-behavior:auto !important}
}
"""

BASE_JS = """
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
function getP(k,d){try{const v=JSON.parse(localStorage.getItem(k));return v??d}catch(e){return d}}
function setP(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
"""

INDEX_JS = BASE_JS + """
const PREF='cicdlib:pref',PROG='cicdlib:prog:';
const pref=getP(PREF,{theme:'sepia'});
const THEMES=['sepia','dark','light'],THICON={dark:'☀',light:'☾',sepia:'◐'};
function syncTheme(){const th=THEMES.includes(pref.theme)?pref.theme:'sepia';document.documentElement.dataset.theme=th;const t=$('#themebtn');if(t)t.textContent=THICON[th]||'☀'}
syncTheme();
function cycleTheme(){pref.theme=THEMES[(THEMES.indexOf(pref.theme)+1)%THEMES.length]||'sepia';setP(PREF,pref);syncTheme();}
function renderContinue(){
  const box=$('#continue'),items=[],done=[],hist=[];
  $$('.book[data-id]').forEach(c=>{const p=getP(PROG+c.dataset.id,null);if(!p||!p.pct)return;const e={id:c.dataset.id,title:c.dataset.title,pct:p.pct,ts:p.ts||0};hist.push(e);if(p.pct>=98)done.push(e);else if(p.pct>0)items.push(e);});
  hist.sort((a,b)=>b.ts-a.ts);
  if(!items.length&&!done.length){box.innerHTML='';}
  else{items.sort((a,b)=>b.pct-a.pct);
  box.innerHTML='<div class="collectlabel">PICK UP WHERE YOU LEFT OFF</div><div class="rail">'+items.map(i=>`<div class="card"><h3>${i.title}</h3><div class="prog"><b style="width:${i.pct}%"></b></div><a class="read" href="read/${i.id}.html">Continue — ${i.pct}%</a></div>`).join('')+'</div>'
  +(done.length?'<div class="collectlabel">COMPLETED · '+done.length+'</div><div class="chiprow">'+done.map(i=>`<a href="read/${i.id}.html">✓ ${i.title}</a>`).join('')+'</div>':'')
  +(hist.length?'<div class="collectlabel">RECENTLY VIEWED</div><div class="chiprow">'+hist.slice(0,6).map(i=>`<a href="read/${i.id}.html">${i.title} · ${i.pct}%</a>`).join('')+'</div>':'');}
  try{const marks=getP('cicdlib:marks',{}),ids=Object.keys(marks);const mr=$('#marksrow');
  if(mr){if(!ids.length)mr.innerHTML='';else{const cards=ids.map(id=>{const c=document.querySelector('.book[data-id="'+id+'"]');const t=c?c.dataset.title:id;return `<a href="read/${id}.html">★ ${t}</a>`;}).join('');mr.innerHTML='<div class="collectlabel">SAVED</div><div class="chiprow">'+cards+'</div>';}}}catch(e){}
  const top=items[0]||hist[0],rs=$('#resume');
  if(rs&&top){rs.href='read/'+top.id+'.html';rs.textContent='Resume · '+top.title+' — '+top.pct+'%';rs.style.display='';}
}
function filter(){
  const q=($('#q').value||'').toLowerCase(),cat=$('#fcat')?.value||'',dif=$('#fdif')?.value||'',sort=$('#fsort')?.value||'';
  const filtering=!!(q||cat||dif);
  let n=0;const visCards=[];
  $$('.book[data-id]').forEach(c=>{
    const okQ=(c.dataset.title+' '+c.dataset.desc+' '+(c.dataset.tags||'')).toLowerCase().includes(q);
    const okC=!cat||c.dataset.cat===cat, okD=!dif||c.dataset.dif===dif;
    const ok=okQ&&okC&&okD; c.style.display=ok?'':'none'; if(ok){n++;visCards.push(c);}
  });
  if(sort){$$('.shelf .rail, .shelf .cores-grid').forEach(rail=>{[...rail.children].filter(c=>c.style.display!=='none').sort((a,b)=>{
    if(sort==='az')return a.dataset.title.localeCompare(b.dataset.title);
    if(sort==='time')return (+a.dataset.time||99)-(+b.dataset.time||99);
    if(sort==='level'){const r={Beginner:0,Intermediate:1,Advanced:2};return (r[a.dataset.dif]??9)-(r[b.dataset.dif]??9);}
    return 0;}).forEach(c=>rail.appendChild(c));});}
  $$('.shelf').forEach(s=>{
    const vis=[...s.querySelectorAll('.book')].some(c=>c.style.display!=='none');
    s.style.display=vis?'':'none';
  });
  $$('.railmore').forEach(m=>{m.style.display=(filtering||m.dataset.exp)?'':'none';});
  $$('.railbtn').forEach(b=>b.style.display=filtering?'none':'');
  $('#empty').style.display=n?'none':'';
  const cc=$('#fcount');if(cc)cc.textContent=n+' shown';
  try{const h=new URLSearchParams();if($('#q').value)h.set('q',$('#q').value);if(cat)h.set('cat',cat);if(dif)h.set('dif',dif);history.replaceState(null,'','#'+h.toString());}catch(e){}
}
['q','fcat','fdif','fsort'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('input',()=>{filter();drop();});});
$$('.railbtn').forEach(b=>b.onclick=()=>{const m=b.parentElement.previousElementSibling;const open=m.style.display!=='none';m.style.display=open?'none':'';m.dataset.exp=open?'':'1';b.textContent=open?('View all '+b.dataset.n+' \u2193'):'Show less \u2191';});
try{if(location.protocol.indexOf('http')===0)fetch('search.json').then(r=>r.ok?r.json():null).then(j=>{if(j&&j.length)window.SEARCH_IDX=j;}).catch(()=>{});}catch(e){}
function norm(s){return (s||'').toLowerCase().replace(/[-_/]/g,' ');}
function drop(){const raw=($('#q').value||''),q=raw.toLowerCase(),box=$('#qdrop');if(!box)return;if(q.length<2){box.classList.remove('open');box.innerHTML='';return;}
const STOP=new Set(['how','does','did','can','what','when','where','which','that','this','with','from','have','has','are','was','were','been','will','would','there','their','about','into','your','you','our','the','and','for','are','but','not','all','any','can','had','her','him','his','one','our','out','day','get','has','him','how','its','may','new','now','old','see','two','way','who','boy','did','she','use','her','now','do','i','an','a','to','in','of','or','is','it','my','me','on','as','at','by','we','if','up','so']);
const qn=norm(raw);let toks=qn.split(/\\s+/).filter(t=>t.length>=3&&!STOP.has(t));if(!toks.length)toks=[qn].filter(t=>t.length>=2);if(!toks.length){box.classList.remove('open');return;}
const idx=window.SEARCH_IDX||[];const res=idx.map(b=>{const secs=(b.sections||[]).join(' ');const body=(b.body||'');const hay=norm(b.title+' '+b.desc+' '+(b.tags||[]).join(' ')+' '+secs+' '+body);if(!toks.every(t=>hay.includes(t)))return null;let s=1,hit='';const secHit=(b.sections||[]).find(t=>{const tn=norm(t);return toks.every(tk=>tn.includes(tk))||tn.includes(toks[0]);});const titleHit=toks.every(t=>norm(b.title).includes(t));if(titleHit)s=3;else if(secHit){s=2;hit=secHit;}else{const bi=norm(body).indexOf(toks[0]);if(bi>=0){hit='…'+body.slice(Math.max(0,bi-30),bi+50).replace(/\\s+/g,' ')+'…';}else if(b.desc){hit=b.desc.slice(0,70);}}if((b.tags||[]).some(t=>toks.some(k=>norm(t).includes(k))))s+=0.5;return {b,s,hit};}).filter(Boolean).sort((a,b2)=>b2.s-a.s).slice(0,8);
box.innerHTML=res.length?res.map(r=>`<a href="read/${r.b.id}.html"><b>${r.b.title}</b><small>${r.b.cat} · ${r.b.dif} · ${r.b.time} min${r.hit?' · § '+r.hit.slice(0,80):''}</small></a>`).join(''):'<a><b>Nothing found</b><small>Try “rollback” or “canary” — or start with Foundations</small></a>';box.classList.add('open');}
document.addEventListener('click',e=>{const box=$('#qdrop');if(box&&!e.target.closest('.searchwrap'))box.classList.remove('open');});
function logQ(q){q=(q||'').trim().toLowerCase();if(q.length<3)return;try{const L=getP('cicdlib:qlog',{});L[q]=(L[q]||0)+1;setP('cicdlib:qlog',L);}catch(e){}}
function renderPop(){try{const L=getP('cicdlib:qlog',{}),top=Object.entries(L).sort((a,b)=>b[1]-a[1]).slice(0,5);const el=$('#popsearch');if(el)el.innerHTML=top.length?('Popular: '+top.map(t=>`<a data-q="${t[0]}">${t[0]}</a>`).join(' · ')):'';$$('#popsearch a').forEach(a=>a.onclick=()=>{$('#q').value=a.dataset.q;filter();drop();});}catch(e){}}
$('#q').addEventListener('keydown',e=>{if(e.key==='Enter')logQ(e.target.value);});
renderPop();
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#q').focus()}});
$$('.shelf').forEach(s=>{const rail=s.querySelector('.rail');if(!rail)return;s.querySelectorAll('.arrows button').forEach(b=>b.onclick=()=>rail.scrollBy({left:(+b.dataset.dir)*320,behavior:'smooth'}))});
const mb=$('#morebtn');if(mb)mb.onclick=()=>{const m=$('#morecats');if(m)m.style.display='';mb.style.display='none'};
$$('.jumpnav a').forEach(a=>a.addEventListener('click',()=>{const m=$('#morecats');if(m&&m.style.display==='none'){m.style.display='';const b=$('#morebtn');if(b)b.style.display='none'}}));
$('#themebtn').onclick=()=>cycleTheme();
try{const h=new URLSearchParams(location.hash.slice(1));if(h.get('q'))$('#q').value=h.get('q');if(h.get('cat')&&$('#fcat'))$('#fcat').value=h.get('cat');if(h.get('dif')&&$('#fdif'))$('#fdif').value=h.get('dif');}catch(e){}
renderContinue();filter();
"""

READER_JS = BASE_JS + """
const BID=document.body.dataset.book,PREF='cicdlib:pref',PKEY='cicdlib:prog:'+BID;
const pref=Object.assign({theme:'sepia',fs:18,width:'820px',font:'sans',lh:1.7},getP(PREF,{}));
const RTHEMES=['sepia','dark','light'];
function applyPref(){document.documentElement.dataset.theme=RTHEMES.includes(pref.theme)?pref.theme:'sepia';syncThemeBtn();
  document.body.dataset.font=pref.font==='serif'?'serif':'sans';
  const rb=document.querySelector('.readbody');if(rb){rb.style.fontSize=pref.fs+'px';rb.style.setProperty('max-width',pref.width);rb.style.setProperty('--lh',pref.lh);}
  $$('.setrow .opts .btn').forEach(b=>b.classList.toggle('on',b.dataset.set===undefined?'':String(pref[b.dataset.k])===b.dataset.set));
  setP(PREF,pref);}
function setOpt(k,v){pref[k]=v;applyPref()}
const THI={dark:'☀',light:'☾',sepia:'◐'};
function syncThemeBtn(){const ic=THI[pref.theme]||'◐';const a=$('#themebtn'),b=$('#mthemebtn');if(a)a.textContent=ic;if(b)b.textContent=ic;}
function cycleTheme(){setOpt('theme',RTHEMES[(RTHEMES.indexOf(pref.theme)+1)%RTHEMES.length]);}
const _thb=$('#themebtn');if(_thb)_thb.onclick=cycleTheme;const _mth=$('#mthemebtn');if(_mth)_mth.onclick=cycleTheme;
$$('.terminal').forEach(t=>{const bar=document.createElement('div');bar.className='copybar';const b=document.createElement('button');b.className='copybtn';b.textContent='Copy';b.onclick=()=>{let txt=t.innerText.split('\\n').filter(l=>!l.match(/^\\s*(NAME|nginx-|CONTAINER|NAME\\s+READY)/)).join('\\n');navigator.clipboard.writeText(txt||t.innerText).then(()=>{b.textContent='Copied!';setTimeout(()=>b.textContent='Copy',1200)})};bar.appendChild(b);t.before(bar)});
$$('.readbody pre').forEach(p=>{if(p.closest('.terminal')||p.previousElementSibling?.classList?.contains('codehead'))return;const h=document.createElement('div');h.className='codehead';h.innerHTML='<span class=dot></span><span>'+(p.dataset.lang||"code")+'</span>';const b=document.createElement('button');b.textContent='Copy';b.onclick=()=>{navigator.clipboard.writeText(p.innerText).then(()=>{b.textContent='Copied!';setTimeout(()=>b.textContent='Copy',1200)})};const w=document.createElement('button');w.textContent='Wrap';w.style.marginLeft='6px';w.onclick=()=>{p.style.whiteSpace=p.style.whiteSpace==='pre-wrap'?'pre':'pre-wrap'};h.appendChild(b);h.appendChild(w);p.before(h)});
$$('.readbody img').forEach(im=>{im.setAttribute('loading','lazy');if(!im.getAttribute('alt'))im.setAttribute('alt','Diagram from '+BID);im.style.cursor='zoom-in';im.addEventListener('click',()=>{const lb=$('#lightbox');if(lb){lb.querySelector('img').src=im.src;lb.classList.add('open');}});im.addEventListener('error',()=>{im.dataset.broken='1';const f=document.createElement('div');f.className='imgfallback';f.style.display='block';f.textContent='Image unavailable: '+(im.getAttribute('alt')||im.src);im.after(f);});});
const _lb=$('#lightbox');if(_lb)_lb.addEventListener('click',()=>_lb.classList.remove('open'));
const MARKS='cicdlib:marks';
const LABKEY='cicdlib:lab:'+BID;
function labChecks(){const done=getP(LABKEY,{});$$('.readbody .step').forEach((st,i)=>{if(st.querySelector('input[type=checkbox]'))return;const lab=document.createElement('input');lab.type='checkbox';lab.checked=!!done[i];lab.setAttribute('aria-label','Mark step done');lab.onchange=()=>{const d=getP(LABKEY,{});if(lab.checked)d[i]=1;else delete d[i];setP(LABKEY,d);st.classList.toggle('done',lab.checked);};st.classList.toggle('done',!!done[i]);const lb=document.createElement('label');lb.className='stephit';lb.setAttribute('aria-label','Mark step done');lb.appendChild(lab);st.prepend(lb);});const rst=$('#labreset');if(rst)rst.onclick=()=>{setP(LABKEY,{});$$('.readbody .step').forEach(st=>{st.classList.remove('done');const c=st.querySelector('input[type=checkbox]');if(c)c.checked=false;});};}
labChecks();
function tocUpdate(){const links=$$('aside.toc a');let cur=null;
  links.forEach(a=>{const h=a.getAttribute('href');if(!h||h[0]!=='#')return;
    const el=document.getElementById(h.slice(1));
    if(el&&el.getBoundingClientRect().top<160)cur=h;});
  window._cur=cur?cur.slice(1):null;
  links.forEach(a=>a.classList.toggle('cur',a.getAttribute('href')===cur));}
window.addEventListener('scroll',()=>{tocUpdate();
  const h=document.documentElement,p=Math.min(100,Math.round(100*(h.scrollTop)/(h.scrollHeight-h.clientHeight||1)));
  setP(PKEY,{pct:p,ts:Date.now()});const bar=$('#pbar');if(bar)bar.style.width=p+'%';const fp=$('#fs-prog');if(fp)fp.textContent=p+'%';},{passive:true});
function findBook(q){$$('.readbody mark').forEach(m=>{m.replaceWith(document.createTextNode(m.textContent))});if(!q)return 0;
  let n=0;const walker=document.createTreeWalker(document.querySelector('.readbody'),NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(nd=>{const i=nd.textContent.toLowerCase().indexOf(q.toLowerCase());if(i<0)return;
    if(nd.parentElement.closest('.terminal,script,style'))return;
    const r=document.createRange();r.setStart(nd,i);r.setEnd(nd,i+q.length);
    const m=document.createElement('mark');r.surroundContents(m);n++;});
  const f=document.querySelector('.readbody mark');if(f)f.scrollIntoView({block:'center'});
  window._marks=[...document.querySelectorAll('.readbody mark')];window._mi=0;window._lastQ=q;return n;}
$('#q').addEventListener('keydown',e=>{if(e.key==='Enter'){const v=e.target.value;
  if(v&&v===window._lastQ&&(window._marks||[]).length){window._mi=(window._mi+1)%window._marks.length;window._marks[window._mi].scrollIntoView({block:'center'});$('#qcount').textContent='match '+(window._mi+1)+' of '+window._marks.length;return;}
  const n=findBook(v);$('#qcount').textContent=n?n+' match'+(n>1?'es':'')+' in this book — Enter for next':'no matches in this book'}});
$('#q').addEventListener('input',e=>{if(!e.target.value)findBook('')});
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#q').focus()}
  if(e.key==='Escape'){if(document.activeElement===$('#q')||document.activeElement===$('#mobileq')){document.activeElement.value='';findBook('');const qc=$('#qcount');if(qc)qc.textContent='';}const _do=$('#drawer').classList.contains('open'),_to=$('aside.toc').classList.contains('open');$('#drawer').classList.remove('open');if($('aside.toc').classList.contains('open')){const tb=$('#tocbtn');if(tb)setTimeout(()=>tb.focus(),0);}$('aside.toc').classList.remove('open');if(!_do&&!_to&&document.body.classList.contains('fs'))setFS(false);lockScroll();}
  if(e.key.toLowerCase()==='t'&&document.activeElement.tagName!=='INPUT'){$('aside.toc').classList.toggle('open')}
  if(e.key==='ArrowRight'&&document.activeElement.tagName!=='INPUT'){const n=$('#nextbook');if(n)location.href=n.href}
  if(e.key==='ArrowLeft'&&document.activeElement.tagName!=='INPUT'){const p=$('#prevbook');if(p)location.href=p.href}
  if(e.key.toLowerCase()==='c'&&document.activeElement.tagName!=='INPUT'&&window._cur){try{navigator.clipboard.writeText(location.href.split('#')[0]+'#'+window._cur);const qc=$('#qcount');if(qc)qc.textContent='section link copied';}catch(err){}}});
const _pr=$('#prefreset');if(_pr)_pr.onclick=()=>{setP(PREF,{theme:'sepia',fs:18,width:'820px',font:'sans',lh:1.7});location.reload();};
$('#drawer .scrim').onclick=()=>$('#drawer').classList.remove('open');
$('#tocbtn').onclick=()=>tocToggle();
$$('aside.toc a').forEach(a=>a.onclick=(e)=>{const h=a.getAttribute('href');if(h&&h[0]==='#'){if(e)e.preventDefault();const el=document.getElementById(h.slice(1));if(el)el.scrollIntoView();try{history.replaceState(null,'',h);}catch(err){}tocUpdate();}if(innerWidth<=900)$('aside.toc').classList.remove('open')});
const back=$('#backbtn');
if(back)back.addEventListener('click',e=>{
  let sameOrigin=false;
  try{sameOrigin=!!document.referrer&&new URL(document.referrer,location.href).origin===location.origin;}catch(err){}
  if(sameOrigin&&history.length>1){e.preventDefault();history.back();}
});
const menuBtn=$('#mobilemenubtn');
if(menuBtn)menuBtn.onclick=()=>{const d=$('#drawer'),open=!d.classList.contains('open');d.classList.toggle('open',open);menuBtn.setAttribute('aria-expanded',String(open));};
const mobileQ=$('#mobileq'),bookQ=$('#q');
if(mobileQ&&bookQ){mobileQ.addEventListener('input',()=>{bookQ.value=mobileQ.value;});mobileQ.addEventListener('keydown',e=>{if(e.key==='Enter'){bookQ.value=mobileQ.value;bookQ.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));}});}
const topBtn=$('#topbtn');let topTimer;
function syncTop(){if(!topBtn)return;const eligible=scrollY>innerHeight*.9;topBtn.classList.toggle('on',eligible);clearTimeout(topTimer);if(eligible)topTimer=setTimeout(()=>topBtn.classList.remove('on'),2800);}
window.addEventListener('scroll',syncTop,{passive:true});
if(topBtn)topBtn.onclick=()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
window.addEventListener('hashchange',tocUpdate);
window.addEventListener('pageshow',tocUpdate);
function lockScroll(){const any=$('#drawer').classList.contains('open')||document.querySelector('aside.toc').classList.contains('open');document.body.classList.toggle('toc-open',document.querySelector('aside.toc').classList.contains('open')&&matchMedia('(max-width:900px)').matches);document.body.classList.toggle('lock',any);document.querySelector('aside.toc').setAttribute('aria-modal',document.querySelector('aside.toc').classList.contains('open')?'true':'false');document.querySelector('#drawer .panel').setAttribute('aria-modal',$('#drawer').classList.contains('open')?'true':'false');}
new MutationObserver(lockScroll).observe(document.querySelector('aside.toc'),{attributes:true,attributeFilter:['class']});
new MutationObserver(lockScroll).observe($('#drawer'),{attributes:true,attributeFilter:['class']});
function tocToggle(){const mob=matchMedia('(max-width:900px)').matches;const toc=document.querySelector('aside.toc');if(mob){toc.classList.toggle('open');}else{document.body.classList.toggle('toc-hide');}lockScroll();const tb=$('#tocbtn');if(tb)tb.setAttribute('aria-expanded',String(!document.body.classList.contains('toc-hide')));}
const _tocx=$('#tocx');if(_tocx)_tocx.onclick=()=>{document.querySelector('aside.toc').classList.remove('open');document.body.classList.add('toc-hide');lockScroll();const tb=$('#tocbtn');if(tb)tb.focus();};const _ts=$('#tocscrim');if(_ts)_ts.onclick=()=>{document.querySelector('aside.toc').classList.remove('open');lockScroll();const tb=$('#tocbtn');if(tb)tb.focus();};(function(){const toc=document.querySelector('aside.toc');let sx=0;toc.addEventListener('touchstart',e=>{sx=e.touches[0].clientX},{passive:true});toc.addEventListener('touchend',e=>{if(sx-e.changedTouches[0].clientX>60&&matchMedia('(max-width:900px)').matches&&toc.classList.contains('open')){toc.classList.remove('open');lockScroll();const tb=$('#tocbtn');if(tb)tb.focus();}sx=0;},{passive:true});})();
const _setx=$('#setx');if(_setx)_setx.onclick=()=>{$('#drawer').classList.remove('open');lockScroll();};
document.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const open=document.querySelector('aside.toc.open')||document.querySelector('#drawer.open');if(!open)return;const f=[...open.querySelectorAll('button,a[href],input,[tabindex]')].filter(el=>el.offsetParent);if(!f.length)return;if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f[f.length-1].focus();}else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0].focus();}});
// Fullscreen: Fullscreen API where available, CSS-immersive fallback otherwise. Per-session toggle (never auto-restored).
function syncFS(){const on=document.body.classList.contains('fs');const bar=$('#fsbar');if(bar)bar.hidden=!on;const fb=$('#fsbtn');if(fb)fb.setAttribute('aria-pressed',on?'true':'false');const rb=document.querySelector('.readbody');if(rb)rb.style.setProperty('max-width',on?'880px':pref.width);}
function setFS(on){if(on){document.body.classList.add('fs');try{const el=document.documentElement;const pr=el.requestFullscreen&&el.requestFullscreen();if(pr&&pr.catch)pr.catch(()=>{});}catch(err){}}else{document.body.classList.remove('fs');try{if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});}catch(err){}}syncFS();}
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)document.body.classList.remove('fs');syncFS();});
const _fsb=$('#fsbtn'),_fsm=$('#fsbtnm');if(_fsb)_fsb.onclick=()=>setFS(!document.body.classList.contains('fs'));if(_fsm)_fsm.onclick=()=>{$('#drawer').classList.remove('open');setFS(!document.body.classList.contains('fs'));};
const _ft=$('#fs-toc');if(_ft)_ft.onclick=()=>tocToggle();
const _fx=$('#fs-exit');if(_fx)_fx.onclick=()=>setFS(false);const _fxm=$('#fsexit-m');if(_fxm)_fxm.onclick=()=>setFS(false);
const _fth=$('#fs-theme');if(_fth)_fth.onclick=()=>{setOpt('theme',RTHEMES[(RTHEMES.indexOf(pref.theme)+1)%RTHEMES.length]);};
function _fsStep(dd){const S=[16,18,20,22];let i=S.indexOf(pref.fs);if(i<0)i=1;setOpt('fs',S[Math.min(S.length-1,Math.max(0,i+dd))]);}
const _fd=$('#fs-dec'),_fi=$('#fs-inc');if(_fd)_fd.onclick=()=>_fsStep(-1);if(_fi)_fi.onclick=()=>_fsStep(1);
applyPref();tocUpdate();syncFS();
"""


class PageGrabber(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.pages, self._buf, self._depth = [], None, 0

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "div" and self._buf is None and ("page" in d.get("class", "").split() or "sheet" in d.get("class", "").split()):
            self._buf, self._depth = [self.get_starttag_text()], 1
            return
        if self._buf is not None:
            self._buf.append(self.get_starttag_text())
            if tag == "div":
                self._depth += 1

    def handle_endtag(self, tag):
        if self._buf is not None:
            self._buf.append(f"</{tag}>")
            if tag == "div":
                self._depth -= 1
                if self._depth == 0:
                    self.pages.append("".join(self._buf))
                    self._buf = None

    def handle_data(self, data):
        if self._buf is not None:
            self._buf.append(data)

    def handle_entityref(self, name):
        if self._buf is not None:
            self._buf.append(f"&{name};")

    def handle_charref(self, name):
        if self._buf is not None:
            self._buf.append(f"&#{name};")


def md_inline(text):
    """Render the small Markdown inline subset used by the knowledge base."""
    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r'<code>\1</code>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", text)
    return text


def markdown_pages(path, title):
    """Build readable print/reader pages when a legacy PDF shell is empty."""
    raw = open(path, encoding="utf-8").read()
    raw = re.sub(r"^---.*?---\s*", "", raw, flags=re.S)
    raw = re.sub(r"<!--.*?-->\s*", "", raw, flags=re.S)
    lines = raw.replace("\r\n", "\n").split("\n")
    pages = []
    current = []
    in_code = False
    code = []
    lang = "code"

    def flush():
        nonlocal current
        if current:
            pages.append("".join(current))
            current = []

    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            if in_code:
                current.append('<pre class="codeblock" data-lang="' + html.escape(lang, quote=True) + '"><code>' + html.escape("\n".join(code)) + '</code></pre>')
                code = []
                in_code = False
            else:
                in_code = True
                lang = line[3:].strip() or "code"
            i += 1
            continue
        if in_code:
            code.append(line)
            i += 1
            continue
        if not line.strip():
            i += 1
            continue
        m = re.match(r"^(#{1,4})\s+(.+)$", line)
        if m:
            if len(m.group(1)) == 1:
                i += 1
                continue
            if len(current) and len(current) > 18:
                flush()
            current.append(f'<h3 class="sec">{md_inline(m.group(2))}</h3>')
            i += 1
            continue
        if line.startswith("> "):
            current.append(f'<p class="body"><em>{md_inline(line[2:])}</em></p>')
            i += 1
            continue
        if re.match(r"^[-*]\s+", line):
            items = []
            while i < len(lines) and re.match(r"^[-*]\s+", lines[i]):
                _item = re.sub(r"^[-*]\s+", "", lines[i])
                if re.match(r"^\[ \]\s*", _item):
                    items.append('<li class="step">' + md_inline(re.sub(r"^\[ \]\s*", "", _item)) + "</li>")
                else:
                    items.append("<li>" + md_inline(_item) + "</li>")
                i += 1
            current.append('<ul class="tight">' + "".join(items) + "</ul>")
            continue
        if re.match(r"^\d+[.)]\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\d+[.)]\s+", lines[i]):
                items.append("<li>" + md_inline(re.sub(r"^\d+[.)]\s+", "", lines[i])) + "</li>")
                i += 1
            current.append('<ol class="tight">' + "".join(items) + "</ol>")
            continue
        paragraph = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#{1,4})\s+|^>\s|^[-*]\s+|^\d+[.)]\s+|^```", lines[i]):
            paragraph.append(lines[i].strip())
            i += 1
        current.append('<p class="body">' + md_inline(" ".join(paragraph)) + '</p>')
    if in_code and code:
        current.append('<pre class="codeblock" data-lang="' + html.escape(lang, quote=True) + '"><code>' + html.escape("\n".join(code)) + '</code></pre>')
    flush()
    cover = (f'<div class="page cover"><div class="brand">CI/CD ENGINEERING · KNOWLEDGE BASE</div>'
             f'<h1>{html.escape(title)}</h1><p class="sub">CICD BY Nabawy</p>'
             f'<div class="cover foot" style="gap:18px"><span>Reader edition</span><span class="sig">Nabawy</span></div></div>')
    return [cover.replace('class="page cover"', 'class="page cover md-fallback"')] + [f'<div class="page md-fallback">{p}<div class="pfoot"><span>CICD BY Nabawy</span><span>{i + 2}</span></div></div>' for i, p in enumerate(pages)]


def parse_book(path):
    src = open(path, encoding="utf-8").read()
    css = re.findall(r"<style>(.*?)</style>", src, re.S)
    g = PageGrabber()
    g.feed(src)
    return (scope_css(css[0]) if css else ""), g.pages


def scope_css(css):
    """Keep print stylesheets inside the article: bare `body{}` becomes
    `.readbody{}` (minus page background and margin, so site centering wins),
    and `:root` variables move onto `.readbody` so --ink/--line/--red never
    leak into site chrome."""
    css = re.sub(
        r"(?<![.\w#-])body\s*\{([^}]*)\}",
        lambda m: ".readbody{" + re.sub(r"background\s*:[^;]+;?", "",
                  re.sub(r"(?<![\w-])margin\s*:[^;]+;?", "", m.group(1))) + "}",
        css,
    )
    return css.replace(":root", ".readbody")


def toc_of(pages):
    items = []
    n1 = n2 = n3 = 0
    for i, p in enumerate(pages):
        heads = re.findall(r"<(h2|h3|h4)([^>]*)>(.*?)</\1>", p, re.S)
        if not heads:
            m = re.search(r"<h1[^>]*>(.*?)</h1>", p, re.S)
            label = re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else f"Page {i+1}"
            items.append((f"p{i+1}", "Cover — " + label[:40], 1))
            continue
        for heading_index, (tag, attrs, htxt) in enumerate(heads, 1):
            clean = re.sub(r"<[^>]+>", "", htxt).strip()
            if not clean:
                continue
            m = re.search(r'id="([^"]+)"', attrs)
            anchor = m.group(1) if m else f"p{i+1}-h{heading_index}"
            if tag == "h2":
                n1 += 1; n2 = n3 = 0; num = f"{n1}"
                lvl = 1
            elif tag == "h3":
                n2 += 1; n3 = 0; num = f"{n1}.{n2}" if n1 else f"{n2}"
                lvl = 2
            else:
                n3 += 1
                if n1:
                    num = f"{n1}.{n2}.{n3}"
                elif n2:
                    num = f"{n2}.{n3}"
                else:
                    num = f"{n3}"
                lvl = 3
            items.append((anchor, f"{num} {clean[:60]}", lvl))
    return items


DIFF_RANK = {"Beginner": 0, "Intermediate": 1, "Advanced": 2}
CAT_HEX = {"CI/CD":"#5B8DEF","Build":"#F5A524","Testing":"#2ECC71","Security":"#E5484D","Reliability":"#9B7BF0","Jenkins":"#22B8CF","Delivery":"#F472B6","GitHub":"#94A3B8","Platforms":"#F97316","Labs":"#EAB308","Reference":"#64748B","Roadmap":"#18E299","Start Here":"#5B8DEF","Deliver":"#F472B6","Observability":"#0e7490"}
DIF_SHORT = {"Beginner":"Beg","Intermediate":"Int","Advanced":"Adv"}
DIF_CLS = {"Beginner":"beg","Intermediate":"int","Advanced":"adv"}


def reader_url(b):
    """Single URL-building rule for reader pages; library cards and roadmap share it."""
    return f"read/{b['id']}.html"


CATEGORY_ICONS = {
    "CI/CD": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1.9"/><circle cx="19" cy="6" r="1.9"/><circle cx="19" cy="18" r="1.9"/><path d="M7.2 12h5M13.4 7.4l3-1M13.4 16.6l3 1"/><path d="M9 8l-2 4 2 4M15 8l2 4-2 4" opacity=".7"/></svg>',
    "Jenkins": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h10M7 12h10M7 16h10"/><circle cx="12" cy="12" r="9" opacity=".35"/></svg>',
    "Labs": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6v6l3 5a3 3 0 01-3 4H9a3 3 0 01-3-4l3-5V3z"/><path d="M8 14h8" opacity=".6"/></svg>',
    "Platforms": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 4-8 4-8-4z"/><path d="M4 10l8 4 8-4"/><path d="M4 14l8 4 8-4"/><path d="M4 18l8 4 8-4" opacity=".4"/></svg>',
    "Roadmap": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3L4 5v14l5-2 6 2 5-2V3l-5 2z"/><path d="M9 5v14M15 7v14"/></svg>',
    "Build": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 6l3.5 3.5-8 8H6v-4l8.5-8z"/><path d="M11 9l3 3"/><path d="M13 6l3-3 3 3-3 3-3-3z" opacity=".5"/></svg>',
    "Testing": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6"/><path d="M10 7a5 5 0 1010 0 5 5 0 00-10 0z"/><path d="M12 12v3l2 2"/><path d="M8 14h8" opacity=".6"/></svg>',
    "Delivery": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l4 6-4 12-4-12z"/><path d="M8 9h8"/><path d="M10 3v4M14 3v4" opacity=".6"/><circle cx="12" cy="9" r="1.2" fill="currentColor" stroke="none"/></svg>',
    "Security": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 4v5c0 4.2-2.8 7.3-7 9-4.2-1.7-7-4.8-7-9V7z"/><path d="M9 12l2 2 4-4" opacity=".9"/></svg>',
    "Reliability": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l2-4 3 7 2-4h7"/><circle cx="12" cy="12" r="9" opacity=".2"/></svg>',
    "Reference": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h8a2 2 0 012 2v12a2 2 0 01-2 2H6z"/><path d="M6 8h6"/><path d="M6 12h6"/><path d="M6 16h4" opacity=".6"/></svg>',
    "GitHub": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 00-3 17.5"/><path d="M9 18c-2.2 1-3-1-3-1"/><path d="M12 16c-1 .3-2 .1-2.5-.8"/><path d="M14.5 18V15a2.5 2.5 0 00-.7-1.8c1.6-.2 3.2-.8 3.2-3.5a2.7 2.7 0 00-.7-1.9s-.6-.2-2 .7a7.8 7.8 0 00-3.6 0c-1.4-.9-2-.7-2-.7a2.7 2.7 0 00-.7 1.9c0 2.7 1.6 3.3 3.2 3.5A2.5 2.5 0 0011.5 15v3"/><circle cx="12" cy="3" r=".3" fill="currentColor"/></svg>',
    "Start Here": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v18"/><path d="M6 4h11l-2.6 3.5L17 11H6"/></svg>',
    "Deliver": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l4 6-4 12-4-12z"/><path d="M8 9h8"/><path d="M10 3v4M14 3v4" opacity=".6"/><circle cx="12" cy="9" r="1.2" fill="currentColor" stroke="none"/></svg>',
    "Observability": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2" opacity=".5"/></svg>',
}

def _slug_cat(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-").replace("--","-")

def build_map_page(books, output_dir, paths_html=""):
    """Home — 12 pseudo-3D blocks derived from books.json categories at build time.
    No second manifest: grouping, counts, difficulty spread computed here.
    Reuses card() markup for detail views, BASE_CSS vars for theming.
    """
    from collections import Counter
    bycat = {}
    for b in books:
        bycat.setdefault(b["category"], []).append(b)
    # deterministic order: CAT_ORDER first, then rest alpha; no hardcoded count
    CAT_ORDER = ["Start Here","Build","Deliver","Observability","Jenkins","Platforms","Labs","Reference"]
    cats_sorted = [c for c in CAT_ORDER if c in bycat] + sorted([c for c in bycat if c not in CAT_ORDER])
    shown_cats = list(cats_sorted)
    CAT_COLORS_MAP = CAT_HEX
    # Build blocks html
    blocks_html = ""
    detail_html = ""
    cat_chips = []
    vols_html = ""
    for num, cat in enumerate(shown_cats, 1):
        bs = sorted(bycat[cat], key=lambda x: (DIFF_RANK.get(x["difficulty"],9), x["title"].lower()))
        cnt = len(bs)
        slug = _slug_cat(cat)
        cat_chips.append((slug, cat, bs[0]["id"]))
        color = CAT_COLORS_MAP.get(cat, "#18E299")
        icon = CATEGORY_ICONS.get(cat, CATEGORY_ICONS["Reference"])
        b0 = bs[0]
        tmin = b0.get("time_minutes", 30)
        ds = DIF_SHORT.get(b0.get("difficulty", ""), b0.get("difficulty", ""))
        upd = b0.get("updated", "")
        _desc = b0.get("description", "")
        desc = (_desc[:92] + "…") if len(_desc) > 92 else _desc
        dcls = DIF_CLS.get(b0.get("difficulty", ""), "int")
        blocks_html += (
            f'<a class="hm-row" style="--cat:{color}" href="read/{b0["id"]}.html" data-cat="{html.escape(cat)}" data-id="{b0["id"]}" data-title="{html.escape(b0["title"])}" id="block-{slug}" '
            f'aria-label="{html.escape(b0["title"])} — {tmin} minutes, {html.escape(b0.get("difficulty", ""))}">'
            f'<span class="hm-num">{num:02d}</span>'
            f'<span class="hm-ico" aria-hidden="true">{icon}</span>'
            f'<span class="hm-main"><span class="hm-kicker">{html.escape(cat)}</span>'
            f'<span class="hm-cat">{html.escape(b0["title"])}</span>'
            f'<span class="hm-desc">{html.escape(b0.get("description", ""))}</span>'
            f'<span class="hm-pills"><span class="map-pill">◷ <b>{tmin} min</b></span>'
            f'<span class="map-pill dif-{dcls}">{html.escape(b0.get("difficulty", ""))}</span>'
            f'<span class="map-pill">✓ verified {html.escape(upd)}</span></span></span>'
            f'<span class="hm-go" aria-hidden="true">→</span>'
            f'</a>'
        )
    empty_chips = "".join(f'<a class="chip" href="read/{bid}.html">{html.escape(c)}</a>' for s, c, bid in cat_chips)
    thread_chips = ""
    try:
        _ths = json.load(open(os.path.join(ROOT, "content", "threads.json"), encoding="utf-8"))
        for _th in _ths:
            thread_chips += (f'<a class="hm-vol" style="--cat:#0e7490" href="threads/#{html.escape(_th["id"])}">'
                             f'<i aria-hidden="true"></i><span>{html.escape(_th["label"])}</span></a>')
    except Exception:
        thread_chips = ""
    # Site header chrome: reuse same header as index, with Home active
    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<title>CICD BY Nabawy</title>
{seo_tags("CICD BY Nabawy", "Home of the CI/CD library — merged handbooks plus ordered learning paths.", f"{SITE_URL}/")}
<script type="application/ld+json">{{"@context": "https://schema.org", "@type": "CollectionPage", "name": "CICD BY Nabawy", "url": "{SITE_URL}/"}}</script>
<style>{BASE_CSS}</style><script>try{{var _p=JSON.parse(localStorage.getItem('cicdlib:pref')||'null');var _t=_p&&_p.theme;var _ok=['sepia','dark','light','dim','contrast'].indexOf(_t)>=0;document.documentElement.dataset.theme=_ok?_t:'sepia'}}catch(e){{document.documentElement.dataset.theme='sepia'}}</script>
</head>
<body>
<header class="top"><div class="wrap">
<a class="logo" href="index.html" style="color:inherit"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="5" cy="12" r="2.6" stroke="#18E299" stroke-width="2"/><circle cx="19" cy="6" r="2.6" stroke="#18E299" stroke-width="2"/><circle cx="19" cy="18" r="2.6" stroke="#18E299" stroke-width="2"/><path d="M7.6 12h5.2m0 0-2.6-2.6m2.6 2.6-2.6 2.6M13.4 7.4l2.8-1M13.4 16.6l2.8 1" stroke="#18E299" stroke-width="2" stroke-linecap="round"/></svg>CICD<span> BY Nabawy</span></a>
<div class="search"><div class="searchwrap"><input id="q" type="search" placeholder="Search all {len(books)} books…" autocomplete="off"><div class="searchdrop" id="qdrop" role="listbox"></div></div><kbd>⌘K</kbd></div>
<a class="btn" href="index.html" aria-current="page" style="text-decoration:none;border-color:var(--brand);color:var(--brand)">Home</a>
<a class="btn" href="glossary.html" style="text-decoration:none">Study Deck</a>
<a class="btn" href="threads/" style="text-decoration:none">Threads</a>
<a class="btn" href="tools/" style="text-decoration:none">Tools</a>
<button class="btn" id="themebtn" aria-label="Toggle theme">☀</button>
</div></header>
<div class="wrap">
<div class="hm-hero">
<div class="hm-band" aria-hidden="true"><i style="height:14px"></i><i style="height:30px"></i><i style="height:52px"></i><i style="height:38px"></i><i style="height:64px"></i><i style="height:46px"></i><i style="height:70px"></i><i style="height:28px"></i><i style="height:56px"></i><i style="height:18px"></i></div>
<div class="hm-kick">CICD BY Nabawy · SIGNAL SERIES</div>
<h1>The CI/CD Library</h1>
<p class="hm-sub"><b>CI/CD</b> is the automated path from <b>commit → build → test → release → production</b>, creating a continuous feedback loop between development and operations.</p>
<p class="hm-about">This library brings together <b>{len(books)} focused handbooks</b> covering Git &amp; CI, pipelines, Jenkins, deployment, observability, modern platforms, hands-on labs, and essential command references. Pick a row to start reading — or follow a <a href="threads/">thread</a>, <a href="tools/">rank your stack</a>, or open the <a href="glossary.html">Study Deck</a>.</p>
</div>
<div class="hm-label" aria-hidden="true"><span>CONTENTS</span><span>{len(shown_cats)} BOOKS</span></div>
<div class="hm-list" id="mapGrid" role="list" aria-label="Library contents">{blocks_html}</div>
<div class="hm-label" aria-hidden="true"><span>START FROM A THREAD</span><span>9 IDEAS</span></div>
<div class="hm-vols" style="justify-content:flex-start">{thread_chips}<a class="hm-vol" style="--cat:var(--brand)" href="threads/"><i aria-hidden="true"></i><span>All threads →</span></a></div>
{paths_html}
<div class="empty" id="mapEmpty" style="display:none"><p>That link doesn't match a category. Jump straight to one:</p><div class="empty-cats">{empty_chips}</div><a href="index.html">Back to overview</a></div>
</div>
<a id="resume" style="display:none"></a>
<footer><div class="wrap"><span>CICD BY Nabawy</span><span><a href="index.html">Home</a> · <a href="glossary.html">Study Deck</a> · v2.1 Sep 2026</span></div></footer>
<script>
(function(){{
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
function getP(k,d){{try{{const v=JSON.parse(localStorage.getItem(k));return v??d}}catch(e){{return d}}}}
function setP(k,v){{try{{localStorage.setItem(k,JSON.stringify(v))}}catch(e){{}}}}
const pref=getP('cicdlib:pref',{{theme:'sepia'}});
const THS=['sepia','dark','light'],THI={{dark:'☀',light:'☾',sepia:'◐'}};
function syncTheme(){{const th=THS.includes(pref.theme)?pref.theme:'sepia';document.documentElement.dataset.theme=th;const t=$('#themebtn');if(t)t.textContent=THI[th]||'☀'}}
syncTheme();
$('#themebtn').onclick=()=>{{pref.theme=THS[(THS.indexOf(pref.theme)+1)%THS.length];setP('cicdlib:pref',pref);syncTheme()}};
const grid=$('#mapGrid'),empty=$('#mapEmpty'),paths=$('#mapPaths');
function slugFromHash(){{return location.hash.replace(/^#/,'').trim().toLowerCase();}}
function showHome(){{ grid.style.display='';if(paths)paths.style.display='';grid.classList.remove('hidden');empty.style.display='none';document.title='CICD BY Nabawy'; }}
function showEmpty(){{ grid.style.display='none';if(paths)paths.style.display='none';empty.style.display=''; }}
$$('.hm-row').forEach(a=>{{
  a.addEventListener('keydown',e=>{{
    if(e.key===' '||e.key==='Spacebar'){{ e.preventDefault(); a.click(); }}
    if(e.key==='Enter'){{ /* anchor handles natively */ }}
  }});
}});
/* touch preview toggle (mobile where hover doesn't exist) */
$$('[data-preview-btn]').forEach(btn=>{{
  btn.addEventListener('click', e=>{{
    e.preventDefault(); e.stopPropagation();
    const card = btn.closest('.hm-row');
    const wasOpen = card.classList.contains('preview-open');
    $$('.hm-row.preview-open').forEach(c=>c.classList.remove('preview-open'));
    if(!wasOpen) card.classList.add('preview-open');
  }});
}});
document.addEventListener('click', e=>{{
  if(!e.target.closest('.hm-row')) $$('.hm-row.preview-open').forEach(c=>c.classList.remove('preview-open'));
}});

window.addEventListener('hashchange',()=>{{ if(slugFromHash()) showEmpty(); else showHome(); }});
window.addEventListener('popstate',()=>{{ if(slugFromHash()) showEmpty(); else showHome(); }});
if(slugFromHash()) showEmpty();
function homeFilter(){{const q=($('#q').value||'').toLowerCase();let n=0;
$$('.hm-row').forEach(a=>{{const t=((a.dataset.cat||'')+' '+(a.dataset.title||'')+' '+a.textContent).toLowerCase();const ok=!q||t.includes(q);a.style.display=ok?'':'none';if(ok)n++;}});
empty.style.display=n?'none':'';if(paths)paths.style.display=n?'':'none';}}
const _hq=$('#q');if(_hq)_hq.addEventListener('input',homeFilter);
try{{
const hist=[];
$$('.hm-row[data-id]').forEach(a=>{{const p=getP('cicdlib:prog:'+a.dataset.id,null);if(p&&p.pct)hist.push({{id:a.dataset.id,title:a.dataset.title,pct:p.pct,ts:p.ts||0}});}});
hist.sort((a,b)=>b.ts-a.ts);
const top1=hist.filter(h=>h.pct<98).sort((a,b)=>b.pct-a.pct)[0]||hist[0],rs=$('#resume');
if(rs&&top1){{rs.href='read/'+top1.id+'.html';rs.textContent='Resume · '+top1.title+' — '+top1.pct+'%';rs.style.display='';}}
}}catch(e){{}}
}})();
</script>
</body>
</html>"""
    pathlib.Path(output_dir, "index.html").write_text(page, encoding="utf-8")
    redir = ("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\">"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
        "<link rel=\"icon\" type=\"image/svg+xml\" href=\"favicon.svg\">"
        "<title>Home — CICD BY Nabawy</title>"
        "<link rel=\"canonical\" href=\"https://eslamnabawy.github.io/cicd-by-nabawy/\">"
        "<meta http-equiv=\"refresh\" content=\"0; url=./\">"
        "<script>location.replace('./'+location.hash)</script>"
        "</head><body><p>Map moved home — <a href=\"./\">continue home</a>.</p></body></html>")
    pathlib.Path(output_dir, "map.html").write_text(redir, encoding="utf-8")
    print(f"BUILT home: {len(books)} books in {len(shown_cats)} categories -> {output_dir}/index.html (+ map.html redirect)")

def build_roadmap_page(books, output_dir):
    """Ordered learning roadmap: every manifest book as a milestone stop,

    grouped by the ordered paths in content/paths.json (single taxonomy,
    shared with home/reader). Same tokens, same card language.
    """
    try:
        _pd = json.load(open(os.path.join(ROOT, "content", "paths.json"), encoding="utf-8"))
        _order, _pathmeta = _pd.get("order", []), _pd.get("paths", {})
    except Exception:
        _order, _pathmeta = [], {}
    def slug(name):
        return "rm-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

    _bypath = {}
    for b in books:
        _bypath.setdefault(b.get("path", ""), []).append(b)
    if _order:
        sections = [(_pathmeta.get(p, {}).get("label", p), _pathmeta.get(p, {}).get("desc", ""),
                      [x for x in books if x.get("path") == p]) for p in _order]
        sections = [(l, dd, bs) for l, dd, bs in sections if bs]
    else:
        groups = {}
        for b in books:
            groups.setdefault(b["category"], []).append(b)
        sections = [(c, "", sorted(bs, key=lambda b: (DIFF_RANK.get(b["difficulty"], 9), b["title"].lower())))
                    for c, bs in sorted(groups.items())]

    mile = [0]

    def rcard(b):
        mile[0] += 1
        return (
            f'<li class="stop" data-mile="{mile[0]:02d}" data-cat="{b["category"]}" data-book="{b["id"]}">'
            f'<div class="card book" data-cat="{b["category"]}" data-title="{html.escape(b["title"])}">'
            f'<span class="num">{html.escape(b["category"])} \u00b7 {b.get("time_minutes", 30)} min</span><h3>{html.escape(b["title"])}</h3>'
            f'<p>{html.escape(b.get("description", ""))}</p>'
            f'<div class="dif"><i></i>{b["difficulty"]}</div>'
            f'<a class="read" href="../{reader_url(b)}">Read</a></div></li>'
        )

    jump = ("<div class=\"jumpnav\">" + "".join(
        f"<a href=\"#{slug(n)}\">{n} · {len(bs)}</a>" for n, dd, bs in sections) + "</div>")
    body = '<div class="trip"><span>START · 01</span></div>' + "".join(
        f'<section class="shelf" id="{slug(n)}"><div class="shelf-head"><h2>{n}</h2>'
        f"<span>{len(bs)} book" + ("s" if len(bs) != 1 else "") + f" \u00b7 ~{sum(b.get('time_minutes', 30) for b in bs)} min</span>"
        f"<p>{html.escape(dd)}</p></div>"
        f"<ol class=\"route\">" + "".join(rcard(b) for b in bs) + "</ol></section>"
        for n, dd, bs in sections) + '<div class="trip"><span>FINISH · SHIP IT</span></div>'

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<title>Roadmap — CICD BY Nabawy</title>
{seo_tags("Roadmap — CICD BY Nabawy", "Visual roadmap of all " + str(len(books)) + " books in path order — the same source as the library.", f"{SITE_URL}/roadmap/")}
<style>{BASE_CSS}</style><script>try{{var _p=JSON.parse(localStorage.getItem('cicdlib:pref')||'null');var _t=_p&&_p.theme;var _ok=['sepia','dark','light','dim','contrast'].indexOf(_t)>=0;document.documentElement.dataset.theme=_ok?_t:'sepia'}}catch(e){{document.documentElement.dataset.theme='sepia'}}</script>
</head>
<body>
<header class="top"><div class="wrap">
<a class="logo" href="../index.html" style="color:inherit"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="5" cy="12" r="2.6" stroke="#18E299" stroke-width="2"/><circle cx="19" cy="6" r="2.6" stroke="#18E299" stroke-width="2"/><circle cx="19" cy="18" r="2.6" stroke="#18E299" stroke-width="2"/><path d="M7.6 12h5.2m0 0-2.6-2.6m2.6 2.6-2.6 2.6M13.4 7.4l2.8-1M13.4 16.6l2.8 1" stroke="#18E299" stroke-width="2" stroke-linecap="round"/></svg>CICD<span> BY Nabawy</span></a>
<nav class="crumbs"><span class="sep">/</span><span class="here">Roadmap</span></nav>
<div class="search"></div>
<a class="btn" href="../index.html" style="text-decoration:none">Home</a>
<a class="btn" href="../glossary.html" style="text-decoration:none">Study Deck</a>
<a class="btn" href="../threads/" style="text-decoration:none">Threads</a>
<a class="btn" href="../tools/" style="text-decoration:none">Tools</a>
<button class="btn" id="themebtn" aria-label="Toggle theme">☀</button>
</div></header>
<div class="wrap">
<div class="hero" style="padding:36px 24px 16px"><span class="eyebrow">ROADMAP</span><h1>Follow the path, <span>ship with confidence.</span></h1>
<p>{len(books)} stops in path order · ~{sum(b.get("time_minutes", 30) for b in books) // 60} hours end to end — same source as the library, impossible to drift.</p></div>
{jump}
{body}
</div>
<footer><div class="wrap"><span>CICD BY Nabawy</span></div></footer>
<script>
const $=s=>document.querySelector(s);
function getP(k,d){{try{{const v=JSON.parse(localStorage.getItem(k));return v??d}}catch(e){{return d}}}}
function setP(k,v){{try{{localStorage.setItem(k,JSON.stringify(v))}}catch(e){{}}}}
const pref=getP('cicdlib:pref',{{theme:'sepia'}});
const THS=['sepia','dark','light'],THI={{dark:'☀',light:'☾',sepia:'◐'}};
function syncTheme(){{const th=THS.includes(pref.theme)?pref.theme:'sepia';document.documentElement.dataset.theme=th;const t=$('#themebtn');if(t)t.textContent=THI[th]||'☀'}}
syncTheme();
$('#themebtn').onclick=()=>{{pref.theme=THS[(THS.indexOf(pref.theme)+1)%THS.length];setP('cicdlib:pref',pref);syncTheme()}};
try{{document.querySelectorAll('.stop[data-book]').forEach(s=>{{const p=getP('cicdlib:prog:'+s.dataset.book,null);if(p&&p.pct>=100){{const h=s.querySelector('h3');if(h&&!h.querySelector('.tick'))h.innerHTML+=' <span class="tick" style="color:var(--brand);font-weight:700">\u2713</span>';}}}});}}catch(e){{}}
</script>
</body>
</html>"""
    out = os.path.join(output_dir, "roadmap")
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(page)
    print(f"BUILT roadmap: {len(books)} books in {len(sections)} sections -> {out}")



def build():
    from collections import Counter
    books = json.load(open(os.path.join(ROOT, "content", "books.json"), encoding="utf-8"))
    shutil.rmtree(READ, ignore_errors=True)
    os.makedirs(READ, exist_ok=True)
    try:
        pathdata = json.load(open(os.path.join(ROOT, "content", "paths.json"), encoding="utf-8"))
        PATH_ORDER = pathdata.get("order", [])
        PATHS = pathdata.get("paths", {})
    except Exception:
        PATH_ORDER, PATHS = [], {}
    bypath = {}
    for b in books:
        bypath.setdefault(b.get("path", "ci-core"), []).append(b)
    byid = {b["id"]: b for b in books}

    def related_books(b, n=4):
        """Build-time static, context-aware: adjacent path steps first, then
        explicit prereq links, then same path / same category / shared tags."""
        seq = bypath.get(b.get("path", ""), [])
        ids = [x["id"] for x in seq]
        pos = ids.index(b["id"]) if b["id"] in ids else -1
        btags = set(b.get("tags", []))
        scored = []
        for o in books:
            if o["id"] == b["id"]:
                continue
            opos = ids.index(o["id"]) if o["id"] in ids else -1
            sig = []
            if pos >= 0 and opos >= 0:
                d = opos - pos
                if d == 1:
                    sig.append((12, "Next in path"))
                elif d == -1:
                    sig.append((10, "Previous in path"))
                else:
                    sig.append((4, "Same path"))
            if o["id"] in b.get("prereqs", []):
                sig.append((8, "Prerequisite"))
            elif b["id"] in o.get("prereqs", []):
                sig.append((8, "Follow-up"))
            if o["category"] == b["category"]:
                sig.append((3, "Same topic"))
            shared = len(btags & set(o.get("tags", [])))
            if shared:
                sig.append((2 * shared, "Shared tags"))
            score = sum(w for w, _ in sig)
            why = max(sig)[1] if sig else "More to explore"
            scored.append((score, o, why))
        scored.sort(key=lambda t: (-t[0], t[1]["title"]))
        return [(o, w) for _, o, w in scored[:n]]

    def path_next(b):
        seq = bypath.get(b.get("path", ""), [])
        ids = [x["id"] for x in seq]
        if b["id"] in ids and ids.index(b["id"]) + 1 < len(ids):
            return byid[ids[ids.index(b["id"]) + 1]]
        return None

    def related_box_html(rels):
        items = ""
        for o, why in rels:
            color = CAT_HEX.get(o.get("category", ""), "#18E299")
            icon = CATEGORY_ICONS.get(o.get("category", ""), CATEGORY_ICONS["Reference"])
            dc = DIF_CLS.get(o.get("difficulty", ""), "int")
            ds = DIF_SHORT.get(o.get("difficulty", ""), o.get("difficulty", ""))
            items += (
                f'<li class="relcard" data-cat="{html.escape(o.get("category", ""))}" style="--cat:{color}">'
                f'<span class="rel-icon" aria-hidden="true">{icon}</span>'
                f'<span class="rel-main"><a href="{o["id"]}.html">{html.escape(o["title"])}</a>'
                f'<span class="rel-meta">{o.get("time_minutes", 30)} min · <span class="difbadge {dc}">{ds}</span></span>'
                f'<span class="rel-why">→ {html.escape(why)}</span></span></li>')
        return f'<div class="relatedbox"><h4>Related books</h4><ul class="relgrid">{items}</ul></div>'

    def paths_section_html(wrap_id=""):
        """Journey cards: dominant-category accent+icon, connected numbered
        steps with difficulty badges + finish marker, pill footer stats."""
        cards = ""
        for pid in (PATH_ORDER or sorted(bypath.keys())):
            seq = bypath.get(pid, [])
            if not seq:
                continue
            label = PATHS.get(pid, {}).get("label", pid)
            desc = PATHS.get(pid, {}).get("desc", "")
            tmin = sum(x.get("time_minutes", 30) for x in seq)
            dom = Counter(x.get("category", "") for x in seq).most_common(1)[0][0]
            color = CAT_HEX.get(dom, "#18E299")
            icon = CATEGORY_ICONS.get(dom, CATEGORY_ICONS["Reference"])
            ranks = sorted(DIFF_RANK.get(x.get("difficulty", ""), 9) for x in seq)
            inv = {v: k for k, v in DIFF_RANK.items()}
            lo, hi = DIF_SHORT.get(inv.get(ranks[0], ""), ""), DIF_SHORT.get(inv.get(ranks[-1], ""), "")
            span = lo if lo == hi else f"{lo}→{hi}"
            steps = ""
            for n, x in enumerate(seq, 1):
                last = n == len(seq)
                dc = DIF_CLS.get(x.get("difficulty", ""), "int")
                ds = DIF_SHORT.get(x.get("difficulty", ""), x.get("difficulty", ""))
                fin = ' <span class="finpill">🏁 Finish</span>' if last else ""
                steps += (
                    f'<li class="pathstep{" finish" if last else ""}" data-n="{n:02d}">'
                    f'<a class="steptitle" href="read/{x["id"]}.html">{html.escape(x["title"])}</a>'
                    f'<span class="stepmeta">{x.get("time_minutes", 30)} min · <span class="difbadge {dc}">{ds}</span>{fin}</span></li>')
            long = " long" if len(seq) >= 6 else ""
            unit = "book" if len(seq) == 1 else "books"
            cards += (
                f'<article class="pathcard" id="path-{pid}" data-cat="{html.escape(dom)}" style="--cat:{color}" aria-label="{html.escape(label)} learning path">'
                f'<div class="pathcard-head"><span class="map-icon" aria-hidden="true">{icon}</span>'
                f'<div class="pathcard-titles"><h3>{html.escape(label)}</h3>'
                f'<span class="pathcount">{len(seq)} {unit} · ~{tmin} min</span></div></div>'
                f'<p class="pathdesc">{html.escape(desc)}</p>'
                f'<ol class="pathsteps{long}">{steps}</ol>'
                f'<div class="pathfoot"><span class="map-pill"><b>{len(seq)}</b> {unit}</span>'
                f'<span class="map-pill">~<b>{tmin}</b> min</span>'
                f'<span class="map-pill">Level <b>{span}</b></span></div></article>')
        inner = ('<div class="collectlabel">LEARNING PATHS</div>'
                 '<p class="sub">Ordered end to end — follow a path, don\u2019t wander shelves.</p>'
                 f'<div class="pathgrid" data-testid="learning-paths">{cards}</div>')
        return f'<div id="{wrap_id}">{inner}</div>' if wrap_id else inner

    build_map_page(books, DIST)
    build_roadmap_page(books, DIST)
    _build_extra(books, DIST, {"ROOT": ROOT, "PDF": PDF, "BASE_CSS": BASE_CSS, "CAT_HEX": CAT_HEX, "parse_book": parse_book})
    # shared icon library: single source (KB assets) copied into dist
    shutil.rmtree(os.path.join(DIST, "assets"), ignore_errors=True)
    shutil.rmtree(os.path.join(DIST, "book"), ignore_errors=True)  # overviews removed
    shutil.rmtree(os.path.join(DIST, "downloads"), ignore_errors=True)  # stale lab PDFs
    shutil.copytree(os.path.join(KB, "assets"), os.path.join(DIST, "assets"))
    # print editions ship with the site so reader "Open print HTML" works live
    shutil.rmtree(os.path.join(DIST, "pdf"), ignore_errors=True)
    shutil.copytree(PDF, os.path.join(DIST, "pdf"))
    for _pf in glob.glob(os.path.join(DIST, "pdf", "**", "*.html"), recursive=True):
        try:
            _ph = open(_pf, encoding="utf-8").read()
            if 'rel="icon"' not in _ph:
                _prefix = "../" * os.path.relpath(_pf, DIST).count(os.sep)
                _tag = '<link rel="icon" type="image/svg+xml" href="' + _prefix + 'favicon.svg">'
                if "<head>" in _ph:
                    _ph = _ph.replace("<head>", "<head>" + _tag, 1)
                else:
                    _ph = _tag + _ph
                open(_pf, "w", encoding="utf-8").write(_ph)
        except Exception:
            pass
    stats = []

    # (path context + related/path helpers are defined at the top of build())

    all_sections = {}
    # P2.3: book id -> markdown source (from AUDIT_STRUCTURE mapping; 3 roadmaps are pdf-only)
    MD_MAP = {"start-here": ["00-foundations/start-here-merged.md"], "build-artifacts": ["06-ci-cd-pipelines/pipelines-build-test.md", "05-artifacts-and-packaging/artifact-management.md"], "deliver-operate": ["10-deployment-strategies/deployment-strategies.md", "07-continuous-delivery/delivery-envs-iac.md", "13-observability-and-feedback/observe-recover-secure.md"], "jenkins-complete": ["15-platforms-and-tools/jenkins/jenkins-core-merged.md", "15-platforms-and-tools/jenkins/jenkins-advanced-ops.md"], "platforms-roadmaps": ["15-platforms-and-tools/github-actions.md", "15-platforms-and-tools/gitlab-argocd.md"], "labs-handbook": ["16-labs/core-labs-handbook.md", "16-labs/jenkins-labs-handbook.md"], "cheatsheet": ["17-reference/command-cheatsheet.md"]}
    all_body = {}
    for idx, b in enumerate(books):
        css, pages = parse_book(os.path.join(PDF, b["file"]))
        # Some older print files are shells with a cover but no article body.
        # The canonical Markdown source is the authoritative fallback so those
        # books and labs remain readable instead of silently rendering empty.
        _sps = MD_MAP.get(b["id"]) or []
        if isinstance(_sps, str):
            _sps = [_sps]
        _sps = [sp for sp in _sps if os.path.exists(os.path.join(KB, sp))]
        page_text = re.sub(r"<[^>]+>", " ", "".join(pages))
        if _sps and len(page_text.strip()) < 500:
            _combo = []
            for _sp in _sps:
                for _i, _pg in enumerate(markdown_pages(os.path.join(KB, _sp), b["title"])):
                    if _i == 0 and _combo:
                        continue
                    _combo.append(_pg)
            pages = _combo or pages
        toc = toc_of(pages)
        _secs = [t for _, t, _ in toc][:60]
        try:
            _pdfh = open(os.path.join(PDF, b["file"]), encoding="utf-8").read()
            for _nt in re.findall(r'<h1 class="t">(.*?)</h1>', _pdfh):
                _nt = html.unescape(re.sub(r"<[^>]+>", "", _nt)).strip()
                if _nt and _nt not in _secs:
                    _secs.append(_nt)
        except Exception:
            pass
        all_sections[b["id"]] = _secs
        # body text for section-level search: md source preferred (full), pdf fallback
        body_txt = ""
        try:
            _mps = MD_MAP.get(b["id"]) or []
            if isinstance(_mps, str):
                _mps = [_mps]
            raw = ""
            for mp in _mps:
                if mp and os.path.exists(os.path.join(KB, mp)):
                    raw += "\n" + open(os.path.join(KB, mp), encoding="utf-8").read()
            if raw.strip():
                raw = re.sub(r"^---.*?---\s*", "", raw, flags=re.S)
                raw = re.sub(r"<!--.*?-->", " ", raw, flags=re.S)
                raw = re.sub(r"```.*?```", " ", raw, flags=re.S)
                raw = re.sub(r"[`#>*|\[\]()!]", " ", raw)
                raw = re.sub(r"\s+", " ", raw).strip()
                _praw = open(os.path.join(PDF, b["file"]), encoding="utf-8").read()
                _newbits = " ".join(re.findall(r'<h1 class="t">(.*?)</h1>', _praw))
                _newbits += " " + " ".join(re.findall(r'WHEN TO USE [A-Z/ ]+', _praw))
                _newbits = html.unescape(re.sub(r"<[^>]+>", " ", _newbits)).strip()
                _praw = re.sub(r"<style.*?</style>", " ", _praw, flags=re.S | re.I)
                _praw = re.sub(r"<[^>]+>", " ", _praw)
                _praw = html.unescape(re.sub(r"\s+", " ", _praw)).strip()
                body_txt = (_newbits + " " + raw + " " + _praw)[:5000]
            else:
                praw = open(os.path.join(PDF, b["file"]), encoding="utf-8").read()
                praw = re.sub(r"<style.*?</style>", " ", praw, flags=re.S | re.I)
                praw = re.sub(r"<[^>]+>", " ", praw)
                praw = html.unescape(re.sub(r"\s+", " ", praw)).strip()
                body_txt = praw[:5000]
        except Exception:
            body_txt = ""
        all_body[b["id"]] = body_txt
        prevb = books[idx - 1] if idx > 0 else None
        nextb = books[idx + 1] if idx + 1 < len(books) else None
        rels = related_books(b)
        upnext = path_next(b)
        is_lab = b.get("path") == "labs" or b["category"] == "Labs"
        # P2.2: path position + prereq context (derived from books.json, no new fields needed)
        pseq = bypath.get(b.get("path", ""), [])
        pids = [x["id"] for x in pseq]
        ppos = pids.index(b["id"]) + 1 if b["id"] in pids else 1
        ptotal = len(pseq) if pseq else 1
        plabel = PATHS.get(b.get("path", ""), {}).get("label", b.get("path", ""))
        preqs = b.get("prereqs", [])
        if preqs:
            preq_links = "".join(
                f'<a href="{p}.html">{html.escape(byid[p]["title"])}</a>' if p in byid else f'<span>{html.escape(p)}</span>'
                for p in preqs)
            prereq_html = f'<span class="prereq">Prereq:{preq_links}</span>'
        else:
            prereq_html = '<span class="prereq">Prereq: None — start here</span>'
        contextbar = (
            f'<a href="../index.html">Home</a><span>›</span>'
            f'<a href="../index.html#path-{html.escape(b.get("path", ""))}">{html.escape(plabel)}</a><span>›</span>'
            f'<span class="here">{html.escape(b["title"])}</span>'
            f'<span class="pathpos">{ppos} of {ptotal} in {html.escape(plabel)}</span>'
            f'{prereq_html}</div></div>')

        # flow mode: strip print chrome (per-page headers/footers, print notes)
        # so the book reads as one document, not stacked A4 sheets
        stripped = {"phead": 0, "pfoot": 0, "printnote": 0}
        flow_pages = []
        for p in pages:
            for cls in ("phead", "pfoot", "printnote"):
                p, n = re.subn(r'<div class="' + cls + r'">.*?</div>', "", p, flags=re.S)
                stripped[cls] += n
            flow_pages.append(p)
        pages = flow_pages

        body_pages = []
        for i, p in enumerate(pages):
            hnum = 0
            def mark_heading(match):
                nonlocal hnum
                if 'id=' in match.group(2):
                    return match.group(0)
                hnum += 1
                return f'<{match.group(1)} id="p{i+1}-h{hnum}"{match.group(2)}>'
            # Same heading set as toc_of() (bare + attributed h2/h3/h4) so
            # per-heading anchors p{i}-h{n} stay aligned with TOC numbering.
            p = re.sub(r'<(h[234])([^>]*)>', mark_heading, p)
            body_pages.append(re.sub(r'class="page', f'id="p{i+1}" class="page', p, count=1))
        # Reader TOC is rebuilt from the post-strip, id-injected pages so
        # every entry points at a heading that exists in the output.
        # (The loop-top toc stays pre-strip for the search index.)
        toc = toc_of(body_pages)
        toc_html = "".join(f'<a href="#{page_id}" class="toc-l{lvl}" aria-label="{html.escape(t)}">{html.escape(t)}</a>' for page_id, t, lvl in toc)
        # P2 Top-5 #4: chapnav follows path order, not manifest order
        pprev = pseq[ppos - 2] if ppos > 1 else None
        pnext = pseq[ppos] if ppos < ptotal else None
        prev_link = f'<a id="prevbook" href="{pprev["id"]}.html"><small>← {html.escape(plabel)}</small>{html.escape(pprev["title"])}</a>' if pprev else "<span></span>"
        next_link = f'<a id="nextbook" class="r" href="{pnext["id"]}.html"><small>{html.escape(plabel)} →</small>{html.escape(pnext["title"])}</a>' if pnext else "<span></span>"
        tocbtn_label = f'☰ Contents · {len(toc)}'
        top_upnext = f'<div class="upnext upnext-top">Up next in {html.escape(plabel)} → <a href="{upnext["id"]}.html"><b>{html.escape(upnext["title"])}</b></a></div>' if upnext else ""

        page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<title>{html.escape(b['title'])} — CICD BY Nabawy</title>
{seo_tags(f"{b['title']} — CICD BY Nabawy", b.get("description",""), f"{SITE_URL}/read/{b['id']}.html", og_type="article", image=f"{SITE_URL}/og/{b['id']}.{OG_EXT}")}
{(f'<link rel="prefetch" href="{upnext["id"]}.html">' if upnext else '') + (f'<link rel="prefetch" href="{nextb["id"]}.html">' if nextb and (not upnext or nextb["id"] != upnext["id"]) else '')}
<style>{BASE_CSS}</style><script>try{{var _p=JSON.parse(localStorage.getItem('cicdlib:pref')||'null');var _t=_p&&_p.theme;var _ok=['sepia','dark','light','dim','contrast'].indexOf(_t)>=0;document.documentElement.dataset.theme=_ok?_t:'sepia'}}catch(e){{document.documentElement.dataset.theme='sepia'}}</script>
{f'<script type="application/ld+json">{json.dumps({"@context":"https://schema.org","@type":"TechArticle","headline":b["title"],"description":b.get("description",""),"url":SITE_URL + "/read/" + b["id"] + ".html","author":{"@type":"Person","name":"Nabawy"},"isPartOf":{"@type":"CollectionPage","name":"CICD BY Nabawy","url":SITE_URL}})}</script>'}
{f'<script type="application/ld+json">{json.dumps({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Library","item":SITE_URL + "/"},{"@type":"ListItem","position":2,"name":b["title"],"item":SITE_URL + "/read/" + b["id"] + ".html"}]})}</script>'}
<style>{css}
/* reader overrides */
.readbody .page:not(.cover){{width:auto !important;min-height:0 !important;margin:0 auto !important;padding:10px 26px !important;background:transparent !important;border-radius:0;page-break-after:auto !important;overflow:visible}}
.readbody .page.cover{{align-items:flex-start !important;border-radius:16px;padding:48px 34px !important;margin:0 auto 30px !important}}
.readbody .sheet{{width:auto !important;height:auto !important;min-height:0 !important;margin:0 auto 22px !important;padding:26px !important;border-radius:14px;page-break-after:auto !important;overflow:visible}}
.readbody .sheet::before{{display:none}}
.readbody .sheet.cover{{min-height:0 !important}}
.readbody .sheet.cover .cver{{position:static !important;margin-top:26px}}
.readbody .folio{{position:static !important;margin:14px 0 0}}
.readbody .sheet,.readbody h2,.readbody h3,.readbody h4{{scroll-margin-top:78px}}
body.fs header.top,body.fs aside.toc,body.fs .tocscrim,body.fs #resume,body.fs .chapnav{{display:none !important}}
body.fs .rlayout{{max-width:none}}
body.fs main.read{{padding:26px 22px 120px}}
body.fs .readbody{{max-width:880px}}
.readbody .page.opener .bignum{{margin-top:30px}}
[data-theme=dark] .readbody{{--paper:#10161d;--white:#151c25;--ink:#e6edf3;--muted:#8b949e;--line:#26303d;--panel:#0a0e14;--text-light:#e6edf3}}
[data-theme=dark] .readbody table.cmp td:first-child{{background:var(--white)}}
[data-theme=dark] .readbody .fnode.gate{{background:rgba(217,154,36,.12)}}
[data-theme=dark] .readbody .i-gr{{background:var(--muted)}}
/* SIGNAL theme layer: all book colors flow from :root vars, remapped per theme */
[data-theme=dark] .readbody{{--bg:#0d141b;--panel:#151e28;--panel2:#1b2634;--ink:#e6edf3;--dim:#8b98a9;--line:#2a3644;--line2:#333f4e;--code-bg:#0f1e2b;--teal:#2dd4bf;--teal-d:#5eead4;--teal-t:#123a45;--indigo:#a5b4fc;--indigo-t:#232350;--ok:#4ade80;--ok-t:#123a24;--warn:#fbbf24;--warn-t:#3f2c12;--fail:#f87171;--fail-t:#3f1a1a}}
[data-theme=dark] .readbody p.lead,[data-theme=dark] .readbody .qa .ans{{color:#b8c4d0}}
[data-theme=dark] .readbody table.tb th{{background:#1b2634;color:#e6edf3}}
[data-theme=sepia] .readbody{{--bg:#f2ecdf;--panel:#fffaf0;--panel2:#ece2cc;--ink:#3B2F1E;--dim:#6F665A;--line:rgba(59,47,30,.16);--line2:rgba(59,47,30,.28);--teal-t:#e2ece5;--indigo-t:#e6e6f5;--ok-t:#e2efe4;--warn-t:#f5ecd9;--fail-t:#f5e3e3}}
[data-theme=sepia] .readbody p.lead,[data-theme=sepia] .readbody .qa .ans{{color:#6F665A}}
[data-theme=light] .readbody{{--bg:#f2f5f8;--panel:#ffffff;--panel2:#eaf0f4;--ink:#16222e;--dim:#5c6b7a;--line:#dde4ea;--line2:#cbd6de;--code-bg:#0f1e2b}}
</style>
</head>
<body data-book="{b['id']}">
<header class="top"><div class="wrap">
<button class="btn tocbtn" id="tocbtn" aria-label="Open table of contents">{tocbtn_label}</button>
<nav class="crumbs"><a class="logo" href="../index.html" style="color:inherit"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="5" cy="12" r="2.6" stroke="#18E299" stroke-width="2"/><circle cx="19" cy="6" r="2.6" stroke="#18E299" stroke-width="2"/><circle cx="19" cy="18" r="2.6" stroke="#18E299" stroke-width="2"/><path d="M7.6 12h5.2m0 0-2.6-2.6m2.6 2.6-2.6 2.6M13.4 7.4l2.8-1M13.4 16.6l2.8 1" stroke="#18E299" stroke-width="2" stroke-linecap="round"/></svg>CICD<span> BY Nabawy</span></a>
<span class="sep">/</span>
<span class="here">{html.escape(b['title'])}</span></nav>
<div class="search"><input id="q" type="search" placeholder="Find in this book…" aria-label="Find in this book"><kbd>⌘K</kbd></div>
<span id="qcount" style="font-size:12px;color:var(--mut)"></span>
<a class="readback btn reader-nav" id="backbtn" href="../index.html">← Back</a>
<nav class="reader-nav" aria-label="Reader navigation"><a class="btn" href="../index.html" style="text-decoration:none">Home</a>
<a class="btn" href="../threads/" style="text-decoration:none">Threads</a>
<a class="btn" href="../tools/" style="text-decoration:none">Tools</a>
</nav>
<button class="btn" id="fsbtn" aria-label="Toggle fullscreen">⛶</button>
<button class="btn" id="themebtn" aria-label="Cycle theme">◐</button>
<button class="btn mobilemenu" id="mobilemenubtn" aria-label="Open reader menu" aria-expanded="false">☰</button>
</div>
<div class="prog" style="height:3px;background:var(--line)"><b id="pbar" style="display:block;height:100%;width:0;background:var(--acc)"></b></div>
</header>
<div class="rlayout">
<aside class="toc" role="dialog" aria-modal="false" aria-label="Table of contents"><div class="toc-head"><h4>CONTENTS · {len(pages)} PAGES · {len(toc)} SECTIONS</h4><button class="drawerx" id="tocx" aria-label="Close contents">×</button></div>{toc_html}
</aside><div class="tocscrim" id="tocscrim" aria-hidden="true"></div>
<main class="read"><div class="readbody">
{top_upnext}
{f'<div class="labbanner">🧪 Hands-on lab · {b.get("time_minutes", 45)} min · Env: {html.escape(b.get("lab_env", "See book overview"))} · <a href="../pdf/' + b["file"] + '">Print edition</a> · <button class="markbtn" id="labreset" style="margin-left:8px">Reset checks</button></div>' if is_lab else ''}
{''.join(body_pages)}
{f'<div class="upnext">Up next in {html.escape(PATHS.get(b.get("path", ""), {}).get("label", b.get("path", "")))} → <a href="{upnext["id"]}.html"><b>{html.escape(upnext["title"])}</b></a></div>' if upnext else ''}
{related_box_html(rels)}
<div class="chapnav">{prev_link}{next_link}</div>
</div></main>
<div id="lightbox" role="dialog" aria-label="Diagram viewer"><img alt="Enlarged diagram"></div>
</div>
<button class="topbtn" id="topbtn" aria-label="Back to top" title="Back to top">↑</button>
<div class="drawer" id="drawer"><div class="scrim"></div><div class="panel" role="dialog" aria-modal="false" aria-label="Reader menu"><button class="drawerx" id="setx" aria-label="Close settings">×</button>
<h3>Menu</h3>
<div class="setrow mobile-controls"><a class="readback btn" href="../index.html">← Back</a> <button class="btn" id="fsbtnm" aria-label="Toggle fullscreen">⛶</button><a class="btn" href="../index.html">Home</a><button class="btn" id="mthemebtn" aria-label="Cycle theme">◐</button></div>
<div class="setrow mobile-search"><label for="mobileq">Find in this book</label><input id="mobileq" type="search" placeholder="Search this book…"></div>







</div></div>
<div id="fsbar" hidden><button class="btn" id="fs-theme" aria-label="Cycle theme">◐</button><span id="fs-prog">0%</span><button class="btn" id="fs-exit">⛶ Exit</button></div><button class="btn" id="fsexit-m" aria-label="Exit fullscreen">⛶</button>
<script>{READER_JS}</script>
</body>
</html>"""
        open(os.path.join(READ, b["id"] + ".html"), "w", encoding="utf-8").write(page)
        stats.append((b, len(pages), len(toc)))

    # Dedicated lab manuals: same reader theme, direct lab-to-lab navigation,
    # checklists, and downloadable PDFs without mixing labs into the library UI.
    lab_dir = os.path.join(DIST, "labs")
    shutil.rmtree(lab_dir, ignore_errors=True)
    os.makedirs(lab_dir, exist_ok=True)
    lab_books = [b for b in books if b.get("category") == "Labs"]
    for b in lab_books:
        source = os.path.join(READ, b["id"] + ".html")
        target = os.path.join(lab_dir, b["id"] + ".html")
        shutil.copyfile(source, target)
    lab_links = "".join(
        f'<li><a href="{b["id"]}.html">{html.escape(b["title"])}</a>'
        f'<span>{b.get("time_minutes", 45)} min · {html.escape(b.get("lab_env", "Hands-on environment"))}</span></li>'
        for b in lab_books
    )
    lab_index = f'''<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><title>Hands-on Labs — CICD BY Nabawy</title>{seo_tags("Hands-on Labs — CICD BY Nabawy", "Direct HTML manuals for every CI/CD lab.", f"{SITE_URL}/labs/")}<style>{BASE_CSS}.lab-index{{max-width:920px;margin:0 auto;padding:54px 24px 90px}}.lab-index h1{{font-size:42px;margin:12px 0}}.lab-index p{{color:var(--mut);font-size:17px;max-width:680px;line-height:1.6}}.lab-index ul{{list-style:none;padding:0;margin:34px 0;display:grid;gap:10px}}.lab-index li{{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:18px 20px;background:var(--card);border:1px solid var(--line-soft);border-radius:12px}}.lab-index li span{{color:var(--mut);font-size:13px}}@media(max-width:600px){{.lab-index{{padding:34px 14px}}.lab-index h1{{font-size:32px}}.lab-index li{{display:block}}.lab-index li span{{display:block;margin-top:6px}}}}</style></head><body><header class="top"><div class="wrap"><a class="logo" href="../index.html" style="color:inherit">CICD<span> BY Nabawy</span></a><a class="btn" href="../index.html">Home</a></div></header><main class="lab-index"><span class="eyebrow">HANDS-ON LABS</span><h1>Practice the pipeline.</h1><p>One hands-on handbook from the first green check through Jenkins recovery and DR drills. Each lab includes setup, execution, verification, failure scenarios, and cleanup.</p><ul>{lab_links}</ul></main></body></html>'''
    open(os.path.join(lab_dir, "index.html"), "w", encoding="utf-8").write(lab_index)

    cats = sorted(set(b["category"] for b in books))
    byid = {b["id"]: b for b in books}
    CAT_ORDER = ["Start Here","Build","Deliver","Observability","Jenkins","Platforms","Labs","Reference"]
    cats = [c for c in CAT_ORDER if c in byid or any(b["category"] == c for b in books)] + [c for c in cats if c not in CAT_ORDER]
    def card(b, i):
        initials = "".join(w[0] for w in re.sub(r"[^A-Za-z0-9 ]", "", b["title"]).split()[:2]).upper()
        tmin = b.get("time_minutes", 30)
        tags = " ".join(b.get("tags", []))
        return (
            f'<div class="card book" data-id="{b["id"]}" data-cat="{html.escape(b["category"])}" data-dif="{html.escape(b["difficulty"])}" data-time="{tmin}" data-tags="{html.escape(tags)}" data-title="{html.escape(b["title"])}" data-desc="{html.escape(b["description"])}">'
            f'<div class="coverart" aria-hidden="true"><b>{initials}</b></div>'
            f'<h3><a href="read/{b["id"]}.html">{html.escape(b["title"])}</a></h3><p>{html.escape(b["description"])}</p>'
            f'<div class="dif"><i></i>{b["difficulty"]} · {html.escape(b.get("path", ""))}</div>'
            f'<div class="prog"><b style="width:0%"></b></div>'
            f'<span><a class="read" href="{reader_url(b)}">Read</a></span></div>'
        )
    idx_of = {b["id"]: i for i, b in enumerate(books)}
    CAT_COLORS = {"CI/CD": "#5B8DEF", "Build": "#F5A524", "Testing": "#2ECC71",
                  "Security": "#E5484D", "Reliability": "#9B7BF0", "Jenkins": "#22B8CF",
                  "Delivery": "#F472B6", "GitHub": "#94A3B8", "Platforms": "#F97316",
                  "Labs": "#EAB308", "Reference": "#64748B"}
    CORES = ["Build", "Testing", "Security", "Reliability"]

    RAIL_SHOW = 6
    def rail_inner(cards):
        """First RAIL_SHOW cards inline; rest behind a View-all toggle (outside .rail)."""
        if len(cards) <= RAIL_SHOW:
            return "".join(cards), ""
        extra = ('<div class="railmore" style="display:none">' + "".join(cards[RAIL_SHOW:]) + '</div>'
                   f'<div class="morewrap"><button class="btn railbtn" data-n="{len(cards)}">View all {len(cards)} \u2193</button></div>')
        return "".join(cards[:RAIL_SHOW]), extra
    def shelf(name, count, color, inner, grid=False, sid="", extra=""):
        arrows = ""
        if not grid:
            arrows = ('<span class="arrows"><button data-dir="-1" aria-label="Scroll left">←</button>'
                      '<button data-dir="1" aria-label="Scroll right">→</button></span>')
        wrap = f'<div class="cores-grid">{inner}</div>' if grid else f'<div class="rail">{inner}</div>'
        return (f'<section class="shelf" id="{sid}" style="--cat:{color}"><div class="shelf-head"><h2>{name}</h2>'
                f"<span>{count}</span>{arrows}</div>{wrap}{extra}</section>")

    def slug(name):
        return "shelf-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

    bycat = {}
    for b in books:
        bycat.setdefault(b["category"], []).append(b)
    cores = [(c, [b for b in books if b["category"] == c]) for c in CORES]
    core_books = [b for _, bs in cores for b in bs]
    big = sorted(((c, bs) for c, bs in bycat.items() if c not in CORES and len(bs) >= 3),
                 key=lambda t: -len(t[1]))
    small = sorted(((c, bs) for c, bs in bycat.items() if c not in CORES and len(bs) < 3),
                   key=lambda t: -len(t[1]))
    small_books = [b for _, bs in small for b in bs]

    sections = []
    for c, bs in big:
        _vis, _xtra = rail_inner([card(b, idx_of[b["id"]]) for b in bs])
        sections.append({"name": c, "n": len(bs), "grid": False, "color": CAT_COLORS.get(c, "#18E299"),
                         "inner": _vis, "extra": _xtra})
    if core_books:
        _cvis, _cxtra = rail_inner([card(b, idx_of[b["id"]]) for b in core_books])
        sections.append({"name": "Core practices", "n": len(core_books), "grid": True, "color": "#18E299",
                         "inner": _cvis, "extra": _cxtra})
    if small_books:
        _qvis, _qxtra = rail_inner([card(b, idx_of[b["id"]]) for b in small_books])
        sections.append({"name": "Quick topics", "n": len(small_books), "grid": True, "color": "#18E299",
                         "inner": _qvis, "extra": _qxtra})
    sections.sort(key=lambda s: (-s["n"], 0 if not s["grid"] else 1))
    ogdir = os.path.join(DIST, "og")
    shutil.rmtree(ogdir, ignore_errors=True)
    os.makedirs(ogdir, exist_ok=True)
    for b in books:
        open(os.path.join(ogdir, b["id"] + ".svg"), "w", encoding="utf-8").write(og_svg(b["title"], b["category"], CAT_COLORS.get(b["category"], "#18E299")))
        _png = og_png(b["title"], b["category"], CAT_COLORS.get(b["category"], "#18E299"))
        if _png:
            open(os.path.join(ogdir, b["id"] + ".png"), "wb").write(_png)
    open(os.path.join(ogdir, "library.svg"), "w", encoding="utf-8").write(og_svg("Technical Library", "CI/CD", "#18E299"))
    _libpng = og_png("Technical Library", "CI/CD", "#18E299")
    if _libpng:
        open(os.path.join(ogdir, "library.png"), "wb").write(_libpng)
    # (Browse shelf page removed 2026-09-18: Home index is the single library surface.
    # Search/OG data below is still built for search.json and social cards.)


    # glossary (dedupe by term, anchor links)
    rows = re.findall(r"^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|", open(os.path.join(KB, "GLOSSARY.md"), encoding="utf-8").read(), re.M)
    seen = set()
    MD_INV = {}
    for k, v in MD_MAP.items():
        for _vv in (v if isinstance(v, list) else [v]):
            MD_INV.setdefault(_vv, k)
    cards = ""
    qterms = []
    first_by_letter = {}
    _curL = ""
    for t, d, r in rows:
        t = t.strip()
        if "Term" in t or "---" in t or t.lower() in seen:
            continue
        seen.add(t.lower())
        slug = re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
        _L = re.sub(r"^[^A-Za-z0-9]*", "", t).strip()[:1].upper() or "#"
        if _L not in first_by_letter:
            first_by_letter[_L] = slug
        rm = re.match(r"\[([^]]+)\]\(([^)]+)\)", r.strip())
        if rm:
            rlabel, rpath = rm.group(1), rm.group(2)
            rid = MD_INV.get(rpath)
            topic = f'<a href="read/{rid}.html">{html.escape(rlabel)}</a>' if rid else html.escape(rlabel)
            rl = rlabel
        else:
            topic = md_inline(r.strip()); rl = r.strip()
        esc_t = html.escape(t); esc_d = html.escape(d.strip())
        # flip card: front = term, back = definition + topic + link
        cards += f'<article class="fcard" id="g-{slug}" data-term="{esc_t.lower()}" data-letter="{_L}" aria-label="{esc_t}"><div class="fcard-inner"><div class="fcard-front"><b>{esc_t}</b><span class="fcat">{html.escape(rl[:28])}</span><span class="fcta">tap to flip →</span></div><div class="fcard-back"><p>{esc_d}</p><p class="fmeta">{topic} · <a href="#g-{slug}" title="Permalink">¶</a></p><p><button class="btn fbtn" data-ok="{slug}">Got it ✓</button> <button class="btn fbtn" data-hard="{slug}">Hard ✗</button></p></div></div></article>'
        qterms.append((t, d.strip()))
    _az = "".join(f'<a href="#g-{first_by_letter[L]}">{L}</a>' if L in first_by_letter else f'<span class="dim">{L}</span>' for L in [chr(c) for c in range(65, 91)])
    _qjson = json.dumps([[html.escape(t), html.escape(d)] for t, d in qterms], ensure_ascii=False)
    gloss = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<title>Study Deck — CICD BY Nabawy</title>{seo_tags("Study Deck — CICD BY Nabawy", "Flip cards and quizzes for every CI/CD term — study, test recall, jump to sheets.", f"{SITE_URL}/glossary.html")}<style>{BASE_CSS}
.fgrid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin:14px 0}}
.fcard{{perspective:900px;cursor:pointer;min-height:150px}}
.fcard-inner{{position:relative;width:100%;height:150px;transition:transform .45s;transform-style:preserve-3d}}
.fcard.flipped .fcard-inner{{transform:rotateY(180deg)}}
.fcard-front,.fcard-back{{position:absolute;inset:0;display:flex;flex-direction:column;gap:6px;padding:16px;border:1px solid var(--line-soft);border-radius:14px;background:var(--card);backface-visibility:hidden}}
.fcard-back{{transform:rotateY(180deg);overflow:auto}}
.fcard-front b{{font-size:16px}}.fcard-front .fcat{{font-size:12px;color:var(--mut)}}.fcard-front .fcta{{margin-top:auto;font-size:11px;color:var(--brand)}}
.fcard-back p{{font-size:13px;color:var(--mut);margin:0}}.fcard-back .fmeta{{font-size:11px}}
.fcard.mastered{{opacity:.45}}.fcard.hard{{border-color:var(--red)}}
.qbox{{max-width:640px;margin:18px auto;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px;text-align:center}}
.qbox .opts{{display:grid;gap:8px;margin-top:12px;text-align:left}}.qbox .opts .btn{{justify-content:flex-start;min-height:44px}}
</style><script>try{{var _p=JSON.parse(localStorage.getItem('cicdlib:pref')||'null');var _t=_p&&_p.theme;var _ok=['sepia','dark','light','dim','contrast'].indexOf(_t)>=0;document.documentElement.dataset.theme=_ok?_t:'sepia'}}catch(e){{document.documentElement.dataset.theme='sepia'}}</script></head>
<body>
<header class="top"><div class="wrap"><a class="logo" href="index.html" style="text-decoration:none;color:inherit"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="5" cy="12" r="2.6" stroke="#18E299" stroke-width="2"/><circle cx="19" cy="6" r="2.6" stroke="#18E299" stroke-width="2"/><circle cx="19" cy="18" r="2.6" stroke="#18E299" stroke-width="2"/><path d="M7.6 12h5.2m0 0-2.6-2.6m2.6 2.6-2.6 2.6M13.4 7.4l2.8-1M13.4 16.6l2.8 1" stroke="#18E299" stroke-width="2" stroke-linecap="round"/></svg>CICD<span> BY Nabawy</span></a>
<div class="search"><input id="q" type="search" placeholder="Filter cards…"></div><a class="btn" href="index.html" style="text-decoration:none">Home</a><a class="btn" href="threads/" style="text-decoration:none">Threads</a><a class="btn" href="tools/" style="text-decoration:none">Tools</a><button class="btn" id="themebtn">☀</button></div></header>
<div class="wrap"><div class="hero" style="padding:28px 24px 14px"><span class="eyebrow">STUDY DECK</span><h1>Flip, recall, master.</h1><p><span id="gcount">{len(qterms)}</span> terms · flip to reveal · quiz to lock in · <span id="mcount">0 mastered</span> · <span id="hcount">0 hard</span></p></div>
<div class="gtbar" style="position:sticky;top:57px;z-index:15;background:var(--bg);padding:10px 0 8px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input id="q2" type="search" placeholder="Filter cards…" aria-label="Filter cards" style="flex:1;min-width:180px;background:var(--card);border:1px solid var(--line);color:var(--ink);border-radius:9999px;padding:9px 14px"><button class="btn" id="shuffle">Shuffle</button><button class="btn" id="quizbtn">Quiz me</button><button class="btn" id="reset">Reset</button></div><nav class="az" aria-label="Jump to letter" style="margin-top:8px">{_az}</nav></div>
<div id="qbox" hidden></div>
<div class="fgrid" id="fgrid">{cards}</div></div>
<footer><div class="wrap"><span>CICD BY Nabawy</span><span><a href="index.html">Home</a> · <a href="glossary.html">Study Deck</a> · <a href="threads/">Threads</a> · <a href="tools/">Tools</a></span></div></footer>
<script>{BASE_JS}
const TERMS={_qjson};
function gfilter(el){{const q=(el.value||'').toLowerCase();
$$('.fcard').forEach(c=>{{c.style.display=c.dataset.term.includes(q)||c.textContent.toLowerCase().includes(q)?'':'none'}});
const cc=$$('.fcard').filter(c=>c.style.display!=='none').length;const tot={len(qterms)};const g=$('#gcount');if(g)g.textContent=q?cc+' / '+tot:tot;}};
$('#q').addEventListener('input',e=>gfilter(e.target));const _q2=$('#q2');if(_q2)_q2.addEventListener('input',e=>gfilter(e.target));
$$('.fcard').forEach(c=>{{c.addEventListener('click',e=>{{if(e.target.closest('button'))return;c.classList.toggle('flipped');}});}});
const KEY='cicdlib:deck:';function load(k){{try{{return JSON.parse(localStorage.getItem(KEY+k))}}catch(e){{return null}}}};function save(k,v){{try{{localStorage.setItem(KEY+k,JSON.stringify(v))}}catch(e){{}}}};function sync(){{let m=0,h=0;$$('.fcard').forEach(c=>{{const s=c.id.slice(2);const v=load(s);c.classList.toggle('mastered',v==='ok');c.classList.toggle('hard',v==='hard');if(v==='ok')m++;if(v==='hard')h++;}});const mc=$('#mcount');if(mc)mc.textContent=m+' mastered';const hc=$('#hcount');if(hc)hc.textContent=h+' hard';}};sync();
$$('.fbtn[data-ok]').forEach(b=>b.addEventListener('click',e=>{{e.stopPropagation();save(b.dataset.ok,'ok');sync();}}));$$('.fbtn[data-hard]').forEach(b=>b.addEventListener('click',e=>{{e.stopPropagation();save(b.dataset.hard,'hard');sync();}}));
$('#shuffle').onclick=()=>{{const g=$('#fgrid');[...g.children].sort(()=>Math.random()-.5).forEach(c=>g.appendChild(c));}};
$('#reset').onclick=()=>{{$$('.fcard').forEach(c=>{{localStorage.removeItem(KEY+c.id.slice(2));}});sync();$$('.fcard').forEach(c=>c.classList.remove('flipped'));}};
let _qi=0,_score=0,_qorder=[];function quiz(){{let n=Math.min(12, TERMS.length);let pool=[...TERMS];let hard=pool.filter((_,i)=>{{try{{return localStorage.getItem(KEY+TERMS[i][0].toLowerCase().replace(/[^a-z0-9]+/g,'-'))==='hard'}}catch(e){{return false}}}});if(hard.length>=4)pool=hard.concat(pool.filter(t=>!hard.includes(t)));_qorder=pool.sort(()=>Math.random()-.5).slice(0,n);_qi=0;_score=0;showQ();}};function showQ(){{const qb=$('#qbox');if(_qi>=_qorder.length){{qb.innerHTML='<div class="qbox"><h3>Done — '+_score+' / '+_qorder.length+'</h3><p class="sub">'+(_score===_qorder.length?'Perfect!':_score>_qorder.length/2?'Solid — review the misses':'Keep drilling weak cards')+'</p><p><button class="btn" onclick="document.getElementById(\\'qbox\\').hidden=true">Back to cards</button> <button class="btn" onclick="quiz()">Again</button></p></div>';qb.hidden=false;window.scrollTo({{top:qb.offsetTop-80}});return;}};const cur=_qorder[_qi];const opts=[cur[1]];while(opts.length<4){{const r=TERMS[Math.floor(Math.random()*TERMS.length)][1];if(!opts.includes(r))opts.push(r);}};opts.sort(()=>Math.random()-.5);let html='<div class="qbox"><p class="sub">Question '+(_qi+1)+' / '+_qorder.length+' · score '+_score+'</p><h3>'+cur[0]+'</h3><div class="opts">'+opts.map(o=>'<button class="btn qo">'+o+'</button>').join('')+'</div><p><button class="btn" onclick="document.getElementById(\\'qbox\\').hidden=true">Exit quiz</button></p></div>';qb.innerHTML=html;qb.hidden=false;qb.querySelectorAll('.qo').forEach(b=>b.onclick=()=>{{const ok=b.textContent===cur[1];if(ok)_score++;b.style.borderColor=ok?'var(--brand)':'var(--red)';setTimeout(()=>{{_qi++;showQ();}},700);}});window.scrollTo({{top:qb.offsetTop-80}});}};$('#quizbtn').onclick=quiz;
const THS=['sepia','dark','light'],THI={{dark:'☀',light:'☾',sepia:'◐'}};
function syncTheme(){{const p=getP('cicdlib:pref',{{theme:'sepia'}});const th=THS.includes(p.theme)?p.theme:'sepia';document.documentElement.dataset.theme=th;const t=$('#themebtn');if(t)t.textContent=THI[th]||'☀'}}
syncTheme();
$('#themebtn').onclick=()=>{{const p=getP('cicdlib:pref',{{theme:'sepia'}});p.theme=THS[(THS.indexOf(p.theme)+1)%THS.length];setP('cicdlib:pref',p);syncTheme()}};
</script></body></html>"""
    open(os.path.join(DIST, "glossary.html"), "w", encoding="utf-8").write(gloss)


    # --- P1: updates page (per-book date from git, manifest fallback) ---
    import subprocess as _sp
    from datetime import date as _du
    _today = _du.today()
    def _book_date(b):
        cands = [os.path.join(PDF, b["file"])]
        _src = MD_MAP.get(b["id"]) or []
        for _s in (_src if isinstance(_src, list) else [_src]):
            cands.append(os.path.join(KB, _s))
        for _cp in cands:
            try:
                _out = _sp.check_output(["git", "log", "-1", "--format=%ad", "--date=short", "--", os.path.relpath(_cp, KB)], cwd=KB, stderr=_sp.DEVNULL, text=True).strip()
                if _out:
                    return _out
            except Exception:
                pass
        return b.get("updated", "")
    def _fresh(ds):
        try:
            return (_today - _du.fromisoformat(ds)).days <= 60
        except Exception:
            return False
    def _urow(b):
        _ds = _book_date(b)
        _rib = ' <span class="upd">\u25cf Updated</span>' if _fresh(_ds) else ""
        return (f'<tr><td><a href="read/{b["id"]}.html">{html.escape(b["title"])}</a></td><td>{html.escape(b["category"])}</td><td>{b["difficulty"]}</td><td>v{html.escape(b.get("version", "2.0"))}</td><td>{html.escape(_ds)}{_rib}</td><td>{b.get("time_minutes", 30)} min</td></tr>')
    rows_u = "".join(_urow(b) for b in books)
    upd = f"""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><title>Updates — CICD BY Nabawy</title>{seo_tags("Updates — CICD BY Nabawy", "What changed across the library.", f"{SITE_URL}/updates.html")}<style>{BASE_CSS}</style><script>try{{var _p=JSON.parse(localStorage.getItem('cicdlib:pref')||'null');var _t=_p&&_p.theme;var _ok=['sepia','dark','light','dim','contrast'].indexOf(_t)>=0;document.documentElement.dataset.theme=_ok?_t:'sepia'}}catch(e){{document.documentElement.dataset.theme='sepia'}}</script></head><body><header class="top"><div class="wrap"><a class="logo" href="index.html" style="color:inherit">CICD<span> BY Nabawy</span></a><nav class="crumbs"><span class="sep">/</span><span class="here">Updates</span></nav></div></header><div class="wrap"><h2 class="sec">Updates</h2><p class="sub">{len(books)} books · P0+P1 shipped Sep 2026: metadata, filters, paths, bookmarks, related, lab checks</p><table class="gloss"><tr><th>Book</th><th>Category</th><th>Level</th><th>Ver</th><th>Updated</th><th>Time</th></tr>{rows_u}</table></div></body></html>"""
    open(os.path.join(DIST, "updates.html"), "w", encoding="utf-8").write(upd)

    # --- SEO: sitemap + robots ---
    from datetime import date as _d
    today = _d.today().isoformat()
    urls = [SITE_URL + "/", SITE_URL + "/glossary.html", SITE_URL + "/roadmap/", SITE_URL + "/map.html", SITE_URL + "/updates.html", SITE_URL + "/threads/", SITE_URL + "/tools/"]
    for b in books:
        urls.append(f"{SITE_URL}/read/{b['id']}.html")
        urls.append(f"{SITE_URL}/read/{b['id']}.html")
    for q in sorted(pathlib.Path(os.path.join(DIST, "pdf")).rglob("*.html")):
        rel = q.relative_to(pathlib.Path(DIST)).as_posix()
        urls.append(f"{SITE_URL}/{rel}")
    sm = '<?xml version="1.0" encoding="UTF-8"?>' + chr(10) + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + chr(10) + chr(10).join(f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>" for u in urls) + chr(10) + '</urlset>' + chr(10)
    pathlib.Path(os.path.join(DIST, "sitemap.xml")).write_text(sm, encoding="utf-8")
    pathlib.Path(os.path.join(DIST, "robots.txt")).write_text(f"User-agent: *{chr(10)}Allow: /{chr(10)}Sitemap: {SITE_URL}/sitemap.xml{chr(10)}", encoding="utf-8")

    # --- P0: 404 + search index ---
    notfound = f"""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><title>Not found — CICD BY Nabawy</title><link rel="icon" type="image/svg+xml" href="https://eslamnabawy.github.io/cicd-by-nabawy/favicon.svg"><meta name="theme-color" content="#0B0D10"><style>{BASE_CSS}</style><script>try{{var _p=JSON.parse(localStorage.getItem('cicdlib:pref')||'null');var _t=_p&&_p.theme;var _ok=['sepia','dark','light','dim','contrast'].indexOf(_t)>=0;document.documentElement.dataset.theme=_ok?_t:'sepia'}}catch(e){{document.documentElement.dataset.theme='sepia'}}</script></head><body><div class="wrap" style="text-align:center;padding:80px 20px"><h1>Page not found</h1><p class="sub">Try search or start with Foundations.</p><p><a class="btn" href="index.html">Home</a> <a class="btn" href="read/start-here.html">Start here</a> <a class="btn" href="glossary.html">Study Deck</a></p></div></body></html>"""
    pathlib.Path(os.path.join(DIST, "404.html")).write_text(notfound, encoding="utf-8")
    pathlib.Path(os.path.join(DIST, "favicon.svg")).write_text(FAVICON_SVG, encoding="utf-8")
    search_idx = [{"id": b["id"], "title": b["title"], "desc": b.get("description", ""), "cat": b["category"], "dif": b["difficulty"], "tags": b.get("tags", []), "time": b.get("time_minutes", 30), "sections": all_sections.get(b["id"], []), "body": all_body.get(b["id"], "")[:2000]} for b in books]
    pathlib.Path(os.path.join(DIST, "search.json")).write_text(json.dumps(search_idx, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"BUILT {len(books)} books + {len(books)} readers + index + glossary + updates -> {DIST}")


if __name__ == "__main__":
    build()


