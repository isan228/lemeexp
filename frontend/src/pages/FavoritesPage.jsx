import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { routes } from "../config/site.js";
import { findVideoById } from "../utils/continueLesson.js";
import { formatWatchDuration } from "../utils/watchTime.js";

function formatAddedAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export default function FavoritesPage() {
  const { chapters, catalogLoading, favoriteItems } = useAuth();

  const rows = favoriteItems
    .map((item) => {
      const location = findVideoById(chapters, item.videoId);
      if (!location) return null;
      const { subject, chapter, video } = location;
      return {
        ...item,
        subject,
        chapter,
        video,
        href: routes.lessonVideo(subject.id, chapter.id, video.id)
      };
    })
    .filter(Boolean);

  return (
    <section className="lessons-flow lessons-flow-padded">
      <PageHeader
        kicker="Коллекция"
        title="Избранное"
        intro="Сохранённые уроки, к которым хотите вернуться позже."
      />

      {catalogLoading ? (
        <div className="loading-block">
          <div className="loading-spinner" aria-hidden="true" />
          <p className="muted">Загрузка…</p>
        </div>
      ) : rows.length === 0 ? (
        <article className="card favorites-empty">
          <p>Пока нет избранных уроков.</p>
          <p className="muted small">
            Нажмите ☆ на странице урока или в списке видео, чтобы добавить в избранное.
          </p>
          <Link to={routes.learningLessons} className="btn-primary inline">
            К каталогу
          </Link>
        </article>
      ) : (
        <ul className="favorites-list">
          {rows.map((row) => {
            const duration = Number(row.video.duration) || 0;
            return (
              <li key={row.videoId} className="favorites-item card">
                <Link to={row.href} className="favorites-item-link">
                  <span className="favorites-item-star" aria-hidden="true">
                    ★
                  </span>
                  <span className="favorites-item-body">
                    <strong className="favorites-item-title">{row.video.title}</strong>
                    <span className="favorites-item-meta muted small">
                      {row.subject.title} · {row.chapter.title}
                      {duration > 0 ? ` · ${formatWatchDuration(duration)}` : ""}
                    </span>
                    {row.createdAt ? (
                      <span className="favorites-item-date muted small">
                        Добавлено {formatAddedAt(row.createdAt)}
                      </span>
                    ) : null}
                  </span>
                  <span className="favorites-item-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
