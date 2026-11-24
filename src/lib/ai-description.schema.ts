import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

export const descriptionInputSchema = z.object({
  templateId: z.string().uuid(),
  productName: z.string().trim().min(2, "Nom du produit trop court").max(150),
  categoryPath: optionalText(300),
  brand: optionalText(80),
  model: optionalText(80),
  warranty: optionalText(120),
  audience: optionalText(160),
  highlights: optionalText(1500),
  attributes: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        value: z.string().trim().min(1).max(300),
      }),
    )
    .max(40),
  languages: z.enum(["fr", "ar", "both"]),
});

export type DescriptionInput = z.output<typeof descriptionInputSchema>;
export type DescriptionInputRaw = z.input<typeof descriptionInputSchema>;

export type DescriptionResult = {
  description_fr: string | null;
  description_ar: string | null;
  summary_fr: string | null;
  summary_ar: string | null;
};

export type DescriptionResponse =
  { ok: true; data: DescriptionResult } | { ok: false; code: string; error: string };
