create table if not exists users (
  id bigserial primary key,
  email text not null unique,
  password_hash text not null,
  nickname text not null,
  subscription_type text not null default 'free',
  exam_date date,
  last_video_id bigint,
  created_at timestamptz not null default now()
);

alter table users
  add column if not exists last_video_id bigint;

create table if not exists courses (
  id bigserial primary key,
  title text not null,
  "order" int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists subtopics (
  id bigserial primary key,
  course_id bigint not null references courses(id) on delete cascade,
  title text not null,
  "order" int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists videos (
  id bigserial primary key,
  subtopic_id bigint not null references subtopics(id) on delete cascade,
  title text not null,
  duration int not null default 0,
  stream_path text not null,
  "order" int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists progress (
  user_id bigint not null references users(id) on delete cascade,
  video_id bigint not null references videos(id) on delete cascade,
  watched_seconds int not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create table if not exists sessions (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  device_id text not null,
  ip inet,
  user_agent text,
  last_active timestamptz not null default now(),
  unique (user_id, device_id)
);

create table if not exists refresh_tokens (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  device_id text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create index if not exists idx_courses_order on courses("order");
create index if not exists idx_subtopics_course_order on subtopics(course_id, "order");
create index if not exists idx_videos_subtopic_order on videos(subtopic_id, "order");
create index if not exists idx_progress_user on progress(user_id);
create index if not exists idx_sessions_user on sessions(user_id);
create index if not exists idx_refresh_tokens_user on refresh_tokens(user_id);

create table if not exists news (
  id bigserial primary key,
  title text not null,
  slug text,
  body text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists news_slug_unique on news (slug) where slug is not null and length(trim(slug)) > 0;

create index if not exists idx_news_published_updated on news (published, updated_at desc);

create table if not exists support_messages (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  video_id bigint references videos(id) on delete set null,
  sender_role text not null check (sender_role in ('admin', 'student')),
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_messages_user_created on support_messages (user_id, created_at asc);
create index if not exists idx_support_messages_user_video_created on support_messages (user_id, video_id, created_at asc);

create table if not exists support_reads (
  user_id bigint not null references users(id) on delete cascade,
  reader_role text not null check (reader_role in ('admin', 'student')),
  last_read_at timestamptz not null default now(),
  primary key (user_id, reader_role)
);

create table if not exists payments (
  id bigserial primary key,
  payment_id uuid not null unique,
  user_id bigint not null references users(id) on delete cascade,
  plan text not null,
  amount numeric(12, 2) not null,
  status text not null default 'pending',
  finik_transaction_id text,
  finik_receipt_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_user on payments(user_id);
create index if not exists idx_payments_status on payments(status);
create index if not exists idx_payments_finik_tx on payments(finik_transaction_id);

create table if not exists promo_codes (
  id bigserial primary key,
  code text not null unique,
  discount_type text not null check (discount_type in ('full', 'percent', 'fixed')),
  discount_value numeric(12, 2) not null default 0,
  max_uses int,
  uses_count int not null default 0,
  expires_at timestamptz,
  created_by bigint references users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists promo_redemptions (
  id bigserial primary key,
  promo_code_id bigint not null references promo_codes(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  payment_id uuid references payments(payment_id) on delete set null,
  redeemed_at timestamptz not null default now(),
  unique (promo_code_id, user_id)
);

alter table payments add column if not exists promo_code text;

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
