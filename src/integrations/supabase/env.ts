/**
 * Supabase connection settings for this project's own Supabase instance.
 *
 * Resolution order for every value:
 *   1. Node runtime environment (SSR server, production hosting).
 *   2. Vite environment (browser and SSR build), read from `.env`.
 *
 * Both the plain and the Vite-prefixed names are accepted so the same `.env`
 * file works for server functions and for the browser bundle:
 *   SUPABASE_URL            / VITE_SUPABASE_URL            / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *
 * Secret values (service role key, AI provider key) live in secrets.server.ts and
 * are read from the Node runtime environment only — never from a Vite-prefixed
 * variable, so they can never end up in the browser bundle.
 */

type EnvBag = Record<string, string | undefined>;

function runtimeEnv(): EnvBag {
  if (typeof process === "undefined" || !process.env) return {};
  return process.env as EnvBag;
}

function viteEnv(): EnvBag {
  const env = (import.meta as ImportMeta & { env?: EnvBag }).env;
  return env ?? {};
}

function readFirst(names: string[], sources: EnvBag[]): string | undefined {
  for (const name of names) {
    for (const source of sources) {
      const value = source[name];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
  }
  return undefined;
}

/** Public base URL of the Supabase project. Throws when the app is not configured. */
export function supabaseUrl(): string {
  const url = readFirst(
    ["SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
    [runtimeEnv(), viteEnv()],
  );
  if (!url) {
    throw new Error(
      "Supabase is not configured: set SUPABASE_URL (or VITE_SUPABASE_URL) in .env — see .env.example.",
    );
  }
  return url.replace(/\/+$/, "");
}

/** Publishable (anon-equivalent) key. Safe to ship to the browser. */
export function supabasePublishableKey(): string {
  const key = readFirst(
    [
      "SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ],
    [runtimeEnv(), viteEnv()],
  );
  if (!key) {
    throw new Error(
      "Supabase is not configured: set SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) in .env — see .env.example.",
    );
  }
  return key;
}
