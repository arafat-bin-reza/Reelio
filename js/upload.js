// Upload from device: file picker, drag-and-drop, validation, thumbnail generation, IndexedDB save.

import { addVideo, isQuotaError } from './db.js';
import { probeMedia } from './media.js';
import { uuid, formatBytes, escapeHtml } from './util.js';
import { toast, confirmDialog, wireCloseButtons } from './ui.js';

const WARN_BYTES = 500 * 1024 * 1024; // warn above 500 MB
const EXT_MIME = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
};

let persistRequested = false;

function guessMime(file) {
  if (file.type && file.type.startsWith('video/')) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return EXT_MIME[ext] || '';
}

function canPlay(mime) {
  if (!mime) return false;
  const probe = document.createElement('video');
  return probe.canPlayType(mime) !== '';
}

async function hasRoomFor(bytes) {
  if (!navigator.storage?.estimate) return true;
  try {
    const { quota = 0, usage = 0 } = await navigator.storage.estimate();
    if (!quota) return true;
    return quota - usage > bytes * 1.05; // small margin for the thumbnail and metadata
  } catch {
    return true;
  }
}

async function requestPersistence() {
  if (persistRequested || !navigator.storage?.persist) return;
  persistRequested = true;
  try {
    await navigator.storage.persist();
  } catch {
    /* ignore */
  }
}

async function processFile(file) {
  const mimeType = guessMime(file);
  if (!mimeType) throw new Error('Not a video file.');

  if (!canPlay(mimeType)) {
    const proceed = await confirmDialog({
      title: 'Format may not play',
      message: `"${file.name}" (${mimeType}) may not be playable in this browser. Save it anyway?`,
      okText: 'Save anyway',
    });
    if (!proceed) throw new Error('Skipped.');
  }

  if (file.size > WARN_BYTES) {
    const proceed = await confirmDialog({
      title: 'Large file',
      message: `"${file.name}" is ${formatBytes(file.size)}. Large files take longer to save and use a lot of browser storage. Continue?`,
      okText: 'Continue',
    });
    if (!proceed) throw new Error('Skipped.');
  }

  if (!(await hasRoomFor(file.size))) {
    throw new Error('Not enough browser storage space for this file.');
  }

  await requestPersistence();

  const objectUrl = URL.createObjectURL(file);
  let probe;
  try {
    probe = await probeMedia(objectUrl, { timeoutMs: 20000 });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const record = {
    id: uuid(),
    title: file.name.replace(/\.[a-z0-9]+$/i, '') || file.name,
    source: 'upload',
    url: null,
    embed: null,
    blob: file,
    mimeType,
    size: file.size,
    duration: probe.duration,
    thumbnail: probe.thumbnail,
    addedAt: Date.now(),
    lastPosition: 0,
  };

  try {
    await addVideo(record);
  } catch (err) {
    if (isQuotaError(err)) throw new Error('Browser storage quota exceeded.');
    throw err;
  }
  return record;
}

export function initUpload({ dialog, fileInput, browseBtn, dropZone, dropTarget, dropOverlay, list, onAdded }) {
  wireCloseButtons(dialog);

  const openPicker = () => fileInput.click();
  browseBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    openPicker();
  });
  dropZone.addEventListener('click', openPicker);
  dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  });

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = '';
    if (files.length) handleFiles(files);
  });

  // Drop zone inside the dialog.
  ['dragenter', 'dragover'].forEach((type) =>
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((type) =>
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.remove('dragover');
    })
  );
  dropZone.addEventListener('drop', (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) handleFiles(files);
  });

  // Whole-page drop: show an overlay while dragging files anywhere over the window.
  let dragDepth = 0;
  const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

  window.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    dragDepth += 1;
    dropOverlay.hidden = false;
  });
  window.addEventListener('dragover', (event) => {
    if (hasFiles(event)) event.preventDefault();
  });
  window.addEventListener('dragleave', (event) => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlay.hidden = true;
  });
  window.addEventListener('drop', (event) => {
    dragDepth = 0;
    dropOverlay.hidden = true;
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.target.closest && event.target.closest('#drop-zone')) return; // handled above
    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length) return;
    if (!dialog.open) dialog.showModal();
    handleFiles(files);
  });

  async function handleFiles(files) {
    const videos = files.filter((f) => guessMime(f));
    const rejected = files.length - videos.length;
    if (rejected > 0) toast(`${rejected} file${rejected === 1 ? ' is' : 's are'} not video files and were skipped.`, 'warning');
    if (!videos.length) return;

    for (const file of videos) {
      const item = document.createElement('li');
      item.className = 'upload-item';
      item.innerHTML = `<span class="spinner" aria-hidden="true"></span><span class="name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span><span class="status">Processing…</span>`;
      list.prepend(item);
      const status = item.querySelector('.status');
      const spinner = item.querySelector('.spinner');

      try {
        const record = await processFile(file);
        item.classList.add('done');
        spinner.remove();
        status.textContent = `Saved · ${formatBytes(file.size)}`;
        await onAdded(record);
      } catch (err) {
        item.classList.add('error');
        spinner.remove();
        status.textContent = err.message === 'Skipped.' ? 'Skipped' : `Failed: ${err.message}`;
        if (err.message !== 'Skipped.') toast(`"${file.name}": ${err.message}`, 'error');
      }
    }
  }
}
