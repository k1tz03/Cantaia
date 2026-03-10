"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, ListChecks, Headphones } from "lucide-react";
import type { PVAction } from "./types";

interface PVSidePanelProps {
  meeting: any;
  allActions: Array<PVAction & { sectionTitle: string; globalIndex: number }>;
  selectedActions: Set<number>;
  isFinalized: boolean;
  onToggleAction: (index: number) => void;
}

export function PVSidePanel({
  meeting,
  allActions,
  selectedActions,
  isFinalized,
  onToggleAction,
}: PVSidePanelProps) {
  const t = useTranslations("pv");
  const [activeTab, setActiveTab] = useState<
    "transcription" | "actions" | "audio"
  >("actions");

  return (
    <div className="hidden w-[35%] border-l border-gray-200 bg-gray-50 lg:flex lg:flex-col">
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("transcription")}
          className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "transcription"
              ? "border-b-2 border-brand text-brand"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <FileText className="mr-1 inline h-3.5 w-3.5" />
          {t("transcription")}
        </button>
        <button
          onClick={() => setActiveTab("actions")}
          className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "actions"
              ? "border-b-2 border-brand text-brand"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <ListChecks className="mr-1 inline h-3.5 w-3.5" />
          {t("actions")} ({allActions.length})
        </button>
        <button
          onClick={() => setActiveTab("audio")}
          className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "audio"
              ? "border-b-2 border-brand text-brand"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Headphones className="mr-1 inline h-3.5 w-3.5" />
          {t("audio")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "transcription" && (
          <div>
            {meeting.transcription_raw ? (
              <div className="rounded-md bg-white p-4 text-sm leading-relaxed text-gray-700 shadow-sm">
                {meeting.transcription_raw}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                {t("no_transcription")}
              </p>
            )}
          </div>
        )}

        {activeTab === "actions" && (
          <div>
            <p className="mb-3 text-xs text-gray-500">
              {t("actions_detected", {
                count: allActions.length,
              })}
            </p>
            {allActions.map((action) => (
              <div
                key={action.globalIndex}
                className="mb-2 rounded-md border border-gray-200 bg-white p-3"
              >
                <div className="flex items-start gap-2">
                  {!isFinalized && (
                    <input
                      type="checkbox"
                      checked={selectedActions.has(
                        action.globalIndex
                      )}
                      onChange={() =>
                        onToggleAction(action.globalIndex)
                      }
                      className="mt-0.5"
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {action.description}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {action.responsible_name}
                      {action.responsible_company
                        ? ` (${action.responsible_company})`
                        : ""}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {action.sectionTitle}
                      </span>
                      {action.priority === "urgent" && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                          {t("priority_urgent")}
                        </span>
                      )}
                      {action.deadline && (
                        <span className="text-xs text-gray-400">
                          {action.deadline}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {allActions.length === 0 && (
              <p className="text-sm text-gray-400">
                {t("no_actions")}
              </p>
            )}
          </div>
        )}

        {activeTab === "audio" && (
          <div>
            {meeting.audio_url ? (
              <div>
                <p className="mb-2 text-sm text-gray-600">
                  {meeting.audio_duration_seconds
                    ? `${Math.floor(meeting.audio_duration_seconds / 60)} min ${meeting.audio_duration_seconds % 60} sec`
                    : ""}
                </p>
                <p className="text-xs text-gray-400">
                  {t("audio_stored")}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                {t("no_audio")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
