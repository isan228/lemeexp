import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { SUBSCRIPTION_PLAN } from "../../config/billing.js";
import { routes, GET_ACCESS_LABEL } from "../../config/site.js";
import {
  getChapterWatchProgressPercent,
  getVideoWatchedSeconds,
  getVideoWatchProgressPercent,
  isLessonVideoCompleted
} from "../../utils/videoProgress.js";
import { isPlayableStream, isProcessingStream } from "../../utils/streamPath.js";
import { formatDuration, formatLessonsCount, sumDuration } from "../../utils/lessonsFormat.js";
import {
  ClockIcon,
  CourseProgress,
  LessonsHeader,
  PathCard,
  TimelineStep
} from "../../components/lessons/LessonsPath.jsx";

export default function VideosLesson() {
  const { subjectId, chapterId } = useParams();
  const sid = Number(subjectId);
  const cid = Number(chapterId);
  const { chapters, catalogLoading, catalogError, progress, loadCatalog } = useAuth();
  const subscribeHref = routes.payment(SUBSCRIPTION_PLAN.id);

  const { subject, chapter } = useMemo(() => {
    const subj = chapters.find((c) => Number(c.id) === sid);
    const ch = subj?.subtopics?.find((s) => Number(s.id) === cid);
    return { subject: subj, chapter: ch };
  }, [chapters, sid, cid]);

  if (catalogLoading && chapters.length === 0) {
    return (
      <section className="lessons-flow lessons-flow-padded lp-page">
        <div className="loading-block">
          <div className="loading-spinner" aria-hidden="true" />
          <p className="muted">Загрузка каталога…</p>
        </div>
      </section>
    );
  }

  if (catalogError && chapters.length === 0) {
    return (
      <section className="lessons-flow lessons-flow-padded lp-page">
        <div className="empty-state card">
          <p>{catalogError}</p>
          <button type="button" className="btn-primary" onClick={() => void loadCatalog()}>
            Повторить загрузку
          </button>
        </div>
      </section>
    );
  }

  if (!Number.isFinite(sid) || !Number.isFinite(cid) || !subject || !chapter) {
    return (
      <section className="lessons-flow lessons-flow-padded lp-page">
        <div className="empty-state card">
          <p>Раздел не найден.</p>
          <Link to={routes.learningLessons} className="btn-link">
            ← К предметам
          </Link>
        </div>
      </section>
    );
  }

  const videos = chapter.videos || [];
  const watched = progress?.watchedSeconds || {};
  const videoCompleted = progress?.videoCompleted || {};

  const items = videos.map((v) => {
    const locked = Boolean(v.locked);
    const ready = !locked && isPlayableStream(v.streamPath);
    const processing = !locked && isProcessingStream(v.streamPath);
    const duration = Number(v.duration) || 0;
    const watchedSeconds = getVideoWatchedSeconds(watched, v.id);
    const completed = isLessonVideoCompleted(watchedSeconds, duration, videoCompleted, v.id);
    const percent = getVideoWatchProgressPercent(watchedSeconds, duration, videoCompleted, v.id);
    return { v, locked, ready, processing, duration, watchedSeconds, completed, percent };
  });

  const stoppedVideoId = Number(progress?.lastVideoId || 0);
  const isAvailable = (item) => item.ready && !item.completed;
  const currentItem =
    items.find((item) => Number(item.v.id) === stoppedVideoId && isAvailable(item)) || items.find(isAvailable);
  const currentId = currentItem ? Number(currentItem.v.id) : 0;

  const completedCount = items.filter((item) => item.completed).length;
  const chapterPercent = getChapterWatchProgressPercent(videos, watched, videoCompleted);

  return (
    <section className="lessons-flow lessons-flow-padded lp-page">
      <LessonsHeader
        backTo={routes.lessonSubject(subject.id)}
        backLabel="К главам предмета"
        crumbs={[
          { label: "Предметы", to: routes.learningLessons },
          { label: subject.title, to: routes.lessonSubject(subject.id) }
        ]}
        title={chapter.title}
        stats={[formatLessonsCount(videos.length), formatDuration(sumDuration(videos))]}
      />

      {videos.length > 0 ? (
        <CourseProgress
          title="Прогресс главы"
          done={completedCount}
          total={videos.length}
          percent={chapterPercent}
        />
      ) : null}

      <ol className="lp-timeline">
        {items.map((item) => {
          const { v, locked, ready, processing, duration, watchedSeconds, completed, percent } = item;
          const isCurrent = Number(v.id) === currentId;
          const hasPartialProgress = !completed && watchedSeconds > 0;

          const state = locked
            ? "locked"
            : completed
              ? "completed"
              : isCurrent
                ? "current"
                : ready
                  ? "upcoming"
                  : "pending";
          const nodeState = state === "pending" ? "locked" : state;

          const watchHref = hasPartialProgress
            ? routes.lessonVideo(subject.id, chapter.id, v.id, { resume: true })
            : routes.lessonVideo(subject.id, chapter.id, v.id);
          const to = locked ? subscribeHref : ready ? watchHref : null;

          const status = locked
            ? GET_ACCESS_LABEL
            : processing
              ? "Подготовка"
              : !ready
                ? "Загрузка"
                : `${percent}%`;
          const durationLabel = formatDuration(duration);

          return (
            <TimelineStep key={v.id} state={nodeState}>
              <PathCard
                to={to}
                state={state}
                title={v.title}
                percent={percent}
                action={locked ? "locked" : ready ? "play" : "pending"}
                ariaLabel={`${v.title}. ${completed ? "Пройдено" : status}`}
                meta={
                  durationLabel ? (
                    <>
                      <ClockIcon />
                      <span>{durationLabel}</span>
                    </>
                  ) : null
                }
                status={locked ? <span className="lp-meta-accent">{status}</span> : status}
              />
            </TimelineStep>
          );
        })}
      </ol>

      {videos.length === 0 ? (
        <div className="empty-state card">
          <p className="muted">В этой главе пока нет видео.</p>
        </div>
      ) : null}
    </section>
  );
}
