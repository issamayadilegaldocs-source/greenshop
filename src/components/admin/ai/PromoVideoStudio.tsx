import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Clapperboard,
  Copy,
  Download,
  Film,
  ImageDown,
  Loader2,
  Pause,
  Play,
  RectangleVertical,
  Sparkles,
  Square,
  Upload,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { VideoFormat, VideoScene } from "@/lib/ai-social.schema";
import { pollAiProductVideo, startAiProductVideo } from "@/lib/ai-video.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Built-in 9:16 lifestyle scenes showing real people wearing/using catalog products. */
const PRODUCT_LIFESTYLE_MEDIA: Record<string, string> = {
  "robe-ete-fleurie": "/demo/lifestyle/robe-ete-fleurie.jpg",
  "sweat-capuche-molleton": "/demo/lifestyle/sweat-capuche-molleton.jpg",
  "enceinte-brise-mini": "/demo/lifestyle/enceinte-brise-mini.jpg",
  "friteuse-airpure": "/demo/lifestyle/friteuse-airpure.jpg",
};

type CaptionStyleId = "cinema" | "editorial" | "bold";

const CAPTION_STYLES: Record<
  CaptionStyleId,
  {
    id: CaptionStyleId;
    labelFr: string;
    labelAr: string;
    accentBg: string;
    accentText: string;
    ctaBg: string;
    ctaText: string;
    swatch: string;
  }
> = {
  cinema: {
    id: "cinema",
    labelFr: "Cinéma Reels",
    labelAr: "سينما ريلز",
    accentBg: "#d4a84f",
    accentText: "#131c17",
    ctaBg: "#1f4d3a",
    ctaText: "#ffffff",
    swatch: "#1f4d3a",
  },
  editorial: {
    id: "editorial",
    labelFr: "Éditorial Chic",
    labelAr: "أنيق",
    accentBg: "rgba(255, 255, 255, 0.92)",
    accentText: "#18241d",
    ctaBg: "#ffffff",
    ctaText: "#18241d",
    swatch: "#f3efe7",
  },
  bold: {
    id: "bold",
    labelFr: "Promo Flash",
    labelAr: "عرض سريع",
    accentBg: "#e05a3f",
    accentText: "#ffffff",
    ctaBg: "#e05a3f",
    ctaText: "#ffffff",
    swatch: "#e05a3f",
  },
};

