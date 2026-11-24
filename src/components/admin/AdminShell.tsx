import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  BarChart3,
  Boxes,
  ExternalLink,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Package,
  RotateCcw,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/store/Logo";
import { LanguageToggle } from "@/components/store/LanguageToggle";
import { useSignOut } from "@/components/store/AccountMenu";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type NavItem = {
  to?:
    | "/admin/dashboard"
    | "/admin/categories"
    | "/admin/products"
    | "/admin/inventory"
    | "/admin/ai-writer"
    | "/admin/settings"
    | "/admin/orders"
    | "/admin/customers"
    | "/admin/returns"
    | "/admin/reviews"
    | "/admin/finances";
  icon: typeof LayoutDashboard;
  fr: string;
  ar: string;
  soon?: string;
};

const NAV: { group: [string, string]; items: NavItem[] }[] = [
  {
    group: ["Pilotage", "القيادة"],
    items: [
      { to: "/admin/dashboard", icon: LayoutDashboard, fr: "Tableau de bord", ar: "لوحة القيادة" },
    ],
  },
  {
    group: ["Catalogue", "الكتالوج"],
    items: [
      {
        to: "/admin/categories",
        icon: FolderTree,
        fr: "Catégories & attributs",
        ar: "الأقسام والخصائص",
      },
      { icon: Package, fr: "Produits", ar: "المنتجات", to: "/admin/products" },
      { icon: Boxes, fr: "Stock", ar: "المخزون", to: "/admin/inventory" },
      {
        to: "/admin/ai-writer",
        icon: Sparkles,
        fr: "Rédaction IA",
        ar: "التحرير بالذكاء الاصطناعي",
      },
    ],
  },
  {
    group: ["Ventes", "المبيعات"],
    items: [
      { to: "/admin/orders", icon: ShoppingBag, fr: "Commandes", ar: "الطلبات" },
      { to: "/admin/customers", icon: Users, fr: "Clients", ar: "الحرفاء" },
      { to: "/admin/returns", icon: RotateCcw, fr: "Retours", ar: "الإرجاع" },
      { to: "/admin/reviews", icon: MessageSquareText, fr: "Avis", ar: "التقييمات" },
      { to: "/admin/finances", icon: Wallet, fr: "Finances", ar: "المالية" },
    ],
  },
  {
    group: ["Boutique", "المتجر"],
    items: [{ to: "/admin/settings", icon: Settings, fr: "Paramètres", ar: "الإعدادات" }],
  },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { tr } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {NAV.map((section) => (
        <div key={section.group[0]}>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            {tr(section.group[0], section.group[1])}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              const label = tr(item.fr, item.ar);
              if (!item.to) {
                return (
                  <li key={item.fr}>
                    <span className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/40">
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{label}</span>
                      <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium text-sidebar-foreground/60">
                        {tr("Phase", "مرحلة")} {item.soon}
                      </span>
                    </span>
                  </li>
                );
              }
              const active = pathname.startsWith(item.to);
              return (
                <li key={item.fr}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", active && "text-sidebar-primary")} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  const { user, isAdmin } = useAuth();
  const { tr } = useI18n();
  const signOut = useSignOut();
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
          {(user?.email ?? "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-sidebar-accent-foreground">
            {user?.email}
          </p>
          <p className="text-[11px] text-sidebar-foreground/60">
            {isAdmin ? tr("Administrateur", "مسؤول") : tr("Équipe", "فريق")}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={signOut}
          aria-label="Déconnexion"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { tr, locale } = useI18n();
  return (
    <div className="min-h-screen bg-muted/40">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col bg-sidebar lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo inverted />
        </div>
        <SidebarNav />
        <SidebarFooter />
      </aside>
      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={locale === "ar" ? "right" : "left"}
              className="flex w-64 flex-col border-0 bg-sidebar p-0"
            >
              <div className="flex h-16 items-center px-5">
                <Logo inverted />
              </div>
              <SidebarNav />
              <SidebarFooter />
            </SheetContent>
          </Sheet>
          <span className="text-sm font-medium text-muted-foreground">
            {tr("Espace administration", "فضاء الإدارة")}
          </span>
          <div className="ms-auto flex items-center gap-2">
            <LanguageToggle />
            <Button asChild variant="outline" size="sm">
              <a href="/" target="_blank" rel="noreferrer">
                <ExternalLink />{" "}
                <span className="hidden sm:inline">{tr("Voir la boutique", "عرض المتجر")}</span>
              </a>
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: typeof BarChart3;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof BarChart3;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-4 font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { tr } = useI18n();
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
      <p className="font-medium text-destructive">
        {tr("Impossible de charger les données", "تعذر تحميل البيانات")}
      </p>
      <p className="mt-1 text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
          {tr("Réessayer", "إعادة المحاولة")}
        </Button>
      )}
    </div>
  );
}
