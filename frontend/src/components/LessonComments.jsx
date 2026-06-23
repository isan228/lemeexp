import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

export default function LessonComments({ videoId, videoTitle = "" }) {
  const { apiRequest, profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);
  const numericVideoId = Number(videoId);

  const loadMessages = useCallback(async () => {
    const res = await apiRequest(`/support/messages?videoId=${numericVideoId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Не удалось загрузить комментарии");
    }
    const data = await res.json();
    setMessages(data.messages || []);
    await apiRequest("/support/mark-read", { method: "POST" });
  }, [apiRequest, numericVideoId]);

  useEffect(() => {
    if (!Number.isFinite(numericVideoId) || numericVideoId <= 0) return undefined;
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
  }, [loadMessages, numericVideoId]);

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
        body: JSON.stringify({ text: clean, videoId: numericVideoId })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось отправить комментарий");
      }
      setText("");
      await loadMessages();
    } catch (err) {
      setError(err.message || "Ошибка отправки");
    } finally {
      setSending(false);
    }
  }

  if (!Number.isFinite(numericVideoId) || numericVideoId <= 0) return null;

  return (
    <article className="card watch-comments-card">
      <header className="watch-comments-head">
        <h2>Комментарии к уроку</h2>
        {videoTitle ? <p className="muted small">«{videoTitle}»</p> : null}
      </header>

      <form className="lesson-comment-form" onSubmit={sendMessage}>
        <div className="lesson-comment-input-row">
          <span className="lesson-comment-avatar">{(profile?.nickname || "Вы").slice(0, 1).toUpperCase()}</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Напишите комментарий или вопрос по уроку..."
            className="admin-textarea"
          />
        </div>
        <div className="lesson-comment-actions">
          <button type="submit" className="btn-primary" disabled={sending || !text.trim()}>
            {sending ? "Отправка…" : "Опубликовать"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="muted">Загрузка комментариев…</p>
      ) : (
        <div className="lesson-comments-list" ref={listRef}>
          {messages.length === 0 ? (
            <p className="muted">Пока нет комментариев. Будьте первым.</p>
          ) : (
            messages.map((m) => {
              const mine = m.senderRole !== "admin";
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
            })
          )}
        </div>
      )}

      {error ? <p className="form-error">{error}</p> : null}
    </article>
  );
}
