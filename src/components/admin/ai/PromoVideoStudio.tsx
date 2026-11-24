import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clapperboard,
  Download,
  ImageDown,
  Loader2,
  Pause,
  Play,
  RectangleVertical,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { VideoFormat, VideoScene } from "@/lib/ai-social.schema";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type VisualThemeId = "sage" | "midnight" | "warm";

type VisualTheme = {
  id: VisualThemeId;
  labelFr: string;
  labelAr: string;
  bgTop: string;
  bgBottom: string;
  orbA: string;
  orbB: string;
  cardBg: string;
  cardBorder: string;
  ink: string;
  muted: string;
  accentBg: string;
  accentText: string;
  pillBg: string;
  pillText: string;
  progressTrack: string;
  progressFill: string;
};

const THEMES: Record<VisualThemeId, VisualTheme> = {
  sage: {
    id: "sage",
    labelFr: "Sauge Maison",
    labelAr: "أخضر هادئ",
    bgTop: "#eef6ee",
    bgBottom: "#d3e8d3",
    orbA: "rgba(155, 165, 141, 0.25)",
    orbB: "rgba(255, 255, 255, 0.55)",
    cardBg: "rgba(255, 255, 255, 0.88)",
    cardBorder: "rgba(26, 43, 34, 0.10)",
    ink: "#1a2b22",
    muted: "#4a6154",
    accentBg: "#1f4d3a",
    accentText: "#f8fbf8",
    pillBg: "#c4963f",
    pillText: "#ffffff",
    progressTrack: "rgba(26, 43, 34, 0.16)",
    progressFill: "#1f4d3a",
  },
  midnight: {
    id: "midnight",
    labelFr: "Chic Sombre",
    labelAr: "داكن أنيق",
    bgTop: "#131e18",
    bgBottom: "#23362c",
    orbA: "rgba(201, 162, 75, 0.20)",
    orbB: "rgba(155, 165, 141, 0.16)",
    cardBg: "rgba(255, 255, 255, 0.08)",
    cardBorder: "rgba(255, 255, 255, 0.14)",
    ink: "#f7f4ee",
    muted: "#c6d3ca",
    accentBg: "#d4a84f",
    accentText: "#16201a",
    pillBg: "#d4a84f",
    pillText: "#16201a",
    progressTrack: "rgba(255, 255, 255, 0.22)",
    progressFill: "#d4a84f",
  },
  warm: {
    id: "warm",
    labelFr: "Sable & Crème",
    labelAr: "رملي دافئ",
    bgTop: "#faf4ea",
    bgBottom: "#eadbc4",
    orbA: "rgba(182, 107, 84, 0.18)",
    orbB: "rgba(255, 255, 255, 0.50)",
    cardBg: "rgba(255, 255, 255, 0.88)",
    cardBorder: "rgba(36, 30, 24, 0.10)",
    ink: "#241e18",
    muted: "#6b5a4b",
    accentBg: "#b66b54",
    accentText: "#ffffff",
    pillBg: "#241e18",
    pillText: "#faf4ea",
    progressTrack: "rgba(36, 30, 24, 0.16)",
    progressFill: "#b66b54",
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

export type PromoVideoStudioProps = {
  productName: string;
  productSlug: string;
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
  imageUrl,
  price,
  promoPrice,
  storeName,
  scenes,
  onScenesChange,
}: PromoVideoStudioProps) {
  const { tr } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageReady, setImageReady] = useState(false);

  const [format, setFormat] = useState<VideoFormat>("9:16");
  const [themeId, setThemeId] = useState<VisualThemeId>("sage");
  const [playing, setPlaying] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [selectedSceneIdx, setSelectedSceneIdx] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

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

  // Load product image for canvas drawing
  useEffect(() => {
    let active = true;
    setImageReady(false);
    imgRef.current = null;
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!active) return;
      imgRef.current = img;
      setImageReady(true);
    };
    img.onerror = () => {
      if (!active) return;
      imgRef.current = null;
      setImageReady(false);
    };
    img.src = imageUrl;
    return () => {
      active = false;
    };
  }, [imageUrl]);

  const drawFrame = useCallback(
    (timeSec: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { w, h } = dims;
      const theme = THEMES[themeId];
      const isVertical = format === "9:16";
      const safeTotal = Math.max(totalDuration, 1);
      const t = ((timeSec % safeTotal) + safeTotal) % safeTotal;

      // Determine active scene & local progress
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
      const enter = easeOutCubic(Math.min(1, localTime / 0.55));
      const exit = localTime > sceneDur - 0.35 ? easeOutCubic((sceneDur - localTime) / 0.35) : 1;
      const alpha = Math.max(0, Math.min(1, enter * exit));

      // 1. Background gradient
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, theme.bgTop);
      bg.addColorStop(1, theme.bgBottom);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // 2. Subtle animated floating soft orbs
      const phase = (t / safeTotal) * Math.PI * 2;
      ctx.save();
      ctx.fillStyle = theme.orbA;
      ctx.beginPath();
      ctx.arc(
        w * 0.16 + Math.sin(phase) * 28,
        h * 0.22 + Math.cos(phase) * 20,
        w * 0.34,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = theme.orbB;
      ctx.beginPath();
      ctx.arc(
        w * 0.86 + Math.cos(phase) * 24,
        h * 0.78 + Math.sin(phase) * 24,
        w * 0.38,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();

      // 3. Top segmented Reels/Stories progress bar
      const padX = Math.round(w * 0.065);
      const barY = Math.round(h * 0.032);
      const gap = 10;
      const segW = (w - padX * 2 - gap * (scenes.length - 1)) / scenes.length;
      for (let i = 0; i < scenes.length; i++) {
        const sx = padX + i * (segW + gap);
        drawRoundedRect(ctx, sx, barY, segW, 6, 3);
        ctx.fillStyle = theme.progressTrack;
        ctx.fill();
        const fillRatio = i < sceneIdx ? 1 : i === sceneIdx ? localProgress : 0;
        if (fillRatio > 0) {
          drawRoundedRect(ctx, sx, barY, segW * fillRatio, 6, 3);
          ctx.fillStyle = theme.progressFill;
          ctx.fill();
        }
      }

      // 4. Brand header pill + discount badge
      const headerY = barY + 26;
      ctx.font = `700 ${isVertical ? 22 : 24}px "Manrope", system-ui, sans-serif`;
      const brandLabel = storeName.toUpperCase();
      const brandMetrics = ctx.measureText(brandLabel);
      const brandW = brandMetrics.width + 40;
      drawRoundedRect(ctx, padX, headerY, brandW, 44, 22);
      ctx.fillStyle = theme.cardBg;
      ctx.fill();
      ctx.strokeStyle = theme.cardBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = theme.ink;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(brandLabel, padX + 20, headerY + 23);

      if (discountPct) {
        const discLabel = `-${discountPct}%`;
        ctx.font = `800 ${isVertical ? 24 : 26}px "Manrope", system-ui, sans-serif`;
        const dw = ctx.measureText(discLabel).width + 36;
        const dx = w - padX - dw;
        drawRoundedRect(ctx, dx, headerY, dw, 44, 22);
        ctx.fillStyle = theme.pillBg;
        ctx.fill();
        ctx.fillStyle = theme.pillText;
        ctx.textAlign = "center";
        ctx.fillText(discLabel, dx + dw / 2, headerY + 23);
      }

      // 5. Product Hero Card with Ken Burns zoom
      const imgSize = isVertical ? Math.round(w * 0.78) : Math.round(w * 0.5);
      const imgX = Math.round((w - imgSize) / 2);
      const imgY = isVertical ? Math.round(h * 0.14) : Math.round(h * 0.13);

      ctx.save();
      ctx.shadowColor = "rgba(18, 30, 24, 0.16)";
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 18;
      drawRoundedRect(ctx, imgX, imgY, imgSize, imgSize, 36);
      ctx.fillStyle = theme.cardBg;
      ctx.fill();
      ctx.restore();

      ctx.save();
      drawRoundedRect(ctx, imgX, imgY, imgSize, imgSize, 36);
      ctx.clip();
      const img = imgRef.current;
      if (img && img.complete && img.naturalWidth > 0) {
        // Gentle Ken Burns zoom across the full video
        const zoom = 1.03 + 0.08 * Math.sin((t / safeTotal) * Math.PI);
        const aspect = img.naturalWidth / img.naturalHeight;
        let dw = imgSize * zoom;
        let dh = imgSize * zoom;
        if (aspect > 1) dw = dh * aspect;
        else dh = dw / aspect;
        const offsetX = imgX + (imgSize - dw) / 2 + Math.sin(phase) * 6;
        const offsetY = imgY + (imgSize - dh) / 2 + Math.cos(phase) * 4;
        ctx.drawImage(img, offsetX, offsetY, dw, dh);
      } else {
        ctx.fillStyle = theme.cardBg;
        ctx.fillRect(imgX, imgY, imgSize, imgSize);
        ctx.fillStyle = theme.muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `600 28px "Manrope", system-ui, sans-serif`;
        ctx.fillText(productName.slice(0, 26), imgX + imgSize / 2, imgY + imgSize / 2);
      }
      ctx.restore();

      // Subtle border around photo frame
      drawRoundedRect(ctx, imgX, imgY, imgSize, imgSize, 36);
      ctx.strokeStyle = theme.cardBorder;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 6. Animated Kinetic Text Card (Scene Content)
      const cardTop = imgY + imgSize + (isVertical ? 44 : 26);
      const cardW = w - padX * 2;
      const cardH = isVertical ? Math.round(h * 0.28) : Math.round(h * 0.25);
      const slideOffset = (1 - enter) * 28;

      ctx.save();
      ctx.globalAlpha = alpha;
      drawRoundedRect(ctx, padX, cardTop + slideOffset, cardW, cardH, 30);
      ctx.fillStyle = theme.cardBg;
      ctx.fill();
      ctx.strokeStyle = theme.cardBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const innerX = padX + 36;
      const innerMaxW = cardW - 72;
      let cursorY = cardTop + slideOffset + (isVertical ? 44 : 34);

      // Scene badge pill
      const badgeTxt = scene.badge.toUpperCase();
      ctx.font = `700 ${isVertical ? 18 : 17}px "Manrope", system-ui, sans-serif`;
      const bw = Math.min(innerMaxW, ctx.measureText(badgeTxt).width + 32);
      const bx = Math.round((w - bw) / 2);
      drawRoundedRect(ctx, bx, cursorY - 18, bw, 36, 18);
      ctx.fillStyle = theme.accentBg;
      ctx.fill();
      ctx.fillStyle = theme.accentText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeTxt, w / 2, cursorY + 1);
      cursorY += isVertical ? 58 : 46;

      // Scene headline
      const isPriceScene = scene.id === "price_offer";
      const headlineFont = isPriceScene
        ? `800 ${isVertical ? 58 : 50}px "Fraunces", Georgia, serif`
        : `700 ${isVertical ? 38 : 32}px "Fraunces", Georgia, serif`;
      ctx.font = headlineFont;
      ctx.fillStyle = theme.ink;
      const headlineLines = wrapText(ctx, scene.headline, innerMaxW, 2);
      const lineH = isPriceScene ? (isVertical ? 64 : 54) : isVertical ? 46 : 38;
      for (const ln of headlineLines) {
        ctx.fillText(ln, w / 2, cursorY);
        cursorY += lineH;
      }

      // Old price strikethrough on price scene if promo
      if (isPriceScene && promoPrice != null && promoPrice < price) {
        const oldStr = formatDt(price);
        ctx.font = `600 ${isVertical ? 24 : 22}px "Manrope", system-ui, sans-serif`;
        ctx.fillStyle = theme.muted;
        const oldW = ctx.measureText(oldStr).width;
        ctx.fillText(oldStr, w / 2, cursorY + 4);
        ctx.strokeStyle = theme.muted;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(w / 2 - oldW / 2 - 4, cursorY + 4);
        ctx.lineTo(w / 2 + oldW / 2 + 4, cursorY + 4);
        ctx.stroke();
        cursorY += isVertical ? 38 : 30;
      }

      // Subtext
      ctx.font = `500 ${isVertical ? 23 : 20}px "Manrope", system-ui, sans-serif`;
      ctx.fillStyle = theme.muted;
      const subLines = wrapText(ctx, scene.subtext, innerMaxW, 2);
      for (const sl of subLines) {
        ctx.fillText(sl, w / 2, cursorY + 12);
        cursorY += isVertical ? 30 : 25;
      }
      ctx.restore();

      // 7. Bottom persistent trust/CTA bar
      const footerH = isVertical ? 66 : 52;
      const footerY = h - Math.round(h * 0.032) - footerH;
      drawRoundedRect(ctx, padX, footerY, cardW, footerH, footerH / 2);
      ctx.fillStyle = theme.accentBg;
      ctx.fill();
      ctx.fillStyle = theme.accentText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${isVertical ? 22 : 20}px "Manrope", system-ui, sans-serif`;
      ctx.fillText(
        "🚚 Livraison 24 gouvernorats  •  🤝 Paiement à la livraison",
        w / 2,
        footerY + footerH / 2 + 1,
      );
      void innerX;
    },
    [
      dims,
      discountPct,
      format,
      price,
      productName,
      promoPrice,
      scenes,
      storeName,
      themeId,
      totalDuration,
    ],
  );

  // Playback loop (paused while recording because recording drives its own deterministic timeline)
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
  }, [playing, exporting, drawFrame, totalDuration, imageReady]);

  // Redraw immediately when paused and scene text/theme/image changes
  useEffect(() => {
    if (!playing && !exporting) {
      drawFrame(elapsedSec);
    }
  }, [drawFrame, elapsedSec, exporting, imageReady, playing]);

  const jumpToScene = (idx: number) => {
    let start = 0;
    for (let i = 0; i < idx; i++) start += Math.max(2, scenes[i]?.durationSec ?? 3);
    setSelectedSceneIdx(idx);
    setElapsedSec(start + 0.65);
    setPlaying(false);
    drawFrame(start + 0.65);
  };

  const updateScene = (idx: number, patch: Partial<VideoScene>) => {
    const next = scenes.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onScenesChange(next);
  };

  const handleExportVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const codec = pickRecorderMimeType();
    if (!codec || typeof canvas.captureStream !== "function") {
      toast.error(
        tr(
          "Votre navigateur ne supporte pas l'export vidéo Canvas. Essayez Chrome ou Edge.",
          "متصفحك لا يدعم تصدير الفيديو. جرّب Chrome أو Edge.",
        ),
      );
      return;
    }

    setExporting(true);
    setExportProgress(0);
    setPlaying(false);

    try {
      const stream = canvas.captureStream(30);
      const recorder = codec.mimeType
        ? new MediaRecorder(stream, { mimeType: codec.mimeType, videoBitsPerSecond: 4_500_000 })
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
          if (ms < durationMs) {
            requestAnimationFrame(step);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(step);
      });

      recorder.stop();
      const blob = await done;
      stream.getTracks().forEach((track) => track.stop());

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pub-${productSlug || "produit"}-${format === "9:16" ? "reels-9x16" : "feed-1x1"}.${codec.ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      setExportProgress(100);
      toast.success(
        tr(
          `Vidéo téléchargée (.${codec.ext}) — prête pour Reels, Stories et Facebook Ads !`,
          `تم تحميل الفيديو (.${codec.ext}) — جاهز للنشر على فيسبوك وإنستغرام!`,
        ),
      );
    } catch (err) {
      console.error("[promo-video] export failed", err);
      toast.error(
        tr(
          "Impossible d'exporter la vidéo (vérifiez que l'image du produit est accessible).",
          "تعذر تصدير الفيديو.",
        ),
      );
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
      a.download = `post-${productSlug || "produit"}-${format === "9:16" ? "story" : "feed"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(tr("Visuel PNG téléchargé !", "تم تحميل الصورة!"));
    } catch {
      toast.error(tr("Impossible d'exporter l'image PNG pour ce visuel.", "تعذر تصدير الصورة."));
    }
  };

  const activeScene = scenes[selectedSceneIdx] ?? scenes[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
      {/* Live Video Preview Column */}
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

        {/* Canvas preview */}
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-2xl border bg-muted/30 shadow-inner",
            format === "9:16" ? "max-w-[290px] aspect-[9/16]" : "max-w-[320px] aspect-square",
          )}
        >
          <canvas
            ref={canvasRef}
            width={dims.w}
            height={dims.h}
            className="h-full w-full object-contain"
          />
          {exporting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white backdrop-blur-xs">
              <Loader2 className="h-7 w-7 animate-spin" />
              <p className="text-sm font-semibold">
                {tr("Création de la vidéo…", "جارٍ إنشاء الفيديو…")} {exportProgress}%
              </p>
            </div>
          )}
        </div>

        {/* Visual style selector */}
        <div className="flex w-full flex-wrap items-center justify-center gap-1.5">
          {(Object.values(THEMES) as VisualTheme[]).map((th) => (
            <button
              key={th.id}
              type="button"
              disabled={exporting}
              onClick={() => setThemeId(th.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                themeId === th.id
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-3 w-3 rounded-full border" style={{ background: th.bgBottom }} />
              {tr(th.labelFr, th.labelAr)}
            </button>
          ))}
        </div>

        {/* Export Buttons */}
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
                  `Télécharger la vidéo (${totalDuration}s)`,
                  `تحميل الفيديو (${totalDuration} ثانية)`,
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
            {tr("Télécharger le visuel Post (PNG)", "تحميل صورة المنشور (PNG)")}
          </Button>
        </div>
      </div>

      {/* Interactive 4-Scene Storyboard Editor */}
      <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">
              {tr("Scènes de la vidéo publicitaire", "مشاهد الفيديو الإعلاني")}
            </h3>
          </div>
          <Badge variant="secondary">
            {scenes.length} {tr("scènes", "مشاهد")} · {totalDuration}s
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          {tr(
            "Cliquez sur une scène pour la prévisualiser et ajuster librement les textes avant de télécharger votre vidéo Reels / Facebook.",
            "اضغط على أي مشهد لمعاينته وتعديل النصوص قبل تحميل الفيديو.",
          )}
        </p>

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
              <Label htmlFor="scene-badge">{tr("Étiquette / Badge", "الشارة العلوية")}</Label>
              <Input
                id="scene-badge"
                value={activeScene.badge}
                maxLength={48}
                onChange={(e) => updateScene(selectedSceneIdx, { badge: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scene-headline">
                {tr("Titre principal à l'écran", "العنوان الرئيسي في الفيديو")}
              </Label>
              <Input
                id="scene-headline"
                value={activeScene.headline}
                maxLength={90}
                onChange={(e) => updateScene(selectedSceneIdx, { headline: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scene-subtext">{tr("Sous-titre / Argument", "النص الفرعي")}</Label>
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
  );
}
