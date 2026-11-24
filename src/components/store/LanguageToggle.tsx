import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => setLocale(locale === "fr" ? "ar" : "fr")}
      aria-label={locale === "fr" ? "العربية" : "Français"}
    >
      <Languages />
      <span className="font-semibold">{locale === "fr" ? "العربية" : "FR"}</span>
    </Button>
  );
}
