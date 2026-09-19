'''Concept threads + tool picker pages. Called from build.py as
build_extra_pages(books, DIST, env) with env providing shared globals.'''
import os
import re
import json
import html as htmllib


def thread_hits(text, terms):
    n = 0
    for term in terms:
        if len(term) <= 5:
            pat = '\\b' + re.escape(term.lower()) + '\\b'
        else:
            pat = re.escape(term.lower())
        if re.search(pat, text):
            n += 1
    return n


def build_thread_index(books, env):
    threads = json.load(open(os.path.join(env['ROOT'], 'content', 'threads.json'), encoding='utf-8'))
    parse_book = env['parse_book']
    PDF = env['PDF']
    index = {}
    for th in threads:
        index[th['id']] = []
    for b in books:
        _css, pages = parse_book(os.path.join(PDF, b['file']))
        for pg in pages:
            m = re.search(r'id="([^"]+)"', pg[:200])
            sid = m.group(1) if m else ''
            h1 = re.search(r'<h1 class="t">(.*?)</h1>', pg, re.S)
            if h1:
                title = htmllib.unescape(re.sub(r'<[^>]+>', '', h1.group(1)).strip())[:60]
            else:
                continue
            txt = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', pg)).strip().lower()
            for th in threads:
                if thread_hits(txt, th['terms']) >= 2:
                    index[th['id']].append({'book': b['id'], 'title': b['title'], 'sid': sid, 'sheet': title})
    return threads, index


THEME_JS = '''
const $=s=>document.querySelector(s);
function getP(k,d){try{const v=JSON.parse(localStorage.getItem(k));return v??d}catch(e){return d}}
function setP(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
const pref=getP('cicdlib:pref',{theme:'sepia'});
const THS=['sepia','dark','light'],THI={dark:'\\u2600',light:'\\u263e',sepia:'\\u25d0'};
function syncTheme(){const th=THS.includes(pref.theme)?pref.theme:'sepia';document.documentElement.dataset.theme=th;const t=$('#themebtn');if(t)t.textContent=THI[th]||'\\u2600';}
syncTheme();
$('#themebtn').onclick=()=>{pref.theme=THS[(THS.indexOf(pref.theme)+1)%THS.length];setP('cicdlib:pref',pref);syncTheme();};
'''

HEAD_THEME = '''<script>try{var _p=JSON.parse(localStorage.getItem('cicdlib:pref')||'null');var _t=_p&&_p.theme;document.documentElement.dataset.theme='sepia';if(_t==='dark'||_t==='light')document.documentElement.dataset.theme=_t;}catch(e){document.documentElement.dataset.theme='sepia';}</script>'''


THREAD_WHY = {
    'artifact-digest': ('Rebuilds waste hours and ship untested code — one digest ends that.', 'Exam: name the digest, the registry, and the promotion gate.'),
    'approval-gates': ('Every prod deploy is a decision — gates make the decision explicit.', 'Exam: who approves, on what signal, with what kill switch.'),
    'rollback-recovery': ('Deploys fail — recovery speed is the real SLO.', 'Exam: redeploy vs revert, then the postmortem pipeline change.'),
    'trunk-discipline': ('Long branches are merge hell — small daily merges keep main green.', 'Exam: PR gates, merge queue, red-main-first rule.'),
    'hermetic-builds': ('"Works here, fails there" is an input leak — seal the build.', 'Exam: lockfiles, clean containers, cache keys.'),
    'supply-chain': ('2025-26 attacks rode trusted deps into CI — verify everything.', 'Exam: pin, sign, attest, scan.'),
    'signals-slos': ('Without signals a deploy is a cliff — budgets turn noise into pages.', 'Exam: SLI vs SLO vs burn-rate alert.'),
    'gitops-pull': ('Push pipelines leak cluster creds — pull keeps them inside.', 'Exam: push vs pull blast radius, sync waves, git revert.'),
    'controller-agent': ('Every platform is scheduler plus executor — learn the shape once.', 'Exam: who schedules, who executes, where runners live.'),
}
THREAD_STORY = {
    'artifact-digest': ('A team rebuilt the same image 3 times — staging passed, prod failed on a stray dep. One digest would have caught it at build.', 'Before next deploy: pin digest in manifest, verify with cosign, promote same bytes.'),
    'approval-gates': ('A typo shipped to prod at midnight because no gate held it. Policy gates would have parked it till morning.', 'Map every prod deploy to a gate: who, what signal, what kill switch.'),
    'rollback-recovery': ('MTTR was 45 min until they drilled game days. Now it is 4. Rehearsa makes recovery muscle memory.', 'Schedule a game day: break staging, time recovery, write the postmortem fix.'),
    'trunk-discipline': ('A month-old branch took a week to merge. Daily trunk merges would have cost minutes.', 'Merge to main daily, keep it green, fix red before anything else.'),
    'hermetic-builds': ('"Works on my machine" cost a release. Pinned lockfiles and clean containers ended it.', 'Lock every input, build in a clean container, key cache on lockfile.'),
    'supply-chain': ('A compromised Action exfiltrated secrets via transitive deps. SHA+hash locking would have blocked it.', 'Pin direct and transitive Actions to SHA + hash, sign artifacts.'),
    'signals-slos': ('Alerts fired on every blip — then real pages were ignored. Burn-rate alerts fixed the noise.', 'Define 3 SLOs, alert on budget burn, link every alert to its runbook.'),
    'gitops-pull': ('A leaked kubeconfig gave write to prod. Pull-model agents would have kept creds inside.', 'Move prod sync to pull, gate with manual sync, revert via git.'),
    'controller-agent': ('Jobs queued forever on wrong labels. Label-aware scheduling fixed queue time.', 'Label runners, set concurrency, scale ephemeral pods.'),
}
THREAD_TOOLS = {
    'artifact-digest': ['GHCR / Registries','Docker','Kubernetes'],
    'approval-gates': ['GitHub Actions','GitLab CI','Jenkins'],
    'rollback-recovery': ['ArgoCD','Kubernetes','Prometheus'],
    'trunk-discipline': ['GitHub Actions','GitLab CI','Jenkins'],
    'hermetic-builds': ['Docker','Kubernetes','Terraform'],
    'supply-chain': ['GHCR / Registries','Docker','Jenkins'],
    'signals-slos': ['Prometheus','Grafana','Loki'],
    'gitops-pull': ['ArgoCD','Kubernetes','Helm'],
    'controller-agent': ['Jenkins','GitHub Actions','Kubernetes'],
}
THREAD_ICON = {
    'artifact-digest': '📦','approval-gates': '✅','rollback-recovery': '↩️','trunk-discipline': '🌿',
    'hermetic-builds': '🔒','supply-chain': '🛡️','signals-slos': '📈','gitops-pull': '🔄','controller-agent': '⚙️',
}
THREAD_CHECK = {
    'artifact-digest': ['Pin digest by SHA in manifests','Sign and verify with Cosign','Promote same bytes staging → prod'],
    'approval-gates': ['List prod gates and approvers','Require green checks + policy gate','Test kill switch before you need it'],
    'rollback-recovery': ['Document rollback per strategy','Run a game day this month','Turn postmortem into a pipeline test'],
    'trunk-discipline': ['Enforce PR gates + merge queue','Merge daily, flag long branches','Fix red main first'],
    'hermetic-builds': ['Commit lockfiles','Build in clean container','Cache keyed on inputs only'],
    'supply-chain': ['Pin all Actions to SHA+hash','Sign, attest, scan every artifact','Rotate secrets, use OIDC'],
    'signals-slos': ['Define 3 SLOs with owners','Alert on burn rate, not errors','Link alerts to runbooks'],
    'gitops-pull': ['Commit image SHA to ops repo','Use sync waves + manual prod sync','Revert via git, not kubectl'],
    'controller-agent': ['Label runners and agents','Cap executors, autoscale pods','Keep pipeline as code in repo'],
}


