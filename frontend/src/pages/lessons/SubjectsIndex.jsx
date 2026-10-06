import { useAuth } from "../../context/AuthContext.jsx";
import { routes } from "../../config/site.js";
import {
  getChapterWatchProgressPercent,
  getSubjectWatchProgressPercent
} from "../../utils/videoProgress.js";
import {
  countCompletedVideos,
  formatChaptersCount,
  formatLessonsCount,
  formatSubjectsCount,
  subjectVideos
} from "../../utils/lessonsFormat.js";
import { CourseProgress, LessonsHeader, MetaDot, PathCard } from "../../components/lessons/LessonsPath.jsx";

export default function SubjectsIndex() {
  const { chapters, catalogLoading, catalogError, progress, loadCatalog } = useAuth();
  const watched = progress?.watchedSeconds || {};
  const videoCompleted = progress?.videoCompleted || {};
  const allVideos = chapters.flatMap(subjectVideos);

  return (
    <section className="lessons-flow lessons-flow-padded lp-page">
      <LessonsHeader
        title="Предметы"
        stats={
          chapters.length > 0 ? [formatSubjectsCount(chapters.length), formatLessonsCount(allVideos.length)] : []
        }
      />
      {catalogLoading && chapters.length === 0 ? (
        <div className="loading-block">
          <div className="loading-spinner" aria-hidden="true" />
          <p className="muted">Загрузка каталога…</p>
        </div>
      ) : catalogError && chapters.length === 0 ? (
        <div className="empty-state card">
          <p>{catalogError}</p>
          <button type="button" className="btn-primary" onClick={() => void loadCatalog()}>
            Повторить загрузку
          </button>
        </div>
      ) : (
        <>
          {allVideos.length > 0 ? (
            <CourseProgress
              title="Общий прогресс"
              done={countCompletedVideos(allVideos, watched, videoCompleted)}
              total={allVideos.length}
              percent={getChapterWatchProgressPercent(allVideos, watched, videoCompleted)}
            />
          ) : null}
          <ul className="lp-card-list">
            {chapters.map((subject) => {
              const chaptersN = subject.subtopics?.length || 0;
              const videosN = subjectVideos(subject).length;
              const percent = getSubjectWatchProgressPercent(subject, watched, videoCompleted);
              const completed = percent >= 100 && videosN > 0;
              return (
                <li key={subject.id}>
                  <PathCard
                    to={routes.lessonSubject(subject.id)}
                    state={completed ? "completed" : "upcoming"}
                    title={subject.title}
                    percent={percent}
                    action="chevron"
                    ariaLabel={`${subject.title}, просмотрено ${percent}%`}
                    meta={
                      <>
                        <span>{formatChaptersCount(chaptersN)}</span>
                        <MetaDot />
                        <span>{formatLessonsCount(videosN)}</span>
                      </>
                    }
                  />
                </li>
              );
            })}
          </ul>
          {chapters.length === 0 && (
            <div className="empty-state card">
              <p>Каталог пока пуст.</p>
              <p className="muted small">Новые предметы появятся здесь после публикации в админке.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
