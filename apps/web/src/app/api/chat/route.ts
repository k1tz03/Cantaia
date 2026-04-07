import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildChatSystemPrompt,
  streamChatResponse,
  MODEL_FOR_TASK,
  type ChatMessage,
} from "@cantaia/core/ai";
import { classifyAIError } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";
import { checkUsageLimit } from "@cantaia/config/plan-features";

export const maxDuration = 60;
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
      file_url: string;
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

  // Get or create conversation
  let conversationId = body.conversation_id;

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

  // Save user message
  await (admin as any).from("chat_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: body.message,
    attachments: body.attachments || [],
  });

  // Load last 20 messages for context (reduced from 50 to control token costs)
  const { data: history } = await (admin as any)
    .from("chat_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(20);

  const messages: ChatMessage[] = (history || []).map(
    (m: { role: "user" | "assistant"; content: string }) => ({
      role: m.role,
      content: m.content,
    }),
  );

  // If attachments are present, replace the last user message with multi-content
  if (body.attachments && body.attachments.length > 0 && messages.length > 0) {
    const lastIdx = messages.length - 1;
    if (messages[lastIdx].role === "user") {
      const userContent: any[] = [];

      for (const att of body.attachments) {
        if (att.is_image) {
          // Vision: send image directly as base64
          try {
            const imgRes = await fetch(att.file_url);
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

  // Build context for system prompt
  let projectName: string | undefined;
  let projectCode: string | undefined;

  if (body.project_id) {
    const { data: proj } = await (admin as any)
      .from("projects")
      .select("name, code")
      .eq("id", body.project_id)
      .maybeSingle();
    if (proj) {
      projectName = proj.name;
      projectCode = proj.code;
    }
  } else {
    // Check if conversation has a linked project
    const { data: conv } = await (admin as any)
      .from("chat_conversations")
      .select("project_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (conv?.project_id) {
      const { data: proj } = await (admin as any)
        .from("projects")
        .select("name, code")
        .eq("id", conv.project_id)
        .maybeSingle();
      if (proj) {
        projectName = proj.name;
        projectCode = proj.code;
      }
    }
  }

  // Get org name + check usage limit
  const { data: org } = await (admin as any)
    .from("organizations")
    .select("name, subscription_plan")
    .eq("id", userOrg.organization_id)
    .maybeSingle();

  const usageCheck = await checkUsageLimit(admin, userOrg.organization_id, org?.subscription_plan || "trial");
  if (!usageCheck.allowed) {
    return new Response(
      JSON.stringify({ error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan }),
      { status: 429 }
    );
  }

  const systemPrompt = buildChatSystemPrompt({
    userName: `${userOrg.first_name || ""} ${userOrg.last_name || ""}`.trim(),
    organizationName: org?.name,
    projectName,
    projectCode,
  });

  // ── Stream response via SSE ─────────────────────────────────
  // Uses TransformStream instead of ReadableStream.start() because
  // writer.write() returns a Promise that resolves only when the chunk
  // is consumed by the reader side, ensuring per-chunk delivery.
  // ReadableStream.start() + controller.enqueue() does NOT guarantee
  // immediate network flushing on Vercel's runtime.

  let fullResponse = "";
  let finalUsage = { input_tokens: 0, output_tokens: 0 };

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

      for await (const chunk of streamChatResponse(
        anthropicApiKey,
        systemPrompt,
        messages,
      )) {
        if (chunk.type === "text") {
          fullResponse += chunk.data;
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ type: "text", data: chunk.data })}\n\n`,
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

      // Save assistant message + track usage (fire and forget)
      if (fullResponse) {
        (admin as any)
          .from("chat_messages")
          .insert({
            conversation_id: conversationId,
            role: "assistant",
            content: fullResponse,
            model: MODEL_FOR_TASK.chat,
            input_tokens: finalUsage.input_tokens,
            output_tokens: finalUsage.output_tokens,
          })
          .then(() => {})
          .catch((e: any) => console.error("[chat] Failed to save assistant message:", e));

        trackApiUsage({
          supabase: admin,
          userId: user.id,
          organizationId: userOrg.organization_id,
          actionType: "chat_message",
          apiProvider: "anthropic",
          model: MODEL_FOR_TASK.chat,
          inputTokens: finalUsage.input_tokens,
          outputTokens: finalUsage.output_tokens,
          metadata: { conversation_id: conversationId },
        });
      }

      // Update conversation timestamp
      (admin as any)
        .from("chat_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId)
        .then(() => {})
        .catch((e: any) => console.error("[chat] Failed to update conversation timestamp:", e));
    }
  })();

  // Don't await streamPromise — let it run while the response streams
  void streamPromise;

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
