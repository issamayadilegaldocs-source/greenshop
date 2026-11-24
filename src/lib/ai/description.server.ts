import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";
import { aiModel, openAiApiKey } from "@/integrations/supabase/secrets.server";
import type {
  DescriptionInput,
  DescriptionResult,
  DescriptionResponse,
} from "../ai-description.schema";

const LENGTH_HINT: Record<string, string> = {
  short: "entre 40 et 70 mots",
  medium: "entre 100 et 160 mots",
  long: "entre 180 et 280 mots",
};

const outputSchema = z.object({
  description_fr: z.string().nullable(),
  description_ar: z.string().nullable(),
  summary_fr: z.string().nullable(),
  summary_ar: z.string().nullable(),
});

export type TemplateForPrompt = { name: string; instructions: string; target_length: string };

function buildInstructions(template: TemplateForPrompt, input: DescriptionInput) {
  const wantFr = input.languages !== "ar";
  const wantAr = input.languages !== "fr";
  return [
    "Tu es rédacteur e-commerce pour Maison Noura, une boutique tunisienne (mode, audio, petit électroménager et maison — paiement à la livraison uniquement, prix en dinars tunisiens).",
    "Tu rédiges des descriptions produit prêtes à publier, à partir UNIQUEMENT des informations fournies.",
    "Règles strictes :",
    "- N'invente aucune caractéristique, chiffre, matière, certification ou garantie qui n'est pas fournie.",
    "- N'écris jamais de formules comme « selon les informations fournies » ou « conformément aux données » : écris comme un vendeur confiant qui connaît son produit.",
    "- Ne mentionne jamais de prix, de promotion, de stock ni de paiement en ligne.",
    "- Texte brut uniquement : pas de Markdown (pas de #, pas de **). Paragraphes séparés par une ligne vide. Puces en commençant la ligne par « • ».",
    `- Longueur visée pour chaque description : ${LENGTH_HINT[template.target_length] ?? LENGTH_HINT["medium"]}.`,
    "- summary_* : une phrase d'accroche de 160 caractères maximum, utilisable comme résumé ou méta-description.",
    wantFr
      ? "- description_fr et summary_fr : en français soigné."
      : "- description_fr et summary_fr : null.",
    wantAr
      ? "- description_ar et summary_ar : en arabe standard moderne clair, adapté à un public tunisien ; garde les noms de marque et de modèle en caractères latins. Ce n'est pas une traduction mot à mot : rédige naturellement."
      : "- description_ar et summary_ar : null.",
    "",
    `Modèle de rédaction à suivre : « ${template.name} »`,
    template.instructions,
  ].join("\n");
}

function buildFallbackDescription(
  template: TemplateForPrompt,
  input: DescriptionInput,
): DescriptionResult {
  const wantFr = input.languages !== "ar";
  const wantAr = input.languages !== "fr";
  const name = input.productName.trim();
  const brandModel = [input.brand, input.model].filter(Boolean).join(" — ");
  const isShort = template.target_length === "short";
  const isLong = template.target_length === "long";

  let description_fr: string | null = null;
  let summary_fr: string | null = null;
  if (wantFr) {
    const introParts = [
      brandModel
        ? `${name} (${brandModel}) a été sélectionné pour accompagner votre quotidien avec style et fiabilité.`
        : `${name} a été pensé pour allier praticité, esthétique soignée et confort au quotidien.`,
    ];
    if (input.categoryPath && !isShort) {
      introParts.push(
        `Issu de notre sélection ${input.categoryPath}, il s'intègre facilement à votre routine.`,
      );
    }
    if (input.audience) {
      introParts.push(`Idéal pour : ${input.audience}.`);
    }

    const bullets: string[] = [];
    for (const attr of input.attributes.slice(0, isShort ? 3 : 8)) {
      bullets.push(`• ${attr.label} : ${attr.value}`);
    }
    if (input.highlights) {
      for (const line of input.highlights
        .split(/\r?\n/)
        .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, isShort ? 2 : 5)) {
        bullets.push(`• ${line}`);
      }
    }
    if (input.warranty) {
      bullets.push(`• Garantie : ${input.warranty}`);
    }

    const paragraphs: string[] = [introParts.join(" ")];
    if (bullets.length > 0) {
      paragraphs.push(bullets.join("\n"));
    }
    if (isLong) {
      paragraphs.push(
        "Chaque détail est pensé pour vous offrir une prise en main simple et une belle tenue dans le temps.",
      );
    }
    paragraphs.push(
      "Livraison rapide partout dans les 24 gouvernorats en Tunisie, avec paiement à la livraison en toute sérénité.",
    );

    description_fr = clean(paragraphs.join("\n\n"), 5000);
    summary_fr = clean(
      brandModel
        ? `${name} (${brandModel}) — livraison dans toute la Tunisie avec paiement à la réception.`
        : `${name} — sélectionné par Maison Noura, livré partout en Tunisie avec paiement à la livraison.`,
      160,
    );
  }

  let description_ar: string | null = null;
  let summary_ar: string | null = null;
  if (wantAr) {
    const introAr = brandModel
      ? `يجمع ${name} (${brandModel}) بين الجودة العالية والتصميم الأنيق ليناسب استخدامك اليومي بكل راحة.`
      : `تم اختيار ${name} بعناية ليمنحك جودة موثوقة وتصميماً عملياً يناسب يومك.`;

    const bulletsAr: string[] = [];
    for (const attr of input.attributes.slice(0, isShort ? 3 : 8)) {
      bulletsAr.push(`• ${attr.label}: ${attr.value}`);
    }
    if (input.highlights) {
      for (const line of input.highlights
        .split(/\r?\n/)
        .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, isShort ? 2 : 5)) {
        bulletsAr.push(`• ${line}`);
      }
    }
    if (input.warranty) {
      bulletsAr.push(`• الضمان: ${input.warranty}`);
    }

    const partsAr: string[] = [introAr];
    if (input.audience && !isShort) {
      partsAr.push(`مثالي لـ: ${input.audience}.`);
    }
    if (bulletsAr.length > 0) {
      partsAr.push(bulletsAr.join("\n"));
    }
    partsAr.push("توصيل سريع إلى جميع الولايات الـ24 في تونس مع الدفع عند الاستلام.");

    description_ar = clean(partsAr.join("\n\n"), 5000);
    summary_ar = clean(
      `${name}${brandModel ? ` (${brandModel})` : ""} — توصيل إلى جميع أنحاء تونس والدفع عند الاستلام.`,
      160,
    );
  }

  return { description_fr, description_ar, summary_fr, summary_ar };
}

