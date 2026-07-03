/** Настоящий Safari (не Chrome/Edge с «Safari» в UA). */
export function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Opera/i.test(ua);
}

/** Только Safari: встроенный HLS. В Chrome/Firefox — hls.js. */
export function preferNativeHls() {
  if (!isSafariBrowser()) return false;
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("video");
    return Boolean(probe.canPlayType("application/vnd.apple.mpegurl"));
  } catch {
    return false;
  }
}
