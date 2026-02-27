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

    // Get the meeting
    const { data: meeting } = await admin
      .from("meetings")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!meeting || !meeting.pv_content) {
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

    console.log(`[Finalize] Meeting ${id}: ${allActions.length} total actions found`);

    // Create tasks for selected actions
    const selectedIndices = new Set(body.selected_action_indices || []);
    let tasksCreated = 0;
    const errors: string[] = [];
    const insertErrors: any[] = [];

    for (let i = 0; i < allActions.length; i++) {
      if (!selectedIndices.has(i)) continue;

      const action = allActions[i];

      // Parse deadline (Swiss format DD.MM.YYYY → YYYY-MM-DD)
      let dueDate: string | null = null;
      if (action.deadline) {
        const dateMatch = action.deadline.match(
          /(\d{2})\.(\d{2})\.(\d{4})/
        );
        if (dateMatch) {
          dueDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
        }
      }

      const taskData = {
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

      console.log(`[Finalize] Inserting task ${i}: ${taskData.title} (status=${taskData.status}, source=${taskData.source})`);

      const { data: insertedTask, error: insertError } = await admin
        .from("tasks")
        .insert(taskData as any)
        .select()
        .single();

      if (insertError) {
        console.error(`[Finalize] INSERT ERROR for task ${i}:`, JSON.stringify(insertError));
        errors.push(action.description);
        insertErrors.push({
          index: i,
          title: action.description,
          error: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
        });
      } else {
        console.log(`[Finalize] Task ${i} created: ${insertedTask?.id}`);
        tasksCreated++;
      }
    }

    // Update meeting status to finalized
    await admin
      .from("meetings")
      .update({ status: "finalized" } as any)
      .eq("id", id);

    console.log(`[Finalize] Done: ${tasksCreated} tasks created, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      tasks_created: tasksCreated,
      errors: errors.length > 0 ? errors : undefined,
      insert_errors: insertErrors.length > 0 ? insertErrors : undefined,
    });
  } catch (error) {
    console.error("[Finalize] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
