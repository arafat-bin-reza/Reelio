# Reelio – Business Overview

**Document type:** Business overview of the current state of the project
**Prepared:** 2 November 2026
**Source of truth:** The Reelio repository (README, source code, deployment workflow). This document describes the product as it exists today. It does not include revenue, customer or pricing figures, because the project currently has none recorded.

---

## 1. Executive summary

Reelio is a browser-based personal video library and player. A user opens a single web page, adds videos by uploading files from their device or by pasting a link (direct MP4/WebM, YouTube or Vimeo), and plays them in a polished custom player that remembers where they left off.

The defining business characteristic of Reelio is that it has **no backend and no running cost**. Every video and setting is stored inside the user's own browser. The product is a set of static files hosted free of charge on GitHub Pages and published automatically on every change.

Today Reelio operates as a **free, open-source (MIT) demonstration product**. It has no monetisation, no user accounts, no analytics and no hosted data. Its current value is as a showcase of a complete, privacy-first web product and as a foundation that could be extended in several commercial or internal directions, which are outlined in section 8.

---

## 2. The product

### 2.1 What a user can do

| Capability | Detail |
|---|---|
| Build a library | Grid of videos with thumbnails, duration, source badge, search, filter by source, and sort by date, title or length |
| Upload from device | File picker or drag-and-drop. Files are saved as Blobs in the browser's IndexedDB and never leave the machine |
| Add online videos | Direct video links play natively; YouTube and Vimeo links play in an embedded player |
| Pre-loaded content | A maintainer can ship a starter catalogue in `data/library.json` that appears on a user's first visit. Entries can be self-hosted video files or YouTube / Vimeo links, so a default playlist can be curated without hosting any media |
| Watch | Custom player with play/pause, seek with buffered indicator, volume, playback speed, picture-in-picture, fullscreen, full keyboard shortcuts and resume-where-you-left-off |
| Personalise | Light/dark theme, storage usage meter, shareable `#video=<id>` links within a library |
| Manage | Rename and delete videos; warnings for large files and unplayable formats |

### 2.2 How it is delivered

- **Form factor:** a single web page (`index.html`) plus CSS and JavaScript modules. No installation, no account, no cookies.
- **Hosting:** GitHub Pages, deployed by a GitHub Actions workflow on every push to `main`.
- **Dependencies:** none. No frameworks, no package manager, no build step. The browser loads the modules directly.
- **Licence:** MIT, so anyone may use, modify and redistribute it, including commercially.

### 2.3 Where the data lives

| Content | Stored where | Who can access it |
|---|---|---|
| Uploaded video files and their thumbnails | The user's browser (IndexedDB) | Only that user, on that device and browser |
| Online video links and metadata | The user's browser (IndexedDB) | Only that user |
| Settings (volume, speed, theme, last video) | The user's browser (localStorage) | Only that user |
| Starter catalogue | The repository (`data/library.json`) | Everyone who visits the site |

This is the key architectural decision and it defines the business: the operator never holds user content, never pays for storage or bandwidth for user uploads, and carries no data-protection liability for user media.

---

## 3. Value proposition

**For the end user**

- *Privacy by construction.* Personal videos never leave the device. There is nothing to trust because there is nothing to upload to.
- *Zero friction.* No sign-up, no app store, no install. Works from a link.
- *One place for mixed sources.* Local files, direct links and YouTube/Vimeo sit side by side in one library with one player.
- *A better player than the browser default.* Resume position, speed control, PiP, keyboard control, buffered indicator.

**For the operator or maintainer**

- *Effectively zero running cost.* Static hosting is free on GitHub Pages; there are no servers, databases or storage bills, regardless of how many users or how large their libraries are.
- *Near-zero operational burden.* Nothing to patch, scale, back up or monitor on the server side.
- *No user data liability.* The operator stores nothing about users.
- *Trivial deployment.* Push to `main`; the site updates.
- *Easy white-labelling.* Change the name, theme tokens and starter catalogue to produce a branded player in minutes.

---

## 4. Target audiences

The product is general-purpose, but it fits some groups especially well:

1. **Individuals** who want a private, tidy place to watch their own clips and a handful of online videos without handing them to a cloud service.
2. **Educators and trainers** who want to hand students a link to a curated, pre-loaded set of lesson videos (via the starter catalogue) with a clean, distraction-free player and resume support.
3. **Small teams and internal communications** who need a lightweight "video shelf" for onboarding or demo clips hosted on their own static web space, with no IT infrastructure.
4. **Developers and agencies** who want an MIT-licensed, framework-free reference implementation of a web video player to embed, fork or learn from.
5. **Privacy-sensitive or offline-leaning users** (journalists, clinicians, field workers) who need to review footage locally in a browser.

