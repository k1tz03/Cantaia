/**
 * geometry.ts — primitives géométriques déterministes du module Scene3D.
 *
 * Aucune dépendance externe, aucune I/O, aucun accès LLM : tout est pur et
 * testable. C'est la couche que l'audit 2 signalait comme *manquante* — « 0
 * shoelace dans tout le repo », d'où des surfaces perçues systématiquement
 * surestimées (rendu à la bbox du polygone).
 *
 * Convention de polygone : anneau OUVERT. Le dernier point n'est PAS une
 * répétition du premier ; la fermeture est implicite. `normalizePolygon()`
 * ramène toute entrée du modèle à cette convention.
 */

import type { BuildingElement, BuildingLevel, Vec2, WallElement } from "./types";
import { GEOMETRY_BOUNDS, SNAP } from "./constants";

// ---------------------------------------------------------------------------
// Points & distances
// ---------------------------------------------------------------------------

export function isFiniteVec2(p: unknown): p is Vec2 {
  return (
    !!p &&
    typeof p === "object" &&
    Number.isFinite((p as Vec2).x) &&
    Number.isFinite((p as Vec2).y)
  );
}

export function distance2(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export interface Bounds2 {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOfPoints(points: Vec2[]): Bounds2 | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (!isFiniteVec2(p)) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

// ---------------------------------------------------------------------------
// Polygones
// ---------------------------------------------------------------------------

/** Aire signée (lacet / shoelace). Positive = sens trigonométrique. */
export function polygonSignedArea(poly: Vec2[]): number {
  if (!Array.isArray(poly) || poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (!isFiniteVec2(a) || !isFiniteVec2(b)) return 0;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Aire absolue du lacet, en m². 0 pour un polygone dégénéré. */
export function polygonArea(poly: Vec2[]): number {
  return Math.abs(polygonSignedArea(poly));
}

export interface PolygonNormalization {
  polygon: Vec2[];
  /** Le dernier point répétait le premier — il a été retiré. */
  autoClosed: boolean;
  /** Points non finis ou doublons consécutifs retirés. */
  droppedPoints: number;
}

/**
 * Ramène un polygone modèle à la convention interne :
 *   - retire les points non finis,
 *   - retire les doublons consécutifs (< 1 cm),
 *   - retire la répétition finale du premier point si l'écart est < 1 cm
 *     (auto-fermeture).
 *
 * Ne referme PAS un anneau dont l'écart dépasse la tolérance : ce cas est
 * remonté par le validator comme un défaut de l'extraction, pas corrigé en
 * silence.
 */
export function normalizePolygon(raw: unknown): PolygonNormalization {
  const tol = GEOMETRY_BOUNDS.polygonClosureTolerance_m;
  const input = Array.isArray(raw) ? raw : [];
  const cleaned: Vec2[] = [];
  let dropped = 0;

  for (const p of input) {
    if (!isFiniteVec2(p)) {
      dropped++;
      continue;
    }
    const prev = cleaned[cleaned.length - 1];
    if (prev && distance2(prev, p) < tol) {
      dropped++;
      continue;
    }
    cleaned.push({ x: p.x, y: p.y });
  }

  let autoClosed = false;
  if (cleaned.length >= 4) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (distance2(first, last) < tol) {
      cleaned.pop();
      autoClosed = true;
    }
  }

  return { polygon: cleaned, autoClosed, droppedPoints: dropped };
}

/** Écart entre le premier et le dernier point (0 si l'anneau est normalisé). */
export function polygonClosureGap(poly: Vec2[]): number {
  if (poly.length < 2) return 0;
  return distance2(poly[0], poly[poly.length - 1]);
}

// ---------------------------------------------------------------------------
// Enveloppe convexe (contrôle « dalles vs enveloppe murs »)
// ---------------------------------------------------------------------------

/**
 * Enveloppe convexe (monotone chain d'Andrew). O(n log n), déterministe.
 * Retourne un anneau ouvert en sens trigonométrique.
 */
export function convexHull(points: Vec2[]): Vec2[] {
  const pts = points
    .filter(isFiniteVec2)
    .map((p) => ({ x: p.x, y: p.y }))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  if (pts.length < 3) return pts;

  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Aire de l'enveloppe convexe d'un nuage de points, en m². */
export function convexHullArea(points: Vec2[]): number {
  return polygonArea(convexHull(points));
}

/** Tous les points planimétriques portés par un élément. */
export function elementPoints(el: BuildingElement): Vec2[] {
  switch (el.type) {
    case "wall":
    case "beam":
      return [el.start, el.end].filter(isFiniteVec2);
    case "slab":
    case "roof":
    case "stair":
      return Array.isArray(el.polygon) ? el.polygon.filter(isFiniteVec2) : [];
    case "column":
      return isFiniteVec2(el.position) ? [el.position] : [];
    case "opening":
      // Paramétrique le long du mur hôte : aucun point propre.
      return [];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Mise à l'échelle globale (calibration)
// ---------------------------------------------------------------------------

/**
 * Applique un facteur d'échelle à TOUTE la géométrie planimétrique et
 * verticale d'un niveau. Muté en place volontairement : l'appelant travaille
 * sur une copie déjà isolée du payload modèle.
 *
 * Les grandeurs paramétriques (`position_along`) et les angles ne bougent pas.
 */
export function scaleLevel(level: BuildingLevel, factor: number): void {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;

  const sp = (p: Vec2) => {
    p.x *= factor;
    p.y *= factor;
  };

  level.elevation_m *= factor;
  level.height_m *= factor;

  for (const el of level.elements) {
    switch (el.type) {
      case "wall":
        sp(el.start);
        sp(el.end);
        el.thickness_m *= factor;
        el.height_m *= factor;
        break;
      case "beam":
        sp(el.start);
        sp(el.end);
        el.elevation_m *= factor;
        el.width_m *= factor;
        el.depth_m *= factor;
        break;
      case "slab":
        el.polygon.forEach(sp);
        el.thickness_m *= factor;
        el.elevation_m *= factor;
        break;
      case "roof":
        el.polygon.forEach(sp);
        el.base_elevation_m *= factor;
        if (typeof el.ridge_elevation_m === "number") el.ridge_elevation_m *= factor;
        break;
      case "stair":
        el.polygon.forEach(sp);
        el.base_elevation_m *= factor;
        el.top_elevation_m *= factor;
        break;
      case "column":
        sp(el.position);
        if (typeof el.width_m === "number") el.width_m *= factor;
        if (typeof el.depth_m === "number") el.depth_m *= factor;
        if (typeof el.radius_m === "number") el.radius_m *= factor;
        el.height_m *= factor;
        break;
      case "opening":
        el.width_m *= factor;
        el.height_m *= factor;
        if (typeof el.sill_m === "number") el.sill_m *= factor;
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Snap topologique
// ---------------------------------------------------------------------------

export interface SnapReport {
  /** Nombre d'extrémités déplacées par la fusion de sommets. */
  mergedEndpoints: number;
  /** Nombre de murs redressés vers un angle dominant. */
  straightenedWalls: number;
}

/**
 * Fusionne les extrémités de murs proches (< `endpointMergeRadius_m`) sur un
 * sommet commun — le barycentre du groupe. Sans ce passage les murs sortent
 * du modèle « à 3 cm l'un de l'autre », défaut le plus visible à l'écran.
 *
 * Algorithme : union-find naïf par balayage O(n²) sur les extrémités du
 * niveau. n ≤ quelques centaines d'éléments en Phase 1, c'est largement
 * suffisant et parfaitement déterministe (ordre d'itération stable).
 */
export function snapWallEndpoints(level: BuildingLevel, radius = SNAP.endpointMergeRadius_m): number {
  const walls = level.elements.filter((e): e is WallElement => e.type === "wall");
  if (walls.length === 0) return 0;

  interface Handle {
    get: () => Vec2;
    set: (p: Vec2) => void;
  }

  const handles: Handle[] = [];
  for (const w of walls) {
    handles.push({ get: () => w.start, set: (p) => (w.start = p) });
    handles.push({ get: () => w.end, set: (p) => (w.end = p) });
  }

  const clusterOf = new Array<number>(handles.length).fill(-1);
  const clusters: number[][] = [];

  for (let i = 0; i < handles.length; i++) {
    if (clusterOf[i] !== -1) continue;
    const cluster = [i];
    clusterOf[i] = clusters.length;
    const seed = handles[i].get();
    for (let j = i + 1; j < handles.length; j++) {
      if (clusterOf[j] !== -1) continue;
      if (distance2(seed, handles[j].get()) <= radius) {
        clusterOf[j] = clusters.length;
        cluster.push(j);
      }
    }
    clusters.push(cluster);
  }

  let moved = 0;
  for (const cluster of clusters) {
    if (cluster.length < 2) continue;
    let sx = 0;
    let sy = 0;
    for (const idx of cluster) {
      const p = handles[idx].get();
      sx += p.x;
      sy += p.y;
    }
    const centroid: Vec2 = { x: sx / cluster.length, y: sy / cluster.length };
    for (const idx of cluster) {
      if (distance2(handles[idx].get(), centroid) > 1e-9) moved++;
      handles[idx].set({ x: centroid.x, y: centroid.y });
    }
  }

  return moved;
}

/**
 * Redresse les murs dont l'orientation est à moins de `toleranceDeg` d'un
 * angle dominant du niveau (0°, 90°, ou tout angle porté par ≥ 2 murs).
 * L'extrémité `start` est conservée, `end` est reprojetée à longueur égale.
 */
export function straightenWalls(
  level: BuildingLevel,
  toleranceDeg = SNAP.angleSnapToleranceDeg
): number {
  const walls = level.elements.filter((e): e is WallElement => e.type === "wall");
  if (walls.length === 0) return 0;

  // Angle « modulo 180° » : un mur et son inverse ont la même direction.
  const dirDeg = (w: WallElement) => {
    const a = (Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x) * 180) / Math.PI;
    return ((a % 180) + 180) % 180;
  };

  // Angles candidats : les axes cardinaux + les directions déjà portées par
  // au moins deux murs (le plan a souvent une trame oblique volontaire).
  const histogram = new Map<number, number>();
  for (const w of walls) {
    const bucket = Math.round(dirDeg(w));
    histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
  }
  const dominant = new Set<number>([0, 90]);
  for (const [angle, count] of histogram) {
    if (count >= 2) dominant.add(angle);
  }

  let straightened = 0;
  for (const w of walls) {
    const current = dirDeg(w);
    let best: number | null = null;
    let bestDelta = Infinity;
    for (const target of dominant) {
      // Distance angulaire modulo 180.
      const raw = Math.abs(current - target);
      const delta = Math.min(raw, 180 - raw);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = target;
      }
    }
    if (best === null || bestDelta === 0 || bestDelta > toleranceDeg) continue;

    const length = distance2(w.start, w.end);
    if (length < GEOMETRY_BOUNDS.wallMinLength_m) continue;

    // On garde le sens original du mur (start → end) : le candidat est
    // `best` ou `best + 180`, on choisit celui qui reste proche de l'actuel.
    const currentSigned = Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x);
    const candidates = [(best * Math.PI) / 180, (best * Math.PI) / 180 + Math.PI];
    const chosen = candidates.reduce((acc, c) =>
      Math.abs(Math.atan2(Math.sin(c - currentSigned), Math.cos(c - currentSigned))) <
      Math.abs(Math.atan2(Math.sin(acc - currentSigned), Math.cos(acc - currentSigned)))
        ? c
        : acc
    );

    w.end = {
      x: w.start.x + Math.cos(chosen) * length,
      y: w.start.y + Math.sin(chosen) * length,
    };
    straightened++;
  }

  return straightened;
}

/** Applique fusion de sommets puis redressement sur tous les niveaux. */
export function snapScene(levels: BuildingLevel[]): SnapReport {
  let mergedEndpoints = 0;
  let straightenedWalls = 0;
  for (const level of levels) {
    // Redresser AVANT de fusionner produirait des sommets à nouveau
    // désalignés : l'ordre compte.
    straightenedWalls += straightenWalls(level);
    mergedEndpoints += snapWallEndpoints(level);
  }
  return { mergedEndpoints, straightenedWalls };
}

// ---------------------------------------------------------------------------
// Échelle déclarée
// ---------------------------------------------------------------------------

/**
 * Extrait le dénominateur d'une échelle textuelle : "1:100", "1/50",
 * "Echelle 1:200" → 100, 50, 200. `null` si illisible.
 */
export function parseScaleDenominator(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).match(/1\s*[:/]\s*(\d{1,5})/);
  if (!m) return null;
  const denom = Number(m[1]);
  return Number.isFinite(denom) && denom > 0 ? denom : null;
}

/**
 * Emprise horizontale plausible pour une échelle donnée, en mètres.
 *
 * Un plan est dessiné pour tenir sur une feuille : à 1:50 on ne représente
 * pas un site de 300 m, à 1:500 on ne dessine pas une salle de bain. Les
 * bornes sont larges (facteur 4 autour de la plage nominale) — l'objectif est
 * d'attraper l'erreur de facteur 10, pas de discuter les 20 %.
 */
export function expectedSpanForScale(denominator: number | null): { min: number; max: number } | null {
  if (!denominator) return null;
  // Format utile ≈ 0.2 m à 1.2 m de papier → span = papier × dénominateur.
  const min = 0.2 * denominator * 0.25;
  const max = 1.2 * denominator * 4;
  return { min, max };
}
