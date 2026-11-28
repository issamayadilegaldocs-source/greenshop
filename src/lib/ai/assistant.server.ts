import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { ResolvedAiConfig } from "./config.server";
import type {
  AssistantMessage,
  AssistantOrderCard,
  AssistantProductCard,
  AssistantReplyResponse,
} from "../ai-assistant.schema";

export type AssistantStoreContext = {
  locale: "fr" | "ar";
  deliveryFee: number;
  freeDeliveryThreshold: number | null;
  returnWindowDays: number;
  citiesCount: number;
  supportPhone: string | null;
  isSignedIn: boolean;
  catalog: (AssistantProductCard & {
    brand: string | null;
    description_fr: string | null;
    description_ar: string | null;
  })[];
  userOrders: AssistantOrderCard[];
  trackedOrder: AssistantOrderCard | null;
  trackAttemptedWithoutPhone: string | null;
};

const llmOutputSchema = z.object({
  reply: z.string().min(4).max(1600),
  recommended_slugs: z.array(z.string()).max(4),
  show_orders: z.boolean(),
  quick_replies: z.array(z.string().max(60)).max(3),
});

const STATUS_FR: Record<string, string> = {
  pending: "En attente de confirmation",
  confirmed: "Confirmée",
  preparing: "En préparation",
  shipped: "Expédiée",
  out_for_delivery: "En cours de livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
  returned: "Retournée",
};

const STATUS_AR: Record<string, string> = {
  pending: "في انتظار التأكيد",
  confirmed: "مؤكدة",
  preparing: "قيد التحضير",
  shipped: "تم الشحن",
  out_for_delivery: "في طريق التوصيل",
  delivered: "تم التوصيل",
  cancelled: "ملغاة",
  returned: "مُرجعة",
};

function fmtPrice(n: number): string {
  return `${n.toFixed(n % 1 === 0 ? 0 : 3).replace(".", ",")} DT`;
}

