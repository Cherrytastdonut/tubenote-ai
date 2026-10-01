-- TubeNote AI
-- Supabase SQL Editor에서 실행하세요.
-- 이미 테이블이 있어도 다시 실행할 수 있도록 작성되어 있습니다.

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

-- 기존에 같은 video_id가 여러 번 저장되어 있다면
-- 가장 최근 기록 1개만 남기고 중복 기록을 정리합니다.
with ranked as (
  select
    id,
    row_number() over (
      partition by video_id
      order by created_at desc, id desc
    ) as rn
  from public.video_analyses
)
delete from public.video_analyses v
using ranked r
where v.id = r.id
  and r.rn > 1;

-- 같은 YouTube 영상(video_id)은 DB에도 한 번만 저장되도록 강제합니다.
drop index if exists public.video_analyses_video_id_idx;

create unique index if not exists video_analyses_video_id_unique_idx
  on public.video_analyses (video_id);

alter table public.video_analyses enable row level security;

-- 브라우저에서 Supabase를 직접 호출하지 않습니다.
-- 저장/조회/삭제는 Vercel Functions가 서버 Secret Key로만 수행합니다.
-- 따라서 anon/public용 정책은 만들지 않습니다.
