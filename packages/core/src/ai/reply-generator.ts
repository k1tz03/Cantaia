// ============================================================
// AI Reply Generator — Generates professional email replies using Claude
// Handles forwarded emails (FW:/TR:) with smart context detection
// ============================================================

import { callAnthropicWithRetry, cleanEmailForAI, MODEL_FOR_TASK, isRetryableAIError } from "./ai-utils";

export interface EmailForReply {
  sender_name: string;
  sender_email: string;
  subject: string;
  body_preview: string;
  body_full?: string;
  recipients?: string[];
  received_at: string;
}

export interface ReplyProjectContext {
  name: string;
  code: string | null;
}

export interface ReplyUserProfile {
  first_name: string;
  last_name: string;
  role: string;
  company_name: string;
}

export interface ReplyResult {
  reply_text: string;
  /** If true, the AI determined no reply is needed (info-only forward) */
  no_reply_needed: boolean;
  error?: string;
}

export interface ReplyInstructions {
  tone?: "formal" | "casual" | "urgent" | "empathique";
  length?: "court" | "moyen" | "detaille";
  userInstructions?: string;
}

/** Detect whether an email is a forward based on subject and body patterns */
function detectForward(subject: string, body: string): {
  isForward: boolean;
  hasAddedText: boolean;
  addedText: string;
} {
  const fwPrefixes = /^(FW|TR|Fwd|WG)\s*:\s*/i;
  const isForwardBySubject = fwPrefixes.test(subject.trim());

  const forwardMarkers = [
    "---------- Forwarded message",
    "---------- Message transféré",
    "-----Message d'origine-----",
    "-----Original Message-----",
    "-----Ursprüngliche Nachricht-----",
    "Von:",
    "From:",
  ];

  const bodyTrimmed = body.trim();
  const isForwardByBody = forwardMarkers.some((marker) =>
    bodyTrimmed.includes(marker)
  );

  const isForward = isForwardBySubject || isForwardByBody;

  if (!isForward) {
    return { isForward: false, hasAddedText: false, addedText: "" };
  }

  // Check if sender added text before the forwarded content
  let addedText = "";
  for (const marker of forwardMarkers) {
    const idx = bodyTrimmed.indexOf(marker);
    if (idx > 0) {
      addedText = bodyTrimmed.substring(0, idx).trim();
      break;
    }
  }

  // Filter out trivial/empty added text
  const hasAddedText =
    addedText.length > 5 &&
    !/^([-—_\s]*|bonjour|hello|hi|salut)$/i.test(addedText);

  return { isForward, hasAddedText, addedText };
}

function buildReplyPrompt(
  email: EmailForReply,
  project: ReplyProjectContext | null,
  user: ReplyUserProfile,
  instructions?: ReplyInstructions
): string {
  const projectInfo = project
    ? `Projet : ${project.name} (${project.code || "N/A"})`
    : "";

  const bodyContent = cleanEmailForAI(email.body_full || email.body_preview);
  const recipientsStr = email.recipients?.join(", ") || "";
  const isReply = /^RE\s*:/i.test(email.subject.trim());

  const { isForward, hasAddedText, addedText } = detectForward(
    email.subject,
    bodyContent
  );

  let forwardSection = "";
  if (isForward) {
    if (hasAddedText) {
      forwardSection = `\nCONTEXTE : Cet email est un transfert AVEC commentaire de l'expéditeur : "${addedText}"
→ Réponds au commentaire de l'expéditeur.`;
    } else {
      forwardSection = `\nCONTEXTE : Cet email est un transfert SANS commentaire.
→ Accuse réception du transfert et propose une action concrète si applicable.`;
    }
  }

  // Detect email language from subject and body
  const textSample = `${email.subject} ${bodyContent.substring(0, 500)}`;
  const hasGerman = /\b(Sehr geehrte|Grüezi|Freundliche Grüsse|Angebot|Offerte|Baustelle|bitte|Herr|Frau)\b/i.test(textSample);
  const hasEnglish = /\b(Dear|Please|Regards|Thank you|Kind regards|Meeting|Schedule)\b/i.test(textSample);
  const detectedLang = hasGerman ? "de" : hasEnglish ? "en" : "fr";

  const langInstructions: Record<string, string> = {
    fr: "Réponds en FRANÇAIS. Vouvoiement. Signe avec :",
    de: "Antworte auf DEUTSCH. Siezen. Unterschreibe mit:",
    en: "Reply in ENGLISH. Professional tone. Sign with:",
  };

  const toneMap: Record<string, string> = {
    formal: "Formel et professionnel, vouvoiement strict",
    casual: "Cordial et décontracté, tout en restant professionnel",
    urgent: "Urgent et direct, aller droit au but",
    empathique: "Empathique et compréhensif, montrer de la considération",
  };
  const lengthMap: Record<string, string> = {
    court: "Réponse courte, 2-3 phrases maximum",
    moyen: "Réponse de longueur moyenne, 4-6 phrases",
    detaille: "Réponse détaillée et complète, couvrant tous les points",
  };

  const instructionsBlock = [
    instructions?.userInstructions
      ? `\nINSTRUCTIONS SPÉCIFIQUES DE L'UTILISATEUR :\n${instructions.userInstructions}\n→ Intègre ces instructions dans ta réponse.`
      : "",
    instructions?.tone
      ? `\nTON : ${toneMap[instructions.tone] || "Professionnel"}`
      : "",
    instructions?.length
      ? `\nLONGUEUR : ${lengthMap[instructions.length] || "Adaptée"}`
      : "",
  ].join("");

  return `Tu es l'assistant IA de ${user.first_name} ${user.last_name}, ${user.role} chez ${user.company_name}.
Tu rédiges une réponse professionnelle à un email reçu dans le contexte de la construction en Suisse.

${projectInfo ? `${projectInfo}\n` : ""}Email :
De : ${email.sender_name} <${email.sender_email}>
${recipientsStr ? `À : ${recipientsStr}\n` : ""}Objet : ${email.subject}
Date : ${email.received_at}
${isReply ? "Type : RÉPONSE (RE:) — l'expéditeur me répond" : isForward ? "Type : TRANSFERT (FW:/TR:)" : "Type : NOUVEL email"}
${forwardSection}

Contenu complet :
${bodyContent}

Réponds __NO_REPLY_NEEDED__ UNIQUEMENT si :
- Email automatique/système (notifications, newsletters, noreply@)
- Email où je suis en copie (CC) et non destinataire principal
- Accusé de réception automatique

Pour TOUS les autres emails, génère une réponse adaptée :
- Documents/plans → "Bien reçu, merci. [action concrète]"
- Information → "Merci pour l'information. [accusé contextuel]"
- Demande d'action → "Bien noté. [engagement sur l'action]"
- Offre/devis → "Merci pour votre offre. Je l'examine et vous reviens."
- Problème → "Merci de nous avoir signalé. [action proposée]"
${instructionsBlock}

STYLE :
- Ton professionnel construction suisse, concis et direct
- Sois spécifique — mentionne les éléments concrets de l'email
- Ne génère QUE le texte de la réponse, sans JSON ni markup
- ${langInstructions[detectedLang]} ${user.first_name} ${user.last_name}`;
}

