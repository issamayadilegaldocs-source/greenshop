import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateText, Output } from "ai";
import type { ResolvedAiConfig } from "./config.server";
import {
  photoProductDraftSchema,
  type MarketingPhotoInput,
  type MarketingPhotoResponse,
  type PhotoAnalyzeInput,
  type PhotoAnalyzeResponse,
  type PhotoProductDraft,
} from "../ai-photo-product.schema";

function slugifySafe(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function cleanText(text: string, max: number): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .trim()
    .slice(0, max);
}

function parseDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string; ext: string } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Format d'image invalide.");
  const mimeType = match[1]!;
  const bytes = Uint8Array.from(Buffer.from(match[2]!, "base64"));
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return { bytes, mimeType, ext };
}

export async function analyzePhotoToProduct(
  input: PhotoAnalyzeInput,
  config: ResolvedAiConfig,
): Promise<PhotoAnalyzeResponse> {
  if (!config.openaiApiKey) {
    return {
      ok: false,
      code: "not_configured",
      error:
        "Clé API OpenAI non configurée. Rendez-vous dans Paramètres → Configuration IA pour saisir votre clé OpenAI (sk-...).",
    };
  }

  const provider = createOpenAI({ apiKey: config.openaiApiKey });
  const catList = input.categories.map((c) => `- ${c.id} : ${c.label}`).join("\n");

  const systemPrompt = [
    "Tu es un directeur e-commerce expert pour Maison Noura (boutique en ligne en Tunisie, prix en Dinars Tunisiens DT, paiement à la livraison).",
    "À partir de la photo d'un produit envoyée par l'administrateur (et d'éventuelles notes), génère une fiche produit complète, vendeuse et prête à publier en Français et en Arabe.",
    "Règles strictes :",
    "- name_fr : nom commercial élégant et clair en français (3 à 8 mots).",
    "- name_ar : nom naturel et élégant en arabe standard moderne.",
    "- slug : identifiant URL propre en minuscules avec tirets sans accents.",
    "- sku : code référence court en MAJUSCULES (ex: MN-ROBE-01, MN-AUDIO-12).",
    "- category_id : choisis UNIQUEMENT l'UUID exact de la catégorie la plus pertinente dans la liste fournie (ou null si aucune ne convient).",
    "- brand : marque visible sur le produit ou 'Maison Noura' si produit sans marque visible.",
    "- model : nom de modèle court si pertinent, sinon null.",
    "- warranty : ex '12 mois' pour électronique/électroménager, null pour vêtements.",
    "- suggested_price_tnd : prix de vente réaliste sur le marché tunisien en DT (nombre entier ou décimal).",
    "- suggested_promo_price_tnd : prix promo optionnel légèrement inférieur au prix normal, ou null.",
    "- description_fr : 120 à 180 mots en français soigné, texte brut sans Markdown (pas de ** ni #), paragraphes séparés par une ligne vide, puces commençant par « • ». Mentionne la livraison partout en Tunisie (24 gouvernorats) et le paiement à la livraison.",
    "- description_ar : 90 à 150 mots en arabe moderne naturel et fluide (pas une traduction mot à mot), texte brut sans Markdown, puces « • ».",
    "- studio_photo_prompt : prompt en anglais décrivant une photo studio e-commerce haut de gamme de CE produit exact sur fond clair chaud minimaliste (marbre/lin), éclairage doux naturel, sans texte ni logo ajouté.",
    "- lifestyle_photo_prompt : prompt en anglais décrivant une scène lifestyle lumineuse où une personne souriante porte ou utilise naturellement CE produit exact dans un cadre méditerranéen moderne ensoleillé, style photo publicitaire Instagram, sans texte ni filigrane.",
  ].join("\n");

  const userPrompt = [
    "Analyse cette photo produit et remplis toute la fiche produit.",
    ...(input.hint?.trim() ? [`Notes de l'administrateur : ${input.hint.trim()}`] : []),
    "",
    "Liste des catégories disponibles (UUID : chemin) :",
    catList || "(aucune catégorie)",
  ].join("\n");

  try {
    const { output } = await generateText({
      model: provider.chat(config.aiModel),
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: input.imageDataUrl },
            { type: "text", text: userPrompt },
          ],
        },
      ],
      output: Output.object({ schema: photoProductDraftSchema }),
      maxRetries: 0,
    });

    const validCatIds = new Set(input.categories.map((c) => c.id));
    const parsed: PhotoProductDraft = {
      ...output,
      name_fr: cleanText(output.name_fr, 160),
      name_ar: cleanText(output.name_ar, 160),
      slug: slugifySafe(output.slug || output.name_fr) || `produit-${Date.now().toString(36)}`,
      sku: output.sku
        .toUpperCase()
        .replace(/[^A-Z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60),
      category_id:
        output.category_id && validCatIds.has(output.category_id)
          ? output.category_id
          : (input.categories[0]?.id ?? null),
      brand: output.brand?.trim() ? output.brand.trim().slice(0, 80) : null,
      model: output.model?.trim() ? output.model.trim().slice(0, 80) : null,
      warranty: output.warranty?.trim() ? output.warranty.trim().slice(0, 80) : null,
      suggested_price_tnd: Math.max(1, Math.round(output.suggested_price_tnd * 100) / 100),
      suggested_promo_price_tnd:
        output.suggested_promo_price_tnd != null &&
        output.suggested_promo_price_tnd > 0 &&
        output.suggested_promo_price_tnd < output.suggested_price_tnd
          ? Math.round(output.suggested_promo_price_tnd * 100) / 100
          : null,
      description_fr: cleanText(output.description_fr, 5000),
      description_ar: cleanText(output.description_ar, 5000),
      studio_photo_prompt: output.studio_photo_prompt.trim().slice(0, 800),
      lifestyle_photo_prompt: output.lifestyle_photo_prompt.trim().slice(0, 800),
    };

    return { ok: true, source: "openai", data: parsed };
  } catch (err) {
    console.error("[ai-photo-product] analyze failed:", err);
    if (APICallError.isInstance(err)) {
      if (err.statusCode === 401) {
        return {
          ok: false,
          code: "not_configured",
          error: "Clé API OpenAI invalide (401). Vérifiez-la dans Paramètres → Configuration IA.",
        };
      }
      if (err.statusCode === 429) {
        return {
          ok: false,
          code: "rate_limited",
          error: "Quota OpenAI atteint ou trop de requêtes (429). Vérifiez vos crédits OpenAI.",
        };
      }
    }
    return {
      ok: false,
      code: "failed",
      error:
        "Impossible d'analyser cette photo avec OpenAI. Vérifiez la clé API et le modèle choisi (ex. gpt-4o-mini).",
    };
  }
}

