/** Safari (iOS + macOS): встроенный HLS. hls.js даёт серый экран при работающем звуке. */
export function preferNativeHls() {
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("video");
    return Boolean(probe.canPlayType("application/vnd.apple.mpegurl"));
  } catch {
    return false;
  }
}
