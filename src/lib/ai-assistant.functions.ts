import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabasePublishableKey, supabaseUrl } from "@/integrations/supabase/env";
import { createSupabaseFetch } from "@/integrations/supabase/fetch";
import { resolveAiConfig } from "./ai/config.server";
import { runShoppingAssistant, type AssistantStoreContext } from "./ai/assistant.server";
import {
  assistantRequestSchema,
  type AssistantOrderCard,
  type AssistantReplyResponse,
  type AssistantRequestRaw,
} from "./ai-assistant.schema";

const optionalAuthClient = createServerOnlyFn(() => {
  const key = supabasePublishableKey();
  const authHeader = getRequest()?.headers?.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const hasValidJwt = token.split(".").length === 3;
  return {
    hasValidJwt,
    sb: createClient<Database>(supabaseUrl(), key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: createSupabaseFetch(key),
        ...(hasValidJwt ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      },
    }),
  };
});

/** Safe public check: whether the storefront AI assistant bubble should be shown. */
export const getAssistantStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ enabled: boolean }> => {
    const { sb } = optionalAuthClient();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (sb as any).rpc("get_assistant_public_status");
      if (!error && typeof data === "boolean") return { enabled: data };
    } catch {
      // Migration not applied yet — default to enabled.
    }
    return { enabled: true };
  },
);

/** Public/authenticated storefront AI shopping assistant connected to real catalog & live order tracking. */
export const sendAssistantMessage = createServerFn({ method: "POST" })
  .inputValidator((input: AssistantRequestRaw) => assistantRequestSchema.parse(input))
  .handler(async ({ data }): Promise<AssistantReplyResponse> => {
    const { sb, hasValidJwt } = optionalAuthClient();

    const [settingsRes, categoriesRes, productsRes] = await Promise.all([
      sb
        .from("store_settings")
        .select(
          "delivery_fee, free_delivery_threshold, return_window_days, delivery_cities, support_phone",
        )
        .eq("id", true)
        .maybeSingle(),
      sb.from("categories").select("id, name_fr, name_ar").eq("is_active", true),
      sb
        .from("products")
        .select(
          "id, slug, name_fr, name_ar, brand, price, promo_price, category_id, description_fr, description_ar, is_featured, product_images(url, position), product_variants(id, sku, price, promo_price, is_active, inventory(available))",
        )
        .eq("status", "published")
        .order("is_featured", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(60),
    ]);

    const catById = new Map(
      (categoriesRes.data ?? []).map((c) => [c.id, { fr: c.name_fr, ar: c.name_ar }]),
    );

    const catalog: AssistantStoreContext["catalog"] = (productsRes.data ?? []).map((p) => {
      const imgs = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position);
      const variants = (p.product_variants ?? []).filter((v) => v.is_active);
      const inStockVariant =
        variants.find((v) => {
          const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
          return (inv?.available ?? 0) > 0;
        }) ?? variants[0];
      const inStock = variants.some((v) => {
        const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
        return (inv?.available ?? 0) > 0;
      });
      const cat = p.category_id ? catById.get(p.category_id) : undefined;
      return {
        id: p.id,
        slug: p.slug,
        name_fr: p.name_fr,
        name_ar: p.name_ar,
        brand: p.brand,
        category_fr: cat?.fr ?? null,
        category_ar: cat?.ar ?? null,
        description_fr: p.description_fr,
        description_ar: p.description_ar,
        price: Number(inStockVariant?.price ?? p.price),
        promo_price:
          inStockVariant?.promo_price != null
            ? Number(inStockVariant.promo_price)
            : p.promo_price != null
              ? Number(p.promo_price)
              : null,
        image: imgs[0]?.url ?? null,
        in_stock: inStock,
        defaultVariantId: inStockVariant?.id ?? null,
        variantLabelFr: "Standard",
        variantLabelAr: "قياسي",
      };
    });

    // Signed-in customer's own recent orders (protected by RLS)
    let userOrders: AssistantOrderCard[] = [];
    if (hasValidJwt) {
      const { data: ordRows } = await sb
        .from("orders")
        .select("reference, status, total, city, created_at, order_items(product_name, quantity)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (ordRows?.length) {
        userOrders = ordRows.map((o) => ({
          order_number: o.reference,
          status: o.status,
          total: Number(o.total),
          city: o.city,
          created_at: o.created_at,
          items_summary:
            (o.order_items ?? [])
              .map((i) => `${i.quantity}× ${i.product_name}`)
              .slice(0, 3)
              .join(", ") || null,
          source: "my_orders",
        }));
      }
    }

    // Guest or explicit order tracking when an order reference (WS2611-...) is mentioned
    let trackedOrder: AssistantOrderCard | null = null;
    let trackAttemptedWithoutPhone: string | null = null;
    const recentUserText = data.messages
      .filter((m) => m.role === "user")
      .slice(-2)
      .map((m) => m.content)
      .join(" ");
    const refMatch = /\b(WS\d{4}-\d{4,8})\b/i.exec(recentUserText);
    if (refMatch) {
      const orderRef = refMatch[1]!.toUpperCase();
      // First check if it's already in the signed-in user's orders
      const ownMatch = userOrders.find((o) => o.order_number.toUpperCase() === orderRef);
      if (ownMatch) {
        trackedOrder = ownMatch;
      } else {
        // Look for an 8+ digit phone number in the last 2 user messages
        const withoutRef = recentUserText.replace(orderRef, " ");
        const phoneMatch = /(\+?\d[\d\s-]{6,14}\d)/.exec(withoutRef);
        if (phoneMatch) {
          const digits = phoneMatch[1]!.replace(/\D/g, "");
          if (digits.length >= 8) {
            const { data: tracked } = await sb.rpc("track_order", {
              _reference: orderRef,
              _phone: digits,
            });
            if (tracked && typeof tracked === "object" && !Array.isArray(tracked)) {
              const t = tracked as {
                reference?: string;
                status?: string;
                total?: number;
                city?: string;
                created_at?: string;
                items?: { product_name?: string; quantity?: number }[];
              };
              if (t.reference && t.status) {
                trackedOrder = {
                  order_number: t.reference,
                  status: t.status,
                  total: Number(t.total ?? 0),
                  city: t.city ?? null,
                  created_at: t.created_at ?? new Date().toISOString(),
                  items_summary:
                    (t.items ?? [])
                      .map((i) => `${i.quantity ?? 1}× ${i.product_name ?? ""}`)
                      .slice(0, 3)
                      .join(", ") || null,
                  source: "tracked",
                };
              }
            }
          }
        }
        if (!trackedOrder) {
          trackAttemptedWithoutPhone = orderRef;
        }
      }
    }

    const aiConfig = await resolveAiConfig(hasValidJwt ? sb : undefined);
    const settings = settingsRes.data;

    return runShoppingAssistant(
      data.messages,
      {
        locale: data.locale,
        deliveryFee: Number(settings?.delivery_fee ?? 7),
        freeDeliveryThreshold:
          settings?.free_delivery_threshold != null
            ? Number(settings.free_delivery_threshold)
            : null,
        returnWindowDays: settings?.return_window_days ?? 14,
        citiesCount: settings?.delivery_cities?.length ?? 24,
        supportPhone: settings?.support_phone ?? null,
        isSignedIn: hasValidJwt,
        catalog,
        userOrders,
        trackedOrder,
        trackAttemptedWithoutPhone,
      },
      aiConfig,
    );
  });
