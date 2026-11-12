import Hls from "hls.js";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "../config.js";
import { getDeviceId } from "../utils/deviceId.js";
import { getHlsConfig, shouldUseNativeHls } from "../utils/videoPlayer.js";
import { mapVideoElementError } from "../utils/mediaProbe.js";
import { isPlayableStream, isProcessingStream } from "../utils/streamPath.js";
import { isLessonVideoCompleted } from "../utils/videoProgress.js";

const MAX_HLS_RECOVERIES = 3;
const MAX_STREAM_RELOADS = 3;
const PERIODIC_SAVE_MS = 30_000;

function seekWithinDuration(node, seconds) {
  try {
    const dur = node.duration;
    let t = seconds;
    if (Number.isFinite(dur) && dur > 0) {
      t = Math.min(seconds, Math.max(0, dur - 0.25));
    }
    if (Math.abs(node.currentTime - t) > 0.5) {
      node.currentTime = t;
    }
  } catch {
    /* ignore */
  }
}

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
  const durationSecRef = useRef(durationSec);
  const streamPathRef = useRef(streamPath);
  const retryRef = useRef(null);
  const numericVideoId = Number(videoId);
  const [errorState, setErrorState] = useState({ videoId: null, message: "", canRetry: false });
  const playError = errorState.videoId === numericVideoId ? errorState.message : "";
  const canRetry = errorState.videoId === numericVideoId && errorState.canRetry;

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
    try {
      await apiRequestRef.current(`/videos/${vid}/position`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchedSeconds: w, completed })
      });
      if (refresh) {
        await onSavePositionRef.current?.();
      }
    } catch {
      /* сохранение позиции не должно ломать воспроизведение */
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
    const el = videoRef.current;
    if (!Number.isFinite(numericVideoId) || !el) return;

    if (loadedVideoRef.current === numericVideoId && (hlsRef.current || el.src)) {
      return;
    }

    const setStaticError = (message) =>
      setErrorState({ videoId: numericVideoId, message, canRetry: false });

    if (!streamPathRef.current?.trim()) {
      setStaticError("Видеофайл ещё не загружен. Попробуйте позже или обновите страницу.");
      return;
    }
    if (isProcessingStream(streamPathRef.current)) {
      setStaticError("Видео готовится к просмотру. Подождите 1–2 минуты и обновите страницу.");
      return;
    }
    if (!isPlayableStream(streamPathRef.current)) {
      setStaticError("Формат урока не поддерживается.");
      return;
    }

    loadedVideoRef.current = numericVideoId;

    const node = el;
    const deviceId = getDeviceId();
    const useNativeHls = shouldUseNativeHls(node);
    let cancelled = false;
    let reloading = false;
    let reloadAttempts = 0;
    let hlsRecoveries = 0;
    let lastKnownTime = 0;
    let wantsPlay = false;
    let detachSourceListeners = null;

    const showError = (message, retryable = true) => {
      if (cancelled) return;
      setErrorState({ videoId: numericVideoId, message, canRetry: retryable });
    };

    const clearError = () => {
      if (cancelled) return;
      setErrorState((prev) => (prev.message ? { videoId: null, message: "", canRetry: false } : prev));
    };

    const saveCurrentPosition = (refresh = false) => {
      const elNow = videoRef.current;
      if (!elNow) return;
      const ct = Math.floor(elNow.currentTime || lastKnownTime || 0);
      if (ct > 0) void persistPositionRef.current?.(numericVideoId, ct, { refresh });
    };

    const onPageHide = () => saveCurrentPosition(false);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveCurrentPosition(false);
    };
    const onTimeUpdate = () => {
      if (node.currentTime > 0) lastKnownTime = node.currentTime;
    };
    const onSeeking = () => {
      lastKnownTime = node.currentTime;
    };
    const onPlaying = () => {
      reloadAttempts = 0;
      clearError();
    };
    const onPlay = () => {
      wantsPlay = true;
    };
    const onUserPause = () => {
      if (!node.ended && !node.error) wantsPlay = false;
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    node.addEventListener("timeupdate", onTimeUpdate);
    node.addEventListener("seeking", onSeeking);
    node.addEventListener("playing", onPlaying);
    node.addEventListener("play", onPlay);
    node.addEventListener("pause", onUserPause);

    const periodicSave = setInterval(() => {
      if (!node.paused && !node.ended) saveCurrentPosition(false);
    }, PERIODIC_SAVE_MS);

    if (initialSeekRef.current.videoId !== numericVideoId) {
      initialSeekRef.current = {
        videoId: numericVideoId,
        seconds: Math.max(0, Math.floor(Number(initialPlaybackSeconds) || 0))
      };
    }

    const destroyHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    const resetSource = () => {
      detachSourceListeners?.();
      detachSourceListeners = null;
      destroyHls();
      node.removeAttribute("src");
      node.load();
    };

    /** Свежий видео-токен → URL манифеста. Бросает Error с текстом для пользователя. */
    const fetchManifestUrl = async () => {
      const accessRes = await apiRequestRef.current(`/videos/${numericVideoId}/access-token`, {
        method: "POST"
      });
      if (!accessRes.ok) {
        const err = await accessRes.json().catch(() => ({}));
        const error = new Error(err.message || `Не удалось получить доступ к видео (${accessRes.status})`);
        error.status = accessRes.status;
        throw error;
      }
      const accessData = await accessRes.json();
      return `${apiBase}/hls/${numericVideoId}/manifest.m3u8?token=${encodeURIComponent(accessData.token)}&did=${encodeURIComponent(deviceId)}`;
    };

    const reloadStream = async () => {
      if (cancelled || reloading) return;
      if (reloadAttempts >= MAX_STREAM_RELOADS) {
        hlsRef.current?.stopLoad();
        showError("Не удалось загрузить видео. Проверьте интернет и нажмите «Повторить».");
        return;
      }
      reloadAttempts += 1;
      const at = Math.floor(node.currentTime || lastKnownTime || 0);
      if (reloadAttempts > 1) {
        reloading = true;
        await new Promise((resolve) => setTimeout(resolve, 1500 * (reloadAttempts - 1)));
        reloading = false;
        if (cancelled) return;
      }
      await startStream(at, wantsPlay);
    };

    const startStream = async (startAt, autoplay) => {
      reloading = true;
      let src;
      try {
        src = await fetchManifestUrl();
      } catch (error) {
        reloading = false;
        if (cancelled) return;
        // 403 — нет подписки: повтор не поможет.
        showError(error.message || "Не удалось получить доступ к видео.", error.status !== 403);
        return;
      }
      reloading = false;
      if (cancelled || !node.isConnected) return;

      resetSource();
      hlsRecoveries = 0;
      // Пока новый поток не загрузился, currentTime = 0 — помним, куда стартуем.
      if (startAt > 0) lastKnownTime = startAt;

      const play = () => {
        if (autoplay && !cancelled) node.play().catch(() => {});
      };

      if (useNativeHls || (!Hls.isSupported() && node.canPlayType("application/vnd.apple.mpegurl"))) {
        const onLoadedMetadata = () => {
          if (startAt > 0) seekWithinDuration(node, startAt);
          play();
        };
        node.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
        detachSourceListeners = () => node.removeEventListener("loadedmetadata", onLoadedMetadata);
        node.src = src;
        node.load();
        return;
      }

      if (!Hls.isSupported()) {
        showError("Ваш браузер не поддерживает воспроизведение этого формата.", false);
        return;
      }

      const hls = new Hls({ ...getHlsConfig(), startPosition: startAt > 0 ? startAt : -1 });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, play);
      hls.on(Hls.Events.FRAG_LOADED, () => {
        hlsRecoveries = 0;
        reloadAttempts = 0;
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (hlsRef.current !== hls) return;
        const status = Number(data.response?.code) || 0;
        // 401/403/404 по сегменту/ключу — токен или поток устарели: нужен новый манифест.
        // hls.js при единственном качестве повторяет и 4xx, поэтому не ждём fatal.
        const needsNewManifest =
          data.type === Hls.ErrorTypes.NETWORK_ERROR && (status === 401 || status === 403 || status === 404);
        if (needsNewManifest) {
          void reloadStream();
          return;
        }
        if (!data.fatal) return;
        if (hlsRecoveries < MAX_HLS_RECOVERIES) {
          hlsRecoveries += 1;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }
        }
        void reloadStream();
      });
      hls.loadSource(src);
      hls.attachMedia(node);
    };

    const onVideoError = () => {
      if (cancelled || hlsRef.current) return;
      const code = node.error?.code;
      // Нативный HLS: 2 — сеть, 4 — сервер ответил не плейлистом (часто истёкший токен).
      if (code === 2 || code === 4) {
        void reloadStream();
        return;
      }
      showError(mapVideoElementError(code));
    };
    node.addEventListener("error", onVideoError);

    retryRef.current = () => {
      reloadAttempts = 0;
      clearError();
      void reloadStream();
    };

    void startStream(initialSeekRef.current.seconds, false);

    return () => {
      cancelled = true;
      retryRef.current = null;
      clearInterval(periodicSave);
      node.removeEventListener("error", onVideoError);
      node.removeEventListener("timeupdate", onTimeUpdate);
      node.removeEventListener("seeking", onSeeking);
      node.removeEventListener("playing", onPlaying);
      node.removeEventListener("play", onPlay);
      node.removeEventListener("pause", onUserPause);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      saveCurrentPosition(false);
      if (loadedVideoRef.current === numericVideoId) {
        loadedVideoRef.current = null;
      }
      resetSource();
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
        <div className="player-error" role="alert">
          <span>{playError}</span>
          {canRetry ? (
            <button type="button" className="player-error-retry" onClick={() => retryRef.current?.()}>
              Повторить
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="lesson-video-wrap" onContextMenu={(e) => e.preventDefault()}>
        <video
          ref={videoRef}
          className="lesson-video"
          aria-label={videoTitle || undefined}
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