/**
 * Generate a professional reply to an email using Claude.
 * Returns the reply text, or flags that no reply is needed.
 */
import type { ApiUsageCallback } from "../tracking/api-cost-tracker";

export async function generateReply(
  anthropicApiKey: string,
  email: EmailForReply,
  projectContext: ReplyProjectContext | null,
  userProfile: ReplyUserProfile,
  instructions?: ReplyInstructions,
  model = MODEL_FOR_TASK.reply_generation,
  onUsage?: ApiUsageCallback
): Promise<ReplyResult> {
  if (process.env.NODE_ENV === "development") {
    console.log(`[generateReply] Starting for: "${email.subject}" from ${email.sender_email}`);
    console.log(`[generateReply] Project: ${projectContext?.name || "none"}, User: ${userProfile.first_name} ${userProfile.last_name}`);
    console.log(`[generateReply] Body length: preview=${email.body_preview.length}, full=${email.body_full?.length || 0}`);
  }

  const prompt = buildReplyPrompt(email, projectContext, userProfile, instructions);
  const maxTokens = instructions?.length === "detaille" ? 1200 : 600;

  try {
    if (process.env.NODE_ENV === "development") {
      console.log(`[generateReply] Calling Claude API (model: ${model})...`);
    }
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 60_000 });

    const response = await callAnthropicWithRetry(() =>
      client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
                cache_control: { type: "ephemeral" },
              },
            ],
          },
        ],
      })
    );

    // Fire-and-forget usage tracking
    try {
      onUsage?.({
        model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });
    } catch { /* tracking must never fail */ }

    // Check for truncation
    if (response.stop_reason !== "end_turn") {
      console.error(`[generateReply] Warning: response truncated (stop_reason=${response.stop_reason})`);
    }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[generateReply] No text content in Claude response");
      return { reply_text: "", no_reply_needed: false, error: "No text content in Claude response" };
    }

    const text = textBlock.text.trim();
    if (process.env.NODE_ENV === "development") {
      console.log(`[generateReply] Claude response (${text.length} chars): ${text.substring(0, 200)}...`);
    }

    // Handle special markers
    if (text.includes("__NO_REPLY_NEEDED__")) {
      if (process.env.NODE_ENV === "development") {
        console.log("[generateReply] Result: NO_REPLY_NEEDED");
      }
      return { reply_text: "", no_reply_needed: true };
    }

    if (text.includes("__INSUFFICIENT_CONTEXT__")) {
      if (process.env.NODE_ENV === "development") {
        console.log("[generateReply] Result: INSUFFICIENT_CONTEXT");
      }
      return { reply_text: "", no_reply_needed: false };
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`[generateReply] Result: Generated reply (${text.length} chars)`);
    }
    return { reply_text: text, no_reply_needed: false };
  } catch (err: any) {
    console.error("[generateReply] AI error:", err?.message || err);
    if (isRetryableAIError(err)) throw err;
    return { reply_text: "", no_reply_needed: false, error: err?.message || "Unknown error" };
  }
}
