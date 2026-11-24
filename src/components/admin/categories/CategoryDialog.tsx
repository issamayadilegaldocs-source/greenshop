import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { dbErrorMessage, slugify } from "@/lib/format";
import { uploadCatalogImage } from "@/lib/storage";
import { useI18n } from "@/lib/i18n";
import { categoryPath, descendantIds, type Category } from "./types";

const ROOT = "__root__";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: Category[];
  editing: Category | null;
  defaultParentId?: string | null;
  onSaved?: (id: string) => void;
};

export function CategoryDialog({
  open,
  onOpenChange,
  categories,
  editing,
  defaultParentId,
  onSaved,
}: Props) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const [slugTouched, setSlugTouched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name_fr: "",
    name_ar: "",
    slug: "",
    description_fr: "",
    description_ar: "",
    parent_id: ROOT,
    display_order: 0,
    is_active: true,
    image_url: "" as string,
  });

  useEffect(() => {
    if (!open) return;
    setSlugTouched(!!editing);
    setForm({
      name_fr: editing?.name_fr ?? "",
      name_ar: editing?.name_ar ?? "",
      slug: editing?.slug ?? "",
      description_fr: editing?.description_fr ?? "",
      description_ar: editing?.description_ar ?? "",
      parent_id: editing ? (editing.parent_id ?? ROOT) : (defaultParentId ?? ROOT),
      display_order:
        editing?.display_order ??
        categories.filter((c) => c.parent_id === (defaultParentId ?? null)).length,
      is_active: editing?.is_active ?? true,
      image_url: editing?.image_url ?? "",
    });
  }, [open, editing, defaultParentId, categories]);

  const parentOptions = useMemo(() => {
    const blocked = editing ? descendantIds(categories, editing.id) : new Set<string>();
    return categories
      .filter((c) => !blocked.has(c.id))
      .map((c) => ({
        id: c.id,
        label: categoryPath(categories, c.id)
          .map((p) => p.name_fr)
          .join(" › "),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [categories, editing]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name_fr: form.name_fr.trim(),
        name_ar: form.name_ar.trim() || null,
        slug: slugify(form.slug || form.name_fr),
        description_fr: form.description_fr.trim() || null,
        description_ar: form.description_ar.trim() || null,
        parent_id: form.parent_id === ROOT ? null : form.parent_id,
        display_order: Number(form.display_order) || 0,
        is_active: form.is_active,
        image_url: form.image_url || null,
      };
      if (!payload.name_fr) throw new Error(tr("Le nom est obligatoire.", "الاسم إجباري."));
      if (!payload.slug) throw new Error(tr("Slug invalide.", "المعرّف غير صالح."));
      if (editing) {
        const { error } = await supabase.from("categories").update(payload).eq("id", editing.id);
        if (error) throw error;
        return editing.id;
      }
      const { data, error } = await supabase
        .from("categories")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success(tr("Catégorie enregistrée", "تم حفظ القسم"));
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      qc.invalidateQueries({ queryKey: ["public"] });
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadCatalogImage(file, "categories");
      setForm((f) => ({ ...f, image_url: url }));
    } catch (e) {
      toast.error(dbErrorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? tr("Modifier la catégorie", "تعديل القسم")
              : tr("Nouvelle catégorie", "قسم جديد")}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "Les catégories peuvent être imbriquées sans limite.",
              "يمكن تداخل الأقسام بلا حدود.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form id="category-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name-fr">{tr("Nom (français)", "الاسم (فرنسية)")} *</Label>
            <Input
              id="cat-name-fr"
              required
              maxLength={120}
              value={form.name_fr}
              onChange={(e) => {
                const name_fr = e.target.value;
                setForm((f) => ({ ...f, name_fr, slug: slugTouched ? f.slug : slugify(name_fr) }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-name-ar">{tr("Nom (arabe)", "الاسم (عربية)")}</Label>
            <Input
              id="cat-name-ar"
              dir="rtl"
              maxLength={120}
              value={form.name_ar}
              onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-slug">Slug (URL) *</Label>
            <Input
              id="cat-slug"
              dir="ltr"
              required
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tr("Catégorie parente", "القسم الأم")}</Label>
            <Select
              value={form.parent_id}
              onValueChange={(v) => setForm({ ...form, parent_id: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT}>
                  {tr("— Aucune (catégorie principale) —", "— بدون (قسم رئيسي) —")}
                </SelectItem>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cat-desc-fr">{tr("Description (français)", "الوصف (فرنسية)")}</Label>
            <Textarea
              id="cat-desc-fr"
              rows={2}
              maxLength={2000}
              value={form.description_fr}
              onChange={(e) => setForm({ ...form, description_fr: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cat-desc-ar">{tr("Description (arabe)", "الوصف (عربية)")}</Label>
            <Textarea
              id="cat-desc-ar"
              dir="rtl"
              rows={2}
              maxLength={2000}
              value={form.description_ar}
              onChange={(e) => setForm({ ...form, description_ar: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tr("Image", "الصورة")}</Label>
            <div className="flex items-center gap-3">
              <div className="relative h-20 w-20 overflow-hidden rounded-xl border bg-muted">
                {form.image_url ? (
                  <>
                    <img src={form.image_url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className="absolute end-1 top-1 rounded-full bg-background/90 p-0.5"
                      onClick={() => setForm({ ...form, image_url: "" })}
                      aria-label={tr("Retirer l'image", "إزالة الصورة")}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <span className="grid h-full w-full place-items-center text-muted-foreground">
                    {uploading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-5 w-5" />
                    )}
                  </span>
                )}
              </div>
              <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
                {tr("Choisir un fichier", "اختر ملفاً")}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="sr-only"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-order">{tr("Ordre d'affichage", "ترتيب العرض")}</Label>
              <Input
                id="cat-order"
                type="number"
                min={0}
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-active">{tr("Statut", "الحالة")}</Label>
              <div className="flex h-9 items-center gap-2">
                <Switch
                  id="cat-active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <span className="text-sm">
                  {form.is_active ? tr("Active", "نشط") : tr("Inactive", "غير نشط")}
                </span>
              </div>
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tr("Annuler", "إلغاء")}
          </Button>
          <Button form="category-form" disabled={save.isPending || uploading}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {tr("Enregistrer", "حفظ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
