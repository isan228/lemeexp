import { Link, useParams, useSearchParams } from "react-router-dom";
import LessonPlayer from "../../components/LessonPlayer.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { isPlayableStream, isProcessingStream } from "../../utils/streamPath.js";

export default function VideoLessonPage() {
  const { subjectId, chapterId, videoId } = useParams();
  const [searchParams] = useSearchParams();
  const sid = Number(subjectId);
  const cid = Number(chapterId);
  const vid = Number(videoId);
  const { chapters, catalogLoading, apiRequest, refreshProgress, progress } = useAuth();

  const resume = searchParams.get("resume") === "1";
  const watchedMap = progress?.watchedSeconds || {};
  const initialPlaybackSeconds = resume ? Math.max(0, Math.floor(getVideoWatchedSeconds(watchedMap, vid))) : 0;

  const subject = chapters.find((c) => Number(c.id) === sid);
  const chapter = subject?.subtopics?.find((s) => Number(s.id) === cid);
  const video = chapter?.videos?.find((v) => Number(v.id) === vid) || null;
  const chapterVideos = chapter?.videos || [];

  if (catalogLoading) {
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
        <Link to="/learning/lessons">← К предметам</Link>
      </section>
    );
  }

  if (!video.streamPath?.trim()) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <p>Видео для этого урока ещё не загружено.</p>
        <Link to={`/learning/lessons/${subject.id}/chapters/${chapter.id}`}>← К списку видео</Link>
      </section>
    );
  }

  if (isProcessingStream(video.streamPath)) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <p>Видео готовится к просмотру. Подождите 1–2 минуты и обновите страницу.</p>
        <Link to={`/learning/lessons/${subject.id}/chapters/${chapter.id}`}>← К списку видео</Link>
      </section>
    );
  }

  if (!isPlayableStream(video.streamPath)) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <p>Этот урок пока недоступен для просмотра.</p>
        <Link to={`/learning/lessons/${subject.id}/chapters/${chapter.id}`}>← К списку видео</Link>
      </section>
    );
  }

  return (
    <section className="lessons-flow lessons-flow-padded">
      <div className="breadcrumb">
        <Link to="/learning/lessons">Предметы</Link>
        <span className="bc-sep">/</span>
        <Link to={`/learning/lessons/${subject.id}`}>{subject.title}</Link>
        <span className="bc-sep">/</span>
        <Link to={`/learning/lessons/${subject.id}/chapters/${chapter.id}`}>{chapter.title}</Link>
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
            video={video}
            apiRequest={apiRequest}
            onSavePosition={refreshProgress}
            initialPlaybackSeconds={initialPlaybackSeconds}
          />
        </div>
        <aside className="watch-sidebar card">
          <h3>Следующие уроки</h3>
          <ul className="watch-list">
            {chapterVideos.map((item) => {
              const active = Number(item.id) === vid;
              return (
                <li key={item.id}>
                  <Link
                    to={`/learning/lessons/${subject.id}/chapters/${chapter.id}/videos/${item.id}`}
                    className={active ? "watch-item active" : "watch-item"}
                  >
                    <span className="watch-item-thumb" aria-hidden="true">
                      <img
                        src={`https://picsum.photos/seed/drm-lesson-${item.id}/160/90`}
                        alt={item.title}
                        loading="lazy"
                        className="watch-item-thumb-img"
                      />
                      <span className="watch-item-thumb-play">▶</span>
                    </span>
                    <span className="watch-item-meta">
                      <strong>{item.title}</strong>
                      <span>{Math.floor(Number(item.duration || 0) / 60)} мин</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      <p className="back-row">
        <Link to={`/learning/lessons/${subject.id}/chapters/${chapter.id}`}>← К списку видео</Link>
      </p>
    </section>
  );
}
