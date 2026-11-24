import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { MapPin, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StoreLayout } from "@/components/store/StoreLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n, type Locale } from "@/lib/i18n";
import { storeSettingsQuery } from "@/lib/catalog.functions";
import { dbErrorMessage } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my-account")({
  head: () => ({
    meta: [
      { title: "Mon compte — Maison Noura" },
      {
        name: "description",
        content: "Gérez vos informations personnelles et vos adresses de livraison.",
      },
      { property: "og:title", content: "Mon compte — Maison Noura" },
      { property: "og:description", content: "Espace client Maison Noura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyAccountPage,
});

function MyAccountPage() {
  const { t } = useI18n();
  return (
    <StoreLayout>
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl font-bold">{t("account.title")}</h1>
          <Button asChild variant="outline" size="sm">
            <Link to="/my-orders">{t("account.orders")}</Link>
          </Button>
        </div>
        <ProfileCard />
        <AddressesCard />
      </div>
    </StoreLayout>
  );
}

function ProfileCard() {
  const { t, setLocale } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const profile = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState({ full_name: "", phone: "", preferred_locale: "fr" as Locale });
  useEffect(() => {
    if (profile.data)
      setForm({
        full_name: profile.data.full_name ?? "",
        phone: profile.data.phone ?? "",
        preferred_locale: (profile.data.preferred_locale as Locale) ?? "fr",
      });
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").upsert({
        id: user!.id,
        email: user!.email ?? null,
        full_name: form.full_name.trim() || null,
        phone: form.phone.trim() || null,
        preferred_locale: form.preferred_locale,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("common.saved"));
      setLocale(form.preferred_locale);
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <h2 className="text-lg font-semibold">{t("account.profile")}</h2>
      {profile.isLoading ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>{t("auth.fullName")}</Label>
            <Input
              value={form.full_name}
              maxLength={120}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("auth.email")}</Label>
            <Input value={user?.email ?? ""} disabled dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("account.phone")}</Label>
            <Input
              value={form.phone}
              maxLength={20}
              inputMode="tel"
              dir="ltr"
              placeholder="22 123 456"
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("account.language")}</Label>
            <Select
              value={form.preferred_locale}
              onValueChange={(v) => setForm({ ...form, preferred_locale: v as Locale })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Button disabled={save.isPending}>{t("common.save")}</Button>
          </div>
        </form>
      )}
    </section>
  );
}

const emptyAddress = {
  label: "",
  full_name: "",
  phone: "",
  city: "",
  address_line: "",
  instructions: "",
};

function AddressesCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyAddress);
  const settings = useQuery(storeSettingsQuery());
  const addresses = useQuery({
    queryKey: ["addresses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addresses")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const phone = form.phone.replace(/[^0-9+]/g, "");
      if (!/^(\+?216)?[2-9]\d{7}$/.test(phone))
        throw new Error("Numéro de téléphone invalide (8 chiffres).");
      const { error } = await supabase.from("addresses").insert({
        user_id: user!.id,
        label: form.label.trim() || null,
        full_name: form.full_name.trim(),
        phone,
        city: form.city,
        address_line: form.address_line.trim(),
        instructions: form.instructions.trim() || null,
        is_default: (addresses.data?.length ?? 0) === 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setForm(emptyAddress);
      qc.invalidateQueries({ queryKey: ["addresses"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  const makeDefault = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", user!.id);
      if (e1) throw e1;
      const { error } = await supabase.from("addresses").update({ is_default: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["addresses"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("addresses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["addresses"] }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate();
  }

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{t("account.addresses")}</h2>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus /> {t("account.address.add")}
        </Button>
      </div>
      {addresses.isLoading ? (
        <Skeleton className="mt-4 h-20" />
      ) : addresses.data?.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {addresses.data.map((a) => (
            <div key={a.id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 font-medium">
                  <MapPin className="h-4 w-4 text-primary" /> {a.label || a.city}
                  {a.is_default && (
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">
                      {t("account.address.default")}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  {!a.is_default && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => makeDefault.mutate(a.id)}
                      aria-label={t("account.address.default")}
                    >
                      <Star />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => remove.mutate(a.id)}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-sm">
                {a.full_name} · <span dir="ltr">{a.phone}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {a.address_line}, {a.city}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{t("account.addresses.empty")}</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("account.address.add")}</DialogTitle>
          </DialogHeader>
          <form id="addr" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("account.address.label")}</Label>
              <Input
                value={form.label}
                maxLength={60}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("auth.fullName")}</Label>
              <Input
                required
                minLength={2}
                maxLength={120}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("account.phone")}</Label>
              <Input
                required
                dir="ltr"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("account.address.city")}</Label>
              <Select
                value={form.city}
                onValueChange={(v) => setForm({ ...form, city: v })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(settings.data?.delivery_cities ?? []).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("account.address.line")}</Label>
              <Textarea
                required
                minLength={5}
                maxLength={500}
                value={form.address_line}
                onChange={(e) => setForm({ ...form, address_line: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>
                {t("account.address.instructions")}{" "}
                <span className="text-muted-foreground">({t("common.optional")})</span>
              </Label>
              <Input
                maxLength={500}
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button form="addr" disabled={add.isPending || !form.city}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
