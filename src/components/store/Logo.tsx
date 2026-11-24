import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Link
      to="/"
      className={cn("group inline-flex items-center gap-2", className)}
      aria-label="Maison Noura"
    >
      <span
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full font-display text-sm font-bold",
          inverted
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "bg-primary text-primary-foreground",
        )}
      >
        N
      </span>
      <span
        className={cn(
          "font-display text-xl font-semibold tracking-tight",
          inverted ? "text-sidebar-accent-foreground" : "text-foreground",
        )}
      >
        Maison <span className={inverted ? "text-sidebar-primary" : "text-primary"}>Noura</span>
      </span>
    </Link>
  );
}
