// ============================================================
// AI Reply Generator — Generates professional email replies using Claude
// Handles forwarded emails (FW:/TR:) with smart context detection
// ============================================================

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
  user: ReplyUserProfile
): string {
  const projectInfo = project
    ? `Projet : ${project.name} (${project.code || "N/A"})`
    : "";

  const bodyContent = email.body_full || email.body_preview;
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

RÈGLE PRINCIPALE : Tu dois TOUJOURS générer une réponse professionnelle.
Le seul cas où tu peux répondre __NO_REPLY_NEEDED__ est :
- Email automatique/système (notifications, newsletters, confirmations automatiques, noreply@)
- Email où je suis en copie (CC) et non destinataire principal
- Accusé de réception automatique

Pour TOUS les autres emails (même informatifs), génère une réponse adaptée :
- Envoi de documents/plans → "Bien reçu, merci. [action concrète]"
- Information/mise à jour → "Merci pour l'information. [accusé de réception contextuel]"
- Demande d'action → "Bien noté. [engagement sur l'action]"
- Offre/devis → "Merci pour votre offre. Je l'examine et vous reviens."
- Signalement problème → "Merci de nous avoir signalé. [action proposée]"
- Transfert sans commentaire → "Bien reçu. [action selon le contenu transféré]"

STYLE :
- Ton professionnel construction suisse (vouvoiement, concis, direct)
- Pas de formules vides comme "je reviens vers vous dans les meilleurs délais"
- Sois spécifique et contextuel — mentionne les éléments concrets de l'email
- Ne génère QUE le texte de la réponse, sans JSON ni markup
- Signe avec : ${user.first_name} ${user.last_name}`;
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
  model = "claude-sonnet-4-5-20250929",
  onUsage?: ApiUsageCallback
): Promise<ReplyResult> {
  console.log(`[generateReply] Starting for: "${email.subject}" from ${email.sender_email}`);
  console.log(`[generateReply] Project: ${projectContext?.name || "none"}, User: ${userProfile.first_name} ${userProfile.last_name}`);
  console.log(`[generateReply] Body length: preview=${email.body_preview.length}, full=${email.body_full?.length || 0}`);

  const prompt = buildReplyPrompt(email, projectContext, userProfile);

  try {
    console.log(`[generateReply] Calling Claude API (model: ${model})...`);
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    // Fire-and-forget usage tracking
    try {
      onUsage?.({
        model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });
    } catch { /* tracking must never fail */ }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[generateReply] No text content in Claude response");
      return { reply_text: "", no_reply_needed: false, error: "No text content in Claude response" };
    }

    const text = textBlock.text.trim();
    console.log(`[generateReply] Claude response (${text.length} chars): ${text.substring(0, 200)}...`);

    // Handle special markers
    if (text.includes("__NO_REPLY_NEEDED__")) {
      console.log("[generateReply] Result: NO_REPLY_NEEDED");
      return { reply_text: "", no_reply_needed: true };
    }

    if (text.includes("__INSUFFICIENT_CONTEXT__")) {
      console.log("[generateReply] Result: INSUFFICIENT_CONTEXT");
      return { reply_text: "", no_reply_needed: false };
    }

    console.log(`[generateReply] Result: Generated reply (${text.length} chars)`);
    return { reply_text: text, no_reply_needed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[generateReply] Error:", message);
    return { reply_text: "", no_reply_needed: false, error: message };
  }
}
