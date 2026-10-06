import { getVideoWatchedSeconds, isLessonVideoCompleted } from "./videoProgress.js";

export function pluralRu(n, one, few, many) {
  const abs = Math.abs(Number(n) || 0);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function formatLessonsCount(n) {
  return `${n} ${pluralRu(n, "урок", "урока", "уроков")}`;
}

export function formatChaptersCount(n) {
  return `${n} ${pluralRu(n, "глава", "главы", "глав")}`;
}

export function formatSubjectsCount(n) {
  return `${n} ${pluralRu(n, "предмет", "предмета", "предметов")}`;
}

/** «12 мин», «1 ч 5 мин», «4 ч»; null, если длительность неизвестна. */
export function formatDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (total <= 0) return null;
  const minutes = Math.max(1, Math.round(total / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

export function sumDuration(videos) {
  return (videos || []).reduce((sum, v) => sum + (Number(v.duration) || 0), 0);
}

export function countCompletedVideos(videos, watchedMap, completedMap) {
  return (videos || []).filter((v) =>
    isLessonVideoCompleted(getVideoWatchedSeconds(watchedMap, v.id), Number(v.duration) || 0, completedMap, v.id)
  ).length;
}

export function subjectVideos(subject) {
  return (subject?.subtopics || []).flatMap((ch) => ch.videos || []);
}
