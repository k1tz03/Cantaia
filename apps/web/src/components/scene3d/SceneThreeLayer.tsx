/**
 * SceneThreeLayer — tout ce qui a besoin de l'objet `three` lui-même.
 *
 * Chargé UNIQUEMENT côté client, via `dynamic(..., { ssr: false })` depuis
 * SceneCanvas. C'est la seule frontière du module qui importe `three` : le
 * reste du visualiseur reste rendable côté serveur.
 *
 * Ce fichier porte quatre choses que l'audit signalait comme absentes ou
 * décoratives :
 *
 *   1. **Extrusion des vrais polygones** — les dalles, toitures et escaliers
 *      étaient rendus comme des `boxGeometry` sur la BBOX de leur polygone.
 *      Une dalle en L devenait un rectangle plein : la surface perçue était
 *      surestimée par construction. On extrude désormais le contour réel.
 *
 *   2. **Plan de coupe réel** — le HUD de section réglait un état que
 *      personne ne lisait. Un `THREE.Plane` est maintenant poussé dans le
 *      renderer et appliqué à tous les matériaux.
 *
 *   3. **Mesure réelle** — deux clics sur le plan de l'étage actif, distance
 *      calculée par lancer de rayon. Plus de HUD inerte.
 *
 *   4. **Cadrage caméra** — la caméra partait d'une position fixe [10, 9, 10],
 *      donc À L'INTÉRIEUR d'une villa de 12 m. Elle est cadrée sur la
 *      diagonale de la bbox et le champ de vision.
 */

"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { SceneElement } from "./types";
import { confidenceTint, kindOpacity } from "./confidence-visuals";
import type { ExtrusionFootprint } from "./adapter";
import { registerThreeScene } from "./scene-export";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type SectionAxis = "x" | "y" | "z";

export interface SceneThreeLayerProps {
  elements: SceneElement[];
  selectedId: string | null;
  onSelect: (element: SceneElement) => void;
  /** `[minX, minY, minZ, maxX, maxY, maxZ]` en espace Three. */
  bbox?: [number, number, number, number, number, number];
  /** Vue de dessus verrouillée (mode mesure). */
  topView: boolean;
  section: { active: boolean; axis: SectionAxis; elevation: number };
  /** Mode mesure actif : le plan de saisie devient cliquable. */
  measureActive: boolean;
  /** Altitude Y du plan de mesure (élévation du niveau actif). */
  measurePlaneY: number;
  measurePoints: Array<[number, number, number]>;
  onMeasurePoint: (point: [number, number, number]) => void;
}

// ---------------------------------------------------------------------------
// Extrusion d'un polygone
// ---------------------------------------------------------------------------

/**
 * `ExtrudeGeometry` extrude une `Shape` du plan XY local vers +Z local.
 *
 * Notre empreinte vit dans le plan XZ du monde et doit s'élever vers +Y.
 * La composition qui marche — et la seule qui préserve l'orientation du
 * contour — est : construire la forme sur `(x, -z)`, puis pivoter de -90°
 * autour de X. Un point de forme `(px, -pz, d)` devient alors
 * `(px, d, pz)` : bonne emprise, extrusion vers le haut.
 *
 * Se tromper de signe ici produit un bâtiment en miroir — cohérent à l'œil,
 * faux au métré. D'où ce commentaire plutôt qu'un `rotation={[...]}` nu.
 */
function useExtrudedGeometry(footprint: ExtrusionFootprint): THREE.ExtrudeGeometry {
  return useMemo(() => {
    const shape = new THREE.Shape();
    const pts = footprint.points;
    shape.moveTo(pts[0].x, -pts[0].z);
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo(pts[i].x, -pts[i].z);
    }
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(footprint.thickness, 0.01),
      bevelEnabled: false,
      curveSegments: 1,
    });
  }, [footprint]);
}

interface MeshProps {
  element: SceneElement;
  selected: boolean;
  onSelect: (element: SceneElement) => void;
  clippingPlanes: THREE.Plane[];
  /**
   * En mode mesure, on RETIRE les meshes du raycast : sinon le rayon touche le
   * mur/dalle le plus proche AVANT le plan de mesure (au niveau du sol) et le
   * clic sélectionne l'élément au lieu de poser un point. Un raycast neutre
   * laisse le rayon atteindre le plan de saisie.
   */
  measureActive: boolean;
}