function effectivePrice(p: AssistantProductCard): number {
  return p.promo_price != null && p.promo_price < p.price ? p.promo_price : p.price;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function detectArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function buildSmartCatalogFallback(
  messages: AssistantMessage[],
  ctx: AssistantStoreContext,
): AssistantReplyResponse {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const isAr = detectArabic(lastUser) || ctx.locale === "ar";
  const q = norm(lastUser);

  // 1. Direct tracked order result (ref + phone provided)
  if (ctx.trackedOrder) {
    const o = ctx.trackedOrder;
    const statusLabel = isAr
      ? (STATUS_AR[o.status] ?? o.status)
      : (STATUS_FR[o.status] ?? o.status);
    return {
      ok: true,
      mode: "smart_catalog",
      reply: isAr
        ? `إليك حالة الطلبية ${o.order_number} : ${statusLabel}. المبلغ الإجمالي ${fmtPrice(o.total)}${o.city ? ` — التوصيل إلى ${o.city}` : ""}.`
        : `Voici le statut de votre commande ${o.order_number} : ${statusLabel}. Total : ${fmtPrice(o.total)}${o.city ? ` — livraison vers ${o.city}` : ""}.`,
      products: [],
      orders: [o],
      quickReplies: isAr
        ? ["أفضل العروض", "رسوم التوصيل", "أفكار هدايا"]
        : ["Meilleures promos", "Frais de livraison", "Idées cadeaux"],
    };
  }

  // 2. Order reference mentioned without phone number (guest)
  if (ctx.trackAttemptedWithoutPhone) {
    return {
      ok: true,
      mode: "smart_catalog",
      reply: isAr
        ? `لتتبع الطلبية ${ctx.trackAttemptedWithoutPhone}، يرجى إرسال رقم الهاتف المستعمل عند الطلب (مثال: ${ctx.trackAttemptedWithoutPhone} 22123456) أو فتح صفحة تتبع الطلبية.`
        : `Pour afficher le détail de la commande ${ctx.trackAttemptedWithoutPhone}, indiquez aussi le numéro de téléphone utilisé lors de la commande (ex. : ${ctx.trackAttemptedWithoutPhone} 22123456) ou connectez-vous à votre compte.`,
      products: [],
      orders: [],
      quickReplies: isAr
        ? ["كيف يتم التوصيل؟", "أفضل العروض"]
        : ["Frais de livraison & COD", "Voir les promos"],
    };
  }

  // 3. Order / tracking intent
  const asksOrder =
    /commande|suiv|statut|colis|livree|ws\d{4}|طلب|تتبع|وين/.test(q) ||
    /طلب|تتبع|وين/.test(lastUser);
  if (asksOrder) {
    if (ctx.userOrders.length > 0) {
      const latest = ctx.userOrders[0]!;
      const st = isAr
        ? (STATUS_AR[latest.status] ?? latest.status)
        : (STATUS_FR[latest.status] ?? latest.status);
      return {
        ok: true,
        mode: "smart_catalog",
        reply: isAr
          ? `لديك ${ctx.userOrders.length} طلبية مسجلة. آخر طلبية (${latest.order_number}) حالتها حالياً: ${st} (${fmtPrice(latest.total)}).`
          : `Vous avez ${ctx.userOrders.length} commande(s) sur votre compte. La plus récente (${latest.order_number}) est actuellement « ${st} » (${fmtPrice(latest.total)}).`,
        products: [],
        orders: ctx.userOrders.slice(0, 3),
        quickReplies: isAr
          ? ["أفضل العروض", "سياسة الإرجاع"]
          : ["Voir les promotions", "Politique de retour"],
      };
    }
    return {
      ok: true,
      mode: "smart_catalog",
      reply: isAr
        ? "لتتبع طلبيتك فوراً، أرسل رقم الطلبية (مثل WS2611-001010) مع رقم الهاتف، أو سجّل الدخول لعرض كل طلبياتك تلقائياً."
        : "Pour suivre votre commande ici, envoyez simplement votre référence (ex. : WS2611-001010) suivie de votre téléphone, ou connectez-vous à votre compte client.",
      products: [],
      orders: [],
      quickReplies: isAr
        ? ["أفكار هدايا أقل من 150 د.ت", "رسوم التوصيل"]
        : ["Idées cadeaux < 150 DT", "Frais de livraison"],
    };
  }

  // 4. Delivery / COD / Return policy intent
  const asksPolicy =
    /livraison|frais|cod|paiement|payer|carte|retour|rembours|gouvernorat|ville|delai/.test(q) ||
    /توصيل|شحن|دفع|استلام|إرجاع|ارجاع|ولاية|مصاريف/.test(lastUser);
  if (asksPolicy) {
    const freeFr =
      ctx.freeDeliveryThreshold != null
        ? `gratuite dès ${fmtPrice(ctx.freeDeliveryThreshold)}`
        : "tarif unique";
    const freeAr =
      ctx.freeDeliveryThreshold != null
        ? `مجاني ابتداءً من ${fmtPrice(ctx.freeDeliveryThreshold)}`
        : "تعريفة موحدة";
    return {
      ok: true,
      mode: "smart_catalog",
      reply: isAr
        ? `نوصّل إلى جميع الولايات (${ctx.citiesCount} ولاية في تونس). رسوم التوصيل ${fmtPrice(ctx.deliveryFee)} (${freeAr}). الدفع يكون عند الاستلام يداً بيد بدون بطاقة بنكية، ويمكن الإرجاع خلال ${ctx.returnWindowDays} يوماً.${ctx.supportPhone ? ` هاتف خدمة الحرفاء: ${ctx.supportPhone}` : ""}`
        : `Nous livrons dans les ${ctx.citiesCount} gouvernorats de Tunisie. Les frais de livraison sont de ${fmtPrice(ctx.deliveryFee)} (${freeFr}). Le paiement se fait uniquement à la livraison (main à main, sans carte bancaire), avec un délai de retour de ${ctx.returnWindowDays} jours.${ctx.supportPhone ? ` Service client : ${ctx.supportPhone}.` : ""}`,
      products: [],
      orders: [],
      quickReplies: isAr
        ? ["أفضل العروض", "منتجات أقل من 150 د.ت", "تتبع طلبيتي"]
        : ["Meilleures promos", "Produits < 150 DT", "Suivre ma commande"],
    };
  }

  // 5. Budget extraction ("moins de 150", "< 200", "أقل من 150", "100 dt")
  const budgetMatch =
    /(?:moins de|<|max|budget|jusqu.?a|اقل من|أقل من|حدود)\s*(\d{2,4})/.exec(q) ||
    /(\d{2,4})\s*(?:dt|tnd|dinar|د\.?ت|دينار)/.exec(lastUser.toLowerCase());
  const maxBudget = budgetMatch ? Number(budgetMatch[1]) : null;

  // 6. Promo intent
  const asksPromo =
    /promo|solde|reduct|remise|offre|rabais/.test(q) || /تخفيض|عرض|عروض|خصم/.test(lastUser);

  // 7. Keyword matching against live catalog
  const stopWords = new Set([
    "je",
    "tu",
    "il",
    "elle",
    "nous",
    "vous",
    "un",
    "une",
    "des",
    "les",
    "le",
    "la",
    "de",
    "du",
    "pour",
    "avec",
    "sans",
    "dans",
    "sur",
    "est",
    "sont",
    "avez",
    "avoir",
    "cherche",
    "veux",
    "voudrais",
    "besoin",
    "idee",
    "idees",
    "cadeau",
    "cadeaux",
    "produit",
    "produits",
    "moins",
    "plus",
    "prix",
    "dt",
    "tnd",
    "bon",
    "bonne",
    "meilleur",
    "meilleures",
    "bonjour",
    "salut",
    "merci",
    "svp",
    "stp",
    "voir",
    "montre",
    "propose",
    "recommande",
    "promo",
    "promos",
    "promotion",
    "promotions",
    "offre",
    "offres",
    "solde",
    "soldes",
    "افضل",
    "أفضل",
    "عروض",
    "عرض",
    "تخفيضات",
    "تخفيض",
    "هدية",
    "فكرة",
    "اقل",
    "أقل",
    "من",
  ]);
  const tokens = q
    .split(/[^a-z0-9\u0600-\u06FF]+/)
    .filter((w) => w.length >= 2 && !stopWords.has(w) && !/^\d+$/.test(w));

  const scored = ctx.catalog
    .map((item) => {
      const hay = norm(
        [
          item.name_fr,
          item.name_ar ?? "",
          item.category_fr ?? "",
          item.category_ar ?? "",
          item.brand ?? "",
          item.description_fr ?? "",
          item.description_ar ?? "",
        ].join(" "),
      );
      let score = 0;
      for (const tok of tokens) {
        if (hay.includes(tok)) score += 3;
      }
      if (asksPromo && item.promo_price != null && item.promo_price < item.price) score += 6;
      if (maxBudget != null) {
        if (effectivePrice(item) <= maxBudget) score += 4;
        else score -= 20;
      }
      if (item.in_stock) score += 1;
      return { item, score };
    })
    .filter((x) => {
      if (maxBudget != null) return effectivePrice(x.item) <= maxBudget && x.item.in_stock;
      if (asksPromo) return x.item.promo_price != null && x.item.promo_price < x.item.price;
      return x.score > 1;
    })
    .sort((a, b) => b.score - a.score || effectivePrice(a.item) - effectivePrice(b.item));

  let picks = scored.slice(0, 3).map((x) => x.item);

  // If pure greeting or broad gift request, show top featured/in-stock picks
  if (picks.length === 0) {
    picks = ctx.catalog
      .filter((p) => p.in_stock && (maxBudget == null || effectivePrice(p) <= maxBudget))
      .slice(0, 3);
  }

  const cleanCards: AssistantProductCard[] = picks.map((p) => ({
    id: p.id,
    slug: p.slug,
    name_fr: p.name_fr,
    name_ar: p.name_ar,
    category_fr: p.category_fr,
    category_ar: p.category_ar,
    price: p.price,
    promo_price: p.promo_price,
    image: p.image,
    in_stock: p.in_stock,
    defaultVariantId: p.defaultVariantId,
    variantLabelFr: p.variantLabelFr,
    variantLabelAr: p.variantLabelAr,
  }));

  let reply: string;
  if (cleanCards.length > 0) {
    if (asksPromo) {
      reply = isAr
        ? "إليك أفضل العروض المتوفرة حالياً في دار نورة. يمكنك إضافتها مباشرة إلى السلة مع الدفع عند الاستلام :"
        : "Voici nos meilleures offres du moment chez Maison Noura. Vous pouvez les ajouter au panier en 1 clic (paiement à la livraison) :";
    } else if (maxBudget != null) {
      reply = isAr
        ? `إليك اختياراتنا المتوفرة بأقل من ${maxBudget} د.ت — توصيل في 24 ولاية والدفع عند الاستلام :`
        : `Voici notre sélection disponible à moins de ${maxBudget} DT — livrable dans les 24 gouvernorats avec paiement à la livraison :`;
    } else {
      reply = isAr
        ? "إليك المنتجات الأنسب لطلبك من كتالوج دار نورة المتوفر حالياً :"
        : "Voici les articles de notre catalogue Maison Noura qui correspondent le mieux à votre recherche :";
    }
  } else {
    reply = isAr
      ? "لم أجد منتجاً مطابقاً تماماً لهذا المبلغ. جرّب ميزانية أخرى أو اسألني عن الملابس، الصوتيات، الأجهزة المنزلية أو الديكور!"
      : "Je n'ai pas trouvé d'article correspondant exactement à ce critère. Essayez un autre mot-clé ou demandez-moi nos catégories Mode, Audio, Électroménager ou Maison !";
  }

  return {
    ok: true,
    mode: "smart_catalog",
    reply,
    products: cleanCards,
    orders: [],
    quickReplies: isAr
      ? ["أفضل العروض", "رسوم التوصيل", "تتبع طلبيتي"]
      : ["Meilleures promos", "Frais de livraison", "Suivre ma commande"],
  };
}

export async function runShoppingAssistant(
  messages: AssistantMessage[],
  ctx: AssistantStoreContext,
  config: ResolvedAiConfig,
): Promise<AssistantReplyResponse> {
  if (!config.openaiApiKey) {
    return buildSmartCatalogFallback(messages, ctx);
  }

  const provider = createOpenAI({ apiKey: config.openaiApiKey });

  const catalogLines = ctx.catalog
    .slice(0, 60)
    .map((p) => {
      const priceText =
        p.promo_price != null && p.promo_price < p.price
          ? `${fmtPrice(p.promo_price)} (promo au lieu de ${fmtPrice(p.price)})`
          : fmtPrice(p.price);
      return `- slug="${p.slug}" | FR="${p.name_fr}" | AR="${p.name_ar ?? ""}" | cat="${p.category_fr ?? ""}" | prix=${priceText} | stock=${p.in_stock ? "en_stock" : "epuise"}`;
    })
    .join("\n");

  const ordersSection = ctx.trackedOrder
    ? `Commande suivie demandée : ${ctx.trackedOrder.order_number} | statut=${ctx.trackedOrder.status} | total=${fmtPrice(ctx.trackedOrder.total)} | ville=${ctx.trackedOrder.city ?? "-"} | articles=${ctx.trackedOrder.items_summary ?? "-"}`
    : ctx.userOrders.length > 0
      ? `Commandes récentes du client connecté :\n${ctx.userOrders
          .map(
            (o) =>
              `- ${o.order_number} | statut=${o.status} | total=${fmtPrice(o.total)} | ville=${o.city ?? "-"} | articles=${o.items_summary ?? "-"}`,
          )
          .join("\n")}`
      : ctx.trackAttemptedWithoutPhone
        ? `Le client a mentionné la référence ${ctx.trackAttemptedWithoutPhone} sans numéro de téléphone : demande-lui poliment son numéro de téléphone pour vérifier sa commande.`
        : "Aucune commande liée à cette session (visiteur invité : s'il veut suivre une commande, demande-lui sa référence WS... + son numéro de téléphone).";

  const systemPrompt = [
    "Tu es l'assistant shopping officiel de Maison Noura, une boutique en ligne tunisienne élégante (Mode, Audio, Électroménager, Maison & Déco).",
    "Réponds TOUJOURS dans la langue du client (français si le client écrit en français, arabe clair / tunisien poli si le client écrit en arabe ou derja).",
    "Règles boutique réelles :",
    `- Livraison : ${ctx.citiesCount} gouvernorats en Tunisie. Frais : ${fmtPrice(ctx.deliveryFee)}${ctx.freeDeliveryThreshold != null ? ` (gratuite dès ${fmtPrice(ctx.freeDeliveryThreshold)})` : ""}.`,
    "- Paiement : Paiement à la livraison uniquement (main à main, sans carte bancaire).",
    `- Retours : possibles sous ${ctx.returnWindowDays} jours.`,
    ...(ctx.supportPhone ? [`- Téléphone service client : ${ctx.supportPhone}`] : []),
    "",
    "Catalogue LIVE (recommande UNIQUEMENT des slugs présents dans cette liste, n'invente JAMAIS un produit ou un prix) :",
    catalogLines || "(catalogue vide)",
    "",
    "Suivi de commandes LIVE :",
    ordersSection,
    "",
    "Consignes de réponse :",
    "- Sois chaleureux, concis (2 à 4 phrases max), sans Markdown brut (# ou **).",
    "- Si tu recommandes des produits, mets leurs slugs exacts dans `recommended_slugs` (0 à 3 produits max) — l'interface affichera automatiquement leurs cartes produit avec bouton Ajouter au panier.",
    "- Mets `show_orders: true` uniquement si le client parle de sa commande et qu'il y a au moins une commande dans le contexte LIVE ci-dessus.",
    "- Propose 2 ou 3 courtes suggestions de suivi dans `quick_replies` dans la langue de ta réponse.",
  ].join("\n");

  try {
    const { output } = await generateText({
      model: provider.chat(config.aiModel),
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      output: Output.object({ schema: llmOutputSchema }),
      maxRetries: 0,
    });

    const bySlug = new Map(ctx.catalog.map((p) => [p.slug, p]));
    const products: AssistantProductCard[] = [];
    for (const slug of output.recommended_slugs) {
      const found = bySlug.get(slug);
      if (found && !products.some((x) => x.slug === found.slug)) {
        products.push({
          id: found.id,
          slug: found.slug,
          name_fr: found.name_fr,
          name_ar: found.name_ar,
          category_fr: found.category_fr,
          category_ar: found.category_ar,
          price: found.price,
          promo_price: found.promo_price,
          image: found.image,
          in_stock: found.in_stock,
          defaultVariantId: found.defaultVariantId,
          variantLabelFr: found.variantLabelFr,
          variantLabelAr: found.variantLabelAr,
        });
      }
    }

    const orders: AssistantOrderCard[] = output.show_orders
      ? ctx.trackedOrder
        ? [ctx.trackedOrder]
        : ctx.userOrders.slice(0, 3)
      : [];

    return {
      ok: true,
      mode: "openai",
      reply: output.reply.replace(/\*\*/g, "").trim(),
      products,
      orders,
      quickReplies: output.quick_replies.slice(0, 3),
    };
  } catch (err) {
    console.error("[ai-assistant] OpenAI failed, falling back to smart catalog engine:", err);
    return buildSmartCatalogFallback(messages, ctx);
  }
}
