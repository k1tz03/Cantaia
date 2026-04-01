import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import archiver from "archiver";
import { PassThrough } from "stream";

export const maxDuration = 300; // 5 min — archive can be large

// ── Helpers ──

function escapeCSV(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(values: (string | number | null | undefined)[]): string {
  return values.map(escapeCSV).join(";");
}

function csvFile(headers: string[], rows: string[]): string {
  return "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");
}

function sanitizePath(name: string): string {
  return name.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ._\- ]/g, "_").substring(0, 100);
}

function formatDate(d: string | null): string {
  if (!d) return "";
  try {
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
  } catch {
    return d;
  }
}

function formatCHF(amount: number | null): string {
  if (amount == null) return "";
  return new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

// ── Try to download a file from Supabase Storage ──

async function tryDownloadFile(
  admin: ReturnType<typeof createAdminClient>,
  url: string
): Promise<{ data: Buffer; name: string } | null> {
  try {
    // URL could be a full public URL or a storage path
    // Try to extract bucket/path from URL
    const storageMatch = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
    if (storageMatch) {
      const [, bucket, path] = storageMatch;
      const { data, error } = await admin.storage.from(bucket).download(path);
      if (error || !data) return null;
      const buffer = Buffer.from(await data.arrayBuffer());
      const name = path.split("/").pop() || "file";
      return { data: buffer, name };
    }

    // If it's a direct URL, try fetch
    if (url.startsWith("http")) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      const name = url.split("/").pop()?.split("?")[0] || "file";
      return { data: buffer, name };
    }

    // It's a raw storage path — try common buckets
    for (const bucket of ["audio", "plans", "submissions"]) {
      const { data, error } = await admin.storage.from(bucket).download(url);
      if (!error && data) {
        const buffer = Buffer.from(await data.arrayBuffer());
        const name = url.split("/").pop() || "file";
        return { data: buffer, name };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ── Main route ──

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify project belongs to user's org
    const { data: profileRaw } = await (supabase as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    const profile = profileRaw as { organization_id: string } | null;
    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: projectRaw } = await (supabase as any)
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();
    const project = projectRaw as Record<string, any> | null;
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (project.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const projectName = sanitizePath(project.name || "Projet");
    const today = new Date().toISOString().split("T")[0];
    const archivePrefix = `Archive_${projectName}_${today}`;

    // ── Collect all data in parallel ──
    console.log(`[Archive] Starting archive for project ${projectId}`);

    // Use admin client for all queries (bypass type limitations on untyped tables)
    const db = admin as any;

    const [
      tasksRes,
      emailsRes,
      meetingsRes,
      submissionsRes,
      plansRes,
      visitsRes,
      receptionRes,
      closureDocsRes,
      siteReportsRes,
    ] = await Promise.all([
      // Tasks
      db
        .from("tasks")
        .select("id, title, description, status, priority, due_date, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),

      // Emails
      db
        .from("email_records")
        .select("id, subject, sender_name, sender_email, received_at, classification, ai_summary, has_attachments")
        .eq("project_id", projectId)
        .order("received_at", { ascending: true }),

      // Meetings (PV)
      db
        .from("meetings")
        .select("id, title, meeting_number, meeting_date, location, status, pv_content")
        .eq("project_id", projectId)
        .order("meeting_date", { ascending: true }),

      // Submissions with lots and items
      db
        .from("submissions")
        .select("id, title, reference, status, deadline, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),

      // Plans
      db
        .from("plan_registry")
        .select("id, plan_number, plan_title, plan_type, discipline, scale, format, author_company, status, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),

      // Visits
      db
        .from("client_visits")
        .select("id, client_name, visit_date, duration_minutes, report_pdf_url, created_at")
        .eq("project_id", projectId)
        .order("visit_date", { ascending: true }),

      // Reception
      db
        .from("project_receptions")
        .select("id, reception_type, reception_date, status, pv_document_url, pv_signed_url, guarantee_2y_end, guarantee_5y_end, participants, general_notes")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Closure documents
      db
        .from("closure_documents")
        .select("id, document_type, document_url, created_at")
        .eq("project_id", projectId),

      // Site reports
      db
        .from("site_reports")
        .select("id, report_date, submitted_by_name, status, weather, remarks, created_at")
        .eq("project_id", projectId)
        .order("report_date", { ascending: true }),
    ]);

    const tasks = tasksRes.data || [];
    const emails = emailsRes.data || [];
    const meetings = meetingsRes.data || [];
    const submissions = submissionsRes.data || [];
    const plans = plansRes.data || [];
    const visits = visitsRes.data || [];
    const reception = receptionRes.data || null;
    const closureDocs = closureDocsRes.data || [];
    const siteReports = siteReportsRes.data || [];

    console.log(`[Archive] Data collected: ${tasks.length} tasks, ${emails.length} emails, ${meetings.length} meetings, ${submissions.length} submissions, ${plans.length} plans, ${visits.length} visits, ${siteReports.length} reports`);

    // ── Build ZIP ──
    const archive = archiver("zip", { zlib: { level: 5 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    // Collect all chunks into a buffer
    const chunks: Buffer[] = [];
    passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));

    // ── 00 — Résumé Projet ──
    const projectSummary = [
      `ARCHIVE DE CHANTIER — ${project.name}`,
      `${"=".repeat(60)}`,
      ``,
      `Projet : ${project.name}`,
      `Code : ${(project as any).code || "—"}`,
      `Client : ${(project as any).client_name || "—"}`,
      `Adresse : ${(project as any).address || "—"}, ${(project as any).city || "—"}`,
      `Statut : ${project.status}`,
      `Date début : ${formatDate((project as any).start_date)}`,
      `Date fin : ${formatDate((project as any).end_date)}`,
      `Budget total : ${formatCHF((project as any).budget_total)} CHF`,
      `Montant facturé : ${formatCHF((project as any).invoiced_amount)} CHF`,
      `Coûts d'achat : ${formatCHF((project as any).purchase_costs)} CHF`,
      ``,
      `${"─".repeat(60)}`,
      `STATISTIQUES`,
      `${"─".repeat(60)}`,
      `Tâches : ${tasks.length} (${tasks.filter((t: any) => t.status === "done").length} terminées)`,
      `Emails : ${emails.length}`,
      `Séances / PV : ${meetings.length}`,
      `Soumissions : ${submissions.length}`,
      `Plans : ${plans.length}`,
      `Visites : ${visits.length}`,
      `Rapports chantier : ${siteReports.length}`,
      ``,
      `Archive générée le ${formatDate(new Date().toISOString())} par Cantaia`,
    ].join("\r\n");

    archive.append(projectSummary, { name: `${archivePrefix}/00_Resume_Projet.txt` });

    // ── 01 — Emails ──
    if (emails.length > 0) {
      const emailCSV = csvFile(
        ["Date", "Expéditeur", "Email", "Objet", "Classification", "Résumé IA", "Pièces jointes"],
        emails.map((e: any) =>
          csvRow([
            formatDate(e.received_at),
            e.sender_name,
            e.sender_email,
            e.subject,
            e.classification,
            e.ai_summary,
            e.has_attachments ? "Oui" : "Non",
          ])
        )
      );
      archive.append(emailCSV, { name: `${archivePrefix}/01_Emails/emails_registre.csv` });
    }

    // ── 02 — Plans ──
    if (plans.length > 0) {
      const plansCSV = csvFile(
        ["N° Plan", "Titre", "Type", "Discipline", "Échelle", "Format", "Bureau", "Statut", "Date"],
        plans.map((p: any) =>
          csvRow([
            p.plan_number,
            p.plan_title,
            p.plan_type,
            p.discipline,
            p.scale,
            p.format,
            p.author_company,
            p.status,
            formatDate(p.created_at),
          ])
        )
      );
      archive.append(plansCSV, { name: `${archivePrefix}/02_Plans/plans_registre.csv` });

      // Try to download plan files
      const planVersions = await db
        .from("plan_versions")
        .select("plan_id, version_code, file_url, file_name")
        .in("plan_id", plans.map((p: any) => p.id));

      if (planVersions.data) {
        for (const pv of planVersions.data as any[]) {
          if (pv.file_url) {
            const file = await tryDownloadFile(admin, pv.file_url);
            if (file) {
              const planRef = plans.find((p: any) => p.id === pv.plan_id);
              const prefix = planRef ? sanitizePath(planRef.plan_number || planRef.plan_title || pv.plan_id) : pv.plan_id;
              archive.append(file.data, {
                name: `${archivePrefix}/02_Plans/${prefix}_${sanitizePath(file.name)}`,
              });
            }
          }
        }
      }
    }

    // ── 03 — Soumissions ──
    if (submissions.length > 0) {
      const subCSV = csvFile(
        ["Titre", "Référence", "Statut", "Délai", "Date création"],
        submissions.map((s: any) =>
          csvRow([s.title, s.reference, s.status, formatDate(s.deadline), formatDate(s.created_at)])
        )
      );
      archive.append(subCSV, { name: `${archivePrefix}/03_Soumissions/soumissions_registre.csv` });

      // For each submission, export items
      for (const sub of submissions) {
        const { data: lots } = await db
          .from("submission_lots")
          .select("id, title, cfc_code, material_group")
          .eq("submission_id", sub.id);

        if (lots && lots.length > 0) {
          const lotIds = lots.map((l: any) => l.id);
          const { data: chapters } = await db
            .from("submission_chapters")
            .select("id, title, lot_id")
            .in("lot_id", lotIds);

          const chapterIds = (chapters || []).map((c: any) => c.id);
          const { data: items } = chapterIds.length > 0
            ? await db
                .from("submission_items")
                .select("id, position_number, description, quantity, unit, unit_price, total_price, chapter_id")
                .in("chapter_id", chapterIds)
            : { data: [] };

          if (items && items.length > 0) {
            const itemsCSV = csvFile(
              ["N° Position", "Lot", "Chapitre", "Description", "Quantité", "Unité", "Prix unitaire", "Total"],
              (items as any[]).map((item: any) => {
                const chapter = (chapters || []).find((c: any) => c.id === item.chapter_id);
                const lot = chapter ? (lots || []).find((l: any) => l.id === chapter.lot_id) : null;
                return csvRow([
                  item.position_number,
                  lot?.title || lot?.cfc_code,
                  chapter?.title,
                  item.description,
                  item.quantity,
                  item.unit,
                  item.unit_price,
                  item.total_price,
                ]);
              })
            );
            const subName = sanitizePath((sub as any).title || sub.id);
            archive.append(itemsCSV, {
              name: `${archivePrefix}/03_Soumissions/${subName}_postes.csv`,
            });
          }
        }

        // Supplier offers / price comparisons
        const { data: priceRequests } = await db
          .from("price_requests")
          .select("id, supplier_id, status, sent_at, responded_at")
          .eq("submission_id", sub.id);

        if (priceRequests && priceRequests.length > 0) {
          // Get supplier names
          const supplierIds = [...new Set((priceRequests as any[]).map((pr: any) => pr.supplier_id).filter(Boolean))];
          const { data: suppliers } = supplierIds.length > 0
            ? await db.from("suppliers").select("id, company_name").in("id", supplierIds)
            : { data: [] };

          const supplierMap = new Map((suppliers || []).map((s: any) => [s.id, s.company_name]));

          const prCSV = csvFile(
            ["Fournisseur", "Statut", "Date envoi", "Date réponse"],
            (priceRequests as any[]).map((pr: any) =>
              csvRow([
                supplierMap.get(pr.supplier_id) || pr.supplier_id,
                pr.status,
                formatDate(pr.sent_at),
                formatDate(pr.responded_at),
              ])
            )
          );
          const subName = sanitizePath((sub as any).title || sub.id);
          archive.append(prCSV, {
            name: `${archivePrefix}/03_Soumissions/${subName}_demandes_prix.csv`,
          });
        }
      }
    }

    // ── 04 — PV de Séances ──
    if (meetings.length > 0) {
      const pvCSV = csvFile(
        ["N° Séance", "Titre", "Date", "Lieu", "Statut"],
        meetings.map((m: any) =>
          csvRow([m.meeting_number, m.title, formatDate(m.meeting_date), m.location, m.status])
        )
      );
      archive.append(pvCSV, { name: `${archivePrefix}/04_PV_Seances/seances_registre.csv` });

      // Export PV content as text for each meeting
      for (const meeting of meetings as any[]) {
        if (meeting.pv_content) {
          let pvText = `PV DE SÉANCE N°${meeting.meeting_number || "?"}\n`;
          pvText += `${"=".repeat(40)}\n`;
          pvText += `Titre : ${meeting.title || "—"}\n`;
          pvText += `Date : ${formatDate(meeting.meeting_date)}\n`;
          pvText += `Lieu : ${meeting.location || "—"}\n\n`;

          const content = typeof meeting.pv_content === "string"
            ? JSON.parse(meeting.pv_content)
            : meeting.pv_content;

          if (content.sections) {
            for (const section of content.sections) {
              pvText += `\n## ${section.title || "Section"}\n`;
              if (section.items) {
                for (const item of section.items) {
                  pvText += `  - ${item.text || item.description || JSON.stringify(item)}\n`;
                  if (item.responsible) pvText += `    Responsable: ${item.responsible}\n`;
                  if (item.deadline) pvText += `    Délai: ${item.deadline}\n`;
                }
              }
            }
          } else {
            pvText += JSON.stringify(content, null, 2);
          }

          const meetName = `PV_${String(meeting.meeting_number || "0").padStart(3, "0")}`;
          archive.append(pvText, { name: `${archivePrefix}/04_PV_Seances/${meetName}.txt` });
        }
      }
    }

    // ── 05 — Visites ──
    if (visits.length > 0) {
      const visitCSV = csvFile(
        ["Client", "Date visite", "Durée (min)", "Date création"],
        (visits as any[]).map((v: any) =>
          csvRow([v.client_name, formatDate(v.visit_date), v.duration_minutes, formatDate(v.created_at)])
        )
      );
      archive.append(visitCSV, { name: `${archivePrefix}/05_Visites/visites_registre.csv` });

      // Download visit report PDFs
      for (const visit of visits as any[]) {
        if (visit.report_pdf_url) {
          const file = await tryDownloadFile(admin, visit.report_pdf_url);
          if (file) {
            const visitName = `Visite_${formatDate(visit.visit_date).replace(/\./g, "-")}_${sanitizePath(visit.client_name || "")}`;
            archive.append(file.data, { name: `${archivePrefix}/05_Visites/${visitName}.pdf` });
          }
        }
      }
    }

    // ── 06 — Rapports Chantier ──
    if (siteReports.length > 0) {
      const reportsCSV = csvFile(
        ["Date", "Soumis par", "Statut", "Météo", "Remarques"],
        (siteReports as any[]).map((r: any) =>
          csvRow([formatDate(r.report_date), r.submitted_by_name, r.status, r.weather, r.remarks])
        )
      );
      archive.append(reportsCSV, { name: `${archivePrefix}/06_Rapports_Chantier/rapports_registre.csv` });
    }

    // ── 07 — Tâches ──
    if (tasks.length > 0) {
      const tasksCSV = csvFile(
        ["Titre", "Description", "Statut", "Priorité", "Échéance", "Date création"],
        tasks.map((t: any) =>
          csvRow([t.title, t.description, t.status, t.priority, formatDate(t.due_date), formatDate(t.created_at)])
        )
      );
      archive.append(tasksCSV, { name: `${archivePrefix}/07_Taches/taches_registre.csv` });
    }

    // ── 08 — Clôture ──
    if (reception) {
      // PV de réception (DOCX)
      if (reception.pv_document_url) {
        const file = await tryDownloadFile(admin, reception.pv_document_url);
        if (file) {
          archive.append(file.data, { name: `${archivePrefix}/08_Cloture/PV_Reception.${file.name.split(".").pop() || "docx"}` });
        }
      }

      // PV signé
      if (reception.pv_signed_url) {
        const file = await tryDownloadFile(admin, reception.pv_signed_url);
        if (file) {
          archive.append(file.data, { name: `${archivePrefix}/08_Cloture/PV_Reception_Signe.${file.name.split(".").pop() || "pdf"}` });
        }
      }

      // Reception summary
      const recSummary = [
        `PV DE RÉCEPTION`,
        `${"=".repeat(40)}`,
        `Type : ${reception.reception_type}`,
        `Date : ${formatDate(reception.reception_date)}`,
        `Statut : ${reception.status}`,
        `Garantie 2 ans : ${formatDate(reception.guarantee_2y_end)}`,
        `Garantie 5 ans : ${formatDate(reception.guarantee_5y_end)}`,
        ``,
        `Notes : ${reception.general_notes || "—"}`,
        ``,
        `Participants :`,
        ...(Array.isArray(reception.participants)
          ? reception.participants.map(
              (p: any) => `  - ${p.name} (${p.role}, ${p.company}) ${p.present ? "✓ Présent" : "✗ Absent"}`
            )
          : ["  Aucun"]),
      ].join("\r\n");
      archive.append(recSummary, { name: `${archivePrefix}/08_Cloture/resume_reception.txt` });
    }

    // Additional closure documents
    if (closureDocs.length > 0) {
      for (const doc of closureDocs as any[]) {
        if (doc.document_url) {
          const file = await tryDownloadFile(admin, doc.document_url);
          if (file) {
            const docName = sanitizePath(`${doc.document_type || "document"}_${file.name}`);
            archive.append(file.data, { name: `${archivePrefix}/08_Cloture/${docName}` });
          }
        }
      }
    }

    // ── 09 — Fournisseurs ──
    // Get suppliers linked to this project via submissions
    if (submissions.length > 0) {
      const submissionIds = submissions.map((s: any) => s.id);
      const { data: offers } = await db
        .from("supplier_offers")
        .select("id, supplier_id, status, total_amount, submitted_at")
        .in("submission_id", submissionIds);

      if (offers && offers.length > 0) {
        const supplierIds = [...new Set((offers as any[]).map((o: any) => o.supplier_id).filter(Boolean))];
        const { data: suppliers } = supplierIds.length > 0
          ? await db.from("suppliers").select("id, company_name, contact_name, email, phone").in("id", supplierIds)
          : { data: [] };

        if (suppliers && suppliers.length > 0) {
          const suppCSV = csvFile(
            ["Entreprise", "Contact", "Email", "Téléphone"],
            suppliers.map((s: any) => csvRow([s.company_name, s.contact_name, s.email, s.phone]))
          );
          archive.append(suppCSV, { name: `${archivePrefix}/09_Fournisseurs/fournisseurs_projet.csv` });
        }

        // Offers summary
        const supplierMap = new Map((suppliers || []).map((s: any) => [s.id, s.company_name]));
        const offersCSV = csvFile(
          ["Fournisseur", "Statut", "Montant total", "Date soumission"],
          (offers as any[]).map((o: any) =>
            csvRow([supplierMap.get(o.supplier_id) || o.supplier_id, o.status, formatCHF(o.total_amount), formatDate(o.submitted_at)])
          )
        );
        archive.append(offersCSV, { name: `${archivePrefix}/09_Fournisseurs/offres_recues.csv` });
      }
    }

    // ── Finalize ZIP ──
    await archive.finalize();

    // Wait for all data to be collected
    await new Promise<void>((resolve, reject) => {
      passthrough.on("end", resolve);
      passthrough.on("error", reject);
    });

    const zipBuffer = Buffer.concat(chunks);

    console.log(`[Archive] ZIP created: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    const fileName = `${archivePrefix}.zip`;

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(zipBuffer.length),
      },
    });
  } catch (error) {
    console.error("[Archive] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Archive generation failed" },
      { status: 500 }
    );
  }
}
