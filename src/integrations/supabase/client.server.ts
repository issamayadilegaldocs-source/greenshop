// Server-side Supabase client with the service role key — bypasses RLS.
// Use this for trusted server-side operations only; for user-authenticated
// queries with RLS, use the requireSupabaseAuth middleware instead.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { supabaseUrl } from "./env";
import { supabaseServiceRoleKey } from "./secrets.server";
import { createSupabaseFetch } from "./fetch";

function createSupabaseAdminClient() {
  const key = supabaseServiceRoleKey();
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. It is server-only — never prefix it with VITE_ or NEXT_PUBLIC_.",
    );
  }

  return createClient<Database>(supabaseUrl(), key, {
    global: { fetch: createSupabaseFetch(key) },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

// SECURITY: Only use this for trusted server-side operations, never expose it to
// client code. Load it inside server handlers:
//   const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
// A top-level import is safe only in other .server.ts modules — route files and
// *.functions.ts ship to the client bundle.
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
