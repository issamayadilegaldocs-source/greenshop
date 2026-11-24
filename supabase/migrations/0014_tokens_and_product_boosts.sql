-- =========================================================
-- weshop: Tokens economy & Product Boosts
-- 0013_tokens_and_product_boosts.sql
-- =========================================================

-- 1. Alter products table with boost columns
alter table public.products
  add column if not exists is_boosted boolean not null default false,
  add column if not exists boost_tier text check (boost_tier in ('spotlight', 'category', 'search', 'flash')),
  add column if not exists boosted_at timestamptz,
  add column if not exists boosted_until timestamptz,
  add column if not exists boost_score int not null default 0;

create index if not exists idx_products_boosted on public.products(is_boosted, boost_tier, boosted_until);

-- 2. Token Balances
create table if not exists public.token_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  balance int not null default 100 check (balance >= 0),
  total_earned int not null default 100 check (total_earned >= 0),
  total_spent int not null default 0 check (total_spent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_token_balances_user on public.token_balances(user_id);

-- 3. Token Transactions Ledger
create table if not exists public.token_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount int not null,
  balance_after int not null,
  reason text not null check (reason in ('welcome_bonus', 'admin_grant', 'admin_deduct', 'purchase', 'product_boost', 'boost_refund')),
  product_id uuid references public.products(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_token_transactions_user on public.token_transactions(user_id, created_at desc);

-- 4. Enable Row Level Security
alter table public.token_balances enable row level security;
alter table public.token_transactions enable row level security;

create policy "Users can view own token balance"
  on public.token_balances for select
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

create policy "Users can view own token transactions"
  on public.token_transactions for select
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

-- 5. Helper Function: Get or Create Token Balance
create or replace function public.get_or_create_token_balance(_user_id uuid default null)
returns table (
  user_id uuid,
  balance int,
  total_earned int,
  total_spent int
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(_user_id, auth.uid());
  v_bal public.token_balances;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_bal from public.token_balances where token_balances.user_id = v_uid;
  if not found then
    insert into public.token_balances (user_id, balance, total_earned, total_spent)
    values (v_uid, 100, 100, 0)
    returning * into v_bal;

    insert into public.token_transactions (user_id, amount, balance_after, reason, note)
    values (v_uid, 100, 100, 'welcome_bonus', 'Cadeau de bienvenue : 100 tokens offerts pour booster vos premiers produits !');
  end if;

  return query select v_bal.user_id, v_bal.balance, v_bal.total_earned, v_bal.total_spent;
end $$;

-- 6. SECURITY DEFINER: Boost Product Function
create or replace function public.boost_product(
  _product_id uuid,
  _tier text,
  _days int default 7
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_cost int;
  v_balance int;
  v_new_balance int;
  v_product public.products;
  v_until timestamptz;
  v_is_admin boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_is_admin := public.has_role(v_uid, 'admin');

  -- Verify product exists
  select * into v_product from public.products where id = _product_id;
  if not found then
    raise exception 'Product not found';
  end if;

  -- Verify ownership unless admin
  if not v_is_admin and v_product.seller_id is not null then
    if not exists (select 1 from public.seller_profiles where id = v_product.seller_id and user_id = v_uid) then
      raise exception 'Unauthorized: you do not own this product';
    end if;
  end if;

  -- Determine cost
  case _tier
    when 'spotlight' then v_cost := 50;
    when 'category' then v_cost := 25;
    when 'flash' then v_cost := 15;
    when 'search' then v_cost := 10;
    else raise exception 'Invalid boost tier: %', _tier;
  end case;

  -- Adjust cost by duration multiplier (7 days is baseline)
  if _days > 7 then
    v_cost := v_cost * ceil(_days::numeric / 7);
  end if;

  -- Check token balance
  perform public.get_or_create_token_balance(v_uid);
  select balance into v_balance from public.token_balances where user_id = v_uid for update;

  if v_balance < v_cost then
    raise exception 'Solde insuffisant : il vous faut % tokens (solde actuel : %)', v_cost, v_balance;
  end if;

  -- Deduct tokens
  v_new_balance := v_balance - v_cost;
  update public.token_balances
  set
    balance = v_new_balance,
    total_spent = total_spent + v_cost,
    updated_at = now()
  where user_id = v_uid;

  -- Record transaction
  insert into public.token_transactions (
    user_id, amount, balance_after, reason, product_id, note
  ) values (
    v_uid, -v_cost, v_new_balance, 'product_boost', _product_id,
    format('Boost %s appliqué pour %s jours (-%s tokens)', _tier, _days, v_cost)
  );

  -- Apply boost on product
  v_until := now() + (_days || ' days')::interval;
  update public.products
  set
    is_boosted = true,
    boost_tier = _tier,
    boosted_at = now(),
    boosted_until = v_until,
    boost_score = v_cost,
    is_featured = case when _tier = 'spotlight' then true else is_featured end
  where id = _product_id;

  return jsonb_build_object(
    'success', true,
    'product_id', _product_id,
    'tier', _tier,
    'cost', v_cost,
    'new_balance', v_new_balance,
    'boosted_until', v_until
  );
end $$;

-- 7. SECURITY DEFINER: Admin Grant or Deduct Tokens
create or replace function public.admin_manage_tokens(
  _target_user_id uuid,
  _amount int,
  _note text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_current_bal int;
  v_new_bal int;
  v_reason text;
begin
  if not public.has_role(v_uid, 'admin') then
    raise exception 'Unauthorized: Admin privileges required';
  end if;

  perform public.get_or_create_token_balance(_target_user_id);
  select balance into v_current_bal from public.token_balances where user_id = _target_user_id for update;

  v_new_bal := v_current_bal + _amount;
  if v_new_bal < 0 then
    raise exception 'Cannot deduct more tokens than current balance (% tokens available)', v_current_bal;
  end if;

  v_reason := case when _amount >= 0 then 'admin_grant' else 'admin_deduct' end;

  update public.token_balances
  set
    balance = v_new_bal,
    total_earned = case when _amount > 0 then total_earned + _amount else total_earned end,
    total_spent = case when _amount < 0 then total_spent + abs(_amount) else total_spent end,
    updated_at = now()
  where user_id = _target_user_id;

  insert into public.token_transactions (
    user_id, amount, balance_after, reason, note
  ) values (
    _target_user_id, _amount, v_new_bal, v_reason,
    coalesce(_note, format('Ajustement manuel par l''administrateur (%s tokens)', _amount))
  );

  return jsonb_build_object(
    'success', true,
    'user_id', _target_user_id,
    'amount', _amount,
    'new_balance', v_new_bal
  );
end $$;

-- 8. Seed Initial Balances for Demo Accounts
insert into public.token_balances (user_id, balance, total_earned, total_spent)
values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 1000, 1000, 0), -- admin
  ('a0000000-0000-0000-0000-000000000002'::uuid, 500, 500, 0),   -- staff
  ('a0000000-0000-0000-0000-000000000003'::uuid, 150, 150, 0),   -- client
  ('a0000000-0000-0000-0000-000000000004'::uuid, 120, 120, 0),   -- sarra
  ('a0000000-0000-0000-0000-000000000005'::uuid, 350, 450, 100)  -- seller (Artisan Carthage)
on conflict (user_id) do update set
  balance = excluded.balance;
