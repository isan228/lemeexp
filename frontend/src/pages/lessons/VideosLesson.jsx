import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { SUBSCRIPTION_PLAN } from "../../config/billing.js";
import { routes, GET_ACCESS_LABEL } from "../../config/site.js";
import { getVideoWatchedSeconds, isLessonVideoCompleted } from "../../utils/videoProgress.js";
import { isPlayableStream, isProcessingStream } from "../../utils/streamPath.js";

export default function VideosLesson() {
  const { subjectId, chapterId } = useParams();
  const sid = Number(subjectId);
  const cid = Number(chapterId);
  const { chapters, catalogLoading, progress } = useAuth();
  const subscribeHref = routes.payment(SUBSCRIPTION_PLAN.id);

  const { subject, chapter } = useMemo(() => {
    const subj = chapters.find((c) => Number(c.id) === sid);
    const ch = subj?.subtopics?.find((s) => Number(s.id) === cid);
    return { subject: subj, chapter: ch };
  }, [chapters, sid, cid]);

  if (catalogLoading) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <div className="loading-block">
          <div className="loading-spinner" aria-hidden="true" />
          <p className="muted">Загрузка каталога…</p>
        </div>
      </section>
    );
  }

  if (!Number.isFinite(sid) || !Number.isFinite(cid) || !subject || !chapter) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <p>Раздел не найден.</p>
        <Link to={routes.learningLessons}>← К предметам</Link>
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
      : Number(videos.find((v) => !rowCompleted(v) && !v.locked)?.id || 0);

  const formatMinutes = (seconds) => `${Math.floor(Number(seconds || 0) / 60)} мин`;
  const formatClock = (seconds) => {
    const sec = Math.max(0, Number(seconds || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <section className="lessons-flow lessons-flow-padded">
      <nav className="breadcrumb" aria-label="Навигация">
        <Link to={routes.learningLessons}>Предметы</Link>
        <span className="bc-sep">/</span>
        <Link to={routes.lessonSubject(subject.id)}>{subject.title}</Link>
        <span className="bc-sep">/</span>
        <span className="bc-current">{chapter.title}</span>
      </nav>
      <PageHeader kicker="Видео" title={chapter.title} intro="Выберите урок. Пробные доступны бесплатно, остальные — по подписке." />

      <ul className="video-rows">
        {videos.map((v) => {
          const vId = Number(v.id);
          const locked = Boolean(v.locked);
          const ready = !locked && isPlayableStream(v.streamPath);
          const processing = !locked && isProcessingStream(v.streamPath);
          const watchedSeconds = getVideoWatchedSeconds(watched, v.id);
          const completed = rowCompleted(v);
          const hasPartialProgress = !completed && watchedSeconds > 0;
          const isNext = ready && vId === nextVideoId && !completed;
          const watchHref = hasPartialProgress
            ? routes.lessonVideo(subject.id, chapter.id, v.id, { resume: true })
            : routes.lessonVideo(subject.id, chapter.id, v.id);

          const rowClass = [
            "card",
            "video-row",
            "video-row-youtube",
            locked ? "video-row-locked" : "",
            ready ? "" : " video-row-pending"
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <li key={v.id} className={rowClass}>
              {locked ? (
                <Link to={subscribeHref} className="video-row-link video-row-link-locked">
                  <div className="video-thumb video-thumb-locked" aria-hidden="true">
                    <img
                      src={`https://picsum.photos/seed/drm-lesson-${v.id}/640/360`}
                      alt=""
                      loading="lazy"
                      className="video-thumb-img"
                    />
                    <span className="video-thumb-lock">🔒</span>
                    <span className="video-thumb-duration">{formatClock(v.duration || 0)}</span>
                  </div>
                  <div className="video-meta">
                    <strong>{v.title}</strong>
                    <div className="muted small">{formatMinutes(v.duration || 0)}</div>
                    <p className="video-row-locked-hint">Просмотр недоступен — нужна подписка</p>
                    <div className="video-statuses">
                      <span className="status-badge status-locked">По подписке</span>
                    </div>
                  </div>
                </Link>
              ) : ready ? (
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
                      {v.isTrial ? <span className="status-badge status-trial">Пробник</span> : null}
                      {completed ? <span className="status-badge status-done">Просмотрено</span> : null}
                      {hasPartialProgress ? (
                        <span className="status-badge status-stopped">Остановились: {formatClock(watchedSeconds)}</span>
                      ) : null}
                      {isNext ? <span className="status-badge status-next">Следующее</span> : null}
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="video-row-link video-row-link-disabled">
                  <div className="video-thumb" aria-hidden="true">
                    <span className="video-thumb-play">⏳</span>
                  </div>
                  <div className="video-meta">
                    <strong>{v.title}</strong>
                    <div className="muted small">{formatMinutes(v.duration || 0)}</div>
                    <span className="status-badge">
                      {processing ? "Подготовка видео…" : "Видео загружается"}
                    </span>
                  </div>
                </div>
              )}
              <div className="video-row-actions">
                {locked ? (
                  <Link to={subscribeHref} className="btn-get-access inline">
                    {GET_ACCESS_LABEL}
                  </Link>
                ) : ready ? (
                  <Link to={watchHref} className="btn-watch inline">
                    {hasPartialProgress ? "Продолжить" : "Смотреть"}
                  </Link>
                ) : (
                  <span className="btn-secondary inline" style={{ opacity: 0.7, cursor: "default" }}>
                    {processing ? "Готовится" : "Скоро"}
                  </span>
                )}
                {!locked ? (
                  <Link
                    to={routes.learningSupportLesson(v.id, v.title || "")}
                    className="btn-secondary inline"
                  >
                    Вопросы к уроку
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {videos.length === 0 && <p className="muted">В этой главе пока нет видео.</p>}

      <p className="back-row">
        <Link to={routes.lessonSubject(subject.id)}>← К главам предмета</Link>
      </p>
    </section>
  );
}
