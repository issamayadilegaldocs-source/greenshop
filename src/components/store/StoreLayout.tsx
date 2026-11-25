import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Menu, Search, ShoppingBag, Truck } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  publicCategoriesQuery,
  storeSettingsQuery,
  type PublicCategory,
} from "@/lib/catalog.functions";
import { pickLocale, useI18n } from "@/lib/i18n";
import { Logo } from "./Logo";
import { LanguageToggle } from "./LanguageToggle";
import { AccountMenu } from "./AccountMenu";
import { ShoppingAssistant } from "./ShoppingAssistant";

function CategoryMenu({ categories }: { categories: PublicCategory[] }) {
  const { t, locale } = useI18n();
  const roots = categories.filter((c) => !c.parent_id);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1">
          {t("nav.categories")} <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {roots.length === 0 && (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            {t("home.categories.empty")}
          </div>
        )}
        {roots.map((c) => (
          <DropdownMenuItem key={c.id} asChild>
            <Link to="/shop" search={{ c: c.slug }}>
              {pickLocale(c, "name", locale)}
            </Link>
          </DropdownMenuItem>
        ))}
        {roots.length > 0 && (
          <DropdownMenuItem asChild>
            <Link to="/categories" className="font-medium text-primary">
              {t("categories.title")} →
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SearchBox({ className }: { className?: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const current = useRouterState({
    select: (st) =>
      st.location.pathname === "/shop" ? ((st.location.search as { q?: string }).q ?? "") : "",
  });
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  function submit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    navigate({ to: "/shop", search: q ? { q } : {} });
  }
  return (
    <form onSubmit={submit} className={className} role="search">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={value}
          maxLength={120}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("nav.search")}
          aria-label={t("nav.search")}
          className="h-9 rounded-full bg-muted/60 ps-9"
        />
      </div>
    </form>
  );
}

function CartButton() {
  const { count, ready } = useCart();
  const { tr } = useI18n();
  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link to="/cart" aria-label={tr("Panier", "السلة")}>
        <ShoppingBag />
        {ready && count > 0 && (
          <span className="absolute -end-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}

export function StoreLayout({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n();
  const categoriesQuery = useQuery(publicCategoriesQuery());
  const categories = categoriesQuery.data ?? [];
  const { data: settings } = useQuery(storeSettingsQuery());
  const announcement = settings ? pickLocale(settings, "announcement", locale) : "";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {announcement && (
        <div className="bg-ink text-ink-foreground">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-xs font-medium">
            <Truck className="h-3.5 w-3.5" /> {announcement}
          </div>
        </div>
      )}
      {categoriesQuery.isSuccess && categories.length === 0 && (
        <div className="border-b bg-amber-50 px-4 py-2.5 text-center text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠️ <strong>Base de données non initialisée</strong> : Exécutez le script{" "}
          <code className="rounded bg-amber-200/60 px-1.5 py-0.5 font-mono text-[11px] dark:bg-amber-900/60">
            supabase/bootstrap.sql
          </code>{" "}
          dans l'éditeur SQL Supabase pour charger le catalogue.
        </div>
      )}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side={locale === "ar" ? "right" : "left"} className="w-72">
              <SheetHeader>
                <SheetTitle className="text-start">Maison Noura</SheetTitle>
              </SheetHeader>
              <nav className="mt-2 flex flex-col gap-1 px-4">
                <Link to="/" className="rounded-md px-2 py-2 text-sm font-medium hover:bg-accent">
                  {t("nav.home")}
                </Link>
                <Link
                  to="/shop"
                  className="rounded-md px-2 py-2 text-sm font-medium hover:bg-accent"
                >
                  {t("nav.shop")}
                </Link>
                <Link
                  to="/categories"
                  className="rounded-md px-2 py-2 text-sm font-medium hover:bg-accent"
                >
                  {t("nav.categories")}
                </Link>
                <Link
                  to="/track-order"
                  className="rounded-md px-2 py-2 text-sm font-medium hover:bg-accent"
                >
                  {t("nav.track")}
                </Link>
                {categories
                  .filter((c) => !c.parent_id)
                  .map((c) => (
                    <Link
                      key={c.id}
                      to="/shop"
                      search={{ c: c.slug }}
                      className="rounded-md px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                    >
                      {pickLocale(c, "name", locale)}
                    </Link>
                  ))}
              </nav>
            </SheetContent>
          </Sheet>
          <Logo />
          <nav className="ms-4 hidden items-center gap-1 md:flex">
            <Button asChild variant="ghost" size="sm">
              <Link
                to="/"
                activeOptions={{ exact: true }}
                activeProps={{ className: "text-primary" }}
              >
                {t("nav.home")}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/shop" activeProps={{ className: "text-primary" }}>
                {t("nav.shop")}
              </Link>
            </Button>
            <CategoryMenu categories={categories} />
          </nav>
          <SearchBox className="mx-auto hidden max-w-sm flex-1 lg:block" />
          <div className="ms-auto flex items-center gap-1.5 lg:ms-0">
            <LanguageToggle />
            <CartButton />
            <AccountMenu />
          </div>
        </div>
        <div className="border-t px-4 py-2 lg:hidden">
          <SearchBox />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-16 border-t bg-muted/50">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">{t("brand.tagline")}</p>
          </div>
          <div className="text-sm">
            <p className="font-semibold">{t("nav.categories")}</p>
            <ul className="mt-3 space-y-2 text-muted-foreground">
              {categories
                .filter((c) => !c.parent_id)
                .slice(0, 6)
                .map((c) => (
                  <li key={c.id}>
                    <Link to="/shop" search={{ c: c.slug }} className="hover:text-foreground">
                      {pickLocale(c, "name", locale)}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">{t("home.perk.cod")}</p>
            <p>{t("footer.cod")}</p>
            <Link to="/track-order" className="block hover:text-foreground">
              {t("nav.track")}
            </Link>
            {settings?.support_phone && (
              <p dir="ltr" className="text-start">
                {settings.support_phone}
              </p>
            )}
          </div>
        </div>
        <div className="border-t py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Maison Noura. {t("footer.rights")}
        </div>
      </footer>
      <ShoppingAssistant />
    </div>
  );
}
