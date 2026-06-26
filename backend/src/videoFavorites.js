export async function ensureVideoFavoritesTables(pool) {
  if (!pool) return;
  await pool.query(`
    create table if not exists video_favorites (
      user_id bigint not null references users(id) on delete cascade,
      video_id bigint not null references videos(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (user_id, video_id)
    )
  `);
  await pool.query(`
    create index if not exists idx_video_favorites_user_created
    on video_favorites (user_id, created_at desc)
  `);
  await pool.query(`
    create index if not exists idx_video_favorites_video
    on video_favorites (video_id)
  `);
}

function memIsFavorited(memState, userId, videoId) {
  return memState.videoFavorites.some(
    (row) => Number(row.userId) === Number(userId) && Number(row.videoId) === Number(videoId)
  );
}

function memListFavorites(memState, userId) {
  return memState.videoFavorites
    .filter((row) => Number(row.userId) === Number(userId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((row) => ({
      videoId: Number(row.videoId),
      createdAt: row.createdAt
    }));
}

function memFavoriteVideoIds(memState, userId) {
  return memListFavorites(memState, userId).map((row) => row.videoId);
}

function memToggleFavorite(memState, userId, videoId) {
  const uid = Number(userId);
  const vid = Number(videoId);
  const idx = memState.videoFavorites.findIndex(
    (row) => Number(row.userId) === uid && Number(row.videoId) === vid
  );
  if (idx >= 0) {
    memState.videoFavorites.splice(idx, 1);
    return false;
  }
  memState.videoFavorites.push({
    userId: uid,
    videoId: vid,
    createdAt: new Date().toISOString()
  });
  return true;
}

function memFavoriteStats(memState, resolveVideoMeta) {
  const counts = new Map();
  for (const row of memState.videoFavorites) {
    const vid = Number(row.videoId);
    counts.set(vid, (counts.get(vid) || 0) + 1);
  }
  const videos = Array.from(counts.entries())
    .map(([videoId, favoriteCount]) => {
      const meta = resolveVideoMeta(videoId) || {};
      return {
        videoId,
        title: meta.title || `Видео #${videoId}`,
        courseTitle: meta.courseTitle || "—",
        subtopicTitle: meta.subtopicTitle || "—",
        favoriteCount
      };
    })
    .sort((a, b) => b.favoriteCount - a.favoriteCount || a.title.localeCompare(b.title, "ru"));

  return {
    totalFavorites: memState.videoFavorites.length,
    uniqueVideos: videos.length,
    videos
  };
}

export function registerVideoFavoriteRoutes(app, deps) {
  const { pool, memState, auth, requireAdmin, videoExists, resolveVideoMeta } = deps;
  const isDbReady = () => Boolean(deps.dbReady);

  app.get("/favorites", auth, async (req, res) => {
    try {
      const userId = req.user.userId;
      if (!isDbReady()) {
        const items = memListFavorites(memState, userId);
        return res.json({ videoIds: items.map((item) => item.videoId), items });
      }
      const result = await pool.query(
        `select video_id as "videoId", created_at as "createdAt"
         from video_favorites
         where user_id = $1
         order by created_at desc`,
        [userId]
      );
      const items = result.rows.map((row) => ({
        videoId: Number(row.videoId),
        createdAt: row.createdAt
      }));
      return res.json({ videoIds: items.map((item) => item.videoId), items });
    } catch (error) {
      return res.status(500).json({ message: "Failed to load favorites", error: error.message });
    }
  });

  app.post("/videos/:videoId/favorite", auth, async (req, res) => {
    const videoId = Number(req.params.videoId);
    if (!Number.isFinite(videoId) || videoId <= 0) {
      return res.status(400).json({ message: "Invalid video id" });
    }
    try {
      const exists = await videoExists(videoId);
      if (!exists) return res.status(404).json({ message: "Video not found" });

      const userId = req.user.userId;
      if (!isDbReady()) {
        const favorited = memToggleFavorite(memState, userId, videoId);
        const videoIds = memFavoriteVideoIds(memState, userId);
        return res.json({ favorited, videoIds });
      }

      const existing = await pool.query(
        `select 1 from video_favorites where user_id = $1 and video_id = $2 limit 1`,
        [userId, videoId]
      );
      let favorited;
      if (existing.rows[0]) {
        await pool.query(`delete from video_favorites where user_id = $1 and video_id = $2`, [
          userId,
          videoId
        ]);
        favorited = false;
      } else {
        await pool.query(
          `insert into video_favorites (user_id, video_id) values ($1, $2)
           on conflict do nothing`,
          [userId, videoId]
        );
        favorited = true;
      }
      const idsResult = await pool.query(
        `select video_id as "videoId" from video_favorites where user_id = $1 order by created_at desc`,
        [userId]
      );
      const videoIds = idsResult.rows.map((row) => Number(row.videoId));
      return res.json({ favorited, videoIds });
    } catch (error) {
      return res.status(500).json({ message: "Failed to toggle favorite", error: error.message });
    }
  });

  app.get("/admin/favorites/stats", auth, requireAdmin, async (_req, res) => {
    try {
      if (!isDbReady()) {
        return res.json(memFavoriteStats(memState, resolveVideoMeta));
      }
      const [totalsResult, videosResult] = await Promise.all([
        pool.query(`select count(*)::int as total from video_favorites`),
        pool.query(
          `select vf.video_id as "videoId",
                  count(*)::int as "favoriteCount",
                  v.title,
                  c.title as "courseTitle",
                  s.title as "subtopicTitle"
           from video_favorites vf
           join videos v on v.id = vf.video_id
           join subtopics s on s.id = v.subtopic_id
           join courses c on c.id = s.course_id
           group by vf.video_id, v.title, c.title, s.title
           order by count(*) desc, v.title asc`
        )
      ]);
      const videos = videosResult.rows.map((row) => ({
        videoId: Number(row.videoId),
        title: row.title,
        courseTitle: row.courseTitle,
        subtopicTitle: row.subtopicTitle,
        favoriteCount: Number(row.favoriteCount) || 0
      }));
      return res.json({
        totalFavorites: Number(totalsResult.rows[0]?.total) || 0,
        uniqueVideos: videos.length,
        videos
      });
    } catch (error) {
      return res.status(500).json({ message: "Failed to load favorite stats", error: error.message });
    }
  });
}
