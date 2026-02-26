// ============================================================
// Microsoft Graph API Client — Real Implementation
// ============================================================

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

export interface GraphEmailMessage {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  ccRecipients?: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  receivedDateTime: string;
  bodyPreview: string;
  body?: {
    contentType: string;
    content: string;
  };
  hasAttachments: boolean;
  isRead: boolean;
}

export interface GraphMailFolder {
  id: string;
  displayName: string;
  parentFolderId: string;
  childFolderCount: number;
  totalItemCount: number;
  unreadItemCount: number;
}

interface GraphApiError {
  code: string;
  message: string;
}

/**
 * Execute a Microsoft Graph API request with error handling.
 * Throws typed errors for 401 (token expired) and 429 (rate limited).
 */
async function graphFetch<T>(
  accessToken: string,
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (response.status === 401) {
    throw new GraphTokenExpiredError("Microsoft token expired");
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    throw new GraphRateLimitError(
      "Rate limited by Microsoft Graph",
      retryAfter ? parseInt(retryAfter, 10) : 60
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const graphError = errorBody.error as GraphApiError | undefined;
    throw new Error(
      `Graph API error ${response.status}: ${graphError?.message || response.statusText}`
    );
  }

  return response.json();
}

export class GraphTokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphTokenExpiredError";
  }
}

export class GraphRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "GraphRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Fetch emails from user's inbox via Microsoft Graph.
 */
export async function getEmails(
  accessToken: string,
  sinceDate: string,
  top = 50
): Promise<GraphEmailMessage[]> {
  const select =
    "id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,body,hasAttachments,isRead";
  const filter = `receivedDateTime ge ${sinceDate}`;
  const orderBy = "receivedDateTime desc";

  const url = `${GRAPH_BASE_URL}/me/messages?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent(orderBy)}&$top=${top}`;

  const data = await graphFetch<{ value: GraphEmailMessage[] }>(
    accessToken,
    url
  );
  return data.value || [];
}

/**
 * Move an email to a specific folder in Outlook.
 */
export async function moveEmail(
  accessToken: string,
  messageId: string,
  destinationFolderId: string
): Promise<GraphEmailMessage> {
  const url = `${GRAPH_BASE_URL}/me/messages/${messageId}/move`;
  return graphFetch<GraphEmailMessage>(accessToken, url, {
    method: "POST",
    body: JSON.stringify({ destinationId: destinationFolderId }),
  });
}

/**
 * Create a new mail folder in Outlook.
 */
export async function createFolder(
  accessToken: string,
  folderName: string
): Promise<GraphMailFolder> {
  const url = `${GRAPH_BASE_URL}/me/mailFolders`;
  return graphFetch<GraphMailFolder>(accessToken, url, {
    method: "POST",
    body: JSON.stringify({ displayName: folderName }),
  });
}

/**
 * List all mail folders for the user.
 */
export async function listFolders(
  accessToken: string
): Promise<GraphMailFolder[]> {
  const url = `${GRAPH_BASE_URL}/me/mailFolders?$top=100`;
  const data = await graphFetch<{ value: GraphMailFolder[] }>(
    accessToken,
    url
  );
  return data.value || [];
}

/**
 * Send a reply to an email via Microsoft Graph.
 */
export async function sendReply(
  accessToken: string,
  messageId: string,
  replyContent: string
): Promise<void> {
  const url = `${GRAPH_BASE_URL}/me/messages/${messageId}/reply`;
  await graphFetch<Record<string, never>>(accessToken, url, {
    method: "POST",
    body: JSON.stringify({
      message: {
        body: {
          contentType: "HTML",
          content: replyContent,
        },
      },
    }),
  });
}

// ============================================================
// Attachments
// ============================================================

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  contentBytes?: string; // base64
}

/**
 * List all non-inline attachments for an email message.
 */
export async function getAttachments(
  accessToken: string,
  messageId: string
): Promise<GraphAttachment[]> {
  const url = `${GRAPH_BASE_URL}/me/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`;
  const data = await graphFetch<{ value: GraphAttachment[] }>(accessToken, url);
  return (data.value || []).filter((a) => !a.isInline);
}

/**
 * Get inline attachments (images embedded in email body via CID).
 * Returns attachments with contentBytes (base64) for CID replacement.
 */
export async function getInlineAttachments(
  accessToken: string,
  messageId: string
): Promise<GraphAttachment[]> {
  // Fetch all attachments with content bytes
  const url = `${GRAPH_BASE_URL}/me/messages/${messageId}/attachments`;
  const data = await graphFetch<{ value: GraphAttachment[] }>(accessToken, url);
  return (data.value || []).filter((a) => a.isInline && a.contentBytes);
}

/**
 * Download a single attachment with its content (base64).
 */
export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<GraphAttachment> {
  const url = `${GRAPH_BASE_URL}/me/messages/${messageId}/attachments/${attachmentId}`;
  return graphFetch<GraphAttachment>(accessToken, url);
}

/**
 * Execute a Graph API call with automatic retry on rate limiting (429).
 * Retries up to maxRetries times with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (err instanceof GraphRateLimitError && attempt < maxRetries) {
        const waitMs = err.retryAfterSeconds * 1000;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
