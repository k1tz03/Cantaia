"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  ArrowLeft,
  Mic,
  Loader2,
  Rocket,
  Save,
  FolderKanban,
  Camera,
  StickyNote,
  ChevronDown,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { AudioRecorder } from "@/components/visits/AudioRecorder";
import { PhotoCapture } from "@/components/visits/PhotoCapture";

type Step = "info" | "recording" | "post";

interface VisitForm {
  client_name: string;
  client_company: string;
  client_phone: string;
  client_email: string;
  client_address: string;
  client_city: string;
  client_postal_code: string;
  project_id: string;
  notes: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

export default function NewVisitPage() {
  const t = useTranslations("visits");
  const router = useRouter();
  const [step, setStep] = useState<Step>("info");
  const [form, setForm] = useState<VisitForm>({
    client_name: "",
    client_company: "",
    client_phone: "",
    client_email: "",
    client_address: "",
    client_city: "",
    client_postal_code: "",
    project_id: "",
    notes: "",
  });
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [saving, setSaving] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [photosCount, setPhotosCount] = useState(0);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [sitePhotosExpanded, setSitePhotosExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      // Use API route (admin client) to bypass RLS recursion on users table
      const profileRes = await fetch("/api/user/profile");
      const profileData = await profileRes.json();
      const userOrgId = profileData?.profile?.organization_id;
      if (!userOrgId) return;

      setOrgId(userOrgId);
      const supabase = createClient();
      const { data } = await (supabase.from("projects") as any)
        .select("id, name")
        .eq("organization_id", userOrgId)
        .order("name");
      setProjects(data || []);
    } catch {
      // ignore
    }
  }

