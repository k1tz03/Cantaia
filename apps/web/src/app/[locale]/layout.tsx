import type { Metadata } from "next";
import { Inter, Playfair_Display, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "sonner";
import CookieConsent from "@/components/CookieConsent";
import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const BASE_URL = "https://cantaia.io";

const seoData: Record<string, { title: string; description: string; ogLocale: string }> = {
  fr: {
    title: "Cantaia — L'IA au service du chantier",
    description:
      "Logiciel de gestion de chantier augmenté par IA pour les chefs de projet construction en Suisse. Soumissions CFC, plans, PV de séance, triage email Outlook, estimation de prix — tout centralisé.",
    ogLocale: "fr_CH",
  },
  en: {
    title: "Cantaia — AI-Powered Construction Management",
    description:
      "AI-powered construction project management software for Swiss builders. CFC submissions, plans, meeting minutes, Outlook email triage, price estimation — all in one platform.",
    ogLocale: "en_US",
  },
  de: {
    title: "Cantaia — KI-gestützte Baustellenverwaltung",
    description:
      "KI-gestützte Bauprojekt-Management-Software für Schweizer Bauleiter. CFC-Ausschreibungen, Pläne, Sitzungsprotokolle, Outlook-E-Mail-Triage, Preisschätzung — alles zentral.",
    ogLocale: "de_CH",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const seo = seoData[locale] || seoData.fr;

  return {
    title: {
      default: seo.title,
      template: "%s | Cantaia",
    },
    description: seo.description,
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: `${BASE_URL}/${locale}`,
      languages: {
        "fr": `${BASE_URL}/fr`,
        "en": `${BASE_URL}/en`,
        "de": `${BASE_URL}/de`,
        "x-default": `${BASE_URL}/fr`,
      },
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: `${BASE_URL}/${locale}`,
      siteName: "Cantaia",
      type: "website",
      locale: seo.ogLocale,
      alternateLocale: ["fr_CH", "en_US", "de_CH"].filter((l) => l !== seo.ogLocale),
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "Cantaia — AI-powered construction management",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    manifest: "/manifest.json",
    other: {
      "theme-color": "#0A1F30",
      "apple-mobile-web-app-capable": "yes",
      "apple-mobile-web-app-status-bar-style": "black-translucent",
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${inter.variable} ${playfair.variable} ${jetbrainsMono.variable} ${plusJakarta.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider messages={messages}>
            {children}
            <Toaster position="bottom-right" richColors closeButton theme="system" />
            <CookieConsent />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
