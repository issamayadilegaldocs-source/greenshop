import { z } from "zod";
import {
  falApiKey as envFalApiKey,
  replicateApiToken as envReplicateApiToken,
} from "@/integrations/supabase/secrets.server";
import type { ResolvedAiConfig } from "./config.server";

export const aiVideoStartSchema = z.object({
  productName: z.string().trim().min(2).max(200),
  categoryName: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().max(1500).optional().nullable(),
  imageUrl: z.string().trim().max(1000).optional().nullable(),
  aspectRatio: z.enum(["9:16", "1:1"]).default("9:16"),
  customPrompt: z.string().trim().max(1200).optional().nullable(),
});

export type AiVideoStartInput = z.output<typeof aiVideoStartSchema>;
export type AiVideoStartRaw = z.input<typeof aiVideoStartSchema>;

export const aiVideoPollSchema = z.object({
  provider: z.enum(["fal", "replicate"]),
  statusUrl: z.string().url().max(600),
  responseUrl: z.string().url().max(600).optional().nullable(),
});

export type AiVideoPollInput = z.output<typeof aiVideoPollSchema>;

export type AiVideoStartResponse =
  | {
      ok: true;
      provider: "fal" | "replicate";
      statusUrl: string;
      responseUrl: string | null;
      prompt: string;
    }
  | {
      ok: false;
      code: "forbidden" | "not_configured" | "failed";
      prompt: string;
      error: string;
    };

export type AiVideoPollResponse =
  | { ok: true; status: "processing" }
  | { ok: true; status: "completed"; videoUrl: string }
  | { ok: false; error: string };

/** Build a cinematic lifestyle prompt showing a real person wearing/using the product. */
export function buildLifestyleVideoPrompt(input: AiVideoStartInput): string {
  if (input.customPrompt?.trim()) return input.customPrompt.trim();
  const cat = (input.categoryName ?? "").toLowerCase();
  const name = input.productName;

  let sceneAction = `A smiling stylish person naturally using and showcasing "${name}" in a bright sunlit modern Mediterranean home`;
  if (
    /robe|femme|chemise|veste|t-shirt|sweat|homme|essentiel|mode/.test(cat) ||
    /robe|chemise|sweat|t-shirt/i.test(name)
  ) {
    sceneAction = `A confident smiling young Mediterranean model walking naturally in golden-hour sunlight on a whitewashed terrace wearing "${name}", soft breeze moving the fabric, natural candid movements`;
  } else if (
    /audio|casque|écouteur|ecouteur|enceinte|son/.test(cat) ||
    /casque|écouteur|enceinte/i.test(name)
  ) {
    sceneAction = `A smiling young person relaxing in a bright sunlit modern café wearing and enjoying "${name}", gently nodding to the rhythm with a relaxed happy expression, smooth handheld camera orbit`;
  } else if (
    /électroménager|electromenager|café|cafe|cuisine/.test(cat) ||
    /espresso|bouilloire|friteuse|airpure/i.test(name)
  ) {
    sceneAction = `Close-up lifestyle commercial shot of a smiling person using "${name}" in a bright minimalist sunlit morning kitchen, authentic hands-on interaction, appetizing warm steam and natural daylight`;
  } else if (/maison|déco|deco|luminaire|table/.test(cat) || /lampe|mug/i.test(name)) {
    sceneAction = `Warm cozy lifestyle commercial shot of a person enjoying "${name}" in a serene sunlit living room, gentle hand interaction and soft ambient golden light`;
  }

  return `${sceneAction}. Commercial Instagram Reels cinematography, smooth natural human motion, shallow depth of field, warm editorial color grading, 4K realistic video, no text overlays, no watermarks.`;
}

function isPublicHttpsUrl(url?: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      !parsed.hostname.includes("localhost") &&
      !parsed.hostname.startsWith("127.")
    );
  } catch {
    return false;
  }
}

