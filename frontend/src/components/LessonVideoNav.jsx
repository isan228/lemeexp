import { Link } from "react-router-dom";
import LockIcon from "./LockIcon.jsx";
import { routes } from "../config/site.js";
import { SUBSCRIPTION_PLAN } from "../config/billing.js";

function formatDurationLabel(seconds) {
  const total = Number(seconds || 0);
  if (total <= 0) return null;
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return sec > 0 ? `${min} мин ${sec} сек` : `${min} мин`;
}

function NavCard({ direction, video, subjectId, chapterId, subscribeHref }) {
  if (!video) {
    return (
      <div className={`watch-nav-slot watch-nav-slot-${direction} is-empty`} aria-hidden="true">
        <span className="watch-nav-placeholder">
          {direction === "prev" ? "Нет предыдущего урока" : "Нет следующего урока"}
        </span>
      </div>
    );
  }

  const locked = Boolean(video.locked);
  const href = locked
    ? subscribeHref
    : routes.lessonVideo(subjectId, chapterId, video.id);
  const duration = formatDurationLabel(video.duration);

  return (
    <Link
      to={href}
      className={`watch-nav-slot watch-nav-link watch-nav-slot-${direction}${locked ? " is-locked" : ""}`}
    >
      <span className="watch-nav-kicker">
        {direction === "prev" ? "← Предыдущий урок" : "Следующий урок →"}
      </span>
      <strong className="watch-nav-title">{video.title}</strong>
      <span className="watch-nav-meta">
        {locked ? (
          <>
            <LockIcon size={12} /> По подписке
          </>
        ) : duration ? (
          duration
        ) : (
          "Урок"
        )}
      </span>
    </Link>
  );
}

export default function LessonVideoNav({ subjectId, chapterId, videos, currentVideoId }) {
  const subscribeHref = routes.payment(SUBSCRIPTION_PLAN.id);
  const index = videos.findIndex((v) => Number(v.id) === Number(currentVideoId));
  const prevVideo = index > 0 ? videos[index - 1] : null;
  const nextVideo = index >= 0 && index < videos.length - 1 ? videos[index + 1] : null;

  if (!prevVideo && !nextVideo) return null;

  return (
    <nav className="watch-nav" aria-label="Навигация по урокам">
      <NavCard
        direction="prev"
        video={prevVideo}
        subjectId={subjectId}
        chapterId={chapterId}
        subscribeHref={subscribeHref}
      />
      <NavCard
        direction="next"
        video={nextVideo}
        subjectId={subjectId}
        chapterId={chapterId}
        subscribeHref={subscribeHref}
      />
    </nav>
  );
}
