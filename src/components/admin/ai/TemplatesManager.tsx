import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { dbErrorMessage } from "@/lib/format";
import { TARGET_LENGTHS, templatesQueryKey, type DescriptionTemplate } from "./types";

export function TemplatesManager() {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<DescriptionTemplate | "new" | null>(null);
  const [deleting, setDeleting] = useState<DescriptionTemplate | null>(null);

  const q = useQuery({
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

  const toggle = useMutation({
    mutationFn: async (t: DescriptionTemplate) => {
      const { error } = await supabase
        .from("description_templates")
        .update({ is_active: !t.is_active })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: templatesQueryKey }),
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("description_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Modèle supprimé", "تم حذف القالب"));
      setDeleting(null);
      qc.invalidateQueries({ queryKey: templatesQueryKey });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {tr(
            "Un modèle décrit le ton, la structure et la longueur attendus. L'IA le suit à chaque génération.",
            "القالب يحدد الأسلوب والهيكل والطول. يتبعه الذكاء الاصطناعي في كل مرة.",
          )}
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus /> {tr("Nouveau modèle", "قالب جديد")}
        </Button>
      </div>

      {q.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : !q.data?.length ? (
        <EmptyState
          icon={FileText}
          title={tr("Aucun modèle", "لا توجد قوالب")}
          description={tr("Créez votre premier modèle de description.", "أنشئ أول قالب وصف.")}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {q.data.map((t) => {
            const len = TARGET_LENGTHS.find((l) => l.value === t.target_length);
            return (
              <li
                key={t.id}
                className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{t.name}</p>
                    {t.summary && <p className="text-sm text-muted-foreground">{t.summary}</p>}
                  </div>
                  <Switch
                    checked={t.is_active}
                    onCheckedChange={() => toggle.mutate(t)}
                    aria-label={tr("Actif", "مفعّل")}
                  />
                </div>
                <p className="line-clamp-3 text-xs text-muted-foreground">{t.instructions}</p>
                <div className="mt-auto flex items-center gap-2">
                  <Badge variant="secondary">{len ? tr(len.fr, len.ar) : t.target_length}</Badge>
                  {!t.is_active && <Badge variant="outline">{tr("Désactivé", "معطّل")}</Badge>}
                  <span className="flex-1" />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditing(t)}
                    aria-label={tr("Modifier", "تعديل")}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleting(t)}
                    aria-label={tr("Supprimer", "حذف")}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TemplateDialog
        template={editing === "new" ? null : editing}
        open={editing !== null}
        nextOrder={(q.data?.length ?? 0) + 1}
        onClose={() => setEditing(null)}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Supprimer ce modèle ?", "حذف هذا القالب؟")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("« ", "« ")}
              {deleting?.name}
              {tr(
                " » ne sera plus proposé. Les descriptions déjà rédigées ne changent pas.",
                " » لن يكون متاحاً بعد الآن. الأوصاف المكتوبة سابقاً لا تتغير.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annuler", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && remove.mutate(deleting.id)}
            >
              {tr("Supprimer", "حذف")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateDialog({
  template,
  open,
  nextOrder,
  onClose,
}: {
  template: DescriptionTemplate | null;
  open: boolean;
  nextOrder: number;
  onClose: () => void;
}) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    summary: "",
    instructions: "",
    target_length: "medium",
    is_active: true,
    display_order: "1",
  });

  useEffect(() => {
    if (!open) return;
    setForm(
      template
        ? {
            name: template.name,
            summary: template.summary ?? "",
            instructions: template.instructions,
            target_length: template.target_length,
            is_active: template.is_active,
            display_order: String(template.display_order),
          }
        : {
            name: "",
            summary: "",
            instructions: "",
            target_length: "medium",
            is_active: true,
            display_order: String(nextOrder),
          },
    );
  }, [open, template, nextOrder]);

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      const instructions = form.instructions.trim();
      if (name.length < 2) throw new Error(tr("Nom trop court.", "الاسم قصير جداً."));
      if (instructions.length < 10)
        throw new Error(
          tr("Décrivez les consignes en quelques phrases.", "اكتب التعليمات في بضع جمل."),
        );
      const payload = {
        name,
        summary: form.summary.trim() || null,
        instructions,
        target_length: form.target_length,
        is_active: form.is_active,
        display_order: Number.parseInt(form.display_order, 10) || 0,
      };
      const { error } = template
        ? await supabase.from("description_templates").update(payload).eq("id", template.id)
        : await supabase.from("description_templates").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Modèle enregistré", "تم حفظ القالب"));
      qc.invalidateQueries({ queryKey: templatesQueryKey });
      onClose();
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {template
              ? tr("Modifier le modèle", "تعديل القالب")
              : tr("Nouveau modèle", "قالب جديد")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">{tr("Nom", "الاسم")} *</Label>
            <Input
              id="tpl-name"
              maxLength={80}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-summary">
              {tr("Résumé (visible dans la liste)", "ملخص (يظهر في القائمة)")}
            </Label>
            <Input
              id="tpl-summary"
              maxLength={200}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-instr">{tr("Consignes de rédaction", "تعليمات التحرير")} *</Label>
            <Textarea
              id="tpl-instr"
              rows={7}
              maxLength={3000}
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              placeholder={tr(
                "Ton, structure (accroche, paragraphe, liste de points forts…), éléments à mettre en avant.",
                "الأسلوب، الهيكل، العناصر التي يجب إبرازها.",
              )}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{tr("Longueur", "الطول")}</Label>
              <Select
                value={form.target_length}
                onValueChange={(v) => setForm({ ...form, target_length: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_LENGTHS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {tr(l.fr, l.ar)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-order">{tr("Ordre", "الترتيب")}</Label>
              <Input
                id="tpl-order"
                type="number"
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <Switch
                id="tpl-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label htmlFor="tpl-active">{tr("Actif", "مفعّل")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tr("Annuler", "إلغاء")}
            </Button>
            <Button disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              {tr("Enregistrer", "حفظ")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
