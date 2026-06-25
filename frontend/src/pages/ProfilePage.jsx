import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { SUBSCRIPTION_PLAN } from "../config/billing.js";
import { routes, GET_ACCESS_LABEL } from "../config/site.js";
import { countCatalogStats, findContinueLesson } from "../utils/continueLesson.js";
import { formatSubscriptionExpiry, hasFullAccess } from "../utils/subscription.js";
import { formatWatchDuration, normalizeLast7Days } from "../utils/watchTime.js";

const PLAN_LABELS = {
  free: "Пробный доступ",
  basic: "Базовый",
  pro: "Продвинутый",
  premium: "Подписка",
  mentor: "Ментор",
  admin: "Администратор"
};

const PLAN_HINTS = {
  free: "Доступны пробные уроки. Оформите подписку для полного каталога.",
  basic: "Полный доступ к видеоурокам и личному кабинету.",
  pro: "Расширенный доступ ко всем материалам курса.",
  premium: "Полный каталог видео, тестов и менторской поддержки.",
  mentor: "Полный доступ с приоритетной поддержкой ментора.",
  admin: "Управление платформой и контентом."
};

function sumWatchedSeconds(watchedSeconds) {
  if (!watchedSeconds || typeof watchedSeconds !== "object") return 0;
  return Object.values(watchedSeconds).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

function sumLast7DaysSeconds(watchStats) {
  return normalizeLast7Days(watchStats).reduce((sum, day) => sum + Math.max(0, Number(day.seconds) || 0), 0);
}

function daysUntilExpiry(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function ProfilePage() {
  const { profile, progress, chapters } = useAuth();
  const fullAccess = hasFullAccess(profile);
  const subscriptionType = profile?.subscriptionType || "free";
  const plan = fullAccess ? PLAN_LABELS[subscriptionType] || subscriptionType : PLAN_LABELS.free;
  const planHint = PLAN_HINTS[subscriptionType] || PLAN_HINTS.free;
  const expiry = formatSubscriptionExpiry(profile?.subscriptionExpiresAt);
  const daysLeft = daysUntilExpiry(profile?.subscriptionExpiresAt);
  const loginName = profile?.nickname || profile?.email?.split("@")[0] || "Студент";

  const completed = progress.completedCount ?? 0;
  const total = progress.totalVideos ?? 0;
  const pct = total ? Math.min(100, Math.max(0, Number(progress.percentage) || 0)) : 0;
  const catalog = countCatalogStats(chapters);
  const totalWatched = sumWatchedSeconds(progress.watchedSeconds);
  const weekWatched = sumLast7DaysSeconds(progress.watchStats);
  const continueLesson = findContinueLesson(chapters, progress.lastVideoId);

  return (
    <section className="lessons-flow lessons-flow-padded profile-page">
      <header className="profile-hero card">
        <div className="profile-hero-main">
          <div className="profile-avatar profile-avatar-lg" aria-hidden="true">
            {(profile?.nickname || profile?.email || "?").charAt(0).toUpperCase()}
          </div>
          <div className="profile-hero-text">
            <p className="profile-hero-kicker">Профиль</p>
            <h1 className="profile-hero-name">{loginName}</h1>
            <p className="profile-hero-email">{profile?.email || "—"}</p>
          </div>
        </div>
        <div className="profile-hero-aside">
          <span className={`profile-plan-badge profile-plan-badge--${subscriptionType}`}>{plan}</span>
          {fullAccess && expiry ? (
            <p className="profile-hero-expiry muted small">
              {daysLeft != null && daysLeft <= 7 && daysLeft >= 0 ? (
                <span className="profile-expiry-warn">Осталось {daysLeft} дн.</span>
              ) : (
                <>до {expiry}</>
              )}
            </p>
          ) : null}
        </div>
      </header>

      <div className="profile-stats-grid" aria-label="Статистика обучения">
        <article className="profile-stat card">
          <span className="profile-stat-value">{pct}%</span>
          <span className="profile-stat-label">Пройдено курса</span>
        </article>
        <article className="profile-stat card">
          <span className="profile-stat-value">
            {completed}
            <span className="profile-stat-dim"> / {total}</span>
          </span>
          <span className="profile-stat-label">Уроков завершено</span>
        </article>
        <article className="profile-stat card">
          <span className="profile-stat-value">{catalog.subjects}</span>
          <span className="profile-stat-label">
            {catalog.subjects === 1 ? "Предмет" : "Предметов"} · {catalog.videos}{" "}
            {catalog.videos === 1 ? "урок" : "уроков"}
          </span>
        </article>
        <article className="profile-stat card">
          <span className="profile-stat-value">{formatWatchDuration(weekWatched)}</span>
          <span className="profile-stat-label">Просмотр за 7 дней</span>
        </article>
      </div>

      <article className="profile-panel card">
        <div className="profile-panel-head">
          <h2>Прогресс обучения</h2>
          <span className="profile-panel-pct">{pct}%</span>
        </div>
        <p className="profile-panel-meta muted">
          Завершено <strong>{completed}</strong> из <strong>{total}</strong> уроков
          {totalWatched > 0 ? (
            <>
              {" "}
              · всего просмотрено <strong>{formatWatchDuration(totalWatched)}</strong>
            </>
          ) : null}
        </p>
        <div
          className="home-dashboard-progress-bar profile-progress-bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Пройдено ${completed} из ${total} уроков`}
        >
          <span className="home-dashboard-progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        {continueLesson ? (
          <Link to={continueLesson.href} className="profile-continue-link">
            <span className="profile-continue-label">Продолжить</span>
            <span className="profile-continue-title">{continueLesson.video.title}</span>
            <span className="profile-continue-meta muted small">
              {continueLesson.subject.title} · {continueLesson.chapter.title}
            </span>
          </Link>
        ) : null}
      </article>

      <div className="profile-columns">
        <article className="profile-panel card">
          <h2 className="profile-panel-title">Подписка</h2>
          <dl className="profile-info-list">
            <div className="profile-info-row">
              <dt>Тариф</dt>
              <dd>
                <span className={`profile-plan-badge profile-plan-badge--${subscriptionType}`}>{plan}</span>
              </dd>
            </div>
            <div className="profile-info-row">
              <dt>Статус</dt>
              <dd>{fullAccess ? "Активен" : "Ограниченный доступ"}</dd>
            </div>
            {fullAccess && expiry ? (
              <div className="profile-info-row">
                <dt>Действует до</dt>
                <dd>{expiry}</dd>
              </div>
            ) : null}
            <div className="profile-info-row profile-info-row-wide">
              <dt>Что включено</dt>
              <dd className="muted">{planHint}</dd>
            </div>
          </dl>
          {!fullAccess ? (
            <div className="profile-upgrade">
              <p className="muted small">Полный каталог — подписка на {SUBSCRIPTION_PLAN.periodDays} дней.</p>
              <Link to={routes.payment(SUBSCRIPTION_PLAN.id)} className="btn-get-access inline">
                {GET_ACCESS_LABEL}
              </Link>
            </div>
          ) : subscriptionType !== "admin" ? (
            <p className="profile-renew muted small">
              <Link to={routes.payment(SUBSCRIPTION_PLAN.id)}>Продлить подписку</Link>
            </p>
          ) : null}
        </article>

        <article className="profile-panel card">
          <h2 className="profile-panel-title">Аккаунт</h2>
          <dl className="profile-info-list">
            <div className="profile-info-row">
              <dt>Логин</dt>
              <dd>{profile?.nickname || "—"}</dd>
            </div>
            <div className="profile-info-row">
              <dt>Email</dt>
              <dd>{profile?.email || "—"}</dd>
            </div>
            <div className="profile-info-row">
              <dt>ID</dt>
              <dd className="profile-id">{profile?.id ?? "—"}</dd>
            </div>
          </dl>

          <nav className="profile-quick-links" aria-label="Быстрые действия">
            <Link to={routes.learningHome} className="profile-quick-link">
              <span>Главная кабинета</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link to={routes.learningLessons} className="profile-quick-link">
              <span>Каталог уроков</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link to={routes.learningSupport} className="profile-quick-link">
              <span>Вопросы ментору</span>
              <span aria-hidden="true">→</span>
            </Link>
          </nav>
        </article>
      </div>
    </section>
  );
}
