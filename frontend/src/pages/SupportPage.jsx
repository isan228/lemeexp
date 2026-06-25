import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { routes } from "../config/site.js";
import { findVideoById } from "../utils/continueLesson.js";

function formatMessageTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function ChatMessage({ message, profile, showLessonTag }) {
  const mine = message.senderRole !== "admin";
  const name = mine ? profile?.nickname || "Вы" : "Ментор";
  const initial = (mine ? profile?.nickname || "Вы" : "M").slice(0, 1).toUpperCase();

  return (
    <div className={`support-chat-row${mine ? " is-mine" : " is-theirs"}`}>
      {!mine ? (
        <span className="support-chat-avatar is-mentor" aria-hidden="true">
          {initial}
        </span>
      ) : null}
      <div className="support-chat-bubble">
        <div className="support-chat-bubble-head">
          <strong>{name}</strong>
          <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
        </div>
        {showLessonTag && (message.videoTitle || message.videoId) ? (
          <span className="support-chat-lesson-tag">
            Урок: {message.videoTitle || `#${message.videoId}`}
          </span>
        ) : null}
        <p className="support-chat-text">{message.text}</p>
      </div>
      {mine ? (
        <span className="support-chat-avatar is-you" aria-hidden="true">
          {initial}
        </span>
      ) : null}
    </div>
  );
}

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
  }, [messages, loading]);

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

  const placeholder = videoId
    ? "Задайте вопрос по этому уроку…"
    : "Напишите сообщение ментору…";

  return (
    <section className="lessons-flow lessons-flow-padded support-page">
      <PageHeader
        kicker="Помощь"
        title={videoId ? "Вопросы к уроку" : "Чат с ментором"}
        intro={
          videoId
            ? `Задайте вопрос по уроку${lessonLabel ? ` «${lessonLabel}»` : ""}.`
            : "Вопросы по урокам, доступу и подготовке к экзаменам."
        }
      >
        {videoId ? (
          <p className="back-row support-back-links">
            {lessonHref ? (
              <Link to={lessonHref}>← Вернуться к уроку</Link>
            ) : null}
            <Link to={routes.learningSupport}>← Общий чат</Link>
          </p>
        ) : null}
      </PageHeader>

      <article className="card support-chat-shell">
        <header className="support-chat-toolbar">
          <div className="support-chat-toolbar-main">
            <span className="support-chat-toolbar-dot" aria-hidden="true" />
            <div>
              <strong className="support-chat-toolbar-title">Let me explain · Поддержка</strong>
              <p className="support-chat-toolbar-sub muted small">Обычно отвечаем в течение дня</p>
            </div>
          </div>
          {videoId && lessonLabel ? (
            <span className="support-chat-toolbar-lesson">{lessonLabel}</span>
          ) : null}
        </header>

        <div className="support-chat-messages" ref={listRef} aria-live="polite">
          {loading ? (
            <div className="support-chat-state">
              <div className="loading-spinner" aria-hidden="true" />
              <p className="muted">Загрузка переписки…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="support-chat-state support-chat-empty">
              <span className="support-chat-empty-icon" aria-hidden="true" />
              <p>
                {videoId
                  ? "Пока нет вопросов по этому уроку."
                  : "Диалог пока пуст — напишите первым."}
              </p>
              <p className="muted small">
                {videoId
                  ? "Опишите, что было непонятно в видео."
                  : "Спросите про урок, доступ или подготовку к USMLE."}
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <ChatMessage
                key={m.id}
                message={m}
                profile={profile}
                showLessonTag={!videoId}
              />
            ))
          )}
        </div>

        {error ? <p className="form-error support-chat-error">{error}</p> : null}

        <form className="support-chat-composer" onSubmit={sendMessage}>
          <div className="support-chat-composer-row">
            <span className="support-chat-avatar is-you support-chat-composer-avatar" aria-hidden="true">
              {(profile?.nickname || "Вы").slice(0, 1).toUpperCase()}
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={1}
              maxLength={2000}
              placeholder={placeholder}
              className="support-chat-input"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!sending && text.trim()) {
                    void sendMessage(e);
                  }
                }
              }}
            />
            <button
              type="submit"
              className="support-chat-send"
              disabled={sending || !text.trim()}
              aria-label={sending ? "Отправка…" : "Отправить"}
            >
              {sending ? "…" : "↑"}
            </button>
          </div>
          <p className="support-chat-composer-hint muted small">Enter — отправить, Shift+Enter — новая строка</p>
        </form>
      </article>
    </section>
  );
}
