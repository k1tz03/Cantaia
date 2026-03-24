"use client";

import { useTranslations } from "next-intl";
import { Plus, X, Trash2 } from "lucide-react";
import type { PVSection, PVAction } from "./types";

interface PVSectionEditorProps {
  section: PVSection;
  sectionIdx: number;
  isFinalized: boolean;
  onUpdateSection: (index: number, field: string, value: any) => void;
  onRemoveSection: (index: number) => void;
  onAddDecision: (sectionIndex: number) => void;
  onUpdateDecision: (sectionIndex: number, decisionIndex: number, value: string) => void;
  onRemoveDecision: (sectionIndex: number, decisionIndex: number) => void;
  onAddAction: (sectionIndex: number) => void;
  onUpdateAction: (sectionIndex: number, actionIndex: number, field: string, value: any) => void;
  onRemoveAction: (sectionIndex: number, actionIndex: number) => void;
}

export function PVSectionEditor({
  section,
  sectionIdx,
  isFinalized,
  onUpdateSection,
  onRemoveSection,
  onAddDecision,
  onUpdateDecision,
  onRemoveDecision,
  onAddAction,
  onUpdateAction,
  onRemoveAction,
}: PVSectionEditorProps) {
  const t = useTranslations("pv");

  return (
    <div className="mb-4 rounded-lg border border-[#27272A] bg-[#0F0F11] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-brand/10 text-xs font-semibold text-brand">
            {section.number}
          </span>
          <input
            type="text"
            value={section.title}
            onChange={(e) =>
              onUpdateSection(sectionIdx, "title", e.target.value)
            }
            className="border-0 bg-transparent text-sm font-semibold text-[#FAFAFA] focus:outline-none disabled:text-[#71717A]"
            placeholder={t("section_title")}
            disabled={isFinalized}
          />
        </div>
        {!isFinalized && (
          <button
            onClick={() => onRemoveSection(sectionIdx)}
            className="rounded p-1 text-[#71717A] hover:bg-red-500/10 hover:text-red-500"
            title={t("delete_section")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs text-[#71717A]">
          {t("discussion")}
        </label>
        <textarea
          value={section.content}
          onChange={(e) =>
            onUpdateSection(sectionIdx, "content", e.target.value)
          }
          rows={3}
          className="w-full resize-none rounded border border-[#27272A] px-3 py-2 text-sm focus:border-brand focus:outline-none disabled:bg-[#27272A]"
          disabled={isFinalized}
        />
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-[#71717A]">
          {t("decisions")}
        </label>
        {(section.decisions || []).map(
          (decision: string, decIdx: number) => (
            <div
              key={decIdx}
              className="mb-1 flex items-center gap-1"
            >
              <span className="text-xs text-[#71717A]">•</span>
              <input
                type="text"
                value={decision}
                onChange={(e) =>
                  onUpdateDecision(
                    sectionIdx,
                    decIdx,
                    e.target.value
                  )
                }
                className="flex-1 rounded border border-[#27272A] px-2 py-1 text-sm focus:border-brand focus:outline-none disabled:bg-[#27272A]"
                disabled={isFinalized}
              />
              {!isFinalized && (
                <button
                  onClick={() =>
                    onRemoveDecision(sectionIdx, decIdx)
                  }
                  className="rounded p-0.5 text-[#71717A] hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )
        )}
        {!isFinalized && (
          <button
            onClick={() => onAddDecision(sectionIdx)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-[#F97316] hover:text-[#F97316]"
          >
            <Plus className="h-3 w-3" />
            {t("add_decision")}
          </button>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[#71717A]">
          {t("actions")}
        </label>
        {(section.actions || []).map(
          (action: PVAction, actIdx: number) => (
            <div
              key={actIdx}
              className="mb-2 rounded border border-[#27272A] bg-[#27272A] p-2"
            >
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={action.description}
                  onChange={(e) =>
                    onUpdateAction(
                      sectionIdx,
                      actIdx,
                      "description",
                      e.target.value
                    )
                  }
                  placeholder={t("action_description")}
                  className="flex-1 rounded border border-[#27272A] bg-[#0F0F11] px-2 py-1 text-sm focus:border-brand focus:outline-none disabled:bg-[#27272A]"
                  disabled={isFinalized}
                />
                {!isFinalized && (
                  <button
                    onClick={() =>
                      onRemoveAction(sectionIdx, actIdx)
                    }
                    className="rounded p-0.5 text-[#71717A] hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                <input
                  type="text"
                  value={action.responsible_name}
                  onChange={(e) =>
                    onUpdateAction(
                      sectionIdx,
                      actIdx,
                      "responsible_name",
                      e.target.value
                    )
                  }
                  placeholder={t("responsible")}
                  className="rounded border border-[#27272A] bg-[#0F0F11] px-2 py-1 text-xs focus:border-brand focus:outline-none disabled:bg-[#27272A]"
                  disabled={isFinalized}
                />
                <input
                  type="text"
                  value={action.responsible_company}
                  onChange={(e) =>
                    onUpdateAction(
                      sectionIdx,
                      actIdx,
                      "responsible_company",
                      e.target.value
                    )
                  }
                  placeholder={t("company")}
                  className="rounded border border-[#27272A] bg-[#0F0F11] px-2 py-1 text-xs focus:border-brand focus:outline-none disabled:bg-[#27272A]"
                  disabled={isFinalized}
                />
                <input
                  type="text"
                  value={action.deadline || ""}
                  onChange={(e) =>
                    onUpdateAction(
                      sectionIdx,
                      actIdx,
                      "deadline",
                      e.target.value || null
                    )
                  }
                  placeholder={t("deadline")}
                  className="rounded border border-[#27272A] bg-[#0F0F11] px-2 py-1 text-xs focus:border-brand focus:outline-none disabled:bg-[#27272A]"
                  disabled={isFinalized}
                />
                <select
                  value={action.priority}
                  onChange={(e) =>
                    onUpdateAction(
                      sectionIdx,
                      actIdx,
                      "priority",
                      e.target.value
                    )
                  }
                  className="rounded border border-[#27272A] bg-[#0F0F11] px-2 py-1 text-xs focus:border-brand focus:outline-none disabled:bg-[#27272A]"
                  disabled={isFinalized}
                >
                  <option value="normal">
                    {t("priority_normal")}
                  </option>
                  <option value="urgent">
                    {t("priority_urgent")}
                  </option>
                </select>
              </div>
            </div>
          )
        )}
        {!isFinalized && (
          <button
            onClick={() => onAddAction(sectionIdx)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-[#F97316] hover:text-[#F97316]"
          >
            <Plus className="h-3 w-3" />
            {t("add_action")}
          </button>
        )}
      </div>
    </div>
  );
}
