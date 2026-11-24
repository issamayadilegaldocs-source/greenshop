import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  ImagePlus,
  Layers,
  Loader2,
  Save,
  Sparkles,
  Star,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DescriptionGenerator } from "@/components/admin/ai/DescriptionGenerator";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { uploadCatalogImage } from "@/lib/storage";
import { dbErrorMessage, slugify } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { categoryPath, type Category } from "@/components/admin/categories/types";
import { fetchCategoryAttributes, type CategoryAttribute, type ProductForEdit } from "./data";
import { combinations, comboKey, STATUS_LABELS, type ImageRow, type VariantRow } from "./types";

type AttrValue = string | string[] | boolean | undefined;
type Status = "draft" | "published" | "archived";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
let keySeq = 0;
const newKey = () => `k${++keySeq}`;
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const str = (n: number | null | undefined) => (n == null ? "" : String(n));

function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string | undefined;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string | undefined;
  required?: boolean | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function initialValues(initial: ProductForEdit | null): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {};
  for (const v of initial?.values ?? []) {
    if (v.option_id) {
      const prev = out[v.attribute_id];
      out[v.attribute_id] = Array.isArray(prev)
        ? [...prev, v.option_id]
        : prev
          ? [prev as string, v.option_id]
          : v.option_id;
    } else if (v.value_boolean != null) out[v.attribute_id] = v.value_boolean;
    else if (v.value_number != null) out[v.attribute_id] = String(v.value_number);
    else if (v.value_date) out[v.attribute_id] = v.value_date;
    else if (v.value_text != null) out[v.attribute_id] = v.value_text;
  }
  return out;
}

function emptyVariant(sku: string, price = "", cost = ""): VariantRow {
  return {
    key: newKey(),
    options: {},
    sku,
    price,
    promo_price: "",
    cost,
    barcode: "",
    is_active: true,
    initial_stock: "0",
  };
}

