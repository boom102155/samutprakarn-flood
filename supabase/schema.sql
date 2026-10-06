-- Run this script in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  location_name text not null check (char_length(location_name) between 1 and 120),
  district text not null,
  subdistrict text not null,
  latitude double precision not null check (latitude between 5 and 21),
  longitude double precision not null check (longitude between 97 and 106),
  water_level text not null check (water_level in (
    'แห้ง',
    'ต่ำกว่าข้อเท้า < 10 ซม.',
    'ข้อเท้า–หัวเข่า 10–50 ซม.',
    'หัวเข่า–เอว 50–100 ซม.',
    'เอว–หน้าอก 100–130 ซม.',
    'เลยหน้าอก 130–180 ซม.',
    'มิดหัว–ท่วมหลังคา > 180 ซม.'
  )),
  trend text not null check (trend in ('น้ำกำลังขึ้น', 'ทรงตัว', 'กำลังลด')),
  passable text[] not null default '{}',
  note text not null default '' check (char_length(note) <= 400),
  photo_url text,
  condition text not null default 'flooded' check (condition in ('flooded', 'receded')),
  confirmations integer not null default 0 check (confirmations >= 0),
  flags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_district_subdistrict_idx on public.reports (district, subdistrict);

alter table public.reports enable row level security;
drop policy if exists "Anyone can read reports" on public.reports;
create policy "Anyone can read reports" on public.reports for select to anon, authenticated using (true);
drop policy if exists "Anyone can submit reports" on public.reports;
create policy "Anyone can submit reports" on public.reports for insert to anon, authenticated with check (true);
drop policy if exists "Anyone can update report status and flags" on public.reports;
create policy "Anyone can update report status and flags" on public.reports for update to anon, authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = true, file_size_limit = 10485760;

drop policy if exists "Anyone can view report photos" on storage.objects;
create policy "Anyone can view report photos" on storage.objects for select to anon, authenticated using (bucket_id = 'report-photos');
drop policy if exists "Anyone can upload report photos" on storage.objects;
create policy "Anyone can upload report photos" on storage.objects for insert to anon, authenticated with check (bucket_id = 'report-photos');

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'
  ) then
    alter publication supabase_realtime add table public.reports;
  end if;
end
$$;

-- LINE weather notification subscriptions. Keep this table server-side only;
-- the service-role key is required by the webhook and must never be public.
create table if not exists public.line_weather_subscriptions (
  line_user_id text primary key,
  status text not null default 'awaiting_consent'
    check (status in ('awaiting_consent', 'awaiting_location', 'active', 'unsubscribed', 'unfollowed')),
  latitude double precision check (latitude between 5 and 21),
  longitude double precision check (longitude between 97 and 106),
  alert_types text[] not null default array['all']::text[],
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  check ((latitude is null) = (longitude is null))
);

create index if not exists line_weather_subscriptions_active_idx
  on public.line_weather_subscriptions (status) where status = 'active';

alter table public.line_weather_subscriptions enable row level security;

-- A sent/failed row is keyed by alert and recipient to prevent repeated pushes.
create table if not exists public.line_weather_alert_deliveries (
  alert_key text not null,
  line_user_id text not null references public.line_weather_subscriptions(line_user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  retry_key uuid not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (alert_key, line_user_id)
);

alter table public.line_weather_alert_deliveries
  add column if not exists retry_key uuid not null default gen_random_uuid();

create index if not exists line_weather_alert_deliveries_status_idx
  on public.line_weather_alert_deliveries (status, updated_at);

alter table public.line_weather_alert_deliveries enable row level security;