function buildPrompt(input: DescriptionInput) {
  const lines = [`Nom du produit : ${input.productName}`];
  if (input.categoryPath) lines.push(`Catégorie : ${input.categoryPath}`);
  if (input.brand) lines.push(`Marque : ${input.brand}`);
  if (input.model) lines.push(`Modèle : ${input.model}`);
  if (input.warranty) lines.push(`Garantie : ${input.warranty}`);
  if (input.audience) lines.push(`Public visé : ${input.audience}`);
  if (input.attributes.length) {
    lines.push("Caractéristiques :");
    for (const a of input.attributes) lines.push(`- ${a.label} : ${a.value}`);
  }
  if (input.highlights)
    lines.push(`Informations complémentaires de l'administrateur :\n${input.highlights}`);
  return lines.join("\n");
}

function clean(text: string | null, max: number) {
  if (!text) return null;
  const t = text
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .trim();
  return t ? t.slice(0, max) : null;
}

function errorFromStatus(status: number | undefined, fallback: string): DescriptionResponse {
  switch (status) {
    case 402:
      return {
        ok: false,
        code: "credits",
        error:
          "Le compte OpenAI n'a plus de crédits. Ajoutez-en pour continuer à générer des descriptions.",
      };
    case 403:
      return {
        ok: false,
        code: "denied",
        error: fallback || "La génération a été refusée pour ce compte.",
      };
    case 429:
      return {
        ok: false,
        code: "rate_limited",
        error: "Trop de demandes en même temps. Patientez quelques secondes puis réessayez.",
      };
    case 401:
      return {
        ok: false,
        code: "config",
        error: "Le service IA n'est pas configuré correctement (clé API invalide).",
      };
    default:
      if (status && status >= 500)
        return {
          ok: false,
          code: "unavailable",
          error: "Le service IA est momentanément indisponible. Réessayez dans un instant.",
        };
      return {
        ok: false,
        code: "failed",
        error: "La génération n'a pas abouti. Vérifiez les informations saisies puis réessayez.",
      };
  }
}

export async function generateProductDescription(
  template: TemplateForPrompt,
  input: DescriptionInput,
): Promise<DescriptionResponse> {
  const apiKey = openAiApiKey();
  if (!apiKey) {
    return { ok: true, data: buildFallbackDescription(template, input) };
  }

  const provider = createOpenAI({ apiKey });

  let streamError: unknown;
  try {
    const result = streamText({
      model: provider.responses(aiModel()),
      instructions: buildInstructions(template, input),
      messages: [{ role: "user", content: buildPrompt(input) }],
      output: Output.object({ schema: outputSchema }),
      maxRetries: 0,
      onError: ({ error }) => {
        streamError = error;
      },
      providerOptions: {
        openai: { store: false },
      },
    });

    const output = await result.output;
    const finish = await result.finishReason;
    if (finish === "content-filter") {
      return {
        ok: false,
        code: "refused",
        error:
          "Le service IA a refusé de rédiger cette description. Modifiez les informations du produit.",
      };
    }
    const data: DescriptionResult = {
      description_fr: input.languages === "ar" ? null : clean(output.description_fr, 5000),
      description_ar: input.languages === "fr" ? null : clean(output.description_ar, 5000),
      summary_fr: input.languages === "ar" ? null : clean(output.summary_fr, 200),
      summary_ar: input.languages === "fr" ? null : clean(output.summary_ar, 200),
    };
    if (!data.description_fr && !data.description_ar) {
      return { ok: true, data: buildFallbackDescription(template, input) };
    }
    return { ok: true, data };
  } catch (error) {
    const err = streamError ?? error;
    console.error("[ai-description] OpenAI failed, using smart template fallback", err);
    if (APICallError.isInstance(err) && err.statusCode === 429) {
      return errorFromStatus(429, "");
    }
    if (NoObjectGeneratedError.isInstance(err)) {
      return { ok: true, data: buildFallbackDescription(template, input) };
    }
    return { ok: true, data: buildFallbackDescription(template, input) };
  }
}
