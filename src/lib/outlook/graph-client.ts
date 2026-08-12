// Client Microsoft Graph minimal — téléchargement de pièces jointes
// (sous-ensemble du graph-client de Cantaia, utilisé par l'archivage auto)

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

interface GraphApiError {
  code: string;
  message: string;
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

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  contentBytes?: string; // base64
}

export async function getAttachments(
  accessToken: string,
  messageId: string
): Promise<GraphAttachment[]> {
  const url = `${GRAPH_BASE_URL}/me/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`;
  const data = await graphFetch<{ value: GraphAttachment[] }>(accessToken, url);
  return (data.value || []).filter((a) => !a.isInline);
}

export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<GraphAttachment> {
  const url = `${GRAPH_BASE_URL}/me/messages/${messageId}/attachments/${attachmentId}`;
  return graphFetch<GraphAttachment>(accessToken, url);
}
