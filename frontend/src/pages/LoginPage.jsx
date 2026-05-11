import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, token, profile, hydrated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!hydrated || !token) return;
    if (profile?.subscriptionType === "admin") {
      navigate("/admin", { replace: true });
    } else {
      navigate("/learning/home", { replace: true });
    }
  }, [hydrated, token, profile, navigate]);

  async function onLogin(e) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const p = await login(email, password);
      if (p?.subscriptionType === "admin") {
        navigate("/admin", { replace: true });
      } else {
        navigate("/learning/home", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Ошибка входа");
    } finally {
      setPending(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="page-loading">
        <p>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="landing landing-marketing">
      <header className="landing-header landing-header-wide">
        <div className="landing-brand">
          <span className="logo-mark">
            <img src="/9ff6137d-ee1d-4cd6-a762-9795d7540eae.svg" alt="Let me explain" className="logo-mark-img" />
          </span>
          <span className="logo-text">Let me explain</span>
        </div>
        <div className="landing-header-actions">
          <Link to="/register" className="btn-primary inline landing-register-btn">
            Купить
          </Link>
          <Link to="/" className="nav-muted">
            На главную
          </Link>
        </div>
      </header>

      <main className="landing-main landing-main-wide">
        <section className="landing-section landing-join">
          <h1 className="landing-section-title">Войти в кабинет</h1>
          <p className="landing-section-intro">Введите email и пароль, чтобы открыть доступ к урокам.</p>
          <div className="landing-auth card landing-auth-centered">
            {error && <p className="form-error">{error}</p>}
            <form className="auth-form" onSubmit={onLogin}>
              <label>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </label>
              <label>
                Пароль
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="current-password" />
              </label>
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? "Вход…" : "Войти"}
              </button>
              <p className="hint">Нет аккаунта? Оформите доступ через кнопку "Купить".</p>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
