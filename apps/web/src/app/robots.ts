import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/super-admin/",
          "/*/dashboard",
          "/*/mail",
          "/*/projects",
          "/*/tasks",
          "/*/meetings",
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
          "/*/pricing-intelligence",
          "/*/analytics",
          "/*/api-costs",
          "/*/onboarding",
        ],
      },
    ],
    sitemap: "https://cantaia.ch/sitemap.xml",
  };
}
