// ============================================================
// Spam & Newsletter Detector — Fast heuristic filter
// Runs before Claude AI to save API costs
// ============================================================

export interface SpamCheckResult {
  detected: boolean;
  type: "spam" | "newsletter" | null;
  confidence: number;
  reason: string;
}

// Known spam/newsletter sender patterns
const SPAM_PATTERNS = [
  /noreply@/i,
  /no-reply@/i,
  /mailer-daemon/i,
  /postmaster@/i,
  /bounce[s]?@/i,
  /notifications?@.*\.com$/i,
];

const NEWSLETTER_PATTERNS = [
  /newsletter@/i,
  /digest@/i,
  /updates?@/i,
  /marketing@/i,
  /promo(tions?)?@/i,
  /info@.*\.(com|io|co|app)$/i,
  /news@/i,
  /campaign@/i,
  /mailchimp\.com$/i,
  /sendgrid\.net$/i,
  /mailgun\.org$/i,
  /sendinblue\.com$/i,
  /hubspot\.com$/i,
  /constantcontact\.com$/i,
  /klaviyo\.com$/i,
];

const NEWSLETTER_SUBJECT_PATTERNS = [
  /newsletter/i,
  /\bnews\b.*\bweekly\b/i,
  /\bdigest\b/i,
  /\bunsubscribe\b/i,
  /se d[eé]sinscrire/i,
  /abmelden/i,
  /\bblack friday\b/i,
  /\bsoldes?\b/i,
  /\bpromo(tion)?\b/i,
  /\b(20|30|40|50|60|70)%\s*(off|rabais|de r[eé]duction)\b/i,
];

const SPAM_SUBJECT_PATTERNS = [
  /\burgent\b.*\b(act|action|response)\b/i,
  /\byou('ve)?\s+(won|inherited)\b/i,
  /\bcongratulations?\b/i,
  /\bclick here\b/i,
  /\bunsubscribe\b/i,
  /\bviagra\b/i,
  /\bcrypto\b.*\b(invest|earn)\b/i,
];

/**
 * Fast heuristic detection of spam and newsletter emails.
 * Runs before Claude AI classification to save costs.
 */
export function detectSpamNewsletter(email: {
  from_email?: string;
  sender_email?: string;
  subject: string;
  body_preview?: string;
  to_emails?: string[];
}): SpamCheckResult {
  const sender = (email.from_email || email.sender_email || "").toLowerCase();
  const subject = email.subject || "";
  const body = (email.body_preview || "").toLowerCase();

  // Check spam sender patterns
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(sender)) {
      // noreply/no-reply is common for legitimate services too — check subject
      if (/noreply|no-reply/i.test(sender)) {
        // If subject looks like spam, flag it
        for (const sp of SPAM_SUBJECT_PATTERNS) {
          if (sp.test(subject)) {
            return { detected: true, type: "spam", confidence: 0.90, reason: `Spam sender pattern + subject: ${sender}` };
          }
        }
        // noreply from unknown domain with newsletter subject → newsletter
        for (const np of NEWSLETTER_SUBJECT_PATTERNS) {
          if (np.test(subject)) {
            return { detected: true, type: "newsletter", confidence: 0.85, reason: `Noreply + newsletter subject: ${sender}` };
          }
        }
        continue; // noreply alone isn't enough
      }
      return { detected: true, type: "spam", confidence: 0.85, reason: `Spam sender pattern: ${sender}` };
    }
  }

  // Check newsletter sender patterns
  for (const pattern of NEWSLETTER_PATTERNS) {
    if (pattern.test(sender)) {
      return { detected: true, type: "newsletter", confidence: 0.90, reason: `Newsletter sender: ${sender}` };
    }
  }

  // Check newsletter subject patterns
  for (const pattern of NEWSLETTER_SUBJECT_PATTERNS) {
    if (pattern.test(subject)) {
      return { detected: true, type: "newsletter", confidence: 0.75, reason: `Newsletter subject pattern: ${subject.substring(0, 50)}` };
    }
  }

  // Check body for unsubscribe links (strong newsletter signal)
  if (body.includes("unsubscribe") || body.includes("se désinscrire") || body.includes("abmelden") || body.includes("list-unsubscribe")) {
    return { detected: true, type: "newsletter", confidence: 0.70, reason: "Unsubscribe link in body" };
  }

  return { detected: false, type: null, confidence: 0, reason: "" };
}
