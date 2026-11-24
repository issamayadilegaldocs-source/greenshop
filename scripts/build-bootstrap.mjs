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
-- Maison Noura database bootstrap
-- =========================================================
-- GENERATED FILE — do not edit by hand. Source of truth: supabase/migrations/.
-- Regenerate with: npm run db:bundle
--
-- Apply once to an empty Supabase project:
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run
-- or with the CLI: npm run db:push
--
-- Files included (in order):
${files.map((f) => `--   ${f}`).join("\n")}
-- =========================================================
`;

const body = files
  .map((file) => {
    const sql = readFileSync(join(migrationsDir, file), "utf8").replace(/\s+$/, "");
    return `-- ===== ${file} =====\n${sql}`;
  })
  .join("\n\n");

writeFileSync(outFile, `${header}\n${body}\n`, "utf8");
console.log(`Wrote supabase/bootstrap.sql (${files.length} migrations)`);
