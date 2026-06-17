import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "../config.js";
import { getDeviceId } from "../utils/deviceId.js";
import { mapVideoElementError } from "../utils/mediaProbe.js";
import { isPlayableStream, isProcessingStream } from "../utils/streamPath.js";
import { isLessonVideoCompleted } from "../utils/videoProgress.js";

export default function LessonPlayer({ video, apiRequest, onSavePosition, initialPlaybackSeconds = 0 }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const intervalRef = useRef(null);
  const onSavePositionRef = useRef(onSavePosition);
  const apiRequestRef = useRef(apiRequest);
  const persistPositionRef = useRef(null);
  const initialSeekRef = useRef({ videoId: null, seconds: 0 });
  const [playError, setPlayError] = useState("");

  useEffect(() => {
    onSavePositionRef.current = onSavePosition;
  }, [onSavePosition]);

  useEffect(() => {
    apiRequestRef.current = apiRequest;
  }, [apiRequest]);

  const videoId = video?.id;
  const streamPath = video?.streamPath;
  const durationSec = Math.max(0, Number(video?.duration) || 0);

  const persistPosition = useCallback(async (vid, watchedSeconds, { refresh = false } = {}) => {
    const w = Math.max(0, Math.floor(Number(watchedSeconds) || 0));
    const completed = isLessonVideoCompleted(w, durationSec, null, vid);
    await apiRequestRef.current(`/videos/${vid}/position`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchedSeconds: w, completed })
    });
    if (refresh) {
      await onSavePositionRef.current?.();
    }
  }, [durationSec]);

  useEffect(() => {
    persistPositionRef.current = persistPosition;
  }, [persistPosition]);

  useEffect(() => {
    setPlayError("");
  }, [videoId, streamPath]);

  useEffect(() => {
    const el = videoRef.current;
    if (videoId == null || !el) return;

    if (!streamPath?.trim()) {
      setPlayError("Видеофайл ещё не загружен. Попробуйте позже или обновите страницу.");
      return;
    }
    if (isProcessingStream(streamPath)) {
      setPlayError("Видео готовится к просмотру. Подождите 1–2 минуты и обновите страницу.");
      return;
    }
    if (!isPlayableStream(streamPath)) {
      setPlayError("Формат урока не поддерживается.");
      return;
    }

    const onPageHide = () => {
      const elNow = videoRef.current;
      if (!elNow) return;
      const ct = Math.floor(elNow.currentTime || 0);
      if (ct > 0) void persistPositionRef.current?.(videoId, ct, { refresh: true });
    };
    window.addEventListener("pagehide", onPageHide);

    if (initialSeekRef.current.videoId !== videoId) {
      initialSeekRef.current = {
        videoId,
        seconds: Math.max(0, Math.floor(Number(initialPlaybackSeconds) || 0))
      };
    }
    const startAt = initialSeekRef.current.seconds;

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
    let removeVideoError = null;
    const elBound = el;
    const deviceId = getDeviceId();

    (async () => {
      const accessRes = await apiRequestRef.current(`/videos/${videoId}/access-token`, { method: "POST" });
      if (cancelled || !elBound.isConnected) return;
      if (!accessRes.ok) {
        const err = await accessRes.json().catch(() => ({}));
        setPlayError(err.message || `Не удалось получить доступ к видео (${accessRes.status})`);
        return;
      }
      const accessData = await accessRes.json();
      const src = `${apiBase}/hls/${videoId}/manifest.m3u8?token=${encodeURIComponent(accessData.token)}&did=${encodeURIComponent(deviceId)}`;

      if (cancelled || !elBound.isConnected) return;

      const node = elBound;

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

      const onVideoError = () => {
        setPlayError(mapVideoElementError(node.error?.code));
      };
      node.addEventListener("error", onVideoError);
      removeVideoError = () => node.removeEventListener("error", onVideoError);

      if (Hls.isSupported()) {
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
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }
          setPlayError("Не удалось загрузить защищённый поток.");
        });
      } else if (node.canPlayType("application/vnd.apple.mpegurl")) {
        node.src = src;
      } else {
        setPlayError("Ваш браузер не поддерживает воспроизведение этого формата.");
        return;
      }

      intervalRef.current = setInterval(() => {
        if (node.readyState >= 1) {
          void persistPositionRef.current?.(videoId, Math.floor(node.currentTime || 0));
        }
      }, 15000);
    })();

    return () => {
      cancelled = true;
      removeVideoError?.();
      window.removeEventListener("pagehide", onPageHide);
      const ct = Math.floor(elBound.currentTime || 0);
      if (videoId != null && ct > 0) {
        void persistPositionRef.current?.(videoId, ct, { refresh: true });
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
  }, [videoId, streamPath]);

  if (!video || videoId == null) return null;

  function onPauseSave(e) {
    const t = Math.floor(e.currentTarget.currentTime || 0);
    if (t > 0) void persistPosition(videoId, t, { refresh: true });
  }

  function onEndedSave(e) {
    const el = e.currentTarget;
    const fromMeta = Math.floor(Number(el.duration) || 0);
    const cap = fromMeta > 0 ? fromMeta : durationSec;
    const t = Math.max(Math.floor(el.currentTime || 0), cap);
    const toSave = t > 0 ? t : cap;
    if (toSave > 0) void persistPosition(videoId, toSave, { refresh: true });
  }

  return (
    <section className="card player-card">
      <h3>Сейчас: {video.title}</h3>
      {playError ? (
        <p className="player-error" role="alert">
          {playError}
        </p>
      ) : null}
      <div className="lesson-video-wrap" onContextMenu={(e) => e.preventDefault()}>
        <video
          key={video.id}
          ref={videoRef}
          className="lesson-video"
          controls
          controlsList="nodownload noplaybackrate noremoteplayback"
          disablePictureInPicture
          playsInline
          onPause={onPauseSave}
          onEnded={onEndedSave}
        />
      </div>
    </section>
  );
}
