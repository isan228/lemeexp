import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { SUBSCRIPTION_PLAN } from "../config/billing.js";
import { routes, GET_ACCESS_LABEL } from "../config/site.js";
import { countCatalogStats, findContinueLesson } from "../utils/continueLesson.js";
import { hasFullAccess } from "../utils/subscription.js";

export default function HomePage() {
  const { progress, chapters, profile, catalogLoading } = useAuth();
  const continueLesson = findContinueLesson(chapters, progress.lastVideoId);
  const stats = countCatalogStats(chapters);
  const pct = Math.min(100, Math.max(0, Number(progress.percentage) || 0));
  const name = profile?.nickname || profile?.email?.split("@")[0] || "студент";
  const fullAccess = hasFullAccess(profile);

  return (
    <section className="lessons-flow lessons-flow-padded">
      <PageHeader
        kicker="Личный кабинет"
        title={`Здравствуйте, ${name}`}
        intro={
          fullAccess
            ? "Продолжайте обучение с того места, где остановились."
            : "У вас открыты пробные уроки. Оформите подписку, чтобы смотреть весь каталог."
        }
        actions={
          <Link to={routes.learningLessons} className="btn-primary btn-study">
            К урокам
          </Link>
        }
      />

      {!fullAccess ? (
        <article className="home-trial-banner card">
          <div>
            <h2>Пробный доступ</h2>
            <p className="muted small">Смотрите бесплатные уроки или оформите подписку на 1 месяц.</p>
          </div>
            <Link to={routes.payment(SUBSCRIPTION_PLAN.id)} className="btn-get-access">
              {GET_ACCESS_LABEL}
            </Link>
        </article>
      ) : null}

      {continueLesson ? (
        <article className="home-continue card">
          <div className="home-continue-body">
            <p className="home-continue-label">Продолжить просмотр</p>
            <h2>{continueLesson.video.title}</h2>
            <p className="muted small">
              {continueLesson.subject.title} · {continueLesson.chapter.title}
            </p>
          </div>
          <Link to={continueLesson.href} className="btn-primary">
            Продолжить
          </Link>
        </article>
      ) : null}

      <div className="home-stats">
        <article className="home-stat card">
          <div className="home-progress-ring" style={{ "--pct": pct }} aria-hidden="true">
            <span>{pct}%</span>
          </div>
          <div>
            <h3>Прогресс</h3>
            <p className="muted small">
              {progress.completedCount ?? 0} из {progress.totalVideos ?? 0} уроков
            </p>
          </div>
        </article>
        <article className="home-stat card">
          <div className="home-stat-icon home-stat-icon-catalog" aria-hidden="true" />
          <div>
            <h3>Каталог</h3>
            <p className="muted small">
              {catalogLoading
                ? "Загрузка…"
                : `${stats.subjects} предм. · ${stats.chapters} глав · ${stats.videos} уроков`}
            </p>
          </div>
        </article>
        <article className="home-stat card">
          <div className="home-stat-icon home-stat-icon-support" aria-hidden="true" />
          <div>
            <h3>Поддержка</h3>
            <p className="muted small">Вопросы по урокам и технические проблемы</p>
            <Link to={routes.learningSupport} className="btn-link">
              Написать →
            </Link>
          </div>
        </article>
      </div>

      <div className="home-quick card-grid">
        <article className="card home-quick-card">
          <h3>Уроки</h3>
          <p className="muted">Предмет → глава → видеоурок</p>
          <Link to={routes.learningLessons} className="btn-secondary inline">
            Открыть каталог
          </Link>
        </article>
        <article className="card home-quick-card">
          <h3>Профиль</h3>
          <p className="muted">Тариф и данные аккаунта</p>
          <Link to={routes.learningProfile} className="btn-secondary inline">
            Настройки
          </Link>
        </article>
      </div>
    </section>
  );
}
