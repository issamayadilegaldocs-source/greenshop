import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAiConfig, testOpenAiKey } from "./ai/config.server";
import {
  falApiKey as envFalApiKey,
  openAiApiKey as envOpenAiApiKey,
  replicateApiToken as envReplicateApiToken,
  supabaseServiceRoleKey,
} from "@/integrations/supabase/secrets.server";

export type AiSettingsStatus = {
  hasOpenaiKey: boolean;
  openaiKeyHint: string | null;
  openaiEnvConfigured: boolean;
  aiModel: string;
  imageModel: string;
  hasFalKey: boolean;
  falKeyHint: string | null;
  falEnvConfigured: boolean;
  hasReplicateToken: boolean;
  replicateTokenHint: string | null;
  replicateEnvConfigured: boolean;
  assistantEnabled: boolean;
  hasServiceRole: boolean;
  updatedAt: string | null;
};

const saveSchema = z.object({
  openaiApiKey: z.string().trim().max(300).optional().nullable(),
  clearOpenaiKey: z.boolean().optional(),
  aiModel: z.string().trim().min(2).max(80).optional().nullable(),
  imageModel: z.string().trim().min(2).max(80).optional().nullable(),
  falApiKey: z.string().trim().max(300).optional().nullable(),
  clearFalKey: z.boolean().optional(),
  replicateApiToken: z.string().trim().max(300).optional().nullable(),
  clearReplicateToken: z.boolean().optional(),
  assistantEnabled: z.boolean().optional(),
});

export type SaveAiSettingsInput = z.input<typeof saveSchema>;

export const getAiSettingsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiSettingsStatus> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin");
    if (roleError || !isAdmin) throw new Error("Accès réservé aux administrateurs.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any).rpc("admin_get_ai_settings_status");
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;

    return {
      hasOpenaiKey: Boolean(row?.has_openai_key),
      openaiKeyHint: row?.openai_key_hint ?? null,
      openaiEnvConfigured: Boolean(envOpenAiApiKey()?.trim()),
      aiModel: row?.ai_model ?? "gpt-4o-mini",
      imageModel: row?.image_model ?? "gpt-image-1",
      hasFalKey: Boolean(row?.has_fal_key),
      falKeyHint: row?.fal_key_hint ?? null,
      falEnvConfigured: Boolean(envFalApiKey()?.trim()),
      hasReplicateToken: Boolean(row?.has_replicate_token),
      replicateTokenHint: row?.replicate_token_hint ?? null,
      replicateEnvConfigured: Boolean(envReplicateApiToken()?.trim()),
      assistantEnabled: row?.assistant_enabled ?? true,
      hasServiceRole: Boolean(supabaseServiceRoleKey()),
      updatedAt: row?.updated_at ?? null,
    };
  });

export const saveAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SaveAiSettingsInput) => saveSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin");
    if (roleError || !isAdmin) throw new Error("Accès réservé aux administrateurs.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any).rpc("admin_save_ai_settings", {
      _openai_api_key: data.openaiApiKey || null,
      _clear_openai_key: Boolean(data.clearOpenaiKey),
      _ai_model: data.aiModel || null,
      _image_model: data.imageModel || null,
      _fal_api_key: data.falApiKey || null,
      _clear_fal_key: Boolean(data.clearFalKey),
      _replicate_api_token: data.replicateApiToken || null,
      _clear_replicate_token: Boolean(data.clearReplicateToken),
      _assistant_enabled: data.assistantEnabled ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const testSchema = z.object({
  candidateKey: z.string().trim().max(300).optional().nullable(),
  candidateModel: z.string().trim().max(80).optional().nullable(),
});

export const testAiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof testSchema>) => testSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; model: string; source: string } | { ok: false; error: string }> => {
      const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin");
      if (roleError || !isAdmin) return { ok: false, error: "Accès réservé aux administrateurs." };

      const cfg = await resolveAiConfig(context.supabase);
      const key = data.candidateKey?.trim() || cfg.openaiApiKey;
      const model = data.candidateModel?.trim() || cfg.aiModel || "gpt-4o-mini";

      if (!key) {
        return {
          ok: false,
          error:
            "Aucune clé OpenAI renseignée. Collez votre clé sk-... puis enregistrez ou testez.",
        };
      }
      const res = await testOpenAiKey(key, model);
      if (!res.ok) return res;
      return {
        ok: true,
        model: res.model,
        source: data.candidateKey?.trim() ? "saisie" : cfg.openaiSource,
      };
    },
  );
