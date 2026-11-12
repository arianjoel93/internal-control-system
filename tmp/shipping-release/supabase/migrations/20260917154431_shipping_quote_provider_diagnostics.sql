begin;

alter table public.shipping_quotes
  add column if not exists diagnostic_stage text,
  add column if not exists provider_status integer,
  add column if not exists provider_code text,
  add column if not exists provider_message text,
  add column if not exists provider_transaction_id text,
  add column if not exists provider_endpoint text,
  add column if not exists retryable boolean not null default false;

alter table public.shipping_quotes
  drop constraint if exists shipping_quotes_diagnostic_stage_check;

alter table public.shipping_quotes
  add constraint shipping_quotes_diagnostic_stage_check check (
    diagnostic_stage is null or diagnostic_stage in (
      'SUPABASE_AUTH',
      'LOAD_FEDEX_CONFIG',
      'DECRYPT_CREDENTIALS',
      'FEDEX_OAUTH',
      'BUILD_RATE_PAYLOAD',
      'FEDEX_RATE_REQUEST',
      'FEDEX_RATE_RESPONSE',
      'NORMALIZE_RATES',
      'SAVE_QUOTE'
    )
  );

create index if not exists shipping_quotes_provider_transaction_idx
  on public.shipping_quotes (provider_transaction_id)
  where provider_transaction_id is not null;

notify pgrst, 'reload schema';
commit;
