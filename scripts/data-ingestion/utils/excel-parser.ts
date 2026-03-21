// Utilise xlsx pour extraire les données des fichiers Excel

import * as XLSX from 'xlsx';

export interface ExcelRow {
  [key: string]: string | number | null;
}

export function extractFromExcel(filePath: string): {
  sheets: Array<{
    name: string;
    headers: string[];
    rows: ExcelRow[];
  }>;
} {
  const workbook = XLSX.readFile(filePath);
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(sheet, {
      defval: null,
    });
    const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    return { name, headers, rows: jsonData };
  });
  return { sheets };
}