export function ProductForm({
  categories,
  initial,
}: {
  categories: Category[];
  initial: ProductForEdit | null;
}) {
  const { tr, locale } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const p = initial?.product;

  const [name_fr, setNameFr] = useState(p?.name_fr ?? "");
  const [name_ar, setNameAr] = useState(p?.name_ar ?? "");
  const [slug, setSlug] = useState(p?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!p);
  const [sku, setSku] = useState(p?.sku ?? "");
  const [categoryId, setCategoryId] = useState(p?.category_id ?? "");
  const [brand, setBrand] = useState(p?.brand ?? "");
  const [model, setModel] = useState(p?.model ?? "");
  const [warranty, setWarranty] = useState(p?.warranty ?? "");
  const [status, setStatus] = useState<Status>((p?.status as Status) ?? "draft");
  const [featured, setFeatured] = useState(p?.is_featured ?? false);
  const [descFr, setDescFr] = useState(p?.description_fr ?? "");
  const [descAr, setDescAr] = useState(p?.description_ar ?? "");
  const [purchase, setPurchase] = useState(str(initial?.purchasePrice ?? null));
  const [values, setValues] = useState<Record<string, AttrValue>>(() => initialValues(initial));
  const [hasVariants, setHasVariants] = useState(p?.has_variants ?? false);
  const [variants, setVariants] = useState<VariantRow[]>(() =>
    initial?.variants.length
      ? initial.variants.map((v) => ({
          key: newKey(),
          id: v.id,
          options: v.options,
          sku: v.sku,
          price: str(v.price),
          promo_price: str(v.promo_price),
          cost: str(v.cost),
          barcode: v.barcode ?? "",
          is_active: v.is_active,
          initial_stock: "0",
          current_stock: v.stock,
        }))
      : [emptyVariant("")],
  );
  const [axisSel, setAxisSel] = useState<Record<string, string[]>>(() => {
    const sel: Record<string, string[]> = {};
    for (const v of initial?.variants ?? [])
      for (const [a, o] of Object.entries(v.options))
        if (!(sel[a] ??= []).includes(o)) sel[a]!.push(o);
    return sel;
  });
  const [defaults, setDefaults] = useState({ price: "", promo: "", stock: "0" });
  const [images, setImages] = useState<ImageRow[]>(() =>
    (initial?.images ?? []).map((i) => ({
      key: newKey(),
      id: i.id,
      url: i.url,
      storage_path: i.storage_path,
    })),
  );
  const removedPaths = useRef<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const attrsQuery = useQuery({
    queryKey: ["admin", "category-attributes", categoryId],
    enabled: !!categoryId,
    queryFn: () => fetchCategoryAttributes(categoryId),
  });
  const attrs = attrsQuery.data ?? [];
  const specAttrs = attrs.filter((a) => !a.is_variant);
  const variantAttrs = attrs.filter((a) => a.is_variant);
  const canHaveVariants = variantAttrs.length > 0;
  const useVariants = hasVariants && canHaveVariants;

  const catLabel = (id: string) =>
    categoryPath(categories, id)
      .map((c) => (locale === "ar" && c.name_ar) || c.name_fr)
      .join(" › ");
  const optLabel = (a: CategoryAttribute, id: string) => {
    const o = a.options.find((x) => x.id === id);
    return o ? (locale === "ar" && o.label_ar) || o.label_fr || o.value : "?";
  };
  const optCode = (a: CategoryAttribute, id: string) =>
    slugify(a.options.find((x) => x.id === id)?.value ?? "").toUpperCase();

  function onName(v: string) {
    setNameFr(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  function onCategory(id: string) {
    setCategoryId(id);
    setValues({});
    setAxisSel({});
    if (hasVariants) {
      setHasVariants(false);
      setVariants((rows) => [{ ...(rows[0] ?? emptyVariant(sku)), options: {} }]);
    }
  }

  function toggleVariants(on: boolean) {
    setHasVariants(on);
    if (!on)
      setVariants((rows) => [
        {
          ...(rows.find((r) => r.is_active) ?? rows[0] ?? emptyVariant(sku)),
          options: {},
          sku: sku || (rows[0]?.sku ?? ""),
        },
      ]);
    else {
      const base = variants[0];
      setDefaults({ price: base?.price ?? "", promo: base?.promo_price ?? "", stock: "0" });
      setVariants((rows) => rows.filter((r) => Object.keys(r.options).length > 0));
    }
  }

  function generate() {
    const combos = combinations(
      variantAttrs.map((a) => ({ id: a.id, optionIds: axisSel[a.id] ?? [] })),
    );
    if (!combos.length) {
      toast.error(tr("Choisissez au moins une valeur.", "اختر قيمة واحدة على الأقل."));
      return;
    }
    if (combos.length > 200) {
      toast.error(
        tr("Trop de combinaisons (200 maximum).", "عدد كبير جداً من التركيبات (200 كحد أقصى)."),
      );
      return;
    }
    const existing = new Map(variants.map((r) => [comboKey(r.options), r]));
    const rows = combos.map((options) => {
      const found = existing.get(comboKey(options));
      if (found) return found;
      const suffix = variantAttrs
        .filter((a) => options[a.id])
        .map((a) => optCode(a, options[a.id]!))
        .join("-");
      return {
        ...emptyVariant(`${sku || "SKU"}-${suffix}`, defaults.price, purchase),
        options,
        promo_price: defaults.promo,
        initial_stock: defaults.stock || "0",
      };
    });
    const dropped = variants.filter((r) => !rows.includes(r)).length;
    setVariants(rows);
    toast.success(
      tr(`${rows.length} variante(s)`, `${rows.length} متغير(ات)`) +
        (dropped ? tr(` — ${dropped} retirée(s)`, ` — ${dropped} محذوف(ة)`) : ""),
    );
  }

  function patchVariant(key: string, patch: Partial<VariantRow>) {
    setVariants((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, Math.max(0, 20 - images.length));
    setUploading((n) => n + list.length);
    for (const f of list) {
      try {
        const { path, url } = await uploadCatalogImage(f, "products");
        setImages((rows) => [...rows, { key: newKey(), url, storage_path: path }]);
      } catch (e) {
        toast.error(`${f.name} : ${dbErrorMessage(e)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function moveImage(i: number, dir: -1 | 1) {
    setImages((rows) => {
      const j = i + dir;
      if (j < 0 || j >= rows.length) return rows;
      const next = [...rows];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  function removeImage(i: number) {
    setImages((rows) => {
      const r = rows[i];
      if (r?.storage_path) removedPaths.current.push(r.storage_path);
      return rows.filter((_, x) => x !== i);
    });
  }

  const rows = useVariants ? variants : variants.slice(0, 1);

  function validate(): string[] {
    const errs: string[] = [];
    if (!name_fr.trim())
      errs.push(tr("Le nom (français) est obligatoire.", "الاسم بالفرنسية إجباري."));
    if (!SLUG_RE.test(slug))
      errs.push(
        tr("Adresse web invalide : lettres minuscules, chiffres et tirets.", "رابط غير صالح."),
      );
    if (!sku.trim()) errs.push(tr("La référence (SKU) est obligatoire.", "المرجع إجباري."));
    if (!categoryId) errs.push(tr("Choisissez une catégorie.", "اختر قسماً."));
    for (const a of specAttrs) {
      const v = values[a.id];
      const empty = v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      if (a.is_required && empty)
        errs.push(tr(`« ${a.name_fr} » est obligatoire.`, `«${a.name_ar || a.name_fr}» إجباري.`));
      if (
        (a.type === "number" || a.type === "measurement") &&
        typeof v === "string" &&
        v.trim() &&
        !Number.isFinite(num(v))
      )
        errs.push(
          tr(
            `« ${a.name_fr} » doit être un nombre.`,
            `«${a.name_ar || a.name_fr}» يجب أن يكون رقماً.`,
          ),
        );
    }
    if (!rows.length)
      errs.push(tr("Ajoutez au moins une variante.", "أضف متغيراً واحداً على الأقل."));
    if (!rows.some((r) => r.is_active))
      errs.push(
        tr("Au moins une variante doit être active.", "يجب أن يكون متغير واحد على الأقل نشطاً."),
      );
    const skus = new Set<string>();
    rows.forEach((r, i) => {
      const label = useVariants ? `#${i + 1}` : "";
      const price = num(r.price);
      const promo = num(r.promo_price);
      if (price == null || !Number.isFinite(price) || price < 0)
        errs.push(tr(`Prix de vente invalide ${label}`, `سعر بيع غير صالح ${label}`));
      if (
        promo != null &&
        (!Number.isFinite(promo) || promo < 0 || (price != null && promo >= price))
      )
        errs.push(
          tr(
            `Le prix promo doit être inférieur au prix ${label}`,
            `يجب أن يكون السعر الترويجي أقل من السعر ${label}`,
          ),
        );
      if (useVariants) {
        const s = r.sku.trim().toUpperCase();
        if (!s) errs.push(tr(`Référence manquante ${label}`, `مرجع ناقص ${label}`));
        else if (skus.has(s))
          errs.push(tr(`Référence en double : ${r.sku}`, `مرجع مكرر: ${r.sku}`));
        skus.add(s);
      }
      if (!r.id) {
        const st = num(r.initial_stock);
        if (st != null && (!Number.isInteger(st) || st < 0))
          errs.push(tr(`Stock initial invalide ${label}`, `مخزون أولي غير صالح ${label}`));
      }
    });
    return errs;
  }

  const save = useMutation({
    mutationFn: async () => {
      const attributes: Record<string, string | null>[] = [];
      for (const a of specAttrs) {
        const v = values[a.id];
        if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
        const base = { attribute_id: a.id };
        if (a.type === "multi_select" && Array.isArray(v))
          v.forEach((o) => attributes.push({ ...base, option_id: o }));
        else if (a.type === "dropdown" || a.type === "color")
          attributes.push({ ...base, option_id: String(v) });
        else if (a.type === "boolean") attributes.push({ ...base, value_boolean: String(v) });
        else if (a.type === "number" || a.type === "measurement")
          attributes.push({ ...base, value_number: String(num(String(v))) });
        else if (a.type === "date") attributes.push({ ...base, value_date: String(v) });
        else attributes.push({ ...base, value_text: String(v).trim() });
      }
      const payloadVariants = rows.map((r) => ({
        id: r.id ?? null,
        sku: useVariants ? r.sku.trim() : sku.trim(),
        price: String(num(r.price)),
        promo_price: r.promo_price.trim() ? String(num(r.promo_price)) : null,
        cost: useVariants
          ? r.cost.trim()
            ? String(num(r.cost))
            : purchase || "0"
          : purchase || "0",
        barcode: r.barcode.trim() || null,
        is_active: useVariants ? r.is_active : true,
        initial_stock: r.id ? null : String(num(r.initial_stock) ?? 0),
        options: useVariants
          ? Object.entries(r.options).map(([attribute_id, option_id]) => ({
              attribute_id,
              option_id,
            }))
          : [],
      }));
      const { data, error } = await supabase.rpc("save_product", {
        _product: {
          id: p?.id ?? null,
          category_id: categoryId,
          name_fr: name_fr.trim(),
          name_ar: name_ar.trim(),
          slug,
          sku: sku.trim(),
          description_fr: descFr.trim(),
          description_ar: descAr.trim(),
          brand,
          model,
          warranty,
          status,
          is_featured: featured,
          has_variants: useVariants,
          purchase_price: purchase.trim() ? String(num(purchase)) : "0",
        } as Json,
        _attributes: attributes as Json,
        _variants: payloadVariants as Json,
        _images: images.map((i) => ({
          url: i.url,
          storage_path: i.storage_path,
          alt: name_fr.trim(),
        })) as Json,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (id) => {
      const paths = removedPaths.current.splice(0);
      if (paths.length) await supabase.storage.from("catalog").remove(paths);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "products"] }),
        qc.invalidateQueries({ queryKey: ["admin", "product"] }),
        qc.invalidateQueries({ queryKey: ["admin", "inventory"] }),
        qc.invalidateQueries({ queryKey: ["public"] }),
      ]);
      toast.success(
        p ? tr("Produit enregistré", "تم حفظ المنتج") : tr("Produit créé", "تم إنشاء المنتج"),
      );
      if (!p)
        navigate({ to: "/admin/products/$productId", params: { productId: id }, replace: true });
    },
    onError: (e) => {
      const msg = dbErrorMessage(e);
      setErrors([msg]);
      toast.error(msg);
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (errs.length) {
      toast.error(tr("Vérifiez les champs signalés.", "تحقق من الحقول المشار إليها."));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    save.mutate();
  }

  const selectedCount = useMemo(
    () =>
      combinations(variantAttrs.map((a) => ({ id: a.id, optionIds: axisSel[a.id] ?? [] }))).length,
    [variantAttrs, axisSel],
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild size="icon" variant="outline" aria-label={tr("Retour", "رجوع")}>
            <Link to="/admin/products">
              <ArrowLeft className="rtl:rotate-180" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {p ? name_fr || p.name_fr : tr("Nouveau produit", "منتج جديد")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {p
                ? `${p.sku} · ${tr(STATUS_LABELS[status]![0], STATUS_LABELS[status]![1])}`
                : tr("Remplissez la fiche puis enregistrez.", "املأ البطاقة ثم احفظ.")}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {p && p.status === "published" && (
            <Button asChild variant="outline">
              <a href={`/product/${p.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink /> {tr("Voir en boutique", "عرض في المتجر")}
              </a>
            </Button>
          )}
          <Button type="submit" disabled={save.isPending || uploading > 0}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}{" "}
            {tr("Enregistrer", "حفظ")}
          </Button>
        </div>
      </div>

      {errors.length > 0 && (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <p className="font-medium text-destructive">
            {tr("Le produit n'a pas été enregistré :", "لم يتم حفظ المنتج:")}
          </p>
          <ul className="mt-1 list-disc ps-5 text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Section title={tr("Informations", "المعلومات")}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={tr("Nom (français)", "الاسم (فرنسية)")} required>
                <Input value={name_fr} onChange={(e) => onName(e.target.value)} maxLength={160} />
              </Field>
              <Field label={tr("Nom (arabe)", "الاسم (عربية)")}>
                <Input
                  dir="rtl"
                  value={name_ar}
                  onChange={(e) => setNameAr(e.target.value)}
                  maxLength={160}
                />
              </Field>
              <Field label={tr("Adresse web", "الرابط")} required hint={`/product/${slug || "…"}`}>
                <Input
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                />
              </Field>
              <Field label={tr("Référence (SKU)", "المرجع (SKU)")} required>
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase().replace(/\s+/g, "-"))}
                  maxLength={60}
                />
              </Field>
              <Field label={tr("Catégorie", "القسم")} required className="md:col-span-2">
                <Select value={categoryId} onValueChange={onCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder={tr("Choisir une catégorie", "اختر قسماً")} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {catLabel(c.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={tr("Marque", "العلامة")}>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} />
              </Field>
              <Field label={tr("Modèle", "الطراز")}>
                <Input value={model} onChange={(e) => setModel(e.target.value)} maxLength={80} />
              </Field>
              <Field label={tr("Garantie", "الضمان")} hint={tr("Ex. : 12 mois", "مثال: 12 شهراً")}>
                <Input
                  value={warranty}
                  onChange={(e) => setWarranty(e.target.value)}
                  maxLength={80}
                />
              </Field>
            </div>
          </Section>

          <Section
            title={tr("Description", "الوصف")}
            actions={
              <Button type="button" variant="outline" size="sm" onClick={() => setAiOpen(true)}>
                <Sparkles /> {tr("Rédiger avec l'IA", "اكتب بالذكاء الاصطناعي")}
              </Button>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={tr("Français", "الفرنسية")}>
                <Textarea
                  rows={9}
                  value={descFr}
                  onChange={(e) => setDescFr(e.target.value)}
                  maxLength={8000}
                />
              </Field>
              <Field label={tr("Arabe", "العربية")}>
                <Textarea
                  dir="rtl"
                  rows={9}
                  value={descAr}
                  onChange={(e) => setDescAr(e.target.value)}
                  maxLength={8000}
                />
              </Field>
            </div>
          </Section>

          <Section
            title={tr("Photos", "الصور")}
            description={tr(
              "La première photo est l'image principale. JPG, PNG ou WEBP, 5 Mo max.",
              "الصورة الأولى هي الرئيسية. 5 ميغابايت كحد أقصى.",
            )}
            actions={
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  multiple
                  className="hidden"
                  onChange={(e) => onFiles(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={images.length >= 20}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}{" "}
                  {tr("Ajouter des photos", "إضافة صور")}
                </Button>
              </>
            }
          >
            {images.length === 0 && !uploading ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-sm text-muted-foreground hover:border-primary hover:text-primary"
              >
                <ImagePlus className="h-6 w-6" />{" "}
                {tr("Aucune photo — cliquez pour en ajouter", "لا توجد صور — انقر للإضافة")}
              </button>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {images.map((img, i) => (
                  <li
                    key={img.key}
                    className="group relative overflow-hidden rounded-xl border bg-muted"
                  >
                    <img src={img.url} alt="" className="aspect-square w-full object-cover" />
                    {i === 0 && (
                      <Badge className="absolute start-2 top-2">{tr("Principale", "رئيسية")}</Badge>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-background/90 p-1.5">
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={i === 0}
                          onClick={() => moveImage(i, -1)}
                          aria-label={tr("Avancer", "تقديم")}
                        >
                          <ArrowLeft className="rtl:rotate-180" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={i === images.length - 1}
                          onClick={() => moveImage(i, 1)}
                          aria-label={tr("Reculer", "تأخير")}
                        >
                          <ArrowRight className="rtl:rotate-180" />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeImage(i)}
                        aria-label={tr("Supprimer la photo", "حذف الصورة")}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
                {uploading > 0 &&
                  Array.from({ length: uploading }).map((_, i) => (
                    <li
                      key={`u${i}`}
                      className="grid aspect-square place-items-center rounded-xl border border-dashed"
                    >
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </li>
                  ))}
              </ul>
            )}
          </Section>

          <Section
            title={tr("Caractéristiques", "الخصائص")}
            description={
              categoryId
                ? tr(
                    "Champs définis par la catégorie (et ses catégories parentes).",
                    "حقول يحددها القسم وأقسامه الأم.",
                  )
                : tr(
                    "Choisissez une catégorie pour afficher ses caractéristiques.",
                    "اختر قسماً لعرض خصائصه.",
                  )
            }
          >
            {attrsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{tr("Chargement…", "جارٍ التحميل…")}</p>
            ) : specAttrs.length === 0 ? (
              categoryId ? (
                <p className="text-sm text-muted-foreground">
                  {tr("Cette catégorie n'a pas de caractéristiques.", "هذا القسم ليس له خصائص.")}{" "}
                  <Link to="/admin/categories" className="text-primary hover:underline">
                    {tr("En ajouter", "إضافة")}
                  </Link>
                </p>
              ) : null
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {specAttrs.map((a) => (
                  <AttributeInput
                    key={a.id}
                    attr={a}
                    value={values[a.id]}
                    onChange={(v) => setValues((s) => ({ ...s, [a.id]: v }))}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title={tr("Prix et variantes", "الأسعار والمتغيرات")}
            description={
              useVariants
                ? tr(
                    "Chaque combinaison a sa référence, son prix et son stock.",
                    "لكل تركيبة مرجعها وسعرها ومخزونها.",
                  )
                : undefined
            }
            actions={
              canHaveVariants ? (
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={hasVariants} onCheckedChange={toggleVariants} />
                  {tr("Plusieurs variantes", "عدة متغيرات")} (
                  {variantAttrs.map((a) => (locale === "ar" && a.name_ar) || a.name_fr).join(", ")})
                </label>
              ) : undefined
            }
          >
            <div className="mb-4 max-w-xs">
              <Field
                label={tr("Prix d'achat (coût)", "سعر الشراء (التكلفة)")}
                hint={tr(
                  "Visible uniquement par les administrateurs. Sert au calcul des marges.",
                  "مرئي للمشرفين فقط. يستعمل لحساب الهوامش.",
                )}
              >
                <Input
                  inputMode="decimal"
                  value={purchase}
                  onChange={(e) => setPurchase(e.target.value)}
                  placeholder="0.000"
                />
              </Field>
            </div>

            {!useVariants ? (
              <SimplePricing
                row={variants[0] ?? emptyVariant(sku)}
                onChange={(patch) =>
                  setVariants((rs) => [
                    { ...(rs[0] ?? emptyVariant(sku)), ...patch },
                    ...rs.slice(1),
                  ])
                }
              />
            ) : (
              <div className="space-y-5">
                <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
                  {variantAttrs.map((a) => (
                    <div key={a.id} className="space-y-2">
                      <p className="text-sm font-medium">
                        {(locale === "ar" && a.name_ar) || a.name_fr}
                      </p>
                      {a.options.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {tr(
                            "Aucune valeur : ajoutez-en dans la catégorie.",
                            "لا توجد قيم: أضفها في القسم.",
                          )}
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {a.options.map((o) => {
                            const on = (axisSel[a.id] ?? []).includes(o.id);
                            return (
                              <button
                                key={o.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() =>
                                  setAxisSel((s) => ({
                                    ...s,
                                    [a.id]: on
                                      ? (s[a.id] ?? []).filter((x) => x !== o.id)
                                      : [...(s[a.id] ?? []), o.id],
                                  }))
                                }
                                className={cn(
                                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition",
                                  on
                                    ? "border-primary bg-primary-soft text-primary"
                                    : "bg-card hover:border-primary/50",
                                )}
                              >
                                {o.color_hex && (
                                  <span
                                    className="h-3.5 w-3.5 rounded-full border"
                                    style={{ backgroundColor: o.color_hex }}
                                  />
                                )}
                                {(locale === "ar" && o.label_ar) || o.label_fr || o.value}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="grid gap-3 border-t pt-4 sm:grid-cols-4 sm:items-end">
                    <Field label={tr("Prix par défaut", "السعر الافتراضي")}>
                      <Input
                        inputMode="decimal"
                        value={defaults.price}
                        onChange={(e) => setDefaults((d) => ({ ...d, price: e.target.value }))}
                      />
                    </Field>
                    <Field label={tr("Promo par défaut", "الترويج الافتراضي")}>
                      <Input
                        inputMode="decimal"
                        value={defaults.promo}
                        onChange={(e) => setDefaults((d) => ({ ...d, promo: e.target.value }))}
                      />
                    </Field>
                    <Field label={tr("Stock initial", "المخزون الأولي")}>
                      <Input
                        inputMode="numeric"
                        value={defaults.stock}
                        onChange={(e) => setDefaults((d) => ({ ...d, stock: e.target.value }))}
                      />
                    </Field>
                    <Button type="button" onClick={generate} disabled={!selectedCount}>
                      <Wand2 /> {tr(`Générer (${selectedCount})`, `توليد (${selectedCount})`)}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tr(
                      "Les combinaisons existantes sont conservées. Celles retirées sont supprimées, ou désactivées si elles ont déjà été commandées.",
                      "تحفظ التركيبات الموجودة. المحذوفة تُزال أو تُعطّل إذا سبق طلبها.",
                    )}
                  </p>
                </div>

                {variants.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Layers className="h-4 w-4" />{" "}
                    {tr(
                      "Choisissez des valeurs puis cliquez sur « Générer ».",
                      "اختر القيم ثم انقر على «توليد».",
                    )}
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-start font-medium">
                            {tr("Variante", "المتغير")}
                          </th>
                          <th className="px-3 py-2 text-start font-medium">SKU</th>
                          <th className="px-3 py-2 text-start font-medium">
                            {tr("Prix", "السعر")}
                          </th>
                          <th className="px-3 py-2 text-start font-medium">
                            {tr("Promo", "ترويج")}
                          </th>
                          <th className="px-3 py-2 text-start font-medium">
                            {tr("Coût", "التكلفة")}
                          </th>
                          <th className="px-3 py-2 text-start font-medium">
                            {tr("Stock", "المخزون")}
                          </th>
                          <th className="px-3 py-2 text-start font-medium">
                            {tr("Code-barres", "الباركود")}
                          </th>
                          <th className="px-3 py-2 text-center font-medium">
                            {tr("Active", "نشط")}
                          </th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {variants.map((r) => (
                          <tr key={r.key} className={cn(!r.is_active && "opacity-60")}>
                            <td className="whitespace-nowrap px-3 py-2 font-medium">
                              {variantAttrs
                                .filter((a) => r.options[a.id])
                                .map((a) => optLabel(a, r.options[a.id]!))
                                .join(" / ")}
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                className="h-8 w-40"
                                value={r.sku}
                                onChange={(e) =>
                                  patchVariant(r.key, { sku: e.target.value.toUpperCase() })
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                className="h-8 w-24"
                                inputMode="decimal"
                                value={r.price}
                                onChange={(e) => patchVariant(r.key, { price: e.target.value })}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                className="h-8 w-24"
                                inputMode="decimal"
                                value={r.promo_price}
                                onChange={(e) =>
                                  patchVariant(r.key, { promo_price: e.target.value })
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                className="h-8 w-24"
                                inputMode="decimal"
                                value={r.cost}
                                placeholder={purchase}
                                onChange={(e) => patchVariant(r.key, { cost: e.target.value })}
                              />
                            </td>
                            <td className="px-3 py-2">
                              {r.id ? (
                                <span
                                  className="tabular-nums"
                                  title={tr(
                                    "Modifiable depuis la page Stock",
                                    "يعدل من صفحة المخزون",
                                  )}
                                >
                                  {r.current_stock ?? 0}
                                </span>
                              ) : (
                                <Input
                                  className="h-8 w-20"
                                  inputMode="numeric"
                                  value={r.initial_stock}
                                  onChange={(e) =>
                                    patchVariant(r.key, { initial_stock: e.target.value })
                                  }
                                />
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                className="h-8 w-32"
                                value={r.barcode}
                                onChange={(e) => patchVariant(r.key, { barcode: e.target.value })}
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Checkbox
                                checked={r.is_active}
                                onCheckedChange={(c) =>
                                  patchVariant(r.key, { is_active: c === true })
                                }
                                aria-label={tr("Active", "نشط")}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive"
                                onClick={() =>
                                  setVariants((rs) => rs.filter((x) => x.key !== r.key))
                                }
                                aria-label={tr("Retirer", "إزالة")}
                              >
                                <Trash2 />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {p && (
              <p className="mt-4 text-xs text-muted-foreground">
                {tr(
                  "Le stock des variantes existantes se gère depuis la page ",
                  "يدار مخزون المتغيرات الموجودة من صفحة ",
                )}
                <Link to="/admin/inventory" className="text-primary hover:underline">
                  {tr("Stock", "المخزون")}
                </Link>
                .
              </p>
            )}
          </Section>
        </div>

        <aside className="space-y-6">
          <Section title={tr("Publication", "النشر")}>
            <div className="space-y-4">
              <Field label={tr("Statut", "الحالة")}>
                <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {tr(v[0], v[1])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <p className="text-xs text-muted-foreground">
                {tr(
                  "Seuls les produits publiés sont visibles en boutique.",
                  "فقط المنتجات المنشورة تظهر في المتجر.",
                )}
              </p>
              <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                <span className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-warning" />{" "}
                  {tr("Coup de cœur (page d'accueil)", "مميز (الصفحة الرئيسية)")}
                </span>
                <Switch checked={featured} onCheckedChange={setFeatured} />
              </label>
            </div>
          </Section>
          {images[0] && (
            <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
              <img src={images[0].url} alt="" className="aspect-square w-full object-cover" />
              <div className="p-4 text-sm">
                <p className="font-medium">{name_fr || tr("Sans nom", "بدون اسم")}</p>
                <p className="text-muted-foreground">{categoryId ? catLabel(categoryId) : "—"}</p>
              </div>
            </div>
          )}
        </aside>
      </div>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {tr("Rédiger la description avec l'IA", "كتابة الوصف بالذكاء الاصطناعي")}
            </DialogTitle>
            <DialogDescription>
              {tr(
                "Vérifiez les caractéristiques, choisissez un modèle puis appliquez le texte au produit.",
                "تحقق من الخصائص، اختر نموذجاً ثم طبّق النص على المنتج.",
              )}
            </DialogDescription>
          </DialogHeader>
          <DescriptionGenerator
            initial={{
              productName: name_fr,
              categoryId: categoryId || null,
              brand,
              model,
              warranty,
            }}
            onApply={(r) => {
              if (r.description_fr) setDescFr(r.description_fr);
              if (r.description_ar) setDescAr(r.description_ar);
              setAiOpen(false);
              toast.success(
                tr(
                  "Description appliquée — pensez à enregistrer.",
                  "تم تطبيق الوصف — لا تنس الحفظ.",
                ),
              );
            }}
          />
        </DialogContent>
      </Dialog>
    </form>
  );
}

function SimplePricing({
  row,
  onChange,
}: {
  row: VariantRow;
  onChange: (patch: Partial<VariantRow>) => void;
}) {
  const { tr } = useI18n();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label={tr("Prix de vente (DT)", "سعر البيع (د.ت)")} required>
        <Input
          inputMode="decimal"
          value={row.price}
          onChange={(e) => onChange({ price: e.target.value })}
          placeholder="0.000"
        />
      </Field>
      <Field
        label={tr("Prix promo (DT)", "السعر الترويجي")}
        hint={tr("Laisser vide si aucune promo", "اتركه فارغاً إن لم يوجد")}
      >
        <Input
          inputMode="decimal"
          value={row.promo_price}
          onChange={(e) => onChange({ promo_price: e.target.value })}
        />
      </Field>
      {row.id ? (
        <Field label={tr("Stock disponible", "المخزون المتوفر")}>
          <Input value={String(row.current_stock ?? 0)} disabled />
        </Field>
      ) : (
        <Field label={tr("Stock initial", "المخزون الأولي")}>
          <Input
            inputMode="numeric"
            value={row.initial_stock}
            onChange={(e) => onChange({ initial_stock: e.target.value })}
          />
        </Field>
      )}
      <Field label={tr("Code-barres", "الباركود")}>
        <Input value={row.barcode} onChange={(e) => onChange({ barcode: e.target.value })} />
      </Field>
    </div>
  );
}

function AttributeInput({
  attr,
  value,
  onChange,
}: {
  attr: CategoryAttribute;
  value: AttrValue;
  onChange: (v: AttrValue) => void;
}) {
  const { tr, locale } = useI18n();
  const label = `${(locale === "ar" && attr.name_ar) || attr.name_fr}${attr.unit ? ` (${attr.unit})` : ""}`;
  const opt = (o: CategoryAttribute["options"][number]) =>
    (locale === "ar" && o.label_ar) || o.label_fr || o.value;
  const NONE = "__none__";
  const hint = attr.inherited
    ? tr("Hérité de la catégorie parente", "موروث من القسم الأم")
    : undefined;
  switch (attr.type) {
    case "boolean":
      return (
        <Field label={label} required={attr.is_required} hint={hint}>
          <Select
            value={value === undefined ? NONE : String(value)}
            onValueChange={(v) => onChange(v === NONE ? undefined : v === "true")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              <SelectItem value="true">{tr("Oui", "نعم")}</SelectItem>
              <SelectItem value="false">{tr("Non", "لا")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      );
    case "dropdown":
    case "color":
      return (
        <Field label={label} required={attr.is_required} hint={hint}>
          <Select
            value={typeof value === "string" && value ? value : NONE}
            onValueChange={(v) => onChange(v === NONE ? undefined : v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {attr.options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  <span className="flex items-center gap-2">
                    {o.color_hex && (
                      <span
                        className="h-3 w-3 rounded-full border"
                        style={{ backgroundColor: o.color_hex }}
                      />
                    )}
                    {opt(o)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      );
    case "multi_select": {
      const list = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
      return (
        <Field label={label} required={attr.is_required} hint={hint} className="md:col-span-2">
          <div className="flex flex-wrap gap-2">
            {attr.options.map((o) => {
              const on = list.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(on ? list.filter((x) => x !== o.id) : [...list, o.id])}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm",
                    on
                      ? "border-primary bg-primary-soft text-primary"
                      : "bg-card hover:border-primary/50",
                  )}
                >
                  {opt(o)}
                </button>
              );
            })}
          </div>
        </Field>
      );
    }
    case "number":
    case "measurement":
      return (
        <Field label={label} required={attr.is_required} hint={hint}>
          <Input
            inputMode="decimal"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );
    case "date":
      return (
        <Field label={label} required={attr.is_required} hint={hint}>
          <Input
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );
    default:
      return (
        <Field label={label} required={attr.is_required} hint={hint}>
          <Input
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            maxLength={1000}
          />
        </Field>
      );
  }
}
