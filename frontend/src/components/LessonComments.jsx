import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { buildCommentTree, formatCommentTime } from "../utils/commentTree.js";

function CommentComposer({ value, onChange, onSubmit, submitting, onCancel, submitLabel, placeholder }) {
  const { profile } = useAuth();

  return (
    <form
      className="reddit-comment-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="reddit-comment-input-row">
        <span className="lesson-comment-avatar">{(profile?.nickname || "Вы").slice(0, 1).toUpperCase()}</span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={placeholder}
          className="admin-textarea"
          autoFocus={Boolean(onCancel)}
        />
      </div>
      <div className="reddit-comment-form-actions">
        {onCancel ? (
          <button type="button" className="btn-secondary reddit-btn-sm" onClick={onCancel} disabled={submitting}>
            Отмена
          </button>
        ) : null}
        <button type="submit" className="btn-primary reddit-btn-sm" disabled={submitting || !value.trim()}>
          {submitting ? "Отправка…" : submitLabel}
        </button>
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
  setReplyingTo
}) {
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const isReplying = replyingTo === comment.id;

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
      await onChanged();
    } catch {
      /* parent shows errors */
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

  return (
    <article className="reddit-comment" style={{ "--comment-depth": depth }}>
      <div className="reddit-comment-vote" aria-label="Лайки">
        <button
          type="button"
          className={`reddit-vote-btn${comment.likedByMe ? " is-active" : ""}`}
          onClick={() => void toggleLike()}
          disabled={likeBusy || comment.deleted}
          aria-pressed={comment.likedByMe}
          aria-label={comment.likedByMe ? "Убрать лайк" : "Поставить лайк"}
        >
          ▲
        </button>
        <span className="reddit-vote-count">{comment.likeCount}</span>
      </div>

      <div className="reddit-comment-main">
        <header className="reddit-comment-meta">
          <strong className="reddit-comment-author">{comment.author?.nickname || "Пользователь"}</strong>
          {comment.author?.isAdmin ? <span className="lesson-comment-badge">Автор</span> : null}
          <span className="reddit-comment-time">{formatCommentTime(comment.createdAt)}</span>
        </header>

        <div className={`reddit-comment-text${comment.deleted ? " is-deleted" : ""}`}>
          {comment.deleted ? "[Комментарий удалён]" : comment.text}
        </div>

        {!comment.deleted ? (
          <div className="reddit-comment-actions">
            <button type="button" className="reddit-action-btn" onClick={() => setReplyingTo(isReplying ? null : comment.id)}>
              Ответить
            </button>
            {isAdmin ? (
              <button type="button" className="reddit-action-btn reddit-action-danger" onClick={() => void deleteComment()} disabled={deleteBusy}>
                {deleteBusy ? "Удаление…" : "Удалить"}
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
          />
        ) : null}

        {comment.replies?.length ? (
          <div className="reddit-comment-children">
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
              />
            ))}
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
    <article className="card watch-comments-card reddit-comments-card">
      <header className="watch-comments-head">
        <h2>Комментарии</h2>
        {videoTitle ? <p className="muted small">«{videoTitle}»</p> : null}
      </header>

      <CommentComposer
        value={text}
        onChange={setText}
        onSubmit={() => void submitComment()}
        submitting={sending}
        submitLabel="Комментировать"
        placeholder="Что думаете об этом уроке?"
      />

      {loading ? (
        <p className="muted">Загрузка комментариев…</p>
      ) : tree.length === 0 ? (
        <p className="muted reddit-comments-empty">Пока нет комментариев. Начните обсуждение.</p>
      ) : (
        <div className="reddit-comments-thread">
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
            />
          ))}
        </div>
      )}

      {error ? <p className="form-error">{error}</p> : null}
    </article>
  );
}
