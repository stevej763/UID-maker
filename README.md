# UUID Maker

A small static web app that generates UUIDs entirely in the browser. No backend, no tracking, nothing sent over the network. It's built to run on GitHub Pages.

## Features

- **v4 (random)** by default, plus **v7**, **v1**, **v6**, **v5**, **v3**, **Nil** and **Max** ([RFC 9562](https://www.rfc-editor.org/rfc/rfc9562))
- Generate up to 1000 at once, copy one or all, or download as `.txt`
- Format options: uppercase, no hyphens, `{braces}`, `"quotes"`, comma separated
- Name based v3/v5 with the standard DNS, URL, OID and X.500 namespaces or a custom one
- Inspector that shows the version, variant and embedded timestamp of any UUID
- Link straight to a version with `?v=7` (or `1`, `3`, `5`, `6`, `nil`, `max`)
- Light and dark mode, works on mobile

Randomness comes from `crypto.getRandomValues`. v5 uses `crypto.subtle` (SHA-1), which browsers only expose on https or localhost; GitHub Pages is https so that's fine.

## Run locally

```sh
npm start        # serves on http://localhost:8000 (needs python3)
npm test         # unit tests, Node 20+
```

Opening `index.html` directly from disk won't work because browsers block ES modules on `file://`. Use any static server.

## Run with Docker

```sh
docker build -t uid-maker .
docker run --rm -p 8000:80 uid-maker   # http://localhost:8000
```

Or with Compose:

```sh
docker compose up -d --build           # http://localhost:8000
PORT=9000 docker compose up -d --build # use a different port
docker compose down
```

The image is plain nginx serving the static files. v5 needs `crypto.subtle`, so open it on `localhost` or put it behind https.

## Deploy to GitHub Pages

The workflow in `.github/workflows/pages.yml` runs the tests and deploys on every push to `main`.

One-time setup: in the repo go to **Settings → Pages** and set **Source** to **GitHub Actions**. The site will then be at `https://<user>.github.io/<repo>/`.
