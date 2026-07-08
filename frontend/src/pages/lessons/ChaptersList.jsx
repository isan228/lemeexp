import { Link, useParams } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { routes } from "../../config/site.js";
import { getChapterWatchProgressPercent } from "../../utils/videoProgress.js";

export default function ChaptersList() {
  const { subjectId } = useParams();
  const id = Number(subjectId);
  const { chapters, catalogLoading, catalogError, progress, loadCatalog } = useAuth();
  const subject = chapters.find((c) => Number(c.id) === id);
  const watched = progress?.watchedSeconds || {};
  const videoCompleted = progress?.videoCompleted || {};

  if (catalogLoading && chapters.length === 0) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <div className="loading-block">
          <div className="loading-spinner" aria-hidden="true" />
          <p className="muted">Загрузка каталога…</p>
        </div>
      </section>
    );
  }

  if (catalogError && chapters.length === 0) {
    return (
      <section className="lessons-flow lessons-flow-padded">
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
      <section className="lessons-flow lessons-flow-padded">
        <div className="empty-state card">
          <p>Предмет не найден.</p>
          <Link to={routes.learningLessons} className="btn-link">
            ← К предметам
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="lessons-flow lessons-flow-padded">
      <nav className="breadcrumb" aria-label="Навигация">
        <Link to={routes.learningLessons}>Предметы</Link>
        <span className="bc-sep">/</span>
        <span className="bc-current">{subject.title}</span>
      </nav>
      <PageHeader kicker="Главы" title={subject.title} intro="Выберите главу, чтобы открыть список видео." />
      <ul className="chapter-link-list">
        {(subject.subtopics || []).map((ch, index) => {
          const videosN = ch.videos?.length || 0;
          const progressPct = getChapterWatchProgressPercent(ch.videos, watched, videoCompleted);
          const completed = progressPct >= 100 && videosN > 0;
          const hasPartialProgress = progressPct > 0 && !completed;
          const rowClass = [
            "chapter-item",
            "card",
            completed ? "is-complete" : "",
            hasPartialProgress ? "has-progress" : ""
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <li key={ch.id} className={rowClass}>
              <Link to={routes.lessonChapter(subject.id, ch.id)} className="chapter-row">
                <span
                  className="video-lesson-progress-fill"
                  style={{ width: `${progressPct}%` }}
                  aria-hidden="true"
                />
                <div
                  className="chapter-row-inner"
                  role="progressbar"
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${ch.title}, просмотрено ${progressPct}%`}
                >
                  <span className="chapter-row-num">{index + 1}</span>
                  <span className="chapter-row-body">
                    <span className="chapter-title">{ch.title}</span>
                    <span className="muted small">
                      {videosN} {videosN === 1 ? "видео" : "видео"}
                      {progressPct > 0 ? ` · ${progressPct}%` : ""}
                    </span>
                  </span>
                  <span className="chapter-row-arrow" aria-hidden="true">
                    →
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {(subject.subtopics || []).length === 0 && (
        <div className="empty-state card">
          <p className="muted">В этом предмете пока нет глав.</p>
        </div>
      )}
      <p className="back-row">
        <Link to={routes.learningLessons}>← Все предметы</Link>
      </p>
    </section>
  );
}
