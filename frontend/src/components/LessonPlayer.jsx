import Hls from "hls.js";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "../config.js";
import { getDeviceId } from "../utils/deviceId.js";
import { preferNativeHls } from "../utils/videoPlayer.js";
import { mapVideoElementError } from "../utils/mediaProbe.js";
import { isPlayableStream, isProcessingStream } from "../utils/streamPath.js";
import { isLessonVideoCompleted } from "../utils/videoProgress.js";

const MAX_HLS_RECOVERIES = 2;

function LessonPlayerInner({
  videoId,
  videoTitle,
  streamPath,
  durationSec = 0,
  apiRequest,
  onSavePosition,
  initialPlaybackSeconds = 0
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const onSavePositionRef = useRef(onSavePosition);
  const apiRequestRef = useRef(apiRequest);
  const persistPositionRef = useRef(null);
  const initialSeekRef = useRef({ videoId: null, seconds: 0 });
  const pauseSaveTimerRef = useRef(null);
  const loadedVideoRef = useRef(null);
  const hlsRecoveryRef = useRef(0);
  const durationSecRef = useRef(durationSec);
  const streamPathRef = useRef(streamPath);
  const [playError, setPlayError] = useState("");

  const numericVideoId = Number(videoId);

  useEffect(() => {
    streamPathRef.current = streamPath;
  }, [streamPath]);

  useEffect(() => {
    onSavePositionRef.current = onSavePosition;
  }, [onSavePosition]);

  useEffect(() => {
    apiRequestRef.current = apiRequest;
  }, [apiRequest]);

  useEffect(() => {
    durationSecRef.current = durationSec;
  }, [durationSec]);

  const persistPosition = useCallback(async (vid, watchedSeconds, { refresh = false } = {}) => {
    const w = Math.max(0, Math.floor(Number(watchedSeconds) || 0));
    const completed = isLessonVideoCompleted(w, durationSecRef.current, null, vid);
    await apiRequestRef.current(`/videos/${vid}/position`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchedSeconds: w, completed })
    });
    if (refresh) {
      await onSavePositionRef.current?.();
    }
  }, []);

  useEffect(() => {
    persistPositionRef.current = persistPosition;
  }, [persistPosition]);

  useEffect(
    () => () => {
      if (pauseSaveTimerRef.current) clearTimeout(pauseSaveTimerRef.current);
    },
    []
  );

  useEffect(() => {
    setPlayError("");
  }, [numericVideoId]);

  useEffect(() => {
    const el = videoRef.current;
    if (!Number.isFinite(numericVideoId) || !el) return;

    if (loadedVideoRef.current === numericVideoId && (hlsRef.current || el.src)) {
      return;
    }

    if (!streamPathRef.current?.trim()) {
      setPlayError("Видеофайл ещё не загружен. Попробуйте позже или обновите страницу.");
      return;
    }
    if (isProcessingStream(streamPathRef.current)) {
      setPlayError("Видео готовится к просмотру. Подождите 1–2 минуты и обновите страницу.");
      return;
    }
    if (!isPlayableStream(streamPathRef.current)) {
      setPlayError("Формат урока не поддерживается.");
      return;
    }

    loadedVideoRef.current = numericVideoId;
    hlsRecoveryRef.current = 0;

    const saveCurrentPosition = (refresh = false) => {
      const elNow = videoRef.current;
      if (!elNow) return;
      const ct = Math.floor(elNow.currentTime || 0);
      if (ct > 0) void persistPositionRef.current?.(numericVideoId, ct, { refresh });
    };

    const onPageHide = () => saveCurrentPosition(false);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveCurrentPosition(false);
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (initialSeekRef.current.videoId !== numericVideoId) {
      initialSeekRef.current = {
        videoId: numericVideoId,
        seconds: Math.max(0, Math.floor(Number(initialPlaybackSeconds) || 0))
      };
    }
    const startAt = initialSeekRef.current.seconds;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    el.removeAttribute("src");
    el.load();

    let cancelled = false;
    let removeVideoError = null;
    const elBound = el;
    const deviceId = getDeviceId();

    (async () => {
      const accessRes = await apiRequestRef.current(`/videos/${numericVideoId}/access-token`, {
        method: "POST"
      });
      if (cancelled || !elBound.isConnected) return;
      if (!accessRes.ok) {
        const err = await accessRes.json().catch(() => ({}));
        setPlayError(err.message || `Не удалось получить доступ к видео (${accessRes.status})`);
        return;
      }
      const accessData = await accessRes.json();
      const src = `${apiBase}/hls/${numericVideoId}/manifest.m3u8?token=${encodeURIComponent(accessData.token)}&did=${encodeURIComponent(deviceId)}`;

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
            if (Math.abs(node.currentTime - t) > 0.5) {
              node.currentTime = t;
            }
            applied = true;
          } catch {
            /* ignore */
          }
        };
      }

      const onVideoError = () => {
        setPlayError(mapVideoElementError(node.error?.code));
      };
      node.addEventListener("error", onVideoError);
      removeVideoError = () => node.removeEventListener("error", onVideoError);

      if (preferNativeHls()) {
        if (applyInitialSeek) {
          node.addEventListener("loadedmetadata", applyInitialSeek, { once: true });
        }
        node.src = src;
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 120,
          backBufferLength: 30,
          fragLoadingMaxRetry: 2,
          manifestLoadingMaxRetry: 2
        });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(node);
        if (applyInitialSeek) {
          const onParsed = () => {
            hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
            applyInitialSeek();
          };
          hls.on(Hls.Events.MANIFEST_PARSED, onParsed);
        }
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          if (hlsRecoveryRef.current >= MAX_HLS_RECOVERIES) {
            setPlayError("Не удалось загрузить защищённый поток.");
            return;
          }
          hlsRecoveryRef.current += 1;
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
      } else {
        setPlayError("Ваш браузер не поддерживает воспроизведение этого формата.");
      }
    })();

    return () => {
      cancelled = true;
      removeVideoError?.();
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      saveCurrentPosition(false);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (loadedVideoRef.current === numericVideoId) {
        loadedVideoRef.current = null;
      }
      elBound.removeAttribute("src");
      elBound.load();
    };
  }, [numericVideoId]);

  function onPauseSave(e) {
    const el = e.currentTarget;
    if (el.seeking || el.ended) return;
    if (pauseSaveTimerRef.current) clearTimeout(pauseSaveTimerRef.current);
    pauseSaveTimerRef.current = setTimeout(() => {
      pauseSaveTimerRef.current = null;
      const node = videoRef.current;
      if (!node || !node.paused || node.ended || node.seeking) return;
      const t = Math.floor(node.currentTime || 0);
      if (t > 0) void persistPosition(numericVideoId, t);
    }, 1000);
  }

  function onEndedSave(e) {
    const el = e.currentTarget;
    const fromMeta = Math.floor(Number(el.duration) || 0);
    const cap = fromMeta > 0 ? fromMeta : durationSecRef.current;
    const t = Math.max(Math.floor(el.currentTime || 0), cap);
    const toSave = t > 0 ? t : cap;
    if (toSave > 0) void persistPosition(numericVideoId, toSave, { refresh: true });
  }

  if (!Number.isFinite(numericVideoId)) return null;

  return (
    <div className="lesson-player-shell">
      {playError ? (
        <p className="player-error" role="alert">
          {playError}
        </p>
      ) : null}
      <div className="lesson-video-wrap" onContextMenu={(e) => e.preventDefault()}>
        <video
          ref={videoRef}
          className="lesson-video"
          controls
          controlsList="nodownload noplaybackrate noremoteplayback"
          disablePictureInPicture
          disableRemotePlayback
          playsInline
          preload="metadata"
          onPause={onPauseSave}
          onEnded={onEndedSave}
        />
      </div>
    </div>
  );
}

export default memo(LessonPlayerInner);
