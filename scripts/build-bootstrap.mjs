#!/usr/bin/env node
/**
 * Rebuilds `supabase/bootstrap.sql` from the ordered files in
 * `supabase/migrations/`.
 *
 * The bundled file exists so the whole schema can be applied once by pasting it
 * into the Supabase Dashboard SQL editor, without the Supabase CLI and without
 * sharing database credentials. Run `npm run db:bundle` after adding a migration.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationsDir = join(root, "supabase", "migrations");
const outFile = join(root, "supabase", "bootstrap.sql");

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("No migrations found in supabase/migrations");
  process.exit(1);
}

const header = `-- =========================================================
-- Maison Noura database bootstrap (clean reset + full schema)
-- =========================================================
-- GENERATED FILE — do not edit by hand. Source of truth: supabase/migrations/.
-- Regenerate with: npm run db:bundle
--
-- Apply to a Supabase project (empties old public objects, storage policies,
-- auth triggers, and auth users before recreating the full schema & seed data):
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run
-- or with the CLI (on an empty project): npm run db:push
--
-- Note: To also delete old files/buckets from Storage, empty/delete them in
-- Supabase Dashboard -> Storage (Supabase blocks raw SQL DELETE on storage.*).
--
-- Files included (in order):
${files.map((f) => `--   ${f}`).join("\n")}
-- =========================================================
`;

const cleanupBlock = `-- ===== 0000_clean_old_supabase =====
-- Clean all user-created objects from an existing Supabase project while
-- keeping Supabase-managed schemas, extensions, and default public grants.
begin;

do $$
declare
  r record;
begin
  -- 1. Drop custom (non-internal) triggers on auth.users and storage tables
  for r in
    select n.nspname as table_schema, c.relname as table_name, t.tgname as trigger_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace fn on fn.oid = p.pronamespace
    where not t.tgisinternal
      and (
        (n.nspname = 'auth' and c.relname = 'users')
        or (n.nspname = 'storage' and c.relname in ('objects', 'buckets'))
      )
      and fn.nspname not in (
        'auth', 'storage', 'realtime', 'supabase_functions',
        'pg_catalog', 'information_schema', 'extensions'
      )
  loop
    execute format('drop trigger if exists %I on %I.%I cascade', r.trigger_name, r.table_schema, r.table_name);
  end loop;

  -- 2. Drop all RLS policies on storage.objects and storage.buckets
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename in ('objects', 'buckets')
  loop
    execute format('drop policy if exists %I on storage.%I', r.policyname, r.tablename);
  end loop;

  -- 3. Drop all non-extension views and materialized views in public
  for r in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
      and not exists (
        select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'drop %s if exists public.%I cascade',
      case when r.relkind = 'm' then 'materialized view' else 'view' end,
      r.relname
    );
  end loop;

  -- 4. Drop all non-extension tables (regular, partitioned, foreign) in public
  for r in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'f')
      and not exists (
        select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'drop %s if exists public.%I cascade',
      case when r.relkind = 'f' then 'foreign table' else 'table' end,
      r.relname
    );
  end loop;

  -- 5. Drop any remaining non-extension sequences in public
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and not exists (
        select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format('drop sequence if exists public.%I cascade', r.relname);
  end loop;

  -- 6. Drop all non-extension functions, procedures, and aggregates in public
  for r in
    select
      p.proname,
      p.prokind,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'drop %s if exists public.%I(%s) cascade',
      case r.prokind
        when 'p' then 'procedure'
        when 'a' then 'aggregate'
        else 'function'
      end,
      r.proname,
      r.args
    );
  end loop;

  -- 7. Drop all non-extension custom types and domains in public
  for r in
    select t.typname, t.typtype
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype in ('e', 'c', 'd', 'r', 'm')
      and (t.typtype <> 'c' or t.typrelid = 0)
      and not exists (
        select 1 from pg_depend d
        where d.objid = t.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'drop %s if exists public.%I cascade',
      case when r.typtype = 'd' then 'domain' else 'type' end,
      r.typname
    );
  end loop;

  -- 8. Remove existing auth users from the old project (cascades identities/sessions)
  delete from auth.users;

  -- 9. Clear old Supabase CLI migration history if present
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    begin
      truncate table supabase_migrations.schema_migrations;
    exception when insufficient_privilege then
      null;
    end;
  end if;
end $$;

commit;`;

// Group migrations into explicit transactions so any `ALTER TYPE ... ADD VALUE`
// commits before subsequent migrations reference the newly added enum values.
const chunks = [];
let current = [];
for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8").replace(/\s+$/, "");
  current.push(`-- ===== ${file} =====\n${sql}`);
  if (/alter\s+type\s+[\s\S]*?\badd\s+value\b/i.test(sql)) {
    chunks.push(current.join("\n\n"));
    current = [];
  }
}
if (current.length > 0) {
  chunks.push(current.join("\n\n"));
}

const body = chunks.map((chunk) => `begin;\n\n${chunk}\n\ncommit;`).join("\n\n");

const footer = `-- Refresh PostgREST schema cache so the Data API picks up all new tables/RPCs immediately.
notify pgrst, 'reload schema';`;

writeFileSync(outFile, `${header}\n${cleanupBlock}\n\n${body}\n\n${footer}\n`, "utf8");
console.log(`Wrote supabase/bootstrap.sql (${files.length} migrations, ${chunks.length} tx blocks)`);
