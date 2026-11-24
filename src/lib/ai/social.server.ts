import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, NoObjectGeneratedError, Output, streamText } from "ai";
import { aiModel, openAiApiKey } from "@/integrations/supabase/secrets.server";
import {
  socialCampaignResultSchema,
  type SocialCampaignInput,
  type SocialCampaignResponse,
  type SocialCampaignResult,
} from "../ai-social.schema";

const GOAL_LABELS: Record<SocialCampaignInput["goal"], string> = {
  flash_sale: "Vente flash / Offre promotionnelle (urgence, économie immédiate, fort taux de clic)",
  launch: "Lancement nouveauté (désirabilité, exclusivité, premier arrivé premier servi)",
  storytelling:
    "Mise en valeur qualité & usage quotidien (confiance, durabilité, bénéfices concrets)",
  retargeting:
    "Relance / Dernières pièces en stock (réassurance, paiement à la livraison sans risque)",
};

const TONE_LABELS: Record<SocialCampaignInput["tone"], string> = {
  dynamique: "Dynamique, direct, orienté vente rapide avec des phrases rythmées",
  elegant: "Élégant, moderne, raffiné et minimaliste (style Maison Noura)",
  chaleureux: "Chaleureux, proche des clients tunisiens, authentique et rassurant",
};

function formatPrice(price: number): string {
  return `${price.toFixed(price % 1 === 0 ? 0 : 3).replace(".", ",")} DT`;
}

function discountPercent(price: number, promoPrice?: number | null): number | null {
  if (promoPrice == null || promoPrice <= 0 || promoPrice >= price || price <= 0) return null;
  return Math.round(((price - promoPrice) / price) * 100);
}

function extractBullets(description?: string | null): string[] {
  if (!description) return [];
  return description
    .split(/\r?\n/)
    .map((line) => line.replace(/^[•\-*]\s*/, "").trim())
    .filter((line) => line.length >= 8 && line.length <= 120)
    .slice(0, 3);
}

