import fs from 'fs';
import MsgReaderModule from '@kenjiuno/msgreader';
const MsgReader = MsgReaderModule.default;

export interface MsgAttachment {
  fileName: string;
  content: Buffer;
}

export interface ParsedMsg {
  sender: string;
  senderEmail: string;
  date: Date | null;
  subject: string;
  body: string;
  attachments: MsgAttachment[];
}

export function parseMsg(filePath: string): ParsedMsg {
  const fileBuffer = fs.readFileSync(filePath);
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  ) as ArrayBuffer;

  const reader = new MsgReader(arrayBuffer);
  const msgData = reader.getFileData() as any;

  // Expéditeur
  const senderName = msgData.senderName || '';
  const senderEmail = msgData.senderEmail || msgData.senderSmtpAddress || '';
  const sender = senderName || senderEmail || 'Inconnu';

  // Date
  let date: Date | null = null;
  if (msgData.messageDeliveryTime) {
    date = new Date(msgData.messageDeliveryTime);
  } else if (msgData.clientSubmitTime) {
    date = new Date(msgData.clientSubmitTime);
  } else if (msgData.creationTime) {
    date = new Date(msgData.creationTime);
  }

  // Objet
  const subject = msgData.subject || '';

  // Corps du texte
  let body = msgData.body || '';
  if (!body && msgData.bodyHTML) {
    body = stripHtml(msgData.bodyHTML);
  }

  // Pièces jointes
  const attachments: MsgAttachment[] = [];
  const rawAttachments = msgData.attachments || [];

  for (const attInfo of rawAttachments) {
    const fileName: string = attInfo.fileName || attInfo.name || '';
    if (!fileName) continue;

    const ext = fileName.toLowerCase();
    // On ne garde que PDF, Excel, DOCX
    if (!ext.endsWith('.pdf') && !ext.endsWith('.xlsx') && !ext.endsWith('.xls') && !ext.endsWith('.docx')) {
      continue;
    }

    try {
      const attData = reader.getAttachment(attInfo);
      if (attData && attData.content) {
        attachments.push({
          fileName,
          content: Buffer.from(attData.content),
        });
      }
    } catch {
      // PJ illisible, on skip
    }
  }

  return { sender, senderEmail, date, subject, body, attachments };
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
