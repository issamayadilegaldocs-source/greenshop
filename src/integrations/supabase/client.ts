import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { supabasePublishableKey, supabaseUrl } from "./env";
import { createSupabaseFetch } from "./fetch";

function createSupabaseClient() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();

  return createClient<Database>(url, key, {
    global: { fetch: createSupabaseFetch(key) },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the Supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
