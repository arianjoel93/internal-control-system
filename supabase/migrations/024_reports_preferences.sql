create table if not exists public.report_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null default 'reports' check (module_key = 'reports'),
  filters jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module_key)
);

create index if not exists report_preferences_user_module_idx
on public.report_preferences (user_id, module_key);

drop trigger if exists report_preferences_set_updated_at on public.report_preferences;
create trigger report_preferences_set_updated_at
before update on public.report_preferences
for each row
execute function public.set_updated_at();

alter table public.report_preferences enable row level security;

drop policy if exists "users can read own report preferences" on public.report_preferences;
create policy "users can read own report preferences"
on public.report_preferences
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users can insert own report preferences" on public.report_preferences;
create policy "users can insert own report preferences"
on public.report_preferences
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own report preferences" on public.report_preferences;
create policy "users can update own report preferences"
on public.report_preferences
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.report_preferences to authenticated;

notify pgrst, 'reload schema';
