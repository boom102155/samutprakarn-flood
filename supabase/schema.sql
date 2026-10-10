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
create index if not exists reports_recent_duplicate_lookup_idx
  on public.reports (district, subdistrict, water_level, trend, created_at desc)
  where condition = 'flooded';

-- Submission limits keep only a keyed IP hash, never the original IP address.
create table if not exists public.report_submission_limits (
  ip_hash text primary key check (char_length(ip_hash) = 64),
  window_started_at timestamptz not null default now(),
  window_count integer not null default 0 check (window_count >= 0),
  day_started_at date not null default current_date,
  day_count integer not null default 0 check (day_count >= 0),
  updated_at timestamptz not null default now()
);
create index if not exists report_submission_limits_updated_at_idx
  on public.report_submission_limits (updated_at);
alter table public.report_submission_limits enable row level security;

create or replace function public.submit_flood_report(
  p_ip_hash text,
  p_location_name text,
  p_district text,
  p_subdistrict text,
  p_latitude double precision,
  p_longitude double precision,
  p_water_level text,
  p_trend text,
  p_passable text[],
  p_note text,
  p_photo_url text,
  p_allow_duplicate boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_window_count integer;
  v_day_started_at date;
  v_day_count integer;
  v_duplicate public.reports%rowtype;
  v_duplicate_distance double precision;
  v_report public.reports%rowtype;
  v_normalized_passable text[] := coalesce(p_passable, array[]::text[]);
begin
  if p_ip_hash is null or char_length(p_ip_hash) <> 64 then
    return jsonb_build_object('status', 'invalid_submission');
  end if;

  -- Opportunistically expire old keyed IP hashes so rate-limit metadata has a
  -- bounded retention period without requiring another scheduled job.
  if random() < 0.01 then
    delete from public.report_submission_limits where updated_at < v_now - interval '30 days';
  end if;

  -- Serialize submissions from the same network bucket so parallel requests
  -- cannot race past the rate limiter.
  perform pg_advisory_xact_lock(hashtextextended('flood-report-rate:' || p_ip_hash, 0));
  insert into public.report_submission_limits (ip_hash, window_started_at, window_count, day_started_at, day_count, updated_at)
  values (p_ip_hash, v_now, 0, (v_now at time zone 'utc')::date, 0, v_now)
  on conflict (ip_hash) do nothing;

  select window_started_at, window_count, day_started_at, day_count
    into v_window_started_at, v_window_count, v_day_started_at, v_day_count
    from public.report_submission_limits
    where ip_hash = p_ip_hash
    for update;

  if v_window_started_at <= v_now - interval '10 minutes' then
    v_window_started_at := v_now;
    v_window_count := 0;
  end if;
  if v_day_started_at < (v_now at time zone 'utc')::date then
    v_day_started_at := (v_now at time zone 'utc')::date;
    v_day_count := 0;
  end if;

  if v_window_count >= 10 then
    return jsonb_build_object(
      'status', 'rate_limited',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_window_started_at + interval '10 minutes' - v_now)))::integer)
    );
  end if;
  if v_day_count >= 40 then
    return jsonb_build_object(
      'status', 'rate_limited',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (
        (((v_now at time zone 'utc')::date + 1)::timestamp at time zone 'utc') - v_now
      )))::integer)
    );
  end if;

  update public.report_submission_limits
    set window_started_at = v_window_started_at,
        window_count = v_window_count + 1,
        day_started_at = v_day_started_at,
        day_count = v_day_count + 1,
        updated_at = v_now
    where ip_hash = p_ip_hash;

  -- Serialize nearby reports in this administrative area, then check for an
  -- equivalent recent observation before inserting another marker.
  perform pg_advisory_xact_lock(hashtextextended('flood-report-near:' || p_district || ':' || p_subdistrict, 1));
  if not coalesce(p_allow_duplicate, false) then
    select candidate.*
      into v_duplicate
      from public.reports as candidate
      cross join lateral (
        select 6371000 * 2 * asin(sqrt(least(1::double precision,
          power(sin(radians(candidate.latitude - p_latitude) / 2), 2)
          + cos(radians(p_latitude)) * cos(radians(candidate.latitude))
          * power(sin(radians(candidate.longitude - p_longitude) / 2), 2)
        ))) as meters
      ) as distance
      where candidate.condition = 'flooded'
        and candidate.created_at >= v_now - interval '15 minutes'
        and candidate.district = p_district
        and candidate.subdistrict = p_subdistrict
        and candidate.water_level = p_water_level
        and candidate.trend = p_trend
        and candidate.passable @> v_normalized_passable
        and candidate.passable <@ v_normalized_passable
        and distance.meters <= 100
      order by candidate.created_at desc
      limit 1;

    if found then
      v_duplicate_distance := 6371000 * 2 * asin(sqrt(least(1::double precision,
        power(sin(radians(v_duplicate.latitude - p_latitude) / 2), 2)
        + cos(radians(p_latitude)) * cos(radians(v_duplicate.latitude))
        * power(sin(radians(v_duplicate.longitude - p_longitude) / 2), 2)
      )));
      return jsonb_build_object(
        'status', 'duplicate',
        'distance_meters', round(v_duplicate_distance)::integer,
        'report', to_jsonb(v_duplicate)
      );
    end if;
  end if;

  insert into public.reports (
    location_name, district, subdistrict, latitude, longitude,
    water_level, trend, passable, note, photo_url
  ) values (
    p_location_name, p_district, p_subdistrict, p_latitude, p_longitude,
    p_water_level, p_trend, v_normalized_passable, coalesce(p_note, ''), p_photo_url
  ) returning * into v_report;

  return jsonb_build_object('status', 'created', 'report', to_jsonb(v_report));
end;
$$;

revoke all on function public.submit_flood_report(text, text, text, text, double precision, double precision, text, text, text[], text, text, boolean) from public, anon, authenticated;
grant execute on function public.submit_flood_report(text, text, text, text, double precision, double precision, text, text, text[], text, text, boolean) to service_role;

alter table public.reports enable row level security;
drop policy if exists "Anyone can read reports" on public.reports;
create policy "Anyone can read reports" on public.reports for select to anon, authenticated using (true);
drop policy if exists "Anyone can submit reports" on public.reports;
drop policy if exists "Anyone can update report status and flags" on public.reports;
create policy "Anyone can update report status and flags" on public.reports for update to anon, authenticated using (true) with check (true);
revoke insert, update on public.reports from public, anon, authenticated;
grant update (condition, confirmations, flags) on public.reports to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = true, file_size_limit = 10485760;

drop policy if exists "Anyone can view report photos" on storage.objects;
create policy "Anyone can view report photos" on storage.objects for select to anon, authenticated using (bucket_id = 'report-photos');
drop policy if exists "Anyone can upload report photos" on storage.objects;

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
  rain_hourly_enabled boolean not null default false,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  check ((latitude is null) = (longitude is null))
);

alter table public.line_weather_subscriptions
  add column if not exists rain_hourly_enabled boolean not null default false;

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
