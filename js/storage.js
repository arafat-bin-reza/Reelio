// localStorage helpers for small user preferences. Video data itself lives in IndexedDB (see db.js).

const SETTINGS_KEY = 'vp:settings';
const LAST_VIDEO_KEY = 'vp:lastVideoId';
const SEEDED_KEY = 'vp:seededIds';

const DEFAULT_SETTINGS = Object.freeze({
  volume: 1,
  muted: false,
  playbackRate: 1,
  theme: 'dark',
});

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode); ignore */
  }
}

export function loadSettings() {
  const stored = read(SETTINGS_KEY, {});
  return { ...DEFAULT_SETTINGS, ...(stored && typeof stored === 'object' ? stored : {}) };
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  write(SETTINGS_KEY, next);
  return next;
}

export function getLastVideoId() {
  return read(LAST_VIDEO_KEY, null);
}

export function setLastVideoId(id) {
  write(LAST_VIDEO_KEY, id);
}

export function getSeededIds() {
  const ids = read(SEEDED_KEY, []);
  return new Set(Array.isArray(ids) ? ids : []);
}

export function addSeededIds(ids) {
  const set = getSeededIds();
  ids.forEach((id) => set.add(id));
  write(SEEDED_KEY, [...set]);
}
