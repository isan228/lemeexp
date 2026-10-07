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

function SubjectCard({ subject, watched, videoCompleted }) {
  const videos = subjectVideos(subject);
  const chaptersN = subject.subtopics?.length || 0;
  const percent = getSubjectWatchProgressPercent(subject, watched, videoCompleted);
  const completed = percent >= 100 && videos.length > 0;

  return (
    <Link
      to={routes.lessonSubject(subject.id)}
      className={`lp-subject${completed ? " is-completed" : ""}${percent > 0 ? " is-started" : ""}`}
      aria-label={`${subject.title}, просмотрено ${percent}%`}
    >
      <span className="lp-subject-top">
        <span className="lp-subject-title">{subject.title}</span>
        <span className="lp-subject-pct">
          {percent}
          <small>%</small>
        </span>
      </span>
      <span className="lp-subject-meta">
        {formatChaptersCount(chaptersN)} · {formatLessonsCount(videos.length)}
      </span>
      <ProgressBar percent={percent} label={`${subject.title}: ${percent}%`} />
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
  const visible = q ? chapters.filter((subject) => String(subject.title).toLowerCase().includes(q)) : chapters;

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
            {visible.map((subject) => (
              <SubjectCard
                key={subject.id}
                subject={subject}
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
