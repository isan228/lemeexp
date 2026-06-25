/** Секунды просмотра для видео из карты прогресса (ключи с бэка могут быть строками). */
export function getVideoWatchedSeconds(watchedSecondsMap, rawVideoId) {
  if (!watchedSecondsMap || typeof watchedSecondsMap !== "object") return 0;
  const id = Number(rawVideoId);
  if (!Number.isFinite(id)) return 0;
  const v = watchedSecondsMap[id] ?? watchedSecondsMap[String(id)];
  return Math.max(0, Number(v) || 0);
}

/**
 * Урок считается просмотренным, если бэкенд пометил completed или почти досмотрели до конца по duration.
 * Если длительность неизвестна — прежний порог 600 с (совместимость).
 */
export function isLessonVideoCompleted(watchedSeconds, durationSeconds, videoCompletedMap, rawVideoId) {
  const id = Number(rawVideoId);
  if (videoCompletedMap && typeof videoCompletedMap === "object" && Number.isFinite(id)) {
    if (videoCompletedMap[id] === true || videoCompletedMap[String(id)] === true) return true;
  }
  const w = Math.max(0, Number(watchedSeconds) || 0);
  const d = Math.max(0, Number(durationSeconds) || 0);
  if (d > 0) return w >= Math.max(1, d - 3);
  return w >= 600;
}

/** Доля просмотра урока в процентах (0–100) для прогресс-бара в каталоге. */
export function getVideoWatchProgressPercent(watchedSeconds, durationSeconds, videoCompletedMap, rawVideoId) {
  if (isLessonVideoCompleted(watchedSeconds, durationSeconds, videoCompletedMap, rawVideoId)) {
    return 100;
  }
  const w = Math.max(0, Number(watchedSeconds) || 0);
  if (w <= 0) return 0;
  const d = Math.max(0, Number(durationSeconds) || 0);
  if (d > 0) return Math.min(100, Math.round((w / d) * 100));
  return Math.min(100, Math.round((w / 600) * 100));
}

/** Сводный прогресс главы по всем видео (среднее по урокам, 0–100). */
export function getChapterWatchProgressPercent(videos, watchedSecondsMap, videoCompletedMap) {
  const list = Array.isArray(videos) ? videos : [];
  if (list.length === 0) return 0;
  let sum = 0;
  for (const v of list) {
    sum += getVideoWatchProgressPercent(
      getVideoWatchedSeconds(watchedSecondsMap, v.id),
      Number(v.duration) || 0,
      videoCompletedMap,
      v.id
    );
  }
  return Math.round(sum / list.length);
}

/** Сводный прогресс предмета по всем видео (среднее по урокам, 0–100). */
export function getSubjectWatchProgressPercent(subject, watchedSecondsMap, videoCompletedMap) {
  const videos = (subject?.subtopics || []).flatMap((ch) => ch.videos || []);
  return getChapterWatchProgressPercent(videos, watchedSecondsMap, videoCompletedMap);
}
