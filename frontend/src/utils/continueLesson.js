/** Находит урок для «Продолжить просмотр» по lastVideoId из прогресса. */
export function findContinueLesson(chapters, lastVideoId) {
  const vid = Number(lastVideoId);
  if (!vid || !Array.isArray(chapters)) return null;

  for (const subject of chapters) {
    for (const chapter of subject.subtopics || []) {
      const video = (chapter.videos || []).find((v) => Number(v.id) === vid);
      if (video) {
        return {
          subject,
          chapter,
          video,
          href: `/learning/lessons/${subject.id}/chapters/${chapter.id}/videos/${video.id}?resume=1`
        };
      }
    }
  }
  return null;
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
