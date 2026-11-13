import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { routes } from "../config/site.js";

export default function RequireAuth() {
  const { token, hydrated } = useAuth();
  if (!hydrated) {
    return (
      <div className="page-loading">
        <p>Загрузка…</p>
      </div>
    );
  }
  if (!token) {
    return <Navigate to={routes.login} replace />;
  }
  return <Outlet />;
}
