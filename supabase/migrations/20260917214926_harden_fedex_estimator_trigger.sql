begin;

alter function public.shipping_rate_estimates_set_updated_at()
  set search_path = public;

commit;
