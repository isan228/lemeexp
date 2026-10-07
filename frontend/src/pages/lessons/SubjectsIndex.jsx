import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { routes } from "../../config/site.js";
import {
  getChapterWatchProgressPercent,
  getSubjectWatchProgressPercent,
  getVideoWatchProgressPercent,
  getVideoWatchedSeconds,
  isLessonVideoCompleted
} from "../../utils/videoProgress.js";
import { isPlayableStream } from "../../utils/streamPath.js";
import {
  countCompletedVideos,
  formatChaptersCount,
  formatDuration,
  formatLessonsCount,
  formatSubjectsCount,
  subjectVideos,
  sumDuration
} from "../../utils/lessonsFormat.js";
import { ProgressBar } from "../../components/lessons/LessonsPath.jsx";

/** Первый начатый, но не досмотренный урок; иначе — первый ещё не просмотренный. */
function findNextLesson(chapters, watched, completedMap) {
  let firstUnwatched = null;
  for (const subject of chapters) {
    for (const ch of subject.subtopics || []) {
      for (const v of ch.videos || []) {
        if (v.locked || !isPlayableStream(v.streamPath)) continue;
        const w = getVideoWatchedSeconds(watched, v.id);
        const duration = Number(v.duration) || 0;
        if (isLessonVideoCompleted(w, duration, completedMap, v.id)) continue;
        const item = {
          subject,
          ch,
          v,
          percent: getVideoWatchProgressPercent(w, duration, completedMap, v.id),
          resume: w > 0
        };
        if (item.resume) return item;
        if (!firstUnwatched) firstUnwatched = item;
      }
    }
  }
  return firstUnwatched;
}

function ContinueCard({ item }) {
  const { subject, ch, v, percent, resume } = item;
  const duration = formatDuration(v.duration);
  return (
    <Link
      to={routes.lessonVideo(subject.id, ch.id, v.id, { resume })}
      className="lp-continue"
      aria-label={`${resume ? "Продолжить" : "Начать"}: ${v.title}`}
    >
      <span className="lp-continue-body">
        <span className="lp-continue-label">{resume ? "Продолжить обучение" : "Следующий урок"}</span>
        <span className="lp-continue-title">{v.title}</span>
        <span className="lp-continue-meta">
          {subject.title}
          <span className="lp-continue-sep" aria-hidden="true">/</span>
          {ch.title}
          {duration ? (
            <>
              <span className="lp-continue-sep" aria-hidden="true">·</span>
              {duration}
            </>
          ) : null}
        </span>
        {resume ? (
          <span className="lp-continue-progress">
            <ProgressBar percent={percent} label={`${v.title}: ${percent}%`} />
            <span>{percent}%</span>
          </span>
        ) : null}
      </span>
      <span className="lp-continue-btn">
        {resume ? "Продолжить" : "Начать"}
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  );
}

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "started", label: "В процессе" },
  { id: "new", label: "Не начаты" },
  { id: "done", label: "Завершены" }
];

