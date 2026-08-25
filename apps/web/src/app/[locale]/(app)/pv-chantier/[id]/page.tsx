"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Loader2, FileText, Plus } from "lucide-react";
import { usePVContent } from "@/components/pv-chantier/usePVContent";
import { PVTopBar } from "@/components/pv-chantier/PVTopBar";
import { PVHeaderEditor } from "@/components/pv-chantier/PVHeaderEditor";
import { PVSectionEditor } from "@/components/pv-chantier/PVSectionEditor";
import { PVSummaryEditor } from "@/components/pv-chantier/PVSummaryEditor";
import { PVSidePanel } from "@/components/pv-chantier/PVSidePanel";
import { PVConfirmDialog } from "@/components/pv-chantier/PVConfirmDialog";
import { PVCarriedSection } from "@/components/pv-chantier/PVCarriedSection";
import { PVSendModal } from "@/components/pv-chantier/PVSendModal";
import { PVTemplateModal } from "@/components/pv-chantier/PVTemplateModal";
import { withFallback } from "@/components/pv-chantier/pv-i18n";
import type { PVSection } from "@/components/pv-chantier/types";

/** Falls back to the org-wide practice when migration 095 is not applied. */
const DEFAULT_OPPOSITION_DAYS = 10;

export default function PVDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("pv");
  const tf = withFallback(t);
  const tCommon = useTranslations("common");
  const router = useRouter();

  const pv = usePVContent(id, tf);

  if (pv.loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#A1A1AA]" />
      </div>
    );
  }

  if (!pv.meeting || !pv.pvContent) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <FileText className="h-8 w-8 text-[#A1A1AA]" />
        <p className="text-sm text-[#A1A1AA]">{t("no_pv_found")}</p>
        <button
          onClick={() => router.push("/pv-chantier")}
          className="text-sm text-[#F97316] hover:text-[#F97316]"
        >
          {tCommon("back")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <PVTopBar
        meeting={pv.meeting}
        isFinalized={pv.isFinalized}
        isSent={pv.isSent}
        canSend={pv.canSend}
        saving={pv.saving}
        saveMessage={pv.saveMessage}
        regenerating={pv.regenerating}
        onBack={() => router.push("/pv-chantier")}
        onSave={() => pv.handleSave(t("saved"))}
        onFinalize={() => pv.setShowFinalizeDialog(true)}
        onExportPDF={() => pv.handleExportPDF(t("saved"))}
        onRegenerate={() => pv.setShowRegenerateDialog(true)}
        onDelete={() => pv.setShowDeleteDialog(true)}
        onSend={() => pv.setShowSendModal(true)}
        onOpenTemplate={() => pv.setShowTemplateModal(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 lg:w-[65%]">
          <PVHeaderEditor
            pvContent={pv.pvContent}
            setPvContent={pv.setPvContent}
            isFinalized={pv.isFinalized}
          />

          {(pv.pvContent.sections || []).map(
            (section: PVSection, sectionIdx: number) =>
              // Points inherited from the previous séance get their own editor:
              // only their status is editable, and it drives whether they are
              // carried again into the next PV.
              section.carried_over ? (
                <PVCarriedSection
                  key={sectionIdx}
                  section={section}
                  sectionIdx={sectionIdx}
                  isFinalized={pv.isFinalized}
                  onUpdateCarriedStatus={pv.updateCarriedStatus}
                  onRemoveAction={pv.removeAction}
                />
              ) : (
                <PVSectionEditor
                  key={sectionIdx}
                  section={section}
                  sectionIdx={sectionIdx}
                  isFinalized={pv.isFinalized}
                  onUpdateSection={pv.updateSection}
                  onRemoveSection={pv.removeSection}
                  onAddDecision={pv.addDecision}
                  onUpdateDecision={pv.updateDecision}
                  onRemoveDecision={pv.removeDecision}
                  onAddAction={pv.addAction}
                  onUpdateAction={pv.updateAction}
                  onRemoveAction={pv.removeAction}
                />
              )
          )}

          {!pv.isFinalized && (
            <button
              onClick={pv.addSection}
              className="mb-6 inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#27272A] py-3 text-sm text-[#A1A1AA] hover:border-[#27272A] hover:text-[#FAFAFA]"
            >
              <Plus className="h-4 w-4" />
              {t("add_section")}
            </button>
          )}

          <PVSummaryEditor
            pvContent={pv.pvContent}
            setPvContent={pv.setPvContent}
            isFinalized={pv.isFinalized}
          />
        </div>

        <PVSidePanel
          meeting={pv.meeting}
          allActions={pv.allActions}
          selectedActions={pv.selectedActions}
          isFinalized={pv.isFinalized}
          onToggleAction={pv.toggleAction}
        />
      </div>

      {pv.showFinalizeDialog && (
        <PVConfirmDialog
          variant="finalize"
          loading={pv.finalizing}
          selectedActionsCount={pv.selectedActions.size}
          onConfirm={() =>
            pv.handleFinalize(t("finalized"), t("tasks_created_label"))
          }
          onCancel={() => pv.setShowFinalizeDialog(false)}
        />
      )}

      {pv.showRegenerateDialog && (
        <PVConfirmDialog
          variant="regenerate"
          loading={false}
          onConfirm={pv.handleRegenerate}
          onCancel={() => pv.setShowRegenerateDialog(false)}
        />
      )}

      {pv.showDeleteDialog && (
        <PVConfirmDialog
          variant="delete"
          loading={pv.deletingPv}
          onConfirm={() => pv.handleDeletePv(() => router.push("/pv-chantier"))}
          onCancel={() => pv.setShowDeleteDialog(false)}
        />
      )}

      {pv.showSendModal && (
        <PVSendModal
          participants={pv.pvContent.header?.participants ?? pv.meeting.participants ?? []}
          projectName={pv.meeting.projects?.name ?? ""}
          meetingId={id}
          meetingNumber={pv.meetingNumber}
          oppositionDeadlineDays={
            typeof pv.meeting.opposition_deadline_days === "number"
              ? pv.meeting.opposition_deadline_days
              : DEFAULT_OPPOSITION_DAYS
          }
          sending={pv.sending}
          onSend={pv.handleSend}
          onClose={() => pv.setShowSendModal(false)}
          onSent={() => {
            pv.setShowSendModal(false);
            pv.setSaveMessage(tf("send_success"));
            setTimeout(() => pv.setSaveMessage(null), 4000);
          }}
        />
      )}

      {pv.showTemplateModal && (
        <PVTemplateModal onClose={() => pv.setShowTemplateModal(false)} />
      )}
    </div>
  );
}
