import fs from 'fs';
import path from 'path';

export function scanDirectory(dirPath: string, extensions: string[]): string[] {
  const files: string[] = [];

  function scan(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  scan(dirPath);
  return files;
}
