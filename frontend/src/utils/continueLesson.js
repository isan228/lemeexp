import { routes } from "../config/site.js";

/** Находит урок в каталоге по id видео. */
export function findVideoById(chapters, videoId) {
  const vid = Number(videoId);
  if (!vid || !Array.isArray(chapters)) return null;

  for (const subject of chapters) {
    for (const chapter of subject.subtopics || []) {
      const video = (chapter.videos || []).find((v) => Number(v.id) === vid);
      if (video) {
        return { subject, chapter, video };
      }
    }
  }
  return null;
}

/** Находит урок для «Продолжить просмотр» по lastVideoId из прогресса. */
export function findContinueLesson(chapters, lastVideoId) {
  const found = findVideoById(chapters, lastVideoId);
  if (!found) return null;
  const { subject, chapter, video } = found;
  return {
    subject,
    chapter,
    video,
    href: routes.lessonVideo(subject.id, chapter.id, video.id, { resume: true })
  };
}

export function countCatalogStats(chapters) {
  let subjects = chapters.length;
  let chaptersCount = 0;
  let videos = 0;
  for (const s of chapters) {
    chaptersCount += s.subtopics?.length || 0;
    for (const ch of s.subtopics || []) {
      videos += ch.videos?.length || 0;
    }
  }
  return { subjects, chapters: chaptersCount, videos };
}
