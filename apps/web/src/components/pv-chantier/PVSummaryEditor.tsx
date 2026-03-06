"use client";

import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

interface PVSummaryEditorProps {
  pvContent: any;
  setPvContent: (content: any) => void;
  isFinalized: boolean;
}

export function PVSummaryEditor({
  pvContent,
  setPvContent,
  isFinalized,
}: PVSummaryEditorProps) {
  const t = useTranslations("pv");

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-500">
          {t("summary")}
        </label>
        <textarea
          value={pvContent.summary_fr || pvContent.summary || ""}
          onChange={(e) =>
            setPvContent({
              ...pvContent,
              summary_fr: e.target.value,
            })
          }
          rows={3}
          className="w-full resize-none rounded border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none disabled:bg-gray-50"
          disabled={isFinalized}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">
          {t("next_steps")}
        </label>
        {(pvContent.next_steps || []).map(
          (step: string, i: number) => (
            <div key={i} className="mb-1 flex items-center gap-1">
              <span className="text-xs text-gray-400">
                {i + 1}.
              </span>
              <input
                type="text"
                value={step}
                onChange={(e) => {
                  const steps = [...(pvContent.next_steps || [])];
                  steps[i] = e.target.value;
                  setPvContent({ ...pvContent, next_steps: steps });
                }}
                className="flex-1 rounded border border-gray-100 px-2 py-1 text-sm focus:border-brand focus:outline-none disabled:bg-gray-50"
                disabled={isFinalized}
              />
              {!isFinalized && (
                <button
                  onClick={() => {
                    const steps = (
                      pvContent.next_steps || []
                    ).filter((_: any, idx: number) => idx !== i);
                    setPvContent({ ...pvContent, next_steps: steps });
                  }}
                  className="rounded p-0.5 text-gray-300 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )
        )}
        {!isFinalized && (
          <button
            onClick={() =>
              setPvContent({
                ...pvContent,
                next_steps: [
                  ...(pvContent.next_steps || []),
                  "",
                ],
              })
            }
            className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <Plus className="h-3 w-3" />
            {t("add_next_step")}
          </button>
        )}
      </div>
    </div>
  );
}
