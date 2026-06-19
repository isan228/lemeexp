import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import SiteBrand from "../components/SiteBrand.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import { routes, GET_ACCESS_LABEL } from "../config/site.js";

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el || typeof window === "undefined") return;

  requestAnimationFrame(() => {
    const header = document.querySelector(".landing-header.landing-header-wide");
    const headerH = header?.getBoundingClientRect().height ?? 88;
    const top = el.getBoundingClientRect().top + window.scrollY - headerH - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });

  });
}

const trialSeeds = [
  {
    title: "Биохимия — «Белки и аминокислоты»",
    tag: "14 мин",
    subjectId: 1,
    chapterId: 11,
    videoId: 101,
    bullets: ["Ввод в аминокислоты", "Структура белка", "Тот же плеер, что в курсе"],
    note: "Бесплатный пробный урок"
  },
  {
    title: "Биохимия — «Углеводы и липиды»",
    tag: "15 мин",
    subjectId: 1,
    chapterId: 11,
    videoId: 102,
    bullets: ["Моно- и полисахариды", "Жирные кислоты", "Мембраны и энергия"],
    note: "Бесплатный пробный урок"
  },
  {
    title: "Иммунология — «Т-лимфоциты»",
    tag: "13 мин",
    subjectId: 2,
    chapterId: 21,
    videoId: 201,
    bullets: ["Дифференцировка Т-клеток", "MHC и распознавание", "Клинические примеры"],
    note: "Бесплатный пробный урок"
  }
];

const advantages = [
  { letter: "З", title: "Защищённый поток", text: "Шифрованный HLS, короткие токены и привязка к устройству — без прямых ссылок на файл." },
  { letter: "К", title: "Понятный каталог", text: "Предмет → глава → видео: быстро найти нужную тему и продолжить с места остановки." },
  { letter: "П", title: "Прогресс обучения", text: "Сохраняем позицию просмотра и показываем, сколько уроков уже пройдено." },
  { letter: "В", title: "В браузере", text: "Смотрите с компьютера, планшета или телефона — без установки приложений." },
  { letter: "Л", title: "Личный кабинет", text: "Профиль, поддержка по урокам и быстрый возврат к последнему видео." },
  { letter: "О", title: "Онлайн-поддержка", text: "Задайте вопрос по материалу — ответ придёт в личный кабинет." }
];