function buildSmartFallback(input: SocialCampaignInput): SocialCampaignResult {
  const store = input.storeName?.trim() || "Maison Noura";
  const pct = discountPercent(input.price, input.promoPrice);
  const displayPrice =
    input.promoPrice != null && input.promoPrice < input.price
      ? formatPrice(input.promoPrice)
      : formatPrice(input.price);
  const oldPrice =
    input.promoPrice != null && input.promoPrice < input.price ? formatPrice(input.price) : null;
  const bullets = extractBullets(input.description);
  const mainBenefit =
    bullets[0] ||
    (input.categoryName
      ? `Sélection ${input.categoryName} choisie pour durer`
      : "Qualité soignée pour votre quotidien");
  const secondBenefit =
    bullets[1] ||
    (input.warranty ? `Garantie ${input.warranty}` : "Finition soignée et prête à livrer");
  const offerNote = input.customOffer?.trim();
  const productUrl =
    input.storeUrl && input.productSlug
      ? `${input.storeUrl.replace(/\/+$/, "")}/product/${input.productSlug}`
      : input.storeUrl || "";

  const hooks: Record<SocialCampaignInput["goal"], string> = {
    flash_sale: pct
      ? `⚡ -${pct}% sur ${input.productName} — offre limitée !`
      : `🔥 Offre du moment : ${input.productName} à ${displayPrice} !`,
    launch: `✨ Nouveauté ${store} : découvrez ${input.productName} !`,
    storytelling: `🌿 Pensé pour simplifier votre quotidien : ${input.productName}.`,
    retargeting: `⏳ Dernières pièces disponibles pour ${input.productName} !`,
  };

  const hook = hooks[input.goal];
  const priceLine = oldPrice
    ? `💰 Prix promo : ${displayPrice} au lieu de ${oldPrice}${pct ? ` (-${pct}%)` : ""}`
    : `💰 Prix : ${displayPrice}`;

  const fbLines = [
    hook,
    "",
    ...bullets.map((b) => `✅ ${b}`),
    ...(bullets.length === 0 ? [`✅ ${mainBenefit}`, `✅ ${secondBenefit}`] : []),
    ...(input.warranty ? [`🛡️ Garantie : ${input.warranty}`] : []),
    ...(offerNote ? [`🎁 ${offerNote}`] : []),
    "",
    priceLine,
    "🚚 Livraison rapide dans les 24 gouvernorats en Tunisie",
    "🤝 Paiement à la livraison — main à main, sans carte bancaire",
    ...(productUrl ? ["", `👉 Commandez ici : ${productUrl}`] : []),
  ];

  const baseTag = (input.categoryName || "shopping")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 22);
  const storeTag = store
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "");

  const fbHashtags = [
    `#${storeTag || "MaisonNoura"}`,
    `#${baseTag || "BoutiqueTunisie"}`,
    "#Tunisie",
    "#PaiementALaLivraison",
    "#LivraisonTunisie",
    ...(pct ? ["#PromoTunisie"] : ["#Nouveaute"]),
  ];

  const igHashtags = [
    ...fbHashtags,
    "#Tunis",
    "#Sousse",
    "#Sfax",
    "#ShoppingTunisie",
    "#IdeeCadeau",
    "#Qualite",
  ];

  const igCaption = [
    hook,
    "",
    `${mainBenefit}.`,
    ...(offerNote ? [`✨ ${offerNote}`] : []),
    "",
    priceLine,
    "📦 Livraison partout en Tunisie (24 gouvernorats)",
    "💵 Paiement à la réception",
    "",
    "📩 Commandez via le lien en bio ou écrivez-nous en DM !",
  ].join("\n");

  const nameAr = input.productNameAr?.trim() || input.productName;
  const priceAr =
    input.promoPrice != null && input.promoPrice < input.price
      ? `${input.promoPrice.toFixed(input.promoPrice % 1 === 0 ? 0 : 3)} د.ت بدل ${input.price.toFixed(input.price % 1 === 0 ? 0 : 3)} د.ت`
      : `${input.price.toFixed(input.price % 1 === 0 ? 0 : 3)} د.ت`;

  return {
    facebook: {
      hook,
      body: fbLines.join("\n"),
      cta: "Commandez maintenant — Paiement à la livraison",
      hashtags: fbHashtags,
    },
    instagram: {
      caption: igCaption,
      hashtags: igHashtags,
      story_slides: [
        pct ? `🔥 -${pct}% sur ${input.productName}` : `✨ Zoom sur ${input.productName}`,
        `${mainBenefit} • ${displayPrice}`,
        `🚚 Livraison 24 gouvernorats — Paiement à la livraison 👆 Commandez vite !`,
      ],
    },
    ad_copy: {
      primary_text: `${hook}\n\n${mainBenefit}. ${secondBenefit}.${offerNote ? ` ${offerNote}.` : ""}\n\n${priceLine} — Livraison rapide dans toute la Tunisie et paiement à la livraison.`,
      headline: pct
        ? `${input.productName.slice(0, 28)} (-${pct}%)`
        : `${input.productName.slice(0, 34)}`,
      description: "Livraison 24 gouvernorats · Paiement à la livraison",
    },
    video_script: {
      voiceover: `${hook.replace(/[⚡🔥✨🌿⏳]/gu, "").trim()} ${mainBenefit}. Disponible maintenant chez ${store} à ${displayPrice}${oldPrice ? ` au lieu de ${oldPrice}` : ""}. Commandez aujourd'hui et payez simplement à la livraison partout en Tunisie.`,
      music_mood:
        input.tone === "dynamique"
          ? "Beat pop-electro léger et entraînant (115 BPM)"
          : input.tone === "elegant"
            ? "Lo-fi acoustique chic et chaleureux (90 BPM)"
            : "Mélodie solaire acoustique conviviale (100 BPM)",
      scenes: [
        {
          id: "hook",
          durationSec: 3,
          badge: pct
            ? `OFFRE -${pct}%`
            : input.goal === "launch"
              ? "NOUVEAUTÉ"
              : store.toUpperCase().slice(0, 20),
          headline: input.productName.slice(0, 64),
          subtext:
            offerNote ||
            (input.categoryName ? `Collection ${input.categoryName}` : `Sélection ${store}`),
        },
        {
          id: "benefits",
          durationSec: 3,
          badge: "POURQUOI L'ADOPTER",
          headline: mainBenefit.slice(0, 72),
          subtext: secondBenefit.slice(0, 100),
        },
        {
          id: "price_offer",
          durationSec: 3,
          badge: oldPrice ? `AU LIEU DE ${oldPrice}` : "PRIX DIRECT",
          headline: displayPrice,
          subtext: input.warranty
            ? `Garantie ${input.warranty} • En stock`
            : "En stock • Expédition rapide en Tunisie",
        },
        {
          id: "cta",
          durationSec: 3,
          badge: "COMMANDEZ MAINTENANT",
          headline: "Paiement à la livraison",
          subtext: `${store} • Livraison dans les 24 gouvernorats`,
        },
      ],
    },
    arabic:
      input.languages === "fr"
        ? null
        : {
            facebook_post: [
              pct
                ? `🔥 تخفيض -${pct}% على ${nameAr} لفترة محدودة!`
                : `✨ اكتشفوا ${nameAr} من ${store}!`,
              "",
              `💰 السعر: ${priceAr}`,
              ...(offerNote ? [`🎁 ${offerNote}`] : []),
              "🚚 توصيل سريع إلى جميع الولايات الـ24 في تونس",
              "🤝 الدفع عند الاستلام بكل أمان",
              "",
              "📩 اطلب الآن عبر الرابط أو راسلنا في الخاص!",
            ].join("\n"),
            instagram_caption: `${pct ? `🔥 -${pct}%` : "✨ جديد"} ${nameAr} — ${priceAr}\n🚚 توصيل لكل ولايات تونس\n🤝 الدفع عند الاستلام\n📩 للطلب راسلنا في الخاص أو عبر الرابط في البايو!\n\n#تونس #تسوق_اونلاين #الدفع_عند_الاستلام`,
            ad_headline: `${nameAr.slice(0, 32)} — ${priceAr}`,
            video_hook: pct ? `تخفيض -${pct}% على ${nameAr}` : `اكتشفوا ${nameAr}`,
            video_cta: "اطلب الآن — الدفع عند الاستلام",
          },
  };
}

