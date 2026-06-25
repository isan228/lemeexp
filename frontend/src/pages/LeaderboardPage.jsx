import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { formatWatchDuration } from "../utils/watchTime.js";

export default function LeaderboardPage() {
  const { apiRequest } = useAuth();
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("/leaderboard/weekly?limit=10");
        if (!cancelled && res.ok) {
          setLeaderboard(await res.json());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiRequest]);

  const currentInList = leaderboard?.entries?.some((entry) => entry.isCurrentUser) ?? false;
  const showSeparateRank =
    leaderboard?.currentUser &&
    !currentInList &&
    leaderboard.currentUser.rank != null &&
    leaderboard.currentUser.seconds > 0;

  return (
    <section className="lessons-flow lessons-flow-padded">
      <PageHeader
        kicker="Соревнование"
        title="Рейтинг за неделю"
        intro="Кто больше всех смотрел уроки за последние 7 дней."
      />

      {leaderboard?.currentUser?.rank ? (
        <p className="profile-leaderboard-you leaderboard-page-rank muted">
          Ваше место: <strong>#{leaderboard.currentUser.rank}</strong>
        </p>
      ) : null}

      <article className="profile-panel card profile-leaderboard">
        {loading ? (
          <div className="loading-block">
            <div className="loading-spinner" aria-hidden="true" />
            <p className="muted">Загрузка рейтинга…</p>
          </div>
        ) : leaderboard?.entries?.length ? (
          <ol className="profile-leaderboard-list">
            {leaderboard.entries.map((entry) => (
              <li
                key={entry.userId}
                className={`profile-leaderboard-item${entry.isCurrentUser ? " is-you" : ""}${
                  entry.rank <= 3 ? ` is-top-${entry.rank}` : ""
                }`}
              >
                <span className="profile-leaderboard-rank" aria-hidden="true">
                  {entry.rank}
                </span>
                <span className="profile-leaderboard-name">
                  {entry.isCurrentUser ? "Вы" : entry.nickname}
                </span>
                <span className="profile-leaderboard-time">{formatWatchDuration(entry.seconds)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted small profile-leaderboard-empty">
            Пока никто не смотрел уроки на этой неделе. Будьте первым!
          </p>
        )}

        {showSeparateRank ? (
          <div className="profile-leaderboard-self card">
            <span className="profile-leaderboard-rank">#{leaderboard.currentUser.rank}</span>
            <span className="profile-leaderboard-name">Вы</span>
            <span className="profile-leaderboard-time">
              {formatWatchDuration(leaderboard.currentUser.seconds)}
            </span>
          </div>
        ) : null}

        {!loading && leaderboard?.currentUser?.rank == null ? (
          <p className="profile-leaderboard-hint muted small">
            Вы пока не в рейтинге — начните смотреть уроки, чтобы попасть в таблицу.
          </p>
        ) : null}
      </article>
    </section>
  );
}
