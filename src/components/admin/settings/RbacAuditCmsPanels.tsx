import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  History,
  LayoutTemplate,
  Loader2,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { dbErrorMessage, formatDate } from "@/lib/format";
import {
  assignRbacRoleToUser,
  fetchAuditLogs,
  fetchHomepageSections,
  fetchRbacMatrix,
  toggleRolePermission,
  updateHomepageSection,
  type HomepageSectionRow,
} from "@/lib/rbac.functions";

export function RbacRolesPanel() {
  const { tr, locale } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState("order_manager");
  const [selectedRole, setSelectedRole] = useState("product_manager");

  const q = useQuery({
    queryKey: ["admin", "rbac-matrix"],
    queryFn: fetchRbacMatrix,
  });

  const grantRole = useMutation({
    mutationFn: async () => {
      const clean = email.trim().toLowerCase();
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", clean)
        .maybeSingle();
      if (error) throw error;
      if (!profile) {
        throw new Error(
          tr(
            "Aucun compte trouvé avec cet e-mail. La personne doit d'abord créer un compte.",
            "لا يوجد حساب بهذا البريد. يجب إنشاء حساب أولاً.",
          ),
        );
      }
      await assignRbacRoleToUser(profile.id, roleCode, true, user?.id);
    },
    onSuccess: () => {
      setEmail("");
      toast.success(tr("Rôle attribué et journalisé", "تم منح الدور وتسجيله"));
      qc.invalidateQueries({ queryKey: ["admin", "rbac-matrix"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const revokeRole = useMutation({
    mutationFn: ({ userId, code }: { userId: string; code: string }) =>
      assignRbacRoleToUser(userId, code, false, user?.id),
    onSuccess: () => {
      toast.success(tr("Rôle retiré", "تمت إزالة الدور"));
      qc.invalidateQueries({ queryKey: ["admin", "rbac-matrix"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const togglePerm = useMutation({
    mutationFn: ({ rCode, pCode, next }: { rCode: string; pCode: string; next: boolean }) =>
      toggleRolePermission(rCode, pCode, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "rbac-matrix"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <Skeleton className="h-96 rounded-2xl" />;

  const { roles, permissions, rolePermissions, assignments } = q.data;
  const activeRoleObj = roles.find((r) => r.code === selectedRole) ?? roles[0];
  const activePermSet = new Set(
    rolePermissions
      .filter((rp) => rp.role_code === activeRoleObj?.code)
      .map((rp) => rp.permission_code),
  );

  const permsByModule = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Team RBAC assignment */}
      <div className="rounded-2xl border bg-card shadow-card">
        <div className="border-b px-5 py-4">
          <p className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {tr("Attribution des 10 rôles métier (RBAC)", "تعيين الأدوار الوظيفية العشرة (RBAC)")}
          </p>
          <p className="text-xs text-muted-foreground">
            {tr(
              "Assignez un rôle précis à chaque membre (Achats Chine, Entrepôt, Commandes, Comptable, Marketing, Support, Analyste BI…).",
              "عيّن دوراً دقيقاً لكل عضو (المشتريات، المستودع، الطلبات، المحاسبة، التسويق، الدعم، التحليلات…).",
            )}
          </p>
        </div>

        <form
          className="flex flex-wrap gap-2 border-b px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            grantRole.mutate();
          }}
        >
          <Input
            className="min-w-56 flex-1"
            type="email"
            required
            dir="ltr"
            placeholder="membre@maisonnoura.tn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Select value={roleCode} onValueChange={setRoleCode}>
            <SelectTrigger className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.code} value={r.code}>
                  {locale === "ar" ? r.name_ar : r.name_fr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={grantRole.isPending}>
            {grantRole.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
            {tr("Attribuer le rôle", "منح الدور")}
          </Button>
        </form>

        <ul className="divide-y">
          {assignments.map(
            (a: {
              user_id: string;
              role_code: string;
              profile: { full_name: string | null; email: string | null } | null;
            }) => {
              const roleMeta = roles.find((r) => r.code === a.role_code);
              const isSelfAdmin =
                a.user_id === user?.id &&
                (a.role_code === "super_admin" || a.role_code === "admin");
              return (
                <li
                  key={`${a.user_id}-${a.role_code}`}
                  className="flex items-center gap-3 px-5 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {a.profile?.full_name || a.profile?.email || a.user_id}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" dir="ltr">
                      {a.profile?.email}
                    </p>
                  </div>
                  <Badge variant={a.role_code === "super_admin" ? "default" : "secondary"}>
                    {roleMeta
                      ? locale === "ar"
                        ? roleMeta.name_ar
                        : roleMeta.name_fr
                      : a.role_code}
                  </Badge>
                  {!isSelfAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      disabled={revokeRole.isPending}
                      onClick={() => revokeRole.mutate({ userId: a.user_id, code: a.role_code })}
                      aria-label={tr("Retirer le rôle", "إزالة الدور")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              );
            },
          )}
        </ul>
      </div>

      {/* Granular Permission Matrix */}
      <div className="rounded-2xl border bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <p className="font-semibold">
              {tr("Matrice des permissions par rôle", "مصفوفة الصلاحيات حسب الدور")}
            </p>
            <p className="text-xs text-muted-foreground">
              {activeRoleObj
                ? locale === "ar"
                  ? activeRoleObj.description_ar
                  : activeRoleObj.description_fr
                : ""}
            </p>
          </div>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.code} value={r.code}>
                  {locale === "ar" ? r.name_ar : r.name_fr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          {Object.entries(permsByModule).map(([mod, list]) => (
            <div key={mod} className="rounded-xl border bg-muted/30 p-3.5">
              <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {mod}
              </p>
              <div className="space-y-2">
                {list.map((perm) => {
                  const checked = activePermSet.has(perm.code);
                  const locked = activeRoleObj?.code === "super_admin";
                  return (
                    <label
                      key={perm.code}
                      className="flex cursor-pointer items-center gap-2.5 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={locked || togglePerm.isPending}
                        onCheckedChange={(v) => {
                          if (!activeRoleObj) return;
                          togglePerm.mutate({
                            rCode: activeRoleObj.code,
                            pCode: perm.code,
                            next: Boolean(v),
                          });
                        }}
                      />
                      <span className="flex-1">
                        {locale === "ar" ? perm.label_ar : perm.label_fr}
                      </span>
                      <code className="text-[10px] text-muted-foreground">{perm.code}</code>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HomepageCmsPanel() {
  const { tr } = useI18n();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin", "homepage-sections"],
    queryFn: fetchHomepageSections,
  });

  const saveSection = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<
          HomepageSectionRow,
          "title_fr" | "title_ar" | "subtitle_fr" | "subtitle_ar" | "is_enabled" | "display_order"
        >
      >;
    }) => updateHomepageSection(id, patch),
    onSuccess: () => {
      toast.success(tr("Section enregistrée", "تم حفظ القسم"));
      qc.invalidateQueries({ queryKey: ["admin", "homepage-sections"] });
      qc.invalidateQueries({ queryKey: ["public", "homepage-sections"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <Skeleton className="h-96 rounded-2xl" />;

  const sections = q.data;

  async function move(idx: number, dir: -1 | 1) {
    const a = sections[idx];
    const b = sections[idx + dir];
    if (!a || !b) return;
    await Promise.all([
      updateHomepageSection(a.id, { display_order: b.display_order }),
      updateHomepageSection(b.id, { display_order: a.display_order }),
    ]);
    qc.invalidateQueries({ queryKey: ["admin", "homepage-sections"] });
    qc.invalidateQueries({ queryKey: ["public", "homepage-sections"] });
    toast.success(tr("Ordre mis à jour", "تم تحديث الترتيب"));
  }

  return (
    <div className="rounded-2xl border bg-card shadow-card">
      <div className="border-b px-5 py-4">
        <p className="flex items-center gap-2 font-semibold">
          <LayoutTemplate className="h-4 w-4 text-primary" />
          {tr("Sections de la page d'accueil (CMS)", "أقسام الصفحة الرئيسية (CMS)")}
        </p>
        <p className="text-xs text-muted-foreground">
          {tr(
            "Activez, désactivez, réordonnez et personnalisez les titres FR/AR affichés sur la page d'accueil de la boutique.",
            "فعّل أو عطّل أو أعد ترتيب الأقسام وعدّل العناوين المعروضة في الصفحة الرئيسية.",
          )}
        </p>
      </div>
      <div className="divide-y">
        {sections.map((s, idx) => (
          <HomepageSectionRowEditor
            key={s.id}
            section={s}
            isFirst={idx === 0}
            isLast={idx === sections.length - 1}
            saving={saveSection.isPending}
            onMove={(dir) => move(idx, dir)}
            onSave={(patch) => saveSection.mutate({ id: s.id, patch })}
          />
        ))}
      </div>
    </div>
  );
}

function HomepageSectionRowEditor({
  section,
  isFirst,
  isLast,
  saving,
  onMove,
  onSave,
}: {
  section: HomepageSectionRow;
  isFirst: boolean;
  isLast: boolean;
  saving: boolean;
  onMove: (dir: -1 | 1) => void;
  onSave: (
    patch: Partial<
      Pick<
        HomepageSectionRow,
        "title_fr" | "title_ar" | "subtitle_fr" | "subtitle_ar" | "is_enabled"
      >
    >,
  ) => void;
}) {
  const { tr } = useI18n();
  const [titleFr, setTitleFr] = useState(section.title_fr);
  const [titleAr, setTitleAr] = useState(section.title_ar);
  const [subFr, setSubFr] = useState(section.subtitle_fr ?? "");
  const [subAr, setSubAr] = useState(section.subtitle_ar ?? "");
  const dirty =
    titleFr !== section.title_fr ||
    titleAr !== section.title_ar ||
    subFr !== (section.subtitle_fr ?? "") ||
    subAr !== (section.subtitle_ar ?? "");

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px]">
            {section.section_key}
          </Badge>
          <span className="text-xs text-muted-foreground">#{section.display_order}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={isFirst}
            onClick={() => onMove(-1)}
            aria-label={tr("Monter", "أعلى")}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={isLast}
            onClick={() => onMove(1)}
            aria-label={tr("Descendre", "أسفل")}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Switch
            checked={section.is_enabled}
            onCheckedChange={(checked) => onSave({ is_enabled: checked })}
          />
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <Input
          value={titleFr}
          onChange={(e) => setTitleFr(e.target.value)}
          placeholder={tr("Titre (FR)", "العنوان (فرنسية)")}
          className="h-8 text-sm"
        />
        <Input
          dir="rtl"
          value={titleAr}
          onChange={(e) => setTitleAr(e.target.value)}
          placeholder={tr("Titre (AR)", "العنوان (عربية)")}
          className="h-8 text-sm"
        />
        <Input
          value={subFr}
          onChange={(e) => setSubFr(e.target.value)}
          placeholder={tr("Sous-titre (FR)", "العنوان الفرعي (فرنسية)")}
          className="h-8 text-xs text-muted-foreground"
        />
        <Input
          dir="rtl"
          value={subAr}
          onChange={(e) => setSubAr(e.target.value)}
          placeholder={tr("Sous-titre (AR)", "العنوان الفرعي (عربية)")}
          className="h-8 text-xs text-muted-foreground"
        />
      </div>

      {dirty && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() =>
              onSave({
                title_fr: titleFr.trim() || section.title_fr,
                title_ar: titleAr.trim() || section.title_ar,
                subtitle_fr: subFr.trim() || null,
                subtitle_ar: subAr.trim() || null,
              })
            }
          >
            {tr("Enregistrer le texte", "حفظ النص")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function AuditLogsPanel() {
  const { tr, locale } = useI18n();
  const [mod, setMod] = useState("__all__");

  const q = useQuery({
    queryKey: ["admin", "audit-logs", mod],
    queryFn: () => fetchAuditLogs(mod),
  });

  return (
    <div className="rounded-2xl border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <History className="h-4 w-4 text-primary" />
            {tr("Journal d'audit (opérations sensibles)", "سجل التدقيق (العمليات الحساسة)")}
          </p>
          <p className="text-xs text-muted-foreground">
            {tr(
              "Historique immuable des modifications de rôles, prix, stock et paramètres.",
              "سجل ثابت لتغييرات الأدوار والأسعار والمخزون والإعدادات.",
            )}
          </p>
        </div>
        <Select value={mod} onValueChange={setMod}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{tr("Tous les modules", "كل الوحدات")}</SelectItem>
            <SelectItem value="security">{tr("Sécurité / RBAC", "الأمان والأدوار")}</SelectItem>
            <SelectItem value="products">{tr("Produits", "المنتجات")}</SelectItem>
            <SelectItem value="orders">{tr("Commandes", "الطلبات")}</SelectItem>
            <SelectItem value="inventory">{tr("Stock", "المخزون")}</SelectItem>
            <SelectItem value="finances">{tr("Finances", "المالية")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <Skeleton className="m-5 h-48" />
      ) : q.error ? (
        <div className="p-5">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </div>
      ) : !q.data?.length ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {tr("Aucun événement enregistré pour ce filtre.", "لا توجد أحداث مسجلة لهذا الفلتر.")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-start text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium">{tr("Date", "التاريخ")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{tr("Acteur", "المنفّذ")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{tr("Action", "الإجراء")}</th>
                <th className="px-4 py-2.5 text-start font-medium">{tr("Détail", "التفاصيل")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {q.data.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                    {formatDate(row.created_at, locale)}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-medium" dir="ltr">
                    {row.actor_email || row.actor_id?.slice(0, 8) || "système"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {row.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {row.summary ||
                      `${row.entity}${row.entity_id ? ` #${row.entity_id.slice(0, 8)}` : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
