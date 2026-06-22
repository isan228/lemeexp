import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { SUBSCRIPTION_PLAN } from "../config/billing.js";
import { routes, GET_ACCESS_LABEL } from "../config/site.js";
import { findContinueLesson } from "../utils/continueLesson.js";
import { hasFullAccess } from "../utils/subscription.js";
import { normalizeLast7Days, watchHoursLabel } from "../utils/watchTime.js";

export default function HomePage() {
  const { progress, chapters, profile } = useAuth();
  const continueLesson = findContinueLesson(chapters, progress.lastVideoId);
  const completed = progress.completedCount ?? 0;
  const total = progress.totalVideos ?? 0;
  const pct = total ? Math.min(100, Math.max(0, Number(progress.percentage) || 0)) : 0;
  const loginName = profile?.nickname || profile?.email?.split("@")[0] || "студент";
  const fullAccess = hasFullAccess(profile);
  const last7Days = normalizeLast7Days(progress.watchStats);
  const chartMax = Math.max(...last7Days.map((day) => day.seconds), 1);

  return (
    <section className="lessons-flow lessons-flow-padded home-dashboard">
      <header className="home-dashboard-head">
        <div className="home-dashboard-head-top">
          <p className="home-dashboard-kicker">Личный кабинет</p>
          <h1 className="home-dashboard-name">{loginName}</h1>
        </div>
      </header>

      <article className="home-dashboard-panel card">
        <div className="home-dashboard-progress">
          <div className="home-dashboard-progress-head">
            <h2>Статистика</h2>
            <span className="home-dashboard-progress-pct">{pct}%</span>
          </div>
          <p className="home-dashboard-progress-meta">
            <strong>{completed}</strong> / <strong>{total}</strong> уроков
          </p>
          <div
            className="home-dashboard-progress-bar"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Пройдено ${completed} из ${total} уроков`}
          >
            <span className="home-dashboard-progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="home-dashboard-watch" aria-label="Время просмотра за 7 дней">
          <h3 className="home-dashboard-watch-title">7 дней</h3>
          <div className="home-dashboard-charts">
            {last7Days.map((day) => {
              const height = Math.max(8, Math.round((day.seconds / chartMax) * 100));
              return (
                <div key={day.date} className="home-dashboard-chart">
                  <div className="home-dashboard-chart-bar-wrap">
                    <span
                      className="home-dashboard-chart-bar"
                      style={{ height: `${height}%` }}
                      title={`${day.label}: ${watchHoursLabel(day.seconds)}`}
                    />
                  </div>
                  <span className="home-dashboard-chart-value">{watchHoursLabel(day.seconds)}</span>
                  <span className="home-dashboard-chart-label">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </article>

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

      <div className="home-quick card-grid">
        <article className="card home-quick-card">
          <h3>Уроки</h3>
          <p className="muted">Предмет → глава → видеоурок</p>
          <Link to={routes.learningLessons} className="btn-primary inline btn-study">
            К урокам
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
