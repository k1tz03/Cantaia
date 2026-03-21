// Utilise pdf-parse pour extraire le texte des PDFs

import fs from 'fs';
import pdf from 'pdf-parse';

export async function extractTextFromPDF(filePathOrBuffer: string | Buffer): Promise<{
  text: string;
  pages: number;
  truncated: boolean;
}> {
  const buffer = typeof filePathOrBuffer === 'string'
    ? fs.readFileSync(filePathOrBuffer)
    : filePathOrBuffer;
  const data = await pdf(buffer);

  // Tronquer si trop long (limiter les tokens envoyés à Claude)
  const maxChars = 30000; // ~7500 tokens
  const truncated = data.text.length > maxChars;
  const text = truncated ? data.text.substring(0, maxChars) : data.text;

  return {
    text: text.trim(),
    pages: data.numpages,
    truncated,
  };
}

export async function extractImageFromPDF(filePath: string): Promise<string> {
  // Pour les plans (Vision), on a besoin du PDF en base64
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}
