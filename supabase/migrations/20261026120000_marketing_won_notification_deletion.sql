-- Keep tombstones so the scanner's conflict handling cannot resurrect deleted alerts.
alter table public.marketing_won_notifications
  add column if not exists deleted_at timestamptz;

create index if not exists marketing_won_notifications_inbox_idx
  on public.marketing_won_notifications (user_id, created_at desc, lead_id desc)
  where deleted_at is null;
