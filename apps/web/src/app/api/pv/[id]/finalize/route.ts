import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json(
        { error: parseError || "Invalid request" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Get user's organization
    const { data: userProfile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "User organization not found" }, { status: 403 });
    }

    // Get the meeting with project org check
    const { data: meeting } = await admin
      .from("meetings")
      .select("id, pv_content, project_id, meeting_number, projects!inner(organization_id)")
      .eq("id", id)
      .maybeSingle();

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting or PV not found" },
        { status: 404 }
      );
    }

    // Verify meeting belongs to user's organization
    const meetingOrg = (meeting.projects as any)?.organization_id;
    if (meetingOrg !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!meeting.pv_content) {
      return NextResponse.json(
        { error: "Meeting or PV not found" },
        { status: 404 }
      );
    }

    const pvContent = meeting.pv_content as any;

    // Extract all actions in order
    const allActions: Array<{
      description: string;
      responsible_name: string;
      responsible_company: string;
      deadline: string | null;
      priority: string;
      sectionTitle: string;
      sectionNumber: string;
    }> = [];

    for (const section of pvContent.sections || []) {
      for (const action of section.actions || []) {
        allActions.push({
          ...action,
          sectionTitle: section.title,
          sectionNumber: section.number,
        });
      }
    }

    if (process.env.NODE_ENV === "development") console.log(`[Finalize] Meeting ${id}: ${allActions.length} total actions found`);

    // Build the task rows for the selected actions
    const selectedIndices = new Set(body.selected_action_indices || []);
    const errors: string[] = [];
    const insertErrors: any[] = [];

    const taskRows = allActions
      .map((action, i) => ({ action, i }))
      .filter(({ i }) => selectedIndices.has(i))
      .map(({ action }) => {
        // Parse deadline (Swiss format DD.MM.YYYY → YYYY-MM-DD)
        let dueDate: string | null = null;
        if (action.deadline) {
          const dateMatch = action.deadline.match(/(\d{2})\.(\d{2})\.(\d{4})/);
          if (dateMatch) {
            dueDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
          }
        }

        return {
          project_id: meeting.project_id,
          created_by: user.id,
          title: action.description,
          description: `Source : PV Séance #${meeting.meeting_number} — ${action.sectionNumber}. ${action.sectionTitle}`,
          status: "todo",
          priority: action.priority === "urgent" ? "urgent" : "medium",
          source: "meeting",
          source_id: meeting.id,
          source_reference: `PV #${meeting.meeting_number}, §${action.sectionNumber}`,
          assigned_to_name: action.responsible_name || null,
          assigned_to_company: action.responsible_company || null,
          due_date: dueDate,
        };
      });

    // Single batch insert — all-or-nothing, so the meeting is never marked
    // "finalized" while only part of its actions became tasks.
    let tasksCreated = 0;
    if (taskRows.length > 0) {
      if (process.env.NODE_ENV === "development") console.log(`[Finalize] Batch inserting ${taskRows.length} tasks`);

      const { data: insertedTasks, error: insertError } = await admin
        .from("tasks")
        .insert(taskRows as any)
        .select("id");

      if (insertError) {
        console.error("[Finalize] BATCH INSERT ERROR:", JSON.stringify(insertError));
        errors.push(...taskRows.map((r) => r.title));
        insertErrors.push({
          error: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
        });

        // Do NOT finalize: nothing was created
        return NextResponse.json(
          {
            success: false,
            error: "Échec de la création des tâches — le PV n'a pas été finalisé.",
            tasks_created: 0,
            errors,
            insert_errors: insertErrors,
          },
          { status: 500 }
        );
      }

      tasksCreated = insertedTasks?.length ?? taskRows.length;
    }

    // Update meeting status to finalized (only once the tasks are persisted)
    const { error: statusError } = await admin
      .from("meetings")
      .update({ status: "finalized" } as any)
      .eq("id", id);

    if (statusError) {
      console.error("[Finalize] Failed to set meeting status:", statusError);
      return NextResponse.json(
        {
          success: false,
          error: "Les tâches ont été créées mais le PV n'a pas pu être finalisé.",
          tasks_created: tasksCreated,
        },
        { status: 500 }
      );
    }

    if (process.env.NODE_ENV === "development") console.log(`[Finalize] Done: ${tasksCreated} tasks created`);

    return NextResponse.json({
      success: true,
      tasks_created: tasksCreated,
    });
  } catch (error) {
    console.error("[Finalize] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
