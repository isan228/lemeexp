import { z } from "zod";

const commentCreateSchema = z.object({
  text: z.string().min(1).max(2000),
  parentId: z.coerce.number().int().positive().optional()
});

export async function ensureVideoCommentsTables(pool) {
  if (!pool) return;
  await pool.query(`
    create table if not exists video_comments (
      id bigserial primary key,
      video_id bigint not null references videos(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      parent_id bigint references video_comments(id) on delete cascade,
      text text not null,
      deleted_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create index if not exists idx_video_comments_video_created
    on video_comments (video_id, created_at asc)
  `);
  await pool.query(`
    create index if not exists idx_video_comments_parent
    on video_comments (parent_id)
  `);
  await pool.query(`
    create table if not exists video_comment_likes (
      comment_id bigint not null references video_comments(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (comment_id, user_id)
    )
  `);
  await pool.query(`
    create table if not exists video_comment_dislikes (
      comment_id bigint not null references video_comments(id) on delete cascade,
      user_id bigint not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (comment_id, user_id)
    )
  `);
}

function isAdminUser(user) {
  return user?.subscriptionType === "admin";
}

function mapMemAuthor(userId, resolveCommentAuthor) {
  return resolveCommentAuthor(userId);
}

function mapMemComment(row, memState, currentUserId, resolveCommentAuthor) {
  return {
    id: row.id,
    videoId: row.videoId,
    parentId: row.parentId ?? null,
    text: row.deletedAt ? null : row.text,
    deleted: Boolean(row.deletedAt),
    createdAt: row.createdAt,
    author: mapMemAuthor(row.userId, resolveCommentAuthor),
    likeCount: countMemLikes(memState, row.id),
    likedByMe: memLikedByUser(memState, row.id, currentUserId),
    dislikeCount: countMemDislikes(memState, row.id),
    dislikedByMe: memDislikedByUser(memState, row.id, currentUserId)
  };
}

function countMemLikes(memState, commentId) {
  return memState.videoCommentLikes.filter((l) => l.commentId === commentId).length;
}

function memLikedByUser(memState, commentId, userId) {
  return memState.videoCommentLikes.some((l) => l.commentId === commentId && l.userId === userId);
}

function countMemDislikes(memState, commentId) {
  return memState.videoCommentDislikes.filter((d) => d.commentId === commentId).length;
}

function memDislikedByUser(memState, commentId, userId) {
  return memState.videoCommentDislikes.some((d) => d.commentId === commentId && d.userId === userId);
}

function clearMemDislike(memState, commentId, userId) {
  const idx = memState.videoCommentDislikes.findIndex(
    (d) => d.commentId === commentId && d.userId === userId
  );
  if (idx >= 0) memState.videoCommentDislikes.splice(idx, 1);
}

function clearMemLike(memState, commentId, userId) {
  const idx = memState.videoCommentLikes.findIndex((l) => l.commentId === commentId && l.userId === userId);
  if (idx >= 0) memState.videoCommentLikes.splice(idx, 1);
}

function memReactionPayload(memState, commentId, userId) {
  return {
    likeCount: countMemLikes(memState, commentId),
    likedByMe: memLikedByUser(memState, commentId, userId),
    dislikeCount: countMemDislikes(memState, commentId),
    dislikedByMe: memDislikedByUser(memState, commentId, userId)
  };
}

