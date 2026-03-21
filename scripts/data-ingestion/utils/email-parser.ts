// Extraction depuis fichiers EML
// Pour les PST, il faudrait un outil externe (readpst) ou un accès IMAP

import fs from 'fs';
import path from 'path';

export interface ParsedEmail {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  date: string | null;
  body: string;
  attachments: string[];
}

export function parseEML(filePath: string): ParsedEmail {
  const raw = fs.readFileSync(filePath, 'utf-8');

  const getHeader = (name: string): string => {
    const regex = new RegExp(`^${name}:\\s*(.+?)$`, 'mi');
    const match = raw.match(regex);
    return match ? match[1].trim() : '';
  };

  const from = getHeader('From');
  const to = getHeader('To')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const cc = getHeader('Cc')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const subject = getHeader('Subject');
  const dateStr = getHeader('Date');

  // Extraire le body (après la première ligne vide)
  const bodyStart = raw.indexOf('\n\n');
  const body = bodyStart >= 0 ? raw.substring(bodyStart + 2).trim() : '';

  // Détecter les pièces jointes (simpliste — cherche Content-Disposition: attachment)
  const attachmentMatches = raw.matchAll(/filename="?([^";\n]+)"?/gi);
  const attachments = Array.from(attachmentMatches).map((m) => m[1].trim());

  return {
    from,
    to,
    cc,
    subject,
    date: dateStr || null,
    body: body.substring(0, 30000), // Limiter
    attachments,
  };
}

export function scanEmailFiles(dirPath: string): string[] {
  const files: string[] = [];

  function scan(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (
        entry.name.toLowerCase().endsWith('.eml') ||
        entry.name.toLowerCase().endsWith('.msg')
      ) {
        files.push(fullPath);
      }
    }
  }

  scan(dirPath);
  return files;
}
