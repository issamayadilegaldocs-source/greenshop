import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Check,
  Clapperboard,
  Copy,
  ExternalLink,
  Facebook,
  Instagram,
  Loader2,
  Megaphone,
  Music,
  Search,
  Sparkles,
  Volume2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { generateSocialPack } from "@/lib/ai-social.functions";
import type {
  SocialCampaignResult,
  SocialGoal,
  SocialLanguage,
  SocialTone,
  VideoScene,
} from "@/lib/ai-social.schema";
import { PromoVideoStudio } from "./PromoVideoStudio";
import { cn } from "@/lib/utils";

type CatalogProductRow = {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string | null;
  brand: string | null;
  price: number;
  promo_price: number | null;
  warranty: string | null;
  description_fr: string | null;
  status: string;
  categories: { name_fr: string; name_ar: string | null } | null;
  product_images: { url: string; position: number }[];
};

const GOALS: { id: SocialGoal; fr: string; ar: string; hintFr: string }[] = [
  {
    id: "flash_sale",
    fr: "Vente flash / Promo",
    ar: "عرض سريع وتخفيض",
    hintFr: "Accélérer les ventes avec urgence & prix",
  },
  {
    id: "launch",
    fr: "Lancement nouveauté",
    ar: "إطلاق منتج جديد",
    hintFr: "Créer la curiosité autour d'un nouvel article",
  },
  {
    id: "storytelling",
    fr: "Qualité & bénéfices",
    ar: "الجودة والفوائد",
    hintFr: "Rassurer et valoriser les atouts du produit",
  },
  {
    id: "retargeting",
    fr: "Relance / Dernières pièces",
    ar: "تذكير / آخر القطع",
    hintFr: "Convertir les hésitants avec le paiement à la livraison",
  },
];

const TONES: { id: SocialTone; fr: string; ar: string }[] = [
  { id: "dynamique", fr: "Dynamique & vendeur", ar: "حيوي ومقنع" },
  { id: "elegant", fr: "Élégant & minimaliste", ar: "أنيق وهادئ" },
  { id: "chaleureux", fr: "Chaleureux & proche", ar: "ودود وقريب" },
];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(label);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Copie impossible dans ce navigateur.");
    }
  };
  return (
    <Button type="button" size="sm" variant="outline" onClick={onCopy}>
      {copied ? (
        <Check className="mr-1.5 h-3.5 w-3.5 text-primary" />
      ) : (
        <Copy className="mr-1.5 h-3.5 w-3.5" />
      )}
      {copied ? "Copié" : "Copier"}
    </Button>
  );
}

function formatPriceDt(price: number): string {
  return `${Number(price)
    .toFixed(Number(price) % 1 === 0 ? 0 : 3)
    .replace(".", ",")} DT`;
}

