import { Fragment } from "react";
import { Link } from "react-router-dom";
import LockIcon from "../LockIcon.jsx";
import LessonThumb from "./LessonThumb.jsx";

export function LessonsHeader({ backTo, backLabel = "Назад", crumbs = [], title, stats = [] }) {
  const visibleStats = stats.filter(Boolean);
  return (
    <header className="lp-header">
      {backTo || crumbs.length > 0 ? (
        <div className="lp-header-top">
          {backTo ? (
            <Link to={backTo} className="lp-back" aria-label={backLabel}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ) : null}
          {crumbs.length > 0 ? (
            <nav className="lp-breadcrumb" aria-label="Навигация">
              {crumbs.map((crumb, i) => (
                <Fragment key={`${crumb.label}-${i}`}>
                  {i > 0 ? (
                    <span className="lp-breadcrumb-sep" aria-hidden="true">
                      /
                    </span>
                  ) : null}
                  {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
                </Fragment>
              ))}
            </nav>
          ) : null}
        </div>
      ) : null}
      <h1 className="lp-title">{title}</h1>
      {visibleStats.length > 0 ? (
        <p className="lp-stats">
          {visibleStats.map((s, i) => (
            <Fragment key={s}>
              {i > 0 ? (
                <span className="lp-dot" aria-hidden="true">
                  •
                </span>
              ) : null}
              <span>{s}</span>
            </Fragment>
          ))}
        </p>
      ) : null}
    </header>
  );
}

export function ProgressBar({ percent, label }) {
  const pct = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
  return (
    <span
      className="lp-bar"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span className="lp-bar-fill" style={{ width: `${pct}%` }} />
    </span>
  );
}

export function CourseProgress({ title, done, total, percent }) {
  const pct = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
  return (
    <section className="lp-course-progress" aria-label={title}>
      <div className="lp-course-progress-head">
        <span className="lp-course-progress-title">{title}</span>
        <span className="lp-course-progress-pct">{pct}%</span>
      </div>
      <ProgressBar percent={pct} label={`${title}: ${pct}%`} />
      <p className="lp-course-progress-caption">
        {done} / {total} {total === 1 ? "урок пройден" : "уроков пройдено"}
      </p>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Шаг вертикального таймлайна: узел слева, содержимое справа. state: completed | current | upcoming | locked */
export function TimelineStep({ state, children }) {
  return (
    <li className={`lp-step is-${state}`}>
      <span className="lp-node" aria-hidden="true">
        {state === "completed" ? <CheckIcon /> : null}
        {state === "current" ? <span className="lp-node-core" /> : null}
      </span>
      <div className="lp-step-body">{children}</div>
    </li>
  );
}

function CardAction({ action }) {
  if (action === "chevron") {
    return (
      <span className="lp-chevron" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (action === "locked") {
    return (
      <span className="lp-play is-disabled" aria-hidden="true">
        <LockIcon size={18} />
      </span>
    );
  }
  if (action === "pending") {
    return (
      <span className="lp-play is-disabled" aria-hidden="true">
        <span className="lp-play-spinner" />
      </span>
    );
  }
  return (
    <span className="lp-play" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M9 6.8v10.4a.8.8 0 0 0 1.2.7l8.3-5.2a.8.8 0 0 0 0-1.4l-8.3-5.2a.8.8 0 0 0-1.2.7z" fill="currentColor" />
      </svg>
    </span>
  );
}

/**
 * Карточка урока/главы/предмета.
 * state: completed | current | upcoming | locked | pending
 * action: play | locked | pending | chevron
 */
export function PathCard({ to, state = "upcoming", thumb, title, meta, percent, action = "play", ariaLabel }) {
  const pct = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
  const content = (
    <>
      <LessonThumb variant={thumb} />
      <span className="lp-card-body">
        <span className="lp-card-title">{title}</span>
        <span className="lp-card-meta">{meta}</span>
        <ProgressBar percent={pct} label={`${title}: ${pct}%`} />
      </span>
      <CardAction action={action} />
    </>
  );
  const className = `lp-card is-${state}`;
  return to ? (
    <Link to={to} className={className} aria-label={ariaLabel}>
      {content}
    </Link>
  ) : (
    <div className={`${className} is-static`} aria-label={ariaLabel} aria-disabled="true">
      {content}
    </div>
  );
}

export function MetaDot() {
  return (
    <span className="lp-dot" aria-hidden="true">
      •
    </span>
  );
}
