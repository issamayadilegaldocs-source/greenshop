import { z } from "zod";

const PG_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const photoAnalyzeInputSchema = z.object({
  imageDataUrl: z
    .string()
    .min(30)
    .max(4_500_000)
    .refine((v) => v.startsWith("data:image/"), "Image base64 invalide."),
  hint: z.string().trim().max(400).optional().nullable(),
  categories: z
    .array(
      z.object({
        id: z.string().regex(PG_UUID_RE),
        label: z.string().min(1).max(200),
      }),
    )
    .max(120),
});

export type PhotoAnalyzeInput = z.output<typeof photoAnalyzeInputSchema>;
export type PhotoAnalyzeRaw = z.input<typeof photoAnalyzeInputSchema>;

export const photoProductDraftSchema = z.object({
  name_fr: z.string().min(2).max(160),
  name_ar: z.string().min(2).max(160),
  slug: z.string().min(2).max(120),
  sku: z.string().min(2).max(60),
  category_id: z.string().nullable(),
  brand: z.string().max(80).nullable(),
  model: z.string().max(80).nullable(),
  warranty: z.string().max(80).nullable(),
  suggested_price_tnd: z.number().min(1).max(100000),
  suggested_promo_price_tnd: z.number().min(1).max(100000).nullable(),
  description_fr: z.string().min(20).max(5000),
  description_ar: z.string().min(20).max(5000),
  studio_photo_prompt: z.string().min(10).max(800),
  lifestyle_photo_prompt: z.string().min(10).max(800),
});

export type PhotoProductDraft = z.output<typeof photoProductDraftSchema>;

export type PhotoAnalyzeResponse =
  | { ok: true; source: "openai"; data: PhotoProductDraft }
  | {
      ok: false;
      code: "forbidden" | "not_configured" | "rate_limited" | "failed";
      error: string;
    };

export const marketingPhotoInputSchema = z.object({
  imageDataUrl: z
    .string()
    .min(30)
    .max(4_500_000)
    .refine((v) => v.startsWith("data:image/"), "Image base64 invalide."),
  style: z.enum(["studio", "lifestyle"]),
  productName: z.string().trim().min(2).max(160),
  categoryName: z.string().trim().max(160).optional().nullable(),
  customPrompt: z.string().trim().max(900).optional().nullable(),
});

export type MarketingPhotoInput = z.output<typeof marketingPhotoInputSchema>;
export type MarketingPhotoRaw = z.input<typeof marketingPhotoInputSchema>;

export type MarketingPhotoResponse =
  | { ok: true; style: "studio" | "lifestyle"; imageDataUrl: string; mimeType: string }
  | {
      ok: false;
      code: "forbidden" | "not_configured" | "rate_limited" | "failed";
      error: string;
    };
