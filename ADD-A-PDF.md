# Add a PDF in 30 seconds

## What you need
Viewing needs nothing. Refreshing needs Node 18+ once. Without Node, drag a PDF onto the page (My files, this device only).

## Add PDFs in 3 steps
1. Copy PDFs (any names) into `content/_inbox/`.
2. Run `refresh.bat` (Windows) or `./refresh.sh` (macOS/Linux).
3. Reload `index.html`.

## Name it so it attaches itself
`docker__04-networking.pdf` → attaches to work `docker-04-networking` with zero guesswork. Pattern: `<track>__<nn>-<slug>.pdf`. Track ids: linux, aws, docker, kubernetes, terraform, ansible, jenkins, cicd, aiops.

## If a PDF lands in "Needs a track"
Rename with a track prefix (`<track>__name.pdf`), or add an override in `config/pdf-overrides.json`, then refresh.

## Expect a PDF later?
Add a slot to `config/expected-pdfs.json`:
```json
{ "id": "slot-docker-04-networking-pdf", "track": "docker", "forWork": "docker-04-networking", "file": "docker__04-networking.pdf", "title": "Docker networking (PDF)", "note": "Slides from day 4" }
```

## No Node? Drag a PDF onto the page
Opens instantly, saved under My files on this device only. Never enters shared catalog.

## Replacing a PDF
Drop the new file with the same name, run refresh. Old kept in `content/pdf/_versions/`.

## Removing a PDF
Delete it from `content/pdf/…`, run refresh. Catalog updates.
