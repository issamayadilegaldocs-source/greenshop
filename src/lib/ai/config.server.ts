import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  aiModel as envAiModel,
  falApiKey as envFalApiKey,
  openAiApiKey as envOpenAiApiKey,
  replicateApiToken as envReplicateApiToken,
  supabaseServiceRoleKey,
} from "@/integrations/supabase/secrets.server";

export type ResolvedAiConfig = {
  openaiApiKey: string | undefined;
  aiModel: string;
  imageModel: string;
  falApiKey: string | undefined;
  replicateApiToken: string | undefined;
  assistantEnabled: boolean;
  openaiSource: "database" | "env" | "none";
};

type DbRow = {
  openai_api_key: string | null;
  ai_model: string | null;
  image_model: string | null;
  fal_api_key: string | null;
  replicate_api_token: string | null;
  assistant_enabled: boolean | null;
};

/**
 * Resolves AI provider credentials securely on the server.
 * Priority:
 *   1. Admin-configured values stored in `public.ai_provider_settings`
 *      (read via `supabaseAdmin` when service role key is set, or via the
 *       staff/admin-only `staff_get_ai_runtime_config` RPC when called with an
 *       authenticated staff/admin Supabase client).
 *   2. Server-only environment variables (`OPENAI_API_KEY`, `AI_MODEL`, `FAL_KEY`, `REPLICATE_API_TOKEN`).
 */
export async function resolveAiConfig(
  authClient?: SupabaseClient<Database>,
): Promise<ResolvedAiConfig> {
  let dbRow: DbRow | null = null;

  // Path 1: Service role client (works for both admin routes and public storefront chat).
  if (supabaseServiceRoleKey()) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabaseAdmin as any)
        .from("ai_provider_settings")
        .select(
          "openai_api_key, ai_model, image_model, fal_api_key, replicate_api_token, assistant_enabled",
        )
        .eq("id", true)
        .maybeSingle();
      if (data) dbRow = data as DbRow;
    } catch {
      // Fall through to RPC / env fallback.
    }
  }

  // Path 2: Authenticated staff/admin RPC (works even without SUPABASE_SERVICE_ROLE_KEY on Vercel).
  if (!dbRow && authClient) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (authClient as any).rpc("staff_get_ai_runtime_config");
      if (!error && Array.isArray(data) && data.length > 0) {
        dbRow = data[0] as DbRow;
      }
    } catch {
      // Non-staff caller or migration not applied yet — fall back cleanly to env.
    }
  }

  const dbOpenAi = dbRow?.openai_api_key?.trim() || undefined;
  const envOpenAi = envOpenAiApiKey()?.trim() || undefined;
  const openaiApiKey = dbOpenAi ?? envOpenAi;

  const dbFal = dbRow?.fal_api_key?.trim() || undefined;
  const envFal = envFalApiKey()?.trim() || undefined;

  const dbRep = dbRow?.replicate_api_token?.trim() || undefined;
  const envRep = envReplicateApiToken()?.trim() || undefined;

  return {
    openaiApiKey,
    aiModel: dbRow?.ai_model?.trim() || envAiModel() || "gpt-4o-mini",
    imageModel: dbRow?.image_model?.trim() || "gpt-image-1",
    falApiKey: dbFal ?? envFal,
    replicateApiToken: dbRep ?? envRep,
    assistantEnabled: dbRow?.assistant_enabled ?? true,
    openaiSource: dbOpenAi ? "database" : envOpenAi ? "env" : "none",
  };
}

export async function testOpenAiKey(
  apiKey: string,
  model: string,
): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8,
        messages: [{ role: "user", content: "Reply OK" }],
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (res.status === 401) {
        return { ok: false, error: "Clé API OpenAI invalide ou révoquée (401)." };
      }
      if (res.status === 429) {
        return {
          ok: false,
          error:
            "Quota OpenAI dépassé ou compte sans crédit (429). Vérifiez la facturation OpenAI.",
        };
      }
      return {
        ok: false,
        error: body.error?.message || `Erreur OpenAI (${res.status}).`,
      };
    }
    return { ok: true, model };
  } catch {
    return { ok: false, error: "Impossible de contacter api.openai.com." };
  }
}
