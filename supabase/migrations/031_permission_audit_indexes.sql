create index if not exists admin_audit_log_actor_user_idx
on public.admin_audit_log (actor_user_id, created_at desc);

create index if not exists admin_module_permissions_created_by_idx
on public.admin_module_permissions (created_by);

create index if not exists admin_module_permissions_updated_by_idx
on public.admin_module_permissions (updated_by);
