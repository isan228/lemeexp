import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const hlsRoot = path.join(__dirname, "..", "hls");

export function getHlsDir(videoId) {
  return path.join(hlsRoot, String(videoId));
}

export async function isHlsReady(videoId) {
  try {
    await access(path.join(getHlsDir(videoId), "index.m3u8"));
    return true;
  } catch {
    return false;
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(new Error("ffmpeg не установлен на сервере"));
        return;
      }
      reject(err);
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

/** MP4 → AES-128 HLS (сегменты на диске, ключ только через API). */
export async function packageVideoToHls(videoId, inputMp4Path) {
  const outDir = getHlsDir(videoId);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const keyPath = path.join(outDir, "enc.key");
  const keyInfoPath = path.join(outDir, "keyinfo.txt");
  const key = crypto.randomBytes(16);
  await writeFile(keyPath, key);
  await writeFile(keyInfoPath, `${keyPath}\nenc.key\n`);

  const segmentPattern = path.join(outDir, "seg_%03d.ts");
  const playlistPath = path.join(outDir, "index.m3u8");

  const args = [
    "-y",
    "-i",
    inputMp4Path,
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    "-hls_time",
    "6",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    segmentPattern,
    "-hls_key_info_file",
    keyInfoPath,
    playlistPath
  ];

  try {
    await runFfmpeg(args);
  } catch (copyError) {
    await runFfmpeg([
      "-y",
      "-i",
      inputMp4Path,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-hls_time",
      "6",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      segmentPattern,
      "-hls_key_info_file",
      keyInfoPath,
      playlistPath
    ]).catch(() => {
      throw copyError;
    });
  }

  await access(playlistPath);
}

export async function buildAuthenticatedManifest(videoId, req, accessToken, deviceId) {
  const raw = await readFile(path.join(getHlsDir(videoId), "index.m3u8"), "utf8");
  const host = `${req.protocol}://${req.get("host")}`;
  const q = new URLSearchParams({
    token: accessToken,
    did: deviceId
  }).toString();
  const keyUri = `${host}/hls/${videoId}/key?${q}`;

  return raw
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#EXT-X-KEY")) {
        return trimmed.replace(/URI="[^"]*"/, `URI="${keyUri}"`);
      }
      if (trimmed.endsWith(".ts") && !trimmed.startsWith("#")) {
        return `${host}/hls/${videoId}/segments/${encodeURIComponent(trimmed)}?${q}`;
      }
      return line;
    })
    .join("\n");
}

export function safeSegmentName(name) {
  const base = path.basename(String(name || ""));
  if (!/^seg_\d+\.ts$/.test(base)) return null;
  return base;
}
