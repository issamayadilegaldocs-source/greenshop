import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, PageHeader } from "@/components/admin/AdminShell";
import {
  AuditLogsPanel,
  HomepageCmsPanel,
  RbacRolesPanel,
} from "@/components/admin/settings/RbacAuditCmsPanels";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { dbErrorMessage } from "@/lib/format";
import { getAiSettingsStatus, saveAiSettings, testAiConnection } from "@/lib/ai-settings.functions";

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
  const { isAdmin, can } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        title={tr("Paramètres & Sécurité", "الإعدادات والأمان")}
        description={tr(
          "Boutique, clés IA, matrice RBAC 10 rôles, page d'accueil CMS et journal d'audit.",
          "المتجر، مفاتيح الذكاء الاصطناعي، مصفوفة الصلاحيات، الصفحة الرئيسية وسجل التدقيق.",
        )}
      />
      {isAdmin ? (
        <Tabs defaultValue="store" className="space-y-6">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="store">{tr("Boutique & Livraison", "المتجر والتوصيل")}</TabsTrigger>
            <TabsTrigger value="ai">{tr("IA & Clés API", "الذكاء الاصطناعي")}</TabsTrigger>
            <TabsTrigger value="rbac">
              {tr("Rôles & Permissions (10)", "الأدوار والصلاحيات (10)")}
            </TabsTrigger>
            <TabsTrigger value="cms">{tr("Page d'accueil CMS", "الصفحة الرئيسية CMS")}</TabsTrigger>
            <TabsTrigger value="audit">{tr("Journal d'audit", "سجل التدقيق")}</TabsTrigger>
          </TabsList>

          <TabsContent value="store" className="space-y-6">
            <StoreSettingsCard readOnly={!can("settings.manage")} />
            <TeamCard />
          </TabsContent>
          <TabsContent value="ai">
            <AiSettingsCard />
          </TabsContent>
          <TabsContent value="rbac">
            <RbacRolesPanel />
          </TabsContent>
          <TabsContent value="cms">
            <HomepageCmsPanel />
          </TabsContent>
          <TabsContent value="audit">
            <AuditLogsPanel />
          </TabsContent>
        </Tabs>
      ) : (
        <StoreSettingsCard readOnly={!can("settings.manage")} />
      )}
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

