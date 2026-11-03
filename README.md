# Reelio

Reelio is a lightweight video player built with HTML, CSS, and JavaScript. Upload videos from your device, save them to your library, or add online videos by link. Clean interface, no backend needed, and ready to deploy on GitHub Pages.

## Features

- **Library grid** with thumbnails, duration, source badges, search, filter and sort.
- **Custom player**: play/pause, seek with buffered indicator, volume, playback speed, picture‑in‑picture, fullscreen, keyboard shortcuts, and resume‑where‑you‑left‑off.
- **Upload from your device**: file picker or drag‑and‑drop. Files are stored as Blobs in the browser's IndexedDB and never leave your machine.
- **Add online videos by URL**: direct MP4/WebM links play in the HTML5 player; YouTube and Vimeo links play in an embedded player.
- **Bundled videos** listed in `data/library.json` appear on first visit. Entries can be local or hosted video files, or YouTube / Vimeo links.
- Light / dark theme, storage usage meter, shareable `#video=<id>` links.

## How storage works

GitHub Pages only serves static files, so there is no server to upload to. Everything you add is stored **in your browser**:

| Source   | What is stored                              | Where                 |
|----------|---------------------------------------------|-----------------------|
| Bundled  | URL + metadata from `data/library.json`      | IndexedDB             |
| Online   | URL or YouTube/Vimeo id + metadata           | IndexedDB             |
| Uploaded | The video file itself (Blob) + thumbnail     | IndexedDB             |
| Settings | Volume, mute, speed, theme, last video       | localStorage          |

Uploaded videos are only available in the browser and device where you added them. Clearing site data removes them.

## Project structure

```
index.html            # Single page: header, library grid, player and dialogs
css/                  # base (tokens/reset), layout, components, player
js/
  app.js              # Entry point: wiring, seeding, theme, storage meter, hash routing
  db.js               # IndexedDB wrapper
  library.js          # Library state and grid rendering
  player.js           # Custom player controls and keyboard shortcuts
  upload.js           # File picker, drag-and-drop, validation
  online.js           # URL parsing, YouTube/Vimeo embeds, Add URL dialog
  media.js            # Duration + thumbnail probe via a hidden <video>
  storage.js          # localStorage settings
  ui.js               # Toasts, confirm and prompt dialogs
  util.js             # Formatting helpers
data/library.json     # Bundled videos shown on first visit
assets/               # Icons, thumbnails, bundled sample clip
```

No build step and no dependencies. ES modules are loaded directly by the browser.

## Run locally

Because the app uses ES modules and `fetch()`, open it through a local web server rather than double‑clicking `index.html`:

```bash
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:3000` (or `:8080`). The server must support HTTP Range requests for seeking to work; both of the above do.

## Deploy to GitHub Pages

1. Push to the `main` branch.
2. **Option A – branch deploy:** in the repo go to *Settings → Pages → Build and deployment → Source: Deploy from a branch*, choose `main` and `/ (root)`, then save.
3. **Option B – GitHub Actions:** the included `.github/workflows/deploy.yml` deploys automatically on every push to `main`. In *Settings → Pages* set *Source* to *GitHub Actions*.
4. The site will be available at `https://<your-user>.github.io/Reelio/`.

All asset paths are relative, so the app works from a repository sub‑path. The `.nojekyll` file stops GitHub from running Jekyll on the folder.

## Adding your own bundled videos

Edit `data/library.json`. Each entry needs a unique `id`, a `title` and a `url`, and optionally `thumbnail`, `duration` (seconds) and `mimeType`. The `url` can be:

- a direct video file, absolute (`https://example.com/clip.mp4`) or relative (`./assets/videos/clip.mp4`);
- a YouTube or Vimeo link (`https://www.youtube.com/watch?v=...`, `https://youtu.be/...`, `https://vimeo.com/...`). These play in the embedded player. YouTube thumbnails are fetched automatically; for Vimeo supply a `thumbnail` or the placeholder is shown.

```json
[
  { "id": "intro", "title": "Welcome", "url": "./assets/videos/intro.mp4", "duration": 42 },
  { "id": "yt-tour", "title": "Product tour", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  { "id": "vimeo-talk", "title": "Keynote", "url": "https://vimeo.com/76979871", "thumbnail": "https://example.com/keynote.jpg" }
]
```

Entries are added to a visitor's library once per browser, keyed by `id`. Changing an existing entry will not update libraries that already contain it; give it a new `id` instead. Keep files committed to the repo small; GitHub blocks files over 100 MB.

## Keyboard shortcuts

| Key                  | Action                 |
|----------------------|------------------------|
| `Space` / `K`        | Play / pause           |
| `←` / `→` (`J`/`L`)  | Seek 5 s               |
| `↑` / `↓`            | Volume                 |
| `M`                  | Mute                   |
| `F`                  | Fullscreen             |
| `P`                  | Picture‑in‑picture     |
| `Esc`                | Close player           |
| `/`                  | Focus search (library) |
| `U` / `A`            | Open Upload / Add URL  |

## Browser notes

- MP4 (H.264/AAC) plays everywhere; WebM plays in Chrome, Firefox and Edge.
- Thumbnails for online direct links require the host to send CORS headers; otherwise a placeholder is shown.
- Safari may evict stored data after a period of inactivity. The app asks for persistent storage on first upload where supported.

## License

MIT – see [LICENSE](LICENSE).
