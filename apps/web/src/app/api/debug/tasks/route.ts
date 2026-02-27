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

    // 1. Get ALL tasks (admin, no RLS) — show RAW data
    const { data: allTasks, error: allError } = await admin
      .from("tasks")
      .select("*")
      .limit(50);

    results.all_tasks_count = allTasks?.length ?? 0;
    results.all_tasks_error = allError?.message ?? null;
    results.all_tasks_raw = allTasks?.map((t: any) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      source: t.source,
      source_id: t.source_id,
      source_reference: t.source_reference,
      project_id: t.project_id,
      created_by: t.created_by,
      assigned_to_name: t.assigned_to_name,
      due_date: t.due_date,
    }));

    // 2. Sample task columns
    const { data: sampleTask } = await admin
      .from("tasks")
      .select("*")
      .limit(1)
      .maybeSingle();
    results.sample_task_columns = sampleTask
      ? Object.keys(sampleTask)
      : "no tasks in DB";

    // 3. Query pg_enum directly to get actual enum values
    // Use fetch to call Supabase REST with a raw SQL query via PostgREST RPC
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Try querying pg_enum via the Supabase SQL endpoint
    try {
      const sqlRes = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({}),
      });
      results.rpc_endpoint_check = sqlRes.status;
    } catch {
      results.rpc_endpoint_check = "fetch failed";
    }

    // 4. Get a real project to use for probing (avoids FK constraint failures)
    const { data: firstProject } = await admin
      .from("projects")
      .select("id, name")
      .limit(1)
      .maybeSingle();

    results.first_project = firstProject
      ? { id: firstProject.id, name: firstProject.name }
      : null;

    // 5. Probe status values using a REAL project_id to avoid FK errors
    const probeProjectId = firstProject?.id || "00000000-0000-0000-0000-000000000000";

    // First, find a working source value by looking at existing tasks
    const existingSource = allTasks?.[0]?.source || null;
    const existingStatus = allTasks?.[0]?.status || null;
    results.existing_task_values = {
      status: existingStatus,
      source: existingSource,
    };

    // 5a. Probe status values — use existing source if available, else try each source too
    const statusCandidates = [
      "open", "todo", "in_progress", "waiting", "completed",
      "done", "cancelled", "draft", "pending", "closed",
    ];

    const statusProbe: Record<string, string> = {};

    if (existingSource) {
      // We know a working source value from existing data
      for (const val of statusCandidates) {
        const { error: probeErr } = await admin
          .from("tasks")
          .insert({
            project_id: probeProjectId,
            created_by: user.id,
            title: `__probe_status_${val}__`,
            status: val,
            source: existingSource,
          } as any)
          .select("id")
          .single();
        if (!probeErr) {
          statusProbe[val] = "OK";
          await admin.from("tasks").delete().eq("title", `__probe_status_${val}__`);
        } else {
          statusProbe[val] = probeErr.message;
        }
      }
    } else {
      // No existing tasks — try raw insert with minimal fields
      for (const val of statusCandidates) {
        const { error: probeErr } = await admin
          .from("tasks")
          .insert({
            project_id: probeProjectId,
            created_by: user.id,
            title: `__probe_status_${val}__`,
            status: val,
          } as any)
          .select("id")
          .single();
        if (!probeErr) {
          statusProbe[val] = "OK";
          await admin.from("tasks").delete().eq("title", `__probe_status_${val}__`);
        } else {
          statusProbe[val] = probeErr.message;
        }
      }
    }
    results.status_probe = statusProbe;

    // 5b. Probe source values — use existing status or first working status
    const workingStatus =
      existingStatus ||
      Object.keys(statusProbe).find((k) => statusProbe[k] === "OK") ||
      null;
    results.working_status = workingStatus;

    const sourceCandidates = [
      "email", "meeting", "meeting_pv", "manual",
      "ai_suggestion", "reserve", "pv", "briefing",
    ];

    const sourceProbe: Record<string, string> = {};
    if (workingStatus) {
      for (const val of sourceCandidates) {
        const { error: probeErr } = await admin
          .from("tasks")
          .insert({
            project_id: probeProjectId,
            created_by: user.id,
            title: `__probe_src_${val}__`,
            status: workingStatus,
            source: val,
          } as any)
          .select("id")
          .single();
        if (!probeErr) {
          sourceProbe[val] = "OK";
          await admin.from("tasks").delete().eq("title", `__probe_src_${val}__`);
        } else {
          sourceProbe[val] = probeErr.message;
        }
      }
    } else {
      sourceProbe._note = "No working status found, cannot probe source values";
    }
    results.source_probe = sourceProbe;

    // 6. Test real INSERT with all working values
    if (firstProject && workingStatus) {
      const workingSource =
        existingSource ||
        Object.keys(sourceProbe).find((k) => sourceProbe[k] === "OK") ||
        null;

      if (workingSource) {
        const testInsert = {
          project_id: firstProject.id,
          created_by: user.id,
          title: "__debug_real_project_task__",
          status: workingStatus,
          priority: "medium",
          source: workingSource,
          source_reference: "Debug test",
          assigned_to_name: "Debug",
        };

        results.test_insert_payload = testInsert;

        const { data: realResult, error: realError } = await admin
          .from("tasks")
          .insert(testInsert as any)
          .select()
          .single();

        if (realError) {
          results.test_real_insert = {
            ok: false,
            error: realError.message,
            code: realError.code,
            details: realError.details,
            hint: realError.hint,
          };
        } else {
          results.test_real_insert = {
            ok: true,
            id: realResult?.id,
            all_columns: realResult ? Object.keys(realResult) : [],
          };
          if (realResult?.id) {
            await admin.from("tasks").delete().eq("id", realResult.id);
          }
        }
      } else {
        results.test_real_insert = "No working source found";
      }
    }

    // 7. RLS check
    const { data: rlsTasks, error: rlsError } = await supabase
      .from("tasks")
      .select("id, title, source")
      .limit(5);

    results.rls_select_tasks = {
      count: rlsTasks?.length ?? 0,
      error: rlsError?.message ?? null,
      tasks: rlsTasks,
    };

    // 8. Meetings
    const { data: allMeetings, error: meetError } = await admin
      .from("meetings")
      .select("id, title, meeting_number, status, project_id")
      .limit(10);

    results.meetings = {
      count: allMeetings?.length ?? 0,
      error: meetError?.message ?? null,
      data: allMeetings,
    };

    // 9. Try raw SELECT to check if "source" column even exists or has a different name
    const { data: rawSelect, error: rawError } = await admin
      .from("tasks")
      .select("id, status, source, priority")
      .limit(1)
      .maybeSingle();

    results.raw_select_test = {
      data: rawSelect,
      error: rawError?.message ?? null,
      columns_returned: rawSelect ? Object.keys(rawSelect) : [],
    };

    // 10. Check if source column has a default / is nullable
    // Try inserting WITHOUT source field at all
    if (firstProject && workingStatus) {
      const { error: noSourceErr } = await admin
        .from("tasks")
        .insert({
          project_id: firstProject.id,
          created_by: user.id,
          title: "__probe_no_source__",
          status: workingStatus,
        } as any)
        .select("id")
        .single();

      if (!noSourceErr) {
        // Worked! source is nullable or has a default
        const { data: inserted } = await admin
          .from("tasks")
          .select("source")
          .eq("title", "__probe_no_source__")
          .maybeSingle();
        results.source_nullable_test = {
          ok: true,
          default_source_value: inserted?.source ?? "NULL",
        };
        await admin.from("tasks").delete().eq("title", "__probe_no_source__");
      } else {
        results.source_nullable_test = {
          ok: false,
          error: noSourceErr.message,
        };
      }
    }

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
