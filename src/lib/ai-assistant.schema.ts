import { z } from "zod";

export const assistantMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1200),
});

export const assistantRequestSchema = z.object({
  locale: z.enum(["fr", "ar"]).default("fr"),
  messages: z.array(assistantMessageSchema).min(1).max(14),
  currentPath: z.string().max(200).optional().nullable(),
});

export type AssistantMessage = z.output<typeof assistantMessageSchema>;
export type AssistantRequestRaw = z.input<typeof assistantRequestSchema>;

export type AssistantProductCard = {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string | null;
  category_fr: string | null;
  category_ar: string | null;
  price: number;
  promo_price: number | null;
  image: string | null;
  in_stock: boolean;
  defaultVariantId: string | null;
  variantLabelFr: string;
  variantLabelAr: string;
};

export type AssistantOrderCard = {
  order_number: string;
  status: string;
  total: number;
  city: string | null;
  created_at: string;
  items_summary: string | null;
  source: "my_orders" | "tracked";
};

export type AssistantReplyResponse =
  | {
      ok: true;
      mode: "openai" | "smart_catalog";
      reply: string;
      products: AssistantProductCard[];
      orders: AssistantOrderCard[];
      quickReplies: string[];
    }
  | {
      ok: false;
      error: string;
    };
