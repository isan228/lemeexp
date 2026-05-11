import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function HomePage() {
  const { progress } = useAuth();
  const lastVideoId = progress.lastVideoId;

  return (
    <section className="lessons-flow lessons-flow-padded">
      <header className="student-page-head">
        <p className="student-page-kicker">Личный кабинет</p>
        <h1>Главная</h1>
        <p className="subtitle student-page-intro">Быстрый доступ к материалам и прогрессу.</p>
        <div className="home-study-row">
          <Link to="/learning/lessons" className="btn-primary btn-study">
            Учиться
          </Link>
        </div>
      </header>
      <div className="card-grid">
        <article className="card">
          <h3>Уроки</h3>
          <p>Сначала выберите предмет, затем главу и видео.</p>
          <Link to="/learning/lessons" className="btn-primary inline">
            Перейти к урокам
          </Link>
        </article>
        <article className="card">
          <h3>Прогресс</h3>
          <p>{progress.percentage ?? 0}% просмотрено</p>
          <p>{progress.completedCount ?? 0} из {progress.totalVideos ?? 0} уроков</p>
        </article>
        <article className="card">
          <h3>Продолжить</h3>
          <p>{lastVideoId ? `Последнее видео #${lastVideoId}` : "Пока нет истории просмотра"}</p>
          <Link to="/learning/lessons" className="btn-link">
            Открыть каталог →
          </Link>
        </article>
      </div>
    </section>
  );
}
