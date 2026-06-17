import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { SUBSCRIPTION_PLAN } from "../config/billing.js";
import { routes, GET_ACCESS_LABEL } from "../config/site.js";
import { formatSubscriptionExpiry, hasFullAccess } from "../utils/subscription.js";

const PLAN_LABELS = {
  free: "Пробный доступ",
  basic: "Базовый",
  pro: "Продвинутый",
  premium: "Подписка",
  mentor: "Ментор",
  admin: "Администратор"
};

export default function ProfilePage() {
  const { profile } = useAuth();
  const fullAccess = hasFullAccess(profile);
  const plan = fullAccess
    ? PLAN_LABELS[profile?.subscriptionType] || profile?.subscriptionType || "—"
    : PLAN_LABELS.free;
  const expiry = formatSubscriptionExpiry(profile?.subscriptionExpiresAt);

  return (
    <section className="lessons-flow lessons-flow-padded">
      <PageHeader kicker="Аккаунт" title="Профиль" intro="Данные вашей учётной записи и тариф." />
      <article className="card profile-card-v2">
        <div className="profile-avatar" aria-hidden="true">
          {(profile?.nickname || profile?.email || "?").charAt(0).toUpperCase()}
        </div>
        <dl className="profile-dl profile-dl-v2">
          <div className="profile-row">
            <dt>Логин</dt>
            <dd>{profile?.nickname || "—"}</dd>
          </div>
          <div className="profile-row">
            <dt>Email</dt>
            <dd>{profile?.email || "—"}</dd>
          </div>
          <div className="profile-row">
            <dt>Тариф</dt>
            <dd>
              <span className="profile-plan-badge">{plan}</span>
            </dd>
          </div>
          {fullAccess && expiry ? (
            <div className="profile-row">
              <dt>Доступ до</dt>
              <dd>{expiry}</dd>
            </div>
          ) : null}
        </dl>
        {!fullAccess ? (
          <div className="profile-upgrade">
            <p className="muted small">Полный каталог — по подписке на 1 месяц.</p>
            <Link to={routes.payment(SUBSCRIPTION_PLAN.id)} className="btn-get-access inline">
              {GET_ACCESS_LABEL}
            </Link>
          </div>
        ) : null}
      </article>
    </section>
  );
}
