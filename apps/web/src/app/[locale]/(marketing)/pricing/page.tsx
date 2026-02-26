import { useTranslations } from "next-intl";

export default function PricingPage() {
  const t = useTranslations("pricing");

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-24">
      <h1 className="text-3xl font-bold text-slate-900">
        {t("title")}
      </h1>
      <p className="mt-4 text-slate-500">{t("trial")}</p>
      <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
        {(["starter", "pro", "enterprise"] as const).map((plan) => (
          <div
            key={plan}
            className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
          >
            <h3 className="text-lg font-semibold text-slate-900">
              {t(`${plan}.name`)}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {t(`${plan}.description`)}
            </p>
            <p className="mt-4 text-3xl font-bold text-brand">
              CHF {t(`${plan}.price`)}
              <span className="text-sm font-normal text-slate-500">
                /{t("monthly")}
              </span>
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
