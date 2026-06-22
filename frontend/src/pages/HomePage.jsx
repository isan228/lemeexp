import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { SUBSCRIPTION_PLAN } from "../config/billing.js";
import { routes, GET_ACCESS_LABEL } from "../config/site.js";
import { findContinueLesson } from "../utils/continueLesson.js";
import { hasFullAccess } from "../utils/subscription.js";
import { watchHoursLabel } from "../utils/watchTime.js";

const WATCH_PERIODS = [
  { key: "todaySeconds", label: "Сегодня" },
  { key: "yesterdaySeconds", label: "Вчера" },
  { key: "weekSeconds", label: "За неделю" }
];

export default function HomePage() {
  const { progress, chapters, profile } = useAuth();
  const continueLesson = findContinueLesson(chapters, progress.lastVideoId);
  const completed = progress.completedCount ?? 0;
  const total = progress.totalVideos ?? 0;
  const pct = total ? Math.min(100, Math.max(0, Number(progress.percentage) || 0)) : 0;
  const loginName = profile?.nickname || profile?.email?.split("@")[0] || "студент";
  const fullAccess = hasFullAccess(profile);
  const watchStats = progress.watchStats || {
    todaySeconds: 0,
    yesterdaySeconds: 0,
    weekSeconds: 0
  };
  const chartMax = Math.max(
    watchStats.todaySeconds,
    watchStats.yesterdaySeconds,
    watchStats.weekSeconds,
    1
  );

  return (
    <section className="lessons-flow lessons-flow-padded home-dashboard">
      <header className="home-dashboard-head">
        <p className="home-dashboard-kicker">Личный кабинет</p>
        <h1 className="home-dashboard-name">{loginName}</h1>
        <p className="home-dashboard-subtitle muted">
          {fullAccess
            ? "Ваша статистика обучения и прогресс по урокам."
            : "У вас открыты пробные уроки. Оформите подписку для полного доступа."}
        </p>
      </header>

      <article className="home-dashboard-panel card">
        <div className="home-dashboard-progress">
          <div className="home-dashboard-progress-head">
            <h2>Статистика</h2>
            <span className="home-dashboard-progress-pct">{pct}%</span>
          </div>
          <p className="home-dashboard-progress-meta">
            Просмотрено <strong>{completed}</strong> из <strong>{total}</strong> уроков
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

        <div className="home-dashboard-watch" aria-label="Время просмотра">
          <h3 className="home-dashboard-watch-title">Время просмотра</h3>
          <div className="home-dashboard-charts">
            {WATCH_PERIODS.map((period) => {
              const seconds = watchStats[period.key] ?? 0;
              const height = Math.max(8, Math.round((seconds / chartMax) * 100));
              return (
                <div key={period.key} className="home-dashboard-chart">
                  <div className="home-dashboard-chart-bar-wrap">
                    <span
                      className="home-dashboard-chart-bar"
                      style={{ height: `${height}%` }}
                      title={watchHoursLabel(seconds)}
                    />
                  </div>
                  <span className="home-dashboard-chart-value">{watchHoursLabel(seconds)}</span>
                  <span className="home-dashboard-chart-label">{period.label}</span>
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
