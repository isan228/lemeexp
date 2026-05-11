import { useAuth } from "../context/AuthContext.jsx";

export default function ProfilePage() {
  const { profile } = useAuth();

  return (
    <section className="lessons-flow lessons-flow-padded">
      <header className="student-page-head">
        <p className="student-page-kicker">Аккаунт</p>
        <h1>Профиль</h1>
        <p className="subtitle student-page-intro">Данные вашей учётной записи.</p>
      </header>
      <article className="card profile-card">
      <dl className="profile-dl">
        <dt>Ник</dt>
        <dd>{profile?.nickname || "—"}</dd>
        <dt>Email</dt>
        <dd>{profile?.email || "—"}</dd>
        <dt>Тариф</dt>
        <dd>{profile?.subscriptionType || "—"}</dd>
      </dl>
      </article>
    </section>
  );
}
