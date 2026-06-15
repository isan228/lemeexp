import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteBrand from "../components/SiteBrand.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { SUBSCRIPTION_PLAN } from "../config/billing.js";
import { routes } from "../config/site.js";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [educationLevel, setEducationLevel] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onRegister(e) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const registrationNickname = nickname?.trim() || fullName?.trim() || "";
      await register(email, password, registrationNickname);
      navigate(routes.payment(SUBSCRIPTION_PLAN.id), {
        replace: true,
        state: {
          plan: SUBSCRIPTION_PLAN.id,
          form: { fullName, phone, educationLevel, nickname: registrationNickname, email }
        }
      });
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
          <p className="landing-kicker">Регистрация</p>
          <div className="flow-steps" aria-label="Этапы регистрации">
            <span className="flow-step active">1. Анкета</span>
            <span className="flow-step">2. Оплата</span>
          </div>
          <h1>Создание аккаунта</h1>
          <p className="muted">Заполните анкету и перейдите к оплате подписки.</p>
        </div>

        <div className="plan-card active" style={{ marginBottom: 20, cursor: "default" }}>
          <span className="plan-badge">Подписка</span>
          <strong>{SUBSCRIPTION_PLAN.name}</strong>
          <span className="plan-price">{SUBSCRIPTION_PLAN.periodLabel}</span>
          <ul>
            {SUBSCRIPTION_PLAN.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {error && <p className="form-error">{error}</p>}

        <form className="auth-form step-anim" onSubmit={onRegister}>
          <label>
            ФИО
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
          </label>
          <label>
            Телефон
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required autoComplete="tel" />
          </label>
          <label>
            Уровень подготовки
            <input
              type="text"
              value={educationLevel}
              onChange={(e) => setEducationLevel(e.target.value)}
              required
              placeholder="Например: 4 курс / ординатура"
            />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label>
            Ник (необязательно)
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={80} autoComplete="nickname" />
          </label>
          <label>
            Пароль (не короче 6 символов)
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </label>
          <div className="register-form-actions">
            <Link to={routes.home} className="btn-secondary">
              На главную
            </Link>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Регистрация..." : "Перейти к оплате"}
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
