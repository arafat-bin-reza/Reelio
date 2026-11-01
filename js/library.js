// Library state and grid rendering: search, filter, sort, rename, delete.

import { getAllVideos, deleteVideo as dbDeleteVideo, updateVideo } from './db.js';
import { formatTime, formatBytes, formatDate, escapeHtml, debounce } from './util.js';
import { toast, confirmDialog, promptDialog } from './ui.js';

const PLACEHOLDER = './assets/thumbs/placeholder.svg';
const SOURCE_LABEL = { bundled: 'Bundled', upload: 'Uploaded', online: 'Online' };

const PLAY_SVG =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

const state = {
  videos: [],
  query: '',
  source: 'all',
  sort: 'newest',
};

const thumbUrls = new Map(); // id -> object URL for Blob thumbnails
let els = null;
let onPlay = () => {};
let onChange = () => {};

export function initLibrary(options) {
  els = {
    grid: options.grid,
    emptyState: options.emptyState,
    emptyTitle: options.emptyTitle,
    emptyText: options.emptyText,
    countLabel: options.countLabel,
    search: options.search,
    filterSource: options.filterSource,
    sortOrder: options.sortOrder,
  };
  onPlay = options.onPlay || onPlay;
  onChange = options.onChange || onChange;

  els.search.addEventListener(
    'input',
    debounce(() => {
      state.query = els.search.value.trim().toLowerCase();
      render();
    }, 150)
  );
  els.filterSource.addEventListener('change', () => {
    state.source = els.filterSource.value;
    render();
  });
  els.sortOrder.addEventListener('change', () => {
    state.sort = els.sortOrder.value;
    render();
  });

  // Event delegation for play / rename / delete.
  els.grid.addEventListener('click', (event) => {
    const card = event.target.closest('.card');
    if (!card) return;
    const id = card.dataset.id;
    const actionBtn = event.target.closest('[data-action]');
    if (actionBtn) {
      handleAction(actionBtn.dataset.action, id);
      return;
    }
    if (event.target.closest('.card-thumb') || event.target.closest('.card-title')) {
      onPlay(id);
    }
  });

  // Fallback to the placeholder when a thumbnail URL fails to load.
  els.grid.addEventListener(
    'error',
    (event) => {
      const img = event.target;
      if (img.tagName === 'IMG' && img.src !== new URL(PLACEHOLDER, location.href).href) {
        img.src = PLACEHOLDER;
      }
    },
    true
  );
}

export async function refreshLibrary() {
  state.videos = await getAllVideos();
  // Drop object URLs for records that no longer exist.
  for (const [id, url] of thumbUrls) {
    if (!state.videos.some((v) => v.id === id)) {
      URL.revokeObjectURL(url);
      thumbUrls.delete(id);
    }
  }
  render();
  onChange(state.videos);
}

export function getVideoById(id) {
  return state.videos.find((v) => v.id === id) || null;
}

export function getVideos() {
  return state.videos.slice();
}

function thumbSrc(video) {
  const thumb = video.thumbnail;
  if (!thumb) return PLACEHOLDER;
  if (typeof thumb === 'string') return thumb;
  if (thumb instanceof Blob) {
    if (!thumbUrls.has(video.id)) thumbUrls.set(video.id, URL.createObjectURL(thumb));
    return thumbUrls.get(video.id);
  }
  return PLACEHOLDER;
}

function visibleVideos() {
  let list = state.videos;
  if (state.source !== 'all') list = list.filter((v) => v.source === state.source);
  if (state.query) list = list.filter((v) => (v.title || '').toLowerCase().includes(state.query));

  const sorted = list.slice();
  switch (state.sort) {
    case 'oldest':
      sorted.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
      break;
    case 'title':
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
      break;
    case 'duration':
      sorted.sort((a, b) => (b.duration ?? -1) - (a.duration ?? -1));
      break;
    case 'newest':
    default:
      sorted.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
  return sorted;
}

function metaLine(video) {
  const parts = [];
  if (video.source === 'online' && video.embed) parts.push(video.embed.provider === 'youtube' ? 'YouTube' : 'Vimeo');
  if (video.size) parts.push(formatBytes(video.size));
  if (video.addedAt) parts.push(formatDate(video.addedAt));
  return parts.join(' · ');
}

function cardHtml(video) {
  const title = escapeHtml(video.title || 'Untitled');
  const duration = video.duration ? `<span class="card-duration">${formatTime(video.duration)}</span>` : '';
  const badgeClass = `badge badge-${video.source}`;
  const badge = SOURCE_LABEL[video.source] || video.source;

  return `
    <article class="card" data-id="${escapeHtml(video.id)}">
      <button class="card-thumb" type="button" aria-label="Play ${title}">
        <img src="${escapeHtml(thumbSrc(video))}" alt="" loading="lazy" decoding="async">
        <span class="${badgeClass}">${badge}</span>
        ${duration}
        <span class="play-icon">${PLAY_SVG}</span>
      </button>
      <div class="card-body">
        <h3 class="card-title" title="${title}">${title}</h3>
        <div class="card-meta">${escapeHtml(metaLine(video))}</div>
        <div class="card-actions">
          <button class="btn btn-sm" type="button" data-action="rename">Rename</button>
          <button class="btn btn-sm btn-danger" type="button" data-action="delete">Delete</button>
        </div>
      </div>
    </article>`;
}

function render() {
  const list = visibleVideos();
  els.grid.innerHTML = list.map(cardHtml).join('');

  const total = state.videos.length;
  const hasFilters = state.query || state.source !== 'all';
  els.countLabel.textContent =
    total === 0 ? '' : hasFilters ? `${list.length} of ${total} video${total === 1 ? '' : 's'}` : `${total} video${total === 1 ? '' : 's'}`;

  const showEmpty = list.length === 0;
  els.emptyState.classList.toggle('hidden', !showEmpty);
  els.grid.classList.toggle('hidden', showEmpty);
  if (showEmpty) {
    if (total === 0) {
      els.emptyTitle.textContent = 'No videos yet';
      els.emptyText.textContent = 'Upload a video from your device or add one by URL to get started.';
    } else {
      els.emptyTitle.textContent = 'No matches';
      els.emptyText.textContent = 'Try a different search or clear the source filter.';
    }
  }
}

async function handleAction(action, id) {
  const video = getVideoById(id);
  if (!video) return;

  if (action === 'rename') {
    const title = await promptDialog({ title: 'Rename video', label: 'New title', value: video.title || '' });
    if (!title || title === video.title) return;
    try {
      await updateVideo(id, { title });
      await refreshLibrary();
      toast('Title updated.', 'success');
    } catch (err) {
      toast(`Could not rename: ${err.message}`, 'error');
    }
    return;
  }

  if (action === 'delete') {
    const note = video.source === 'upload' ? ' The uploaded file will be removed from this browser.' : '';
    const ok = await confirmDialog({
      title: 'Delete video?',
      message: `"${video.title}" will be removed from your library.${note}`,
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await dbDeleteVideo(id);
      await refreshLibrary();
      toast('Video deleted.', 'success');
    } catch (err) {
      toast(`Could not delete: ${err.message}`, 'error');
    }
  }
}