export function registerVideoCommentRoutes(app, deps) {
  const {
    pool,
    memState,
    memVideoCommentNextIdRef,
    auth,
    requireAdmin,
    resolveCommentAuthor,
    getUserRecordById,
    videoExists
  } = deps;

  const isDbReady = () => Boolean(deps.dbReady);

  app.get("/videos/:videoId/comments", auth, async (req, res) => {
    try {
      const videoId = Number(req.params.videoId);
      const currentUserId = Number(req.user.userId);
      if (!Number.isFinite(videoId)) {
        return res.status(400).json({ message: "Invalid videoId" });
      }
      if (!(await videoExists(videoId))) {
        return res.status(404).json({ message: "Video not found" });
      }

      if (!isDbReady()) {
        const comments = memState.videoComments
          .filter((c) => Number(c.videoId) === videoId)
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id - b.id)
          .map((row) => mapMemComment(row, memState, currentUserId, resolveCommentAuthor));
        return res.json({ comments });
      }

      const result = await pool.query(
        `select c.id,
                c.video_id as "videoId",
                c.parent_id as "parentId",
                case when c.deleted_at is not null then null else c.text end as text,
                (c.deleted_at is not null) as deleted,
                c.created_at as "createdAt",
                u.id as "authorId",
                u.nickname as "authorNickname",
                (u.subscription_type = 'admin') as "authorIsAdmin",
                coalesce(lc.cnt, 0)::int as "likeCount",
                (my_like.user_id is not null) as "likedByMe",
                coalesce(dc.cnt, 0)::int as "dislikeCount",
                (my_dislike.user_id is not null) as "dislikedByMe"
         from video_comments c
         join users u on u.id = c.user_id
         left join lateral (
           select count(*)::int as cnt
           from video_comment_likes l
           where l.comment_id = c.id
         ) lc on true
         left join lateral (
           select count(*)::int as cnt
           from video_comment_dislikes d
           where d.comment_id = c.id
         ) dc on true
         left join video_comment_likes my_like
           on my_like.comment_id = c.id and my_like.user_id = $2
         left join video_comment_dislikes my_dislike
           on my_dislike.comment_id = c.id and my_dislike.user_id = $2
         where c.video_id = $1
         order by c.created_at asc, c.id asc`,
        [videoId, currentUserId]
      );

      const comments = result.rows.map((row) => ({
        id: row.id,
        videoId: row.videoId,
        parentId: row.parentId,
        text: row.text,
        deleted: Boolean(row.deleted),
        createdAt: row.createdAt,
        author: {
          id: row.authorId,
          nickname: row.authorNickname,
          isAdmin: Boolean(row.authorIsAdmin)
        },
        likeCount: row.likeCount,
        likedByMe: Boolean(row.likedByMe),
        dislikeCount: row.dislikeCount,
        dislikedByMe: Boolean(row.dislikedByMe)
      }));

      return res.json({ comments });
    } catch (error) {
      return res.status(500).json({ message: "Failed to load comments", error: error.message });
    }
  });

  app.post("/videos/:videoId/comments", auth, async (req, res) => {
    const parsed = commentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
    }

    try {
      const videoId = Number(req.params.videoId);
      const currentUserId = Number(req.user.userId);
      const cleanText = parsed.data.text.trim();
      const parentId = parsed.data.parentId ?? null;

      if (!Number.isFinite(videoId)) {
        return res.status(400).json({ message: "Invalid videoId" });
      }
      if (!cleanText) return res.status(400).json({ message: "Comment is empty" });
      if (!(await videoExists(videoId))) {
        return res.status(404).json({ message: "Video not found" });
      }

      const author = await getUserRecordById(currentUserId);
      if (!author) return res.status(404).json({ message: "User not found" });

      if (parentId !== null) {
        if (!isDbReady()) {
          const parent = memState.videoComments.find((c) => c.id === parentId);
          if (!parent || Number(parent.videoId) !== videoId) {
            return res.status(400).json({ message: "Invalid parent comment" });
          }
        } else {
          const parentResult = await pool.query(
            `select id from video_comments where id = $1 and video_id = $2 limit 1`,
            [parentId, videoId]
          );
          if (!parentResult.rows[0]) {
            return res.status(400).json({ message: "Invalid parent comment" });
          }
        }
      }

      if (!isDbReady()) {
        const row = {
          id: memVideoCommentNextIdRef.current++,
          videoId,
          userId: currentUserId,
          parentId,
          text: cleanText,
          deletedAt: null,
          createdAt: new Date().toISOString()
        };
        memState.videoComments.push(row);
        return res.status(201).json(mapMemComment(row, memState, currentUserId, resolveCommentAuthor));
      }

      const created = await pool.query(
        `insert into video_comments (video_id, user_id, parent_id, text)
         values ($1, $2, $3, $4)
         returning id, video_id as "videoId", parent_id as "parentId", text,
                   created_at as "createdAt", deleted_at as "deletedAt"`,
        [videoId, currentUserId, parentId, cleanText]
      );
      const row = created.rows[0];
      return res.status(201).json({
        id: row.id,
        videoId: row.videoId,
        parentId: row.parentId,
        text: row.text,
        deleted: false,
        createdAt: row.createdAt,
        author: {
          id: author.id,
          nickname: author.nickname,
          isAdmin: isAdminUser(author)
        },
        likeCount: 0,
        likedByMe: false,
        dislikeCount: 0,
        dislikedByMe: false
      });
    } catch (error) {
      return res.status(500).json({ message: "Failed to create comment", error: error.message });
    }
  });

  app.post("/video-comments/:commentId/like", auth, async (req, res) => {
    try {
      const commentId = Number(req.params.commentId);
      const currentUserId = Number(req.user.userId);
      if (!Number.isFinite(commentId)) {
        return res.status(400).json({ message: "Invalid commentId" });
      }

      if (!isDbReady()) {
        const comment = memState.videoComments.find((c) => c.id === commentId);
        if (!comment) return res.status(404).json({ message: "Comment not found" });
        const idx = memState.videoCommentLikes.findIndex(
          (l) => l.commentId === commentId && l.userId === currentUserId
        );
        if (idx >= 0) {
          memState.videoCommentLikes.splice(idx, 1);
        } else {
          clearMemDislike(memState, commentId, currentUserId);
          memState.videoCommentLikes.push({ commentId, userId: currentUserId });
        }
        return res.json({
          liked: memLikedByUser(memState, commentId, currentUserId),
          ...memReactionPayload(memState, commentId, currentUserId)
        });
      }

      const commentResult = await pool.query(`select id from video_comments where id = $1 limit 1`, [commentId]);
      if (!commentResult.rows[0]) return res.status(404).json({ message: "Comment not found" });

      const existing = await pool.query(
        `select 1 from video_comment_likes where comment_id = $1 and user_id = $2 limit 1`,
        [commentId, currentUserId]
      );
      if (existing.rows[0]) {
        await pool.query(`delete from video_comment_likes where comment_id = $1 and user_id = $2`, [
          commentId,
          currentUserId
        ]);
      } else {
        await pool.query(`delete from video_comment_dislikes where comment_id = $1 and user_id = $2`, [
          commentId,
          currentUserId
        ]);
        await pool.query(`insert into video_comment_likes (comment_id, user_id) values ($1, $2)`, [
          commentId,
          currentUserId
        ]);
      }

      const counts = await pool.query(
        `select
           (select count(*)::int from video_comment_likes where comment_id = $1) as "likeCount",
           (select count(*)::int from video_comment_dislikes where comment_id = $1) as "dislikeCount",
           exists(select 1 from video_comment_likes where comment_id = $1 and user_id = $2) as "likedByMe",
           exists(select 1 from video_comment_dislikes where comment_id = $1 and user_id = $2) as "dislikedByMe"`,
        [commentId, currentUserId]
      );
      const row = counts.rows[0];
      return res.json({
        liked: Boolean(row.likedByMe),
        likeCount: row.likeCount,
        likedByMe: Boolean(row.likedByMe),
        dislikeCount: row.dislikeCount,
        dislikedByMe: Boolean(row.dislikedByMe)
      });
    } catch (error) {
      return res.status(500).json({ message: "Failed to toggle like", error: error.message });
    }
  });

  app.post("/video-comments/:commentId/dislike", auth, async (req, res) => {
    try {
      const commentId = Number(req.params.commentId);
      const currentUserId = Number(req.user.userId);
      if (!Number.isFinite(commentId)) {
        return res.status(400).json({ message: "Invalid commentId" });
      }

      if (!isDbReady()) {
        const comment = memState.videoComments.find((c) => c.id === commentId);
        if (!comment) return res.status(404).json({ message: "Comment not found" });
        const idx = memState.videoCommentDislikes.findIndex(
          (d) => d.commentId === commentId && d.userId === currentUserId
        );
        if (idx >= 0) {
          memState.videoCommentDislikes.splice(idx, 1);
        } else {
          clearMemLike(memState, commentId, currentUserId);
          memState.videoCommentDislikes.push({ commentId, userId: currentUserId });
        }
        return res.json({
          disliked: memDislikedByUser(memState, commentId, currentUserId),
          ...memReactionPayload(memState, commentId, currentUserId)
        });
      }

      const commentResult = await pool.query(`select id from video_comments where id = $1 limit 1`, [commentId]);
      if (!commentResult.rows[0]) return res.status(404).json({ message: "Comment not found" });

      const existing = await pool.query(
        `select 1 from video_comment_dislikes where comment_id = $1 and user_id = $2 limit 1`,
        [commentId, currentUserId]
      );
      if (existing.rows[0]) {
        await pool.query(`delete from video_comment_dislikes where comment_id = $1 and user_id = $2`, [
          commentId,
          currentUserId
        ]);
      } else {
        await pool.query(`delete from video_comment_likes where comment_id = $1 and user_id = $2`, [
          commentId,
          currentUserId
        ]);
        await pool.query(`insert into video_comment_dislikes (comment_id, user_id) values ($1, $2)`, [
          commentId,
          currentUserId
        ]);
      }

      const counts = await pool.query(
        `select
           (select count(*)::int from video_comment_likes where comment_id = $1) as "likeCount",
           (select count(*)::int from video_comment_dislikes where comment_id = $1) as "dislikeCount",
           exists(select 1 from video_comment_likes where comment_id = $1 and user_id = $2) as "likedByMe",
           exists(select 1 from video_comment_dislikes where comment_id = $1 and user_id = $2) as "dislikedByMe"`,
        [commentId, currentUserId]
      );
      const row = counts.rows[0];
      return res.json({
        disliked: Boolean(row.dislikedByMe),
        likeCount: row.likeCount,
        likedByMe: Boolean(row.likedByMe),
        dislikeCount: row.dislikeCount,
        dislikedByMe: Boolean(row.dislikedByMe)
      });
    } catch (error) {
      return res.status(500).json({ message: "Failed to toggle dislike", error: error.message });
    }
  });

  app.delete("/admin/video-comments/:commentId", auth, requireAdmin, async (req, res) => {
    try {
      const commentId = Number(req.params.commentId);
      if (!Number.isFinite(commentId)) {
        return res.status(400).json({ message: "Invalid commentId" });
      }

      if (!isDbReady()) {
        const comment = memState.videoComments.find((c) => c.id === commentId);
        if (!comment) return res.status(404).json({ message: "Comment not found" });
        comment.deletedAt = new Date().toISOString();
        return res.status(204).send();
      }

      const updated = await pool.query(
        `update video_comments set deleted_at = now()
         where id = $1 and deleted_at is null
         returning id`,
        [commentId]
      );
      if (!updated.rows[0]) return res.status(404).json({ message: "Comment not found" });
      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ message: "Failed to delete comment", error: error.message });
    }
  });
}
