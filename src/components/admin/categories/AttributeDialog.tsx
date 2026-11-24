import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { codify, dbErrorMessage } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import {
  ATTRIBUTE_TYPES,
  typeHasOptions,
  type AttributeType,
  type AttributeWithOptions,
} from "./types";

type OptionDraft = {
  id?: string;
  value: string;
  label_fr: string;
  label_ar: string;
  color_hex: string;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoryId: string;
  editing: AttributeWithOptions | null;
  nextOrder: number;
};

export function AttributeDialog({ open, onOpenChange, categoryId, editing, nextOrder }: Props) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const [codeTouched, setCodeTouched] = useState(false);
  const [form, setForm] = useState({
    name_fr: "",
    name_ar: "",
    code: "",
    type: "dropdown" as AttributeType,
    unit: "",
    is_required: false,
    is_filterable: true,
    is_searchable: false,
    is_variant: false,
    display_order: 0,
  });
  const [options, setOptions] = useState<OptionDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    setCodeTouched(!!editing);
    setForm({
      name_fr: editing?.name_fr ?? "",
      name_ar: editing?.name_ar ?? "",
      code: editing?.code ?? "",
      type: editing?.type ?? "dropdown",
      unit: editing?.unit ?? "",
      is_required: editing?.is_required ?? false,
      is_filterable: editing?.is_filterable ?? true,
      is_searchable: editing?.is_searchable ?? false,
      is_variant: editing?.is_variant ?? false,
      display_order: editing?.display_order ?? nextOrder,
    });
    setOptions(
      [...(editing?.category_attribute_options ?? [])]
        .sort((a, b) => a.display_order - b.display_order)
        .map((o) => ({
          id: o.id,
          value: o.value,
          label_fr: o.label_fr ?? "",
          label_ar: o.label_ar ?? "",
          color_hex: o.color_hex ?? "",
        })),
    );
  }, [open, editing, nextOrder]);

  const hasOptions = typeHasOptions(form.type);
  const canBeVariant = form.type === "dropdown" || form.type === "color";

  const save = useMutation({
    mutationFn: async () => {
      const name_fr = form.name_fr.trim();
      if (!name_fr) throw new Error(tr("Le nom est obligatoire.", "الاسم إجباري."));
      const code = codify(form.code || name_fr);
      if (!code) throw new Error(tr("Code invalide.", "رمز غير صالح."));
      const cleaned = options.map((o) => ({ ...o, value: o.value.trim() })).filter((o) => o.value);
      if (hasOptions && cleaned.length === 0)
        throw new Error(tr("Ajoutez au moins une valeur.", "أضف قيمة واحدة على الأقل."));
      const values = cleaned.map((o) => o.value.toLowerCase());
      if (new Set(values).size !== values.length)
        throw new Error(tr("Valeurs en double.", "قيم مكررة."));
      if (form.type === "color" && cleaned.some((o) => !/^#[0-9a-fA-F]{6}$/.test(o.color_hex))) {
        throw new Error(
          tr("Chaque couleur doit avoir un code couleur.", "يجب أن يكون لكل لون رمز."),
        );
      }

      const payload = {
        category_id: categoryId,
        name_fr,
        name_ar: form.name_ar.trim() || null,
        code,
        type: form.type,
        unit:
          form.type === "measurement" || form.type === "number" ? form.unit.trim() || null : null,
        is_required: form.is_required,
        is_filterable: form.is_filterable,
        is_searchable: form.is_searchable,
        is_variant: canBeVariant ? form.is_variant : false,
        display_order: Number(form.display_order) || 0,
      };

      let attributeId = editing?.id;
      if (editing) {
        const { error } = await supabase
          .from("category_attributes")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("category_attributes")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        attributeId = data.id;
      }

      const keepIds = new Set(cleaned.filter((o) => o.id).map((o) => o.id!));
      const removed = (editing?.category_attribute_options ?? []).filter(
        (o) => !hasOptions || !keepIds.has(o.id),
      );
      if (removed.length) {
        const { error } = await supabase
          .from("category_attribute_options")
          .delete()
          .in(
            "id",
            removed.map((o) => o.id),
          );
        if (error) throw error;
      }
      if (hasOptions) {
        for (const [i, o] of cleaned.entries()) {
          const row = {
            attribute_id: attributeId!,
            value: o.value,
            label_fr: o.label_fr.trim() || null,
            label_ar: o.label_ar.trim() || null,
            color_hex: form.type === "color" ? o.color_hex : null,
            display_order: i,
          };
          const { error } = o.id
            ? await supabase.from("category_attribute_options").update(row).eq("id", o.id)
            : await supabase.from("category_attribute_options").insert(row);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(tr("Attribut enregistré", "تم حفظ الخاصية"));
      qc.invalidateQueries({ queryKey: ["admin", "attributes"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const updateOption = (i: number, patch: Partial<OptionDraft>) =>
    setOptions((list) => list.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  const moveUp = (i: number) =>
    setOptions((list) => {
      if (i === 0) return list;
      const copy = [...list];
      const tmp = copy[i - 1]!;
      copy[i - 1] = copy[i]!;
      copy[i] = tmp;
      return copy;
    });

  const flags = [
    {
      key: "is_required" as const,
      fr: "Obligatoire",
      ar: "إجباري",
      hintFr: "Doit être rempli pour chaque produit",
      hintAr: "يجب تعبئتها لكل منتج",
      disabled: false,
    },
    {
      key: "is_filterable" as const,
      fr: "Filtrable",
      ar: "قابل للتصفية",
      hintFr: "Proposé comme filtre en boutique",
      hintAr: "يظهر كمرشح في المتجر",
      disabled: false,
    },
    {
      key: "is_searchable" as const,
      fr: "Recherchable",
      ar: "قابل للبحث",
      hintFr: "Inclus dans la recherche",
      hintAr: "مضمن في البحث",
      disabled: false,
    },
    {
      key: "is_variant" as const,
      fr: "Crée des variantes",
      ar: "ينشئ متغيرات",
      hintFr: "Ex. taille × couleur, stock séparé",
      hintAr: "مثلاً مقاس × لون، مخزون منفصل",
      disabled: !canBeVariant,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? tr("Modifier l'attribut", "تعديل الخاصية")
              : tr("Nouvel attribut", "خاصية جديدة")}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "Cet attribut s'applique à cette catégorie et à toutes ses sous-catégories.",
              "تنطبق هذه الخاصية على هذا القسم وكل أقسامه الفرعية.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form id="attribute-form" onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="attr-name-fr">{tr("Nom (français)", "الاسم (فرنسية)")} *</Label>
              <Input
                id="attr-name-fr"
                required
                maxLength={80}
                placeholder={tr("ex. Taille, Matière, Capacité", "مثلاً: المقاس، الخامة، السعة")}
                value={form.name_fr}
                onChange={(e) => {
                  const name_fr = e.target.value;
                  setForm((f) => ({ ...f, name_fr, code: codeTouched ? f.code : codify(name_fr) }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attr-name-ar">{tr("Nom (arabe)", "الاسم (عربية)")}</Label>
              <Input
                id="attr-name-ar"
                dir="rtl"
                maxLength={80}
                value={form.name_ar}
                onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Type", "النوع")}</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as AttributeType })}
              >
                <SelectTrigger aria-label={tr("Type", "النوع")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ATTRIBUTE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {tr(t.fr, t.ar)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attr-code">{tr("Code interne", "الرمز الداخلي")}</Label>
              <Input
                id="attr-code"
                dir="ltr"
                value={form.code}
                onChange={(e) => {
                  setCodeTouched(true);
                  setForm({
                    ...form,
                    code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                  });
                }}
              />
            </div>
            {(form.type === "measurement" || form.type === "number") && (
              <div className="space-y-1.5">
                <Label htmlFor="attr-unit">{tr("Unité", "الوحدة")}</Label>
                <Input
                  id="attr-unit"
                  maxLength={20}
                  placeholder="cm, kg, L, Go, W…"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="attr-order">{tr("Ordre d'affichage", "ترتيب العرض")}</Label>
              <Input
                id="attr-order"
                type="number"
                min={0}
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border bg-muted/40 p-4 sm:grid-cols-2">
            {flags.map((f) => (
              <label
                key={f.key}
                className={`flex items-start gap-3 ${f.disabled ? "opacity-50" : ""}`}
              >
                <Switch
                  checked={form[f.key] && !f.disabled}
                  disabled={f.disabled}
                  onCheckedChange={(v) => setForm({ ...form, [f.key]: v })}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">{tr(f.fr, f.ar)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {f.disabled
                      ? tr(
                          "Uniquement pour les types Liste ou Couleur",
                          "فقط لنوع القائمة أو اللون",
                        )
                      : tr(f.hintFr, f.hintAr)}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {hasOptions && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{tr("Valeurs possibles", "القيم الممكنة")}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setOptions((o) => [
                      ...o,
                      {
                        value: "",
                        label_fr: "",
                        label_ar: "",
                        color_hex: form.type === "color" ? "#0f766e" : "",
                      },
                    ])
                  }
                >
                  <Plus /> {tr("Ajouter une valeur", "إضافة قيمة")}
                </Button>
              </div>
              {options.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {tr(
                    "Aucune valeur. Ex. S, M, L, XL — ou Noir, Blanc.",
                    "لا توجد قيم. مثلاً S، M، L — أو أسود، أبيض.",
                  )}
                </p>
              )}
              <ul className="space-y-2">
                {options.map((o, i) => (
                  <li key={o.id ?? `new-${i}`} className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={i === 0}
                      onClick={() => moveUp(i)}
                      aria-label={tr("Monter", "إلى الأعلى")}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    {form.type === "color" && (
                      <input
                        type="color"
                        value={o.color_hex || "#000000"}
                        onChange={(e) => updateOption(i, { color_hex: e.target.value })}
                        className="h-9 w-10 shrink-0 cursor-pointer rounded-md border bg-background p-1"
                        aria-label={tr("Couleur", "اللون")}
                      />
                    )}
                    <Input
                      className="min-w-0 flex-1"
                      placeholder={tr("Valeur *", "القيمة *")}
                      maxLength={80}
                      value={o.value}
                      onChange={(e) => updateOption(i, { value: e.target.value })}
                    />
                    <Input
                      className="min-w-0 flex-1"
                      placeholder={tr("Libellé FR", "التسمية بالفرنسية")}
                      maxLength={80}
                      value={o.label_fr}
                      onChange={(e) => updateOption(i, { label_fr: e.target.value })}
                    />
                    <Input
                      className="min-w-0 flex-1"
                      dir="rtl"
                      placeholder={tr("Libellé AR", "التسمية بالعربية")}
                      maxLength={80}
                      value={o.label_ar}
                      onChange={(e) => updateOption(i, { label_ar: e.target.value })}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-destructive"
                      onClick={() => setOptions((list) => list.filter((_, idx) => idx !== i))}
                      aria-label={tr("Supprimer", "حذف")}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tr("Annuler", "إلغاء")}
          </Button>
          <Button form="attribute-form" disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {tr("Enregistrer", "حفظ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
