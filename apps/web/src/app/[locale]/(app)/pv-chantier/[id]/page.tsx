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
import type { PVSection } from "@/components/pv-chantier/types";

export default function PVDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("pv");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const pv = usePVContent(id);

  if (pv.loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pv.meeting || !pv.pvContent) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <FileText className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("no_pv_found")}</p>
        <button
          onClick={() => router.push("/pv-chantier")}
          className="text-sm text-primary hover:text-primary"
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
        saving={pv.saving}
        saveMessage={pv.saveMessage}
        regenerating={pv.regenerating}
        onBack={() => router.push("/pv-chantier")}
        onSave={() => pv.handleSave(t("saved"))}
        onFinalize={() => pv.setShowFinalizeDialog(true)}
        onExportPDF={() => pv.handleExportPDF(t("saved"))}
        onRegenerate={() => pv.setShowRegenerateDialog(true)}
        onDelete={() => pv.setShowDeleteDialog(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 lg:w-[65%]">
          <PVHeaderEditor
            pvContent={pv.pvContent}
            setPvContent={pv.setPvContent}
            isFinalized={pv.isFinalized}
          />

          {(pv.pvContent.sections || []).map(
            (section: PVSection, sectionIdx: number) => (
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
              className="mb-6 inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-sm text-muted-foreground hover:border-border hover:text-foreground"
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
    </div>
  );
}
