export function isPlayableStream(streamPath) {
  return Boolean(streamPath?.startsWith("hls:") || streamPath?.startsWith("hls/"));
}

export function isProcessingStream(streamPath) {
  return Boolean(streamPath?.startsWith("upload:"));
}

export function streamStatusLabel(streamPath) {
  if (!streamPath?.trim()) return "pending";
  if (isProcessingStream(streamPath)) return "processing";
  if (isPlayableStream(streamPath)) return "ready";
  return "unknown";
}