function subjectStatus(percent, videosN) {
  if (videosN > 0 && percent >= 100) return "done";
  if (percent > 0) return "started";
  return "new";
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlanProgress({ percent, label }) {
  return (
    <span className="lp-plan-progress">
      <ProgressBar percent={percent} label={label} />
      <span className="lp-plan-pct">{percent}%</span>
    </span>
  );
}

function PlanRow({ item, number, expanded, onToggle, watched, videoCompleted }) {
  const { subject, videos, percent, status } = item;
  const subtopics = subject.subtopics || [];
  const duration = formatDuration(sumDuration(videos));
  const panelId = `lp-plan-panel-${subject.id}`;

  return (
    <li className={`lp-plan-item is-${status}${expanded ? " is-open" : ""}`}>
      <button
        type="button"
        className="lp-plan-row"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="lp-plan-num">{String(number).padStart(2, "0")}</span>
        <span className="lp-plan-name">
          <span className="lp-plan-title">{subject.title}</span>
          <span className="lp-plan-sub">
            {formatChaptersCount(subtopics.length)} · {formatLessonsCount(videos.length)}
            {duration ? ` · ${duration}` : ""}
          </span>
        </span>
        <span className="lp-plan-cell">{subtopics.length}</span>
        <span className="lp-plan-cell">{videos.length}</span>
        <span className="lp-plan-cell">{duration || "—"}</span>
        <PlanProgress percent={percent} label={`${subject.title}: ${percent}%`} />
        <span className="lp-plan-chevron">
          <Chevron />
        </span>
      </button>

      {expanded ? (
        <div className="lp-plan-panel" id={panelId}>
          {subtopics.length > 0 ? (
            <ol className="lp-plan-chapters">
              {subtopics.map((ch, i) => {
                const chVideos = ch.videos || [];
                const chPercent = getChapterWatchProgressPercent(chVideos, watched, videoCompleted);
                const chDuration = formatDuration(sumDuration(chVideos));
                const chStatus = subjectStatus(chPercent, chVideos.length);
                return (
                  <li key={ch.id}>
                    <Link to={routes.lessonChapter(subject.id, ch.id)} className={`lp-plan-chapter is-${chStatus}`}>
                      <span className="lp-plan-chapter-num">
                        {number}.{i + 1}
                      </span>
                      <span className="lp-plan-chapter-title">{ch.title}</span>
                      <span className="lp-plan-chapter-meta">
                        {formatLessonsCount(chVideos.length)}
                        {chDuration ? ` · ${chDuration}` : ""}
                      </span>
                      <PlanProgress percent={chPercent} label={`${ch.title}: ${chPercent}%`} />
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="lp-plan-empty muted small">В этом предмете пока нет глав.</p>
          )}
          <Link to={routes.lessonSubject(subject.id)} className="lp-plan-open">
            Открыть предмет →
          </Link>
        </div>
      ) : null}
    </li>
  );
}

export default function SubjectsIndex() {
  const { chapters, catalogLoading, catalogError, progress, loadCatalog } = useAuth();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set());
  const watched = progress?.watchedSeconds || {};
  const videoCompleted = progress?.videoCompleted || {};
  const allVideos = chapters.flatMap(subjectVideos);
  const totalPercent = getChapterWatchProgressPercent(allVideos, watched, videoCompleted);
  const doneCount = countCompletedVideos(allVideos, watched, videoCompleted);
  const totalDuration = formatDuration(sumDuration(allVideos));
  const nextLesson = useMemo(
    () => findNextLesson(chapters, watched, videoCompleted),
    [chapters, watched, videoCompleted]
  );

  const items = useMemo(
    () =>
      chapters.map((subject, index) => {
        const videos = subjectVideos(subject);
        const percent = getSubjectWatchProgressPercent(subject, watched, videoCompleted);
        return { subject, number: index + 1, videos, percent, status: subjectStatus(percent, videos.length) };
      }),
    [chapters, watched, videoCompleted]
  );
  const counts = items.reduce(
    (acc, item) => ({ ...acc, all: acc.all + 1, [item.status]: acc[item.status] + 1 }),
    { all: 0, started: 0, new: 0, done: 0 }
  );

  const q = query.trim().toLowerCase();
  const visible = items.filter(
    (item) =>
      (filter === "all" || item.status === filter) &&
      (!q || String(item.subject.title).toLowerCase().includes(q))
  );

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="lessons-flow lessons-flow-padded lp-page lp-page-wide">
      <header className="lp-mhead">
        <div className="lp-mhead-text">
          <h1 className="lp-mhead-title">Предметы</h1>
          {chapters.length > 0 ? (
            <p className="lp-mhead-stats">
              {formatSubjectsCount(chapters.length)} · {formatLessonsCount(allVideos.length)}
              {totalDuration ? ` · ${totalDuration}` : ""}
            </p>
          ) : null}
        </div>
        {allVideos.length > 0 ? (
          <div className="lp-mhead-total">
            <span className="lp-mhead-total-num">
              {totalPercent}
              <small>%</small>
            </span>
            <span className="lp-mhead-total-cap">
              {doneCount} из {allVideos.length} уроков
            </span>
          </div>
        ) : null}
      </header>

      {catalogLoading && chapters.length === 0 ? (
        <div className="loading-block">
          <div className="loading-spinner" aria-hidden="true" />
          <p className="muted">Загрузка каталога…</p>
        </div>
      ) : catalogError && chapters.length === 0 ? (
        <div className="empty-state card">
          <p>{catalogError}</p>
          <button type="button" className="btn-primary" onClick={() => void loadCatalog()}>
            Повторить загрузку
          </button>
        </div>
      ) : (
        <>
          {nextLesson ? <ContinueCard item={nextLesson} /> : null}

          {chapters.length > 0 ? (
            <div className="lp-section-head">
              <div className="lp-filters" role="tablist" aria-label="Фильтр предметов">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.id}
                    className={`lp-filter${filter === f.id ? " is-active" : ""}`}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label}
                    <span className="lp-filter-count">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
              {chapters.length > 4 ? (
                <label className="lp-search">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
                    <path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Найти предмет"
                    aria-label="Поиск предмета"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {visible.length > 0 ? (
            <div className="lp-plan">
              <div className="lp-plan-head" aria-hidden="true">
                <span>№</span>
                <span>Предмет</span>
                <span>Главы</span>
                <span>Уроки</span>
                <span>Время</span>
                <span>Прогресс</span>
                <span />
              </div>
              <ol className="lp-plan-list">
                {visible.map((item) => (
                  <PlanRow
                    key={item.subject.id}
                    item={item}
                    number={item.number}
                    expanded={expanded.has(item.subject.id)}
                    onToggle={() => toggle(item.subject.id)}
                    watched={watched}
                    videoCompleted={videoCompleted}
                  />
                ))}
              </ol>
            </div>
          ) : chapters.length > 0 ? (
            <div className="empty-state card">
              <p className="muted">
                {q ? `Ничего не найдено по запросу «${query.trim()}».` : "В этой категории пока нет предметов."}
              </p>
            </div>
          ) : null}

          {chapters.length === 0 && (
            <div className="empty-state card">
              <p>Каталог пока пуст.</p>
              <p className="muted small">Новые предметы появятся здесь после публикации в админке.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
