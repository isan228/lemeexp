import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import LockIcon from "../../components/LockIcon.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { SUBSCRIPTION_PLAN } from "../../config/billing.js";
import { routes, GET_ACCESS_LABEL } from "../../config/site.js";
import {
  getVideoWatchedSeconds,
  getVideoWatchProgressPercent,
  isLessonVideoCompleted
} from "../../utils/videoProgress.js";
import { isPlayableStream, isProcessingStream } from "../../utils/streamPath.js";

function LessonPlayButton({ locked, ready }) {
  if (locked) {
    return (
      <span className="video-lesson-play-btn is-locked" aria-hidden="true">
        <LockIcon size={18} />
      </span>
    );
  }
  if (!ready) {
    return (
      <span className="video-lesson-play-btn is-pending" aria-hidden="true">
        ⏳
      </span>
    );
  }
  return (
    <span className="video-lesson-play-btn" aria-hidden="true">
      <span className="video-lesson-play-triangle" />
    </span>
  );
}

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

      <ul className="video-lesson-list">
        {videos.map((v, index) => {
          const vId = Number(v.id);
          const locked = Boolean(v.locked);
          const ready = !locked && isPlayableStream(v.streamPath);
          const processing = !locked && isProcessingStream(v.streamPath);
          const watchedSeconds = getVideoWatchedSeconds(watched, v.id);
          const completed = rowCompleted(v);
          const hasPartialProgress = !completed && watchedSeconds > 0;
          const isNext = ready && vId === nextVideoId && !completed;
          const progressPct = getVideoWatchProgressPercent(
            watchedSeconds,
            Number(v.duration) || 0,
            videoCompleted,
            v.id
          );
          const watchHref = hasPartialProgress
            ? routes.lessonVideo(subject.id, chapter.id, v.id, { resume: true })
            : routes.lessonVideo(subject.id, chapter.id, v.id);
          const lessonNum = String(index + 1).padStart(2, "0");

          const rowClass = [
            "card",
            "video-lesson-item",
            locked ? "is-locked" : "",
            ready ? "" : "is-pending"
          ]
            .filter(Boolean)
            .join(" ");

          const badges = (
            <div className="video-lesson-badges">
              {v.isTrial ? <span className="status-badge status-trial">Пробник</span> : null}
              {completed ? <span className="status-badge status-done">Просмотрено</span> : null}
              {hasPartialProgress ? (
                <span className="status-badge status-stopped">{progressPct}%</span>
              ) : null}
              {isNext ? <span className="status-badge status-next">Следующее</span> : null}
              {locked ? <span className="status-badge status-locked">По подписке</span> : null}
              {!locked && !completed ? (
                <span className="muted small video-lesson-duration">{formatMinutes(v.duration || 0)}</span>
              ) : null}
              {processing ? <span className="status-badge">Подготовка видео…</span> : null}
              {!locked && !ready && !processing ? (
                <span className="status-badge">Видео загружается</span>
              ) : null}
            </div>
          );

          const rowBody = (
            <>
              <span className="video-lesson-num">{lessonNum}</span>
              <div className="video-lesson-main">
                <strong className="video-lesson-title">{v.title}</strong>
                <div
                  className="video-lesson-progress-bar"
                  role="progressbar"
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Просмотрено ${progressPct}%`}
                >
                  {progressPct > 0 ? (
                    <span className="video-lesson-progress-fill" style={{ width: `${progressPct}%` }} />
                  ) : null}
                </div>
                {badges}
              </div>
              <LessonPlayButton locked={locked} ready={ready} />
            </>
          );

          return (
            <li key={v.id} className={rowClass}>
              {locked ? (
                <Link to={subscribeHref} className="video-lesson-link">
                  {rowBody}
                </Link>
              ) : ready ? (
                <Link to={watchHref} className="video-lesson-link">
                  {rowBody}
                </Link>
              ) : (
                <div className="video-lesson-link is-disabled">{rowBody}</div>
              )}
              {locked ? (
                <div className="video-lesson-extra">
                  <Link to={subscribeHref} className="btn-get-access inline">
                    {GET_ACCESS_LABEL}
                  </Link>
                </div>
              ) : (
                <div className="video-lesson-extra">
                  <Link to={routes.learningSupportLesson(v.id, v.title || "")} className="video-lesson-support-link">
                    Вопросы к уроку
                  </Link>
                </div>
              )}
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
