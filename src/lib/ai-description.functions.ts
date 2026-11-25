import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  descriptionInputSchema,
  type DescriptionInputRaw,
  type DescriptionResponse,
} from "./ai-description.schema";
import { generateProductDescription } from "./ai/description.server";
import { resolveAiConfig } from "./ai/config.server";

/** Admin-only: write a ready-to-publish product description from its characteristics and a template. */
export const generateDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DescriptionInputRaw) => descriptionInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<DescriptionResponse> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_admin");
    if (roleError || !isAdmin)
      return { ok: false, code: "forbidden", error: "Fonction réservée aux administrateurs." };

    const { data: template, error } = await context.supabase
      .from("description_templates")
      .select("name, instructions, target_length, is_active")
      .eq("id", data.templateId)
      .maybeSingle();
    if (error || !template)
      return { ok: false, code: "template", error: "Modèle de description introuvable." };
    if (!template.is_active)
      return { ok: false, code: "template", error: "Ce modèle est désactivé." };

    const aiConfig = await resolveAiConfig(context.supabase);
    return generateProductDescription(template, data, aiConfig);
  });
