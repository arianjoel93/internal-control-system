alter table public.support_events
add column if not exists status_email_last_attempt_at timestamptz,
add column if not exists status_email_sent_at timestamptz,
add column if not exists status_email_sent_by uuid,
add column if not exists status_email_sent_by_email text,
add column if not exists status_email_last_error text;
