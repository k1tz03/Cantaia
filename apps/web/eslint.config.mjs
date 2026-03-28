import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // next/core-web-vitals : règles Next.js + React (sans TypeScript strict)
  // next/typescript est exclu intentionnellement : la codebase utilise (x as any)
  // comme workaround pour les bugs de types Supabase — à ajouter après migration
  ...compat.extends("next/core-web-vitals"),
];

export default eslintConfig;
