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

function runFfmpeg(args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
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

function runFfprobe(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(new Error("ffprobe не установлен на сервере"));
        return;
      }
      reject(err);
    });
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `ffprobe exited with code ${code}`));
    });
  });
}

/** Длительность видео/аудио в секундах (mp4, m3u8 и др.). */
export async function probeVideoDurationSec(mediaPath) {
  const stdout = await runFfprobe([
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    mediaPath
  ]);
  const seconds = Number(String(stdout).trim());
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds));
}

async function probeStreamCodecs(mediaPath) {
  const stdout = await runFfprobe([
    "-v",
    "error",
    "-show_streams",
    "-of",
    "json",
    mediaPath
  ]);
  const data = JSON.parse(stdout);
  const streams = Array.isArray(data?.streams) ? data.streams : [];
  return {
    video: streams.find((s) => s.codec_type === "video") || null,
    audio: streams.find((s) => s.codec_type === "audio") || null
  };
}

/** Safari/iOS: H.264 Baseline yuv420p + AAC в MPEG-TS; иначе звук есть, картинка чёрная. */
function needsSafariCompatibleTranscode(video, audio) {
  if (!video) return true;
  if (video.codec_name !== "h264") return true;
  const pix = String(video.pix_fmt || "");
  if (pix !== "yuv420p") return true;
  const profile = String(video.profile || "").toLowerCase();
  if (profile.includes("high")) return true;
  const level = Number(video.level);
  if (Number.isFinite(level) && level > 31) return true;
  if (audio && audio.codec_name && audio.codec_name !== "aac") return true;
  return false;
}

const SAFARI_TRANSCODE_VIDEO_AUDIO = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-profile:v",
  "baseline",
  "-level",
  "3.1",
  "-pix_fmt",
  "yuv420p",
  "-crf",
  "23",
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  "-ac",
  "2"
];

const SAFARI_COPY_H264 = ["-c:v", "copy", "-bsf:v", "h264_mp4toannexb", "-c:a", "copy"];

function hlsOutputArgs(keyInfoName) {
  return [
    "-hls_time",
    "6",
    "-hls_playlist_type",
    "vod",
    "-hls_flags",
    "independent_segments",
    "-hls_segment_filename",
    "seg_%03d.ts",
    "-hls_key_info_file",
    keyInfoName,
    "index.m3u8"
  ];
}

/** MP4 → AES-128 HLS (сегменты на диске, ключ только через API). */
export async function packageVideoToHls(videoId, inputMp4Path) {
  const outDir = getHlsDir(videoId);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const keyName = "enc.key";
  const keyInfoName = "keyinfo.txt";
  const keyPath = path.join(outDir, keyName);
  const keyInfoPath = path.join(outDir, keyInfoName);
  const key = crypto.randomBytes(16);
  await writeFile(keyPath, key);

  // ffmpeg: URI в плейлисте + путь к ключу относительно keyinfo (оба в outDir)
  await writeFile(keyInfoPath, `${keyName}\n${keyName}\n`);
  try {
    await access(keyPath);
  } catch {
    throw new Error(`encryption key not written: ${keyPath}`);
  }

  const { video, audio } = await probeStreamCodecs(inputMp4Path);
  const transcode = needsSafariCompatibleTranscode(video, audio);

  const encodeArgs = transcode ? SAFARI_TRANSCODE_VIDEO_AUDIO : SAFARI_COPY_H264;
  const args = ["-y", "-i", inputMp4Path, ...encodeArgs, ...hlsOutputArgs(keyInfoName)];

  try {
    await runFfmpeg(args, outDir);
  } catch (firstError) {
    if (transcode) throw firstError;
    await runFfmpeg(
      ["-y", "-i", inputMp4Path, ...SAFARI_TRANSCODE_VIDEO_AUDIO, ...hlsOutputArgs(keyInfoName)],
      outDir
    ).catch(() => {
      throw firstError;
    });
  }

  await access(path.join(outDir, "index.m3u8"));
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