function easeOutCubic(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return 1 - Math.pow(1 - c, 3);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function drawCoverMedia(
  ctx: CanvasRenderingContext2D,
  media: HTMLImageElement | HTMLVideoElement,
  canvasW: number,
  canvasH: number,
  zoom: number,
  panXRatio: number,
  panYRatio: number,
) {
  const natW = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const natH = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (!natW || !natH) return;
  const scale = Math.max(canvasW / natW, canvasH / natH) * zoom;
  const drawW = natW * scale;
  const drawH = natH * scale;
  const maxPanX = Math.max(0, (drawW - canvasW) / 2);
  const maxPanY = Math.max(0, (drawH - canvasH) / 2);
  const x = (canvasW - drawW) / 2 + panXRatio * maxPanX;
  const y = (canvasH - drawH) / 2 + panYRatio * maxPanY;
  ctx.drawImage(media, x, y, drawW, drawH);
}

function formatDt(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 3).replace(".", ",")} DT`;
}

function pickRecorderMimeType(): { mimeType: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    { mimeType: "video/mp4;codecs=avc1.42E01E", ext: "mp4" },
    { mimeType: "video/mp4", ext: "mp4" },
    { mimeType: "video/webm;codecs=vp9", ext: "webm" },
    { mimeType: "video/webm;codecs=vp8", ext: "webm" },
    { mimeType: "video/webm", ext: "webm" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: "", ext: "webm" };
}

function defaultAiVideoPrompt(productName: string, categoryName?: string | null): string {
  const cat = (categoryName ?? "").toLowerCase();
  if (/robe|femme|chemise|veste|t-shirt|sweat|homme|essentiel|mode/.test(cat)) {
    return `A smiling young Mediterranean model walking naturally in golden-hour sunlight on a sunlit terrace wearing "${productName}", gentle fabric movement, shallow depth of field, 9:16 Instagram Reels commercial cinematography, 4K realistic motion.`;
  }
  if (/audio|casque|écouteur|ecouteur|enceinte|son/.test(cat)) {
    return `A smiling young person relaxing in a bright sunlit modern café wearing and enjoying "${productName}", gently moving to the rhythm, smooth handheld camera orbit, 9:16 Instagram Reels commercial cinematography, 4K realistic motion.`;
  }
  if (/électroménager|electromenager|café|cafe|cuisine/.test(cat)) {
    return `Close-up lifestyle commercial video of a smiling person using "${productName}" in a bright sunlit modern kitchen, authentic hands-on interaction with warm steam and natural daylight, 9:16 Instagram Reels cinematography, 4K realistic motion.`;
  }
  return `A smiling person naturally using and showcasing "${productName}" in a bright sunlit Mediterranean home, authentic lifestyle motion, shallow depth of field, 9:16 Instagram Reels commercial cinematography, 4K realistic video.`;
}

export type PromoVideoStudioProps = {
  productName: string;
  productSlug: string;
  categoryName?: string | null | undefined;
  description?: string | null | undefined;
  imageUrl: string | null;
  price: number;
  promoPrice: number | null;
  storeName: string;
  scenes: VideoScene[];
  onScenesChange: (scenes: VideoScene[]) => void;
};

export function PromoVideoStudio({
  productName,
  productSlug,
  categoryName,
  description,
  imageUrl,
  price,
  promoPrice,
  storeName,
  scenes,
  onScenesChange,
}: PromoVideoStudioProps) {
  const { tr } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const productImgRef = useRef<HTMLImageElement | null>(null);
  const lifestyleImgRef = useRef<HTMLImageElement | null>(null);
  const customVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mediaVersion, setMediaVersion] = useState(0);
  const [customMedia, setCustomMedia] = useState<{
    kind: "image" | "video";
    url: string;
    name: string;
  } | null>(null);

  const [format, setFormat] = useState<VideoFormat>("9:16");
  const [styleId, setStyleId] = useState<CaptionStyleId>("cinema");
  const [playing, setPlaying] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [selectedSceneIdx, setSelectedSceneIdx] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Generative AI Video (Kling 2.1 / fal.ai / Replicate) state
  const [videoPrompt, setVideoPrompt] = useState(() =>
    defaultAiVideoPrompt(productName, categoryName),
  );
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [aiVideoUrl, setAiVideoUrl] = useState<string | null>(null);
  const [aiVideoNotice, setAiVideoNotice] = useState<string | null>(null);
  const [aiPolling, setAiPolling] = useState(false);

  const builtInLifestyleUrl = PRODUCT_LIFESTYLE_MEDIA[productSlug] ?? null;

  useEffect(() => {
    setVideoPrompt(defaultAiVideoPrompt(productName, categoryName));
    setAiVideoUrl(null);
    setAiVideoNotice(null);
  }, [productName, categoryName, productSlug]);

  const dims = useMemo(
    () => (format === "9:16" ? { w: 720, h: 1280 } : { w: 900, h: 900 }),
    [format],
  );

  const totalDuration = useMemo(
    () => scenes.reduce((sum, s) => sum + Math.max(2, s.durationSec || 3), 0),
    [scenes],
  );

  const discountPct = useMemo(() => {
    if (promoPrice == null || promoPrice <= 0 || promoPrice >= price || price <= 0) return null;
    return Math.round(((price - promoPrice) / price) * 100);
  }, [price, promoPrice]);

  // Load product studio image
  useEffect(() => {
    let active = true;
    productImgRef.current = null;
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!active) return;
      productImgRef.current = img;
      setMediaVersion((v) => v + 1);
    };
    img.src = imageUrl;
    return () => {
      active = false;
    };
  }, [imageUrl]);

  // Load lifestyle-in-use image (custom uploaded image or built-in lifestyle photo)
  const effectiveLifestyleImageUrl =
    customMedia?.kind === "image" ? customMedia.url : builtInLifestyleUrl;

  useEffect(() => {
    let active = true;
    lifestyleImgRef.current = null;
    if (!effectiveLifestyleImageUrl) {
      setMediaVersion((v) => v + 1);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!active) return;
      lifestyleImgRef.current = img;
      setMediaVersion((v) => v + 1);
    };
    img.src = effectiveLifestyleImageUrl;
    return () => {
      active = false;
    };
  }, [effectiveLifestyleImageUrl]);

  // Load real video clip (either uploaded by user OR generated by AI Kling/fal.ai)
  const activeVideoSrc = customMedia?.kind === "video" ? customMedia.url : aiVideoUrl;

  useEffect(() => {
    const prev = customVideoRef.current;
    if (prev) {
      prev.pause();
      customVideoRef.current = null;
    }
    if (!activeVideoSrc) {
      setMediaVersion((v) => v + 1);
      return;
    }
    const vid = document.createElement("video");
    vid.crossOrigin = "anonymous";
    vid.muted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.src = activeVideoSrc;
    vid.onloadeddata = () => {
      customVideoRef.current = vid;
      void vid.play().catch(() => {});
      setMediaVersion((v) => v + 1);
    };
    return () => {
      vid.pause();
      vid.src = "";
    };
  }, [activeVideoSrc]);

  const drawFrame = useCallback(
    (timeSec: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { w, h } = dims;
      const style = CAPTION_STYLES[styleId];
      const isVertical = format === "9:16";
      const safeTotal = Math.max(totalDuration, 1);
      const t = ((timeSec % safeTotal) + safeTotal) % safeTotal;

      // Active scene lookup
      let acc = 0;
      let sceneIdx = 0;
      let localTime = 0;
      let sceneDur = 3;
      for (let i = 0; i < scenes.length; i++) {
        const d = Math.max(2, scenes[i]!.durationSec || 3);
        if (t < acc + d || i === scenes.length - 1) {
          sceneIdx = i;
          localTime = Math.max(0, t - acc);
          sceneDur = d;
          break;
        }
        acc += d;
      }
      const scene = scenes[sceneIdx] ?? scenes[0];
      if (!scene) return;

      const localProgress = Math.min(1, localTime / sceneDur);
      const enter = easeOutCubic(Math.min(1, localTime / 0.5));
      const exit = localTime > sceneDur - 0.3 ? easeOutCubic((sceneDur - localTime) / 0.3) : 1;
      const textAlpha = Math.max(0, Math.min(1, enter * exit));

      // 1. FULL-BLEED CINEMATIC FOOTAGE (real video clip OR lifestyle in-use person photo OR studio product closeup)
      ctx.fillStyle = "#121c16";
      ctx.fillRect(0, 0, w, h);

      const liveVideo =
        customVideoRef.current && customVideoRef.current.readyState >= 2
          ? customVideoRef.current
          : null;
      const lifestyleImg =
        lifestyleImgRef.current && lifestyleImgRef.current.complete
          ? lifestyleImgRef.current
          : null;
      const productImg =
        productImgRef.current && productImgRef.current.complete ? productImgRef.current : null;

      // Choose the shot per scene so it feels like a real multi-cut commercial Reel:
      // Scene 0 (Hook): Full-bleed lifestyle person using/wearing product (slow push-in)
      // Scene 1 (Benefits): Close-up lifestyle pan across person using product
      // Scene 2 (Price/Offer): Full-bleed studio product spotlight zoom-out (or live video)
      // Scene 3 (CTA): Full-bleed lifestyle person enjoying product (gentle pull-back)
      const useProductShot = scene.id === "price_offer" && productImg && !liveVideo;
      const primaryMedia =
        liveVideo ?? (useProductShot ? productImg : (lifestyleImg ?? productImg));

      if (primaryMedia) {
        ctx.save();
        if (liveVideo) {
          const z = 1.02 + 0.04 * Math.sin((t / safeTotal) * Math.PI);
          drawCoverMedia(ctx, liveVideo, w, h, z, 0, 0);
        } else if (sceneIdx === 0) {
          // Smooth push-in on person wearing/using product
          const z = 1.03 + 0.11 * localProgress;
          drawCoverMedia(ctx, primaryMedia, w, h, z, 0, -0.15);
        } else if (sceneIdx === 1) {
          // Cinematic detail pan & tighter framing
          const z = 1.18 + 0.1 * localProgress;
          const panX = -0.35 + 0.7 * localProgress;
          drawCoverMedia(ctx, primaryMedia, w, h, z, panX, -0.05);
        } else if (sceneIdx === 2) {
          // Crisp zoom-out product reveal
          const z = 1.16 - 0.1 * localProgress;
          drawCoverMedia(ctx, primaryMedia, w, h, z, 0, 0);
        } else {
          // Warm pull-back outro on lifestyle scene
          const z = 1.13 - 0.08 * localProgress;
          drawCoverMedia(ctx, primaryMedia, w, h, z, 0.15 * (1 - localProgress), -0.1);
        }
        ctx.restore();
      }

      // 2. Subtle warm sunlight flare / cinema sheen moving gently across the shot
      ctx.save();
      const flareX = w * (0.2 + 0.6 * ((t / safeTotal) % 1));
      const flare = ctx.createRadialGradient(flareX, h * 0.18, 10, flareX, h * 0.18, w * 0.65);
      flare.addColorStop(0, "rgba(255, 240, 200, 0.16)");
      flare.addColorStop(1, "rgba(255, 240, 200, 0)");
      ctx.fillStyle = flare;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // 3. Top & Bottom Cinematic Vignette Gradients (keeps captions super legible like TikTok/Reels)
      const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.22);
      topGrad.addColorStop(0, "rgba(10, 18, 14, 0.62)");
      topGrad.addColorStop(1, "rgba(10, 18, 14, 0)");
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, w, h * 0.22);

      const botGrad = ctx.createLinearGradient(0, h * 0.48, 0, h);
      botGrad.addColorStop(0, "rgba(10, 18, 14, 0)");
      botGrad.addColorStop(0.45, "rgba(10, 18, 14, 0.56)");
      botGrad.addColorStop(1, "rgba(10, 18, 14, 0.88)");
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, h * 0.48, w, h * 0.52);

      // 4. Top Reels Segmented Progress Bar
      const padX = Math.round(w * 0.055);
      const barY = Math.round(h * 0.026);
      const gap = 8;
      const segW = (w - padX * 2 - gap * (scenes.length - 1)) / scenes.length;
      for (let i = 0; i < scenes.length; i++) {
        const sx = padX + i * (segW + gap);
        drawRoundedRect(ctx, sx, barY, segW, 5, 2.5);
        ctx.fillStyle = "rgba(255, 255, 255, 0.32)";
        ctx.fill();
        const ratio = i < sceneIdx ? 1 : i === sceneIdx ? localProgress : 0;
        if (ratio > 0) {
          drawRoundedRect(ctx, sx, barY, segW * ratio, 5, 2.5);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
        }
      }

      // 5. Floating Brand Watermark (top-left) + Flash Promo Badge (top-right)
      const topPillY = barY + 22;
      ctx.font = `700 ${isVertical ? 20 : 22}px "Manrope", system-ui, sans-serif`;
      const brandTxt = storeName.toUpperCase();
      const brandW = ctx.measureText(brandTxt).width + 34;
      drawRoundedRect(ctx, padX, topPillY, brandW, 40, 20);
      ctx.fillStyle = "rgba(15, 24, 19, 0.55)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.26)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(brandTxt, padX + 17, topPillY + 21);

      if (discountPct) {
        const pulse = 1 + 0.04 * Math.sin(t * 7);
        const discTxt = `-${discountPct}%`;
        ctx.save();
        ctx.font = `800 ${isVertical ? 24 : 26}px "Manrope", system-ui, sans-serif`;
        const dw = ctx.measureText(discTxt).width + 34;
        const cx = w - padX - dw / 2;
        const cy = topPillY + 20;
        ctx.translate(cx, cy);
        ctx.scale(pulse, pulse);
        drawRoundedRect(ctx, -dw / 2, -21, dw, 42, 21);
        ctx.fillStyle = style.accentBg;
        ctx.fill();
        ctx.fillStyle = style.accentText;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(discTxt, 0, 1);
        ctx.restore();
      }

      // 6. Floating Picture-in-Picture Product Thumbnail on Lifestyle Scene 2 (if both lifestyle & product exist)
      if (sceneIdx === 1 && lifestyleImg && productImg && !liveVideo) {
        const pip = isVertical ? 148 : 138;
        const pipX = w - padX - pip;
        const pipY = topPillY + 64;
        ctx.save();
        ctx.globalAlpha = textAlpha;
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 24;
        drawRoundedRect(ctx, pipX, pipY, pip, pip, 24);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.clip();
        drawCoverMedia(ctx, productImg, pip, pip, 1.04, 0, 0);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = textAlpha;
        drawRoundedRect(ctx, pipX, pipY, pip, pip, 24);
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }

      // 7. Kinetic Reels Caption Overlay (Lower-Third — NO heavy white box!)
      const maxTextW = w - padX * 2;
      const slideY = (1 - enter) * 34;
      const footerH = isVertical ? 68 : 56;
      const footerY = h - Math.round(h * 0.036) - footerH;
      const captionBaseY = footerY - (isVertical ? 235 : 190) + slideY;

      ctx.save();
      ctx.globalAlpha = textAlpha;

      // Scene tag pill
      const badgeTxt = scene.badge.toUpperCase();
      ctx.font = `800 ${isVertical ? 19 : 18}px "Manrope", system-ui, sans-serif`;
      const bw = Math.min(maxTextW, ctx.measureText(badgeTxt).width + 32);
      const bx = Math.round((w - bw) / 2);
      drawRoundedRect(ctx, bx, captionBaseY, bw, 36, 18);
      ctx.fillStyle = style.accentBg;
      ctx.fill();
      ctx.fillStyle = style.accentText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeTxt, w / 2, captionBaseY + 19);

      // Bold headline with cinema drop shadow
      let curY = captionBaseY + (isVertical ? 76 : 64);
      const isPriceScene = scene.id === "price_offer";
      ctx.font = isPriceScene
        ? `800 ${isVertical ? 72 : 60}px "Fraunces", Georgia, serif`
        : `800 ${isVertical ? 46 : 38}px "Fraunces", Georgia, serif`;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;

      const headlineLines = wrapText(ctx, scene.headline, maxTextW, 2);
      const lh = isPriceScene ? (isVertical ? 74 : 62) : isVertical ? 54 : 44;
      for (const ln of headlineLines) {
        ctx.fillText(ln, w / 2, curY);
        curY += lh;
      }

      if (isPriceScene && promoPrice != null && promoPrice < price) {
        const oldStr = formatDt(price);
        ctx.font = `700 ${isVertical ? 28 : 24}px "Manrope", system-ui, sans-serif`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
        const ow = ctx.measureText(oldStr).width;
        ctx.fillText(oldStr, w / 2, curY + 2);
        ctx.strokeStyle = "#f28b75";
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(w / 2 - ow / 2 - 6, curY + 2);
        ctx.lineTo(w / 2 + ow / 2 + 6, curY + 2);
        ctx.stroke();
        curY += isVertical ? 38 : 30;
      }

      // Subtitle
      ctx.font = `600 ${isVertical ? 24 : 21}px "Manrope", system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      const subLines = wrapText(ctx, scene.subtext, maxTextW, 2);
      for (const sl of subLines) {
        ctx.fillText(sl, w / 2, curY + 8);
        curY += isVertical ? 32 : 26;
      }
      ctx.restore();

      // 8. Bottom Reels CTA Pill (subtle pulse on final CTA scene)
      const ctaPulse = scene.id === "cta" ? 1 + 0.025 * Math.sin(t * 8) : 1;
      ctx.save();
      ctx.translate(w / 2, footerY + footerH / 2);
      ctx.scale(ctaPulse, ctaPulse);
      drawRoundedRect(ctx, -maxTextW / 2, -footerH / 2, maxTextW, footerH, footerH / 2);
      ctx.fillStyle = style.ctaBg;
      ctx.fill();
      ctx.fillStyle = style.ctaText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${isVertical ? 22 : 20}px "Manrope", system-ui, sans-serif`;
      ctx.fillText("🚚 Livraison 24 gouvernorats  •  🤝 Paiement à la livraison", 0, 1);
      ctx.restore();
    },
    [dims, discountPct, format, price, promoPrice, scenes, storeName, styleId, totalDuration],
  );

  // Playback loop
  useEffect(() => {
    if (exporting) return;
    if (!playing) {
      drawFrame(elapsedSec);
      return;
    }
    let rafId = 0;
    let lastTs = performance.now();
    let localElapsed = elapsedSec;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      localElapsed = (localElapsed + dt) % Math.max(totalDuration, 1);
      drawFrame(localElapsed);
      setElapsedSec(localElapsed);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, exporting, drawFrame, totalDuration, mediaVersion]);

  useEffect(() => {
    if (!playing && !exporting) drawFrame(elapsedSec);
  }, [drawFrame, elapsedSec, exporting, mediaVersion, playing]);

  const jumpToScene = (idx: number) => {
    let start = 0;
    for (let i = 0; i < idx; i++) start += Math.max(2, scenes[i]?.durationSec ?? 3);
    setSelectedSceneIdx(idx);
    setElapsedSec(start + 0.65);
    setPlaying(false);
    drawFrame(start + 0.65);
  };

  const updateScene = (idx: number, patch: Partial<VideoScene>) => {
    onScenesChange(scenes.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const handleUploadMedia = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (customMedia) URL.revokeObjectURL(customMedia.url);
    const kind = file.type.startsWith("video/") ? "video" : "image";
    const url = URL.createObjectURL(file);
    setCustomMedia({ kind, url, name: file.name });
    toast.success(
      kind === "video"
        ? tr("Vidéo importée dans le Reel !", "تم استيراد الفيديو في الريل!")
        : tr("Photo lifestyle importée dans le Reel !", "تم استيراد الصورة في الريل!"),
    );
    e.target.value = "";
  };

  const startAiVideoFn = useServerFn(startAiProductVideo);
  const pollAiVideoFn = useServerFn(pollAiProductVideo);

  const aiVideoMutation = useMutation({
    mutationFn: async () => {
      setAiVideoNotice(null);
      const absoluteImg =
        imageUrl && imageUrl.startsWith("/") && typeof window !== "undefined"
          ? `${window.location.origin}${imageUrl}`
          : imageUrl;
      const start = await startAiVideoFn({
        data: {
          productName,
          categoryName: categoryName ?? null,
          description: description ?? null,
          imageUrl: absoluteImg,
          aspectRatio: format,
          customPrompt: videoPrompt,
        },
      });
      if (!start.ok) {
        if (start.prompt) setVideoPrompt(start.prompt);
        setAiVideoNotice(start.error);
        if (start.code === "not_configured") return null;
        throw new Error(start.error);
      }

      setAiPolling(true);
      try {
        // Poll up to ~3 minutes (36 × 5s)
        for (let attempt = 0; attempt < 36; attempt++) {
          await new Promise((r) => setTimeout(r, 5000));
          const poll = await pollAiVideoFn({
            data: {
              provider: start.provider,
              statusUrl: start.statusUrl,
              responseUrl: start.responseUrl,
            },
          });
          if (!poll.ok) throw new Error(poll.error);
          if (poll.status === "completed") return poll.videoUrl;
        }
        throw new Error("Délai dépassé lors de la génération vidéo IA.");
      } finally {
        setAiPolling(false);
      }
    },
    onSuccess: (url) => {
      if (!url) return;
      setAiVideoUrl(url);
      toast.success(
        tr(
          "Vraie vidéo IA générée et chargée dans votre Reel !",
          "تم إنشاء الفيديو الحقيقي بالذكاء الاصطناعي!",
        ),
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : tr("Erreur vidéo IA", "خطأ في الفيديو"));
    },
  });

  const handleExportVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const codec = pickRecorderMimeType();
    if (!codec || typeof canvas.captureStream !== "function") {
      toast.error(
        tr(
          "Votre navigateur ne supporte pas l'export vidéo. Essayez Chrome ou Edge.",
          "متصفحك لا يدعم تصدير الفيديو.",
        ),
      );
      return;
    }

    setExporting(true);
    setExportProgress(0);
    setPlaying(false);

    try {
      if (customVideoRef.current) {
        customVideoRef.current.currentTime = 0;
        await customVideoRef.current.play().catch(() => {});
      }
      const stream = canvas.captureStream(30);
      const recorder = codec.mimeType
        ? new MediaRecorder(stream, { mimeType: codec.mimeType, videoBitsPerSecond: 5_000_000 })
        : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      const done = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: codec.mimeType || "video/webm" }));
        recorder.onerror = () => reject(new Error("recording_error"));
      });

      recorder.start(200);
      const startPerf = performance.now();
      const durationMs = totalDuration * 1000;

      await new Promise<void>((resolve) => {
        const step = (now: number) => {
          const ms = now - startPerf;
          const sec = Math.min(totalDuration - 0.01, ms / 1000);
          drawFrame(sec);
          setExportProgress(Math.min(99, Math.round((ms / durationMs) * 100)));
          if (ms < durationMs) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });

      recorder.stop();
      const blob = await done;
      stream.getTracks().forEach((track) => track.stop());

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reel-${productSlug || "produit"}-${format === "9:16" ? "9x16" : "1x1"}.${codec.ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      setExportProgress(100);
      toast.success(
        tr(
          `Vidéo Reel téléchargée (.${codec.ext}) — prête pour Instagram Reels & Facebook !`,
          `تم تحميل فيديو الريل (.${codec.ext})!`,
        ),
      );
    } catch (err) {
      console.error("[promo-video] export failed", err);
      toast.error(tr("Impossible d'exporter la vidéo.", "تعذر تصدير الفيديو."));
    } finally {
      setExporting(false);
      setPlaying(true);
    }
  };

  const handleExportPoster = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      drawFrame(elapsedSec);
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `reel-cover-${productSlug || "produit"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(tr("Visuel PNG téléchargé !", "تم تحميل الصورة!"));
    } catch {
      toast.error(tr("Impossible d'exporter l'image PNG.", "تعذر تصدير الصورة."));
    }
  };

  const activeScene = scenes[selectedSceneIdx] ?? scenes[0];
  const hasLifestylePerson = Boolean(effectiveLifestyleImageUrl || activeVideoSrc);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(290px,360px)_1fr]">
      {/* Full-bleed Reels Video Preview Column */}
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-4 shadow-card">
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={format === "9:16" ? "default" : "outline"}
              onClick={() => setFormat("9:16")}
              disabled={exporting}
            >
              <RectangleVertical className="mr-1.5 h-3.5 w-3.5" />
              Reels 9:16
            </Button>
            <Button
              type="button"
              size="sm"
              variant={format === "1:1" ? "default" : "outline"}
              onClick={() => setFormat("1:1")}
              disabled={exporting}
            >
              <Square className="mr-1.5 h-3.5 w-3.5" />
              Feed 1:1
            </Button>
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => setPlaying((p) => !p)}
            disabled={exporting}
            title={playing ? tr("Pause", "إيقاف مؤقت") : tr("Lecture", "تشغيل")}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
        </div>

        {/* Full-bleed Reel Canvas */}
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-2xl border bg-black shadow-lg",
            format === "9:16" ? "max-w-[290px] aspect-[9/16]" : "max-w-[320px] aspect-square",
          )}
        >
          <canvas
            ref={canvasRef}
            width={dims.w}
            height={dims.h}
            className="h-full w-full object-cover"
          />
          {exporting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65 text-white backdrop-blur-xs">
              <Loader2 className="h-7 w-7 animate-spin" />
              <p className="text-sm font-semibold">
                {tr("Export vidéo HD…", "جارٍ التصدير…")} {exportProgress}%
              </p>
            </div>
          )}
        </div>

        {/* Status badge for media type */}
        <div className="flex w-full flex-wrap items-center justify-center gap-1.5">
          {Object.values(CAPTION_STYLES).map((st) => (
            <button
              key={st.id}
              type="button"
              disabled={exporting}
              onClick={() => setStyleId(st.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                styleId === st.id
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-3 w-3 rounded-full border" style={{ background: st.swatch }} />
              {tr(st.labelFr, st.labelAr)}
            </button>
          ))}
        </div>

        {/* Upload custom lifestyle photo or real video clip */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/mp4,video/webm,video/quicktime"
          onChange={handleUploadMedia}
          className="hidden"
        />
        <div className="flex w-full items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={exporting}
            className="flex-1 text-xs"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {tr("Importer vidéo / photo en situation", "استيراد فيديو أو صورة")}
          </Button>
          {customMedia && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => {
                URL.revokeObjectURL(customMedia.url);
                setCustomMedia(null);
              }}
              title={tr("Retirer le média importé", "إزالة الملف")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Export actions */}
        <div className="flex w-full flex-col gap-2">
          <Button type="button" onClick={handleExportVideo} disabled={exporting} className="w-full">
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {exporting
              ? `${tr("Export en cours", "جارٍ التصدير")} (${exportProgress}%)`
              : tr(
                  `Télécharger le Reel vidéo (${totalDuration}s)`,
                  `تحميل فيديو الريل (${totalDuration} ثانية)`,
                )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleExportPoster}
            disabled={exporting}
            className="w-full"
          >
            <ImageDown className="mr-2 h-4 w-4" />
            {tr("Télécharger la couverture (PNG)", "تحميل صورة الغلاف (PNG)")}
          </Button>
        </div>
      </div>

      {/* Right Column: Generative AI Video (Kling/Veo) + 4-Scene Storyboard Editor */}
      <div className="space-y-5">
        {/* Real Generative AI Motion Video Card */}
        <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">
                {tr(
                  "Vidéo IA en situation réelle (mouvement humain)",
                  "فيديو بالذكاء الاصطناعي في وضع الاستخدام",
                )}
              </h3>
            </div>
            <Badge variant={hasLifestylePerson ? "default" : "secondary"}>
              {activeVideoSrc
                ? tr("Vidéo réelle active", "فيديو حقيقي نشط")
                : hasLifestylePerson
                  ? tr("Scène lifestyle active", "مشهد واقعي نشط")
                  : tr("Zoom produit cinéma", "تصوير سينمائي")}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            {tr(
              "Générez une vraie vidéo IA (Kling 2.1 via fal.ai ou Replicate) montrant une personne qui porte ou utilise ce produit, ou copiez ce prompt cinématographique prêt à l'emploi.",
              "أنشئ فيديو حقيقياً بالذكاء الاصطناعي يظهر شخصاً يستخدم أو يرتدي المنتج، أو انسخ الأمر السينمائي الجاهز.",
            )}
          </p>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="ai-video-prompt" className="text-xs">
                {tr("Prompt vidéo IA (modifiable)", "وصف الفيديو للذكاء الاصطناعي")}
              </Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(videoPrompt);
                  setCopiedPrompt(true);
                  toast.success(tr("Prompt vidéo copié !", "تم نسخ الوصف!"));
                  setTimeout(() => setCopiedPrompt(false), 1800);
                }}
              >
                {copiedPrompt ? (
                  <Check className="mr-1 h-3.5 w-3.5 text-primary" />
                ) : (
                  <Copy className="mr-1 h-3.5 w-3.5" />
                )}
                {tr("Copier le prompt", "نسخ")}
              </Button>
            </div>
            <Textarea
              id="ai-video-prompt"
              rows={3}
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              className="text-xs leading-relaxed"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={aiVideoMutation.isPending || aiPolling}
              onClick={() => aiVideoMutation.mutate()}
            >
              {aiVideoMutation.isPending || aiPolling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4 text-primary" />
              )}
              {aiPolling
                ? tr(
                    "Génération de la vidéo IA en cours (30-90s)…",
                    "جارٍ توليد الفيديو بالذكاء الاصطناعي…",
                  )
                : tr(
                    "Générer une vraie vidéo IA (MP4)",
                    "توليد فيديو حقيقي بالذكاء الاصطناعي (MP4)",
                  )}
            </Button>
            {aiVideoUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={aiVideoUrl} target="_blank" rel="noreferrer" download>
                  <Film className="mr-1.5 h-3.5 w-3.5" />
                  {tr("Ouvrir le MP4 brut", "فتح ملف MP4")}
                </a>
              </Button>
            )}
          </div>

          {aiVideoNotice && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-200">
              {aiVideoNotice}
            </div>
          )}
        </div>

        {/* 4-Scene Storyboard Editor */}
        <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clapperboard className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">
                {tr("Scènes & sous-titres du Reel", "مشاهد ونصوص الريل")}
              </h3>
            </div>
            <Badge variant="secondary">
              {scenes.length} {tr("plans", "لقطات")} · {totalDuration}s
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {scenes.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpToScene(idx)}
                className={cn(
                  "rounded-xl border p-2.5 text-left transition",
                  selectedSceneIdx === idx
                    ? "border-primary bg-primary-soft/60"
                    : "hover:border-primary/40",
                )}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  {idx + 1}. {s.durationSec}s
                </span>
                <p className="mt-0.5 truncate text-xs font-medium">{s.badge}</p>
              </button>
            ))}
          </div>

          {activeScene && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="scene-badge">{tr("Badge flottant", "الشارة العلوية")}</Label>
                <Input
                  id="scene-badge"
                  value={activeScene.badge}
                  maxLength={48}
                  onChange={(e) => updateScene(selectedSceneIdx, { badge: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scene-headline">
                  {tr("Sous-titre principal du Reel", "العنوان الرئيسي في الفيديو")}
                </Label>
                <Input
                  id="scene-headline"
                  value={activeScene.headline}
                  maxLength={90}
                  onChange={(e) => updateScene(selectedSceneIdx, { headline: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scene-subtext">{tr("Argument / Détail", "النص الفرعي")}</Label>
                <Input
                  id="scene-subtext"
                  value={activeScene.subtext}
                  maxLength={140}
                  onChange={(e) => updateScene(selectedSceneIdx, { subtext: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
