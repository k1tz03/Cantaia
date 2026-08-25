import { after, NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildChatSystemPrompt,
  streamChatResponseWithTools,
  MODEL_FOR_TASK,
  type ChatMessage,
} from "@cantaia/core/ai";
import { classifyAIError } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { insufficientCreditsResponse } from "@/lib/credits";
import {
  CHAT_TOOLS,
  CHAT_TOOLS_PROMPT_SECTION,
  executeChatTool,
  type ChatToolContext,
} from "./chat-tools";

// Tool-use adds up to 5 model round-trips plus DB queries between them, so
// the old 60s ceiling could kill a legitimate multi-tool answer mid-stream.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const admin = createAdminClient();

  const { data: userOrg } = await (admin as any)
    .from("users")
    .select("organization_id, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return new Response(JSON.stringify({ error: "No organization" }), {
      status: 403,
    });
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return new Response(JSON.stringify({ error: "AI not configured" }), {
      status: 500,
    });
  }

  let body: {
    conversation_id?: string;
    message: string;
    project_id?: string;
    attachments?: Array<{
      file_url?: string;
      storage_path?: string;
      file_name: string;
      file_type: string;
      extracted_text?: string;
      is_image?: boolean;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
    });
  }

  if (!body.message?.trim()) {
    return new Response(JSON.stringify({ error: "Message required" }), {
      status: 400,
    });
  }

  // ── Server-side attachment bounds ──────────────────────────────
  // The client sends attachment metadata (incl. client-supplied
  // `extracted_text`). Cap count and text so one request can't blow the
  // context window / token bill — /api/chat/upload enforces the same 50k cap
  // but a direct POST would otherwise bypass it entirely.
  const MAX_ATTACHMENTS = 3;
  const MAX_EXTRACTED_TEXT = 50_000;
  const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .slice(0, MAX_ATTACHMENTS)
    .map((a) => ({
      file_url: typeof a.file_url === "string" ? a.file_url : undefined,
      storage_path: typeof a.storage_path === "string" ? a.storage_path : undefined,
      file_name: String(a.file_name ?? "fichier"),
      file_type: String(a.file_type ?? ""),
      extracted_text:
        typeof a.extracted_text === "string"
          ? a.extracted_text.slice(0, MAX_EXTRACTED_TEXT)
          : undefined,
      is_image: a.is_image === true,
    }));

  // Get org name + check usage limit BEFORE any write, so a 402 never leaves
  // an orphan conversation / user message persisted with no answer.
  const { data: org } = await (admin as any)
    .from("organizations")
    .select("name, subscription_plan")
    .eq("id", userOrg.organization_id)
    .maybeSingle();

  const usageCheck = await checkUsageLimit(admin, userOrg.organization_id, org?.subscription_plan || "trial", "chat_message");
  if (!usageCheck.allowed) {
    if (usageCheck.insufficient_credits) {
      return insufficientCreditsResponse(usageCheck.required_credits ?? 1, usageCheck.remaining_credits ?? 0);
    }
    return new Response(
      JSON.stringify({ error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan }),
      { status: 429 }
    );
  }

  // Get or create conversation
  let conversationId = body.conversation_id;

  if (conversationId) {
    // IDOR guard: the admin client bypasses RLS, so ownership must be
    // verified explicitly before appending to an existing conversation.
    const { data: existingConv } = await (admin as any)
      .from("chat_conversations")
      .select("id, user_id, organization_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (
      !existingConv ||
      existingConv.user_id !== user.id ||
      existingConv.organization_id !== userOrg.organization_id
    ) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
      });
    }
  }

  if (!conversationId) {
    const title = body.message.slice(0, 100).trim();
    const { data: conv, error: convErr } = await (admin as any)
      .from("chat_conversations")
      .insert({
        user_id: user.id,
        organization_id: userOrg.organization_id,
        project_id: body.project_id || null,
        title,
      })
      .select("id")
      .single();

    if (convErr || !conv) {
      return new Response(
        JSON.stringify({ error: "Failed to create conversation" }),
        { status: 500 },
      );
    }
    conversationId = conv.id;
  }

  // Save user message — supabase-js does not throw, so the {error} must be
  // read. A dropped insert would otherwise let the stream answer a stale
  // context (the just-asked question missing from the reloaded history).
  const { error: userMsgError } = await (admin as any)
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content: body.message,
      attachments,
    });
  if (userMsgError) {
    console.error("[chat] Failed to save user message:", userMsgError);
    return new Response(
      JSON.stringify({ error: "Failed to save message" }),
      { status: 500 },
    );
  }

  // Load the last 20 messages for context (reduced from 50 to control token
  // costs). Order DESC + reverse so we keep the 20 MOST RECENT messages —
  // ascending+limit would keep the 20 OLDEST and drop the current question
  // once the conversation grows past 20 messages.
  const { data: historyDesc } = await (admin as any)
    .from("chat_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  const history = (historyDesc || []).slice().reverse();

  const messages: ChatMessage[] = history.map(
    (m: { role: "user" | "assistant"; content: string }) => ({
      role: m.role,
      content: m.content,
    }),
  );

  // If attachments are present, replace the last user message with multi-content
  if (attachments.length > 0 && messages.length > 0) {
    const lastIdx = messages.length - 1;
    if (messages[lastIdx].role === "user") {
      const userContent: any[] = [];

      for (const att of attachments) {
        if (att.is_image) {
          // Vision: send image directly as base64.
          // SSRF guard: NEVER fetch a client-supplied URL. The image is loaded
          // exclusively from its Storage object path (scoped to the caller's
          // org) via a server-generated signed URL — a foreign or internal URL
          // in the request body can never make the server issue a request.
          const path = att.storage_path;
          const belongsToOrg =
            typeof path === "string" &&
            path.startsWith(`${userOrg.organization_id}/`);
          if (!belongsToOrg) {
            userContent.push({
              type: "text",
              text: `[Image: ${att.file_name} - source non autorisée, ignorée]`,
            });
            continue;
          }
          try {
            const { data: signed } = await admin.storage
              .from("chat-attachments")
              .createSignedUrl(path!, 300);
            if (!signed?.signedUrl) throw new Error("no signed url");
            const imgRes = await fetch(signed.signedUrl);
            const imgBuf = await imgRes.arrayBuffer();
            const base64 = Buffer.from(imgBuf).toString("base64");
            const mediaType = att.file_type as
              | "image/jpeg"
              | "image/png"
              | "image/webp"
              | "image/gif";
            userContent.push({
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            });
          } catch {
            userContent.push({
              type: "text",
              text: `[Image: ${att.file_name} - failed to load]`,
            });
          }
        } else if (att.extracted_text) {
          // Text extraction: inject document content as context
          userContent.push({
            type: "text",
            text: `[Document: ${att.file_name}]\n${att.extracted_text}`,
          });
        }
      }

      // Add the user's text message
      userContent.push({ type: "text", text: body.message });

      // Use multi-content format only if we have more than just the text
      messages[lastIdx].content =
        userContent.length === 1 ? body.message : userContent;
    }
  }

  // Build context for system prompt.
  // `resolvedProjectId` is the project the tools default to — only set once
  // the project has been verified to belong to the caller's organisation.
  let projectName: string | undefined;
  let projectCode: string | undefined;
  let resolvedProjectId: string | null = null;

  // Explicit project_id from the request wins, else the conversation's own.
  let candidateProjectId: string | null = body.project_id || null;
  if (!candidateProjectId) {
    const { data: conv } = await (admin as any)
      .from("chat_conversations")
      .select("project_id")
      .eq("id", conversationId)
      .maybeSingle();
    candidateProjectId = conv?.project_id || null;
  }

  if (candidateProjectId) {
    const { data: proj } = await (admin as any)
      .from("projects")
      .select("id, name, code, organization_id")
      .eq("id", candidateProjectId)
      .maybeSingle();
    // IDOR guard: the admin client bypasses RLS, so a foreign project_id in
    // the request body must not become the tools' default scope.
    if (proj && proj.organization_id === userOrg.organization_id) {
      projectName = proj.name;
      projectCode = proj.code;
      resolvedProjectId = proj.id;
    }
  }

  // Keep the conversation's project in sync when the user switches context.
  if (resolvedProjectId && body.project_id) {
    await (admin as any)
      .from("chat_conversations")
      .update({ project_id: resolvedProjectId })
      .eq("id", conversationId)
      .then(
        () => {},
        () => {},
      );
  }

  // The SIA/construction expertise prompt stays intact; the tool contract is
  // appended so the model knows it can read real data instead of guessing.
  const systemPrompt =
    buildChatSystemPrompt({
      userName: `${userOrg.first_name || ""} ${userOrg.last_name || ""}`.trim(),
      organizationName: org?.name,
      projectName,
      projectCode,
    }) + CHAT_TOOLS_PROMPT_SECTION;

  // Tools are READ-ONLY and scoped to this user's organisation.
  const toolContext: ChatToolContext = {
    admin,
    organizationId: userOrg.organization_id,
    userId: user.id,
    defaultProjectId: resolvedProjectId,
  };

  // ── Stream response via SSE ─────────────────────────────────
  // Uses TransformStream instead of ReadableStream.start() because
  // writer.write() returns a Promise that resolves only when the chunk
  // is consumed by the reader side, ensuring per-chunk delivery.
  // ReadableStream.start() + controller.enqueue() does NOT guarantee
  // immediate network flushing on Vercel's runtime.

  let fullResponse = "";
  let finalUsage = { input_tokens: 0, output_tokens: 0 };
  const toolsUsed: string[] = [];

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();

  // Write SSE events in a detached async context so the Response
  // is returned immediately while tokens stream in background.
  const streamPromise = (async () => {
    const writer = writable.getWriter();
    try {
      // ── Initial padding ──
      // Proxies/CDNs (nginx, Vercel edge, CloudFront) often buffer the
      // first ~1-4KB before switching to streaming mode. This 2KB SSE
      // comment forces them to flush and start real-time delivery.
      await writer.write(encoder.encode(`: ${" ".repeat(2048)}\n\n`));

      // Send conversation_id
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({ type: "conversation_id", data: conversationId })}\n\n`,
        ),
      );

      for await (const chunk of streamChatResponseWithTools(
        anthropicApiKey,
        systemPrompt,
        messages,
        CHAT_TOOLS,
        (name, input) => executeChatTool(name, input, toolContext),
      )) {
        // Client hung up (Stop button / navigation) — stop consuming the
        // generator so we don't keep paying for tokens nobody will read.
        // Breaking here runs the generator's cleanup and ends the loop.
        if (request.signal.aborted) break;
        if (chunk.type === "text") {
          fullResponse += chunk.data as string;
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ type: "text", data: chunk.data })}\n\n`,
            ),
          );
        } else if (chunk.type === "tool") {
          // Surfaced so the UI can show "consultation des données…" instead of
          // an unexplained pause while a tool round-trip runs.
          toolsUsed.push((chunk.data as { name: string }).name);
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ type: "tool", data: chunk.data })}\n\n`,
            ),
          );
        } else if (chunk.type === "done") {
          finalUsage = chunk.data as {
            input_tokens: number;
            output_tokens: number;
          };
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", data: finalUsage })}\n\n`,
            ),
          );
        }
      }
    } catch (err: any) {
      const aiErr = classifyAIError(err);
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({ type: "error", data: aiErr.message, status: aiErr.status })}\n\n`,
        ),
      ).catch(() => {});
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  // Don't await streamPromise — let it run while the response streams.
  // `after()` keeps the serverless function alive until persistence finishes,
  // so assistant messages and cost tracking are never dropped on Vercel.
  after(async () => {
    try {
      await streamPromise;

      if (fullResponse) {
        const { error: msgError } = await (admin as any)
          .from("chat_messages")
          .insert({
            conversation_id: conversationId,
            role: "assistant",
            content: fullResponse,
            model: MODEL_FOR_TASK.chat,
            input_tokens: finalUsage.input_tokens,
            output_tokens: finalUsage.output_tokens,
          });
        if (msgError) {
          console.error("[chat] Failed to save assistant message:", msgError);
        }

        await trackApiUsage({
          supabase: admin,
          userId: user.id,
          organizationId: userOrg.organization_id,
          actionType: "chat_message",
          apiProvider: "anthropic",
          model: MODEL_FOR_TASK.chat,
          inputTokens: finalUsage.input_tokens,
          outputTokens: finalUsage.output_tokens,
          metadata: {
            conversation_id: conversationId,
            tools_used: toolsUsed,
            tool_calls: toolsUsed.length,
          },
        }).catch(() => {});
      }

      // Update conversation timestamp
      const { error: tsError } = await (admin as any)
        .from("chat_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
      if (tsError) {
        console.error("[chat] Failed to update conversation timestamp:", tsError);
      }
    } catch (err) {
      console.error("[chat] Post-stream persistence failed:", err);
    }
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Content-Encoding": "none",
    },
  });
}
