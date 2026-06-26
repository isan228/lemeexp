import { Link, useParams, useSearchParams } from "react-router-dom";
import { useCallback, useMemo } from "react";
import LessonComments from "../../components/LessonComments.jsx";
import LessonPlayer from "../../components/LessonPlayer.jsx";
import LessonVideoNav from "../../components/LessonVideoNav.jsx";
import FavoriteButton from "../../components/FavoriteButton.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { SUBSCRIPTION_PLAN } from "../../config/billing.js";
import { routes, GET_ACCESS_LABEL } from "../../config/site.js";
import { isPlayableStream, isProcessingStream } from "../../utils/streamPath.js";
import { getVideoWatchedSeconds } from "../../utils/videoProgress.js";

function formatDurationLabel(seconds) {
  const total = Number(seconds || 0);
  if (total <= 0) return null;
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return sec > 0 ? `${min} мин ${sec} сек` : `${min} мин`;
}

export default function VideoLessonPage() {
  const { subjectId, chapterId, videoId } = useParams();
  const [searchParams] = useSearchParams();
  const sid = Number(subjectId);
  const cid = Number(chapterId);
  const vid = Number(videoId);
  const { chapters, catalogLoading, apiRequest, refreshProgress, progress } = useAuth();

  const resume = searchParams.get("resume") === "1";
  const watchedMap = progress?.watchedSeconds || {};
  const initialPlaybackSeconds = useMemo(() => {
    if (!resume) return 0;
    return Math.max(0, Math.floor(getVideoWatchedSeconds(watchedMap, vid)));
  }, [resume, vid, watchedMap]);

  const onSavePosition = useCallback(async () => {
    await refreshProgress();
  }, [refreshProgress]);

  const subject = chapters.find((c) => Number(c.id) === sid);
  const chapter = subject?.subtopics?.find((s) => Number(s.id) === cid);
  const video = chapter?.videos?.find((v) => Number(v.id) === vid) || null;
  const chapterVideos = chapter?.videos || [];
  const lessonIndex = chapterVideos.findIndex((v) => Number(v.id) === vid);

  const playerProps = useMemo(
    () => ({
      videoId: vid,
      videoTitle: video?.title || "",
      streamPath: video?.streamPath || "",
      durationSec: Number(video?.duration) || 0,
      initialPlaybackSeconds
    }),
    [vid, video?.title, video?.streamPath, video?.duration, initialPlaybackSeconds]
  );

  const chapterHref = routes.lessonChapter(subject?.id, chapter?.id);

  if (catalogLoading && chapters.length === 0) {
    return (
      <section className="lessons-flow lessons-flow-padded lesson-watch-page">
        <div className="lesson-watch-loading">
          <span className="loading-spinner" aria-hidden="true" />
          <p className="muted">Загрузка урока…</p>
        </div>
      </section>
    );
  }

  if (!Number.isFinite(sid) || !Number.isFinite(cid) || !Number.isFinite(vid) || !subject || !chapter || !video) {
    return (
      <section className="lessons-flow lessons-flow-padded lesson-watch-page">
        <article className="lesson-watch-empty card">
          <p>Урок не найден.</p>
          <Link to={routes.learningLessons}>← К предметам</Link>
        </article>
      </section>
    );
  }

  if (video.locked) {
    return (
      <section className="lessons-flow lessons-flow-padded lesson-watch-page">
        <nav className="breadcrumb lessons-breadcrumb" aria-label="Навигация">
          <Link to={routes.learningLessons}>Предметы</Link>
          <span className="bc-sep">/</span>
          <Link to={routes.lessonSubject(subject.id)}>{subject.title}</Link>
          <span className="bc-sep">/</span>
          <Link to={chapterHref}>{chapter.title}</Link>
        </nav>
        <article className="card paywall-card">
          <p className="student-page-kicker">Подписка</p>
          <h1>{video.title}</h1>
          <p className="muted">
            Этот урок доступен только по подписке. Оформите доступ на 1 месяц и смотрите весь каталог без ограничений.
          </p>
          <div className="paywall-actions">
            <Link to={routes.payment(SUBSCRIPTION_PLAN.id)} className="btn-get-access">
              {GET_ACCESS_LABEL}
            </Link>
            <Link to={chapterHref} className="btn-secondary">
              К списку уроков
            </Link>
          </div>
        </article>
      </section>
    );
  }

  if (!video.streamPath?.trim()) {
    return (
      <section className="lessons-flow lessons-flow-padded lesson-watch-page">
        <article className="lesson-watch-empty card">
          <p>Видео для этого урока ещё не загружено.</p>
          <Link to={chapterHref}>← К списку видео</Link>
        </article>
      </section>
    );
  }

  if (isProcessingStream(video.streamPath)) {
    return (
      <section className="lessons-flow lessons-flow-padded lesson-watch-page">
        <article className="lesson-watch-empty card">
          <p>Видео готовится к просмотру. Подождите 1–2 минуты и обновите страницу.</p>
          <Link to={chapterHref}>← К списку видео</Link>
        </article>
      </section>
    );
  }

  if (!isPlayableStream(video.streamPath)) {
    return (
      <section className="lessons-flow lessons-flow-padded lesson-watch-page">
        <article className="lesson-watch-empty card">
          <p>Этот урок пока недоступен для просмотра.</p>
          <Link to={chapterHref}>← К списку видео</Link>
        </article>
      </section>
    );
  }

  const durationLabel = formatDurationLabel(video.duration);
  const lessonNumber = lessonIndex >= 0 ? lessonIndex + 1 : null;

  return (
    <section className="lessons-flow lessons-flow-padded lesson-watch-page">
      <nav className="breadcrumb lessons-breadcrumb" aria-label="Навигация">
        <Link to={routes.learningLessons}>Предметы</Link>
        <span className="bc-sep">/</span>
        <Link to={routes.lessonSubject(subject.id)}>{subject.title}</Link>
        <span className="bc-sep">/</span>
        <Link to={chapterHref}>{chapter.title}</Link>
      </nav>

      <header className="lesson-watch-head">
        <Link to={chapterHref} className="lesson-watch-back">
          ← К списку уроков
        </Link>
        <div className="lesson-watch-title-block">
          <div className="lesson-watch-title-row">
            {lessonNumber ? <span className="lesson-watch-num">Урок {lessonNumber}</span> : null}
            <FavoriteButton videoId={vid} showLabel size="md" />
          </div>
          <h1 className="lesson-watch-title">{video.title}</h1>
          <div className="lesson-watch-meta">
            <span>{subject.title}</span>
            <span className="lesson-watch-meta-sep">·</span>
            <span>{chapter.title}</span>
            {durationLabel ? (
              <>
                <span className="lesson-watch-meta-sep">·</span>
                <span>{durationLabel}</span>
              </>
            ) : null}
            {video.isTrial ? (
              <>
                <span className="lesson-watch-meta-sep">·</span>
                <span className="lesson-watch-badge">Пробник</span>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="lesson-watch-player">
        <LessonPlayer {...playerProps} apiRequest={apiRequest} onSavePosition={onSavePosition} />
      </div>

      <LessonVideoNav
        subjectId={subject.id}
        chapterId={chapter.id}
        videos={chapterVideos}
        currentVideoId={vid}
      />

      <LessonComments videoId={vid} videoTitle={video.title} />
    </section>
  );
}