function buildInstructions(input: SocialCampaignInput): string {
  const store = input.storeName?.trim() || "Maison Noura";
  const wantAr = input.languages !== "fr";
  return [
    `Tu es expert en marketing social media et publicité Meta Ads (Facebook & Instagram) pour la boutique tunisienne « ${store} » (prix en dinars tunisiens DT, paiement à la livraison dans les 24 gouvernorats).`,
    "Ton objectif est d'aider le commerçant à publier rapidement des posts et une vidéo publicitaire courte (Reels / Stories / Feed) qui maximisent les ventes.",
    `Objectif de campagne : ${GOAL_LABELS[input.goal]}.`,
    `Ton souhaité : ${TONE_LABELS[input.tone]}.`,
    "Règles strictes :",
    "- Utilise UNIQUEMENT les informations réelles du produit (nom, prix, promo, caractéristiques, garantie). N'invente jamais de fausse spécification.",
    "- Texte prêt à copier-coller directement sur Facebook et Instagram (pas de Markdown ** ou ##).",
    "- Les 4 scènes de `video_script.scenes` doivent avoir exactement les IDs dans cet ordre : 'hook', 'benefits', 'price_offer', 'cta' avec durationSec = 3.",
    "- Les titres de chaque scène vidéo (`headline`) doivent être courts, percutants et lisibles sur mobile (max 55 caractères).",
    "- Mets en avant le paiement à la livraison (COD) et la livraison en Tunisie comme arguments de confiance.",
    wantAr
      ? "- Remplis l'objet `arabic` avec un arabe moderne fluide et vendeur adapté au public tunisien."
      : "- Retourne `arabic: null`.",
  ].join("\n");
}

function buildPrompt(input: SocialCampaignInput): string {
  const lines = [
    `Produit : ${input.productName}`,
    ...(input.productNameAr ? [`Nom en arabe : ${input.productNameAr}`] : []),
    ...(input.categoryName ? [`Catégorie : ${input.categoryName}`] : []),
    ...(input.brand ? [`Marque : ${input.brand}`] : []),
    `Prix normal : ${formatPrice(input.price)}`,
    ...(input.promoPrice != null && input.promoPrice < input.price
      ? [
          `Prix promo : ${formatPrice(input.promoPrice)} (-${discountPercent(input.price, input.promoPrice)}%)`,
        ]
      : []),
    ...(input.warranty ? [`Garantie : ${input.warranty}`] : []),
    ...(input.customOffer ? [`Offre / consigne spéciale : ${input.customOffer}`] : []),
    ...(input.storeUrl && input.productSlug
      ? [`Lien produit : ${input.storeUrl.replace(/\/+$/, "")}/product/${input.productSlug}`]
      : []),
    ...(input.description ? [`Description & caractéristiques :\n${input.description}`] : []),
  ];
  return lines.join("\n");
}

export async function generateSocialCampaign(
  input: SocialCampaignInput,
): Promise<SocialCampaignResponse> {
  const apiKey = openAiApiKey();
  if (!apiKey) {
    // Graceful instant fallback so the studio & video generator work even before OPENAI_API_KEY is set.
    return { ok: true, source: "smart_template", data: buildSmartFallback(input) };
  }

  const provider = createOpenAI({ apiKey });
  let streamError: unknown;

  try {
    const result = streamText({
      model: provider.responses(aiModel()),
      instructions: buildInstructions(input),
      messages: [{ role: "user", content: buildPrompt(input) }],
      output: Output.object({ schema: socialCampaignResultSchema }),
      maxRetries: 0,
      onError: ({ error }) => {
        streamError = error;
      },
      providerOptions: {
        openai: { store: false },
      },
    });

    const output = await result.output;
    const parsed = socialCampaignResultSchema.parse(output);
    return { ok: true, source: "openai", data: parsed };
  } catch (error) {
    const err = streamError ?? error;
    console.error("[ai-social] OpenAI generation failed, falling back to smart template", err);
    if (APICallError.isInstance(err) && err.statusCode === 429) {
      return {
        ok: false,
        code: "rate_limited",
        error: "Trop de requêtes IA en même temps. Patientez quelques secondes puis réessayez.",
      };
    }
    if (NoObjectGeneratedError.isInstance(err)) {
      return { ok: true, source: "smart_template", data: buildSmartFallback(input) };
    }
    return { ok: true, source: "smart_template", data: buildSmartFallback(input) };
  }
}
