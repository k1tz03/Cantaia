import Link from "next/link";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("nav");

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#27272A]">
      <div className="text-center p-8 max-w-md">
        <div className="text-6xl font-bold text-brand mb-4">404</div>
        <h2 className="text-2xl font-bold text-[#FAFAFA] mb-4">
          {t("notFoundTitle")}
        </h2>
        <p className="text-[#71717A] mb-6">
          {t("notFoundDescription")}
        </p>
        <Link
          href="/dashboard"
          className="inline-flex px-6 py-3 bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors"
        >
          {t("backToDashboard")}
        </Link>
      </div>
    </div>
  );
}
