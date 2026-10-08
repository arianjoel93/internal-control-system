do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'report-odoo-analytics-nightly';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'report-odoo-analytics-nightly',
    '15 6 * * *',
    $job$
      select net.http_post(
        url := 'https://sqzrvzwyvjeosuvzotja.supabase.co/functions/v1/sync-odoo-analytics',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'report_analytics_publishable_key'),
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'report_analytics_publishable_key'),
          'x-report-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'report_sync_cron_token')
        ),
        body := '{"scheduled":true}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$
  );
end;
$$;
