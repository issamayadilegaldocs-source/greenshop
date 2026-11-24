import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/store/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin-setup")({
  head: () => ({
    meta: [
      { title: "Accès administrateur — Maison Noura" },
      { name: "description", content: "Configuration du premier administrateur de la boutique." },
      { property: "og:title", content: "Accès administrateur — Maison Noura" },
      { property: "og:description", content: "Configuration administrateur Maison Noura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSetupPage,
});

function AdminSetupPage() {
  const { t } = useI18n();
  const { isStaff, user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const exists = useQuery({
    queryKey: ["admin-exists"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_exists");
      if (error) throw error;
      return data;
    },
  });

  const claim = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("claim_first_admin");
      if (error) throw error;
      return data;
    },
    onSuccess: async (ok) => {
      if (!ok) {
        toast.error(t("setup.taken"));
        qc.invalidateQueries({ queryKey: ["admin-exists"] });
        return;
      }
      toast.success(t("setup.done"));
      await qc.invalidateQueries({ queryKey: ["my-roles"] });
      navigate({ to: "/admin/dashboard" });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/40 px-4">
      <Logo />
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-card">
        {isStaff ? (
          <>
            <ShieldCheck className="mx-auto h-10 w-10 text-success" />
            <p className="mt-4 font-medium">{t("setup.done")}</p>
            <Button asChild className="mt-6">
              <Link to="/admin/dashboard">{t("nav.admin")}</Link>
            </Button>
          </>
        ) : exists.isLoading ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : exists.data ? (
          <>
            <ShieldX className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="mt-4 text-xl font-bold">{t("setup.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("setup.taken")}</p>
            <p className="mt-4 text-xs text-muted-foreground" dir="ltr">
              {user?.email}
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/">{t("nav.home")}</Link>
            </Button>
          </>
        ) : (
          <>
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 text-xl font-bold">{t("setup.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("setup.desc")}</p>
            <p className="mt-4 text-xs text-muted-foreground" dir="ltr">
              {user?.email}
            </p>
            <Button
              className="mt-6 w-full"
              disabled={claim.isPending}
              onClick={() => claim.mutate()}
            >
              {t("setup.claim")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
