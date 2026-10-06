-- Optional 15-minute scheduler using Supabase Cron.
-- Before running, add these two secrets in Supabase Vault:
--   line_weather_app_url     = https://YOUR_DEPLOYED_DOMAIN
--   line_weather_cron_secret = the same value as CRON_SECRET in the app's server environment
-- pg_cron and pg_net must be enabled in Database > Extensions.

select cron.schedule(
  'samutprakarn-line-weather-alerts',
  '*/15 * * * *',
  $$
    select net.http_get(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'line_weather_app_url'
      ) || '/api/cron/weather-alerts',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'line_weather_cron_secret'
        )
      )
    );
  $$
);
