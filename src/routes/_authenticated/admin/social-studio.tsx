import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/admin/AdminShell";
import { SocialMarketingStudio } from "@/components/admin/ai/SocialMarketingStudio";
import { useI18n } from "@/lib/i18n";

const searchSchema = z.object({
  productId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/_authenticated/admin/social-studio")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Studio Social IA — Maison Noura" },
      {
        name: "description",
        content:
          "Choisissez un produit et générez en un clic une vidéo Reels/Pub et des posts Facebook & Instagram prêts à publier.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SocialStudioPage,
});

function SocialStudioPage() {
  const { tr } = useI18n();
  const { productId } = Route.useSearch();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Megaphone}
        title={tr("Studio Social & Vidéo IA", "استوديو الفيديو ومنشورات التواصل بالذكاء الاصطناعي")}
        description={tr(
          "Sélectionnez un produit pour générer instantanément une vidéo publicitaire (Reels / Stories / Feed) ainsi que des posts Facebook, Instagram et Meta Ads pour accélérer vos ventes.",
          "اختر أي منتج لإنشاء فيديو إعلاني جاهز للتحميل ومنشورات فيسبوك وإنستغرام لتسريع مبيعاتك.",
        )}
      />
      <SocialMarketingStudio initialProductId={productId} />
    </div>
  );
}
