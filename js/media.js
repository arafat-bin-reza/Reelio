// Probe a video source with a hidden <video> element to read its duration
// and capture a thumbnail frame. Works for object URLs (uploads) and for
// online URLs whose host sends CORS headers. Always resolves; never rejects.

const THUMB_MAX_WIDTH = 480;

export function probeMedia(src, { crossOrigin = false, timeoutMs = 12000 } = {}) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    if (crossOrigin) video.crossOrigin = 'anonymous';

    let settled = false;
    let duration = null;
    let timer = null;

    const finish = (thumbnail) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      try { video.load(); } catch { /* ignore */ }
      resolve({ duration, thumbnail: thumbnail || null, errored: false });
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      try { video.load(); } catch { /* ignore */ }
      resolve({ duration, thumbnail: null, errored: true });
    };

    const capture = () => {
      try {
        const w = video.videoWidth || 320;
        const h = video.videoHeight || 180;
        const scale = Math.min(1, THUMB_MAX_WIDTH / w);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        // toBlob throws a SecurityError when the canvas is tainted by a cross-origin frame.
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.82);
      } catch {
        finish(null);
      }
    };

    timer = setTimeout(() => finish(null), timeoutMs);

    const seekAndCapture = () => {
      duration = Number.isFinite(video.duration) ? video.duration : null;
      const target = duration ? Math.min(1.5, duration * 0.1) : 0;
      video.addEventListener('seeked', capture, { once: true });
      if (target > 0) {
        video.currentTime = target;
      } else if (video.readyState >= 2) {
        video.removeEventListener('seeked', capture);
        capture();
      } else {
        video.removeEventListener('seeked', capture);
        video.addEventListener('loadeddata', capture, { once: true });
      }
    };

    video.addEventListener('loadedmetadata', () => {
      if (video.duration === Infinity) {
        // MediaRecorder WebM: force the browser to compute the real duration first.
        video.addEventListener(
          'durationchange',
          () => {
            if (Number.isFinite(video.duration)) seekAndCapture();
          },
          { once: true }
        );
        video.currentTime = 1e101;
        return;
      }
      seekAndCapture();
    }, { once: true });
    video.addEventListener('error', fail, { once: true });

    video.src = src;
  });
}