export async function generateProductMarketingPhoto(
  input: MarketingPhotoInput,
  config: ResolvedAiConfig,
): Promise<MarketingPhotoResponse> {
  if (!config.openaiApiKey) {
    return {
      ok: false,
      code: "not_configured",
      error:
        "Clé API OpenAI non configurée. Ajoutez votre clé OpenAI dans Paramètres → Configuration IA pour générer des photos marketing.",
    };
  }

  const defaultPrompt =
    input.style === "studio"
      ? `Transform this exact product ("${input.productName}") into an ultra-clean luxury e-commerce studio packshot photo. Keep the product's exact design, shape, colors, and details completely faithful. Place it on a warm off-white minimalist linen and travertine stone pedestal with soft natural directional studio daylight, subtle realistic shadow, crisp focus, high-end editorial aesthetic. No text, no price tags, no watermarks.`
      : `Create an authentic, bright Mediterranean lifestyle commercial photograph showing a stylish smiling person naturally wearing or using this exact product ("${input.productName}") in a sunlit modern home or terrace. Preserve the exact appearance, color, and proportions of the product from the reference image. Editorial photography, natural golden daylight, shallow depth of field, warm refined tones. No text, no watermarks.`;

  const prompt = input.customPrompt?.trim() || defaultPrompt;
  const imageModel = config.imageModel || "gpt-image-1";

  try {
    const { bytes, mimeType, ext } = parseDataUrl(input.imageDataUrl);
    const form = new FormData();
    form.append("model", imageModel);
    form.append("prompt", prompt);
    form.append("size", "1024x1024");
    form.append("quality", "medium");
    form.append(
      "image",
      new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }),
      `product.${ext}`,
    );

    const editRes = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: form,
    });

    if (editRes.ok) {
      const json = (await editRes.json()) as {
        data?: { b64_json?: string; url?: string }[];
      };
      const first = json.data?.[0];
      if (first?.b64_json) {
        return {
          ok: true,
          style: input.style,
          imageDataUrl: `data:image/png;base64,${first.b64_json}`,
          mimeType: "image/png",
        };
      }
      if (first?.url) {
        const imgRes = await fetch(first.url);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const ct = imgRes.headers.get("content-type") || "image/png";
          return {
            ok: true,
            style: input.style,
            imageDataUrl: `data:${ct};base64,${buf.toString("base64")}`,
            mimeType: ct,
          };
        }
      }
    } else {
      const errBody = (await editRes.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      console.error("[ai-photo-product] OpenAI image edit error:", editRes.status, errBody);
      if (editRes.status === 401) {
        return {
          ok: false,
          code: "not_configured",
          error: "Clé API OpenAI invalide (401).",
        };
      }
      if (editRes.status === 429) {
        return {
          ok: false,
          code: "rate_limited",
          error: "Limite OpenAI atteinte (429). Vérifiez vos crédits ou réessayez plus tard.",
        };
      }
      return {
        ok: false,
        code: "failed",
        error:
          errBody.error?.message ||
          `Erreur génération d'image OpenAI (${editRes.status}). Vérifiez que votre compte OpenAI a accès à ${imageModel}.`,
      };
    }

    return {
      ok: false,
      code: "failed",
      error: "Aucune image renvoyée par OpenAI.",
    };
  } catch (err) {
    console.error("[ai-photo-product] image generation exception:", err);
    return {
      ok: false,
      code: "failed",
      error: "Échec de génération de la photo marketing. Réessayez dans un instant.",
    };
  }
}
