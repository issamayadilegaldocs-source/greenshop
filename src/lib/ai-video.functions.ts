import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  aiVideoPollSchema,
  aiVideoStartSchema,
  pollGenerativeVideo,
  startGenerativeVideo,
  type AiVideoPollInput,
  type AiVideoPollResponse,
  type AiVideoStartRaw,
  type AiVideoStartResponse,
} from "./ai/video.server";

export const startAiProductVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AiVideoStartRaw) => aiVideoStartSchema.parse(input))
  .handler(async ({ data, context }): Promise<AiVideoStartResponse> => {
    const { data: isStaff, error } = await context.supabase.rpc("is_staff");
    if (error || !isStaff) {
      return {
        ok: false,
        code: "forbidden",
        prompt: "",
        error: "Fonction réservée à l'équipe et aux administrateurs.",
      };
    }
    return startGenerativeVideo(data);
  });

export const pollAiProductVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AiVideoPollInput) => aiVideoPollSchema.parse(input))
  .handler(async ({ data, context }): Promise<AiVideoPollResponse> => {
    const { data: isStaff, error } = await context.supabase.rpc("is_staff");
    if (error || !isStaff) {
      return { ok: false, error: "Accès refusé." };
    }
    return pollGenerativeVideo(data);
  });
