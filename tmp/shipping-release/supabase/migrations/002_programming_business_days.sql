alter table public.support_cases
add column if not exists programming_business_days integer;

alter table public.support_cases
drop constraint if exists support_cases_programming_business_days_check;

alter table public.support_cases
add constraint support_cases_programming_business_days_check
check (programming_business_days is null or programming_business_days > 0);
