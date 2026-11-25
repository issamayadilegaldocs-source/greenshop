import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  socialCampaignInputSchema,
  type SocialCampaignInputRaw,
  type SocialCampaignResponse,
} from "./ai-social.schema";
import { generateSocialCampaign } from "./ai/social.server";
import { resolveAiConfig } from "./ai/config.server";

/**
 * Admin/staff-gated server function: generates a complete Facebook + Instagram +
 * Meta Ads + 4-scene promotional video storyboard pack for a chosen product.
 */
export const generateSocialPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SocialCampaignInputRaw) => socialCampaignInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<SocialCampaignResponse> => {
    const { data: isStaff, error: roleError } = await context.supabase.rpc("is_staff");
    if (roleError || !isStaff) {
      return {
        ok: false,
        code: "forbidden",
        error: "Fonction réservée à l'équipe et aux administrateurs.",
      };
    }
    const aiConfig = await resolveAiConfig(context.supabase);
    return generateSocialCampaign(data, aiConfig);
  });
