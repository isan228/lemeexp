import { Link } from "react-router-dom";
import { mailtoSupport, routes, site } from "../config/site.js";

export default function SiteFooter() {
  return (
    <footer className="landing-footer-pro">
      <div className="landing-footer-grid">
        <div>
          <div className="landing-brand landing-brand-footer">
            <span className="logo-mark">
              <img src="/9ff6137d-ee1d-4cd6-a762-9795d7540eae.svg" alt={site.name} className="logo-mark-img" />
            </span>
            <span className="logo-text">{site.name}</span>
          </div>
          <p className="muted small landing-footer-copy">© {new Date().getFullYear()} {site.name}. Все права защищены.</p>
        </div>
        <div>
          <h3 className="landing-footer-heading">Навигация</h3>
          <ul className="landing-footer-links landing-footer-nav">
            <li>
              <Link to={routes.home}>Главная</Link>
            </li>
            <li>
              <Link to={routes.login}>Войти</Link>
            </li>
            <li>
              <Link to={routes.register}>Регистрация</Link>
            </li>
            <li>
              <Link to={routes.learningHome}>Личный кабинет</Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="landing-footer-heading">Контакты</h3>
          <ul className="landing-footer-contacts">
            <li>
              <a href={mailtoSupport()}>{site.supportEmail}</a>
            </li>
            <li className="muted small">Пн–Пт, 10:00–19:00 (МСК)</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
