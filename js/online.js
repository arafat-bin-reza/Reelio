// Online videos: URL parsing, embed support (YouTube, Vimeo, TikTok, Facebook, Instagram,
// Google Drive) and the "Add URL" dialog.

import { addVideo } from './db.js';
import { probeMedia } from './media.js';
import { uuid, debounce } from './util.js';
import { toast, wireCloseButtons } from './ui.js';

/**
 * Embed providers. Each has a human label, a regex whose first capture group is the video id,
 * an `embed(embed, autoplay)` builder for the iframe src, and optionally `thumbnail(embed)`.
 * `portrait` providers get a 9:16 stage in the player.
 * Facebook additionally keeps the canonical page URL in `embed.href` because its plugin
 * embeds by URL, not by id (and reels / videos use different paths).
 */
const PROVIDERS = {
  youtube: {
    label: 'YouTube',
    re: /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
    embed: (e, auto) =>
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(e.videoId)}?autoplay=${auto ? 1 : 0}&rel=0&modestbranding=1`,
    thumbnail: (e) => `https://img.youtube.com/vi/${e.videoId}/hqdefault.jpg`,
  },
  vimeo: {
    label: 'Vimeo',
    re: /vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d+)/i,
    embed: (e, auto) => `https://player.vimeo.com/video/${encodeURIComponent(e.videoId)}?autoplay=${auto ? 1 : 0}`,
    // Vimeo thumbnails need an API call; the placeholder is used instead.
  },
  tiktok: {
    label: 'TikTok',
    re: /tiktok\.com\/(?:@[\w.-]+\/video|embed(?:\/v2)?|v)\/(\d+)/i,
    embed: (e) => `https://www.tiktok.com/embed/v2/${encodeURIComponent(e.videoId)}`,
    portrait: true,
    // TikTok's oEmbed thumbnails are short-lived signed CDN URLs, so they are not stored.
  },
  facebook: {
    label: 'Facebook',
    re: /(?:facebook\.com|fb\.com)\/(?:[^?#]*\/videos\/(?:[^/?#]+\/)?|watch\/?\?(?:.*&)?v=|video\.php\?(?:.*&)?v=|reel\/)(\d+)/i,
    embed: (e, auto) =>
      `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(e.href || `https://www.facebook.com/watch/?v=${e.videoId}`)}&show_text=false&autoplay=${auto ? 'true' : 'false'}`,
    href: (url) => {
      // Canonical, tracking-free page URL for the plugin.
      const v = url.searchParams.get('v');
      const path = /\/(?:watch|video\.php)/i.test(url.pathname) && v ? `/watch/?v=${encodeURIComponent(v)}` : url.pathname;
      return `https://www.facebook.com${path}`;
    },
  },
  instagram: {
    label: 'Instagram',
    re: /instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/i,
    embed: (e) => `https://www.instagram.com/p/${encodeURIComponent(e.videoId)}/embed/`,
    portrait: true,
  },
  gdrive: {
    label: 'Google Drive',
    re: /(?:drive|docs)\.google\.com\/(?:file\/d\/|(?:open|uc)\?(?:.*&)?id=)([\w-]+)/i,
    embed: (e) => `https://drive.google.com/file/d/${encodeURIComponent(e.videoId)}/preview`,
    thumbnail: (e) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(e.videoId)}&sz=w480`,
  },
};

// Share short-links redirect to the real page; a static site cannot follow that redirect (CORS).
const SHORT_LINK_RE = /^(?:v[mt]\.tiktok\.com|www\.tiktok\.com\/t\/|fb\.watch)/i;

const DIRECT_EXT_RE = /\.(mp4|m4v|webm|ogv|ogg|mov)(\?.*)?$/i;

export function providerLabel(provider) {
  return PROVIDERS[provider]?.label || provider || '';
}

export function isPortraitEmbed(embed) {
  return !!(embed && PROVIDERS[embed.provider]?.portrait);
}

/**
 * Parse user input into one of:
 *   { kind: 'embed',  provider, videoId, href? }      (href only for facebook)
 *   { kind: 'direct', url, looksLikeVideo }
 *   { kind: 'unsupported', reason }                    (recognised host, but not embeddable)
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

  for (const [provider, def] of Object.entries(PROVIDERS)) {
    const m = text.match(def.re);
    if (!m) continue;
    const parsed = { kind: 'embed', provider, videoId: m[1] };
    if (def.href) parsed.href = def.href(url);
    return parsed;
  }

  if (SHORT_LINK_RE.test(url.host + url.pathname)) {
    return {
      kind: 'unsupported',
      reason: 'Short share links cannot be resolved here. Open the link in a browser and paste the full video URL.',
    };
  }

  return { kind: 'direct', url: url.href, looksLikeVideo: DIRECT_EXT_RE.test(url.pathname) };
}

/** Build the `embed` field of a video record from a parsed embed result. */
export function makeEmbed(parsed) {
  if (parsed?.kind !== 'embed') return null;
  const embed = { provider: parsed.provider, videoId: parsed.videoId };
  if (parsed.href) embed.href = parsed.href;
  return embed;
}

export function embedUrl(embed, { autoplay = true } = {}) {
  const def = embed && PROVIDERS[embed.provider];
  return def ? def.embed(embed, autoplay) : '';
}

export function embedThumbnail(embed) {
  const def = embed && PROVIDERS[embed.provider];
  return def?.thumbnail ? def.thumbnail(embed) : null;
}

export function describeUrl(parsed) {
  if (!parsed) return { text: 'Enter a full http(s) link.', ok: false };
  if (parsed.kind === 'unsupported') return { text: parsed.reason, ok: false };
  if (parsed.kind === 'embed') {
    const note = ['facebook', 'instagram', 'gdrive'].includes(parsed.provider) ? ' Only publicly shared content will play.' : '';
    return { text: `${providerLabel(parsed.provider)} video detected – it will play in an embedded player.${note}`, ok: true };
  }
  return parsed.looksLikeVideo
    ? { text: 'Direct video file detected.', ok: true }
    : { text: 'Will be treated as a direct video link. Make sure it points to an MP4/WebM file, not a web page.', ok: true };
}

export async function buildOnlineRecord(raw, title) {
  const parsed = parseVideoUrl(raw);
  if (!parsed) throw new Error('Please enter a valid http(s) URL.');
  if (parsed.kind === 'unsupported') throw new Error(parsed.reason);

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
    record.embed = makeEmbed(parsed);
    record.url = String(raw).trim();
    record.thumbnail = embedThumbnail(record.embed);
    if (!record.title) record.title = `${providerLabel(parsed.provider)} video ${parsed.videoId}`;
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
    const parsed = parseVideoUrl(raw);
    if (!parsed || parsed.kind === 'unsupported') {
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
