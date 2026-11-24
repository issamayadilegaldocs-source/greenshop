-- =========================================================
-- Fix infinite RLS recursion (42P17) between public.returns
-- and public.return_items, and fix return_status_history
-- self-comparison typo (ri.return_id = ri.return_id).
-- =========================================================

create or replace function public.seller_owns_return(_return_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.return_items ri
    join public.order_items oi on oi.id = ri.order_item_id
    where ri.return_id = _return_id
      and oi.seller_id = public.current_seller_id()
  )
$$;

revoke all on function public.seller_owns_return(uuid) from public;
grant execute on function public.seller_owns_return(uuid) to authenticated;

drop policy if exists "Sellers read returns with own items" on public.returns;
create policy "Sellers read returns with own items" on public.returns
  for select to authenticated
  using (public.seller_owns_return(id));

drop policy if exists "Sellers read own return history" on public.return_status_history;
create policy "Sellers read own return history" on public.return_status_history
  for select to authenticated
  using (public.seller_owns_return(return_id));
