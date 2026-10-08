alter table public.report_odoo_sync_state
  add column if not exists status text not null default 'idle',
  add column if not exists lock_owner text,
  add column if not exists locked_at timestamptz,
  add column if not exists last_successful_sync timestamptz,
  add column if not exists records_processed integer not null default 0,
  add column if not exists error_message text;

create table if not exists public.report_sales_invoice_line_facts (
  source_database text not null,
  odoo_line_id bigint not null,
  invoice_id bigint not null,
  invoice_name text,
  invoice_date date not null,
  move_type text,
  state text,
  write_date timestamptz,
  company_id integer,
  company_name text,
  seller_id integer,
  seller_name text,
  team_id integer,
  team_name text,
  customer_id integer,
  customer_name text,
  product_id integer,
  product_name text,
  category_id integer,
  category_name text,
  currency_code text,
  quantity numeric(18, 4) not null default 0,
  untaxed_amount numeric(18, 4) not null default 0,
  total_amount numeric(18, 4) not null default 0,
  margin_amount numeric(18, 4) not null default 0,
  discount_percent numeric(10, 4) not null default 0,
  display_type text,
  synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_database, odoo_line_id)
);

create index if not exists report_sales_invoice_line_facts_invoice_date_idx
  on public.report_sales_invoice_line_facts (invoice_date);

create index if not exists report_sales_invoice_line_facts_write_date_idx
  on public.report_sales_invoice_line_facts (write_date);

create index if not exists report_sales_invoice_line_facts_company_seller_date_idx
  on public.report_sales_invoice_line_facts (company_id, seller_id, invoice_date);

create index if not exists report_sales_invoice_line_facts_customer_date_idx
  on public.report_sales_invoice_line_facts (customer_id, invoice_date);

create index if not exists report_sales_invoice_line_facts_product_date_idx
  on public.report_sales_invoice_line_facts (product_id, invoice_date);

create index if not exists report_sales_invoice_line_facts_source_state_date_idx
  on public.report_sales_invoice_line_facts (source_database, state, invoice_date);

alter table public.report_sales_invoice_line_facts enable row level security;

revoke all on public.report_sales_invoice_line_facts from anon, authenticated;
grant select, insert, update, delete on public.report_sales_invoice_line_facts to service_role;

create or replace function public.claim_report_odoo_sync(
  p_source_database text,
  p_sync_key text,
  p_model_name text,
  p_lock_owner text,
  p_stale_after interval default interval '15 minutes'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean := false;
begin
  update public.report_odoo_sync_state
    set status = 'running',
        lock_owner = p_lock_owner,
        locked_at = now(),
        last_sync_at = now(),
        updated_at = now(),
        error_message = null
  where source_database = p_source_database
    and sync_key = p_sync_key
    and model_name = p_model_name
    and (
      status <> 'running'
      or locked_at is null
      or locked_at < now() - p_stale_after
    );

  get diagnostics v_claimed = row_count;
  if v_claimed then
    return true;
  end if;

  begin
    insert into public.report_odoo_sync_state (
      source_database,
      sync_key,
      model_name,
      status,
      lock_owner,
      locked_at,
      last_sync_at,
      updated_at
    ) values (
      p_source_database,
      p_sync_key,
      p_model_name,
      'running',
      p_lock_owner,
      now(),
      now(),
      now()
    );
    return true;
  exception when unique_violation then
    return false;
  end;
end;
$$;

create or replace function public.finish_report_odoo_sync(
  p_source_database text,
  p_sync_key text,
  p_model_name text,
  p_lock_owner text,
  p_success boolean,
  p_last_write_date timestamptz,
  p_synced_start_date date,
  p_synced_end_date date,
  p_records_processed integer,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.report_odoo_sync_state
    set status = case when p_success then 'idle' else 'failed' end,
        lock_owner = null,
        locked_at = null,
        last_sync_at = now(),
        last_successful_sync = case when p_success then now() else last_successful_sync end,
        last_write_date = case when p_success and p_last_write_date is not null then p_last_write_date else last_write_date end,
        synced_start_date = case
          when p_success and p_synced_start_date is not null then
            least(coalesce(synced_start_date, p_synced_start_date), p_synced_start_date)
          else synced_start_date
        end,
        synced_end_date = case
          when p_success and p_synced_end_date is not null then
            greatest(coalesce(synced_end_date, p_synced_end_date), p_synced_end_date)
          else synced_end_date
        end,
        records_processed = greatest(0, p_records_processed),
        row_count = greatest(row_count, p_records_processed),
        error_message = p_error_message,
        updated_at = now()
  where source_database = p_source_database
    and sync_key = p_sync_key
    and model_name = p_model_name
    and (lock_owner = p_lock_owner or lock_owner is null);
end;
$$;

create or replace function public.refresh_report_sales_daily_metrics_from_facts(
  p_source_database text,
  p_dates date[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if coalesce(array_length(p_dates, 1), 0) = 0 then
    return 0;
  end if;

  delete from public.report_sales_daily_metrics
  where source_database = p_source_database
    and metric_date = any(p_dates);

  insert into public.report_sales_daily_metrics (
    source_database,
    metric_date,
    company_id,
    company_name,
    seller_id,
    seller_name,
    currency_code,
    invoice_count,
    untaxed_amount,
    margin_amount,
    source_fetched_at,
    updated_at
  )
  select
    source_database,
    invoice_date,
    coalesce(company_id, 0),
    max(company_name),
    coalesce(seller_id, 0),
    max(seller_name),
    coalesce(currency_code, 'MXN'),
    count(distinct invoice_id)::integer,
    coalesce(sum(untaxed_amount), 0)::numeric,
    coalesce(sum(margin_amount), 0)::numeric,
    now(),
    now()
  from public.report_sales_invoice_line_facts
  where source_database = p_source_database
    and invoice_date = any(p_dates)
    and state = 'posted'
    and coalesce(display_type, 'product') = 'product'
  group by source_database, invoice_date, coalesce(company_id, 0), coalesce(seller_id, 0), coalesce(currency_code, 'MXN');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.claim_report_odoo_sync(text, text, text, text, interval) from public;
revoke all on function public.finish_report_odoo_sync(text, text, text, text, boolean, timestamptz, date, date, integer, text) from public;
revoke all on function public.refresh_report_sales_daily_metrics_from_facts(text, date[]) from public;

grant execute on function public.claim_report_odoo_sync(text, text, text, text, interval) to service_role;
grant execute on function public.finish_report_odoo_sync(text, text, text, text, boolean, timestamptz, date, date, integer, text) to service_role;
grant execute on function public.refresh_report_sales_daily_metrics_from_facts(text, date[]) to service_role;

comment on table public.report_sales_invoice_line_facts is
  'Hechos persistentes de lineas de factura de Odoo para Reportes. Odoo sigue siendo fuente oficial; esta tabla acelera lecturas analíticas.';
