import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { generateDescription } from "@/lib/ai-description.functions";
import type { DescriptionResult } from "@/lib/ai-description.schema";
import {
  categoryPath,
  type AttributeOption,
  type Category,
} from "@/components/admin/categories/types";
import { TARGET_LENGTHS, templatesQueryKey, type DescriptionTemplate } from "./types";
import { cn } from "@/lib/utils";

type AttrValue = string | string[] | boolean | undefined;
type Languages = "both" | "fr" | "ar";

const NONE = "__none__";

export type GeneratorInitial = {
  productName?: string;
  categoryId?: string | null;
  brand?: string;
  model?: string;
  warranty?: string;
};

/**
 * Admin AI writer: enter product characteristics, pick a template, get a ready-to-publish
 * French / Arabic description. `onApply` lets a product form take the result directly.
 */
export function DescriptionGenerator({
  initial,
  onApply,
}: {
  initial?: GeneratorInitial | undefined;
  onApply?: ((result: DescriptionResult) => void) | undefined;
}) {
  const { tr, locale } = useI18n();
  const [productName, setProductName] = useState(initial?.productName ?? "");
  const [categoryId, setCategoryId] = useState<string>(initial?.categoryId ?? NONE);
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [warranty, setWarranty] = useState(initial?.warranty ?? "");
  const [audience, setAudience] = useState("");
  const [highlights, setHighlights] = useState("");
  const [values, setValues] = useState<Record<string, AttrValue>>({});
  const [templateId, setTemplateId] = useState<string>("");
  const [languages, setLanguages] = useState<Languages>("both");
  const [result, setResult] = useState<DescriptionResult | null>(null);

  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("display_order")
        .order("name_fr");
      if (error) throw error;
      return data as Category[];
    },
  });

  const templates = useQuery({
    queryKey: templatesQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("description_templates")
        .select("*")
        .order("display_order")
        .order("name");
      if (error) throw error;
      return data as DescriptionTemplate[];
    },
  });
  const activeTemplates = useMemo(
    () => (templates.data ?? []).filter((t) => t.is_active),
    [templates.data],
  );

  useEffect(() => {
    if (!activeTemplates.length) return;
    if (!activeTemplates.some((t) => t.id === templateId)) setTemplateId(activeTemplates[0]!.id);
  }, [activeTemplates, templateId]);

  const attributes = useQuery({
    queryKey: ["admin", "ai-attributes", categoryId],
    enabled: categoryId !== NONE,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_category_attributes", {
        _category_id: categoryId,
      });
      if (error) throw error;
      const ids = data.map((a) => a.id);
      let options: AttributeOption[] = [];
      if (ids.length) {
        const res = await supabase
          .from("category_attribute_options")
          .select("*")
          .in("attribute_id", ids)
          .order("display_order");
        if (res.error) throw res.error;
        options = res.data;
      }
      return data
        .slice()
        .sort((a, b) => b.depth - a.depth || a.display_order - b.display_order)
        .map((a) => ({ ...a, options: options.filter((o) => o.attribute_id === a.id) }));
    },
  });

  const categoryLabel = useMemo(() => {
    if (categoryId === NONE || !categories.data) return null;
    return categoryPath(categories.data, categoryId)
      .map((c) => c.name_fr)
      .join(" > ");
  }, [categories.data, categoryId]);

  const generateFn = useServerFn(generateDescription);
  const generate = useMutation({
    mutationFn: async () => {
      const attrs: { label: string; value: string }[] = [];
      for (const a of attributes.data ?? []) {
        const v = values[a.id];
        if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
        const optLabel = (val: string) => {
          const o = a.options.find((x) => x.value === val);
          return o?.label_fr || o?.value || val;
        };
        let text: string;
        if (typeof v === "boolean") text = v ? "Oui" : "Non";
        else if (Array.isArray(v)) text = v.map(optLabel).join(", ");
        else if (a.type === "dropdown" || a.type === "color") text = optLabel(v);
        else text = a.unit ? `${v} ${a.unit}` : v;
        const label = a.is_variant ? `${a.name_fr} (options disponibles)` : a.name_fr;
        attrs.push({ label, value: text });
      }
      if (!templateId)
        throw new Error(tr("Choisissez un modèle de description.", "اختر قالب الوصف."));
      const res = await generateFn({
        data: {
          templateId,
          productName,
          categoryPath: categoryLabel,
          brand: brand || null,
          model: model || null,
          warranty: warranty || null,
          audience: audience || null,
          highlights: highlights || null,
          attributes: attrs,
          languages,
        },
      });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success(tr("Description générée", "تم إنشاء الوصف"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (productName.trim().length < 2) {
      toast.error(tr("Indiquez le nom du produit.", "أدخل اسم المنتج."));
      return;
    }
    generate.mutate();
  }

  function setVal(id: string, v: AttrValue) {
    setValues((prev) => ({ ...prev, [id]: v }));
  }

  const selectedTemplate = activeTemplates.find((t) => t.id === templateId);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form onSubmit={submit} className="space-y-5 rounded-2xl border bg-card p-5 shadow-card">
        <div>
          <p className="font-semibold">{tr("Caractéristiques du produit", "خصائص المنتج")}</p>
          <p className="text-xs text-muted-foreground">
            {tr(
              "Plus vous donnez de détails, plus la description sera précise. L'IA n'invente rien.",
              "كلما أضفت تفاصيل أكثر، كان الوصف أدق. الذكاء الاصطناعي لا يختلق معلومات.",
            )}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ai-name">{tr("Nom du produit", "اسم المنتج")} *</Label>
            <Input
              id="ai-name"
              required
              maxLength={150}
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder={tr("Ex. T-shirt col rond coton bio", "مثال: قميص قطني")}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{tr("Catégorie", "القسم")}</Label>
            {categories.isLoading ? (
              <Skeleton className="h-9" />
            ) : (
              <Select
                value={categoryId}
                onValueChange={(v) => {
                  setCategoryId(v);
                  setValues({});
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{tr("Sans catégorie", "بدون قسم")}</SelectItem>
                  {(categories.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {categoryPath(categories.data ?? [], c.id)
                        .map((p) => (locale === "ar" && p.name_ar ? p.name_ar : p.name_fr))
                        .join(" › ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-brand">{tr("Marque", "العلامة")}</Label>
            <Input
              id="ai-brand"
              maxLength={80}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-model">{tr("Modèle / référence", "الطراز / المرجع")}</Label>
            <Input
              id="ai-model"
              maxLength={80}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-warranty">{tr("Garantie", "الضمان")}</Label>
            <Input
              id="ai-warranty"
              maxLength={120}
              value={warranty}
              onChange={(e) => setWarranty(e.target.value)}
              placeholder={tr("Ex. 1 an", "مثال: سنة")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-audience">{tr("Public visé", "الفئة المستهدفة")}</Label>
            <Input
              id="ai-audience"
              maxLength={160}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder={tr("Ex. Femmes, sportifs…", "مثال: نساء، رياضيون…")}
            />
          </div>
        </div>

        {categoryId !== NONE && (
          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <p className="text-sm font-medium">{tr("Attributs de la catégorie", "خصائص القسم")}</p>
            {attributes.isLoading ? (
              <Skeleton className="h-24" />
            ) : attributes.error ? (
              <p className="text-sm text-destructive">
                {tr("Impossible de charger les attributs.", "تعذر تحميل الخصائص.")}
              </p>
            ) : !attributes.data?.length ? (
              <p className="text-sm text-muted-foreground">
                {tr(
                  "Cette catégorie n'a pas encore d'attributs.",
                  "هذا القسم لا يحتوي على خصائص بعد.",
                )}
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {attributes.data.map((a) => (
                  <AttributeField
                    key={a.id}
                    attr={a}
                    value={values[a.id]}
                    onChange={(v) => setVal(a.id, v)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="ai-highlights">
            {tr("Points forts et détails libres", "نقاط القوة وتفاصيل إضافية")}
          </Label>
          <Textarea
            id="ai-highlights"
            rows={4}
            maxLength={1500}
            value={highlights}
            onChange={(e) => setHighlights(e.target.value)}
            placeholder={tr(
              "Matière, usage, entretien, ce qui le rend unique…",
              "الخامة، الاستعمال، العناية، ما يميزه…",
            )}
          />
        </div>

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{tr("Modèle de description", "قالب الوصف")}</Label>
            {templates.isLoading ? (
              <Skeleton className="h-9" />
            ) : activeTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {tr(
                  "Aucun modèle actif. Créez-en un dans l'onglet Modèles.",
                  "لا يوجد قالب مفعّل. أنشئ واحداً في تبويب القوالب.",
                )}
              </p>
            ) : (
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedTemplate?.summary && (
              <p className="text-xs text-muted-foreground">{selectedTemplate.summary}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{tr("Langues", "اللغات")}</Label>
            <Select value={languages} onValueChange={(v) => setLanguages(v as Languages)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">{tr("Français + arabe", "الفرنسية + العربية")}</SelectItem>
                <SelectItem value="fr">{tr("Français seulement", "الفرنسية فقط")}</SelectItem>
                <SelectItem value="ar">{tr("Arabe seulement", "العربية فقط")}</SelectItem>
              </SelectContent>
            </Select>
            {selectedTemplate && (
              <p className="text-xs text-muted-foreground">
                {tr("Longueur :", "الطول:")}{" "}
                {(() => {
                  const l = TARGET_LENGTHS.find((x) => x.value === selectedTemplate.target_length);
                  return l ? tr(l.fr, l.ar) : selectedTemplate.target_length;
                })()}
              </p>
            )}
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={generate.isPending || !templateId}
        >
          {generate.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
          {generate.isPending
            ? tr("Rédaction en cours…", "جارٍ التحرير…")
            : result
              ? tr("Régénérer", "إعادة الإنشاء")
              : tr("Générer la description", "إنشاء الوصف")}
        </Button>
      </form>

      <ResultPanel
        result={result}
        pending={generate.isPending}
        onChange={setResult}
        onApply={onApply}
        onReset={() => setResult(null)}
      />
    </div>
  );
}

type AttrRow = {
  id: string;
  name_fr: string;
  name_ar: string;
  type: string;
  unit: string;
  is_required: boolean;
  is_variant: boolean;
  options: AttributeOption[];
};

function AttributeField({
  attr,
  value,
  onChange,
}: {
  attr: AttrRow;
  value: AttrValue;
  onChange: (v: AttrValue) => void;
}) {
  const { tr, locale } = useI18n();
  const label = locale === "ar" && attr.name_ar ? attr.name_ar : attr.name_fr;
  const optLabel = (o: AttributeOption) =>
    locale === "ar" && o.label_ar ? o.label_ar : o.label_fr || o.value;
  const multi = attr.type === "multi_select" || attr.is_variant;

  if (attr.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
        <Label className="text-sm">{label}</Label>
        <Select
          value={value === undefined ? NONE : value ? "yes" : "no"}
          onValueChange={(v) => onChange(v === NONE ? undefined : v === "yes")}
        >
          <SelectTrigger className="h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            <SelectItem value="yes">{tr("Oui", "نعم")}</SelectItem>
            <SelectItem value="no">{tr("Non", "لا")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (multi && attr.options.length) {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="flex items-center gap-2 text-sm">
          {label}
          {attr.is_variant && (
            <Badge variant="secondary" className="text-[10px]">
              {tr("Options disponibles", "الخيارات المتوفرة")}
            </Badge>
          )}
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {attr.options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                type="button"
                key={o.id}
                onClick={() =>
                  onChange(on ? selected.filter((x) => x !== o.value) : [...selected, o.value])
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                  on ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted",
                )}
                aria-pressed={on}
              >
                {o.color_hex && (
                  <span
                    className="h-3 w-3 rounded-full border"
                    style={{ backgroundColor: o.color_hex }}
                  />
                )}
                {optLabel(o)}
                {on && <Check className="h-3 w-3" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if ((attr.type === "dropdown" || attr.type === "color") && attr.options.length) {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm">{label}</Label>
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
              <SelectItem key={o.id} value={o.value}>
                {optLabel(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const inputType =
    attr.type === "number" || attr.type === "measurement"
      ? "number"
      : attr.type === "date"
        ? "date"
        : "text";
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        {attr.unit ? <span className="text-muted-foreground"> ({attr.unit})</span> : null}
      </Label>
      <Input
        type={inputType}
        step="any"
        maxLength={300}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ResultPanel({
  result,
  pending,
  onChange,
  onApply,
  onReset,
}: {
  result: DescriptionResult | null;
  pending: boolean;
  onChange: (r: DescriptionResult) => void;
  onApply?: ((r: DescriptionResult) => void) | undefined;
  onReset: () => void;
}) {
  const { tr } = useI18n();

  if (pending && !result) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-6 text-center shadow-card">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="font-medium">
          {tr("L'IA rédige votre description…", "الذكاء الاصطناعي يحرر الوصف…")}
        </p>
        <p className="text-xs text-muted-foreground">
          {tr("Cela prend généralement 10 à 30 secondes.", "يستغرق ذلك عادة من 10 إلى 30 ثانية.")}
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/50 p-6 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <p className="font-medium">{tr("Votre description apparaîtra ici", "سيظهر الوصف هنا")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {tr(
            "Renseignez les caractéristiques, choisissez un modèle puis cliquez sur « Générer ». Vous pourrez modifier le texte avant de le copier.",
            "أدخل الخصائص، اختر قالباً ثم اضغط «إنشاء». يمكنك تعديل النص قبل نسخه.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-4 rounded-2xl border bg-card p-5 shadow-card lg:sticky lg:top-20 lg:self-start",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />{" "}
          {tr("Description prête à publier", "وصف جاهز للنشر")}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw /> {tr("Effacer", "مسح")}
        </Button>
      </div>
      {result.description_fr !== null && (
        <LangBlock
          title="Français"
          dir="ltr"
          summary={result.summary_fr ?? ""}
          body={result.description_fr}
          onSummary={(v) => onChange({ ...result, summary_fr: v })}
          onBody={(v) => onChange({ ...result, description_fr: v })}
        />
      )}
      {result.description_ar !== null && (
        <LangBlock
          title="العربية"
          dir="rtl"
          summary={result.summary_ar ?? ""}
          body={result.description_ar}
          onSummary={(v) => onChange({ ...result, summary_ar: v })}
          onBody={(v) => onChange({ ...result, description_ar: v })}
        />
      )}
      <p className="text-xs text-muted-foreground">
        {tr("Relisez toujours le texte avant publication.", "راجع النص دائماً قبل النشر.")}
      </p>
      {onApply && (
        <Button type="button" className="w-full" onClick={() => onApply(result)}>
          <Check /> {tr("Utiliser cette description", "استعمال هذا الوصف")}
        </Button>
      )}
    </div>
  );
}

function LangBlock({
  title,
  dir,
  summary,
  body,
  onSummary,
  onBody,
}: {
  title: string;
  dir: "ltr" | "rtl";
  summary: string;
  body: string;
  onSummary: (v: string) => void;
  onBody: (v: string) => void;
}) {
  const { tr } = useI18n();
  const [copied, setCopied] = useState(false);
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(tr("Copie impossible", "تعذر النسخ"));
    }
  }

  return (
    <div className="space-y-2 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{title}</Badge>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {words} {tr("mots", "كلمة")}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? tr("Copié", "تم النسخ") : tr("Copier", "نسخ")}
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          {tr("Accroche courte", "جملة مختصرة")}
        </Label>
        <Input
          dir={dir}
          maxLength={200}
          value={summary}
          onChange={(e) => onSummary(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{tr("Description", "الوصف")}</Label>
        <Textarea
          dir={dir}
          rows={10}
          value={body}
          onChange={(e) => onBody(e.target.value)}
          className="leading-relaxed"
        />
      </div>
    </div>
  );
}