function AiSettingsCard() {
  const { tr } = useI18n();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin", "ai-settings"],
    queryFn: () => getAiSettingsStatus(),
  });

  const [openaiKey, setOpenaiKey] = useState("");
  const [falKey, setFalKey] = useState("");
  const [repToken, setRepToken] = useState("");
  const [aiModel, setAiModel] = useState("gpt-4o-mini");
  const [imageModel, setImageModel] = useState("gpt-image-1");
  const [assistantEnabled, setAssistantEnabled] = useState(true);
  const [showOpenai, setShowOpenai] = useState(false);
  const [showFal, setShowFal] = useState(false);
  const [showRep, setShowRep] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: true; text: string } | { ok: false; text: string } | null
  >(null);

  useEffect(() => {
    if (!q.data) return;
    setAiModel(q.data.aiModel || "gpt-4o-mini");
    setImageModel(q.data.imageModel || "gpt-image-1");
    setAssistantEnabled(q.data.assistantEnabled);
  }, [q.data]);

  const save = useMutation({
    mutationFn: (opts?: { clearOpenai?: boolean; clearFal?: boolean; clearRep?: boolean }) =>
      saveAiSettings({
        data: {
          openaiApiKey: opts?.clearOpenai ? null : openaiKey.trim() || null,
          clearOpenaiKey: Boolean(opts?.clearOpenai),
          aiModel,
          imageModel,
          falApiKey: opts?.clearFal ? null : falKey.trim() || null,
          clearFalKey: Boolean(opts?.clearFal),
          replicateApiToken: opts?.clearRep ? null : repToken.trim() || null,
          clearReplicateToken: Boolean(opts?.clearRep),
          assistantEnabled,
        },
      }),
    onSuccess: () => {
      setOpenaiKey("");
      setFalKey("");
      setRepToken("");
      setTestResult(null);
      toast.success(tr("Configuration IA enregistrée", "تم حفظ إعدادات الذكاء الاصطناعي"));
      qc.invalidateQueries({ queryKey: ["admin", "ai-settings"] });
      qc.invalidateQueries({ queryKey: ["public", "assistant-status"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const testConn = useMutation({
    mutationFn: () =>
      testAiConnection({
        data: {
          candidateKey: openaiKey.trim() || null,
          candidateModel: aiModel,
        },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        const msg = tr(
          `Connexion OpenAI réussie (${res.model})`,
          `تم الاتصال بـ OpenAI بنجاح (${res.model})`,
        );
        setTestResult({ ok: true, text: msg });
        toast.success(msg);
      } else {
        setTestResult({ ok: false, text: res.error });
        toast.error(res.error);
      }
    },
    onError: (e) => {
      const msg = dbErrorMessage(e);
      setTestResult({ ok: false, text: msg });
      toast.error(msg);
    },
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-72 rounded-2xl" />;

  const status = q.data;
  const openAiActive = Boolean(status?.hasOpenaiKey || status?.openaiEnvConfigured);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({});
      }}
      className="rounded-2xl border bg-card shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            {tr("Configuration IA & Clés API", "إعدادات الذكاء الاصطناعي ومفاتيح API")}
          </p>
          <p className="text-xs text-muted-foreground">
            {tr(
              "Stockées côté serveur uniquement (jamais exposées au navigateur). Alimentent la création par photo, les photos marketing, la rédaction, le studio social et l'assistant shopping.",
              "تُحفظ على الخادم فقط ولا تُكشف للمتصفح. تشغّل إنشاء المنتجات بالصور، الصور التسويقية، التحرير، استوديو الإعلانات والمساعد الذكي.",
            )}
          </p>
        </div>
        <Badge variant={openAiActive ? "default" : "secondary"} className="gap-1">
          {openAiActive ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {status?.hasOpenaiKey
                ? tr(
                    `OpenAI active (${status.openaiKeyHint})`,
                    `OpenAI مفعّل (${status.openaiKeyHint})`,
                  )
                : tr("OpenAI active (env serveur)", "OpenAI مفعّل (متغير الخادم)")}
            </>
          ) : (
            tr("Mode local sans clé OpenAI", "وضع محلي بدون مفتاح OpenAI")
          )}
        </Badge>
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="openai-key" className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                {tr("Clé API OpenAI (OPENAI_API_KEY)", "مفتاح OpenAI API")}
              </Label>
              {status?.hasOpenaiKey && (
                <button
                  type="button"
                  onClick={() => save.mutate({ clearOpenai: true })}
                  className="text-xs text-destructive hover:underline"
                >
                  {tr("Supprimer la clé enregistrée", "حذف المفتاح المحفوظ")}
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                id="openai-key"
                type={showOpenai ? "text" : "password"}
                dir="ltr"
                autoComplete="new-password"
                placeholder={
                  status?.hasOpenaiKey
                    ? `${status.openaiKeyHint} (${tr("laisser vide pour conserver", "اتركه فارغاً للإبقاء عليه")})`
                    : "sk-proj-..."
                }
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="pe-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowOpenai((v) => !v)}
                aria-label={tr("Afficher ou masquer", "إظهار أو إخفاء")}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showOpenai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {tr(
                "Utilisée pour l'analyse photo produit (Vision), les photos marketing IA, la rédaction FR/AR, le Studio Social et le chat client.",
                "يُستخدم لتحليل صور المنتجات، إنشاء الصور التسويقية، كتابة الأوصاف ومساعد التسوق.",
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{tr("Modèle texte & vision", "نموذج النص والرؤية")}</Label>
              <Select value={aiModel} onValueChange={setAiModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">
                    gpt-4o-mini ({tr("Rapide & économique", "سريع واقتصادي")})
                  </SelectItem>
                  <SelectItem value="gpt-4.1-mini">
                    gpt-4.1-mini ({tr("Équilibré", "متوازن")})
                  </SelectItem>
                  <SelectItem value="gpt-4o">
                    gpt-4o ({tr("Vision haute précision", "رؤية عالية الدقة")})
                  </SelectItem>
                  <SelectItem value="gpt-4.1">
                    gpt-4.1 ({tr("Rédaction premium", "تحرير احترافي")})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Modèle photos marketing", "نموذج الصور التسويقية")}</Label>
              <Select value={imageModel} onValueChange={setImageModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-image-1">
                    gpt-image-1 ({tr("Recommandé", "موصى به")})
                  </SelectItem>
                  <SelectItem value="gpt-image-1-mini">
                    gpt-image-1-mini ({tr("Rapide", "سريع")})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-3.5 py-3">
            <div className="space-y-0.5 pe-3">
              <p className="text-sm font-medium">
                {tr("Assistant Shopping IA sur la boutique", "مساعد التسوق الذكي في المتجر")}
              </p>
              <p className="text-xs text-muted-foreground">
                {tr(
                  "Bulle de chat bilingue FR/AR connectée au catalogue réel et au suivi de commandes.",
                  "محادثة ثنائية اللغة مرتبطة بالكتالوج الحقيقي وتتبع الطلبات.",
                )}
              </p>
            </div>
            <Switch checked={assistantEnabled} onCheckedChange={setAssistantEnabled} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="fal-key">
                {tr("Clé fal.ai (FAL_KEY — Vidéo Kling 2.1)", "مفتاح fal.ai للفيديو")}
              </Label>
              {status?.hasFalKey && (
                <button
                  type="button"
                  onClick={() => save.mutate({ clearFal: true })}
                  className="text-xs text-destructive hover:underline"
                >
                  {tr("Supprimer", "حذف")}
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                id="fal-key"
                type={showFal ? "text" : "password"}
                dir="ltr"
                autoComplete="new-password"
                placeholder={
                  status?.hasFalKey
                    ? `${status.falKeyHint} (${tr("enregistrée", "محفوظ")})`
                    : status?.falEnvConfigured
                      ? tr("Configurée via env serveur", "مُعدّ عبر الخادم")
                      : "fal_..."
                }
                value={falKey}
                onChange={(e) => setFalKey(e.target.value)}
                className="pe-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowFal((v) => !v)}
                aria-label={tr("Afficher ou masquer", "إظهار أو إخفاء")}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showFal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="rep-key">
                {tr("Token Replicate (optionnel — Vidéo Kling)", "رمز Replicate (اختياري)")}
              </Label>
              {status?.hasReplicateToken && (
                <button
                  type="button"
                  onClick={() => save.mutate({ clearRep: true })}
                  className="text-xs text-destructive hover:underline"
                >
                  {tr("Supprimer", "حذف")}
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                id="rep-key"
                type={showRep ? "text" : "password"}
                dir="ltr"
                autoComplete="new-password"
                placeholder={
                  status?.hasReplicateToken
                    ? `${status.replicateTokenHint} (${tr("enregistré", "محفوظ")})`
                    : status?.replicateEnvConfigured
                      ? tr("Configuré via env serveur", "مُعدّ عبر الخادم")
                      : "r8_..."
                }
                value={repToken}
                onChange={(e) => setRepToken(e.target.value)}
                className="pe-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowRep((v) => !v)}
                aria-label={tr("Afficher ou masquer", "إظهار أو إخفاء")}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showRep ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {!status?.hasServiceRole && !status?.openaiEnvConfigured && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {tr(
                "Note : votre clé OpenAI enregistrée ici active immédiatement tous les outils IA admin (Photo → Produit, Rédaction, Studio Social). Pour que l'Assistant Shopping boutique utilise aussi GPT pour les visiteurs anonymes, ajoutez SUPABASE_SERVICE_ROLE_KEY (ou OPENAI_API_KEY) dans les variables serveur Vercel.",
                "ملاحظة: مفتاح OpenAI المحفوظ هنا يفعّل فوراً كل أدوات الإدارة. لتمكين GPT للزوار غير المسجلين في مساعد التسوق، أضف SUPABASE_SERVICE_ROLE_KEY أو OPENAI_API_KEY في إعدادات Vercel.",
              )}
            </div>
          )}

          {testResult && (
            <div
              className={
                testResult.ok
                  ? "rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900"
                  : "rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive"
              }
            >
              {testResult.text}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4">
        <Button
          type="button"
          variant="outline"
          disabled={testConn.isPending}
          onClick={() => testConn.mutate()}
        >
          {testConn.isPending ? <Loader2 className="animate-spin" /> : <Zap />}
          {tr("Tester la connexion OpenAI", "اختبار اتصال OpenAI")}
        </Button>
        <Button disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          {tr("Enregistrer la configuration IA", "حفظ إعدادات الذكاء الاصطناعي")}
        </Button>
      </div>
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
