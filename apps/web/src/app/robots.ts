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
          "/*/rapports",
        ],
      },
    ],
    sitemap: "https://cantaia.io/sitemap.xml",
  };
}
