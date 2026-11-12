alter table public.sales_agent_notifications
  drop constraint if exists sales_agent_notifications_category_check;

alter table public.sales_agent_notifications
  add constraint sales_agent_notifications_category_check
  check (
    category in (
      'inactive_client',
      'declining_client',
      'low_conversion',
      'new_customer_gap',
      'expired_quotes',
      'crm_lead',
      'sales_decline',
      'portfolio_concentration',
      'cross_sell'
    )
  );

notify pgrst, 'reload schema';
