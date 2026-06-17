import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import SiteBrand from "../components/SiteBrand.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { SUBSCRIPTION_PLAN } from "../config/billing.js";
import { useBillingPlan } from "../hooks/useBillingPlan.js";
import { routes } from "../config/site.js";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTrial = searchParams.get("intent") === "trial";
  const { register } = useAuth();
  const { periodPriceLabel, loading: planLoading } = useBillingPlan();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onRegister(e) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const login = nickname.trim();
      if (!login) {
        throw new Error("Укажите логин");
      }
      await register(email, password, login);
      if (isTrial) {
        navigate(routes.learningLessons, { replace: true });
      } else {
        navigate(routes.payment(SUBSCRIPTION_PLAN.id), { replace: true });
      }
    } catch (err) {
      setError(err.message || "Ошибка регистрации");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="payment-stub-page register-page">
      <header className="auth-flow-header">
        <SiteBrand />
        <div className="auth-flow-header-actions">
          <Link to={routes.login} className="nav-muted">
            Войти
          </Link>
          <Link to={routes.home} className="nav-muted">
            Главная
          </Link>
        </div>
      </header>
      <div className="payment-stub-card card register-card">
        <div className="flow-hero">
          <p className="landing-kicker">{isTrial ? "Пробный доступ" : "Регистрация"}</p>
          {!isTrial && (
            <div className="flow-steps" aria-label="Этапы регистрации">
              <span className="flow-step active">1. Аккаунт</span>
              <span className="flow-step">2. Оплата</span>
            </div>
          )}
          <h1>{isTrial ? "Создайте аккаунт и смотрите пробники" : "Создание аккаунта"}</h1>
          <p className="muted">
            {isTrial
              ? "После регистрации откроются три бесплатных урока. Остальной каталог — по подписке."
              : "Зарегистрируйтесь и оформите подписку на все уроки на 1 месяц."}
          </p>
        </div>

        {!isTrial && (
          <div className="plan-card active" style={{ marginBottom: 20, cursor: "default" }}>
            <span className="plan-badge">Подписка</span>
            <strong>{SUBSCRIPTION_PLAN.name}</strong>
            <span className="plan-price">{planLoading ? "Загрузка цены…" : periodPriceLabel}</span>
            <ul>
              {SUBSCRIPTION_PLAN.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="form-error">{error}</p>}

        <form className="auth-form step-anim" onSubmit={onRegister}>
          <label>
            Логин
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              minLength={1}
              maxLength={80}
              autoComplete="username"
            />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label>
            Пароль (не короче 6 символов)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>
          <div className="register-form-actions">
            <Link to={routes.home} className="btn-secondary">
              На главную
            </Link>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Регистрация…" : isTrial ? "Попробовать" : "Перейти к оплате"}
            </button>
          </div>
          <p className="auth-page-links">
            Уже есть аккаунт? <Link to={routes.login}>Войти</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
