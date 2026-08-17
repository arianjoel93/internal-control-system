create table if not exists public.support_mailer_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'hostinger',
  smtp_host text not null,
  smtp_port integer not null,
  smtp_secure boolean not null default true,
  smtp_username text not null,
  smtp_password text not null,
  sender_email text not null,
  sender_name text not null default 'Soportes Tectronic',
  reply_to_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists support_mailer_settings_active_provider_idx
on public.support_mailer_settings (provider)
where is_active = true;

drop trigger if exists support_mailer_settings_set_updated_at
on public.support_mailer_settings;

create trigger support_mailer_settings_set_updated_at
before update on public.support_mailer_settings
for each row
execute function public.set_updated_at();

alter table public.support_mailer_settings enable row level security;

revoke all on public.support_mailer_settings
from anon, authenticated;
