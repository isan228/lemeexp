import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { routes } from "../../config/site.js";
import { getChapterWatchProgressPercent } from "../../utils/videoProgress.js";
import {
  countCompletedVideos,
  formatChaptersCount,
  formatDuration,
  formatLessonsCount,
  subjectVideos,
  sumDuration
} from "../../utils/lessonsFormat.js";
import {
  ClockIcon,
  CourseProgress,
  LessonsHeader,
  MetaDot,
  PathCard,
  TimelineStep
} from "../../components/lessons/LessonsPath.jsx";

export default function ChaptersList() {
  const { subjectId } = useParams();
  const id = Number(subjectId);
  const { chapters, catalogLoading, catalogError, progress, loadCatalog } = useAuth();
  const subject = chapters.find((c) => Number(c.id) === id);
  const watched = progress?.watchedSeconds || {};
  const videoCompleted = progress?.videoCompleted || {};

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

  if (!Number.isFinite(id) || !subject) {
    return (
      <section className="lessons-flow lessons-flow-padded lp-page">
        <div className="empty-state card">
          <p>Предмет не найден.</p>
          <Link to={routes.learningLessons} className="btn-link">
            ← К предметам
          </Link>
        </div>
      </section>
    );
  }

  const subtopics = subject.subtopics || [];
  const allVideos = subjectVideos(subject);
  const items = subtopics.map((ch) => {
    const videos = ch.videos || [];
    const percent = getChapterWatchProgressPercent(videos, watched, videoCompleted);
    return { ch, videos, percent, completed: videos.length > 0 && percent >= 100 };
  });
  const currentId = Number(items.find((item) => !item.completed && item.videos.length > 0)?.ch.id || 0);
  const subjectPercent = getChapterWatchProgressPercent(allVideos, watched, videoCompleted);

  return (
    <section className="lessons-flow lessons-flow-padded lp-page">
      <LessonsHeader
        backTo={routes.learningLessons}
        backLabel="Все предметы"
        crumbs={[{ label: "Предметы", to: routes.learningLessons }]}
        title={subject.title}
        stats={[
          formatChaptersCount(subtopics.length),
          formatLessonsCount(allVideos.length),
          formatDuration(sumDuration(allVideos))
        ]}
      />

      {allVideos.length > 0 ? (
        <CourseProgress
          title="Прогресс предмета"
          done={countCompletedVideos(allVideos, watched, videoCompleted)}
          total={allVideos.length}
          percent={subjectPercent}
        />
      ) : null}

      <ol className="lp-timeline">
        {items.map(({ ch, videos, percent, completed }) => {
          const state = completed ? "completed" : Number(ch.id) === currentId ? "current" : "upcoming";
          const durationLabel = formatDuration(sumDuration(videos));
          return (
            <TimelineStep key={ch.id} state={state}>
              <PathCard
                to={routes.lessonChapter(subject.id, ch.id)}
                state={state}
                title={ch.title}
                percent={percent}
                action="chevron"
                ariaLabel={`${ch.title}, просмотрено ${percent}%`}
                meta={
                  <>
                    <span>{formatLessonsCount(videos.length)}</span>
                    {durationLabel ? (
                      <>
                        <MetaDot />
                        <ClockIcon />
                        <span>{durationLabel}</span>
                      </>
                    ) : null}
                  </>
                }
              />
            </TimelineStep>
          );
        })}
      </ol>

      {subtopics.length === 0 ? (
        <div className="empty-state card">
          <p className="muted">В этом предмете пока нет глав.</p>
        </div>
      ) : null}
    </section>
  );
}
