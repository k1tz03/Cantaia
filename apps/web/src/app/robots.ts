import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/super-admin/"],
    },
    sitemap: "https://cantaia.ch/sitemap.xml",
  };
}
