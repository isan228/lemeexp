import { Link } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { routes } from "../../config/site.js";

function subjectVideoCount(subject) {
  return (subject.subtopics || []).reduce((n, ch) => n + (ch.videos?.length || 0), 0);
}

export default function SubjectsIndex() {
  const { chapters, catalogLoading } = useAuth();

  return (
    <section className="lessons-flow lessons-flow-padded">
      <PageHeader
        kicker="Каталог"
        title="Предметы"
        intro="Выберите предмет, затем главу и видеоурок."
      />
      {catalogLoading ? (
        <div className="loading-block">
          <div className="loading-spinner" aria-hidden="true" />
          <p className="muted">Загрузка каталога…</p>
        </div>
      ) : (
        <>
          <div className="subject-grid">
            {chapters.map((subject, index) => {
              const chaptersN = subject.subtopics?.length || 0;
              const videosN = subjectVideoCount(subject);
              return (
                <Link key={subject.id} to={routes.lessonSubject(subject.id)} className="subject-card card">
                  <span className="subject-card-num">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{subject.title}</h3>
                  <p className="muted small">
                    {chaptersN} {chaptersN === 1 ? "глава" : "глав"} · {videosN}{" "}
                    {videosN === 1 ? "урок" : "уроков"}
                  </p>
                  <span className="subject-card-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              );
            })}
          </div>
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
