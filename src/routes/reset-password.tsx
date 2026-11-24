import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/store/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nouveau mot de passe — Maison Noura" },
      {
        name: "description",
        content: "Choisissez un nouveau mot de passe pour votre compte Maison Noura.",
      },
      { property: "og:title", content: "Nouveau mot de passe — Maison Noura" },
      { property: "og:description", content: "Réinitialisation du mot de passe Maison Noura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("auth.passwordUpdated"));
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <Logo />
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-card"
      >
        <h1 className="text-xl font-bold">{t("auth.newPassword")}</h1>
        <div className="space-y-1.5">
          <Label htmlFor="pw">{t("auth.newPassword")}</Label>
          <Input
            id="pw"
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
            autoComplete="new-password"
          />
        </div>
        <Button className="w-full" disabled={busy}>
          {t("auth.updatePassword")}
        </Button>
      </form>
    </div>
  );
}
