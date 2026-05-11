import Hls from "hls.js";
import { useCallback, useEffect, useRef } from "react";
import { apiBase } from "../config.js";
import { isLessonVideoCompleted } from "../utils/videoProgress.js";

export default function LessonPlayer({ video, apiRequest, onSavePosition, initialPlaybackSeconds = 0 }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const intervalRef = useRef(null);
  const onSavePositionRef = useRef(onSavePosition);
  useEffect(() => {
    onSavePositionRef.current = onSavePosition;
  }, [onSavePosition]);

  const videoId = video?.id;
  const streamPath = video?.streamPath;
  const durationSec = Math.max(0, Number(video?.duration) || 0);

  const savePosition = useCallback(
    async (vid, watchedSeconds) => {
      const w = Math.max(0, Math.floor(Number(watchedSeconds) || 0));
      const completed = isLessonVideoCompleted(w, durationSec, null, vid);
      await apiRequest(`/videos/${vid}/position`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchedSeconds: w, completed })
      });
      await onSavePositionRef.current?.();
    },
    [apiRequest, durationSec]
  );

  useEffect(() => {
    const el = videoRef.current;
    if (videoId == null || !el) return;

    const onPageHide = () => {
      const elNow = videoRef.current;
      if (!elNow) return;
      const ct = Math.floor(elNow.currentTime || 0);
      if (ct > 0) void savePosition(videoId, ct);
    };
    window.addEventListener("pagehide", onPageHide);

    const startAt = Math.max(0, Math.floor(Number(initialPlaybackSeconds) || 0));

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    el.removeAttribute("src");
    el.load();

    let cancelled = false;
    const elBound = el;
    // После apiRequest(access-token) в LS уже есть deviceId (см. x-device-id в AuthContext).
    const deviceId = localStorage.getItem("deviceId") || "unknown-device";

    (async () => {
      const accessRes = await apiRequest(`/videos/${videoId}/access-token`, { method: "POST" });
      if (cancelled || !accessRes.ok || !elBound.isConnected) return;
      const accessData = await accessRes.json();

      let src;
      if (streamPath?.startsWith("upload:") || streamPath?.startsWith("/uploads/")) {
        src = `${apiBase}/media/${videoId}?token=${encodeURIComponent(accessData.token)}&did=${encodeURIComponent(deviceId)}`;
      } else {
        src = `${apiBase}/hls/${videoId}/manifest.m3u8?token=${encodeURIComponent(accessData.token)}&did=${encodeURIComponent(deviceId)}`;
      }

      if (cancelled || !elBound.isConnected) return;

      const node = elBound;
      const isMp4 = src.includes("/media/") || src.endsWith(".mp4");

      let applyInitialSeek = null;
      if (startAt > 0) {
        let applied = false;
        applyInitialSeek = () => {
          if (applied || !node.isConnected || cancelled) return;
          try {
            const dur = node.duration;
            let t = startAt;
            if (Number.isFinite(dur) && dur > 0) {
              t = Math.min(startAt, Math.max(0, dur - 0.25));
            }
            node.currentTime = t;
            applied = true;
          } catch {
            /* ignore */
          }
        };
        node.addEventListener("loadedmetadata", applyInitialSeek, { once: true });
        node.addEventListener("canplay", applyInitialSeek, { once: true });
      }

      if (isMp4) {
        node.src = src;
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: false,
          lowLatencyMode: false
        });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(node);
        if (applyInitialSeek) {
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            applyInitialSeek();
          });
        }
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        });
      } else if (node.canPlayType("application/vnd.apple.mpegurl")) {
        node.src = src;
      }

      intervalRef.current = setInterval(() => {
        if (node.readyState >= 1) {
          void savePosition(videoId, Math.floor(node.currentTime || 0));
        }
      }, 5000);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onPageHide);
      const ct = Math.floor(elBound.currentTime || 0);
      if (videoId != null && ct > 0) {
        void savePosition(videoId, ct);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      elBound.removeAttribute("src");
      elBound.load();
    };
  }, [videoId, streamPath, apiRequest, savePosition, initialPlaybackSeconds]);

  if (!video || videoId == null) return null;

  function onPauseSave(e) {
    const t = Math.floor(e.currentTarget.currentTime || 0);
    if (t > 0) void savePosition(videoId, t);
  }

  function onEndedSave(e) {
    const el = e.currentTarget;
    const fromMeta = Math.floor(Number(el.duration) || 0);
    const cap = fromMeta > 0 ? fromMeta : durationSec;
    const t = Math.max(Math.floor(el.currentTime || 0), cap);
    const toSave = t > 0 ? t : cap;
    if (toSave > 0) void savePosition(videoId, toSave);
  }

  return (
    <section className="card player-card">
      <h3>Сейчас: {video.title}</h3>
      <video
        key={video.id}
        ref={videoRef}
        className="lesson-video"
        controls
        playsInline
        onPause={onPauseSave}
        onEnded={onEndedSave}
      />
    </section>
  );
}
