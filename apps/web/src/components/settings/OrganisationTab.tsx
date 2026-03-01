"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Palette,
  Users,
  ArrowRight,
} from "lucide-react";

export function OrganisationTab() {
  const t = useTranslations("settings");

  return (
    <div className="space-y-6">
      {/* Redirect to Admin */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-800">
          <Palette className="h-4 w-4" />
          {t("brandingTitle")}
        </h3>
        <p className="mb-3 text-sm text-blue-700">
          La personnalisation visuelle de votre organisation se fait depuis la page d&apos;administration.
        </p>
        <Link
          href="/admin/branding"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 sm:w-auto sm:justify-start"
        >
          Accéder à la personnalisation
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Redirect to Members */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Users className="h-4 w-4 text-gray-400" />
          {t("teamMembers")}
        </h3>
        <p className="mb-3 text-sm text-gray-500">
          La gestion des membres de votre organisation se fait depuis la page d&apos;administration.
        </p>
        <Link
          href="/admin/members"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 sm:w-auto sm:justify-start"
        >
          Gérer les membres
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
