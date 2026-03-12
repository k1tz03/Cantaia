import { MarketingHeader } from "@/components/marketing/Header";
import { MarketingFooter } from "@/components/marketing/Footer";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Cantaia",
  url: "https://cantaia.ch",
  logo: "https://cantaia.ch/opengraph-image",
  description: "AI-powered construction management SaaS for Swiss project managers.",
  address: {
    "@type": "PostalAddress",
    addressCountry: "CH",
  },
  foundingDate: "2026",
  knowsAbout: [
    "Construction project management",
    "AI email classification",
    "CFC Swiss construction standards",
    "Meeting minutes automation",
    "Price estimation",
  ],
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
