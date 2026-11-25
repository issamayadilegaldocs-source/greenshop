import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAiConfig } from "./ai/config.server";
import { analyzePhotoToProduct, generateProductMarketingPhoto } from "./ai/photo-product.server";
import {
  marketingPhotoInputSchema,
  photoAnalyzeInputSchema,
  type MarketingPhotoRaw,
  type MarketingPhotoResponse,
  type PhotoAnalyzeRaw,
  type PhotoAnalyzeResponse,
} from "./ai-photo-product.schema";

/** Admin-only: analyze an uploaded product photo and draft the complete FR/AR product sheet. */
export const analyzeProductPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PhotoAnalyzeRaw) => photoAnalyzeInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PhotoAnalyzeResponse> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin");
    if (roleError || !isAdmin) {
      return {
        ok: false,
        code: "forbidden",
        error: "Fonction réservée aux administrateurs.",
      };
    }
    const aiConfig = await resolveAiConfig(context.supabase);
    return analyzePhotoToProduct(data, aiConfig);
  });

/** Admin-only: generate a clean studio or lifestyle marketing photo from the uploaded product image. */
export const generateMarketingPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: MarketingPhotoRaw) => marketingPhotoInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<MarketingPhotoResponse> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin");
    if (roleError || !isAdmin) {
      return {
        ok: false,
        code: "forbidden",
        error: "Fonction réservée aux administrateurs.",
      };
    }
    const aiConfig = await resolveAiConfig(context.supabase);
    return generateProductMarketingPhoto(data, aiConfig);
  });
