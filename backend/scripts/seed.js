import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin1234";
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  await pool.query(
    `insert into users (id, email, password_hash, nickname, subscription_type, exam_date)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (email) do update
     set password_hash = excluded.password_hash,
         nickname = excluded.nickname,
         subscription_type = excluded.subscription_type,
         exam_date = excluded.exam_date`,
    [1, "student@example.com", passwordHash, "Student", "premium", "2026-11-14"]
  );

  await pool.query(
    `insert into users (id, email, password_hash, nickname, subscription_type)
     values ($1, $2, $3, $4, $5)
     on conflict (email) do update
     set password_hash = excluded.password_hash,
         nickname = excluded.nickname,
         subscription_type = excluded.subscription_type`,
    [999, adminEmail, adminPasswordHash, "Admin", "admin"]
  );

  await pool.query(
    `insert into courses (id, title, "order")
     values (1, 'Биохимия', 1), (2, 'Иммунология', 2)
     on conflict (id) do update set title = excluded.title, "order" = excluded."order"`
  );

  await pool.query(
    `insert into subtopics (id, course_id, title, "order")
     values (11, 1, 'Молекулы', 1), (21, 2, 'Клеточный иммунитет', 1)
     on conflict (id) do update
     set course_id = excluded.course_id, title = excluded.title, "order" = excluded."order"`
  );

  await pool.query(
    `insert into videos (id, subtopic_id, title, duration, stream_path, "order")
     values
      (101, 11, 'Белки и аминокислоты', 860, 'hls/101/manifest.m3u8', 1),
      (102, 11, 'Углеводы и липиды', 920, 'hls/102/manifest.m3u8', 2),
      (201, 21, 'Т-лимфоциты', 780, 'hls/201/manifest.m3u8', 1)
     on conflict (id) do update
     set subtopic_id = excluded.subtopic_id,
         title = excluded.title,
         duration = excluded.duration,
         stream_path = excluded.stream_path,
         "order" = excluded."order"`
  );

  await pool.query(
    `select setval(pg_get_serial_sequence('users','id'), coalesce((select max(id) from users), 1), true)`
  );
  await pool.query(
    `select setval(pg_get_serial_sequence('courses','id'), coalesce((select max(id) from courses), 1), true)`
  );
  await pool.query(
    `select setval(pg_get_serial_sequence('subtopics','id'), coalesce((select max(id) from subtopics), 1), true)`
  );
  await pool.query(
    `select setval(pg_get_serial_sequence('videos','id'), coalesce((select max(id) from videos), 1), true)`
  );

  await pool.end();
  console.log("Seed completed");
}

run().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
