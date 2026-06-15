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
    "seg_%03d.ts",
    "-hls_key_info_file",
    keyInfoName,
    "index.m3u8"
  ];

  try {
    await runFfmpeg(args, outDir);
  } catch (copyError) {
    await runFfmpeg(
      [
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
        "seg_%03d.ts",
        "-hls_key_info_file",
        keyInfoName,
        "index.m3u8"
      ],
      outDir
    ).catch(() => {
      throw copyError;
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