export async function startGenerativeVideo(
  input: AiVideoStartInput,
  config?: ResolvedAiConfig,
): Promise<AiVideoStartResponse> {
  const prompt = buildLifestyleVideoPrompt(input);
  const falKey = config?.falApiKey ?? envFalApiKey();
  const repToken = config?.replicateApiToken ?? envReplicateApiToken();

  if (falKey) {
    try {
      const hasImage = isPublicHttpsUrl(input.imageUrl);
      const endpoint = hasImage
        ? "https://queue.fal.run/fal-ai/kling-video/v2.1/standard/image-to-video"
        : "https://queue.fal.run/fal-ai/kling-video/v2.1/standard/text-to-video";
      const body = hasImage
        ? {
            prompt,
            image_url: input.imageUrl,
            duration: "5",
            aspect_ratio: input.aspectRatio,
          }
        : {
            prompt,
            duration: "5",
            aspect_ratio: input.aspectRatio,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Key ${falKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[ai-video] fal.ai error:", res.status, text);
        return {
          ok: false,
          code: "failed",
          prompt,
          error: `Le moteur vidéo fal.ai a renvoyé une erreur (${res.status}). Vérifiez votre clé FAL_KEY et votre solde.`,
        };
      }
      const data = (await res.json()) as { status_url?: string; response_url?: string };
      if (!data.status_url || !data.response_url) {
        return {
          ok: false,
          code: "failed",
          prompt,
          error: "Réponse inattendue du moteur vidéo fal.ai.",
        };
      }
      return {
        ok: true,
        provider: "fal",
        statusUrl: data.status_url,
        responseUrl: data.response_url,
        prompt,
      };
    } catch (err) {
      console.error("[ai-video] fal.ai request failed", err);
      return {
        ok: false,
        code: "failed",
        prompt,
        error: "Impossible de contacter fal.ai. Réessayez dans un instant.",
      };
    }
  }

  if (repToken) {
    try {
      const hasImage = isPublicHttpsUrl(input.imageUrl);
      const res = await fetch(
        "https://api.replicate.com/v1/models/kwaivgi/kling-v2.1/predictions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${repToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: {
              prompt,
              duration: 5,
              aspect_ratio: input.aspectRatio,
              ...(hasImage ? { start_image: input.imageUrl } : {}),
            },
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[ai-video] Replicate error:", res.status, text);
        return {
          ok: false,
          code: "failed",
          prompt,
          error: `Replicate a renvoyé une erreur (${res.status}). Vérifiez REPLICATE_API_TOKEN.`,
        };
      }
      const data = (await res.json()) as { urls?: { get?: string } };
      if (!data.urls?.get) {
        return {
          ok: false,
          code: "failed",
          prompt,
          error: "Réponse inattendue de Replicate.",
        };
      }
      return {
        ok: true,
        provider: "replicate",
        statusUrl: data.urls.get,
        responseUrl: null,
        prompt,
      };
    } catch (err) {
      console.error("[ai-video] Replicate request failed", err);
      return {
        ok: false,
        code: "failed",
        prompt,
        error: "Impossible de contacter Replicate. Réessayez dans un instant.",
      };
    }
  }

  return {
    ok: false,
    code: "not_configured",
    prompt,
    error:
      "Pour générer une vraie vidéo IA avec mouvement humain (Kling 2.1), ajoutez FAL_KEY (fal.ai) ou REPLICATE_API_TOKEN dans les variables d'environnement Vercel. En attendant, le studio génère déjà votre Reel Lifestyle complet avec personne en situation !",
  };
}

export async function pollGenerativeVideo(
  input: AiVideoPollInput,
  config?: ResolvedAiConfig,
): Promise<AiVideoPollResponse> {
  if (input.provider === "fal") {
    const falKey = config?.falApiKey ?? envFalApiKey();
    if (!falKey) return { ok: false, error: "FAL_KEY non configurée." };
    if (!input.statusUrl.startsWith("https://queue.fal.run/")) {
      return { ok: false, error: "URL de suivi invalide." };
    }
    const statusRes = await fetch(input.statusUrl, {
      headers: { Authorization: `Key ${falKey}` },
    });
    if (!statusRes.ok) return { ok: false, error: `Erreur suivi fal.ai (${statusRes.status}).` };
    const st = (await statusRes.json()) as { status?: string; error?: string };
    if (st.status === "FAILED") {
      return { ok: false, error: st.error || "La génération vidéo IA a échoué." };
    }
    if (st.status !== "COMPLETED") {
      return { ok: true, status: "processing" };
    }
    const respUrl = input.responseUrl;
    if (!respUrl || !respUrl.startsWith("https://queue.fal.run/")) {
      return { ok: false, error: "URL de résultat invalide." };
    }
    const resultRes = await fetch(respUrl, {
      headers: { Authorization: `Key ${falKey}` },
    });
    if (!resultRes.ok) return { ok: false, error: "Impossible de récupérer la vidéo générée." };
    const payload = (await resultRes.json()) as { video?: { url?: string } };
    if (!payload.video?.url) return { ok: false, error: "Aucune URL vidéo renvoyée." };
    return { ok: true, status: "completed", videoUrl: payload.video.url };
  }

  const repToken = config?.replicateApiToken ?? envReplicateApiToken();
  if (!repToken) return { ok: false, error: "REPLICATE_API_TOKEN non configurée." };
  if (!input.statusUrl.startsWith("https://api.replicate.com/v1/")) {
    return { ok: false, error: "URL de suivi Replicate invalide." };
  }
  const res = await fetch(input.statusUrl, {
    headers: { Authorization: `Bearer ${repToken}` },
  });
  if (!res.ok) return { ok: false, error: `Erreur suivi Replicate (${res.status}).` };
  const data = (await res.json()) as {
    status?: string;
    output?: string | string[];
    error?: string;
  };
  if (data.status === "failed" || data.status === "canceled") {
    return { ok: false, error: data.error || "La génération vidéo IA a échoué." };
  }
  if (data.status !== "succeeded") {
    return { ok: true, status: "processing" };
  }
  const videoUrl = Array.isArray(data.output) ? data.output[0] : data.output;
  if (!videoUrl) return { ok: false, error: "Aucune vidéo renvoyée par Replicate." };
  return { ok: true, status: "completed", videoUrl };
}
