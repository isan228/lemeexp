import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import LockIcon from "../../components/LockIcon.jsx";
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

  const formatDurationLabel = (seconds) => {
    const total = Number(seconds || 0);
    if (total <= 0) return null;
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return sec > 0 ? `${min} мин ${sec} сек` : `${min} мин`;
  };
  const lessonsCount = videos.length;

  return (
    <section className="lessons-flow lessons-flow-padded lessons-videos-page">
      <header className="lessons-catalog-head">
        <nav className="breadcrumb lessons-breadcrumb" aria-label="Навигация">
          <Link to={routes.learningLessons}>Предметы</Link>
          <span className="bc-sep">/</span>
          <Link to={routes.lessonSubject(subject.id)}>{subject.title}</Link>
          <span className="bc-sep">/</span>
          <span className="bc-current">{chapter.title}</span>
        </nav>
        <h1 className="lessons-catalog-title">{chapter.title}</h1>
        <p className="lessons-catalog-meta">
          {lessonsCount} {lessonsCount === 1 ? "урок" : lessonsCount < 5 ? "урока" : "уроков"}
          <span className="lessons-catalog-meta-sep">·</span>
          {subject.title}
        </p>
      </header>

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
          const rowClass = [
            "card",
            "video-lesson-item",
            locked ? "is-locked" : "",
            ready ? "" : "is-pending",
            completed ? "is-complete" : "",
            hasPartialProgress ? "has-progress" : ""
          ]
            .filter(Boolean)
            .join(" ");

          const labelText = (() => {
            if (locked) return "По подписке";
            if (completed) return "Просмотрено";
            if (hasPartialProgress) return "Продолжить урок";
            if (isNext) return "Следующий урок";
            if (processing) return "Подготовка видео";
            if (!ready) return "Загрузка";
            return "Урок";
          })();

          const rowBody = (
            <>
              <span
                className="video-lesson-progress-fill"
                style={{ width: `${progressPct}%` }}
                aria-hidden="true"
              />
              <div
                className="video-lesson-content"
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${v.title}, просмотрено ${progressPct}%`}
              >
                <div className="video-lesson-body">
                  <span className="video-lesson-label">{labelText}</span>
                  <strong className="video-lesson-title">
                    {index + 1}. {v.title}
                  </strong>
                  <span className="video-lesson-meta">
                    {subject.title} · {chapter.title}
                    {v.isTrial ? " · Пробник" : null}
                    {!locked && ready && !completed && formatDurationLabel(v.duration)
                      ? ` · ${formatDurationLabel(v.duration)}`
                      : null}
                  </span>
                </div>
                <LessonPlayButton locked={locked} ready={ready} />
              </div>
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
              ) : null}
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
