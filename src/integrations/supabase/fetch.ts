/**
 * Shared `fetch` wrapper for Supabase requests.
 *
 * Supabase's newer API keys (`sb_publishable_…`, `sb_secret_…`) are opaque
 * strings, not bearer JWTs, so they must be sent in the `apikey` header only.
 * supabase-js still sets `Authorization: Bearer <key>` for the client key, which
 * those keys reject, so the duplicate bearer header is stripped here.
 */
export function isOpaqueSupabaseKey(key: string): boolean {
  return key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
}

export function createSupabaseFetch(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isOpaqueSupabaseKey(apiKey) && headers.get("Authorization") === `Bearer ${apiKey}`) {
      headers.delete("Authorization");
    }

    headers.set("apikey", apiKey);
    return fetch(input, { ...init, headers });
  };
}
