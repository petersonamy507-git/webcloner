# Website Cloner

A website cloner tool built with Vite + PHP/Node. Enter any URL and clone the site exactly — HTML, CSS, JavaScript, images, and fonts are all downloaded.

## Tech Stack

- **Frontend:** HTML, CSS, Bootstrap 5, JavaScript (Vite)
- **Backend:** Node.js (primary) or PHP 8+ (cURL, DOMDocument, ZipArchive)

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [PHP](https://www.php.net/) 8.0+ with extensions: `curl`, `dom`, `zip`, `mbstring` (optional — Node fallback available)

## Setup

```bash
# Install dependencies
npm install

# Folder for cloned websites
mkdir -p cloned
```

## Run (Development)

You need two terminals:

**Terminal 1 — API server:**
```bash
npm run api
```

**Terminal 2 — Vite dev server:**
```bash
npm run dev
```

Open in browser: **http://localhost:5173**

## Usage

1. Enter a website URL (e.g. `https://example.com`)
2. Optionally set a folder name
3. Click **Clone Website**
4. After cloning, use **Edit Preview**, **Preview**, or **Download ZIP**

Cloned files are saved in `cloned/<folder-name>/`.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/clone.php` | POST | Clone a website |
| `/api/download.php?folder=name` | GET | Download ZIP |
| `/api/pages.php?folder=name` | GET | List HTML pages |
| `/api/save.php` | POST | Save edited HTML |
| `/api/upload.php` | POST | Upload images |
| `/cloned/<folder>/index.html` | GET | Preview cloned site |

### Clone Request

```json
POST /api/clone.php
{
  "url": "https://example.com",
  "folderName": "my-site",
  "mode": "full"
}
```

`mode` can be `full` (browser-based, recommended) or `static` (fast, simple sites only).

## Production Build

```bash
npm run build
```

Deploy the `dist/` folder with the API server. The `api/` and `cloned/` folders must remain accessible.

## Limitations

- Single page clone (homepage); nested pages are not auto-followed
- Max 50 MB total download, 10 MB per file
- JavaScript-rendered (SPA) content may not be fully captured
- Login-protected or paywalled sites cannot be cloned
- Some CDN/blocking sites may refuse requests

## License

MIT
