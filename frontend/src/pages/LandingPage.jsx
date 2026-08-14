import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import SiteBrand from "../components/SiteBrand.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import { routes, GET_ACCESS_LABEL, site } from "../config/site.js";

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

const includedSubjects = [
  "Биохимия",
  "Иммунология",
  "Микробиология",
  "Патология (патфиз и патан)",
  "Онкология",
  "Фармакология",
  "Кардиология",
  "Эндокринология",
  "Нефрология",
  "Нейросайнс (неврология)",
  "Анестезиология",
  "Психиатрия",
  "ЛОР",
  "Офтальмология",
  "Респираторная",
  "ЖКТ",
  "Гематология",
  "Репродуктивная",
  "Дерматология",
  "Скелетно-мышечная",
  "Биоэтика",
  "Биостатистика"
];

const systemSubjects = [
  "Эмбриология",
  "Анатомия",
  "Физиология",
  "Гистология",
  "Педиатрия",
  "Неонатология"
];

const courseBenefits = [
  "Видеоуроки",
  "Менторская поддержка в подготовке к USMLE",
  "Чат для ваших вопросов, если объяснения были недостаточно просты"
];

const faqItems = [
  {
    question: "На каком языке?",
    answer:
      "Мы давно обучаем с помощью видеоуроков на русском, тесты и текст будут на английском. Этот курс подходит больше всего тем, у кого есть проблемы с английским, для наиболее быстрой адаптации. Большинство наших учеников сдали экзамен за год, хоть у них и был слабый английский, в отличие от тех, кто решил сначала подкачать английский и только потом учиться."
  },
  {
    question: "Сколько длится обучение?",
    answer:
      "Вы учитесь в своём темпе. В норме, если готовиться к USMLE Step 1, то не больше года. На нашей платформе вы сможете изучить всё полноценно за 8 месяцев — вместе с просмотром видео ещё и делать тесты. А если вы хотите быстро просмотреть все видео разом — то 4 месяца."
  },
  {
    question: "Меняются ли видео?",
    answer:
      "Да, мы их возобновляем и улучшаем с каждым годом новой информацией в медицине, чтобы держать подготовку и базу знаний актуальной."
  },
  {
    question: "Поможете ли вы в сдаче USMLE?",
    answer:
      "Связь с ментором (Аман) всегда будет оставаться доступной. Мы сможем максимально облегчить вам процесс подготовки и регистрации."
  },
  {
    question: "Что если я не хочу сдавать USMLE?",
    answer:
      "Это прекрасная идея — учиться для себя и быть лучшим врачом. Этот экзамен подтвердил себя как самый объёмный, а значит, изучая материал USMLE, вы запросто перешагнёте лимиты привычных вам способов обучения. Может, вам и не нужно идти за границу, но это может стать приятным бонусом!"
  },
  {
    question: "Можно ли учиться стоматологам?",
    answer:
      "К сожалению, контент сориентирован для укрепления фундаментальных знаний лечебников, и вам такой подход может не принести особой пользы в карьере стоматолога. Если вы ищете экзамены для работы стоматологом в Штатах, изучите INBDE."
  }
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
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [curriculumExpanded, setCurriculumExpanded] = useState(false);

  function toggleFaq(index) {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  }

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
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
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
          <SiteBrand showLogo={false} />
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
        <button
          type="button"
          className="landing-drawer-overlay"
          aria-label="Закрыть меню"
          aria-hidden={!mobileMenuOpen}
          tabIndex={mobileMenuOpen ? 0 : -1}
          onClick={() => setMobileMenuOpen(false)}
        />
        <nav className="landing-nav-links" aria-label="Разделы страницы">
          <div className="landing-drawer-nav">
            <button type="button" className="nav-anchor" onClick={() => onNavToSection("curriculum")}>
              Программа
            </button>
            <button type="button" className="nav-anchor" onClick={() => onNavToSection("about")}>
              О курсе
            </button>
            <button type="button" className="nav-anchor" onClick={() => onNavToSection("pricing")}>
              Цены
            </button>
            <button type="button" className="nav-anchor" onClick={() => onNavToSection("faq")}>
              FAQ
            </button>
            <button type="button" className="nav-anchor" onClick={() => onNavToSection("reviews")}>
              Отзывы
            </button>
            {!token && (
              <>
                <Link to={routes.registerTrial} className="nav-anchor nav-anchor-accent" onClick={() => setMobileMenuOpen(false)}>
                  Попробовать
                </Link>
                <Link to={routes.login} className="nav-anchor nav-anchor-ghost" onClick={() => setMobileMenuOpen(false)}>
                  Войти
                </Link>
              </>
            )}
            {token && (
              <Link to={routes.learningHome} className="nav-anchor nav-anchor-accent" onClick={() => setMobileMenuOpen(false)}>
                Кабинет
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
          <h1 id="hero-title">
            Наконец-то!
            <br />
            медицину можно понять
          </h1>
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
            <a
              href={site.androidApkUrl}
              className="btn-secondary landing-hero-apk-btn"
              download="lemexplain.apk"
            >
              <span className="landing-apk-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67c-.19-.28-.54-.37-.83-.22-.3.16-.42.54-.26.85L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
                </svg>
              </span>
              {site.androidApkLabel}
            </a>
          </div>
          <p className="landing-apk-hint muted small">
            Скачайте приложение для Android. При установке разрешите APK из неизвестных источников.
          </p>
        </section>

        <section id="curriculum" className="landing-section">
          <h2 className="landing-section-title">Облегчите себе обучение</h2>
          <div className="landing-curriculum-intro">
            <p>Серия видеоуроков поможет вам</p>
            <p>не отставать от новшеств и укрепить базу знаний.</p>
            <p>Вы изучите всё — от молекул до узких дисциплин.</p>
          </div>
          <div
            className={`landing-curriculum-lists card${curriculumExpanded ? " is-expanded" : " is-collapsed"}`}
          >
            <div className="landing-curriculum-block">
              <h3 className="landing-curriculum-heading">Что включено:</h3>
              <ul className="landing-curriculum-list">
                {includedSubjects.map((subject) => (
                  <li key={subject}>{subject}</li>
                ))}
              </ul>
            </div>
            <div className="landing-curriculum-block landing-curriculum-block-systems">
              <h3 className="landing-curriculum-heading">Внутри систем:</h3>
              <ul className="landing-curriculum-list landing-curriculum-list-compact">
                {systemSubjects.map((subject) => (
                  <li key={subject}>{subject}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              className="landing-curriculum-expand-btn"
              aria-expanded={curriculumExpanded}
              aria-label={curriculumExpanded ? "Свернуть список" : "Показать весь список"}
              onClick={() => setCurriculumExpanded((v) => !v)}
            />
          </div>
        </section>

        <section id="about" className="landing-section">
          <div className="landing-about-intro">
            <p>
              В Let me explain мы обучаем максимально легко, поддерживаем в подготовке к USMLE — вы учитесь
              со свободным графиком и нужным вам темпом.
            </p>
          </div>
          <h2 className="landing-section-title">Вы получите</h2>
          <ul className="landing-benefits-list">
            {courseBenefits.map((item) => (
              <li key={item} className="landing-benefit-item card">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section id="pricing" className="landing-section">
          <h2 className="landing-section-title">Цены на наш курс</h2>
          <div className="landing-pricing card">
            <p className="landing-pricing-lead">
              Полный доступ ко всем видеоурокам, тестам и менторской поддержке — оформите подписку в личном кабинете.
            </p>
            {!token ? (
              <Link to={routes.register} className="btn-primary inline">
                {GET_ACCESS_LABEL}
              </Link>
            ) : (
              <Link to={routes.learningHome} className="btn-primary inline">
                В кабинет
              </Link>
            )}
          </div>
        </section>

        <section id="faq" className="landing-section">
          <h2 className="landing-section-title">Часто задаваемые вопросы</h2>
          <div className="landing-faq-list">
            {faqItems.map((item, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <article key={item.question} className={`landing-faq-item card${isOpen ? " is-open" : ""}`}>
                  <button
                    type="button"
                    className="landing-faq-question"
                    aria-expanded={isOpen}
                    onClick={() => toggleFaq(index)}
                  >
                    <span>{item.question}</span>
                    <span className="landing-faq-icon" aria-hidden="true">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen ? <p className="landing-faq-answer">{item.answer}</p> : null}
                </article>
              );
            })}
          </div>
        </section>

        <section id="reviews" className="landing-section">
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
