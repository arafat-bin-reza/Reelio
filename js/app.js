// Entry point: wires modules together, seeds bundled videos, handles theme, storage meter and hash routing.

import { openDB, getAllVideos, addVideo } from './db.js';
import { loadSettings, saveSettings, getSeededIds, addSeededIds } from './storage.js';
import { initLibrary, refreshLibrary, getVideoById } from './library.js';
import { initPlayer, openVideo, closePlayer, isOpen as playerIsOpen } from './player.js';
import { initUpload } from './upload.js';
import { initUrlDialog, parseVideoUrl, makeEmbed, embedThumbnail } from './online.js';
import { toast, closeOnBackdropClick } from './ui.js';
import { formatBytes, $ } from './util.js';

const SEED_URL = './data/library.json';

// ---------------------------------------------------------------------------
// Theme

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
}

function initTheme() {
  applyTheme(loadSettings().theme);
  $('#btn-theme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    saveSettings({ theme: next });
  });
}

// ---------------------------------------------------------------------------
// Seed bundled videos from data/library.json (once per id, so user deletions stick)

async function seedLibrary() {
  let entries;
  try {
    const res = await fetch(SEED_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    entries = await res.json();
  } catch (err) {
    console.warn('Could not load seed library:', err);
    return;
  }
  if (!Array.isArray(entries)) return;

  const seeded = getSeededIds();
  const existing = new Set((await getAllVideos()).map((v) => v.id));
  const added = [];
  const base = Date.now() - entries.length * 1000;

  for (const [i, entry] of entries.entries()) {
    if (!entry?.id || !entry.url || seeded.has(entry.id) || existing.has(entry.id)) continue;

    // Seed entries may be direct files (absolute or relative like ./assets/videos/clip.mp4)
    // or links to any supported embed provider. Embed links play in the iframe player like "online" videos do.
    const embed = makeEmbed(parseVideoUrl(entry.url));

    const record = {
      id: entry.id,
      title: entry.title || entry.id,
      source: 'bundled',
      url: entry.url,
      embed,
      blob: null,
      mimeType: embed ? null : entry.mimeType || null,
      size: null,
      duration: Number.isFinite(entry.duration) ? entry.duration : null,
      thumbnail: entry.thumbnail || (embed ? embedThumbnail(embed) : null),
      addedAt: base + i * 1000, // keep the JSON order as "oldest first"
      lastPosition: 0,
    };
    try {
      await addVideo(record);
      added.push(entry.id);
    } catch (err) {
      console.warn('Seed insert failed for', entry.id, err);
    }
  }
  if (added.length) addSeededIds(added);
  // Remember every seed id, even ones that already existed, so they are never re-added.
  addSeededIds(entries.map((e) => e.id).filter(Boolean));
}

// ---------------------------------------------------------------------------
// Storage meter

async function updateStorageMeter() {
  const label = $('#storage-label');
  if (!navigator.storage?.estimate) {
    label.textContent = '';
    return;
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) {
      label.textContent = `Storage used: ${formatBytes(usage)}`;
      return;
    }
    const pct = (usage / quota) * 100;
    label.textContent = `Storage: ${formatBytes(usage)} of ~${formatBytes(quota)} (${pct < 1 ? '<1' : Math.round(pct)}%)`;
    if (pct > 90) toast('Browser storage is almost full. Delete some uploaded videos to free space.', 'warning', 6000);
  } catch {
    label.textContent = '';
  }
}

// ---------------------------------------------------------------------------
// Hash routing: #video=<id> opens that video directly

function hashVideoId() {
  const match = location.hash.match(/^#video=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setHash(id) {
  const url = id ? `#video=${encodeURIComponent(id)}` : location.pathname + location.search;
  history.replaceState(null, '', url);
}

async function playById(id) {
  const record = getVideoById(id);
  if (!record) {
    toast('That video is not in this library.', 'warning');
    setHash(null);
    return;
  }
  setHash(id);
  await openVideo(record);
}

function routeFromHash() {
  const id = hashVideoId();
  if (id) playById(id);
  else if (playerIsOpen()) closePlayer();
}

// ---------------------------------------------------------------------------
// Boot

async function main() {
  initTheme();

  try {
    await openDB();
  } catch (err) {
    toast(`Storage unavailable: ${err.message}`, 'error', 8000);
    return;
  }

  await seedLibrary();

  initLibrary({
    grid: $('#library'),
    emptyState: $('#empty-state'),
    emptyTitle: $('#empty-title'),
    emptyText: $('#empty-text'),
    countLabel: $('#count-label'),
    search: $('#search'),
    filterSource: $('#filter-source'),
    sortOrder: $('#sort-order'),
    onPlay: playById,
    onChange: updateStorageMeter,
  });

  initPlayer(
    {
      dialog: $('#player-dialog'),
      stage: $('#player-stage'),
      video: $('#player-video'),
      iframe: $('#player-iframe'),
      controls: $('#player-controls'),
      title: $('#player-title'),
      closeBtn: $('#player-close'),
      playBtn: $('#btn-play'),
      muteBtn: $('#btn-mute'),
      pipBtn: $('#btn-pip'),
      fullscreenBtn: $('#btn-fullscreen'),
      seek: $('#seek'),
      seekBuffered: $('#seek-buffered'),
      volume: $('#volume'),
      speed: $('#speed'),
      timeCurrent: $('#time-current'),
      timeDuration: $('#time-duration'),
      hint: $('#player-hint'),
    },
    {
      onClose: () => {
        if (hashVideoId()) setHash(null);
        refreshLibrary(); // pick up updated duration / resume position
      },
    }
  );

  const uploadDialog = $('#upload-dialog');
  initUpload({
    dialog: uploadDialog,
    fileInput: $('#file-input'),
    browseBtn: $('#btn-browse'),
    dropZone: $('#drop-zone'),
    dropTarget: $('#drop-target'),
    dropOverlay: $('#drop-overlay'),
    list: $('#upload-list'),
    onAdded: refreshLibrary,
  });
  uploadDialog.addEventListener('close', () => {
    $('#upload-list').innerHTML = '';
  });

  const urlDialog = $('#url-dialog');
  initUrlDialog({
    dialog: urlDialog,
    form: $('#url-form'),
    input: $('#url-input'),
    titleInput: $('#url-title'),
    hint: $('#url-hint'),
    submit: $('#url-submit'),
    onAdded: refreshLibrary,
  });

  // Open buttons (header + empty state)
  const openDialog = (dialog) => {
    dialog.showModal();
    const first = dialog.querySelector('input:not([type=hidden]), [tabindex="0"]');
    first?.focus();
  };
  $('#btn-upload').addEventListener('click', () => openDialog(uploadDialog));
  $('#btn-add-url').addEventListener('click', () => openDialog(urlDialog));
  document.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => openDialog($(`#${btn.dataset.open}`)));
  });
  [uploadDialog, urlDialog].forEach(closeOnBackdropClick);

  // Global shortcuts when no dialog is open
  document.addEventListener('keydown', (event) => {
    if (document.querySelector('dialog[open]')) return;
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (event.key === '/') {
      event.preventDefault();
      $('#search').focus();
    } else if (event.key === 'u' || event.key === 'U') {
      openDialog(uploadDialog);
    } else if (event.key === 'a' || event.key === 'A') {
      openDialog(urlDialog);
    }
  });

  await refreshLibrary();
  await updateStorageMeter();

  routeFromHash();
  window.addEventListener('hashchange', routeFromHash);
}

main().catch((err) => {
  console.error(err);
  toast(`Something went wrong while starting the app: ${err.message}`, 'error', 8000);
});
