// Video player: custom controls over a <video>, or an <iframe> for embedded providers (YouTube, Vimeo, TikTok, ...).

import { updateVideo } from './db.js';
import { loadSettings, saveSettings, setLastVideoId } from './storage.js';
import { formatTime, throttle } from './util.js';
import { toast } from './ui.js';
import { embedUrl, isPortraitEmbed } from './online.js';

const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>',
  volumeLow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
  muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m23 9-6 6M17 9l6 6"/></svg>',
  pip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="11" width="8" height="6" rx="1" fill="currentColor"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  exitFullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>',
};

const SEEK_STEP = 5; // seconds
const VOLUME_STEP = 0.1;
const RESUME_MIN = 5; // only resume if more than 5 s in and more than 5 s from the end
const CONTROLS_HIDE_MS = 2500;

let els = null;
let current = null; // record being played
let objectUrl = null;
let scrubbing = false;
let hideTimer = null;
let onClose = () => {};

export function initPlayer(elements, options = {}) {
  els = elements;
  onClose = options.onClose || onClose;
  const { video, dialog, stage } = els;

  els.playBtn.innerHTML = ICON.play;
  els.muteBtn.innerHTML = ICON.volume;
  els.pipBtn.innerHTML = ICON.pip;
  els.fullscreenBtn.innerHTML = ICON.fullscreen;
  if (!document.pictureInPictureEnabled) els.pipBtn.disabled = true;

  // --- Buttons
  els.playBtn.addEventListener('click', togglePlay);
  els.muteBtn.addEventListener('click', toggleMute);
  els.pipBtn.addEventListener('click', togglePip);
  els.fullscreenBtn.addEventListener('click', toggleFullscreen);
  els.closeBtn.addEventListener('click', () => dialog.close());

  // --- Seek
  els.seek.addEventListener('pointerdown', () => { scrubbing = true; });
  els.seek.addEventListener('input', () => {
    scrubbing = true;
    els.timeCurrent.textContent = formatTime(Number(els.seek.value));
    paintRange(els.seek);
  });
  els.seek.addEventListener('change', () => {
    video.currentTime = Number(els.seek.value);
    scrubbing = false;
  });
  els.seek.addEventListener('pointerup', () => { scrubbing = false; });

  // --- Volume & speed
  els.volume.addEventListener('input', () => {
    video.volume = Number(els.volume.value);
    video.muted = video.volume === 0;
  });
  els.speed.addEventListener('change', () => {
    video.playbackRate = Number(els.speed.value);
    saveSettings({ playbackRate: video.playbackRate });
  });

  // --- Video events
  video.addEventListener('play', () => { els.playBtn.innerHTML = ICON.pause; els.playBtn.setAttribute('aria-label', 'Pause'); scheduleHide(); });
  video.addEventListener('pause', () => { els.playBtn.innerHTML = ICON.play; els.playBtn.setAttribute('aria-label', 'Play'); showControls(); savePosition.flush?.(); });
  video.addEventListener('loadedmetadata', onLoadedMetadata);
  video.addEventListener('durationchange', updateDuration);
  video.addEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('progress', updateBuffered);
  video.addEventListener('volumechange', onVolumeChange);
  video.addEventListener('ended', onEnded);
  video.addEventListener('error', () => {
    if (!current) return;
    toast('This video could not be played. The file may be missing, blocked by the host, or in an unsupported format.', 'error', 6000);
  });
  video.addEventListener('click', togglePlay);
  video.addEventListener('dblclick', toggleFullscreen);

  // --- Auto-hide controls
  stage.addEventListener('pointermove', showControls);
  stage.addEventListener('pointerleave', () => { if (!video.paused) hideControls(); });
  els.controls.addEventListener('focusin', showControls);

  // --- Fullscreen state
  document.addEventListener('fullscreenchange', () => {
    const fs = document.fullscreenElement === stage;
    els.fullscreenBtn.innerHTML = fs ? ICON.exitFullscreen : ICON.fullscreen;
    els.fullscreenBtn.setAttribute('aria-label', fs ? 'Exit fullscreen' : 'Fullscreen');
  });

  // --- Keyboard shortcuts while the dialog is open
  dialog.addEventListener('keydown', onKeydown);

  // --- Cleanup when the dialog closes (close button, Escape, or programmatic)
  dialog.addEventListener('close', cleanup);
}

