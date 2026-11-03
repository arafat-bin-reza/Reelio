# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Reelio is a static, dependency-free video library and player: plain HTML, CSS and browser-native ES modules. There is no build step, no package.json, no linter and no test suite. Everything the user adds is stored client-side (IndexedDB + localStorage); GitHub Pages serves the files as-is.

## Running locally

ES modules and `fetch()` require an HTTP origin, so never open `index.html` directly from disk. Use a server that supports HTTP Range requests (needed for seeking):

```bash
npx serve .
# or
python -m http.server 8080
```

Verification is manual in a browser. Check the DevTools console for errors, and use Application → IndexedDB (`videoPlayerDB` / `videos` store) and Local Storage (`vp:*` keys) to inspect state. To reset the app to a fresh-install state, clear site data; note that bundled-video seeding is tracked separately in the `vp:seededIds` localStorage key (see below).

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which uploads the repo root to GitHub Pages. All paths in HTML/JS/CSS must stay relative (`./...`) because the site is served from a sub-path (`/Reelio/`). `.nojekyll` must remain so Pages does not run Jekyll.

## Architecture

### Single video record shape

Every module works against one record shape, stored in the single IndexedDB object store `videos` (keyPath `id`, indexes on `addedAt` and `source`):

```js
{ id, title, source: 'bundled'|'upload'|'online', url, embed: {provider:'youtube'|'vimeo', videoId}|null,
  blob: File|null, mimeType, size, duration, thumbnail: string|Blob|null, addedAt, lastPosition }
```

The `source` field drives badges/filtering in the library; the player ignores it and instead dispatches on the data: `embed` set → `<iframe>` (YouTube/Vimeo), else `blob` set → object URL into `<video>`, else `url` into `<video>`. If you add a new source kind, keep that dispatch in `player.js:openVideo` consistent. `thumbnail` may be a URL string (bundled/online) or a Blob captured from a canvas (uploads, CORS-friendly direct links); `library.js` owns the object URLs for Blob thumbnails and revokes them on refresh.

### Module responsibilities and data flow

- `js/app.js` is the only entry point (`index.html` loads it as a module). It opens the DB, seeds bundled videos, then calls each module's `init*()` with the DOM elements it needs plus callbacks. Modules do not query the DOM for each other's elements; wiring happens here. It also owns theme, the storage meter, global keyboard shortcuts (`/`, `U`, `A`) and `#video=<id>` hash routing.
- `js/db.js` is the only module that talks to IndexedDB. All ops go through a single `run(mode, op)` transaction helper. `updateVideo(id, patch)` is a read-merge-put.
- `js/storage.js` is the only module that talks to localStorage (keys prefixed `vp:`): player settings, last video id, and the set of seeded ids.
- `js/library.js` holds in-memory library state (`state.videos`, query/source/sort), renders the grid with `innerHTML` templates (all user strings go through `escapeHtml`), and uses event delegation on the grid for play/rename/delete. `refreshLibrary()` re-reads the DB and must be called after any DB write made elsewhere; `getVideoById` reads this cache, not the DB.
- `js/player.js` is a singleton (`current` record, module-level `els`). It persists `lastPosition` (throttled) and `duration` back to the DB while playing and reports close via `onClose`, which app.js uses to clear the hash and refresh the library.
- `js/upload.js` and `js/online.js` each build a record and insert it with `addVideo`, then call `onAdded` (= `refreshLibrary`). Both use `js/media.js`'s `probeMedia()` (a hidden `<video>` + canvas) to obtain duration/thumbnail. `online.js` also exports `parseVideoUrl`/`embedUrl`, which `player.js` imports, so `online.js` must stay free of player imports to avoid a cycle.
- `js/ui.js` provides toasts and promise-based `confirmDialog`/`promptDialog` built on `<dialog>`; `js/util.js` is pure helpers.

### Bundled video seeding

`data/library.json` (an array; currently empty) is fetched on every load. Each entry is inserted once per browser: ids are recorded in `vp:seededIds` even if they already existed, so user deletions of bundled videos stick and re-adding requires a new `id`. Changing an entry's `url`/`title` for an id that was already seeded will NOT update existing users' libraries. Entry fields: `id`, `title`, `url` (required); `thumbnail`, `duration` (seconds), `mimeType` optional. `url` may be a direct file (absolute or relative) or a YouTube/Vimeo link; the seeder runs it through `parseVideoUrl` and sets `embed` for the latter, so the record plays in the iframe while keeping `source: 'bundled'`.

### Styling

CSS is split by concern (`base.css` tokens + reset, `layout.css`, `components.css`, `player.css`) and loaded in that order. Theming is done entirely through CSS custom properties on `:root` with a `[data-theme="light"]` override; `app.js` toggles `document.documentElement.dataset.theme`. Add new colors as tokens in `base.css` rather than hard-coding.
