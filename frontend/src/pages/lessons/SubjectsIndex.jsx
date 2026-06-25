import { Link } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { routes } from "../../config/site.js";
import { getSubjectWatchProgressPercent } from "../../utils/videoProgress.js";

function subjectVideoCount(subject) {
  return (subject.subtopics || []).reduce((n, ch) => n + (ch.videos?.length || 0), 0);
}

export default function SubjectsIndex() {
  const { chapters, catalogLoading, progress } = useAuth();
  const watched = progress?.watchedSeconds || {};
  const videoCompleted = progress?.videoCompleted || {};

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
          <ul className="chapter-link-list">
            {chapters.map((subject, index) => {
              const chaptersN = subject.subtopics?.length || 0;
              const videosN = subjectVideoCount(subject);
              const progressPct = getSubjectWatchProgressPercent(subject, watched, videoCompleted);
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
                <li key={subject.id} className={rowClass}>
                  <Link to={routes.lessonSubject(subject.id)} className="chapter-row">
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
                      aria-label={`${subject.title}, просмотрено ${progressPct}%`}
                    >
                      <span className="chapter-row-num">{index + 1}</span>
                      <span className="chapter-row-body">
                        <span className="chapter-title">{subject.title}</span>
                        <span className="muted small">
                          {chaptersN} {chaptersN === 1 ? "глава" : "глав"} · {videosN}{" "}
                          {videosN === 1 ? "урок" : "уроков"}
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
