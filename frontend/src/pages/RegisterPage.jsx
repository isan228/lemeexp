import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteBrand from "../components/SiteBrand.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { routes } from "../config/site.js";

const subscriptionPlans = [
  {
    id: "basic",
    icon: "📘",
    name: "Базовая",
    price: "990 сом/мес",
    isRecommended: false,
    bullets: ["Доступ к основным предметам", "Личный кабинет и прогресс", "Поддержка по email"]
  },
  {
    id: "pro",
    icon: "🚀",
    name: "Продвинутая",
    price: "1990 сом/мес",
    isRecommended: true,
    bullets: ["Все предметы и главы", "Приоритетная поддержка", "Расширенные тесты и конспекты"]
  },
  {
    id: "mentor",
    icon: "🎓",
    name: "Ментор",
    price: "3490 сом/мес",
    isRecommended: false,
    bullets: ["Все возможности Pro", "Разборы с куратором", "Персональный учебный план"]
  }
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [registerStep, setRegisterStep] = useState("plan");
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
    if (!selectedPlanId) {
      setError("Сначала выберите подписку");
      return;
    }
    setError("");
    setPending(true);
    try {
      const registrationNickname = nickname?.trim() || fullName?.trim() || "";
      await register(email, password, registrationNickname);
      navigate(routes.payment(selectedPlanId), {
        replace: true,
        state: {
          plan: selectedPlanId,
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
            <span className={registerStep === "plan" ? "flow-step active" : "flow-step"}>1. Подписка</span>
            <span className={registerStep === "form" ? "flow-step active" : "flow-step"}>2. Анкета</span>
            <span className="flow-step">3. Оплата</span>
          </div>
          <h1>Создание аккаунта</h1>
          <p className="muted">Выберите подписку, заполните анкету и перейдите к оплате.</p>
        </div>

        {error && <p className="form-error">{error}</p>}

        {registerStep === "plan" ? (
          <div className="register-plan-step step-anim" key="plan-step">
            <p className="hint">Шаг 1 из 2: выберите подписку</p>
            <div className="plan-grid">
              {subscriptionPlans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  className={selectedPlanId === plan.id ? "plan-card active" : "plan-card"}
                  onClick={() => setSelectedPlanId(plan.id)}
                >
                  {plan.isRecommended && <span className="plan-recommended">Рекомендуемый</span>}
                  <span className="plan-badge">Тариф</span>
                  <strong>
                    <span className="plan-icon" aria-hidden>
                      {plan.icon}
                    </span>{" "}
                    {plan.name}
                  </strong>
                  <span className="plan-price">{plan.price}</span>
                  <ul>
                    {plan.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
            <div className="register-form-actions">
              <Link to={routes.home} className="btn-secondary">
                На главную
              </Link>
              <button
                type="button"
                className="btn-primary"
                disabled={!selectedPlanId}
                onClick={() => setRegisterStep("form")}
              >
                Далее: анкета
              </button>
            </div>
            <p className="auth-page-links">
              Уже есть аккаунт? <Link to={routes.login}>Войти</Link>
            </p>
          </div>
        ) : (
          <form className="auth-form step-anim" key="form-step" onSubmit={onRegister}>
            <p className="hint">Шаг 2 из 2: заполните анкету</p>
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
              <button type="button" className="btn-secondary" onClick={() => setRegisterStep("plan")}>
                Назад к подпискам
              </button>
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? "Регистрация..." : "Перейти к оплате"}
              </button>
            </div>
            <p className="auth-page-links">
              Уже есть аккаунт? <Link to={routes.login}>Войти</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
