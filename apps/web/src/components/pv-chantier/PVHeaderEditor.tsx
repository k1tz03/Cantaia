"use client";

import { useTranslations } from "next-intl";

interface PVHeaderEditorProps {
  pvContent: any;
  setPvContent: (content: any) => void;
  isFinalized: boolean;
}

export function PVHeaderEditor({
  pvContent,
  setPvContent,
  isFinalized,
}: PVHeaderEditorProps) {
  const t = useTranslations("pv");

  return (
    <div className="mb-6 rounded-lg border border-[#27272A] bg-[#0F0F11] p-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#71717A]">
            {t("col_title")}
          </label>
          <input
            type="text"
            value={pvContent.header?.date || ""}
            onChange={(e) =>
              setPvContent({
                ...pvContent,
                header: { ...pvContent.header, date: e.target.value },
              })
            }
            className="w-full rounded border border-[#27272A] px-2 py-1.5 text-sm disabled:bg-[#27272A]"
            disabled={isFinalized}
            placeholder={t("date")}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#71717A]">
            {t("location")}
          </label>
          <input
            type="text"
            value={pvContent.header?.location || ""}
            onChange={(e) =>
              setPvContent({
                ...pvContent,
                header: {
                  ...pvContent.header,
                  location: e.target.value,
                },
              })
            }
            className="w-full rounded border border-[#27272A] px-2 py-1.5 text-sm disabled:bg-[#27272A]"
            disabled={isFinalized}
          />
        </div>
      </div>
    </div>
  );
}
