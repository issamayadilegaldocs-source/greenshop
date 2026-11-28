-- PostgREST upsert(..., { onConflict }) requires UPDATE privilege alongside INSERT/SELECT/DELETE.
grant update on table public.wishlists to authenticated;
