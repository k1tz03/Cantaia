import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
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
    },
  },
];

export default eslintConfig;
