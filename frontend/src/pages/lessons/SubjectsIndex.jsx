import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function SubjectsIndex() {
  const { chapters, catalogLoading } = useAuth();

  return (
    <section className="lessons-flow lessons-flow-padded">
      <header className="student-page-head">
        <p className="student-page-kicker">Каталог</p>
        <h1>Предметы</h1>
        <p className="subtitle student-page-intro">Выберите предмет, затем главу и видео.</p>
      </header>
      {catalogLoading ? (
        <p>Загрузка каталога…</p>
      ) : (
        <>
          <div className="subject-grid">
            {chapters.map((subject) => (
              <Link key={subject.id} to={`/learning/lessons/${subject.id}`} className="subject-card card">
                <h3>{subject.title}</h3>
                <p className="muted">Тем: {subject.subtopics?.length || 0}</p>
              </Link>
            ))}
          </div>
          {chapters.length === 0 && <p className="muted">Каталог пока пуст.</p>}
        </>
      )}
    </section>
  );
}