def build_threads_page(books, output_dir, env, threads, tindex):
    CAT_HEX = env['CAT_HEX']
    W = 1040
    RH = 84
    H = max(len(books), len(threads)) * RH + 70
    NH = 52
    parts = []
    tids = [x['id'] for x in threads]
    maxn = max(1, max(len(tindex[th['id']]) for th in threads))
    bthreads = {}
    for bi, b in enumerate(books):
        y = 36 + bi * RH
        for th in threads:
            n = sum(1 for e in tindex[th['id']] if e['book'] == b['id'])
            if n:
                bthreads.setdefault(b['id'], []).append((th['id'], n))
                ti = tids.index(th['id'])
                w = 1.5 + round(3 * n / maxn, 1)
                parts.append('<line class="edge" data-book="' + b['id'] + '" data-thread="' + th['id'] + '" data-n="' + str(n) + '" x1="280" y1="' + str(y + NH // 2) + '" x2="760" y2="' + str(36 + ti * RH + NH // 2) + '" stroke="var(--brand)" stroke-width="' + str(w) + '" opacity=".5"><title>' + htmllib.escape(b['title']) + ' × ' + htmllib.escape(th['label']) + ': ' + str(n) + ' sheets</title></line>')
    for bi, b in enumerate(books):
        y = 36 + bi * RH
        col = CAT_HEX.get(b['category'], '#18E299')
        label = htmllib.escape(b['title'][:24])
        nt = len(bthreads.get(b['id'], []))
        parts.append('<g class="bnode" data-book="' + b['id'] + '" tabindex="0" role="button" aria-label="' + htmllib.escape(b['title']) + ', ' + str(nt) + ' threads"><rect x="20" y="' + str(y) + '" width="260" height="' + str(NH) + '" rx="12" fill="var(--card)" stroke="' + col + '" stroke-width="2"/><text x="34" y="' + str(y + 22) + '" font-size="14" font-weight="700" fill="var(--ink)">' + label + '</text><text x="34" y="' + str(y + 39) + '" font-size="11" fill="var(--mut)">' + str(nt) + ' threads · <tspan class="gpct" data-gprog-b="' + b['id'] + '"></tspan></text></g>')
    for ti, th in enumerate(threads):
        y = 36 + ti * RH
        n = len(tindex[th['id']])
        nb = len({e['book'] for e in tindex[th['id']]})
        parts.append('<g class="tnode" data-thread="' + th['id'] + '" tabindex="0" role="button" aria-label="' + htmllib.escape(th['label']) + ', ' + str(n) + ' sheets"><rect x="760" y="' + str(y) + '" width="260" height="' + str(NH) + '" rx="12" fill="var(--card)" stroke="#0e7490" stroke-width="2"/><text x="774" y="' + str(y + 22) + '" font-size="14" font-weight="700" fill="var(--ink)">' + htmllib.escape(th['label']) + '</text><text x="774" y="' + str(y + 39) + '" font-size="11" fill="var(--mut)">' + str(n) + ' sheets · ' + str(nb) + ' books</text></g>')
    svg = '<svg id="graph" width="100%" viewBox="0 0 ' + str(W) + ' ' + str(H) + '" style="max-height:72vh;min-height:420px;border:1px solid var(--line);border-radius:14px;background:var(--card)" role="img" aria-label="Book to thread coverage graph">' + ''.join(parts) + '</svg>'
    ginfo = '<div id="graphinfo" class="ginfo" aria-live="polite"><span>Hover a node to preview · click to isolate · click again to reset.</span></div>'
    glegend = '<div class="glegend"><span><i class="ln thin"></i>few sheets</span><span><i class="ln thick"></i>many sheets</span><span><i class="swatch"></i>left: books · right: threads</span></div>'
    gzoom = '<div class="gzoom" role="group" aria-label="Graph zoom"><button class="btn" id="gzin" aria-label="Zoom in">+</button><button class="btn" id="gzout" aria-label="Zoom out">−</button><button class="btn" id="greset2">Reset view</button></div>'
    def _short(s, n=30):
        s = s.strip()
        if len(s) <= n:
            return s
        cut = s[:n].rsplit(' ', 1)
        return cut[0] if len(cut) > 1 else s[:n]
    cards = []
    maxn = max(1, max(len(tindex[th['id']]) for th in threads))
    for thi, th in enumerate(threads):
        n = len(tindex[th['id']])
        bset = {e['book'] for e in tindex[th['id']]}
        nb = len(bset)
        t_ms = sum(next((b.get('time_minutes',30) for b in books if b['id']==bid),30) for bid in bset)
        tools = THREAD_TOOLS.get(th['id'], [])[:3]
        ticons = ''.join('<span class="toolpill">' + htmllib.escape(t) + '</span>' for t in tools)
        cards.append('<a class="thread-card" href="#' + th['id'] + '" style="--cat:#0e7490" data-thread="' + th['id'] + '"><span class="thread-ico" aria-hidden="true">' + str(thi + 1).zfill(2) + '</span><span class="thread-num">' + str(n) + ' sheets · ' + str(nb) + ' books · ~' + str(t_ms) + ' min</span><b>' + htmllib.escape(th['label']) + '</b><span>' + htmllib.escape(th['desc']) + '</span><span class="tbar" aria-hidden="true"><b style="width:' + str(round(100 * n / maxn)) + '%"></b></span><div class="thread-tools">' + ticons + '<span class="thread-meta"><span class="tprog" data-tprog="' + th['id'] + '"></span>open ↓</span></div></a>')
    PATH_RANK = {'start-here': 0, 'build': 1, 'deliver': 2, 'observability': 3, 'jenkins': 4, 'platforms': 5, 'labs': 6, 'reference': 7}
    bord = sorted(books, key=lambda b: (PATH_RANK.get(b.get('path', ''), 9), b['id']))
    secs = []
    for thi, th in enumerate(threads):
        groups = {}
        for e in tindex[th['id']]:
            groups.setdefault(e['book'], []).append(e)
        glist = []
        step = 0
        for b in bord:
            if b['id'] not in groups:
                continue
            step += 1
            es = groups[b['id']]
            vis = es[:4]
            hid = es[4:]
            chips = ''.join('<a class="chip" href="../read/' + e['book'] + '.html#' + e['sid'] + '" title="' + htmllib.escape(e['sheet']) + '">' + htmllib.escape(_short(e['sheet'])) + '</a>' for e in vis)
            if hid:
                chips += '<span class="morechips" hidden>' + ''.join('<a class="chip" href="../read/' + e['book'] + '.html#' + e['sid'] + '" title="' + htmllib.escape(e['sheet']) + '">' + htmllib.escape(_short(e['sheet'])) + '</a>' for e in hid) + '</span>'
                chips += ' <button class="btn morebtn" aria-expanded="false">+' + str(len(hid)) + ' more</button>'
            bmin = b.get('time_minutes', 30)
            glist.append('<div class="tstop" data-n="' + str(step).zfill(2) + '"><b>' + htmllib.escape(b['title']) + ' <span class="stopmeta">~' + str(bmin) + ' min · <span class="stopprog" data-sp="' + b['id'] + '"></span></span></b><div class="tbar slim" aria-hidden="true"><b data-sbar="' + b['id'] + '" style="width:0%"></b></div><div class="chiprow">' + chips + '</div></div>')
        why, exam = THREAD_WHY.get(th['id'], ('', ''))
        story, check = THREAD_STORY.get(th['id'], ('',''))
        tools = THREAD_TOOLS.get(th['id'], [])
        checks = THREAD_CHECK.get(th['id'], [])
        bset2 = {e['book'] for e in tindex[th['id']]}
        t_ms = sum(next((b.get('time_minutes',30) for b in books if b['id']==bid),30) for bid in bset2)
        xlinks = '<p class="sub">Field links: <a href="../read/platforms-roadmaps.html#s29n">Tool vs Tool matrix</a> · <a href="../tools/">5-question picker</a></p>'
        ticons = ''.join('<span class="stack-icon sm" title="' + htmllib.escape(t) + '" style="--cat:#0e7490"><span>' + htmllib.escape(t[:1]) + '</span></span>' for t in tools)
        cks = ''.join('<li>' + htmllib.escape(c) + '</li>' for c in checks)
        first = (thi == 0)
        ticons2 = ''.join('<span class="toolpill">' + htmllib.escape(t) + '</span>' for t in tools)
        aids = ''
        if exam or story or cks:
            aids += '<details class="aids"><summary>Study aids — exam, story, checklist, quiz</summary>'
            if exam:
                aids += '<div class="m-exam"><span class="tag">🎓 EXAM</span>' + htmllib.escape(exam) + '</div>'
            if story:
                aids += '<div class="mark m-tip"><span class="tag">REAL STORY</span>' + htmllib.escape(story) + '</div>'
            if cks:
                aids += '<ul class="checklist">' + cks + '</ul>'
            aids += '<p><button class="btn tquiz" data-tquiz="' + th['id'] + '">Quiz this thread (5)</button></p><div class="tquizbox" id="tquiz-' + th['id'] + '" hidden></div></details>'
        prev_id = threads[thi - 1]['id'] if thi > 0 else ''
        next_id = threads[thi + 1]['id'] if thi + 1 < len(threads) else ''
        nav = '<nav class="tnav">' + ('<a href="#' + prev_id + '">← prev thread</a>' if prev_id else '<span></span>') + '<a href="#thread-filter">↑ all threads</a>' + ('<a href="#' + next_id + '">next thread →</a>' if next_id else '<span></span>') + '</nav>'
        secs.append('<section class="tsec" id="' + th['id'] + '"><div class="tsechead"><span class="tnum" aria-hidden="true">' + str(thi + 1).zfill(2) + '</span><div class="tsemeta"><h2>' + htmllib.escape(th['label']) + '</h2><p class="tsub">' + htmllib.escape(why if why else th['desc']) + '</p></div><div class="tpills"><span class="map-pill"><b>' + str(len(tindex[th['id']])) + '</b> sheets</span><span class="map-pill">~' + str(t_ms) + ' min</span><span class="map-pill tprog" data-tprog="' + th['id'] + '"></span><button class="sechead" aria-expanded="' + ('true' if first else 'false') + '" aria-label="Collapse section"><span class="chev">▾</span></button></div></div><div class="tbar big" aria-hidden="true"><b data-tbar="' + th['id'] + '" style="width:0%"></b></div><div class="secbody"' + ('' if first else ' hidden') + '><div class="tpath">' + ''.join(glist) + '</div>' + aids + '<p class="ttools">' + ticons2 + ' <a href="../read/platforms-roadmaps.html#s29n">matrix</a> · <a href="../tools/">picker</a></p>' + nav + '</div></section>')
    page = ('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
            '<link rel="icon" type="image/svg+xml" href="../favicon.svg">'
            '<title>Concept threads - CICD BY Nabawy</title>'
            '<style>' + env['BASE_CSS'] + '.chiprow{margin:6px 0}.thread-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin:16px 0 8px}.thread-card{display:flex;flex-direction:column;gap:8px;padding:16px;border:1px solid var(--line-soft);border-radius:16px;background:var(--card);text-decoration:none;color:var(--ink);position:relative;overflow:hidden;transition:border-color .15s,transform .15s,box-shadow .15s;box-shadow:var(--shadow-btn)}.thread-card::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:var(--cat)}.thread-card:hover{border-color:var(--cat);transform:translateY(-3px);box-shadow:var(--shadow-lift)}.thread-ico{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--cat) 12%,var(--bg2));border:1px solid color-mix(in srgb,var(--cat) 18%,var(--line));font-size:20px;flex:none}.thread-card b{font-size:16px;letter-spacing:-.2px}.thread-card span{font-size:12px;color:var(--mut);line-height:1.4}.thread-card .story{font-size:11px;color:var(--mut);font-style:italic;display:none}.thread-num{font-family:var(--mono);font-size:10px;font-weight:800;letter-spacing:.12em;color:var(--cat)}.thread-tools{display:flex;align-items:center;gap:6px;margin-top:4px}.toolpill{font-family:var(--mono);font-size:10px;font-weight:700;padding:3px 10px;border-radius:9999px;background:var(--bg2);border:1px solid var(--line-soft);color:var(--mut);white-space:nowrap}.thread-meta{font-family:var(--mono);font-size:11px;margin-left:auto}.tfilter{position:sticky;top:57px;z-index:15;background:var(--bg);padding:10px 0 6px}.tfilter input{width:100%;background:var(--card);border:1px solid var(--line);color:var(--ink);border-radius:9999px;padding:9px 14px;font-size:14px}.tsec{background:var(--card);border:1px solid var(--line-soft);border-radius:16px;margin:18px 0;scroll-margin-top:70px;overflow:hidden} .tsechead{display:flex;gap:12px;align-items:flex-start;padding:16px 18px} .tsechead .tnum{font-family:var(--mono);font-size:12px;font-weight:800;color:#0e7490;flex:none;padding-top:3px} .tsemeta{flex:1;min-width:0} .tsemeta h2{font-size:17px;margin:0;letter-spacing:-.2px} .tsub{font-size:13px;color:var(--mut);margin:4px 0 0} .tpills{display:flex;gap:6px;align-items:center;flex:none;flex-wrap:wrap} .tpath{padding:4px 18px 0} .tstop{display:flex;gap:12px;position:relative;padding:10px 0 10px 34px} .tstop::before{content:attr(data-n);position:absolute;left:0;top:10px;width:24px;height:24px;border-radius:50%;background:var(--card);border:1.5px solid var(--brand);color:var(--ink);font-family:var(--mono);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;z-index:1} .tstop::after{content:"";position:absolute;left:11px;top:36px;bottom:-4px;width:2px;background:color-mix(in srgb,var(--brand) 30%,var(--line-soft))} .tstop:last-child::after{display:none} .tstop b{display:block;font-size:14px;margin-bottom:4px} .aids{margin:10px 18px 0;border:1px dashed var(--line);border-radius:10px;padding:10px 14px} .aids summary{cursor:pointer;font-weight:700;font-size:14px;list-style:none;display:flex;align-items:center;gap:10px;padding:12px 14px;margin:-10px -14px;border-radius:10px}.aids summary::-webkit-details-marker{display:none}.aids summary::before{content:"+";display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--bg2);border:1px solid var(--line);color:var(--brand);font-size:18px;font-weight:800;flex:none}.aids[open] summary::before{content:"\2212"}.aids summary:hover::before{border-color:var(--brand)} .ttools{padding:0 18px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--mut)}.tnav{display:flex;justify-content:space-between;gap:8px;padding:12px 18px 16px;font-size:13px}.tnav a{color:var(--brand);font-weight:700;text-decoration:none}.tbar.big{height:8px;margin:0 18px}.tbar.slim{height:4px;margin:2px 0 6px}.stopmeta{font-family:var(--mono);font-size:11px;color:var(--mut);font-weight:400}.tempty{margin:8px 0;font-size:13px;color:var(--mut)}.hm-hero .hm-vols{margin-top:18px}.tbar{height:6px;border-radius:99px;background:var(--bg2);margin:6px 0;overflow:hidden}.tbar b{display:block;height:100%;border-radius:99px;background:var(--cat)}.sechead{background:var(--bg2);border:1px solid var(--line-soft);color:inherit;font:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;width:38px;height:38px;border-radius:50%;flex:none;transition:border-color .15s,transform .15s}.sechead:hover{border-color:var(--brand);transform:scale(1.06)}.sechead .chev{transition:transform .2s;color:var(--brand);font-size:16px;line-height:1}.sechead[aria-expanded="false"] .chev{transform:rotate(-90deg)}.checklist{margin:8px 0 8px 18px;font-size:13px;color:var(--mut)}.checklist li{margin:4px 0}.morebtn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:8px;padding:10px 14px;border:1px dashed var(--line);border-radius:10px;background:transparent;color:var(--brand);font-weight:700;font-size:13px;cursor:pointer;transition:border-color .15s,background .15s}.morebtn:hover{border-color:var(--brand);background:color-mix(in srgb,var(--brand) 7%,transparent)}.morebtn[aria-expanded="true"]{border-style:solid}.tquizbox{margin:10px 0;border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--card)}.ginfo{margin:8px 0;padding:10px 14px;border:1px solid var(--line-soft);border-radius:10px;background:var(--card);font-size:13px;color:var(--mut)}.ginfo b{color:var(--ink)}.edge{transition:opacity .15s}.edge.dim{opacity:.06}.bnode.dim,.tnode.dim{opacity:.3}.bnode.hot rect,.tnode.hot rect{stroke:var(--brand);stroke-width:3}.bnode,.tnode{cursor:pointer}.bnode:focus rect,.tnode:focus rect{stroke:var(--brand);stroke-width:3}.bnode:focus,.tnode:focus{outline:none}.glegend{display:flex;gap:14px;flex-wrap:wrap;margin:8px 0 0;font-size:12px;color:var(--mut)}.glegend .ln{display:inline-block;width:26px;height:0;border-top:2px solid var(--brand);vertical-align:middle;margin-right:5px}.glegend .ln.thick{border-top-width:4px}.glegend .swatch{display:inline-block;width:10px;height:10px;border-radius:3px;background:#0e7490;margin-right:5px}.gzoom{display:flex;gap:8px;margin:8px 0 0}.gzoom .btn{min-height:40px;min-width:44px}@media(max-width:700px){#graphwrap{display:none}#graphwrap.open{display:block}.tfilter input{min-height:44px;font-size:16px}.thread-grid{grid-template-columns:1fr}}</style>'
            + HEAD_THEME +
            '</head><body><header class="top"><div class="wrap">'
            '<a class="logo" href="../index.html" style="color:inherit">CICD<span> BY Nabawy</span></a>'
            '<nav class="crumbs"><span class="sep">/</span><span class="here">Threads</span></nav>'
            '<a class="btn" href="../index.html" style="text-decoration:none">Home</a>'
            '<a class="btn" href="../glossary.html" style="text-decoration:none">Study Deck</a>'
            '<a class="btn" href="../tools/" style="text-decoration:none">Tools</a>'
            '<button class="btn" id="themebtn" aria-label="Toggle theme">X</button>'
            '</div></header><div class="wrap">'
            '<div class="hm-hero"><div class="hm-band" aria-hidden="true"><i style="height:14px"></i><i style="height:30px"></i><i style="height:52px"></i><i style="height:38px"></i><i style="height:64px"></i><i style="height:46px"></i><i style="height:70px"></i><i style="height:28px"></i><i style="height:56px"></i><i style="height:18px"></i></div><div class="hm-kick">THREADS · ' + str(len(threads)) + ' IDEAS</div>'
            '<h1>Follow an idea across books.</h1>'
            '<p class="hm-sub">Nine concept threads stitched from every sheet. Pick a card, walk the path, quiz yourself.</p>'
            '<div class="hm-vols">' + ''.join('<a class="hm-vol" style="--cat:#0e7490" href="#' + th['id'] + '"><i aria-hidden="true"></i>' + htmllib.escape(th['label']) + '</a>' for th in threads) + '</div></div>'
            '<div class="tfilter" id="thread-filter"><input id="tq" type="search" placeholder="Filter threads and sheets…" aria-label="Filter threads and sheets"><p class="tempty" id="tempty" hidden>No threads match — <button class="btn" id="tclear">clear filter</button></p></div>'
            '<div class="thread-grid">' + ''.join(cards) + '</div>'
            '<button class="btn" id="graphtoggle" aria-expanded="true" style="min-height:44px;padding:10px 18px;font-weight:700">Graph: shown — tap to hide</button>'
            '<div id="graphwrap">' + svg + glegend + gzoom + ginfo +
            '<p class="sub">Hover highlights · click isolates · scroll zooms · drag pans · double-click resets.</p></div>'
            + ''.join(secs) +
            '</div><footer><div class="wrap"><span>CICD BY Nabawy</span><span><a href="../index.html">Home</a> · <a href="../glossary.html">Study Deck</a> · <a href="../tools/">Tools</a></span></div></footer>'
            '<script>'
            + THEME_JS +
            "const _tq=document.querySelector('#tq');if(_tq)_tq.addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('.thread-grid .thread-card').forEach(c=>{c.style.display=c.textContent.toLowerCase().includes(q)?'':'none';});document.querySelectorAll('section[id]').forEach(s=>{const t=s.textContent.toLowerCase().includes(q);s.style.display=t?'':'none';});});" +
            "document.querySelectorAll('.sechead').forEach(b=>b.onclick=()=>{const sec=b.closest('section');const body=sec.querySelector('.secbody');const open=b.getAttribute('aria-expanded')==='true';b.setAttribute('aria-expanded',!open);body.hidden=open;});" +
            "try{const _prog=id=>{try{const v=JSON.parse(localStorage.getItem('cicdlib:prog:'+id));return(v&&v.pct)||0}catch(e){return 0}};document.querySelectorAll('.stopprog').forEach(el=>{const p=_prog(el.dataset.sp);el.textContent=p+'%';});document.querySelectorAll('[data-sbar]').forEach(el=>{el.style.width=_prog(el.dataset.sbar)+'%';});document.querySelectorAll('section[id]').forEach(sec=>{const books=[...new Set([...sec.querySelectorAll('.chip')].map(a=>(a.getAttribute('href')||'').split('/').pop().split('.')[0]))].filter(Boolean);if(!books.length)return;const avg=Math.round(books.reduce((s,b)=>s+_prog(b),0)/books.length);document.querySelectorAll('[data-tprog=\"'+sec.id+'\"]').forEach(el=>{el.textContent=avg+'% read · ';});document.querySelectorAll('[data-tbar=\"'+sec.id+'\"]').forEach(el=>{el.style.width=avg+'%';});});}catch(e){};" +
            "const _tq3=document.querySelector('#tq');if(_tq3)_tq3.addEventListener('input',e=>{const any=[...document.querySelectorAll('.thread-grid .thread-card,section.tsec')].some(el=>el.style.display!=='none');const em=document.querySelector('#tempty');if(em)em.hidden=any;});" +
            "const _tc=document.querySelector('#tclear');if(_tc)_tc.onclick=()=>{const q=document.querySelector('#tq');if(q){q.value='';q.dispatchEvent(new Event('input'));}};" +
            "const _gt=document.querySelector('#graphtoggle'),_gw=document.querySelector('#graphwrap');if(_gt&&_gw){if(matchMedia('(max-width:700px)').matches){_gw.classList.remove('open');_gw.style.display='none';_gt.setAttribute('aria-expanded','false');_gt.textContent='Graph: hidden \u2014 tap to show';}_gt.onclick=()=>{const open=_gw.style.display!=='none';_gw.style.display=open?'none':'';_gw.classList.toggle('open',!open);_gt.setAttribute('aria-expanded',!open);_gt.textContent=open?'Graph: hidden — tap to show':'Graph: shown — tap to hide';};}" +
            "document.querySelectorAll('.morebtn').forEach(b=>b.onclick=()=>{const m=b.parentElement.querySelector('.morechips');const open=m.hidden;m.hidden=!open;b.setAttribute('aria-expanded',open);b.textContent=open?'show less':'+'+m.querySelectorAll('a').length+' more';});" +
            "document.querySelectorAll('.tquiz').forEach(b=>b.onclick=()=>{const id=b.dataset.tquiz;const box=document.querySelector('#tquiz-'+id);box.hidden=!box.hidden;if(box.hidden)return;const chips=[...document.querySelectorAll('#'+id+' .chip')].map(a=>a.textContent.trim()).filter(Boolean);let qs=[...new Set(chips)].sort(()=>Math.random()-.5).slice(0,5);if(qs.length<3)qs=chips.slice(0,5);let qi=0,sc=0;function show(){if(qi>=qs.length){box.innerHTML='<p><b>Done — '+sc+'/'+qs.length+'</b> <button class=\"btn\" onclick=\"this.closest(\\'.tquizbox\\').hidden=true\">Close</button></p>';if(sc===qs.length)try{localStorage.setItem('cicdlib:threadbadge:'+id,'1')}catch(e){};return;}const cur=qs[qi];const opts=[cur];while(opts.length<4){const r=chips[Math.floor(Math.random()*chips.length)];if(!opts.includes(r))opts.push(r);}opts.sort(()=>Math.random()-.5);box.innerHTML='<p><b>Q'+(qi+1)+'/'+qs.length+' — '+cur+'</b></p><div style=\"display:grid;gap:6px\">'+opts.map(o=>'<button class=\"btn qo\">'+o+'</button>').join('')+'</div>';box.querySelectorAll('.qo').forEach(btn=>btn.onclick=()=>{const ok=btn.textContent===cur;if(ok)sc++;btn.style.borderColor=ok?'var(--brand)':'var(--red)';setTimeout(()=>{qi++;show();},600);});}show();});" +
            "document.querySelectorAll('.thread-card').forEach(c=>c.addEventListener('click',e=>{const id=c.dataset.thread;const sec=document.getElementById(id);if(!sec)return;e.preventDefault();isolateThread(id);sec.scrollIntoView({behavior:'smooth'});sec.querySelector('.sechead').setAttribute('aria-expanded','true');sec.querySelector('.secbody').hidden=false;}));" +
            "const _edges=[...document.querySelectorAll('.edge')],_bn=[...document.querySelectorAll('.bnode')],_tn=[...document.querySelectorAll('.tnode')],_gi=document.querySelector('#graphinfo');let _sel=null;" +
            "function paint(book,thread){_edges.forEach(l=>{const ok=(!book||l.dataset.book===book)&&(!thread||l.dataset.thread===thread);l.classList.toggle('dim',!ok);});_bn.forEach(g=>{const hits=_edges.some(l=>l.dataset.book===g.dataset.book&&(!thread||l.dataset.thread===thread));g.classList.toggle('dim',!hits);g.classList.toggle('hot',!!book&&g.dataset.book===book);});_tn.forEach(g=>{const hits=_edges.some(l=>l.dataset.thread===g.dataset.thread&&(!book||l.dataset.book===book));g.classList.toggle('dim',!hits);g.classList.toggle('hot',!!thread&&g.dataset.thread===thread);});}" +
            "function info(html){if(_gi)_gi.innerHTML=html;}" +
            "function isolateThread(id){_sel=id;paint(null,id);const card=document.querySelector('.thread-card[data-thread=\"'+id+'\"]');const nm=card?card.querySelector('b').textContent:id;info('<b>'+nm+'</b> isolated — <a href=\"#'+id+'\">jump to section</a> · <a href=\"#\" id=\"greset\">reset</a>');const r=document.querySelector('#greset');if(r)r.onclick=e=>{e.preventDefault();resetGraph();};}" +
            "function isolateBook(id){_sel='b:'+id;paint(id,null);info('<b>'+id+'</b> isolated — <a href=\"../read/'+id+'.html\">open book</a> · <a href=\"#\" id=\"greset\">reset</a>');const r=document.querySelector('#greset');if(r)r.onclick=e=>{e.preventDefault();resetGraph();};}" +
            "function resetGraph(){_sel=null;paint(null,null);info('Hover a node to preview · click to isolate · click again to reset.');}" +
            "_bn.forEach(g=>{g.addEventListener('mouseenter',()=>{if(!_sel)paint(g.dataset.book,null);});g.addEventListener('mouseleave',()=>{if(!_sel)paint(null,null);});g.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();(_sel==='b:'+g.dataset.book)?resetGraph():isolateBook(g.dataset.book);});g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();(_sel==='b:'+g.dataset.book)?resetGraph():isolateBook(g.dataset.book);}});});" +
            "_tn.forEach(g=>{g.addEventListener('mouseenter',()=>{if(!_sel)paint(null,g.dataset.thread);});g.addEventListener('mouseleave',()=>{if(!_sel)paint(null,null);});g.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();(_sel===g.dataset.thread)?resetGraph():isolateThread(g.dataset.thread);});g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();(_sel===g.dataset.thread)?resetGraph():isolateThread(g.dataset.thread);}});});" +
            "const _tq2=document.querySelector('#tq');if(_tq2)_tq2.addEventListener('input',e=>{const q=e.target.value.toLowerCase();resetGraph();_bn.forEach(g=>{g.style.display=g.textContent.toLowerCase().includes(q)?'':'none';});_tn.forEach(g=>{g.style.display=g.textContent.toLowerCase().includes(q)?'':'none';});});" +
            "try{const _gp=id=>{try{const v=JSON.parse(localStorage.getItem('cicdlib:prog:'+id));return(v&&v.pct)||0}catch(e){return 0}};document.querySelectorAll('.gpct').forEach(el=>{const p=_gp(el.dataset.gprogB);if(p)el.textContent=p+'%';});}catch(e){};" +
            "const svg=document.querySelector('#graph');let vb=[0,0,1040," + str(H) + '];'
            "const apply=()=>svg.setAttribute('viewBox',vb.join(' '));"
            "svg.addEventListener('wheel',e=>{e.preventDefault();const f=e.deltaY>0?1.12:0.9;const r=svg.getBoundingClientRect();const mx=(e.clientX-r.left)/r.width*vb[2]+vb[0],my=(e.clientY-r.top)/r.height*vb[3]+vb[1];vb=[mx-(mx-vb[0])*f,my-(my-vb[1])*f,vb[2]*f,vb[3]*f];apply();},{passive:false});"
            "let drag=null;svg.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY,vb[0],vb[1]];svg.setPointerCapture(e.pointerId);});"
            "svg.addEventListener('pointermove',e=>{if(!drag)return;const r=svg.getBoundingClientRect();vb[0]=drag[2]-(e.clientX-drag[0])/r.width*vb[2];vb[1]=drag[3]-(e.clientY-drag[1])/r.height*vb[3];apply();});"
            "svg.addEventListener('pointerup',()=>drag=null);"
            "svg.addEventListener('dblclick',()=>{vb=[0,0,1040," + str(H) + "];apply();});"
            '</script></body></html>')
    out = os.path.join(output_dir, 'threads')
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(page)
    print('BUILT threads: ' + str(len(threads)) + ' threads -> ' + out)


def resolve_sheet(books, env, bid, needles):
    parse_book = env['parse_book']
    PDF = env['PDF']
    for b in books:
        if b['id'] != bid:
            continue
        _css, pages = parse_book(os.path.join(PDF, b['file']))
        for pg in pages:
            m = re.search(r'id="([^"]+)"', pg[:200])
            h1 = re.search(r'<h1 class="t">(.*?)</h1>', pg, re.S)
            title = re.sub(r'<[^>]+>', '', h1.group(1)).strip() if h1 else ''
            for nd in needles:
                if nd.lower() in title.lower():
                    return '../read/' + bid + '.html#' + (m.group(1) if m else '')
    return '../read/' + bid + '.html'


TOOLS_META = {
    'jenkins': ('Jenkins', 'Self-hosted control, deepest plugin ecosystem, proven at enterprise scale.'),
    'actions': ('GitHub Actions', 'Zero infrastructure if you live on GitHub - fastest path from push to green.'),
    'gitlab': ('GitLab CI', 'Repo, pipeline and registry in one product, with review apps built in.'),
    'argocd': ('ArgoCD', 'Pull-model GitOps for Kubernetes fleets - git as the audit trail.'),
}

QUESTIONS = [
    ('Where does your code live?', 'Source hosting decides half the answer — co-located CI wins on integration.', [('GitHub', {'actions': 2, 'jenkins': 1}, 'PR checks and runners built in'), ('GitLab', {'gitlab': 3, 'jenkins': 1}, 'Repo, pipeline and envs in one product'), ('Self-hosted git', {'jenkins': 2, 'argocd': 1}, 'No SaaS coupling — own the runners')]),
    ('Who runs infrastructure?', 'No ops team means SaaS; a platform team unlocks self-hosted power.', [('No ops team', {'actions': 2, 'gitlab': 1}, 'Zero maintenance beats control'), ('Small ops team', {'jenkins': 1, 'actions': 1, 'gitlab': 1}, 'Either road stays open'), ('Platform team', {'jenkins': 2, 'argocd': 2, 'gitlab': 1}, 'Run fleets, clusters, pull delivery')]),
    ('How much Kubernetes?', 'K8s estates pull toward GitOps; the rest stays push.', [('All in', {'argocd': 3, 'gitlab': 1}, 'Clusters want pull-model delivery'), ('Some', {'argocd': 1, 'actions': 1, 'jenkins': 1}, 'Mixed estate, mixed answer'), ('None', {'jenkins': 2, 'actions': 2, 'gitlab': 1}, 'Push pipelines cover it')]),
    ('Audit and compliance pressure?', 'Strict audit loves self-hosted evidence trails.', [('Strict', {'jenkins': 2, 'gitlab': 2, 'argocd': 1}, 'Own hardware, own audit trail'), ('Standard', {'actions': 1, 'gitlab': 1, 'jenkins': 1}, 'SaaS gates plus approvals suffice'), ('None', {'actions': 2}, 'Speed first, ceremony later')]),
    ('Team size?', 'Solo ships fastest on SaaS; fleets need control.', [('Solo', {'actions': 2}, 'Minutes to first green build'), ('2 to 20', {'actions': 1, 'gitlab': 2}, 'Review apps and trains help'), ('20 plus', {'jenkins': 2, 'gitlab': 1, 'argocd': 1}, 'Control and cost shape matter')]),
    ('Where do releases land?', 'The runtime picks the delivery model — K8s means pull.', [('VMs or bare metal', {'jenkins': 2}, 'Agents reach anywhere SSH does'), ('Cloud PaaS', {'actions': 2, 'gitlab': 1}, 'Push-to-deploy fits stateless apps'), ('Kubernetes clusters', {'argocd': 3, 'gitlab': 1}, 'Agents converge desired state'), ('Mixed', {'jenkins': 1, 'actions': 1, 'argocd': 1}, 'Gate in one place, execute anywhere')]),
]

STUDY_THREAD = {'jenkins': 'controller-agent', 'actions': 'trunk-discipline', 'gitlab': 'approval-gates', 'argocd': 'gitops-pull'}
STUDY_LABEL = {'jenkins': 'Controllers & Agents', 'actions': 'Trunk Discipline', 'gitlab': 'Approval Gates', 'argocd': 'GitOps Pull Model'}

CATALOG = [
    ('Jenkins', 'Jenkins', 'Self-hosted automation server: controllers schedule, agents execute pipelines as code.', 'Regulated or air-gapped estates, complex heterogeneous builds, zero per-minute cost.', 'Total control over execution, deepest plugin ecosystem, proven at scale.', 'Jenkinsfile on controller, stages on labeled agents, credentials via bindings.', 4, 'jenkins-complete'),
    ('GitHub Actions', 'GitHub', 'CI/CD built into GitHub: workflows of jobs and steps on hosted or self-hosted runners.', 'Source already on GitHub, small teams wanting zero-infra CI.', 'Fastest path from push to green; PR checks and Marketplace built in.', 'YAML in .github/workflows, jobs with needs DAG, environments as gates.', 5, 'platforms-roadmaps'),
    ('GitLab CI', 'Platforms', 'Pipeline engine inside GitLab: single YAML driving stages, runners, review apps.', 'Single-platform shops wanting repo plus pipeline plus envs in one product.', 'Review apps per MR and merge trains come free with the platform.', '.gitlab-ci.yml stages with needs DAG, rules gating, runners by tags.', 3, 'platforms-roadmaps'),
    ('ArgoCD', 'Platforms', 'GitOps operator for Kubernetes: in-cluster agent pulls desired state from git.', 'Kubernetes fleets needing pull-model audit and env-per-branch scale.', 'Cluster creds never leave the cluster; git revert is the rollback.', 'Application manifests + sync waves; ApplicationSets fan out envs; manual sync gates prod.', 4, 'platforms-roadmaps'),
    ('Docker', 'Labs', 'Container runtime and image format: freeze the app plus its OS userland.', 'Every pipeline that must kill works-on-my-machine drift.', 'Identical bits from laptop to CI to prod; BuildKit caches keep it fast.', 'Multi-stage Dockerfiles, BuildKit secrets, push digests to a registry.', 5, 'labs-handbook'),
    ('Kubernetes', 'Platforms', 'Container orchestrator: desired-state scheduler for pods, services, jobs.', 'Fleets sharing clusters, elastic runners, pull delivery targets.', 'Bin-packing plus self-heal plus one API for runners and releases.', 'Manifests or Helm charts applied by hand, CI push, or ArgoCD pull.', 5, 'platforms-roadmaps'),
    ('Helm', 'Platforms', 'Package manager for Kubernetes: templated charts with per-env values.', 'K8s releases needing versioned, repeatable installs across envs.', 'One chart, many envs — diffs are value diffs, not manifest forks.', 'Chart plus values per env, helm upgrade with pinned image digests.', 4, 'platforms-roadmaps'),
    ('Terraform', 'Labs', 'Infrastructure as code: declare envs, plan the diff, apply gated.', 'Environments that must be reviewable, repeatable, and drift-checked.', 'Plan output is the review; state per env bounds the blast radius.', 'Modules pinned by version, remote state with locking, plan on PR.', 5, 'labs-handbook'),
    ('Prometheus', 'Observability', 'Metrics engine: scrapes numeric time series, alerts on burn rate.', 'Any service needing SLO alerts and capacity signals.', 'One query language over every target; alert on budgets, not blips.', 'Scrape targets, PromQL rules, Alertmanager with runbook links.', 4, 'observability'),
    ('Grafana', 'Observability', 'Unified dashboards over Loki, Prometheus, and traces.', 'Teams drowning in separate UIs for logs versus metrics.', 'One glass pane with version annotations on every deploy.', 'Data sources plus dashboards as code, alerts beside the graphs.', 5, 'observability'),
    ('Loki', 'Observability', 'Log aggregation indexed by labels, queried with LogQL.', 'Exact-error forensics without paying full-text index prices.', 'Labels keep it cheap; pairs with Prometheus metrics and Grafana.', 'Promtail DaemonSet ships lines, LogQL filters by labels and content.', 3, 'observability'),
    ('GHCR / Registries', 'Build', 'Artifact storage and distribution: images, SBOMs, attestations.', 'Every pipeline that promotes the same digest end to end.', 'Immutable digests make rollback a redeploy, not a rebuild.', 'Push by SHA tag, sign with Cosign, attest provenance, expire aggressively.', 3, 'build-artifacts'),
]


def build_tools_page(books, output_dir, env):
    CAT_HEX = env.get('CAT_HEX', {})
    ICON_FOR = {
        'Jenkins': '<img alt="" src="../assets/icons/jenkins/jenkins.svg" width="28" height="28">',
        'GitHub Actions': '<img alt="" src="../assets/icons/git/github.svg" width="28" height="28">',
        'GitLab CI': '<img alt="" src="../assets/icons/git/gitlab.svg" width="28" height="28">',
        'ArgoCD': '<img alt="" src="../assets/icons/deployment/argo.svg" width="28" height="28">',
        'Docker': '<img alt="" src="../assets/icons/docker/docker.svg" width="28" height="28">',
        'Kubernetes': '<img alt="" src="../assets/icons/deployment/argo.svg" width="28" height="28">',
        'Helm': '<img alt="" src="../assets/icons/general/puzzle.svg" width="28" height="28">',
        'Terraform': '<img alt="" src="../assets/icons/general/terraform.svg" width="28" height="28">',
        'Prometheus': '<img alt="" src="../assets/icons/monitoring/activity.svg" width="28" height="28">',
        'Grafana': '<img alt="" src="../assets/icons/monitoring/activity.svg" width="28" height="28">',
        'Loki': '<img alt="" src="../assets/icons/monitoring/activity.svg" width="28" height="28">',
        'GHCR / Registries': '<img alt="" src="../assets/icons/general/package.svg" width="28" height="28">',
    }
    cath = []
    for _t in CATALOG:
        _name, _cat, _what, _when, _why, _how, _pop, _bid = _t
        _col = CAT_HEX.get(_cat, '#18E299')
        _stars = '★' * _pop + '☆' * (5 - _pop)
        _icon = ICON_FOR.get(_name, '<span aria-hidden="true">' + htmllib.escape(_name[:1]) + '</span>')
        cath.append('<article class="toolcard" style="--cat:' + _col + '" aria-label="' + htmllib.escape(_name) + '">'
            '<div class="toolcard-head"><span class="map-icon" aria-hidden="true">' + _icon + '</span>'
            '<div><h3>' + htmllib.escape(_name) + '</h3>'
            '<span class="pop" title="Popularity: ' + str(_pop) + ' out of 5 in 2026 field adoption"><span class="poplbl">Popularity</span><span class="stars">' + _stars + '</span><b>' + str(_pop) + '/5</b></span></div></div>'
            '<dl class="tooldl"><dt>What</dt><dd>' + htmllib.escape(_what) + '</dd><dt>When</dt><dd>' + htmllib.escape(_when) + '</dd><dt>Why</dt><dd>' + htmllib.escape(_why) + '</dd><dt>How</dt><dd class="how">' + htmllib.escape(_how) + '</dd></dl>'
            '<p><a class="btn" href="../read/' + _bid + '.html">Read in book →</a></p></article>')
    catalog_html = '<div class="hm-label" aria-hidden="true"><span>TOOL CATALOG</span><span>' + str(len(CATALOG)) + ' TOOLS</span></div><div class="toolgrid">' + ''.join(cath) + '</div><p class="sub">Popularity is a field estimate for 2026 hiring and community weight — fit beats fame; confirm with the matrix.</p>'
    STACKS = [
        ('Startup SaaS', 'GitHub + Docker + K8s', ['GitHub Actions','Docker','GHCR / Registries','Kubernetes','ArgoCD'], 'Push → build → registry → pull into prod. Zero infra, fastest to first deploy.'),
        ('Enterprise Regulated', 'Jenkins + Docker + IaC', ['Jenkins','Docker','GHCR / Registries','Terraform','Kubernetes'], 'Controller on-prem, agents scale, Terraform gates envs, policy approvals on prod.'),
        ('GitLab Native', 'One Platform', ['GitLab CI','Docker','GHCR / Registries','Kubernetes','Terraform'], 'One YAML, one registry, review apps per MR, merge trains on main.'),
        ('Observability Stack', 'See Every Release', ['Prometheus','Grafana','Loki','Kubernetes','ArgoCD'], 'Metrics + logs + traces with Grafana glass pane; deploy annotations mark every release.'),
    ]
    sh = []
    for title, subtitle, tools, desc in STACKS:
        icons = ''.join('<span class="stack-icon" title="' + htmllib.escape(t) + '">' + ICON_FOR.get(t, '<span>' + htmllib.escape(t[:1]) + '</span>') + '</span>' for t in tools)
        flow = '<span class="stack-flow">' + ' <span class="arrow">→</span> '.join(htmllib.escape(t) for t in tools) + '</span>'
        sh.append('<article class="stackcard"><div class="stack-icons">' + icons + '</div><h3>' + htmllib.escape(title) + ' <span>' + htmllib.escape(subtitle) + '</span></h3><p>' + htmllib.escape(desc) + '</p><div class="stack-flow-wrap">' + flow + '</div></article>')
    stacks_html = '<div class="hm-label" aria-hidden="true"><span>POPULAR STACKS</span><span>4 WAYS</span></div><div class="stackgrid">' + ''.join(sh) + '</div>'
    PROJECTS = [
        ('E-commerce Checkout', '10k deploys/day, 99.9% SLO', ['GitHub Actions','Docker','Kubernetes','ArgoCD','Prometheus','Grafana'], 'PR → Actions tests + scans → Docker digest → GHCR → Argo syncs canary 5% → auto-promote on golden signals.','Canary + SLO gates'),
        ('Fintech Ledger', 'Air-gapped, audit every change', ['Jenkins','Docker','Terraform','Kubernetes','Prometheus'], 'Jenkins controller on prem, groovy pipeline, Terraform plan on PR, manual prod approval, signed SBOM.','Policy gates + provenance'),
        ('SaaS Preview Envs', 'Per-PR live env, auto-destroy', ['GitLab CI','Docker','Helm','Kubernetes','Loki'], 'MR → GitLab builds review app with Helm, Loki trails logs, destroy on merge via ApplicationSet.','Review apps at scale'),
    ]
    ph = []
    for title, badge, tools, desc, tag in PROJECTS:
        icons = ''.join('<span class="stack-icon sm" title="' + htmllib.escape(t) + '">' + ICON_FOR.get(t, '<span>' + htmllib.escape(t[:1]) + '</span>') + '</span>' for t in tools)
        ph.append('<article class="projcard"><div class="proj-head"><div class="proj-icons">' + icons + '</div><span class="map-pill">' + htmllib.escape(badge) + '</span></div><h3>' + htmllib.escape(title) + '</h3><p>' + htmllib.escape(desc) + '</p><span class="map-pill" style="--cat:#18E299">' + htmllib.escape(tag) + '</span></article>')
    projects_html = '<div class="hm-label" aria-hidden="true"><span>REAL-WORLD PROJECTS</span><span>3 BLUEPRINTS</span></div><div class="projgrid">' + ''.join(ph) + '</div>'
    links = {
        'jenkins': resolve_sheet(books, env, 'jenkins-complete', ['Setup', 'Topology', 'Agents']),
        'actions': resolve_sheet(books, env, 'platforms-roadmaps', ['Actions']),
        'gitlab': resolve_sheet(books, env, 'platforms-roadmaps', ['GitLab CI', 'Pipeline Anatomy']),
        'argocd': resolve_sheet(books, env, 'platforms-roadmaps', ['ArgoCD & GitOps', 'Push vs Pull', 'Where It Fits']),
        'choice': resolve_sheet(books, env, 'platforms-roadmaps', ['The Choice', 'Decision Framework', 'Side-by-Side']),
        'matrix': resolve_sheet(books, env, 'platforms-roadmaps', ['Tool vs Tool']),
    }
    qhtml = []
    for qi, (q, hint, opts) in enumerate(QUESTIONS):
        btns = []
        for o, w, x in opts:
            btns.append('<button class="btn qopt" data-q="' + str(qi) + '" data-w="' + htmllib.escape(json.dumps(w), quote=True) + '" title="' + htmllib.escape(x) + '">' + o + '</button>')
        vis = '' if qi == 0 else ' hidden'
        back = '' if qi == 0 else '<p><button class="btn qback">← Back</button></p>'
        qhtml.append('<div class="qcard" id="q' + str(qi) + '"' + vis + '><div class="qprog"><span style="width:' + str(round(100 * qi / len(QUESTIONS))) + '%"></span></div><p class="qstep">Question ' + str(qi + 1) + ' of ' + str(len(QUESTIONS)) + '</p><h3>' + q + '</h3><p class="qhint">' + hint + '</p><div class="opts">' + ''.join(btns) + '</div>' + back + '</div>')
    names = {}
    whys = {}
    for k in TOOLS_META:
        names[k] = TOOLS_META[k][0]
        whys[k] = TOOLS_META[k][1]
    js_vars = ('const LINKS=' + json.dumps(links) + ';'
               'const WHY=' + json.dumps(whys) + ';'
               'const NAMES=' + json.dumps(names) + ';'
               'const STUDY=' + json.dumps(STUDY_THREAD) + ';'
               'const STUDYLBL=' + json.dumps(STUDY_LABEL) + ';'
               'const NQ=' + str(len(QUESTIONS)) + ';')
    quiz_js = '''
let qi=0;const scores={jenkins:0,actions:0,gitlab:0,argocd:0};const hist=[];
document.querySelectorAll('.qopt').forEach(b=>b.onclick=()=>{
const w=JSON.parse(b.datasetconst _vb0=[...vb];const _zin=document.querySelector('#gzin'),_zout=document.querySelector('#gzout'),_zr=document.querySelector('#greset2');function _zoom(f){const cx=vb[0]+vb[2]/2,cy=vb[1]+vb[3]/2;vb=[cx-(cx-vb[0])*f,cy-(cy-vb[1])*f,vb[2]*f,vb[3]*f];apply();}if(_zin)_zin.onclick=()=>_zoom(0.8);if(_zout)_zout.onclick=()=>_zoom(1.25);if(_zr)_zr.onclick=()=>{vb=[..._vb0];apply();};.w);hist.push({qi:qi,w:w});for(const k in w)scores[k]+=w[k];
document.querySelector('#q'+qi).hidden=true;qi++;
if(qi<NQ){document.querySelector('#q'+qi).hidden=false;}else{showResult();}});
document.querySelectorAll('.qback').forEach(b=>b.onclick=()=>{const last=hist.pop();if(!last)return;for(const k in last.w)scores[k]-=last.w[k];document.querySelector('#q'+qi).hidden=true;qi=last.qi;document.querySelector('#q'+qi).hidden=false;});
function showResult(){const tot=Math.max(1,...Object.values(scores));
const rank=Object.keys(scores).sort((a,b)=>scores[b]-scores[a]);
const tie=rank.length>1&&scores[rank[0]]===scores[rank[1]];
let s='<div class="qcard"><div class="qprog"><span style="width:100%"></span></div><h3>Your stack, ranked</h3>';
if(tie)s+='<p class="qhint">Tie at the top — either winner fits; read both WHEN TO USE boxes before you commit.</p>';
const MEDAL=['\U0001F947','\U0001F948','\U0001F949','4.'];
rank.forEach((k,i)=>{s+='<div class="tcard'+(i===0?' winner':'')+'"><b>'+MEDAL[i]+' '+NAMES[k]+' - '+scores[k]+' pts</b><div class="tbar"><b style="width:'+Math.round(100*scores[k]/tot)+'%"></b></div><p>'+WHY[k]+'</p><a class="btn" href="'+LINKS[k]+'">Read why</a> ';if(i===0){s+='<a class="btn" href="'+LINKS.choice+'">Compare all</a> <a class="btn" href="'+LINKS.matrix+'">Full field matrix</a><a class="btn" href="../threads/#'+STUDY[k]+'">Study: '+STUDYLBL[k]+'</a>';}s+='</div>';});
const h='#r='+rank.map(k=>k+':'+scores[k]).join(',');
s+='<p><button class="btn" onclick="location.reload()">Retake</button> <button class="btn" id="sharebtn">Copy result link</button></p></div>';
document.querySelector('#result').innerHTML=s;
try{history.replaceState(null,'',h);}catch(e){}
const _sb=document.querySelector('#sharebtn');if(_sb)_sb.onclick=()=>{try{navigator.clipboard.writeText(location.href);_sb.textContent='Copied!';}catch(e){_sb.textContent=location.href;}};
window.scrollTo({top:document.querySelector('#result').offsetTop-80});}
try{const _m=location.hash.match(/^#r=([a-z,0-9:]+)$/);if(_m){_m[1].split(',').forEach(p=>{const kv=p.split(':');if(scores[kv[0]]!==undefined)scores[kv[0]]=+kv[1]||0;});document.querySelectorAll('.qcard[id^=q]').forEach(e=>e.hidden=true);showResult();}}catch(e){}
'''
    page = ('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
            '<link rel="icon" type="image/svg+xml" href="../favicon.svg">'
            '<title>Tool picker - CICD BY Nabawy</title>'
            '<style>' + env['BASE_CSS'] + '.qcard{max-width:640px;margin:18px auto;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px}.qcard .opts{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.qcard .btn{min-height:48px}.qcard .opts .btn{flex:1 1 140px}.qprog{height:6px;border-radius:99px;background:var(--bg2);margin-bottom:12px;overflow:hidden}.qprog span{display:block;height:100%;background:var(--brand);border-radius:99px;transition:width .2s}.qstep{font-family:var(--mono);font-size:11px;color:var(--mut);letter-spacing:.1em;margin-bottom:6px}.qhint{font-size:13px;color:var(--mut);margin:4px 0 6px}.qback{margin-top:4px}.toolgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:14px 0}.toolcard{background:var(--card);border:1px solid var(--line-soft);border-radius:14px;padding:18px}.toolcard:hover{border-color:var(--cat)}.toolcard-head{display:flex;gap:12px;align-items:center;margin-bottom:8px}.toolcard{position:relative;overflow:hidden}.toolcard::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--cat)}.toolcard-head .map-icon{font-size:20px;font-weight:800;width:44px;height:44px;overflow:hidden}.toolcard-head .map-icon img{width:28px;height:28px;display:block;object-fit:contain}.toolcard h3{font-size:16px;margin:0}.toolcard .pop{display:inline-flex;align-items:center;gap:6px;color:var(--mut);font-size:12px}.toolcard .pop .poplbl{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}.toolcard .pop .stars{color:var(--cat);letter-spacing:1px}.toolcard .tooldl{margin:10px 0 6px}.toolcard .tooldl dt{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--cat);margin-top:10px}.toolcard .tooldl dd{font-size:13px;color:var(--mut);margin:3px 0 0;line-height:1.5}.toolcard .tooldl dd.how{font-family:var(--mono);font-size:12px;background:color-mix(in srgb,var(--cat) 7%,var(--bg2));border-left:3px solid var(--cat);padding:8px 10px;border-radius:0 8px 8px 0;white-space:normal}.stackgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:12px 0}.stackcard{background:var(--card);border:1px solid var(--line-soft);border-radius:14px;padding:18px;position:relative;overflow:hidden}.stackcard::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand),#4f46e5)}.stack-icons{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.stack-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--bg2);border:1px solid var(--line-soft)}.stack-icon img{width:24px;height:24px;display:block}.stackcard h3{font-size:15px;margin:0 0 6px}.stackcard h3 span{font-weight:400;color:var(--mut);font-size:12px}.stackcard p{font-size:13px;color:var(--mut);margin:0 0 8px}.stack-flow-wrap{overflow-x:auto;padding:6px 0}.stack-flow{font-family:var(--mono);font-size:11px;color:var(--mut);white-space:nowrap}.stack-flow .arrow{color:var(--brand);margin:0 4px}.projgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:12px 0}.projcard{background:var(--card);border:1px solid var(--line-soft);border-radius:14px;padding:18px}.proj-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px}.proj-icons{display:flex;gap:6px;flex-wrap:wrap}.proj-icons .stack-icon.sm{width:34px;height:34px}.projcard h3{font-size:15px;margin:0 0 6px}.projcard p{font-size:13px;color:var(--mut);margin:0 0 8px}.tcard{max-width:640px;margin:12px auto;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 22px}.tcard.winner{border-color:var(--brand);box-shadow:var(--shadow-lift)}.tbar{height:8px;border-radius:99px;background:var(--bg2);margin:10px 0}.tbar b{display:block;height:100%;border-radius:99px;background:var(--brand)}</style>'
            + HEAD_THEME +
            '</head><body><header class="top"><div class="wrap">'
            '<a class="logo" href="../index.html" style="color:inherit">CICD<span> BY Nabawy</span></a>'
            '<nav class="crumbs"><span class="sep">/</span><span class="here">Tools</span></nav>'
            '<a class="btn" href="../index.html" style="text-decoration:none">Home</a>'
            '<a class="btn" href="../glossary.html" style="text-decoration:none">Study Deck</a>'
            '<a class="btn" href="../threads/" style="text-decoration:none">Threads</a>'
            '<button class="btn" id="themebtn" aria-label="Toggle theme">X</button>'
            '</div></header><div class="wrap">'
            '<div class="hero" style="padding:36px 24px 16px"><span class="eyebrow">TOOLS</span>'
            '<h1>Which tool fits?</h1><p>' + str(len(QUESTIONS)) + ' questions. Ranked answers with reasons, study threads, and deep links.</p></div>'
            "<div id='quiz'>" + ''.join(qhtml) + "</div><div id='result'></div>" + catalog_html + stacks_html + projects_html +
            '</div><footer><div class="wrap"><span>CICD BY Nabawy</span><span><a href="../index.html">Home</a> · <a href="../glossary.html">Study Deck</a> · <a href="../threads/">Threads</a></span></div></footer>'
            '<script>'
            + THEME_JS + js_vars + quiz_js +
            '</script></body></html>')
    out = os.path.join(output_dir, 'tools')
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(page)
    print('BUILT tools picker -> ' + out)


def build_extra_pages(books, output_dir, env):
    threads, tindex = build_thread_index(books, env)
    build_threads_page(books, output_dir, env, threads, tindex)
    build_tools_page(books, output_dir, env)