export function isOpen() {
  return !!els?.dialog.open;
}

export async function openVideo(record) {
  if (!record) return;
  const { dialog, video, iframe, stage } = els;
  if (dialog.open) cleanup({ keepOpen: true });

  current = record;
  els.title.textContent = record.title || 'Untitled';
  setLastVideoId(record.id);

  if (record.embed) {
    stage.classList.add('mode-embed');
    stage.classList.toggle('mode-portrait', isPortraitEmbed(record.embed));
    stage.classList.remove('controls-hidden');
    video.hidden = true;
    iframe.hidden = false;
    iframe.src = embedUrl(record.embed, { autoplay: true });
    els.hint.hidden = true;
  } else {
    stage.classList.remove('mode-embed', 'mode-portrait');
    iframe.hidden = true;
    iframe.src = '';
    video.hidden = false;
    els.hint.hidden = false;
    applySettings();

    let src = record.url;
    if (record.blob instanceof Blob) {
      objectUrl = URL.createObjectURL(record.blob);
      src = objectUrl;
    }
    if (!src) {
      toast('This video has no playable source.', 'error');
      return;
    }
    resetControls();
    video.src = src;
    video.load();
  }

  if (!dialog.open) dialog.showModal();
  stage.focus({ preventScroll: true });

  if (!record.embed) {
    try {
      await video.play();
    } catch {
      /* Autoplay may be blocked; the user can press play. */
    }
  }
}

export function closePlayer() {
  if (els?.dialog.open) els.dialog.close();
}

// ---------------------------------------------------------------------------

function applySettings() {
  const s = loadSettings();
  const { video } = els;
  video.volume = Math.min(1, Math.max(0, Number(s.volume) || 0));
  video.muted = !!s.muted;
  video.playbackRate = Number(s.playbackRate) || 1;
  els.speed.value = String(video.playbackRate);
  if (![...els.speed.options].some((o) => o.value === els.speed.value)) els.speed.value = '1';
  onVolumeChange();
}

function resetControls() {
  els.seek.value = '0';
  els.seek.max = '100';
  paintRange(els.seek);
  els.seekBuffered.style.width = '0%';
  els.timeCurrent.textContent = '0:00';
  els.timeDuration.textContent = formatTime(current?.duration || 0);
}

function onLoadedMetadata() {
  const { video } = els;
  // WebM files produced by MediaRecorder (screen recordings etc.) report an infinite duration
  // until the browser is forced to scan to the end. Seek far ahead once, then jump back.
  if (video.duration === Infinity) {
    video.addEventListener(
      'durationchange',
      () => {
        if (Number.isFinite(video.duration)) {
          video.currentTime = 0;
          onLoadedMetadata();
        }
      },
      { once: true }
    );
    video.currentTime = 1e101;
    return;
  }
  updateDuration();
  if (current && !current.embed && Number.isFinite(video.duration)) {
    const pos = Number(current.lastPosition) || 0;
    if (pos > RESUME_MIN && pos < video.duration - RESUME_MIN) {
      video.currentTime = pos;
      toast(`Resumed from ${formatTime(pos)}.`, 'info', 2500);
    }
    // Persist a freshly discovered duration so the library shows it.
    if (!current.duration && video.duration) {
      current.duration = video.duration;
      updateVideo(current.id, { duration: video.duration }).catch(() => {});
    }
  }
}

function updateDuration() {
  const d = els.video.duration;
  if (Number.isFinite(d) && d > 0) {
    els.seek.max = String(d);
    els.timeDuration.textContent = formatTime(d);
  }
}

function onTimeUpdate() {
  const { video } = els;
  if (!scrubbing) {
    els.seek.value = String(video.currentTime);
    paintRange(els.seek);
    els.timeCurrent.textContent = formatTime(video.currentTime);
  }
  updateBuffered(); // small files can finish loading before any 'progress' event is observed
  savePosition(video.currentTime);
}

const savePosition = throttle((time) => {
  if (!current || current.embed) return;
  const rounded = Math.floor(time);
  if (rounded === Math.floor(current.lastPosition || 0)) return;
  current.lastPosition = rounded;
  updateVideo(current.id, { lastPosition: rounded }).catch(() => {});
}, 5000);

