import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteBrand from "../components/SiteBrand.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { routes } from "../config/site.js";

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
      navigate(routes.admin, { replace: true });
    } else {
      navigate(routes.learningHome, { replace: true });
    }
  }, [hydrated, token, profile, navigate]);

  async function onLogin(e) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const p = await login(email, password);
      if (p?.subscriptionType === "admin") {
        navigate(routes.admin, { replace: true });
      } else {
        navigate(routes.learningHome, { replace: true });
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
        <SiteBrand />
        <div className="landing-header-actions">
          <Link to={routes.register} className="btn-primary inline landing-register-btn">
            Купить
          </Link>
          <Link to={routes.home} className="nav-muted">
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
              <p className="hint">
                Нет аккаунта?{" "}
                <Link to={routes.register} className="btn-link">
                  Оформить доступ
                </Link>
              </p>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
