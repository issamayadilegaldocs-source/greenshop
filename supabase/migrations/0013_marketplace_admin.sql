-- =========================================================
-- weshop marketplace — admin commission controls & seller views
-- =========================================================

-- ---------- ADMIN: COMMISSION SETTINGS ----------
-- _seller_id = null updates the platform-wide default row.
create or replace function public.admin_set_seller_commission(
  _seller_id uuid,
  _commission_pct numeric,
  _fixed_fee numeric default 0,
  _note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_note text := nullif(left(btrim(coalesce(_note, '')), 500), '');
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if _commission_pct is null or _commission_pct < 0 or _commission_pct > 100 then
    raise exception 'invalid_commission';
  end if;
  if _fixed_fee is null or _fixed_fee < 0 then
    raise exception 'invalid_fixed_fee';
  end if;
  if _seller_id is not null and not exists (
    select 1 from public.seller_profiles sp where sp.id = _seller_id
  ) then
    raise exception 'seller_not_found';
  end if;

  select id into v_id from public.seller_commission_settings
  where seller_id is not distinct from _seller_id
  limit 1;

  if v_id is null then
    insert into public.seller_commission_settings(seller_id, commission_pct, fixed_fee, note, created_by)
    values (_seller_id, round(_commission_pct, 2), round(_fixed_fee, 3), v_note, auth.uid());
  else
    update public.seller_commission_settings
    set commission_pct = round(_commission_pct, 2),
        fixed_fee = round(_fixed_fee, 3),
        note = v_note
    where id = v_id;
  end if;
end $$;
revoke execute on function public.admin_set_seller_commission(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.admin_set_seller_commission(uuid, numeric, numeric, text) to authenticated;

-- ---------- SELLER-SAFE RETURN PROJECTION ----------
-- A seller only sees returns that contain at least one of their lines.
-- all_mine tells the client whether the seller may act on the whole return.
create or replace view public.seller_returns_view
with (security_invoker = false) as
select
  rt.id,
  rt.reference,
  rt.order_id,
  o.reference as order_reference,
  rt.user_id,
  rt.status,
  rt.reason,
  rt.description,
  rt.photos,
  rt.admin_note,
  rt.refund_amount,
  rt.created_at,
  rt.processed_at,
  o.customer_name,
  o.phone,
  o.city,
  o.address,
  (select count(*)
     from public.return_items ri
     join public.order_items oi on oi.id = ri.order_item_id
    where ri.return_id = rt.id
      and oi.seller_id = public.current_seller_id()) as my_item_count,
  (select count(*) from public.return_items ri where ri.return_id = rt.id) as total_item_count,
  (select coalesce(sum(round((oi.line_total - oi.discount_amount) * ri.quantity / greatest(oi.quantity, 1), 3)), 0)
     from public.return_items ri
     join public.order_items oi on oi.id = ri.order_item_id
    where ri.return_id = rt.id
      and oi.seller_id = public.current_seller_id()) as my_refund_estimate,
  (select coalesce(bool_and(oi.seller_id = public.current_seller_id()), false)
     from public.return_items ri
     join public.order_items oi on oi.id = ri.order_item_id
    where ri.return_id = rt.id) as all_mine
from public.returns rt
join public.orders o on o.id = rt.order_id
where exists (
  select 1
  from public.return_items ri
  join public.order_items oi on oi.id = ri.order_item_id
  where ri.return_id = rt.id
    and oi.seller_id = public.current_seller_id()
);

grant select on public.seller_returns_view to authenticated;

-- ---------- SELLER: RETURN NOTES (append-only) ----------
drop policy if exists "Sellers add own return notes" on public.seller_return_notes;
create policy "Sellers add own return notes" on public.seller_return_notes
  for insert to authenticated with check (
    seller_id = public.current_seller_id()
    and author_id = auth.uid()
    and exists (
      select 1 from public.seller_returns_view v where v.id = return_id
    )
  );

-- ---------- SELLER: MODERATION FEEDBACK ----------
create or replace function public.seller_listing_detail(_product_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) || jsonb_build_object(
    'moderation_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', h.action, 'note', h.note, 'created_at', h.created_at
      ) order by h.created_at desc)
      from public.listing_moderation_history h
      where h.product_id = p.id
    ), '[]'::jsonb)
  )
  from public.products p
  where p.id = _product_id and p.seller_id = public.current_seller_id()
$$;
revoke execute on function public.seller_listing_detail(uuid) from public, anon;
grant execute on function public.seller_listing_detail(uuid) to authenticated;
