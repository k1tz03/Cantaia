import { ComingSoonProduct } from "@/components/app/ComingSoonProduct";
import { Mail } from "lucide-react";

export default function MailPage() {
  return (
    <ComingSoonProduct
      icon={Mail}
      titleKey="products.mail.title"
      descriptionKey="products.mail.coming_soon_description"
      estimatedDate="Q2 2026"
      features={[
        "products.mail.feature.sync_outlook",
        "products.mail.feature.ai_classification",
        "products.mail.feature.morning_briefing",
        "products.mail.feature.suggested_replies",
        "products.mail.feature.project_inbox",
      ]}
    />
  );
}
