export function buildCommentTree(comments) {
  const byId = new Map();
  const roots = [];

  for (const comment of comments) {
    byId.set(comment.id, { ...comment, replies: [] });
  }

  for (const comment of comments) {
    const node = byId.get(comment.id);
    if (comment.parentId) {
      const parent = byId.get(comment.parentId);
      if (parent) parent.replies.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortReplies = (list) => {
    list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id - b.id);
    for (const item of list) {
      if (item.replies.length) sortReplies(item.replies);
    }
  };

  roots.sort(
    (a, b) => b.likeCount - a.likeCount || new Date(a.createdAt) - new Date(b.createdAt) || a.id - b.id
  );
  sortReplies(roots);
  return roots;
}

export function formatCommentTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "только что";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} мин назад`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ч назад`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)} дн назад`;
  return date.toLocaleString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}
