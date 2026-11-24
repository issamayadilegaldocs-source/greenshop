import { z } from "zod";

export const SOCIAL_GOALS = ["flash_sale", "launch", "storytelling", "retargeting"] as const;
export type SocialGoal = (typeof SOCIAL_GOALS)[number];

export const SOCIAL_TONES = ["dynamique", "elegant", "chaleureux"] as const;
export type SocialTone = (typeof SOCIAL_TONES)[number];

export const SOCIAL_LANGUAGES = ["both", "fr", "ar"] as const;
export type SocialLanguage = (typeof SOCIAL_LANGUAGES)[number];

export const VIDEO_FORMATS = ["9:16", "1:1"] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const socialCampaignInputSchema = z.object({
  productName: z.string().trim().min(2).max(200),
  productNameAr: z.string().trim().max(200).optional().nullable(),
  productSlug: z.string().trim().max(200).optional().nullable(),
  categoryName: z.string().trim().max(160).optional().nullable(),
  brand: z.string().trim().max(100).optional().nullable(),
  price: z.number().min(0).max(1_000_000),
  promoPrice: z.number().min(0).max(1_000_000).optional().nullable(),
  warranty: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(3000).optional().nullable(),
  storeName: z.string().trim().max(120).optional().nullable(),
  storeUrl: z.string().trim().max(300).optional().nullable(),
  goal: z.enum(SOCIAL_GOALS).default("flash_sale"),
  tone: z.enum(SOCIAL_TONES).default("dynamique"),
  languages: z.enum(SOCIAL_LANGUAGES).default("both"),
  customOffer: z.string().trim().max(300).optional().nullable(),
});

export type SocialCampaignInputRaw = z.input<typeof socialCampaignInputSchema>;
export type SocialCampaignInput = z.output<typeof socialCampaignInputSchema>;

export const videoSceneSchema = z.object({
  id: z.enum(["hook", "benefits", "price_offer", "cta"]),
  durationSec: z.number().min(2).max(6),
  badge: z.string().max(48),
  headline: z.string().max(90),
  subtext: z.string().max(140),
});

export type VideoScene = z.infer<typeof videoSceneSchema>;

export const socialCampaignResultSchema = z.object({
  facebook: z.object({
    hook: z.string(),
    body: z.string(),
    cta: z.string(),
    hashtags: z.array(z.string()),
  }),
  instagram: z.object({
    caption: z.string(),
    hashtags: z.array(z.string()),
    story_slides: z.array(z.string()).min(3).max(4),
  }),
  ad_copy: z.object({
    primary_text: z.string(),
    headline: z.string(),
    description: z.string(),
  }),
  video_script: z.object({
    voiceover: z.string(),
    music_mood: z.string(),
    scenes: z.array(videoSceneSchema).length(4),
  }),
  arabic: z
    .object({
      facebook_post: z.string(),
      instagram_caption: z.string(),
      ad_headline: z.string(),
      video_hook: z.string(),
      video_cta: z.string(),
    })
    .nullable(),
});

export type SocialCampaignResult = z.infer<typeof socialCampaignResultSchema>;

export type SocialCampaignResponse =
  | { ok: true; source: "openai" | "smart_template"; data: SocialCampaignResult }
  | {
      ok: false;
      code:
        "forbidden" | "config" | "credits" | "denied" | "rate_limited" | "unavailable" | "failed";
      error: string;
    };