export function SocialMarketingStudio({
  initialProductId,
}: {
  initialProductId?: string | undefined;
}) {
  const { tr } = useI18n();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>(initialProductId ?? "");
  const [goal, setGoal] = useState<SocialGoal>("flash_sale");
  const [tone, setTone] = useState<SocialTone>("dynamique");
  const [languages, setLanguages] = useState<SocialLanguage>("both");
  const [customOffer, setCustomOffer] = useState("");
  const [pack, setPack] = useState<SocialCampaignResult | null>(null);
  const [packSource, setPackSource] = useState<"openai" | "smart_template" | null>(null);

  const productsQuery = useQuery({
    queryKey: ["admin", "social-studio-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, slug, name_fr, name_ar, brand, price, promo_price, warranty, description_fr, status, categories(name_fr, name_ar), product_images(url, position)",
        )
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as CatalogProductRow[];
    },
  });

  const storeQuery = useQuery({
    queryKey: ["admin", "social-studio-store"],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_settings")
        .select("store_name")
        .eq("id", true)
        .maybeSingle();
      return data?.store_name ?? "Maison Noura";
    },
  });

  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name_fr.toLowerCase().includes(q) ||
        (p.name_ar ?? "").includes(q) ||
        (p.categories?.name_fr ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  useEffect(() => {
    if (!products.length) return;
    if (!selectedId || !products.some((p) => p.id === selectedId)) {
      setSelectedId(products[0]!.id);
    }
  }, [products, selectedId]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedId) ?? null,
    [products, selectedId],
  );

  const selectedImage = useMemo(() => {
    if (!selectedProduct?.product_images?.length) return null;
    const sorted = [...selectedProduct.product_images].sort((a, b) => a.position - b.position);
    return sorted[0]?.url ?? null;
  }, [selectedProduct]);

  const storeName = storeQuery.data ?? "Maison Noura";
  const storeOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://greenshop-drab.vercel.app";
  const productPublicUrl = selectedProduct
    ? `${storeOrigin}/product/${selectedProduct.slug}`
    : storeOrigin;

  const generateFn = useServerFn(generateSocialPack);
  const generate = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) {
        throw new Error(tr("Sélectionnez un produit.", "اختر منتجاً أولاً."));
      }
      const res = await generateFn({
        data: {
          productName: selectedProduct.name_fr,
          productNameAr: selectedProduct.name_ar,
          productSlug: selectedProduct.slug,
          categoryName: selectedProduct.categories?.name_fr ?? null,
          brand: selectedProduct.brand,
          price: Number(selectedProduct.price),
          promoPrice:
            selectedProduct.promo_price == null ? null : Number(selectedProduct.promo_price),
          warranty: selectedProduct.warranty,
          description: selectedProduct.description_fr,
          storeName,
          storeUrl: storeOrigin,
          goal,
          tone,
          languages,
          customOffer: customOffer.trim() || null,
        },
      });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) => {
      setPack(res.data);
      setPackSource(res.source);
      toast.success(
        tr(
          "Vidéo publicitaire et posts Facebook / Instagram générés !",
          "تم إنشاء الفيديو ومنشورات فيسبوك وإنستغرام بنجاح!",
        ),
      );
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : tr("Erreur de génération", "خطأ في الإنشاء"),
      );
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    generate.mutate();
  };

  const handleScenesChange = (scenes: VideoScene[]) => {
    setPack((prev) => (prev ? { ...prev, video_script: { ...prev.video_script, scenes } } : prev));
  };

  const fbFullPost = pack ? `${pack.facebook.body}\n\n${pack.facebook.hashtags.join(" ")}` : "";
  const igFullCaption = pack
    ? `${pack.instagram.caption}\n\n${pack.instagram.hashtags.join(" ")}`
    : "";

  return (
    <div className="space-y-6">
      {/* Step 1: Product Picker + Campaign Configuration */}
      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* Product selection list */}
        <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">
                {tr("1. Choisissez le produit à promouvoir", "1. اختر المنتج للترويج")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {tr(
                  "L'IA récupère automatiquement la photo, le prix, la promo et les points forts.",
                  "يجلب الذكاء الاصطناعي الصورة والسعر والتخفيض والمميزات تلقائياً.",
                )}
              </p>
            </div>
            <Badge variant="secondary">
              {products.length} {tr("produits", "منتجات")}
            </Badge>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("Rechercher un produit ou une catégorie…", "ابحث عن منتج أو قسم…")}
              className="pl-9"
            />
          </div>

          {productsQuery.isLoading ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {tr("Aucun produit trouvé.", "لم يتم العثور على أي منتج.")}
            </p>
          ) : (
            <div className="grid max-h-[340px] gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {filteredProducts.map((prod) => {
                const img = [...(prod.product_images ?? [])].sort(
                  (a, b) => a.position - b.position,
                )[0]?.url;
                const active = prod.id === selectedId;
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(prod.id);
                      setPack(null);
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-2.5 text-left transition",
                      active
                        ? "border-primary bg-primary-soft/60 ring-1 ring-primary"
                        : "hover:border-primary/40 hover:bg-muted/30",
                    )}
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-primary-soft">
                      {img ? (
                        <img src={img} alt={prod.name_fr} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">
                          IMG
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{prod.name_fr}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {prod.categories?.name_fr ?? tr("Catalogue", "الكتالوج")}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span className="font-semibold text-primary">
                          {formatPriceDt(prod.promo_price ?? prod.price)}
                        </span>
                        {prod.promo_price != null && prod.promo_price < prod.price && (
                          <span className="text-muted-foreground line-through">
                            {formatPriceDt(prod.price)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Campaign brief */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border bg-card p-5 shadow-card">
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold">
                {tr("2. Paramètres de la campagne pub", "2. إعدادات الحملة الإعلانية")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {tr(
                  "Adaptez l'angle de vente pour Facebook, Instagram et vos publicités sponsorisées.",
                  "اختر أسلوب التسويق لفيسبوك وإنستغرام والإعلانات الممولة.",
                )}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>{tr("Objectif marketing", "هدف الحملة")}</Label>
              <Select value={goal} onValueChange={(v) => setGoal(v as SocialGoal)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOALS.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {tr(g.fr, g.ar)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {GOALS.find((g) => g.id === goal)?.hintFr}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{tr("Ton de communication", "نبرة الإعلان")}</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as SocialTone)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map((tn) => (
                      <SelectItem key={tn.id} value={tn.id}>
                        {tr(tn.fr, tn.ar)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Langues des posts", "لغات المنشورات")}</Label>
                <Select value={languages} onValueChange={(v) => setLanguages(v as SocialLanguage)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">{tr("Français + Arabe", "فرنسية + عربية")}</SelectItem>
                    <SelectItem value="fr">{tr("Français uniquement", "فرنسية فقط")}</SelectItem>
                    <SelectItem value="ar">{tr("Arabe prioritaire", "عربية أساساً")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="custom-offer">
                {tr("Offre ou message spécial (facultatif)", "عرض خاص أو ملاحظة (اختياري)")}
              </Label>
              <Textarea
                id="custom-offer"
                rows={2}
                maxLength={300}
                value={customOffer}
                onChange={(e) => setCustomOffer(e.target.value)}
                placeholder={tr(
                  "Ex. Livraison offerte dès 220 DT, stock limité cette semaine, cadeau offert…",
                  "مثال: توصيل مجاني هذا الأسبوع، كمية محدودة…",
                )}
              />
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={!selectedProduct || generate.isPending}
            className="w-full"
          >
            {generate.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            {generate.isPending
              ? tr("Génération de votre pack pub & vidéo…", "جارٍ إنشاء الحملة والفيديو…")
              : tr(
                  "Générer la vidéo & les posts Facebook / Instagram",
                  "إنشاء الفيديو ومنشورات فيسبوك وإنستغرام",
                )}
          </Button>
        </div>
      </form>

      {/* Step 2: Generated Pack Output */}
      {pack && selectedProduct && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-primary-soft/50 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">
                  {tr("Pack marketing prêt pour", "الحملة التسويقية جاهزة لـ")}{" "}
                  <span className="text-primary">{selectedProduct.name_fr}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {packSource === "openai"
                    ? tr("Généré sur mesure par OpenAI", "تم الإنشاء بواسطة OpenAI")
                    : tr(
                        "Généré par le moteur intelligent local (ajoutez OPENAI_API_KEY sur le serveur pour activer GPT)",
                        "تم الإنشاء بالمحرك الذكي المحلي (أضف OPENAI_API_KEY لتفعيل GPT)",
                      )}
                </p>
              </div>
            </div>
            <Badge variant={packSource === "openai" ? "default" : "secondary"}>
              {packSource === "openai" ? "OpenAI" : tr("Mode Rapide", "الوضع السريع")}
            </Badge>
          </div>

          <Tabs defaultValue="video" className="space-y-4">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="video" className="gap-1.5">
                <Clapperboard className="h-4 w-4" />
                {tr("Vidéo Pub & Reels", "فيديو إعلاني")}
              </TabsTrigger>
              <TabsTrigger value="facebook" className="gap-1.5">
                <Facebook className="h-4 w-4" />
                {tr("Post Facebook", "منشور فيسبوك")}
              </TabsTrigger>
              <TabsTrigger value="instagram" className="gap-1.5">
                <Instagram className="h-4 w-4" />
                {tr("Instagram & Stories", "إنستغرام وستوري")}
              </TabsTrigger>
              <TabsTrigger value="ads" className="gap-1.5">
                <Megaphone className="h-4 w-4" />
                {tr("Meta Ads & Arabe", "إعلانات ممولة + عربي")}
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: Interactive Video Studio + Voiceover */}
            <TabsContent value="video" className="space-y-4">
              <PromoVideoStudio
                productName={selectedProduct.name_fr}
                productSlug={selectedProduct.slug}
                imageUrl={selectedImage}
                price={Number(selectedProduct.price)}
                promoPrice={
                  selectedProduct.promo_price == null ? null : Number(selectedProduct.promo_price)
                }
                storeName={storeName}
                scenes={pack.video_script.scenes}
                onScenesChange={handleScenesChange}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-2xl border bg-card p-4 shadow-card">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Volume2 className="h-4 w-4 text-primary" />
                      {tr("Script Voix-Off (12 sec)", "نص التعليق الصوتي")}
                    </span>
                    <CopyButton
                      text={pack.video_script.voiceover}
                      label={tr("Voix-off copiée !", "تم نسخ النص!")}
                    />
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {pack.video_script.voiceover}
                  </p>
                </div>
                <div className="space-y-2 rounded-2xl border bg-card p-4 shadow-card">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Music className="h-4 w-4 text-primary" />
                    {tr("Ambiance musicale conseillée", "الموسيقى المقترحة")}
                  </span>
                  <p className="text-sm text-muted-foreground">{pack.video_script.music_mood}</p>
                  <p className="text-xs text-muted-foreground">
                    {tr(
                      "Astuce : ajoutez un son tendance directement dans Instagram Reels ou Facebook Reels après l'import de votre vidéo.",
                      "نصيحة: أضف موسيقى رائجة مباشرة في Reels بعد رفع الفيديو.",
                    )}
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: Facebook Post */}
            <TabsContent value="facebook">
              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Facebook className="h-5 w-5 text-blue-600" />
                      <h3 className="font-semibold">
                        {tr("Post Page Facebook prêt à publier", "منشور فيسبوك جاهز للنشر")}
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <CopyButton
                        text={fbFullPost}
                        label={tr("Post Facebook copié !", "تم نسخ منشور فيسبوك!")}
                      />
                      <Button asChild size="sm">
                        <a
                          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productPublicUrl)}&quote=${encodeURIComponent(pack.facebook.hook)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          {tr("Ouvrir Facebook", "فتح فيسبوك")}
                        </a>
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    readOnly
                    rows={11}
                    value={fbFullPost}
                    className="resize-none bg-muted/20 font-sans text-sm leading-relaxed"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {pack.facebook.hashtags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Facebook feed visual preview */}
                <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
                  <div className="flex items-center gap-3 border-b p-3.5">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {storeName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{storeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {tr("Sponsorisé · À l'instant", "ممول · الآن")}
                      </p>
                    </div>
                  </div>
                  <p className="line-clamp-3 px-3.5 py-2.5 text-xs leading-relaxed">
                    {pack.facebook.body}
                  </p>
                  {selectedImage && (
                    <img
                      src={selectedImage}
                      alt={selectedProduct.name_fr}
                      className="aspect-square w-full object-cover"
                    />
                  )}
                  <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{selectedProduct.name_fr}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatPriceDt(selectedProduct.promo_price ?? selectedProduct.price)} ·{" "}
                        {pack.facebook.cta}
                      </p>
                    </div>
                    <Badge>{tr("Commander", "اطلب")}</Badge>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: Instagram + Stories */}
            <TabsContent value="instagram">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Instagram className="h-5 w-5 text-pink-600" />
                      <h3 className="font-semibold">
                        {tr("Légende Instagram + Hashtags", "وصف إنستغرام والوسوم")}
                      </h3>
                    </div>
                    <CopyButton
                      text={igFullCaption}
                      label={tr("Légende Instagram copiée !", "تم نسخ وصف إنستغرام!")}
                    />
                  </div>
                  <Textarea
                    readOnly
                    rows={10}
                    value={igFullCaption}
                    className="resize-none bg-muted/20 text-sm leading-relaxed"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {pack.instagram.hashtags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
                  <h3 className="font-semibold">
                    {tr("Séquence 3 Stories Instagram", "تسلسل 3 ستوريز إنستغرام")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {tr(
                      "Collez ces textes courts sur 3 stories successives avec le sticker Lien vers la fiche produit.",
                      "انشر هذه النصوص القصيرة في 3 ستوريز متتالية مع رابط المنتج.",
                    )}
                  </p>
                  <div className="space-y-3">
                    {pack.instagram.story_slides.map((slide, i) => (
                      <div
                        key={i}
                        className="flex items-start justify-between gap-3 rounded-xl border bg-primary-soft/40 p-3.5"
                      >
                        <div>
                          <span className="text-[11px] font-semibold uppercase text-primary">
                            Story {i + 1}
                          </span>
                          <p className="mt-1 text-sm font-medium">{slide}</p>
                        </div>
                        <CopyButton
                          text={slide}
                          label={tr(`Story ${i + 1} copiée !`, `تم نسخ الستوري ${i + 1}!`)}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {tr("Lien direct produit :", "رابط المنتج المباشر:")}
                    </span>{" "}
                    <span className="break-all">{productPublicUrl}</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 4: Meta Ads + Arabic */}
            <TabsContent value="ads">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">
                      {tr("Pack Publicité Meta Ads (FB & IG)", "نصوص إعلانات Meta Ads")}
                    </h3>
                    <CopyButton
                      text={`Texte principal:\n${pack.ad_copy.primary_text}\n\nTitre:\n${pack.ad_copy.headline}\n\nDescription:\n${pack.ad_copy.description}\n\nURL:\n${productPublicUrl}`}
                      label={tr("Pack Meta Ads copié !", "تم نسخ الإعلان!")}
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-xl border bg-muted/20 p-3">
                      <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                        {tr("Texte principal (Primary Text)", "النص الرئيسي")}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm">
                        {pack.ad_copy.primary_text}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-3">
                      <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                        {tr("Titre court (Headline)", "العنوان")}
                      </p>
                      <p className="mt-1 text-sm font-semibold">{pack.ad_copy.headline}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-3">
                      <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                        {tr("Description", "الوصف المختصر")}
                      </p>
                      <p className="mt-1 text-sm">{pack.ad_copy.description}</p>
                    </div>
                  </div>
                </div>

                {pack.arabic ? (
                  <div dir="rtl" className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">النسخة العربية الجاهزة للنشر</h3>
                      <CopyButton text={pack.arabic.facebook_post} label="تم نسخ المنشور العربي!" />
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">
                          منشور فيسبوك
                        </p>
                        <Textarea
                          readOnly
                          rows={6}
                          value={pack.arabic.facebook_post}
                          className="resize-none bg-muted/20 text-sm"
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">
                          وصف إنستغرام
                        </p>
                        <Textarea
                          readOnly
                          rows={4}
                          value={pack.arabic.instagram_caption}
                          className="resize-none bg-muted/20 text-sm"
                        />
                      </div>
                      <div className="rounded-xl border bg-primary-soft/40 p-3 text-sm">
                        <p className="font-semibold">{pack.arabic.video_hook}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {pack.arabic.video_cta}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    {tr(
                      "Sélectionnez « Français + Arabe » dans les paramètres pour générer également la version arabe.",
                      "اختر «فرنسية + عربية» لتوليد النسخة العربية أيضاً.",
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
