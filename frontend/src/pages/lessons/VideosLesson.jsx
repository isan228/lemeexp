import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { getVideoWatchedSeconds, isLessonVideoCompleted } from "../../utils/videoProgress.js";

export default function VideosLesson() {
  const { subjectId, chapterId } = useParams();
  const sid = Number(subjectId);
  const cid = Number(chapterId);
  const { chapters, catalogLoading, progress } = useAuth();

  const { subject, chapter } = useMemo(() => {
    const subj = chapters.find((c) => Number(c.id) === sid);
    const ch = subj?.subtopics?.find((s) => Number(s.id) === cid);
    return { subject: subj, chapter: ch };
  }, [chapters, sid, cid]);

  if (catalogLoading) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <p className="muted">Загрузка каталога…</p>
      </section>
    );
  }

  if (!Number.isFinite(sid) || !Number.isFinite(cid) || !subject || !chapter) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <p>Раздел не найден.</p>
        <Link to="/learning/lessons">← К предметам</Link>
      </section>
    );
  }

  const videos = chapter.videos || [];
  const watched = progress?.watchedSeconds || {};
  const videoCompleted = progress?.videoCompleted || {};
  const stoppedVideoId = Number(progress?.lastVideoId || 0);
  const rowCompleted = (v) =>
    isLessonVideoCompleted(
      getVideoWatchedSeconds(watched, v.id),
      Number(v.duration) || 0,
      videoCompleted,
      v.id
    );
  const stoppedIndex = videos.findIndex((v) => Number(v.id) === stoppedVideoId);
  const nextVideoId =
    stoppedIndex >= 0 && stoppedIndex + 1 < videos.length
      ? Number(videos[stoppedIndex + 1].id)
      : Number(videos.find((v) => !rowCompleted(v))?.id || 0);

  const formatMinutes = (seconds) => `${Math.floor(Number(seconds || 0) / 60)} мин`;
  const formatClock = (seconds) => {
    const sec = Math.max(0, Number(seconds || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <section className="lessons-flow lessons-flow-padded">
      <div className="breadcrumb">
        <Link to="/learning/lessons">Предметы</Link>
        <span className="bc-sep">/</span>
        <Link to={`/learning/lessons/${subject.id}`}>{subject.title}</Link>
        <span className="bc-sep">/</span>
        <span>{chapter.title}</span>
      </div>
      <header className="student-page-head">
        <p className="student-page-kicker">Видео</p>
        <h1>{chapter.title}</h1>
        <p className="subtitle student-page-intro">Выберите урок и нажмите «Смотреть».</p>
      </header>

      <ul className="video-rows">
        {videos.map((v) => {
          const vId = Number(v.id);
          const watchedSeconds = getVideoWatchedSeconds(watched, v.id);
          const completed = rowCompleted(v);
          const hasPartialProgress = !completed && watchedSeconds > 0;
          const isNext = vId === nextVideoId && !completed;
          const watchHref = hasPartialProgress
            ? `/learning/lessons/${subject.id}/chapters/${chapter.id}/videos/${v.id}?resume=1`
            : `/learning/lessons/${subject.id}/chapters/${chapter.id}/videos/${v.id}`;
          return (
            <li key={v.id} className="card video-row video-row-youtube">
              <Link to={watchHref} className="video-row-link">
                <div className="video-thumb" aria-hidden="true">
                  <img
                    src={`https://picsum.photos/seed/drm-lesson-${v.id}/640/360`}
                    alt={v.title}
                    loading="lazy"
                    className="video-thumb-img"
                  />
                  <span className="video-thumb-play">▶</span>
                  <span className="video-thumb-duration">{formatClock(v.duration || 0)}</span>
                </div>
                <div className="video-meta">
                  <strong>{v.title}</strong>
                  <div className="muted small">{formatMinutes(v.duration || 0)}</div>
                  <div className="video-statuses">
                    {completed ? <span className="status-badge status-done">Просмотрено</span> : null}
                    {hasPartialProgress ? (
                      <span className="status-badge status-stopped">Остановились: {formatClock(watchedSeconds)}</span>
                    ) : null}
                    {isNext ? <span className="status-badge status-next">Следующее</span> : null}
                  </div>
                </div>
              </Link>
              <div className="video-row-actions">
                <Link to={watchHref} className="btn-primary inline">
                  {hasPartialProgress ? "Продолжить" : "Смотреть"}
                </Link>
                <Link
                  to={`/learning/support?videoId=${v.id}&videoTitle=${encodeURIComponent(v.title || "")}`}
                  className="btn-secondary inline"
                >
                  Вопросы к уроку
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      {videos.length === 0 && <p className="muted">В этой главе пока нет видео.</p>}

      <p className="back-row">
        <Link to={`/learning/lessons/${subject.id}`}>← К главам предмета</Link>
      </p>
    </section>
  );
}