const reviews = [
  {
    name: "Алина М.",
    role: "Студентка 4 курса",
    text: "Наконец-то всё по полочкам: предмет, темы, видео. Не теряю место, где остановилась."
  },
  {
    name: "Дмитрий К.",
    role: "Подготовка к ординатуре",
    text: "Пробные сиды помогли понять формат. Оформил доступ ко всему курсу без сомнений."
  },
  {
    name: "Елена В.",
    role: "Врач-терапевт",
    text: "Удобно смотреть с планшета после смены. Поддержка ответила за пару часов."
  }
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token, profile, hydrated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function onNavToSection(id) {
    scrollToSection(id);
    setMobileMenuOpen(false);
  }

  useEffect(() => {
    if (searchParams.get("public") === "1") return;
    if (!hydrated || !token) return;
    if (profile?.subscriptionType === "admin") {
      navigate(routes.admin, { replace: true });
    } else {
      navigate(routes.learningHome, { replace: true });
    }
  }, [hydrated, token, profile, navigate, searchParams]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    if (mobileMenuOpen) {
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
  }, [mobileMenuOpen]);

  if (!hydrated) {
    return (
      <div className="page-loading">
        <p>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="landing landing-marketing">
      <header className={`landing-header landing-header-wide ${mobileMenuOpen ? "landing-header-mobile-open" : ""}`}>
        <div className="landing-brand-row">
          <SiteBrand />
          <button
            type="button"
            className="landing-burger"
            aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        <button type="button" className="landing-drawer-overlay" aria-label="Закрыть меню" onClick={() => setMobileMenuOpen(false)} />
        <nav className="landing-nav-links" aria-label="Разделы страницы">
          <div className="landing-drawer-head">
            <button type="button" className="landing-drawer-close" aria-label="Закрыть меню" onClick={() => setMobileMenuOpen(false)}>
              ×
            </button>
            <strong>Меню</strong>
          </div>
          <button type="button" className="nav-anchor" onClick={() => onNavToSection("trial")}>
            Пробники
          </button>
          <button type="button" className="nav-anchor" onClick={() => onNavToSection("advantages")}>
            Преимущества
          </button>
          <button type="button" className="nav-anchor" onClick={() => onNavToSection("about")}>
            О платформе
          </button>
          <button type="button" className="nav-anchor" onClick={() => onNavToSection("reviews")}>
            Отзывы
          </button>
          <div className="landing-drawer-actions">
            {!token && (
              <Link to={routes.registerTrial} className="btn-primary inline landing-register-btn" onClick={() => setMobileMenuOpen(false)}>
                Попробовать
              </Link>
            )}
            {!token && (
              <Link to={routes.login} className="btn-secondary inline landing-register-btn" onClick={() => setMobileMenuOpen(false)}>
                Войти
              </Link>
            )}
          </div>
        </nav>
        <div className="landing-header-actions">
          {!token && (
            <Link to={routes.registerTrial} className="btn-primary inline landing-register-btn" onClick={() => setMobileMenuOpen(false)}>
              Попробовать
            </Link>
          )}
          {!token && (
            <Link to={routes.login} className="btn-secondary inline landing-register-btn" onClick={() => setMobileMenuOpen(false)}>
              Войти
            </Link>
          )}
          {token && (
            <Link to={routes.learningHome} className="btn-primary inline landing-register-btn">
              Кабинет
            </Link>
          )}
        </div>
      </header>

      <main className="landing-main landing-main-wide">
        <section className="landing-hero landing-hero-center" aria-labelledby="hero-title">
          <h1 id="hero-title">наконец-то! медицину можно понять</h1>
          <p className="lead landing-lead-wide">
            видеоуроки для врачей и студентов-медиков, чтобы укрепить фундаментальные умения и легко сдать
            международные экзамены USMLE, TUS, PLAB
          </p>
          <div className="landing-hero-cta landing-hero-cta-center">
            {!token ? (
              <Link to={routes.registerTrial} className="btn-primary landing-hero-try-btn">
                Попробовать
              </Link>
            ) : (
              <Link to={routes.learningLessons} className="btn-primary landing-hero-try-btn">
                К урокам
              </Link>
            )}
          </div>
        </section>

        <section id="trial" className="landing-section">
          <h2 className="landing-section-title">Три пробных урока</h2>
          <p className="landing-section-intro">
            Короткие демо с тем же плеером и защитой, что и в платной подписке. Зарегистрируйтесь или войдите, чтобы
            открыть видео в личном кабинете.
          </p>
          <div className="landing-seed-grid">
            {trialSeeds.map((seed) => {
              const trialHref = token
                ? routes.lessonVideo(seed.subjectId, seed.chapterId, seed.videoId)
                : routes.registerTrial;
              return (
              <article key={seed.videoId} className="landing-seed-card card">
                <span className="landing-seed-tag">{seed.tag}</span>
                <h3>{seed.title}</h3>
                <ul className="landing-seed-list">
                  {seed.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <p className="landing-seed-note">{seed.note}</p>
                <Link to={trialHref} className="btn-link landing-seed-cta">
                  {token ? "Смотреть урок →" : "Зарегистрироваться →"}
                </Link>
              </article>
            );
            })}
          </div>
        </section>

        <section id="advantages" className="landing-section landing-section-alt">
          <h2 className="landing-section-title">Наши преимущества</h2>
          <p className="landing-section-intro">Технологии и сервис, на которые можно опереться в длительной подготовке.</p>
          <div className="landing-advantages-grid">
            {advantages.map((a) => (
              <article key={a.title} className="landing-adv-card card">
                <div className="landing-adv-icon" aria-hidden="true">
                  {a.letter}
                </div>
                <h3>{a.title}</h3>
                <p className="muted">{a.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="about" className="landing-section">
          <h2 className="landing-section-title">О платформе</h2>
          <div className="landing-about card">
            <p>
              Let me explain — это учебная платформа для врачей и студентов медицинских специальностей: структурированные
              видео по предметам, отслеживание прогресса и защищённая выдача контента. Мы делаем упор на ясную навигацию
              и стабильное воспроизведение, чтобы вы тратили время на учёбу, а не на поиск файлов и ссылок.
            </p>
            <p>
              В ближайших релизах планируем расширить админку, добавить сертификаты о прохождении модулей и интеграцию с
              промышленными DRM-системами для правообладателей. Если вы преподаватель или клиника — напишите нам через
              контакты внизу страницы.
            </p>
          </div>
        </section>

        <section id="reviews" className="landing-section landing-section-alt">
          <h2 className="landing-section-title">Отзывы</h2>
          <p className="landing-section-intro">Что говорят те, кто уже учится с нами (примеры для демо-сайта).</p>
          <div className="landing-reviews-grid">
            {reviews.map((r) => (
              <blockquote key={r.name} className="landing-review card">
                <p className="landing-review-text">«{r.text}»</p>
                <footer>
                  <strong>{r.name}</strong>
                  <div className="muted small">{r.role}</div>
                </footer>
              </blockquote>
            ))}
          </div>
        </section>

        {!token ? (
          <section className="landing-cta-banner" aria-labelledby="landing-cta-title">
            <h2 id="landing-cta-title">Нужен полный каталог?</h2>
            <p>Оформите подписку на 1 месяц и смотрите все уроки без ограничений.</p>
            <div className="landing-cta-actions">
              <Link to={routes.register} className="btn-get-access inline">
                {GET_ACCESS_LABEL}
              </Link>
              <Link to={routes.login} className="btn-secondary inline">
                Уже есть аккаунт
              </Link>
            </div>
          </section>
        ) : null}

      </main>

      <SiteFooter />
    </div>
  );
}
