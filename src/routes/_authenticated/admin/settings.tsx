import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Settings, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState, PageHeader } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { dbErrorMessage } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "Paramètres — Maison Noura" },
      { name: "description", content: "Livraison, contact, retours et équipe de la boutique." },
      { property: "og:title", content: "Paramètres — Maison Noura" },
      { property: "og:description", content: "Administration Maison Noura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { tr } = useI18n();
  const { isAdmin } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        title={tr("Paramètres", "الإعدادات")}
        description={tr(
          "Livraison, contact, retours et équipe.",
          "التوصيل، الاتصال، الإرجاع والفريق.",
        )}
      />
      <StoreSettingsCard readOnly={!isAdmin} />
      {isAdmin && <TeamCard />}
    </div>
  );
}

function StoreSettingsCard({ readOnly }: { readOnly: boolean }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_settings").select("*").single();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState({
    delivery_fee: "0",
    free_delivery_threshold: "",
    support_phone: "",
    support_email: "",
    default_low_stock_threshold: "5",
    return_window_days: "14",
    announcement_fr: "",
    announcement_ar: "",
    delivery_cities: [] as string[],
  });
  const [newCity, setNewCity] = useState("");

  useEffect(() => {
    if (!q.data) return;
    setForm({
      delivery_fee: String(q.data.delivery_fee),
      free_delivery_threshold:
        q.data.free_delivery_threshold == null ? "" : String(q.data.free_delivery_threshold),
      support_phone: q.data.support_phone ?? "",
      support_email: q.data.support_email ?? "",
      default_low_stock_threshold: String(q.data.default_low_stock_threshold),
      return_window_days: String(q.data.return_window_days),
      announcement_fr: q.data.announcement_fr ?? "",
      announcement_ar: q.data.announcement_ar ?? "",
      delivery_cities: q.data.delivery_cities ?? [],
    });
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const fee = Number(form.delivery_fee);
      const threshold =
        form.free_delivery_threshold.trim() === "" ? null : Number(form.free_delivery_threshold);
      const low = Number(form.default_low_stock_threshold);
      const days = Number(form.return_window_days);
      if (!Number.isFinite(fee) || fee < 0)
        throw new Error(tr("Frais de livraison invalides.", "رسوم توصيل غير صالحة."));
      if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0))
        throw new Error(tr("Seuil invalide.", "حد غير صالح."));
      if (!Number.isInteger(low) || low < 0)
        throw new Error(tr("Seuil de stock invalide.", "حد المخزون غير صالح."));
      if (!Number.isInteger(days) || days < 0 || days > 365)
        throw new Error(tr("Délai de retour invalide (0–365).", "مدة إرجاع غير صالحة."));
      if (form.support_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.support_email))
        throw new Error(tr("E-mail invalide.", "بريد غير صالح."));
      const { error } = await supabase
        .from("store_settings")
        .update({
          delivery_fee: fee,
          free_delivery_threshold: threshold,
          support_phone: form.support_phone.trim() || null,
          support_email: form.support_email.trim() || null,
          default_low_stock_threshold: low,
          return_window_days: days,
          announcement_fr: form.announcement_fr.trim() || null,
          announcement_ar: form.announcement_ar.trim() || null,
          delivery_cities: form.delivery_cities,
        })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(tr("Paramètres enregistrés", "تم حفظ الإعدادات"));
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      qc.invalidateQueries({ queryKey: ["public"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-96 rounded-2xl" />;

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card shadow-card">
      <fieldset disabled={readOnly} className="grid gap-6 p-5 md:grid-cols-2">
        <div className="space-y-4">
          <p className="font-semibold">{tr("Livraison & paiement", "التوصيل والدفع")}</p>
          <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
            {tr(
              "Mode de paiement : paiement à la livraison (main à main) uniquement.",
              "طريقة الدفع: الدفع عند الاستلام فقط (يداً بيد).",
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fee">{tr("Frais de livraison (DT)", "رسوم التوصيل (د.ت)")}</Label>
              <Input
                id="fee"
                type="number"
                step="0.001"
                min={0}
                value={form.delivery_fee}
                onChange={(e) => setForm({ ...form, delivery_fee: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="free">{tr("Gratuite dès (DT)", "مجاني ابتداءً من (د.ت)")}</Label>
              <Input
                id="free"
                type="number"
                step="0.001"
                min={0}
                placeholder={tr("Jamais", "أبداً")}
                value={form.free_delivery_threshold}
                onChange={(e) => setForm({ ...form, free_delivery_threshold: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ret">{tr("Délai de retour (jours)", "مدة الإرجاع (أيام)")}</Label>
              <Input
                id="ret"
                type="number"
                min={0}
                max={365}
                value={form.return_window_days}
                onChange={(e) => setForm({ ...form, return_window_days: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="low">{tr("Seuil stock faible", "حد المخزون المنخفض")}</Label>
              <Input
                id="low"
                type="number"
                min={0}
                value={form.default_low_stock_threshold}
                onChange={(e) => setForm({ ...form, default_low_stock_threshold: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>
              {tr("Villes de livraison", "مدن التوصيل")} ({form.delivery_cities.length})
            </Label>
            <div className="flex flex-wrap gap-1.5 rounded-lg border p-2">
              {form.delivery_cities.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                >
                  {c}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          delivery_cities: form.delivery_cities.filter((x) => x !== c),
                        })
                      }
                      aria-label={tr("Retirer", "إزالة")}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder={tr("Ajouter une ville", "إضافة مدينة")}
                maxLength={80}
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const c = newCity.trim();
                  if (c && !form.delivery_cities.includes(c))
                    setForm({ ...form, delivery_cities: [...form.delivery_cities, c] });
                  setNewCity("");
                }}
              >
                {tr("Ajouter", "إضافة")}
              </Button>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <p className="font-semibold">{tr("Contact & bandeau", "الاتصال والشريط")}</p>
          <div className="space-y-1.5">
            <Label htmlFor="phone">{tr("Téléphone service client", "هاتف خدمة الحرفاء")}</Label>
            <Input
              id="phone"
              dir="ltr"
              maxLength={20}
              value={form.support_phone}
              onChange={(e) => setForm({ ...form, support_phone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mail">{tr("E-mail service client", "بريد خدمة الحرفاء")}</Label>
            <Input
              id="mail"
              type="email"
              dir="ltr"
              value={form.support_email}
              onChange={(e) => setForm({ ...form, support_email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="afr">
              {tr("Bandeau d'annonce (français)", "شريط الإعلان (فرنسية)")}
            </Label>
            <Input
              id="afr"
              maxLength={160}
              value={form.announcement_fr}
              onChange={(e) => setForm({ ...form, announcement_fr: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aar">{tr("Bandeau d'annonce (arabe)", "شريط الإعلان (عربية)")}</Label>
            <Input
              id="aar"
              dir="rtl"
              maxLength={160}
              value={form.announcement_ar}
              onChange={(e) => setForm({ ...form, announcement_ar: e.target.value })}
            />
          </div>
        </div>
      </fieldset>
      {!readOnly && (
        <div className="flex justify-end border-t px-5 py-4">
          <Button disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {tr("Enregistrer", "حفظ")}
          </Button>
        </div>
      )}
    </form>
  );
}

function TeamCard() {
  const { tr } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");

  const team = useQuery({
    queryKey: ["admin", "team"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role, created_at")
        .order("created_at");
      if (error) throw error;
      const ids = [...new Set(roles.map((r) => r.user_id))];
      let profiles: { id: string; full_name: string | null; email: string | null }[] = [];
      if (ids.length) {
        const { data, error: pe } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        if (pe) throw pe;
        profiles = data;
      }
      return roles.map((r) => ({ ...r, profile: profiles.find((p) => p.id === r.user_id) }));
    },
  });

  const grant = useMutation({
    mutationFn: async () => {
      const clean = email.trim().toLowerCase();
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", clean)
        .maybeSingle();
      if (error) throw error;
      if (!profile)
        throw new Error(
          tr(
            "Aucun compte avec cet e-mail. La personne doit d'abord créer un compte.",
            "لا يوجد حساب بهذا البريد. يجب على الشخص إنشاء حساب أولاً.",
          ),
        );
      const { error: e2 } = await supabase.rpc("set_user_role", {
        _user_id: profile.id,
        _role: role,
        _grant: true,
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      setEmail("");
      toast.success(tr("Accès accordé", "تم منح الصلاحية"));
      qc.invalidateQueries({ queryKey: ["admin", "team"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const revoke = useMutation({
    mutationFn: async ({ userId, r }: { userId: string; r: "admin" | "staff" }) => {
      const { error } = await supabase.rpc("set_user_role", {
        _user_id: userId,
        _role: r,
        _grant: false,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "team"] }),
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  return (
    <div className="rounded-2xl border bg-card shadow-card">
      <div className="border-b px-5 py-4">
        <p className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" /> {tr("Équipe", "الفريق")}
        </p>
        <p className="text-xs text-muted-foreground">
          {tr(
            "Administrateur : accès complet. Équipe : commandes, stock, retours, encaissements.",
            "المسؤول: صلاحية كاملة. الفريق: الطلبات، المخزون، الإرجاع، التحصيل.",
          )}
        </p>
      </div>
      <form
        className="flex flex-wrap gap-2 border-b px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          grant.mutate();
        }}
      >
        <Input
          className="min-w-56 flex-1"
          type="email"
          required
          dir="ltr"
          placeholder="email@exemple.tn"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Select value={role} onValueChange={(v) => setRole(v as "admin" | "staff")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="staff">{tr("Équipe", "فريق")}</SelectItem>
            <SelectItem value="admin">{tr("Administrateur", "مسؤول")}</SelectItem>
          </SelectContent>
        </Select>
        <Button disabled={grant.isPending}>
          <UserPlus /> {tr("Donner accès", "منح الصلاحية")}
        </Button>
      </form>
      {team.isLoading ? (
        <Skeleton className="m-5 h-16" />
      ) : team.error ? (
        <div className="p-5">
          <ErrorState error={team.error} />
        </div>
      ) : (
        <ul className="divide-y">
          {team.data?.map((m) => (
            <li
              key={`${m.user_id}-${m.role}`}
              className="flex items-center gap-3 px-5 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {m.profile?.full_name || m.profile?.email || m.user_id}
                </p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">
                  {m.profile?.email}
                </p>
              </div>
              <Badge variant={m.role === "admin" ? "default" : "secondary"}>
                {m.role === "admin" ? tr("Administrateur", "مسؤول") : tr("Équipe", "فريق")}
              </Badge>
              {!(m.user_id === user?.id && m.role === "admin") && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  onClick={() => revoke.mutate({ userId: m.user_id, r: m.role })}
                  aria-label={tr("Retirer", "إزالة")}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
