/** Настоящий Safari (не Chrome/Edge с «Safari» в UA). */
export function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Opera/i.test(ua);
}

/** iPhone / iPad / iPod (включая iPadOS с UA «Macintosh»). */
export function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const iPadDesktop = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPhone|iPod|iPad/i.test(ua) || iPadDesktop;
}

export function canPlayNativeHls(videoEl) {
  if (!videoEl || typeof videoEl.canPlayType !== "function") return false;
  return Boolean(
    videoEl.canPlayType("application/vnd.apple.mpegurl") ||
      videoEl.canPlayType("application/x-mpegURL")
  );
}

/**
 * На iOS и Safari — только нативный HLS: hls.js даёт чёрный экран при AES-128.
 * На остальных платформах — hls.js, если доступен MSE.
 */
export function shouldUseNativeHls(videoEl) {
  if (!canPlayNativeHls(videoEl)) return false;
  return isIosDevice() || isSafariBrowser();
}

/** Настройки hls.js: в Safari воркеры ломают MSE с AES-128. */
export function getHlsConfig() {
  const safari = isSafariBrowser();
  return {
    enableWorker: !safari,
    lowLatencyMode: false,
    maxBufferLength: 30,
    maxMaxBufferLength: 120,
    backBufferLength: safari ? 0 : 30,
    fragLoadingMaxRetry: 2,
    manifestLoadingMaxRetry: 2
  };
}
