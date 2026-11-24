-- =========================================================
-- weshop marketplace — enums
-- New values must land in their own migration so the following
-- migrations can safely use them in functions and policies.
-- =========================================================

-- Seller-owned listings need their own editorial lifecycle on top of
-- the existing admin catalogue lifecycle.
alter type public.product_status add value if not exists 'pending';
alter type public.product_status add value if not exists 'rejected';
alter type public.product_status add value if not exists 'paused';

-- Marketplace money movements: platform commission and its reversal.
alter type public.finance_entry_type add value if not exists 'commission';
alter type public.finance_entry_type add value if not exists 'commission_reversal';
alter type public.finance_entry_type add value if not exists 'seller_settlement';

do $$ begin
  create type public.seller_status as enum ('pending', 'approved', 'rejected', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.settlement_status as enum ('pending', 'partial', 'paid', 'cancelled');
exception when duplicate_object then null; end $$;

-- Second-hand condition. Categories opt in; the administrator controls the
-- allowed labels in store_settings.condition_options.
do $$ begin
  create type public.listing_condition as enum ('new', 'like_new', 'good', 'acceptable', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.moderation_action as enum (
    'submitted', 'approved', 'rejected', 'paused', 'reactivated', 'archived', 'updated'
  );
exception when duplicate_object then null; end $$;
