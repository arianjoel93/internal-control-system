alter table public.support_mailer_settings
add column if not exists subject_template text,
add column if not exists text_template text,
add column if not exists html_template text;
