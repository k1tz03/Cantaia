// Logger avec progression pour le batch
// Affiche : [12:34:56] [OFFRES] 47/213 (22%) — offre-maier-go.pdf — 12 lignes extraites

export class IngestionLogger {
  private module: string;
  private total: number;
  private current: number = 0;
  private successes: number = 0;
  private failures: number = 0;
  private startTime: number;

  constructor(module: string, total: number) {
    this.module = module;
    this.total = total;
    this.startTime = Date.now();
  }

  progress(filename: string, detail: string) {
    this.current++;
    const pct = Math.round((this.current / this.total) * 100);
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const time = new Date().toLocaleTimeString('fr-CH');
    console.log(
      `[${time}] [${this.module}] ${this.current}/${this.total} (${pct}%) — ${filename} — ${detail} [${elapsed}s]`
    );
  }

  success(filename: string, detail: string) {
    this.successes++;
    this.progress(filename, `✅ ${detail}`);
  }

  failure(filename: string, reason: string) {
    this.failures++;
    this.progress(filename, `❌ ${reason}`);
  }

  summary(): string {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    return [
      `\n═══ RÉSUMÉ ${this.module} ═══`,
      `Total fichiers : ${this.total}`,
      `Succès : ${this.successes}`,
      `Échecs : ${this.failures}`,
      `Durée : ${elapsed}s (${Math.round(elapsed / 60)}min)`,
      `═══════════════════════\n`,
    ].join('\n');
  }
}
