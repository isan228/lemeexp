import { Link, useParams } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { routes } from "../../config/site.js";

export default function ChaptersList() {
  const { subjectId } = useParams();
  const id = Number(subjectId);
  const { chapters, catalogLoading } = useAuth();
  const subject = chapters.find((c) => Number(c.id) === id);

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
        {(subject.subtopics || []).map((ch, index) => (
          <li key={ch.id}>
            <Link to={routes.lessonChapter(subject.id, ch.id)} className="chapter-row card">
              <span className="chapter-row-num">{index + 1}</span>
              <span className="chapter-row-body">
                <span className="chapter-title">{ch.title}</span>
                <span className="muted small">{ch.videos?.length || 0} видео</span>
              </span>
              <span className="chapter-row-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
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
