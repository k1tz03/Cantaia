/**
 * pdf-pages.ts — comptage de pages d'un PDF, sans dépendance.
 *
 * Un plan d'exécution est très souvent un PDF multi-pages (un niveau par
 * page). L'extraction ne savait pas qu'elle en avait plusieurs : elle lisait
 * le document, produisait UN niveau, et rien ne le signalait. On ne peut pas
 * corriger ce qu'on ne mesure pas — d'où ce compteur.
 *
 * Méthode : lecture du dictionnaire "Type Pages … Count N" du catalogue, avec
 * repli sur le comptage des objets "Type Page". On travaille sur la
 * représentation latin-1 du buffer : les tokens PDF de structure sont ASCII.
 * Les flux compressés peuvent produire de rares faux positifs — sans
 * conséquence géométrique : ce compteur ne pilote qu'un avertissement affiché
 * à l'utilisateur, jamais une décision de géométrie.
 *
 * Retourne 1 quand le buffer n'est pas un PDF ou qu'aucune structure n'est
 * lisible (PDF chiffré, flux d'objets compressés) : ne jamais bloquer sur ça.
 */

const PDF_MAGIC = "%PDF-";

export function isPdfBuffer(buffer: Uint8Array): boolean {
  if (buffer.length < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (buffer[i] !== PDF_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Compte les pages d'un PDF. Retourne `1` par défaut (jamais 0, jamais null) :
 * l'appelant n'a pas de branche « inconnu » à gérer.
 */
export function countPdfPages(buffer: Uint8Array): number {
  if (!isPdfBuffer(buffer)) return 1;

  // latin1 : un octet = un caractère, aucune perte sur les tokens ASCII.
  const text = Buffer.from(buffer).toString("latin1");

  // 1) `/Type /Pages` avec `/Count N` — le nœud racine de l'arbre de pages.
  //    On garde le MAX : les nœuds intermédiaires portent aussi un /Count.
  let best = 0;
  const pagesNodes = text.matchAll(/\/Type\s*\/Pages\b/g);
  for (const m of pagesNodes) {
    const window = text.slice(m.index ?? 0, (m.index ?? 0) + 512);
    const count = window.match(/\/Count\s+(\d{1,6})/);
    if (count) {
      const n = Number(count[1]);
      if (Number.isFinite(n) && n > best) best = n;
    }
  }
  if (best > 0) return best;

  // 2) Repli : compter les objets page. `/Type /Page` sans le « s » final.
  const pageObjects = text.match(/\/Type\s*\/Page(?![\w])/g);
  if (pageObjects && pageObjects.length > 0) return pageObjects.length;

  return 1;
}
