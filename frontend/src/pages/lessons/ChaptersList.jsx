import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function ChaptersList() {
  const { subjectId } = useParams();
  const id = Number(subjectId);
  const { chapters, catalogLoading } = useAuth();
  const subject = chapters.find((c) => Number(c.id) === id);

  if (catalogLoading) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <p className="muted">Загрузка каталога…</p>
      </section>
    );
  }

  if (!Number.isFinite(id) || !subject) {
    return (
      <section className="lessons-flow lessons-flow-padded">
        <p>Предмет не найден.</p>
        <Link to="/learning/lessons">← К предметам</Link>
      </section>
    );
  }

  return (
    <section className="lessons-flow lessons-flow-padded">
      <div className="breadcrumb">
        <Link to="/learning/lessons">Предметы</Link>
        <span className="bc-sep">/</span>
        <span>{subject.title}</span>
      </div>
      <header className="student-page-head">
        <p className="student-page-kicker">Главы</p>
        <h1>{subject.title}</h1>
        <p className="subtitle student-page-intro">Выберите главу, чтобы открыть список видео.</p>
      </header>
      <ul className="chapter-link-list">
        {(subject.subtopics || []).map((ch) => (
          <li key={ch.id}>
            <Link to={`/learning/lessons/${subject.id}/chapters/${ch.id}`} className="chapter-row card">
              <span className="chapter-title">{ch.title}</span>
              <span className="muted">{ch.videos?.length || 0} видео</span>
            </Link>
          </li>
        ))}
      </ul>
      {(subject.subtopics || []).length === 0 && <p className="muted">В этом предмете пока нет глав.</p>}
      <p className="back-row">
        <Link to="/learning/lessons">← Все предметы</Link>
      </p>
    </section>
  );
}