---

## 5. Business model today

| Dimension | Current state |
|---|---|
| Pricing | Free |
| Revenue | None |
| Users / accounts | None tracked; the product has no login or analytics |
| Customer data held | None |
| Running costs | Approximately zero (free static hosting) |
| Development cost | Maintainer time only |
| Licence | MIT (permissive open source) |
| Distribution | Public URL on GitHub Pages; forkable repository |

In plain terms, Reelio is currently a **cost-free product with no income**, positioned as a demonstration and a reusable foundation rather than a revenue line.

---

## 6. Competitive position

| Alternative | How Reelio differs |
|---|---|
| Native video apps (VLC, QuickTime, Windows Media Player) | Reelio needs no install and mixes local files with online links in one library, but it depends on browser storage limits and codecs |
| Cloud video services (YouTube, Vimeo, Google Drive, Dropbox) | Reelio uploads nothing and has no account, but it cannot sync across devices or share private files |
| Self-hosted media servers (Plex, Jellyfin) | Reelio has no server to run, but it also has no transcoding, multi-user support or large-library capacity |
| Raw HTML5 `<video>` tag on a web page | Reelio adds a library, persistence, resume, PiP, speed control, keyboard shortcuts and theming out of the box |

Reelio's defensible niche is **"the private, zero-infrastructure video shelf"**. It is not trying to compete on scale, sync or social features.

---

## 7. Constraints and risks

These follow directly from the no-backend design and should be understood by anyone making decisions about the product.

- **No cross-device sync.** Uploaded videos exist only in the browser where they were added. Clearing site data deletes them.
- **Browser storage limits.** Capacity depends on the browser and device. Safari may evict data after inactivity; the app requests persistent storage but cannot guarantee it.
- **Codec support is the browser's.** MP4 (H.264/AAC) plays everywhere; WebM does not play in Safari. There is no server-side transcoding.
- **No sharing of private content.** Shareable `#video=<id>` links only work for someone who already has that video in their own library (for example, bundled items).
- **Thumbnails for third-party direct links need CORS.** Otherwise a placeholder is shown.
- **Starter catalogue size is capped by GitHub.** Files committed to the repository must stay under 100 MB; larger bundled videos must be hosted elsewhere and linked.
- **Dependence on GitHub Pages and third-party embeds.** YouTube/Vimeo playback relies on those platforms' embed players and policies.
- **No usage insight.** Without analytics, the operator cannot currently measure adoption or engagement. This is a deliberate privacy trade-off.
- **Seeding is one-shot per browser.** Once a bundled video id has been seen, editing that entry does not update existing users' libraries; a new id is required.

---

## 8. Opportunities and possible directions

None of these are committed. They are listed to show where the current foundation can go with limited effort.

**Keep it free, grow its reach**
- Position it as a reference open-source project; accept contributions; publish a short landing page and usage guide.
- Offer a one-click "deploy your own" template so educators and teams can fork, add their catalogue and publish.

**Monetise around the free core (optional)**
- *Hosted catalogues for organisations:* a paid service that hosts and manages an organisation's starter catalogue and branding, while playback stays client-side.
- *Optional sync add-on:* an opt-in paid backend (or bring-your-own cloud storage) that syncs libraries across devices, keeping the default fully local.
- *White-label licensing or support:* paid customisation, themes and support for companies embedding the player in training portals.
- *Sponsorship / donations:* GitHub Sponsors or similar for the open-source project.

**Product extensions that add value without a backend**
- Playlists and tags, subtitle (WebVTT) support, chapters, export/import of a library as a file, Progressive Web App install for offline use, and accessibility improvements.

---

## 9. Key facts at a glance

- **Product:** Browser-based personal video library and player
- **Stage:** Working, deployed demo; open source under MIT
- **Infrastructure:** None beyond free static hosting
- **User data held by operator:** None
- **Running cost:** Approximately zero
- **Revenue:** None today
- **Core differentiator:** Private, zero-infrastructure, no-install video shelf that mixes local files with online links
- **Main limitation:** Content is tied to one browser on one device

---

## 10. Glossary

- **Static site:** A website made only of files served as-is, with no server-side code.
- **IndexedDB / localStorage:** Storage built into web browsers that keeps data on the user's device.
- **GitHub Pages:** GitHub's free hosting service for static sites.
- **CORS:** A browser security rule that controls whether a page may read content from another website.
- **PiP (picture-in-picture):** Playing video in a small floating window over other apps.
