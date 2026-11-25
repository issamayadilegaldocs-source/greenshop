import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, ImagePlus, Loader2, Settings, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { analyzeProductPhoto, generateMarketingPhoto } from "@/lib/ai-photo-product.functions";
import type { PhotoProductDraft } from "@/lib/ai-photo-product.schema";
import { uploadCatalogImage } from "@/lib/storage";
import { dbErrorMessage } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/** Resize an image file client-side to ≤1024px JPEG so Vision & Image-Edit payloads stay fast. */
async function fileToResizedDataUrl(file: File, maxDim = 1024): Promise<string> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image illisible"));
      el.src = bitmapUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

/** Convert an existing image URL (same-origin or CORS-enabled signed URL) into a resized data URL. */
async function urlToResizedDataUrl(url: string, maxDim = 1024): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Impossible de lire l'image existante");
  const blob = await res.blob();
  const file = new File([blob], "product.jpg", { type: blob.type || "image/jpeg" });
  return fileToResizedDataUrl(file, maxDim);
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, b64] = dataUrl.split(",");
  const mime = /data:([^;]+);/.exec(header ?? "")?.[1] || "image/png";
  const bin = atob(b64 ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

type CategoryChoice = { id: string; label: string };

export function PhotoToProductCard({
  categories,
  productName,
  existingImageUrl,
  onApplyDraft,
  onAddUploadedImage,
}: {
  categories: CategoryChoice[];
  productName: string;
  existingImageUrl?: string | null;
  onApplyDraft: (draft: PhotoProductDraft) => void;
  onAddUploadedImage: (img: { url: string; storage_path: string }, prepend?: boolean) => void;
}) {
  const { tr } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUploaded, setSourceUploaded] = useState(false);
  const [hint, setHint] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [genStyle, setGenStyle] = useState<"studio" | "lifestyle" | "both" | null>(null);
  const [lastDraft, setLastDraft] = useState<PhotoProductDraft | null>(null);
  const [needsConfig, setNeedsConfig] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setPreviewDataUrl(dataUrl);
      setSourceFile(file);
      setSourceUploaded(false);
      setNeedsConfig(false);
    } catch (e) {
      toast.error(dbErrorMessage(e));
    }
  }

  async function resolveReferenceDataUrl(): Promise<string | null> {
    if (previewDataUrl) return previewDataUrl;
    if (existingImageUrl) {
      const converted = await urlToResizedDataUrl(existingImageUrl);
      setPreviewDataUrl(converted);
      return converted;
    }
    return null;
  }

  async function runAnalyze() {
    setAnalyzing(true);
    setNeedsConfig(false);
    try {
      const dataUrl = await resolveReferenceDataUrl();
      if (!dataUrl) {
        toast.error(tr("Choisissez d'abord une photo du produit.", "اختر صورة المنتج أولاً."));
        return;
      }

      // Upload the original photo to the product gallery once so the admin doesn't have to re-upload it.
      if (sourceFile && !sourceUploaded) {
        try {
          const uploaded = await uploadCatalogImage(sourceFile, "products");
          onAddUploadedImage({ url: uploaded.url, storage_path: uploaded.path }, false);
          setSourceUploaded(true);
        } catch (e) {
          toast.error(`${tr("Upload photo", "رفع الصورة")} : ${dbErrorMessage(e)}`);
        }
      }

      const res = await analyzeProductPhoto({
        data: {
          imageDataUrl: dataUrl,
          hint: hint.trim() || null,
          categories,
        },
      });

      if (!res.ok) {
        if (res.code === "not_configured") setNeedsConfig(true);
        toast.error(res.error);
        return;
      }

      setLastDraft(res.data);
      onApplyDraft(res.data);
      toast.success(
        tr(
          "Fiche produit remplie automatiquement (FR + AR) ! Vous pouvez maintenant générer les photos marketing ou enregistrer.",
          "تم ملء بطاقة المنتج تلقائياً (فرنسية + عربية)! يمكنك الآن إنشاء الصور التسويقية أو الحفظ.",
        ),
      );
    } catch (e) {
      toast.error(dbErrorMessage(e));
    } finally {
      setAnalyzing(false);
    }
  }

  async function runMarketingPhoto(style: "studio" | "lifestyle") {
    const dataUrl = await resolveReferenceDataUrl();
    if (!dataUrl) {
      toast.error(tr("Ajoutez d'abord une photo produit.", "أضف صورة المنتج أولاً."));
      return false;
    }

    const activeName = lastDraft?.name_fr || productName.trim() || "Produit Maison Noura";
    const customPrompt =
      style === "studio" ? lastDraft?.studio_photo_prompt : lastDraft?.lifestyle_photo_prompt;

    const res = await generateMarketingPhoto({
      data: {
        imageDataUrl: dataUrl,
        style,
        productName: activeName,
        customPrompt: customPrompt || null,
      },
    });

    if (!res.ok) {
      if (res.code === "not_configured") setNeedsConfig(true);
      toast.error(res.error);
      return false;
    }

    const file = dataUrlToFile(res.imageDataUrl, `ai-${style}-${Date.now()}.png`);
    const uploaded = await uploadCatalogImage(file, "products");
    onAddUploadedImage({ url: uploaded.url, storage_path: uploaded.path }, style === "studio");
    setGeneratedCount((c) => c + 1);
    toast.success(
      style === "studio"
        ? tr("Photo Studio IA ajoutée en couverture !", "تمت إضافة صورة الاستوديو كصورة رئيسية!")
        : tr("Photo Lifestyle IA ajoutée à la galerie !", "تمت إضافة صورة نمط الحياة إلى المعرض!"),
    );
    return true;
  }

  async function handleGenerate(target: "studio" | "lifestyle" | "both") {
    setGenStyle(target);
    setNeedsConfig(false);
    try {
      if (target === "both") {
        await runMarketingPhoto("studio");
        await runMarketingPhoto("lifestyle");
      } else {
        await runMarketingPhoto(target);
      }
    } catch (e) {
      toast.error(dbErrorMessage(e));
    } finally {
      setGenStyle(null);
    }
  }

  const activePreview = previewDataUrl || existingImageUrl || null;
  const busy = analyzing || genStyle !== null;

  return (
    <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary-soft/60 via-card to-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1">
              <Sparkles className="h-3 w-3" />
              {tr("Création 1 clic par photo IA", "إنشاء بضغطة واحدة من صورة")}
            </Badge>
            {lastDraft && (
              <Badge variant="secondary" className="gap-1 text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                {tr("Fiche FR/AR remplie", "تم ملء البطاقة")}
              </Badge>
            )}
            {generatedCount > 0 && (
              <Badge variant="outline">
                {tr(
                  `${generatedCount} photo(s) marketing ajoutée(s)`,
                  `${generatedCount} صورة تسويقية`,
                )}
              </Badge>
            )}
          </div>
          <h2 className="text-base font-semibold">
            {tr(
              "Importez 1 photo → Fiche complète FR/AR + Photos marketing Studio & Lifestyle",
              "ارفع صورة واحدة ← بطاقة كاملة (فرنسية/عربية) + صور تسويقية احترافية",
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            {tr(
              "Déposez une photo prise au téléphone : l'IA détecte le produit, choisit la catégorie, rédige la fiche bilingue, estime le prix en DT et crée des visuels studio & lifestyle.",
              "ارفع صورة من هاتفك: يتعرف الذكاء الاصطناعي على المنتج ويختار القسم ويكتب الوصف بالفرنسية والعربية وينشئ صوراً تسويقية.",
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[160px_1fr]">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={(e) => onPickFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="group relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-primary/30 bg-background/80 text-center transition hover:border-primary"
        >
          {activePreview ? (
            <>
              <img
                src={activePreview}
                alt=""
                className="h-full w-full object-cover transition group-hover:opacity-80"
              />
              <span className="absolute inset-x-2 bottom-2 rounded-lg bg-background/90 px-2 py-1 text-[11px] font-medium shadow-sm">
                {tr("Changer la photo", "تغيير الصورة")}
              </span>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5 px-3 text-muted-foreground group-hover:text-primary">
              <Camera className="h-7 w-7" />
              <span className="text-xs font-medium">
                {tr("Choisir une photo", "اختر صورة المنتج")}
              </span>
              <span className="text-[10px]">JPG · PNG · WEBP</span>
            </div>
          )}
        </button>

        <div className="flex flex-col justify-between gap-3">
          <div className="space-y-2">
            <Input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              maxLength={350}
              disabled={busy}
              placeholder={tr(
                "Note optionnelle pour l'IA (ex : prix 129 DT, stock 15, marque, matière...)",
                "ملاحظة اختيارية للذكاء الاصطناعي (مثال: السعر 129 د.ت، المخزون 15، المادة...)",
              )}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || !activePreview}
                onClick={runAnalyze}
                className="gap-1.5"
              >
                {analyzing ? <Loader2 className="animate-spin" /> : <Wand2 />}
                {analyzing
                  ? tr("Analyse IA en cours…", "جارٍ تحليل الصورة…")
                  : tr("Analyser & remplir la fiche (FR + AR)", "تحليل الصورة وملء البطاقة")}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={busy || !activePreview}
                onClick={() => handleGenerate("studio")}
                className="gap-1.5"
              >
                {genStyle === "studio" || genStyle === "both" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ImagePlus />
                )}
                {tr("+ Photo Studio IA", "+ صورة استوديو IA")}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={busy || !activePreview}
                onClick={() => handleGenerate("lifestyle")}
                className="gap-1.5"
              >
                {genStyle === "lifestyle" || genStyle === "both" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                {tr("+ Photo Lifestyle IA", "+ صورة نمط حياة IA")}
              </Button>

              <Button
                type="button"
                variant="secondary"
                disabled={busy || !activePreview}
                onClick={() => handleGenerate("both")}
                className="gap-1.5"
              >
                {genStyle === "both" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {tr("Générer les 2 photos", "إنشاء الصورتين معاً")}
              </Button>
            </div>
          </div>

          {needsConfig && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <span>
                {tr(
                  "Ajoutez votre clé API OpenAI dans Paramètres pour activer la vision et la création de photos marketing.",
                  "أضف مفتاح OpenAI API في الإعدادات لتفعيل تحليل الصور وإنشاء الصور التسويقية.",
                )}
              </span>
              <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                <Link to="/admin/settings">
                  <Settings className="h-3.5 w-3.5" />
                  {tr("Configurer la clé OpenAI", "إعداد مفتاح OpenAI")}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
