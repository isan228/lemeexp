import { Link, useParams, useSearchParams } from "react-router-dom";
import { useCallback, useMemo } from "react";
import LessonPlayer from "../../components/LessonPlayer.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { SUBSCRIPTION_PLAN } from "../../config/billing.js";
import { routes } from "../../config/site.js";
import { isPlayableStream, isProcessingStream } from "../../utils/streamPath.js";
import { getVideoWatchedSeconds } from "../../utils/videoProgress.js";

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
  }, [resume, vid]);

  const onSavePosition = useCallback(async () => {
    await refreshProgress();
  }, [refreshProgress]);

  const subject = chapters.find((c) => Number(c.id) === sid);
  const chapter = subject?.subtopics?.find((s) => Number(s.id) === cid);
  const video = chapter?.videos?.find((v) => Number(v.id) === vid) || null;
  const chapterVideos = chapter?.videos || [];

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

  if (catalogLoading && chapters.length === 0) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <p className="muted">Загрузка каталога…</p>
      </section>
    );
  }

  if (!Number.isFinite(sid) || !Number.isFinite(cid) || !Number.isFinite(vid) || !subject || !chapter || !video) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <p>Урок не найден.</p>
        <Link to={routes.learningLessons}>← К предметам</Link>
      </section>
    );
  }

  if (video.locked) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <div className="breadcrumb">
          <Link to={routes.learningLessons}>Предметы</Link>
          <span className="bc-sep">/</span>
          <Link to={routes.lessonSubject(subject.id)}>{subject.title}</Link>
          <span className="bc-sep">/</span>
          <Link to={routes.lessonChapter(subject.id, chapter.id)}>{chapter.title}</Link>
        </div>
        <article className="card paywall-card">
          <p className="student-page-kicker">Подписка</p>
          <h1>{video.title}</h1>
          <p className="muted">
            Этот урок доступен только по подписке. Оформите доступ на 1 месяц и смотрите весь каталог без ограничений.
          </p>
          <div className="paywall-actions">
            <Link to={routes.payment(SUBSCRIPTION_PLAN.id)} className="btn-primary">
              Купить подписку
            </Link>
            <Link to={routes.lessonChapter(subject.id, chapter.id)} className="btn-secondary">
              К списку уроков
            </Link>
          </div>
        </article>
      </section>
    );
  }

  if (!video.streamPath?.trim()) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <p>Видео для этого урока ещё не загружено.</p>
        <Link to={routes.lessonChapter(subject.id, chapter.id)}>← К списку видео</Link>
      </section>
    );
  }

  if (isProcessingStream(video.streamPath)) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <p>Видео готовится к просмотру. Подождите 1–2 минуты и обновите страницу.</p>
        <Link to={routes.lessonChapter(subject.id, chapter.id)}>← К списку видео</Link>
      </section>
    );
  }

  if (!isPlayableStream(video.streamPath)) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <p>Этот урок пока недоступен для просмотра.</p>
        <Link to={routes.lessonChapter(subject.id, chapter.id)}>← К списку видео</Link>
      </section>
    );
  }

  return (
    <section className="lessons-flow lessons-flow-padded">
      <div className="breadcrumb">
        <Link to={routes.learningLessons}>Предметы</Link>
        <span className="bc-sep">/</span>
        <Link to={routes.lessonSubject(subject.id)}>{subject.title}</Link>
        <span className="bc-sep">/</span>
        <Link to={routes.lessonChapter(subject.id, chapter.id)}>{chapter.title}</Link>
        <span className="bc-sep">/</span>
        <span>{video.title}</span>
      </div>

      <header className="student-page-head">
        <p className="student-page-kicker">Урок</p>
        <h1>{video.title}</h1>
        <p className="subtitle student-page-intro">Смотрите урок и продолжайте обучение в удобном темпе.</p>
      </header>

      <div className="watch-layout">
        <div className="watch-main">
          <LessonPlayer
            {...playerProps}
            apiRequest={apiRequest}
            onSavePosition={onSavePosition}
          />
        </div>
        <aside className="watch-sidebar card">
          <h3>Следующие уроки</h3>
          <ul className="watch-list">
            {chapterVideos.map((item) => {
              const active = Number(item.id) === vid;
              const itemHref = item.locked
                ? routes.payment(SUBSCRIPTION_PLAN.id)
                : routes.lessonVideo(subject.id, chapter.id, item.id);
              return (
                <li key={item.id}>
                  <Link
                    to={itemHref}
                    className={active ? "watch-item active" : "watch-item"}
                    onClick={(e) => {
                      if (active) e.preventDefault();
                    }}
                  >
                    <span className={`watch-item-thumb${item.locked ? " watch-item-thumb-locked" : ""}`} aria-hidden="true">
                      <img
                        src={`https://picsum.photos/seed/drm-lesson-${item.id}/160/90`}
                        alt={item.title}
                        loading="lazy"
                        className="watch-item-thumb-img"
                      />
                      <span className="watch-item-thumb-play">{item.locked ? "🔒" : "▶"}</span>
                    </span>
                    <span className="watch-item-meta">
                      <strong>{item.title}</strong>
                      <span>
                        {item.locked ? "По подписке" : `${Math.floor(Number(item.duration || 0) / 60)} мин`}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      <p className="back-row">
        <Link to={routes.lessonChapter(subject.id, chapter.id)}>← К списку видео</Link>
      </p>
    </section>
  );
}
