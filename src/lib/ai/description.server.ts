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
    "Tu es rédacteur e-commerce pour Maison Noura, une marque de mode tunisienne (paiement à la livraison uniquement, prix en dinars tunisiens).",
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
    return {
      ok: false,
      code: "config",
      error:
        "Le service IA n'est pas configuré : ajoutez OPENAI_API_KEY aux variables d'environnement du serveur.",
    };
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
      return {
        ok: false,
        code: "empty",
        error:
          "Aucune description n'a été produite. Ajoutez plus de caractéristiques puis réessayez.",
      };
    }
    return { ok: true, data };
  } catch (error) {
    const err = streamError ?? error;
    console.error("[ai-description] generation failed", err);
    if (APICallError.isInstance(err)) {
      let safe = "";
      try {
        const body = JSON.parse(err.responseBody ?? "{}") as {
          message?: string;
          error?: { message?: string };
        };
        safe = body.message ?? body.error?.message ?? "";
      } catch {
        /* ignore */
      }
      return errorFromStatus(err.statusCode, safe);
    }
    if (NoObjectGeneratedError.isInstance(err)) {
      return {
        ok: false,
        code: "failed",
        error: "La réponse de l'IA était incomplète. Réessayez.",
      };
    }
    return errorFromStatus(undefined, "");
  }
}
