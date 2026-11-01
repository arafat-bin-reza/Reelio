// Online videos: URL parsing, YouTube / Vimeo embed support, and the "Add URL" dialog.

import { addVideo } from './db.js';
import { probeMedia } from './media.js';
import { uuid, debounce } from './util.js';
import { toast, wireCloseButtons } from './ui.js';

const YOUTUBE_RE =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
const VIMEO_RE = /vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d+)/i;
const DIRECT_EXT_RE = /\.(mp4|m4v|webm|ogv|ogg|mov)(\?.*)?$/i;

/**
 * Parse user input into one of:
 *   { kind: 'embed',  provider: 'youtube'|'vimeo', videoId }
 *   { kind: 'direct', url }
 *   null when the input is not an http(s) URL
 */
export function parseVideoUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const yt = text.match(YOUTUBE_RE);
  if (yt) return { kind: 'embed', provider: 'youtube', videoId: yt[1] };

  const vm = text.match(VIMEO_RE);
  if (vm) return { kind: 'embed', provider: 'vimeo', videoId: vm[1] };

  return { kind: 'direct', url: url.href, looksLikeVideo: DIRECT_EXT_RE.test(url.pathname) };
}

export function embedUrl(embed, { autoplay = true } = {}) {
  if (!embed) return '';
  const auto = autoplay ? 1 : 0;
  if (embed.provider === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(embed.videoId)}?autoplay=${auto}&rel=0&modestbranding=1`;
  }
  if (embed.provider === 'vimeo') {
    return `https://player.vimeo.com/video/${encodeURIComponent(embed.videoId)}?autoplay=${auto}`;
  }
  return '';
}

export function embedThumbnail(embed) {
  if (embed?.provider === 'youtube') return `https://img.youtube.com/vi/${embed.videoId}/hqdefault.jpg`;
  return null; // Vimeo thumbnails need an API call; the placeholder is used instead.
}

export function describeUrl(parsed) {
  if (!parsed) return { text: 'Enter a full http(s) link.', ok: false };
  if (parsed.kind === 'embed') {
    return { text: `${parsed.provider === 'youtube' ? 'YouTube' : 'Vimeo'} video detected – it will play in an embedded player.`, ok: true };
  }
  return parsed.looksLikeVideo
    ? { text: 'Direct video file detected.', ok: true }
    : { text: 'Will be treated as a direct video link. Make sure it points to an MP4/WebM file, not a web page.', ok: true };
}

export async function buildOnlineRecord(raw, title) {
  const parsed = parseVideoUrl(raw);
  if (!parsed) throw new Error('Please enter a valid http(s) URL.');

  const record = {
    id: uuid(),
    title: (title || '').trim(),
    source: 'online',
    url: null,
    embed: null,
    blob: null,
    mimeType: null,
    size: null,
    duration: null,
    thumbnail: null,
    addedAt: Date.now(),
    lastPosition: 0,
  };

  if (parsed.kind === 'embed') {
    record.embed = { provider: parsed.provider, videoId: parsed.videoId };
    record.url = String(raw).trim();
    record.thumbnail = embedThumbnail(record.embed);
    if (!record.title) record.title = `${parsed.provider === 'youtube' ? 'YouTube' : 'Vimeo'} video ${parsed.videoId}`;
    return record;
  }

  record.url = parsed.url;
  if (!record.title) {
    try {
      const name = decodeURIComponent(new URL(parsed.url).pathname.split('/').pop() || '');
      record.title = name.replace(/\.[a-z0-9]+$/i, '') || parsed.url;
    } catch {
      record.title = parsed.url;
    }
  }

  // Try to read duration + thumbnail. First with CORS (allows canvas capture); if the host
  // rejects that, retry without CORS to at least get the duration.
  let probe = await probeMedia(parsed.url, { crossOrigin: true, timeoutMs: 10000 });
  if (probe.errored) probe = await probeMedia(parsed.url, { crossOrigin: false, timeoutMs: 10000 });
  if (probe.errored && !parsed.looksLikeVideo) {
    throw new Error('This link does not appear to be a playable video file.');
  }
  record.duration = probe.duration;
  record.thumbnail = probe.thumbnail;
  return record;
}

/** Wire up the "Add online video" dialog. */
export function initUrlDialog({ dialog, form, input, titleInput, hint, submit, onAdded }) {
  wireCloseButtons(dialog);

  const updateHint = () => {
    const value = input.value.trim();
    if (!value) {
      hint.textContent = '';
      hint.className = 'muted url-hint';
      return;
    }
    const info = describeUrl(parseVideoUrl(value));
    hint.textContent = info.text;
    hint.className = `muted url-hint ${info.ok ? 'ok' : 'err'}`;
  };
  input.addEventListener('input', debounce(updateHint, 120));

  dialog.addEventListener('close', () => {
    form.reset();
    hint.textContent = '';
    hint.className = 'muted url-hint';
    submit.disabled = false;
    submit.textContent = 'Add video';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const raw = input.value.trim();
    if (!parseVideoUrl(raw)) {
      updateHint();
      input.focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Checking…';
    try {
      const record = await buildOnlineRecord(raw, titleInput.value);
      await addVideo(record);
      toast(`Added "${record.title}".`, 'success');
      dialog.close();
      await onAdded(record);
    } catch (err) {
      toast(err.message || 'Could not add this video.', 'error');
      submit.disabled = false;
      submit.textContent = 'Add video';
    }
  });
}
