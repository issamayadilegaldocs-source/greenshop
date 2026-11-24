import type { Tables } from "@/integrations/supabase/types";

export type DescriptionTemplate = Tables<"description_templates">;

export const TARGET_LENGTHS = [
  { value: "short", fr: "Courte", ar: "قصير" },
  { value: "medium", fr: "Moyenne", ar: "متوسط" },
  { value: "long", fr: "Longue", ar: "طويل" },
] as const;

export const templatesQueryKey = ["admin", "description-templates"] as const;
