/**
 * harness.ts — micro-harnais d'assertions.
 *
 * Le dépôt n'embarque aucun lanceur de tests (pas de vitest, pas de jest) :
 * la seule « suite » existante est une régression de niveau type qui se
 * vérifie au `type-check`. Plutôt que d'imposer une dépendance de test à tout
 * le monorepo dans le cadre de ce lot, ces tests s'exécutent avec `node` après
 * une compilation `tsc` (voir l'en-tête de `run.ts`).
 *
 * Si un lanceur arrive plus tard, seul ce fichier est à jeter : les tests
 * eux-mêmes sont des fonctions pures qui appellent `assert*`.
 */

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];
let currentSuite = "";

export function suite(name: string): void {
  currentSuite = name;
}

export function test(name: string, fn: () => void): void {
  const fullName = currentSuite ? `${currentSuite} › ${name}` : name;
  try {
    fn();
    results.push({ name: fullName, passed: true });
  } catch (err) {
    results.push({
      name: fullName,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} — attendu ${String(expected)}, obtenu ${String(actual)}`);
  }
}

/** Comparaison de flottants : la géométrie ne tombe jamais sur l'égalité stricte. */
export function assertClose(
  actual: number,
  expected: number,
  tolerance: number,
  message: string
): void {
  if (!Number.isFinite(actual)) {
    throw new Error(`${message} — valeur non finie (${String(actual)})`);
  }
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `${message} — attendu ${expected} ± ${tolerance}, obtenu ${actual.toFixed(4)}`
    );
  }
}

export function assertIncludes(haystack: string[], needle: string, message: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${message} — « ${needle} » absent de [${haystack.join(", ")}]`);
  }
}

/** Affiche le rapport et fixe le code de sortie. Retourne le nombre d'échecs. */
export function report(): number {
  const failed = results.filter((r) => !r.passed);

  for (const r of results) {
    if (r.passed) {
      console.log(`  ok   ${r.name}`);
    } else {
      console.error(`  FAIL ${r.name}`);
      console.error(`       ${r.error}`);
    }
  }

  console.log(
    `\n${results.length - failed.length}/${results.length} tests passés` +
      (failed.length > 0 ? ` — ${failed.length} ÉCHEC(S)` : "")
  );

  return failed.length;
}
