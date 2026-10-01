-- TubeNote AI
-- Supabase SQL Editor에서 한 번 실행하세요.

create extension if not exists pgcrypto;

create table if not exists public.video_analyses (
  id uuid primary key default gen_random_uuid(),
  youtube_url text not null,
  video_id text not null,
  title text not null default '',
  original_language text not null default '',
  summary text not null default '',
  key_points jsonb not null default '[]'::jsonb,
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists video_analyses_created_at_idx
  on public.video_analyses (created_at desc);

create index if not exists video_analyses_video_id_idx
  on public.video_analyses (video_id);

alter table public.video_analyses enable row level security;

-- 브라우저에서 Supabase를 직접 호출하지 않습니다.
-- 저장/조회는 Vercel Functions가 서버 Secret Key로만 수행합니다.
-- 따라서 anon/public용 정책은 만들지 않습니다.
