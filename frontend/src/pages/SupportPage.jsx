import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { routes } from "../config/site.js";
import { findVideoById } from "../utils/continueLesson.js";

export default function SupportPage() {
  const [searchParams] = useSearchParams();
  const { apiRequest, profile, chapters } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);
  const videoId = Number(searchParams.get("videoId") || 0) || null;
  const videoTitleFromQuery = searchParams.get("videoTitle")?.trim() || "";
  const lessonLabel = useMemo(() => {
    const fromMessages = messages.find((m) => Number(m.videoId || 0) > 0)?.videoTitle || "";
    return fromMessages || videoTitleFromQuery;
  }, [messages, videoTitleFromQuery]);
  const lessonLocation = useMemo(
    () => (videoId ? findVideoById(chapters, videoId) : null),
    [chapters, videoId]
  );
  const lessonHref = lessonLocation
    ? routes.lessonVideo(lessonLocation.subject.id, lessonLocation.chapter.id, lessonLocation.video.id)
    : null;

  const loadMessages = useCallback(async () => {
    const path = videoId ? `/support/messages?videoId=${videoId}` : "/support/messages";
    const res = await apiRequest(path);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Не удалось загрузить чат");
    }
    const data = await res.json();
    setMessages(data.messages || []);
    await apiRequest("/support/mark-read", { method: "POST" });
  }, [apiRequest, videoId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    loadMessages()
      .catch((err) => {
        if (mounted) setError(err.message || "Ошибка загрузки");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const timer = setInterval(() => {
      loadMessages().catch(() => {});
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [loadMessages]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function sendMessage(e) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    setSending(true);
    setError("");
    try {
      const res = await apiRequest("/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, ...(videoId ? { videoId } : {}) })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось отправить сообщение");
      }
      setText("");
      await loadMessages();
    } catch (err) {
      setError(err.message || "Ошибка отправки");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="lessons-flow lessons-flow-padded">
      <header className="student-page-head">
        <p className="student-page-kicker">Помощь</p>
        <h1>{videoId ? "Вопросы к уроку" : "Чат с админом"}</h1>
        <p className="subtitle student-page-intro">
          {videoId
            ? `Задайте вопрос по уроку${lessonLabel ? ` «${lessonLabel}»` : ""}.`
            : "Пишите вопросы по урокам и доступу. Админ видит сообщения в своей панели."}
        </p>
        {videoId ? (
          <p className="back-row support-back-links">
            {lessonHref ? (
              <Link to={lessonHref}>← Вернуться к уроку</Link>
            ) : null}
            <Link to={routes.learningSupport}>← Общий чат</Link>
          </p>
        ) : null}
      </header>

      <article className="card support-chat-card">
        {videoId ? (
          <form className="lesson-comment-form" onSubmit={sendMessage}>
            <div className="lesson-comment-input-row">
              <span className="lesson-comment-avatar">{(profile?.nickname || "Вы").slice(0, 1).toUpperCase()}</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Добавьте вопрос к этому уроку..."
                className="admin-textarea"
              />
            </div>
            <div className="lesson-comment-actions">
              <button type="submit" className="btn-primary" disabled={sending || !text.trim()}>
                {sending ? "Отправка…" : "Опубликовать"}
              </button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <p className="muted">Загрузка переписки…</p>
        ) : (
          <div className={videoId ? "lesson-comments-list" : "support-chat-list"} ref={listRef}>
            {messages.length === 0 ? (
              <p className="muted">{videoId ? "Пока нет комментариев. Задайте первый вопрос." : "Пока сообщений нет. Начните диалог."}</p>
            ) : (
              messages.map((m) => {
                const mine = m.senderRole !== "admin";
                if (videoId) {
                  return (
                    <div key={m.id} className="lesson-comment-item">
                      <span className={`lesson-comment-avatar ${mine ? "" : "admin"}`}>
                        {(mine ? profile?.nickname || "Вы" : "A").slice(0, 1).toUpperCase()}
                      </span>
                      <div className="lesson-comment-body">
                        <div className="lesson-comment-meta">
                          <strong>{mine ? profile?.nickname || "Вы" : "Админ"}</strong>
                          {!mine ? <span className="lesson-comment-badge">Автор</span> : null}
                          <span>{new Date(m.createdAt).toLocaleString("ru-RU")}</span>
                        </div>
                        <p>{m.text}</p>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className={mine ? "support-msg support-msg-mine" : "support-msg support-msg-admin"}>
                    <div className="support-msg-meta">
                      <strong>{mine ? profile?.nickname || "Вы" : "Админ"}</strong>
                      <span>{new Date(m.createdAt).toLocaleString("ru-RU")}</span>
                    </div>
                    {m.videoTitle || m.videoId ? (
                      <div className="muted small">Урок: {m.videoTitle || `#${m.videoId}`}</div>
                    ) : null}
                    <p>{m.text}</p>
                  </div>
                );
              })
            )}
          </div>
        )}

        {error && <p className="form-error">{error}</p>}

        {!videoId ? (
          <form className="support-chat-form" onSubmit={sendMessage}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Введите сообщение"
              className="admin-textarea"
            />
            <button type="submit" className="btn-primary" disabled={sending || !text.trim()}>
              {sending ? "Отправка…" : "Отправить"}
            </button>
          </form>
        ) : null}
      </article>
    </section>
  );
}