  function update(partial: Partial<VisitForm>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  async function createVisitRecord(): Promise<string> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Non authentifié");
    if (!orgId) throw new Error("Organisation non trouvée. Veuillez vous reconnecter.");

    const { data, error } = await ((supabase as any).from("client_visits"))
      .insert({
        organization_id: orgId,
        client_name: form.client_name || "Client",
        client_company: form.client_company || null,
        client_phone: form.client_phone || null,
        client_email: form.client_email || null,
        client_address: form.client_address || null,
        client_city: form.client_city || null,
        client_postal_code: form.client_postal_code || null,
        project_id: form.project_id || null,
        is_prospect: !form.project_id,
        status: "recording",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) throw error;
    return data.id;
  }

  async function handleStartRecording() {
    setSaving(true);
    setError(null);
    try {
      const id = await createVisitRecord();
      setVisitId(id);
      setStep("recording");
    } catch (err: unknown) {
      console.error("Failed to create visit:", err);
      setError(err instanceof Error ? err.message : "Impossible de créer la visite. Vérifiez votre connexion.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSkipToRecording() {
    // Create with minimal info
    if (!form.client_name) update({ client_name: "Client" });
    setSaving(true);
    setError(null);
    try {
      const id = await createVisitRecord();
      setVisitId(id);
      setStep("recording");
    } catch (err: unknown) {
      console.error("Failed to create visit:", err);
      setError(err instanceof Error ? err.message : "Impossible de créer la visite. Vérifiez votre connexion.");
    } finally {
      setSaving(false);
    }
  }

  function handleRecordingComplete(blob: Blob, duration: number) {
    setAudioBlob(blob);
    setAudioDuration(duration);
    setStep("post");
  }

  async function handleUploadAndTranscribe() {
    if (!visitId || !audioBlob) return;
    setTranscribing(true);

    try {
      const supabase = createClient();

      // Upload audio to Supabase Storage
      const filePath = `audio/${orgId}/${visitId}/recording.webm`;
      const { error: uploadErr } = await supabase.storage
        .from("audio")
        .upload(filePath, audioBlob, { contentType: "audio/webm" });

      if (uploadErr) {
        console.error("Upload error:", uploadErr);
      }

      // Update visit with audio info
      await ((supabase as any).from("client_visits"))
        .update({
          audio_url: filePath,
          audio_duration_seconds: audioDuration,
          audio_file_name: "recording.webm",
          audio_file_size: audioBlob.size,
          duration_minutes: Math.ceil(audioDuration / 60),
        })
        .eq("id", visitId);

      // Trigger transcription
      await fetch("/api/visits/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visit_id: visitId }),
      });

      // Trigger report generation
      await fetch("/api/visits/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visit_id: visitId }),
      });

      // Navigate to visit detail
      router.push(`/visits/${visitId}`);
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setTranscribing(false);
    }
  }

  async function handleSaveWithoutTranscribing() {
    if (!visitId || !audioBlob) return;
    setSaving(true);

    try {
      const supabase = createClient();

      const filePath = `audio/${orgId}/${visitId}/recording.webm`;
      await supabase.storage
        .from("audio")
        .upload(filePath, audioBlob, { contentType: "audio/webm" });

      await ((supabase as any).from("client_visits"))
        .update({
          audio_url: filePath,
          audio_duration_seconds: audioDuration,
          audio_file_name: "recording.webm",
          audio_file_size: audioBlob.size,
          duration_minutes: Math.ceil(audioDuration / 60),
          status: "recording",
        })
        .eq("id", visitId);

      router.push("/visits");
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setSaving(false);
    }
  }

  // ──── Step 1: Pre-visit info ────
  if (step === "info") {
    return (
      <div className="p-6">
        <Link href="/visits" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {t("title")}
        </Link>

        <h1 className="mb-6 text-xl font-bold text-foreground">{t("newVisit")}</h1>

        <div className="mx-auto max-w-2xl space-y-6">
          {/* Client info */}
          <div className="rounded-lg border border-border bg-background p-6">
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              {t("prospect")} / {t("existingClient")}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">{t("clientName")} *</label>
                <input
                  value={form.client_name}
                  onChange={(e) => update({ client_name: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">{t("clientCompany")}</label>
                <input
                  value={form.client_company}
                  onChange={(e) => update({ client_company: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">{t("clientPhone")}</label>
                <input
                  type="tel"
                  value={form.client_phone}
                  onChange={(e) => update({ client_phone: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="+41 79 ..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">{t("clientEmail")}</label>
                <input
                  type="email"
                  value={form.client_email}
                  onChange={(e) => update({ client_email: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="rounded-lg border border-border bg-background p-6">
            <h3 className="mb-4 text-sm font-semibold text-foreground">{t("visitAddress")}</h3>
            <div className="space-y-3">
              <input
                value={form.client_address}
                onChange={(e) => update({ client_address: e.target.value })}
                placeholder={t("visitAddress")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={form.client_city}
                  onChange={(e) => update({ client_city: e.target.value })}
                  placeholder={t("visitCity")}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  value={form.client_postal_code}
                  onChange={(e) => update({ client_postal_code: e.target.value })}
                  placeholder={t("visitPostalCode")}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Linked project */}
          <div className="rounded-lg border border-border bg-background p-6">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
              {t("linkedProject")}
            </h3>
            <select
              value={form.project_id}
              onChange={(e) => update({ project_id: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">{t("noProjectProspect")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Pre-visit notes */}
          <div className="rounded-lg border border-border bg-background p-6">
            <h3 className="mb-4 text-sm font-semibold text-foreground">{t("preVisitNotes")}</h3>
            <textarea
              value={form.notes}
              onChange={(e) => update({ notes: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-500/10 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleSkipToRecording}
              disabled={saving}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {t("skipToRecording")}
            </button>
            <button
              type="button"
              onClick={handleStartRecording}
              disabled={!form.client_name || saving}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              {t("saveAndRecord")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──── Step 2: Recording ────
  if (step === "recording") {
    return (
      <div className="p-6">
        <h1 className="mb-6 flex items-center gap-2 text-xl font-bold text-foreground">
          <Mic className="h-5 w-5 text-red-500" />
          {t("clientVisit")} — {form.client_name || "Client"}
        </h1>
        <div className="mx-auto max-w-lg space-y-6">
          <AudioRecorder onRecordingComplete={handleRecordingComplete} />

          {/* Photos section */}
          {visitId && orgId && (
            <div className="rounded-lg border border-border bg-background">
              <div className="border-b border-border px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  {t("photos.title")}
                  {photosCount > 0 && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {photosCount}
                    </span>
                  )}
                </h3>
              </div>

              {/* Handwritten notes */}
              <div className="border-b border-border">
                <button
                  type="button"
                  onClick={() => setNotesExpanded(!notesExpanded)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-purple-500" />
                    {t("photos.handwrittenNotes")}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${notesExpanded ? "rotate-180" : ""}`} />
                </button>
                {notesExpanded && (
                  <div className="px-4 pb-4">
                    <p className="mb-3 text-xs text-muted-foreground">{t("photos.handwrittenNotesDesc")}</p>
                    <PhotoCapture
                      visitId={visitId}
                      orgId={orgId}
                      photoType="handwritten_notes"
                      onPhotosUploaded={() => setPhotosCount((c) => c + 1)}
                    />
                  </div>
                )}
              </div>

              {/* Site photos */}
              <div>
                <button
                  type="button"
                  onClick={() => setSitePhotosExpanded(!sitePhotosExpanded)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-blue-500" />
                    {t("photos.sitePhotos")}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${sitePhotosExpanded ? "rotate-180" : ""}`} />
                </button>
                {sitePhotosExpanded && (
                  <div className="px-4 pb-4">
                    <PhotoCapture
                      visitId={visitId}
                      orgId={orgId}
                      photoType="site"
                      onPhotosUploaded={() => setPhotosCount((c) => c + 1)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ──── Step 3: Post-recording ────
  return (
    <div className="p-6">
      <h1 className="mb-6 text-xl font-bold text-foreground">
        {t("recordingFinished")} — {Math.floor(audioDuration / 60)} min {audioDuration % 60} sec
        {photosCount > 0 && (
          <span className="ml-2 text-base font-normal text-muted-foreground">
            + {photosCount} {t("photos.title").toLowerCase()}
          </span>
        )}
      </h1>

      <div className="mx-auto max-w-lg">
        <div className="rounded-lg border border-border bg-background p-6 text-center">
          <p className="mb-2 text-sm font-medium text-foreground">
            {t("transcribeAndGenerate")} ?
          </p>
          <p className="mb-6 text-xs text-muted-foreground">
            {t("transcriptionWarning")}
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleUploadAndTranscribe}
              disabled={transcribing}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {transcribing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("transcribing")}
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  {t("transcribeAndGenerate")}
                </>
              )}
            </button>
            <button
              onClick={handleSaveWithoutTranscribing}
              disabled={saving}
              className="flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-3 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("saveWithoutTranscribing")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
