import { spawn } from "node:child_process";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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

const HLS_SEGMENT_SEC = 6;

/** Только первая видео- и аудиодорожка: таймкоды/метаданные iPhone ломают MPEG-TS муксер. */
const STREAM_MAP_ARGS = ["-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn"];

/** Baseline 3.1 рассчитан максимум на 720p — для большего кадра нужен уровень 4.0. */
function h264LevelFor(video) {
  const width = Number(video?.width) || 0;
  const height = Number(video?.height) || 0;
  return width * height > 1280 * 720 ? "4.0" : "3.1";
}

function safariTranscodeArgs(video) {
  return [
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-profile:v",
    "baseline",
    "-level",
    h264LevelFor(video),
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "23",
    "-force_key_frames",
    `expr:gte(t,n_forced*${HLS_SEGMENT_SEC})`,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2"
  ];
}

const SAFARI_COPY_H264 = ["-c:v", "copy", "-bsf:v", "h264_mp4toannexb", "-c:a", "copy"];

function ffmpegArgs(inputPath, encodeArgs, keyInfoName) {
  return [
    "-y",
    "-i",
    inputPath,
    ...STREAM_MAP_ARGS,
    ...encodeArgs,
    "-max_muxing_queue_size",
    "1024",
    ...hlsOutputArgs(keyInfoName)
  ];
}

function hlsOutputArgs(keyInfoName) {
  return [
    "-hls_time",
    String(HLS_SEGMENT_SEC),
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

const KEY_NAME = "enc.key";
const KEY_INFO_NAME = "keyinfo.txt";

async function prepareWorkDir(workDir, key) {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  const keyPath = path.join(workDir, KEY_NAME);
  await writeFile(keyPath, key);
  // ffmpeg: URI в плейлисте + путь к ключу относительно keyinfo (оба в workDir)
  await writeFile(path.join(workDir, KEY_INFO_NAME), `${KEY_NAME}\n${KEY_NAME}\n`);
  try {
    await access(keyPath);
  } catch {
    throw new Error(`encryption key not written: ${keyPath}`);
  }
}

/**
 * MP4 → AES-128 HLS (сегменты на диске, ключ только через API).
 * Пакуется во временную папку: пока идёт ffmpeg, старая версия урока остаётся доступной.
 */
export async function packageVideoToHls(videoId, inputMp4Path) {
  const outDir = getHlsDir(videoId);
  const workDir = `${outDir}.tmp-${process.pid}-${Date.now()}`;
  const key = crypto.randomBytes(16);

  try {
    await prepareWorkDir(workDir, key);

    const { video, audio } = await probeStreamCodecs(inputMp4Path);
    const transcode = needsSafariCompatibleTranscode(video, audio);
    const transcodeArgs = ffmpegArgs(inputMp4Path, safariTranscodeArgs(video), KEY_INFO_NAME);

    try {
      await runFfmpeg(
        transcode ? transcodeArgs : ffmpegArgs(inputMp4Path, SAFARI_COPY_H264, KEY_INFO_NAME),
        workDir
      );
    } catch (firstError) {
      if (transcode) throw firstError;
      await prepareWorkDir(workDir, key);
      await runFfmpeg(transcodeArgs, workDir).catch(() => {
        throw firstError;
      });
    }

    await access(path.join(workDir, "index.m3u8"));
    await rm(outDir, { recursive: true, force: true });
    await rename(workDir, outDir);
  } catch (error) {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Ссылки на ключ и сегменты — относительные (резолвятся от URL манифеста),
 * чтобы схема/хост за прокси не превращались в http:// на https-сайте.
 */
export async function buildAuthenticatedManifest(videoId, accessToken, deviceId) {
  const raw = await readFile(path.join(getHlsDir(videoId), "index.m3u8"), "utf8");
  const q = new URLSearchParams({
    token: accessToken,
    did: deviceId
  }).toString();
  const keyUri = `key?${q}`;

  return raw
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#EXT-X-KEY")) {
        return trimmed.replace(/URI="[^"]*"/, `URI="${keyUri}"`);
      }
      if (trimmed.endsWith(".ts") && !trimmed.startsWith("#")) {
        return `segments/${encodeURIComponent(trimmed)}?${q}`;
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
