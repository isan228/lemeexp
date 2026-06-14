import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const PLAN_LABELS = {
  free: "Бесплатный",
  basic: "Базовый",
  pro: "Продвинутый",
  mentor: "Ментор",
  premium: "Премиум",
  admin: "Администратор"
};

export default function ProfilePage() {
  const { profile } = useAuth();
  const plan = PLAN_LABELS[profile?.subscriptionType] || profile?.subscriptionType || "—";

  return (
    <section className="lessons-flow lessons-flow-padded">
      <PageHeader kicker="Аккаунт" title="Профиль" intro="Данные вашей учётной записи и тариф." />
      <article className="card profile-card-v2">
        <div className="profile-avatar" aria-hidden="true">
          {(profile?.nickname || profile?.email || "?").charAt(0).toUpperCase()}
        </div>
        <dl className="profile-dl profile-dl-v2">
          <div className="profile-row">
            <dt>Имя</dt>
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
        </dl>
      </article>
    </section>
  );
}
