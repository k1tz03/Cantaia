import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // The app-route disallow patterns below are prefix matches, so
        // `/*/pv` would also swallow `/fr/solutions/pv-chantier` and
        // `/*/rapports` would swallow `/fr/solutions/rapports-chantier`.
        // These longer Allow rules win by specificity and keep the public
        // solution pages crawlable.
        allow: ["/", "/*/solutions", "/*/solutions/*"],
        disallow: [
          "/api/",
          "/admin/",
          "/super-admin/",
          "/*/dashboard",
          "/*/mail",
          "/*/projects",
          "/*/tasks",
          "/*/plans",
          "/*/submissions",
          "/*/suppliers",
          "/*/settings",
          "/*/briefing",
          "/*/direction",
          "/*/chat",
          "/*/pv-chantier",
          "/*/visits",
          "/*/cantaia-prix",
          "/*/onboarding",
          "/*/site-reports",
          "/*/rapports",
          "/*/calendar",
          "/*/support",
          "/*/portal",
          "/*/action-board",
          "/*/pricing-intelligence",
          "/*/pv",
          "/*/meetings",
        ],
      },
    ],
    sitemap: "https://cantaia.io/sitemap.xml",
  };
}