/** Raycast neutre : retire l'objet des intersections (aucun push). */
const noRaycast = () => null;

function PolygonMesh({ element, selected, onSelect, clippingPlanes, measureActive }: MeshProps) {
  const footprint = element.metadata?.footprint as ExtrusionFootprint;
  const geometry = useExtrudedGeometry(footprint);

  // La géométrie est créée par `useMemo` : c'est à nous de libérer le GPU
  // quand l'élément disparaît (changement de niveau, filtre de confiance).
  useEffect(() => () => geometry.dispose(), [geometry]);

  const color = selected ? "#F97316" : confidenceTint(element.confidence);
  const opacity = kindOpacity(element.kind, selected);

  return (
    <mesh
      geometry={geometry}
      position={[0, footprint.base, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={measureActive ? noRaycast : undefined}
      onClick={
        measureActive
          ? undefined
          : (event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              onSelect(element);
            }
      }
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        roughness={0.75}
        metalness={0.05}
        side={THREE.DoubleSide}
        clippingPlanes={clippingPlanes}
        clipShadows
      />
    </mesh>
  );
}

function BoxMesh({ element, selected, onSelect, clippingPlanes, measureActive }: MeshProps) {
  const [cx, cy, cz, w, h, d] = element.bbox as [number, number, number, number, number, number];
  const rotationY = (element.metadata?.rotation_y as number | undefined) ?? 0;
  const color = selected ? "#F97316" : confidenceTint(element.confidence);
  const opacity = kindOpacity(element.kind, selected);

  return (
    <mesh
      position={[cx, cy, cz]}
      rotation={[0, rotationY, 0]}
      scale={[Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01)]}
      raycast={measureActive ? noRaycast : undefined}
      onClick={
        measureActive
          ? undefined
          : (event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              onSelect(element);
            }
      }
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        roughness={0.75}
        metalness={0.05}
        clippingPlanes={clippingPlanes}
        clipShadows
      />
      {selected && (
        <mesh>
          <boxGeometry args={[1.02, 1.02, 1.02]} />
          <meshBasicMaterial color="#F97316" wireframe transparent opacity={0.9} />
        </mesh>
      )}
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Coupe
// ---------------------------------------------------------------------------

/**
 * Normale et constante du plan de coupe.
 *
 * `THREE.Plane(n, c)` conserve les points où `n · p + c >= 0`.
 *   - axe « z » (coupe horizontale) : normale (0,-1,0) ⇒ on garde tout ce qui
 *     est SOUS l'altitude réglée — le comportement attendu d'un plan de coupe
 *     d'architecte.
 *   - axes « x » / « y » : coupes verticales le long des axes du monde.
 */
function buildClippingPlanes(section: SceneThreeLayerProps["section"]): THREE.Plane[] {
  if (!section.active) return [];
  switch (section.axis) {
    case "x":
      return [new THREE.Plane(new THREE.Vector3(-1, 0, 0), section.elevation)];
    case "y":
      return [new THREE.Plane(new THREE.Vector3(0, 0, -1), section.elevation)];
    case "z":
    default:
      return [new THREE.Plane(new THREE.Vector3(0, -1, 0), section.elevation)];
  }
}

/**
 * Publie le graphe `three` pour l'export glTF. Le registre est vidé au
 * démontage : exporter une scène détruite produirait un fichier vide.
 */
function ExportBridge() {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    registerThreeScene(scene);
    return () => registerThreeScene(null);
  }, [scene]);

  return null;
}

/** Active le clipping local du renderer tant que la couche est montée. */
function ClippingEnabler({ enabled }: { enabled: boolean }) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const previous = gl.localClippingEnabled;
    gl.localClippingEnabled = enabled;
    return () => {
      gl.localClippingEnabled = previous;
    };
  }, [gl, enabled]);

  return null;
}

// ---------------------------------------------------------------------------
// Cadrage caméra
// ---------------------------------------------------------------------------

/**
 * Place la caméra pour que la scène tienne entièrement dans le champ.
 *
 * Distance = (demi-diagonale) / tan(fov/2), majorée de 25 % de marge. Sans
 * cela, une villa de 12 m de côté démarrait avec la caméra à l'intérieur des
 * murs — l'utilisateur voyait des faces internes et croyait à un bug de rendu.
 */
