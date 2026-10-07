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

const HUES = [217, 262, 330, 12, 32, 152, 190, 280, 350, 168, 45, 230];

function heroSubtitle(percent, hasStarted) {
  if (!hasStarted) return "Выберите предмет и начните первый урок — дальше пойдёт легче.";
  if (percent >= 100) return "Весь курс пройден. Отличная работа!";
  if (percent >= 75) return "Финишная прямая — осталось совсем немного.";
  if (percent >= 40) return "Больше трети позади. Так держать!";
  return "Хорошее начало. Маленькими шагами к большой цели.";
}

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

function ProgressRing({ percent }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
  return (
    <div className="lp-ring" role="img" aria-label={`Общий прогресс ${pct}%`}>
      <svg viewBox="0 0 84 84" aria-hidden="true" focusable="false">
        <circle className="lp-ring-track" cx="42" cy="42" r={r} />
        <circle
          className="lp-ring-fill"
          cx="42"
          cy="42"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span className="lp-ring-label">
        <strong>{pct}%</strong>
        <small>пройдено</small>
      </span>
    </div>
  );
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
      <span className="lp-continue-play" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M9 6.8v10.4a.8.8 0 0 0 1.2.7l8.3-5.2a.8.8 0 0 0 0-1.4l-8.3-5.2a.8.8 0 0 0-1.2.7z" fill="currentColor" />
        </svg>
      </span>
      <span className="lp-continue-body">
        <span className="lp-continue-label">{resume ? "Продолжить просмотр" : "Следующий урок"}</span>
        <span className="lp-continue-title">{v.title}</span>
        <span className="lp-continue-meta">
          {subject.title} · {ch.title}
          {duration ? ` · ${duration}` : ""}
        </span>
        {resume ? <ProgressBar percent={percent} label={`${v.title}: ${percent}%`} /> : null}
      </span>
    </Link>
  );
}

function SubjectCard({ subject, index, watched, videoCompleted }) {
  const videos = subjectVideos(subject);
  const chaptersN = subject.subtopics?.length || 0;
  const percent = getSubjectWatchProgressPercent(subject, watched, videoCompleted);
  const done = countCompletedVideos(videos, watched, videoCompleted);
  const completed = percent >= 100 && videos.length > 0;
  const started = percent > 0;
  const duration = formatDuration(sumDuration(videos));
  const hue = HUES[index % HUES.length];

  return (
    <Link
      to={routes.lessonSubject(subject.id)}
      className={`lp-subject${completed ? " is-completed" : ""}`}
      style={{ "--hue": hue, "--i": index }}
      aria-label={`${subject.title}, просмотрено ${percent}%`}
    >
      <span className="lp-subject-top">
        <span className="lp-subject-title">{subject.title}</span>
        {completed ? (
          <span className="lp-subject-badge is-done">Пройдено</span>
        ) : started ? (
          <span className="lp-subject-badge">В процессе</span>
        ) : null}
      </span>
      <span className="lp-subject-meta">
        {formatChaptersCount(chaptersN)} · {formatLessonsCount(videos.length)}
        {duration ? ` · ${duration}` : ""}
      </span>
      <span className="lp-subject-progress">
        <ProgressBar percent={percent} label={`${subject.title}: ${percent}%`} />
        <span className="lp-subject-pct">
          {done}/{videos.length}
        </span>
      </span>
    </Link>
  );
}

export default function SubjectsIndex() {
  const { chapters, catalogLoading, catalogError, progress, loadCatalog } = useAuth();
  const [query, setQuery] = useState("");
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

  const q = query.trim().toLowerCase();
  const indexed = chapters.map((subject, index) => ({ subject, index }));
  const visible = q ? indexed.filter(({ subject }) => String(subject.title).toLowerCase().includes(q)) : indexed;

  return (
    <section className="lessons-flow lessons-flow-padded lp-page lp-page-wide">
      <header className="lp-hero">
        <div className="lp-hero-text">
          <span className="lp-hero-eyebrow">Ваш учебный путь</span>
          <h1 className="lp-hero-title">Предметы</h1>
          <p className="lp-hero-sub">{heroSubtitle(totalPercent, doneCount > 0 || totalPercent > 0)}</p>
          {chapters.length > 0 ? (
            <ul className="lp-hero-chips">
              <li>{formatSubjectsCount(chapters.length)}</li>
              <li>{formatLessonsCount(allVideos.length)}</li>
              {totalDuration ? <li>{totalDuration}</li> : null}
              {doneCount > 0 ? <li>{doneCount} пройдено</li> : null}
            </ul>
          ) : null}
        </div>
        {allVideos.length > 0 ? <ProgressRing percent={totalPercent} /> : null}
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
              <h2 className="lp-section-title">Все предметы</h2>
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

          <div className="lp-subject-grid">
            {visible.map(({ subject, index }) => (
              <SubjectCard
                key={subject.id}
                subject={subject}
                index={index}
                watched={watched}
                videoCompleted={videoCompleted}
              />
            ))}
          </div>

          {q && visible.length === 0 ? (
            <div className="empty-state card">
              <p className="muted">Ничего не найдено по запросу «{query.trim()}».</p>
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
