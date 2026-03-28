import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Exclure les fichiers minifiés et générés
  {
    ignores: [
      "src/lib/audio/lame.min.js",
      "src/lib/audio/lame.min.js.map",
    ],
  },
  // next/core-web-vitals : règles Next.js + React
  // next/typescript : charge le plugin @typescript-eslint (requis pour les disable comments inline)
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // La codebase utilise (x as any) comme workaround pour les bugs de types Supabase
      "@typescript-eslint/no-explicit-any": "off",
      // Certains fichiers utilisent require() pour les imports dynamiques serveur
      "@typescript-eslint/no-require-imports": "off",
      // Apostrophes et guillemets français dans le JSX — trop répandus pour corriger en masse
      "react/no-unescaped-entities": "off",
      // Liens internes avec <a> au lieu de <Link> — à migrer progressivement
      "@next/next/no-html-link-for-pages": "warn",
      // Préférence stylistique — trop de violations dans la codebase existante
      "prefer-const": "off",
      // lame.min.js est exclu mais par sécurité on désactive pour les autres cas similaires
      "@typescript-eslint/no-this-alias": "off",
    },
  },
];

export default eslintConfig;
