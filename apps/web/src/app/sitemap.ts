import type { MetadataRoute } from "next";

/**
 * Refresh the sitemap once a day so `lastModified` does not freeze on the date
 * of whichever build happened to be deployed (the live sitemap was stuck on a
 * months-old build date, which tells crawlers nothing ever changes).
 */
export const revalidate = 86400;

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://cantaia.io";
  const locales = ["fr", "en", "de"];
  const lastModified = new Date();

  // Marketing pages only — /login and /register are noindexed (auth layout)
  // and don't belong in the sitemap.
  const pages: {
    path: string;
    changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
    priority: number;
  }[] = [
    { path: "", changeFrequency: "weekly", priority: 1.0 },
    { path: "/solutions", changeFrequency: "monthly", priority: 0.9 },
    { path: "/solutions/soumissions-cfc", changeFrequency: "monthly", priority: 0.9 },
    { path: "/solutions/pv-chantier", changeFrequency: "monthly", priority: 0.9 },
    { path: "/solutions/planning-chantier", changeFrequency: "monthly", priority: 0.9 },
    { path: "/solutions/rapports-chantier", changeFrequency: "monthly", priority: 0.9 },
    { path: "/modules", changeFrequency: "monthly", priority: 0.8 },
    { path: "/produits", changeFrequency: "monthly", priority: 0.8 },
    { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
    { path: "/about", changeFrequency: "monthly", priority: 0.6 },
    { path: "/legal/cgv", changeFrequency: "yearly", priority: 0.2 },
    { path: "/legal/mentions", changeFrequency: "yearly", priority: 0.2 },
    { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.2 },
  ];

  const entries: MetadataRoute.Sitemap = [];

  for (const page of pages) {
    for (const locale of locales) {
      entries.push({
        url: `${baseUrl}/${locale}${page.path}`,
        lastModified,
        changeFrequency: page.changeFrequency,
        priority: page.priority,
        alternates: {
          languages: {
            fr: `${baseUrl}/fr${page.path}`,
            en: `${baseUrl}/en${page.path}`,
            de: `${baseUrl}/de${page.path}`,
            "x-default": `${baseUrl}/fr${page.path}`,
          },
        },
      });
    }
  }

  return entries;
}