function CameraRig({
  bbox,
  topView,
}: {
  bbox?: [number, number, number, number, number, number];
  topView: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;

  // Clé de dépendance stable : la bbox est un tableau recréé à chaque rendu.
  const key = bbox ? bbox.map((v) => Math.round(v * 100)).join(",") : "none";

  useEffect(() => {
    if (!bbox) return;

    const [minX, minY, minZ, maxX, maxY, maxZ] = bbox;
    const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const size = new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ);
    const diagonal = Math.max(size.length(), 1);

    const fovRad =
      ((camera as THREE.PerspectiveCamera).fov ?? 45) * (Math.PI / 180);
    const distance = (diagonal / 2 / Math.tan(fovRad / 2)) * 1.25;

    if (topView) {
      // Vue de dessus stricte : la mesure planimétrique n'a de sens que là.
      camera.position.set(center.x, center.y + distance, center.z + 0.001);
    } else {
      // Trois-quarts classique : légèrement au-dessus, en diagonale.
      const dir = new THREE.Vector3(0.7, 0.55, 0.7).normalize();
      camera.position.copy(center).addScaledVector(dir, distance);
    }

    camera.near = Math.max(distance / 1000, 0.05);
    camera.far = distance * 10;
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    if (controls?.target) {
      controls.target.copy(center);
      controls.update();
    }
    // `key` encode la bbox : on ne recadre que si la scène change vraiment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, topView, camera, controls]);

  return null;
}

// ---------------------------------------------------------------------------
// Mesure
// ---------------------------------------------------------------------------

/**
 * Plan de saisie invisible à l'altitude du niveau actif. Chaque clic donne un
 * point du monde par lancer de rayon (`event.point`), d'où une distance
 * planimétrique exacte — la même que celle qu'on lirait sur le plan papier.
 */
function MeasureLayer({
  active,
  planeY,
  bbox,
  points,
  onPoint,
}: {
  active: boolean;
  planeY: number;
  bbox?: [number, number, number, number, number, number];
  points: Array<[number, number, number]>;
  onPoint: (point: [number, number, number]) => void;
}) {
  const size = useMemo(() => {
    if (!bbox) return 200;
    const [minX, , minZ, maxX, , maxZ] = bbox;
    return Math.max(maxX - minX, maxZ - minZ) * 3 + 10;
  }, [bbox]);

  const center = useMemo<[number, number]>(() => {
    if (!bbox) return [0, 0];
    const [minX, , minZ, maxX, , maxZ] = bbox;
    return [(minX + maxX) / 2, (minZ + maxZ) / 2];
  }, [bbox]);

  if (!active) return null;

  return (
    <group>
      {/* Cible de lancer de rayon. `visible={false}` la retirerait du
          raycast : on la garde visible mais totalement transparente. */}
      <mesh
        position={[center[0], planeY, center[1]]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onPoint([event.point.x, event.point.y, event.point.z]);
        }}
      >
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color="#F97316" />
        </mesh>
      ))}

      {points.length === 2 && (
        <Line points={[points[0], points[1]]} color="#F97316" lineWidth={2} />
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Couche principale
// ---------------------------------------------------------------------------

export default function SceneThreeLayer({
  elements,
  selectedId,
  onSelect,
  bbox,
  topView,
  section,
  measureActive,
  measurePlaneY,
  measurePoints,
  onMeasurePoint,
}: SceneThreeLayerProps) {
  const clippingPlanes = useMemo(() => buildClippingPlanes(section), [section.active, section.axis, section.elevation]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <ExportBridge />
      <ClippingEnabler enabled={section.active} />
      <CameraRig bbox={bbox} topView={topView} />

      {elements.map((element) => {
        const footprint = element.metadata?.footprint as ExtrusionFootprint | undefined;
        if (footprint && footprint.points.length >= 3) {
          return (
            <PolygonMesh
              key={element.id}
              element={element}
              selected={element.id === selectedId}
              onSelect={onSelect}
              clippingPlanes={clippingPlanes}
              measureActive={measureActive}
            />
          );
        }
        if (!element.bbox) return null;
        return (
          <BoxMesh
            key={element.id}
            element={element}
            selected={element.id === selectedId}
            onSelect={onSelect}
            clippingPlanes={clippingPlanes}
            measureActive={measureActive}
          />
        );
      })}

      <MeasureLayer
        active={measureActive}
        planeY={measurePlaneY}
        bbox={bbox}
        points={measurePoints}
        onPoint={onMeasurePoint}
      />
    </>
  );
}
