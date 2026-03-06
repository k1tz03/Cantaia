"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { SubmissionsList } from "@/components/submissions/SubmissionsList";
const SubmissionEditor = dynamic(
  () => import("@/components/submissions/SubmissionEditor").then((m) => m.SubmissionEditor),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-64"><div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand" /></div> }
);
import type { SavedSubmission, ViewMode } from "@/components/submissions/types";
import {
  loadSubmissionsFromStorage,
  saveSubmissionsToStorage,
} from "@/components/submissions/types";

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function SubmissionsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [activeSubmission, setActiveSubmission] =
    useState<SavedSubmission | null>(null);
  const [submissions, setSubmissions] = useState<SavedSubmission[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  // Load history on mount
  useEffect(() => {
    setSubmissions(loadSubmissionsFromStorage());
    setIsLoadingList(false);
  }, []);

  function openSubmission(sub: SavedSubmission) {
    setActiveSubmission(sub);
    setViewMode("editor");
  }

  function handleNewExtraction(sub: SavedSubmission) {
    setActiveSubmission(sub);
    setViewMode("editor");
  }

  function backToList() {
    setViewMode("list");
    setActiveSubmission(null);
    // Refresh list
    setSubmissions(loadSubmissionsFromStorage());
  }

  function handleDeleteSubmission(id: string) {
    const updated = submissions.filter((s) => s.id !== id);
    saveSubmissionsToStorage(updated);
    setSubmissions(updated);
  }

  if (viewMode === "editor" && activeSubmission) {
    return (
      <SubmissionEditor
        initialSubmission={activeSubmission}
        onBack={backToList}
      />
    );
  }

  return (
    <SubmissionsList
      submissions={submissions}
      isLoading={isLoadingList}
      onOpen={openSubmission}
      onNewExtraction={handleNewExtraction}
      onDelete={handleDeleteSubmission}
    />
  );
}
