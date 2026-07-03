/** Настоящий Safari (не Chrome/Edge с «Safari» в UA). */
export function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Opera/i.test(ua);
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
