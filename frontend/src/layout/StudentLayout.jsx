import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function StudentLayout() {
  const { logout, profile, loadCatalog, token, chapters, apiRequest } = useAuth();
  const navigate = useNavigate();
  const [supportUnread, setSupportUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    if (chapters.length === 0) void loadCatalog();
  }, [token, chapters.length, loadCatalog]);

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
              <div>
                <div className="logo-text-sidebar">Let me explain</div>
                <p className="sidebar-user">{profile?.nickname || profile?.email || "—"}</p>
              </div>
              <button type="button" className="student-drawer-close" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню">
                ×
              </button>
            </div>
            <Link to="/?public=1" className="sidebar-site-link">
              Сайт проекта
            </Link>
          </div>
          <nav className="sidebar-nav">
            <NavLink end to="/learning/home" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")} onClick={() => setMenuOpen(false)}>
              Главная
            </NavLink>
            <NavLink to="/learning/lessons" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")} onClick={() => setMenuOpen(false)}>
              Уроки
            </NavLink>
            <NavLink to="/learning/profile" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")} onClick={() => setMenuOpen(false)}>
              Профиль
            </NavLink>
            <NavLink to="/learning/support" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")} onClick={() => setMenuOpen(false)}>
              Поддержка
              {supportUnread > 0 ? <span className="nav-badge">{supportUnread}</span> : null}
            </NavLink>
          </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              void logout().then(() => navigate("/", { replace: true }));
            }}
          >
            Выйти
          </button>
        </div>
        </aside>
        <main className="content student-main">
          <button type="button" className="student-burger" onClick={() => setMenuOpen(true)} aria-label="Открыть меню">
            ☰ Меню
          </button>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
