-- Configurable AI provider settings (OpenAI, Fal, Replicate) stored securely
-- in a singleton table inaccessible directly from anon/authenticated clients.

create table if not exists public.ai_provider_settings (
  id boolean primary key default true check (id),
  openai_api_key text,
  ai_model text not null default 'gpt-4o-mini',
  image_model text not null default 'gpt-image-1',
  fal_api_key text,
  replicate_api_token text,
  assistant_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.ai_provider_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.ai_provider_settings enable row level security;

-- Lock down direct PostgREST access: only service_role and controlled SECURITY DEFINER RPCs access secrets.
revoke all on table public.ai_provider_settings from anon, authenticated;

create or replace function public.mask_secret_hint(_val text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := nullif(btrim(coalesce(_val, '')), '');
begin
  if v is null then
    return null;
  end if;
  if length(v) <= 8 then
    return '••••' || right(v, 2);
  end if;
  return left(v, 4) || '••••' || right(v, 4);
end;
$$;

revoke all on function public.mask_secret_hint(text) from public;

-- Admin-only masked status view (never returns raw API keys to the browser).
create or replace function public.admin_get_ai_settings_status()
returns table (
  has_openai_key boolean,
  openai_key_hint text,
  ai_model text,
  image_model text,
  has_fal_key boolean,
  fal_key_hint text,
  has_replicate_token boolean,
  replicate_token_hint text,
  assistant_enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select
    nullif(btrim(coalesce(s.openai_api_key, '')), '') is not null,
    public.mask_secret_hint(s.openai_api_key),
    s.ai_model,
    s.image_model,
    nullif(btrim(coalesce(s.fal_api_key, '')), '') is not null,
    public.mask_secret_hint(s.fal_api_key),
    nullif(btrim(coalesce(s.replicate_api_token, '')), '') is not null,
    public.mask_secret_hint(s.replicate_api_token),
    s.assistant_enabled,
    s.updated_at
  from public.ai_provider_settings s
  where s.id = true;
end;
$$;

revoke all on function public.admin_get_ai_settings_status() from public;
grant execute on function public.admin_get_ai_settings_status() to authenticated;

-- Admin-only save function: keeps existing secrets untouched if blank unless explicitly cleared.
create or replace function public.admin_save_ai_settings(
  _openai_api_key text default null,
  _clear_openai_key boolean default false,
  _ai_model text default null,
  _image_model text default null,
  _fal_api_key text default null,
  _clear_fal_key boolean default false,
  _replicate_api_token text default null,
  _clear_replicate_token boolean default false,
  _assistant_enabled boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  insert into public.ai_provider_settings (id)
  values (true)
  on conflict (id) do nothing;

  update public.ai_provider_settings
  set
    openai_api_key = case
      when coalesce(_clear_openai_key, false) then null
      when nullif(btrim(coalesce(_openai_api_key, '')), '') is not null then btrim(_openai_api_key)
      else openai_api_key
    end,
    ai_model = coalesce(nullif(btrim(coalesce(_ai_model, '')), ''), ai_model),
    image_model = coalesce(nullif(btrim(coalesce(_image_model, '')), ''), image_model),
    fal_api_key = case
      when coalesce(_clear_fal_key, false) then null
      when nullif(btrim(coalesce(_fal_api_key, '')), '') is not null then btrim(_fal_api_key)
      else fal_api_key
    end,
    replicate_api_token = case
      when coalesce(_clear_replicate_token, false) then null
      when nullif(btrim(coalesce(_replicate_api_token, '')), '') is not null then btrim(_replicate_api_token)
      else replicate_api_token
    end,
    assistant_enabled = coalesce(_assistant_enabled, assistant_enabled),
    updated_at = now(),
    updated_by = auth.uid()
  where id = true;
end;
$$;

revoke all on function public.admin_save_ai_settings(text, boolean, text, text, text, boolean, text, boolean, boolean) from public;
grant execute on function public.admin_save_ai_settings(text, boolean, text, text, text, boolean, text, boolean, boolean) to authenticated;

-- Server-side runtime config lookup for authenticated staff/admin server functions.
create or replace function public.staff_get_ai_runtime_config()
returns table (
  openai_api_key text,
  ai_model text,
  image_model text,
  fal_api_key text,
  replicate_api_token text,
  assistant_enabled boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden';
  end if;

  return query
  select
    s.openai_api_key,
    s.ai_model,
    s.image_model,
    s.fal_api_key,
    s.replicate_api_token,
    s.assistant_enabled
  from public.ai_provider_settings s
  where s.id = true;
end;
$$;

revoke all on function public.staff_get_ai_runtime_config() from public;
grant execute on function public.staff_get_ai_runtime_config() to authenticated;

-- Public safe flag: tells storefront whether the AI shopping assistant widget is enabled (no secrets).
create or replace function public.get_assistant_public_status()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select assistant_enabled from public.ai_provider_settings where id = true), true);
$$;

revoke all on function public.get_assistant_public_status() from public;
grant execute on function public.get_assistant_public_status() to anon, authenticated;
