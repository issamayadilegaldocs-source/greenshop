import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/store/Logo";
import { LanguageToggle } from "@/components/store/LanguageToggle";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Connexion — Maison Noura" },
      {
        name: "description",
        content: "Connectez-vous ou créez votre compte Maison Noura pour suivre vos commandes.",
      },
      { property: "og:title", content: "Connexion — Maison Noura" },
      { property: "og:description", content: "Accédez à votre espace client Maison Noura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const REDIRECT_KEY = "weshop.postAuthRedirect";

function safePath(p: string | undefined | null): string {
  if (!p) return "/";
  try {
    const url = new URL(p, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

function AuthPage() {
  const { t } = useI18n();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // remember destination (survives OAuth round-trip)
  useEffect(() => {
    if (redirect) window.sessionStorage.setItem(REDIRECT_KEY, safePath(redirect));
  }, [redirect]);

  // once signed in, go to the stored destination
  useEffect(() => {
    if (loading || !user) return;
    const target = safePath(window.sessionStorage.getItem(REDIRECT_KEY) ?? redirect);
    window.sessionStorage.removeItem(REDIRECT_KEY);
    navigate({ to: target, replace: true });
  }, [user, loading, redirect, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        if (fullName.trim().length < 2) throw new Error(t("auth.fullName"));
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/auth",
            data: { full_name: fullName.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success(t("auth.checkEmail"));
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success(t("auth.resetSent"));
        setMode("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + "/auth" },
    });
    if (error) toast.error(error.message ?? t("common.error"));
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-hero p-10 text-ink-foreground lg:flex">
        <Logo inverted />
        <div>
          <h2 className="max-w-md text-4xl font-bold leading-tight">{t("home.hero.title")}</h2>
          <p className="mt-4 max-w-sm text-ink-foreground/75">{t("footer.cod")}</p>
        </div>
        <p className="text-xs text-ink-foreground/60">© Maison Noura</p>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4">
          <div className="lg:hidden">
            <Logo />
          </div>
          <Link
            to="/"
            className="hidden text-sm text-muted-foreground hover:text-foreground lg:inline"
          >
            ← {t("nav.home")}
          </Link>
          <LanguageToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold">
              {mode === "signup"
                ? t("auth.title.signup")
                : mode === "forgot"
                  ? t("auth.forgot")
                  : t("auth.title.signin")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("auth.subtitle")}</p>

            {mode !== "forgot" && (
              <>
                <div className="mt-6 grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 border-[#747775] bg-[#FFFFFF] text-[#1F1F1F] hover:bg-[#F8F8F8] hover:text-[#1F1F1F]"
                    onClick={() => oauth("google")}
                  >
                    <GoogleLogo />
                    {t("auth.google")}
                  </Button>
                </div>
                <div className="my-6 flex items-center gap-3 text-xs uppercase text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> {t("auth.or")}{" "}
                  <span className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">{t("auth.fullName")}</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    maxLength={120}
                    autoComplete="name"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  dir="ltr"
                />
              </div>
              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t("auth.password")}</Label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setMode("forgot")}
                      >
                        {t("auth.forgot")}
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    dir="ltr"
                  />
                </div>
              )}
              <Button type="submit" className="h-10 w-full" disabled={busy}>
                {busy
                  ? t("common.loading")
                  : mode === "signup"
                    ? t("auth.submit.signup")
                    : mode === "forgot"
                      ? t("common.save")
                      : t("auth.submit.signin")}
              </Button>
            </form>

            <div className="mt-6 space-y-2 text-center text-sm">
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              >
                {mode === "signup" ? t("auth.switch.toSignin") : t("auth.switch.toSignup")}
              </button>
              <p className="text-xs text-muted-foreground">{t("auth.guestHint")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
