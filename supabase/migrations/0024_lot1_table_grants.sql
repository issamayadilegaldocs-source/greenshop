-- Grant explicit table-level privileges required alongside RLS policies for Lot 1 tables.

grant select on table public.rbac_roles to authenticated;
grant select on table public.rbac_permissions to authenticated;
grant select, insert, update, delete on table public.rbac_role_permissions to authenticated;
grant select, insert, update, delete on table public.user_rbac_roles to authenticated;

grant select on table public.brands to anon, authenticated;
grant insert, update, delete on table public.brands to authenticated;

grant select, insert, delete on table public.wishlists to authenticated;

grant select on table public.newsletter_subscribers to authenticated;

grant select on table public.homepage_sections to anon, authenticated;
grant insert, update, delete on table public.homepage_sections to authenticated;
