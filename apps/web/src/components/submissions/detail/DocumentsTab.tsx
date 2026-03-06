"use client";

import { FileText } from "lucide-react";
import type { TranslateFn } from "./shared";

interface DocumentsTabProps {
  t: TranslateFn;
}

export function DocumentsTab({ t }: DocumentsTabProps) {
  return (
    <div className="text-center py-16">
      <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <FileText className="h-8 w-8 text-gray-400" />
      </div>
      <p className="text-sm text-gray-500">{t("tabDocuments")}</p>
    </div>
  );
}