function updateBuffered() {
  const { video } = els;
  if (!video.duration || !video.buffered.length) return;
  const end = video.buffered.end(video.buffered.length - 1);
  els.seekBuffered.style.width = `${Math.min(100, (end / video.duration) * 100)}%`;
}

function onVolumeChange() {
  const { video } = els;
  const effective = video.muted ? 0 : video.volume;
  els.volume.value = String(effective);
  paintRange(els.volume);
  els.muteBtn.innerHTML = effective === 0 ? ICON.muted : effective < 0.5 ? ICON.volumeLow : ICON.volume;
  els.muteBtn.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
  saveSettings({ volume: video.volume, muted: video.muted });
}

function onEnded() {
  if (current && !current.embed) {
    current.lastPosition = 0;
    updateVideo(current.id, { lastPosition: 0 }).catch(() => {});
  }
  showControls();
}

function paintRange(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 0;
  const value = Number(input.value) || 0;
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  input.style.setProperty('--fill', `${pct}%`);
}

function togglePlay() {
  const { video } = els;
  if (!current || current.embed) return;
  if (video.paused) video.play().catch(() => {});
  else video.pause();
}

function toggleMute() {
  const { video } = els;
  video.muted = !video.muted;
  if (!video.muted && video.volume === 0) video.volume = 0.5;
}

async function togglePip() {
  const { video } = els;
  if (!document.pictureInPictureEnabled || current?.embed) return;
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture();
  } catch {
    toast('Picture-in-picture is not available for this video.', 'warning');
  }
}

async function toggleFullscreen() {
  const { stage } = els;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stage.requestFullscreen();
  } catch {
    toast('Fullscreen is not available.', 'warning');
  }
}

function seekBy(delta) {
  const { video } = els;
  if (!Number.isFinite(video.duration)) return;
  video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + delta));
}

function changeVolume(delta) {
  const { video } = els;
  video.volume = Math.min(1, Math.max(0, +(video.volume + delta).toFixed(2)));
  video.muted = video.volume === 0;
}

function onKeydown(event) {
  if (!current || current.embed) return;
  const tag = event.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;

  let handled = true;
  switch (event.key) {
    case ' ':
    case 'k':
    case 'K':
      togglePlay();
      break;
    case 'ArrowLeft':
    case 'j':
    case 'J':
      seekBy(-SEEK_STEP);
      break;
    case 'ArrowRight':
    case 'l':
    case 'L':
      seekBy(SEEK_STEP);
      break;
    case 'ArrowUp':
      changeVolume(VOLUME_STEP);
      break;
    case 'ArrowDown':
      changeVolume(-VOLUME_STEP);
      break;
    case 'm':
    case 'M':
      toggleMute();
      break;
    case 'f':
    case 'F':
      toggleFullscreen();
      break;
    case 'p':
    case 'P':
      togglePip();
      break;
    case 'Home':
      els.video.currentTime = 0;
      break;
    case 'End':
      if (Number.isFinite(els.video.duration)) els.video.currentTime = els.video.duration;
      break;
    default:
      handled = false;
  }
  if (handled) {
    event.preventDefault();
    showControls();
  }
}

function showControls() {
  els.stage.classList.remove('controls-hidden');
  scheduleHide();
}

function hideControls() {
  clearTimeout(hideTimer);
  if (els.video.paused || current?.embed) return;
  els.stage.classList.add('controls-hidden');
}

function scheduleHide() {
  clearTimeout(hideTimer);
  if (els.video.paused || current?.embed) return;
  hideTimer = setTimeout(hideControls, CONTROLS_HIDE_MS);
}

function cleanup({ keepOpen = false } = {}) {
  const { video, iframe, stage } = els;
  clearTimeout(hideTimer);
  if (current && !current.embed && !video.ended) {
    const pos = Math.floor(video.currentTime || 0);
    if (pos > 0) updateVideo(current.id, { lastPosition: pos }).catch(() => {});
  }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});

  video.pause();
  video.removeAttribute('src');
  video.load();
  iframe.src = '';
  iframe.hidden = true;
  stage.classList.remove('controls-hidden', 'mode-embed', 'mode-portrait');

  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  const closed = current;
  current = null;
  if (!keepOpen) onClose(closed);
}
