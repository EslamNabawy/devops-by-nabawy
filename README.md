# NTI DevOps Library — owner's guide

1. Open it: double-click `index.html` (no server needed).
2. Refresh it: `node tools/build.mjs` (PDF-only: run `refresh.bat` / `./refresh.sh`).
3. Add PDFs: copy any-name PDFs to `content/_inbox/` → run refresh → reload. Or name `docker__04-networking.pdf` → `content/pdf/docker/` → refresh. Or drag onto page → My files.
4. Deploy it: push this folder to GitHub Pages (enable Pages); all paths relative, hash routing works.
5. Learner copy: set `config/site.json → maintainerMode:false` before publishing to classmates.
6. Backup: Me → Export/Import progress JSON.
7. Search covers this library. Course sites open in a new tab.
8. Nothing you do here leaves this device.
9. Viewing needs nothing. Refreshing needs Node 18+ once.
10. Reports: `BUILD-LOG.md`, `INGEST-REPORT.md`, `QA-REPORT.md`.
