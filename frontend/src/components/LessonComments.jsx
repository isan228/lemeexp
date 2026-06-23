import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { buildCommentTree, formatCommentTime } from "../utils/commentTree.js";

function repliesLabel(count) {
  const n = Number(count) || 0;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ответ`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ответа`;
  return `${n} ответов`;
}

function ThumbUpIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="yt-comment-thumb-icon">
      <path
        d="M7.5 20.5V10.2L4.2 6.9a1 1 0 0 1-.2-.6V4.8A1 1 0 0 1 5 3.8h3.4c.4 0 .8.2 1 .6l1.1 2.2h6.8c.6 0 1 .4 1 1 0 .1 0 .3-.1.4l-1.7 4.1a1.6 1.6 0 0 1-1.4.9H11v7.5H7.5z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThumbDownIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="yt-comment-thumb-icon">
      <path
        d="M16.5 3.5v10.3l3.3 3.3c.1.2.2.4.2.6v1.5a1 1 0 0 1-1 1h-3.4a1 1 0 0 1-1-.6l-1.1-2.2H7.7a1 1 0 0 1-1-1c0-.1 0-.3.1-.4l1.7-4.1a1.6 1.6 0 0 1 1.4-.9H13V3.5h3.5z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CommentComposer({ value, onChange, onSubmit, submitting, onCancel, submitLabel, placeholder, compact }) {
  const { profile } = useAuth();

  return (
    <form
      className={`yt-comment-form${compact ? " is-compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="yt-comment-form-row">
        <span className={`yt-comment-avatar${profile?.subscriptionType === "admin" ? " is-admin" : ""}`}>
          {(profile?.nickname || "Вы").slice(0, 1).toUpperCase()}
        </span>
        <div className="yt-comment-form-field">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={compact ? 2 : 1}
            maxLength={2000}
            placeholder={placeholder}
            className="yt-comment-textarea"
            autoFocus={Boolean(onCancel)}
          />
          {(value.trim() || onCancel) && (
            <div className="yt-comment-form-actions">
              {onCancel ? (
                <button type="button" className="yt-comment-text-btn" onClick={onCancel} disabled={submitting}>
                  Отмена
                </button>
              ) : null}
              <button type="submit" className="yt-comment-submit-btn" disabled={submitting || !value.trim()}>
                {submitting ? "…" : submitLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

function CommentNode({
  comment,
  depth,
  videoId,
  apiRequest,
  isAdmin,
  onChanged,
  replyingTo,
  setReplyingTo,
  expandedThreads,
  setExpandedThreads
}) {
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [dislikeBusy, setDislikeBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const isReplying = replyingTo === comment.id;
  const replyCount = comment.replies?.length || 0;
  const repliesExpanded = expandedThreads.has(comment.id);

  async function toggleLike() {
    if (likeBusy || comment.deleted) return;
    setLikeBusy(true);
    try {
      const res = await apiRequest(`/video-comments/${comment.id}/like`, { method: "POST" });
      if (!res.ok) throw new Error("Не удалось поставить лайк");
      await onChanged();
    } catch {
      /* ignore */
    } finally {
      setLikeBusy(false);
    }
  }

  async function toggleDislike() {
    if (dislikeBusy || comment.deleted) return;
    setDislikeBusy(true);
    try {
      const res = await apiRequest(`/video-comments/${comment.id}/dislike`, { method: "POST" });
      if (!res.ok) throw new Error("Не удалось поставить дизлайк");
      await onChanged();
    } catch {
      /* ignore */
    } finally {
      setDislikeBusy(false);
    }
  }

  async function submitReply() {
    const clean = replyText.trim();
    if (!clean) return;
    setReplySending(true);
    try {
      const res = await apiRequest(`/videos/${videoId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, parentId: comment.id })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось отправить ответ");
      }
      setReplyText("");
      setReplyingTo(null);
      setExpandedThreads((prev) => new Set(prev).add(comment.id));
      await onChanged();
    } catch {
      /* ignore */
    } finally {
      setReplySending(false);
    }
  }

  async function deleteComment() {
    if (!isAdmin || deleteBusy) return;
    if (!window.confirm("Удалить комментарий? Ответы останутся.")) return;
    setDeleteBusy(true);
    try {
      const res = await apiRequest(`/admin/video-comments/${comment.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Не удалось удалить");
      await onChanged();
    } catch {
      /* ignore */
    } finally {
      setDeleteBusy(false);
    }
  }

  function toggleReplies() {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(comment.id)) next.delete(comment.id);
      else next.add(comment.id);
      return next;
    });
  }

  const handle = comment.author?.nickname || "Пользователь";

  return (
    <article className={`yt-comment${depth > 0 ? " is-nested" : ""}`}>
      <span className={`yt-comment-avatar${comment.author?.isAdmin ? " is-admin" : ""}`}>
        {handle.slice(0, 1).toUpperCase()}
      </span>

      <div className="yt-comment-body">
        <header className="yt-comment-head">
          <span className="yt-comment-handle">@{handle}</span>
          {comment.author?.isAdmin ? <span className="yt-comment-author-tag">Автор</span> : null}
          <span className="yt-comment-time">{formatCommentTime(comment.createdAt)}</span>
        </header>

        <p className={`yt-comment-text${comment.deleted ? " is-deleted" : ""}`}>
          {comment.deleted ? "[Комментарий удалён]" : comment.text}
        </p>

        {!comment.deleted ? (
          <div className="yt-comment-toolbar">
            <button
              type="button"
              className={`yt-comment-tool-btn${comment.likedByMe ? " is-active" : ""}`}
              onClick={() => void toggleLike()}
              disabled={likeBusy}
              aria-pressed={comment.likedByMe}
            >
              <ThumbUpIcon filled={comment.likedByMe} />
              {comment.likeCount > 0 ? <span>{comment.likeCount}</span> : null}
            </button>
            <button
              type="button"
              className={`yt-comment-tool-btn yt-comment-tool-dislike${comment.dislikedByMe ? " is-active" : ""}`}
              onClick={() => void toggleDislike()}
              disabled={dislikeBusy}
              aria-pressed={comment.dislikedByMe}
            >
              <ThumbDownIcon filled={comment.dislikedByMe} />
              {comment.dislikeCount > 0 ? <span>{comment.dislikeCount}</span> : null}
            </button>
            <button
              type="button"
              className="yt-comment-text-btn"
              onClick={() => setReplyingTo(isReplying ? null : comment.id)}
            >
              Ответить
            </button>
            {isAdmin ? (
              <button
                type="button"
                className="yt-comment-text-btn yt-comment-text-danger"
                onClick={() => void deleteComment()}
                disabled={deleteBusy}
              >
                {deleteBusy ? "…" : "Удалить"}
              </button>
            ) : null}
          </div>
        ) : null}

        {isReplying ? (
          <CommentComposer
            value={replyText}
            onChange={setReplyText}
            onSubmit={() => void submitReply()}
            submitting={replySending}
            onCancel={() => {
              setReplyingTo(null);
              setReplyText("");
            }}
            submitLabel="Ответить"
            placeholder="Напишите ответ..."
            compact
          />
        ) : null}

        {replyCount > 0 ? (
          <div className="yt-comment-replies-wrap">
            <button type="button" className="yt-comment-replies-toggle" onClick={toggleReplies}>
              <span className="yt-comment-thread-mark" aria-hidden="true" />
              <span className="yt-comment-replies-label">{repliesExpanded ? "Скрыть" : repliesLabel(replyCount)}</span>
              <span className={`yt-comment-chevron${repliesExpanded ? " is-open" : ""}`} aria-hidden="true">
                ▾
              </span>
            </button>

            {repliesExpanded ? (
              <div className="yt-comment-replies">
                {comment.replies.map((reply) => (
                  <CommentNode
                    key={reply.id}
                    comment={reply}
                    depth={depth + 1}
                    videoId={videoId}
                    apiRequest={apiRequest}
                    isAdmin={isAdmin}
                    onChanged={onChanged}
                    replyingTo={replyingTo}
                    setReplyingTo={setReplyingTo}
                    expandedThreads={expandedThreads}
                    setExpandedThreads={setExpandedThreads}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function LessonComments({ videoId, videoTitle = "" }) {
  const { apiRequest, profile } = useAuth();
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [expandedThreads, setExpandedThreads] = useState(new Set());
  const numericVideoId = Number(videoId);
  const isAdmin = profile?.subscriptionType === "admin";

  const loadComments = useCallback(async () => {
    const res = await apiRequest(`/videos/${numericVideoId}/comments`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Не удалось загрузить комментарии");
    }
    const data = await res.json();
    setComments(data.comments || []);
  }, [apiRequest, numericVideoId]);

  useEffect(() => {
    if (!Number.isFinite(numericVideoId) || numericVideoId <= 0) return undefined;
    let mounted = true;
    setLoading(true);
    setError("");
    loadComments()
      .catch((err) => {
        if (mounted) setError(err.message || "Ошибка загрузки");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const timer = setInterval(() => {
      loadComments().catch(() => {});
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [loadComments, numericVideoId]);

  const tree = useMemo(() => buildCommentTree(comments), [comments]);

  async function submitComment() {
    const clean = text.trim();
    if (!clean) return;
    setSending(true);
    setError("");
    try {
      const res = await apiRequest(`/videos/${numericVideoId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Не удалось отправить комментарий");
      }
      setText("");
      await loadComments();
    } catch (err) {
      setError(err.message || "Ошибка отправки");
    } finally {
      setSending(false);
    }
  }

  if (!Number.isFinite(numericVideoId) || numericVideoId <= 0) return null;

  return (
    <section className="yt-comments-section">
      <header className="yt-comments-head">
        <h2>
          Комментарии
          {!loading ? <span className="yt-comments-count">{comments.length}</span> : null}
        </h2>
        {videoTitle ? <p className="yt-comments-subtitle">{videoTitle}</p> : null}
      </header>

      <CommentComposer
        value={text}
        onChange={setText}
        onSubmit={() => void submitComment()}
        submitting={sending}
        submitLabel="Комментировать"
        placeholder="Введите комментарий"
      />

      {loading ? (
        <div className="yt-comments-loading" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <span>Загрузка…</span>
        </div>
      ) : tree.length === 0 ? (
        <p className="yt-comments-empty muted">Пока нет комментариев — напишите первый.</p>
      ) : (
        <div className="yt-comments-list">
          {tree.map((comment) => (
            <CommentNode
              key={comment.id}
              comment={comment}
              depth={0}
              videoId={numericVideoId}
              apiRequest={apiRequest}
              isAdmin={isAdmin}
              onChanged={loadComments}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              expandedThreads={expandedThreads}
              setExpandedThreads={setExpandedThreads}
            />
          ))}
        </div>
      )}

      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}
