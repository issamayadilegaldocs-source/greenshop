import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader } from "@/components/admin/AdminShell";
import { DescriptionGenerator } from "@/components/admin/ai/DescriptionGenerator";
import { TemplatesManager } from "@/components/admin/ai/TemplatesManager";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/ai-writer")({
  head: () => ({
    meta: [
      { title: "Rédaction IA — Maison Noura" },
      {
        name: "description",
        content: "Générez des descriptions produit prêtes à publier à partir des caractéristiques.",
      },
      { property: "og:title", content: "Rédaction IA — Maison Noura" },
      {
        property: "og:description",
        content: "Assistant de rédaction des descriptions produit Maison Noura.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AiWriterPage,
});

function AiWriterPage() {
  const { tr } = useI18n();
  const { isAdmin } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Sparkles}
        title={tr("Rédaction IA", "التحرير بالذكاء الاصطناعي")}
        description={tr(
          "Saisissez les caractéristiques d'un produit et obtenez une description prête à publier, en français et en arabe.",
          "أدخل خصائص المنتج واحصل على وصف جاهز للنشر بالفرنسية والعربية.",
        )}
      />
      {!isAdmin ? (
        <EmptyState
          icon={ShieldAlert}
          title={tr("Réservé aux administrateurs", "مخصص للمسؤولين")}
          description={tr(
            "Demandez à un administrateur de vous donner l'accès.",
            "اطلب من المسؤول منحك الصلاحية.",
          )}
        />
      ) : (
        <Tabs defaultValue="generate">
          <TabsList>
            <TabsTrigger value="generate">{tr("Générer", "إنشاء")}</TabsTrigger>
            <TabsTrigger value="templates">{tr("Modèles", "القوالب")}</TabsTrigger>
          </TabsList>
          <TabsContent value="generate" className="mt-4">
            <DescriptionGenerator />
          </TabsContent>
          <TabsContent value="templates" className="mt-4">
            <TemplatesManager />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
