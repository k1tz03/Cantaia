import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/debug/tasks
 * Temporary diagnostic route to inspect tasks table state and schema.
 * DELETE THIS FILE after resolving the issue.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const results: Record<string, unknown> = {};

    // 1. Get ALL tasks (admin, no RLS)
    const { data: allTasks, error: allError } = await admin
      .from("tasks")
      .select("*")
      .limit(50);

    results.all_tasks_count = allTasks?.length ?? 0;
    results.all_tasks_error = allError?.message ?? null;

    // 2. Get tasks with source = 'meeting_pv' (pre-migration-006) or 'meeting' (post)
    const { data: meetingTasks, error: meetingError } = await (admin
      .from("tasks") as any)
      .select("*")
      .in("source", ["meeting", "meeting_pv"])
      .limit(20);

    results.meeting_tasks_count = meetingTasks?.length ?? 0;
    results.meeting_tasks_error = meetingError?.message ?? null;
    results.meeting_tasks = meetingTasks?.map((t: any) => ({
      id: t.id,
      project_id: t.project_id,
      title: t.title,
      status: t.status,
      source: t.source,
      source_id: t.source_id,
      source_reference: t.source_reference,
      created_at: t.created_at,
    }));

    // 3. Get a sample task to see what columns exist
    const { data: sampleTask } = await admin
      .from("tasks")
      .select("*")
      .limit(1)
      .maybeSingle();
    results.sample_task_columns = sampleTask ? Object.keys(sampleTask) : "no tasks in DB";

    // 4. Test a minimal INSERT + DELETE — use pre-migration-006 enum values
    const testInsert = {
      project_id: "00000000-0000-0000-0000-000000000000",
      title: "__debug_test_task__",
      status: "open",
      priority: "medium",
      source: "manual",
    };

    const { data: testResult, error: testError } = await admin
      .from("tasks")
      .insert(testInsert as any)
      .select()
      .single();

    if (testError) {
      results.test_insert = {
        ok: false,
        error: testError.message,
        code: testError.code,
        details: testError.details,
        hint: testError.hint,
      };
    } else {
      results.test_insert = {
        ok: true,
        id: testResult?.id,
        columns_returned: testResult ? Object.keys(testResult) : [],
      };
      // Clean up test task
      if (testResult?.id) {
        await admin.from("tasks").delete().eq("id", testResult.id);
      }
    }

    // 5. Test INSERT with meeting_pv source (pre-migration-006 value)
    const testMeetingInsert = {
      project_id: "00000000-0000-0000-0000-000000000000",
      title: "__debug_test_meeting_task__",
      status: "open",
      priority: "medium",
      source: "meeting_pv",
      source_id: "00000000-0000-0000-0000-000000000001",
      source_reference: "PV #1, §1",
      assigned_to_name: "Test",
      assigned_to_company: "Test Co",
    };

    const { data: testMeetingResult, error: testMeetingError } = await admin
      .from("tasks")
      .insert(testMeetingInsert as any)
      .select()
      .single();

    if (testMeetingError) {
      results.test_meeting_insert = {
        ok: false,
        error: testMeetingError.message,
        code: testMeetingError.code,
        details: testMeetingError.details,
        hint: testMeetingError.hint,
      };
    } else {
      results.test_meeting_insert = {
        ok: true,
        id: testMeetingResult?.id,
      };
      // Clean up
      if (testMeetingResult?.id) {
        await admin.from("tasks").delete().eq("id", testMeetingResult.id);
      }
    }

    // 6. Check if project_id FK constraint is the issue (try with a real project)
    const { data: firstProject } = await admin
      .from("projects")
      .select("id, name")
      .limit(1)
      .maybeSingle();

    results.first_project = firstProject
      ? { id: firstProject.id, name: firstProject.name }
      : null;

    if (firstProject) {
      const testRealInsert = {
        project_id: firstProject.id,
        created_by: user.id,
        title: "__debug_real_project_task__",
        status: "open",
        priority: "medium",
        source: "meeting_pv",
        source_id: "00000000-0000-0000-0000-000000000001",
        source_reference: "Debug test",
        assigned_to_name: "Debug",
      };

      const { data: realResult, error: realError } = await admin
        .from("tasks")
        .insert(testRealInsert as any)
        .select()
        .single();

      if (realError) {
        results.test_real_project_insert = {
          ok: false,
          error: realError.message,
          code: realError.code,
          details: realError.details,
          hint: realError.hint,
        };
      } else {
        results.test_real_project_insert = {
          ok: true,
          id: realResult?.id,
          all_columns: realResult ? Object.keys(realResult) : [],
        };
        // Clean up
        if (realResult?.id) {
          await admin.from("tasks").delete().eq("id", realResult.id);
        }
      }
    }

    // 7. Check RLS — try SSR client (not admin) to SELECT tasks
    const { data: rlsTasks, error: rlsError } = await supabase
      .from("tasks")
      .select("id, title, source")
      .limit(5);

    results.rls_select_tasks = {
      count: rlsTasks?.length ?? 0,
      error: rlsError?.message ?? null,
      tasks: rlsTasks,
    };

    // 8. Check meetings table
    const { data: allMeetings, error: meetError } = await admin
      .from("meetings")
      .select("id, title, meeting_number, status, project_id")
      .limit(10);

    results.meetings = {
      count: allMeetings?.length ?? 0,
      error: meetError?.message ?? null,
      data: allMeetings,
    };

    console.log("[debug/tasks] Full results:", JSON.stringify(results, null, 2));
    return NextResponse.json(results);
  } catch (error) {
    console.error("[debug/tasks] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
