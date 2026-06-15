import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import NavIcon from "../components/NavIcon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { routes } from "../config/site.js";

const NAV = [
  { to: routes.learningHome, end: true, icon: "home", label: "Главная" },
  { to: routes.learningLessons, icon: "lessons", label: "Уроки" },
  { to: routes.learningProfile, icon: "profile", label: "Профиль" },
  { to: routes.learningSupport, icon: "support", label: "Поддержка" }
];

export default function StudentLayout() {
  const { logout, profile, loadCatalog, token, apiRequest, progress } = useAuth();
  const navigate = useNavigate();
  const [supportUnread, setSupportUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    void loadCatalog();
  }, [token, loadCatalog]);

  useEffect(() => {
    if (!token) return;
    const refresh = () => void loadCatalog();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [token, loadCatalog]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const poll = async () => {
      const res = await apiRequest("/support/unread");
      if (!res.ok) return;
      const data = await res.json().catch(() => ({ total: 0 }));
      if (mounted) setSupportUnread(Number(data.total || 0));
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [token, apiRequest]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    if (menuOpen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = prevBodyOverflow || "";
      document.documentElement.style.overflow = prevHtmlOverflow || "";
    }
    return () => {
      document.body.style.overflow = prevBodyOverflow || "";
      document.documentElement.style.overflow = prevHtmlOverflow || "";
    };
  }, [menuOpen]);

  const pct = Math.min(100, Math.max(0, Number(progress?.percentage) || 0));

  return (
    <div className={`student-app ${menuOpen ? "student-app-menu-open" : ""}`}>
      <button
        type="button"
        className="student-drawer-overlay"
        aria-label="Закрыть меню"
        onClick={() => setMenuOpen(false)}
      />
      <div className="layout student-shell">
        <aside className={`sidebar student-sidebar ${menuOpen ? "student-sidebar-open" : ""}`}>
          <div className="sidebar-brand">
            <div className="student-sidebar-brand-row">
              <span className="logo-mark">
                <img src="/9ff6137d-ee1d-4cd6-a762-9795d7540eae.svg" alt="Let me explain" className="logo-mark-img" />
              </span>
              <div className="sidebar-brand-text">
                <div className="logo-text-sidebar">Let me explain</div>
                <p className="sidebar-user">{profile?.nickname || profile?.email || "—"}</p>
              </div>
              <button type="button" className="student-drawer-close" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню">
                ×
              </button>
            </div>
            <div className="sidebar-progress" aria-label={`Прогресс ${pct}%`}>
              <div className="sidebar-progress-bar" style={{ width: `${pct}%` }} />
              <span className="sidebar-progress-label">{pct}% пройдено</span>
            </div>
            <Link to={routes.homePublic} className="sidebar-site-link">
              Сайт проекта
            </Link>
          </div>
          <nav className="sidebar-nav">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                end={item.end}
                to={item.to}
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                onClick={() => setMenuOpen(false)}
              >
                <NavIcon name={item.icon} />
                <span className="nav-link-text">{item.label}</span>
                {item.icon === "support" && supportUnread > 0 ? (
                  <span className="nav-badge">{supportUnread}</span>
                ) : null}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-footer">
            <button
              type="button"
              className="btn-ghost btn-logout"
              onClick={() => {
                void logout().then(() => navigate(routes.home, { replace: true }));
              }}
            >
              Выйти
            </button>
          </div>
        </aside>
        <main className="content student-main">
          <header className="student-topbar">
            <button type="button" className="student-burger" onClick={() => setMenuOpen(true)} aria-label="Открыть меню">
              <span className="student-burger-icon" aria-hidden="true" />
              Меню
            </button>
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
