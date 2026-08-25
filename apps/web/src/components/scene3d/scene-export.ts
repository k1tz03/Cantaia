/**
 * scene-export.ts — exports réels du visualiseur (glTF, PDF).
 *
 * Le menu d'export proposait trois formats ; deux d'entre eux faisaient un
 * `console.log("pas encore implémenté")` et rien d'autre — l'utilisateur
 * cliquait, il ne se passait rien, aucun message. Les trois marchent
 * désormais, et tous portent le même avertissement de non-contractualité que
 * le filigrane à l'écran.
 *
 * Le glTF a besoin du graphe `three` vivant, qui n'existe qu'à l'intérieur du
 * `<Canvas>`. Un registre de module fait le pont : la couche 3D y dépose la
 * scène au montage, la page la récupère au moment du clic. Faire descendre
 * une ref à travers SceneViewer → SceneCanvas → couche R3F coûterait trois
 * niveaux de plomberie pour le même résultat.
 */

interface SceneRegistry {
  /** THREE.Scene courante. `unknown` : ce module ne doit pas importer three. */
  scene: unknown | null;
}

const registry: SceneRegistry = { scene: null };

/** Appelé par la couche R3F au montage / démontage. */
export function registerThreeScene(scene: unknown | null): void {
  registry.scene = scene;
}

export function getRegisteredScene(): unknown | null {
  return registry.scene;
}

export const EXPORT_DISCLAIMER =
  "Visualisation indicative générée par IA — non contractuelle. Ne remplace ni un relevé, ni un métré, ni une modélisation BIM validée.";

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Export glTF binaire (.glb) du graphe rendu.
 *
 * `GLTFExporter` est importé dynamiquement : ~60 Ko qu'on ne charge qu'au
 * clic. Retourne `false` (sans lever) si la scène n'est pas encore montée —
 * l'appelant affiche alors un message plutôt qu'un silence.
 */
export async function exportSceneToGltf(filename: string): Promise<boolean> {
  const scene = getRegisteredScene();
  if (!scene) return false;

  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const exporter = new GLTFExporter();

  const result = await exporter.parseAsync(scene as never, {
    binary: true,
    onlyVisible: true,
  });

  const blob =
    result instanceof ArrayBuffer
      ? new Blob([result], { type: "model/gltf-binary" })
      : new Blob([JSON.stringify(result)], { type: "model/gltf+json" });

  triggerDownload(blob, `${filename}.${result instanceof ArrayBuffer ? "glb" : "gltf"}`);
  return true;
}

/**
 * Capture PNG de la zone du visualiseur.
 *
 * `preserveDrawingBuffer: true` est réglé sur le `<Canvas>` : sans lui, le
 * navigateur est libre de jeter le back buffer WebGL après compositing et la
 * capture revient transparente.
 */
export async function captureViewerCanvas(rootId: string): Promise<HTMLCanvasElement | null> {
  const root = document.getElementById(rootId);
  if (!root) return null;

  const html2canvas = (await import("html2canvas")).default;
  return html2canvas(root, {
    backgroundColor: "#0F0F11",
    scale: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    useCORS: true,
    allowTaint: false,
    logging: false,
  });
}

export async function exportViewerToPng(rootId: string, filename: string): Promise<boolean> {
  const canvas = await captureViewerCanvas(rootId);
  if (!canvas) return false;

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      triggerDownload(blob, `${filename}.png`);
      resolve(true);
    }, "image/png");
  });
}

/**
 * Export PDF : la capture du visualiseur, en A4 paysage, sous un bandeau
 * d'avertissement.
 *
 * Le bandeau n'est pas décoratif : un PNG sorti du visualiseur circule par
 * e-mail et finit dans un dossier d'appel d'offres. Le document doit dire
 * lui-même ce qu'il est.
 */
export async function exportViewerToPdf(
  rootId: string,
  filename: string,
  meta: { planLabel: string; confidencePct: number | null; generatedAt: string }
): Promise<boolean> {
  const canvas = await captureViewerCanvas(rootId);
  if (!canvas) return false;

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const headerHeight = 18;
  const footerHeight = 14;

  // En-tête
  pdf.setFillColor(15, 15, 17);
  pdf.rect(0, 0, pageWidth, headerHeight, "F");
  pdf.setTextColor(250, 250, 250);
  pdf.setFontSize(12);
  pdf.text(`Visualisation 3D — ${meta.planLabel}`, margin, 11);
  pdf.setFontSize(8);
  pdf.setTextColor(161, 161, 170);
  pdf.text(
    `Généré le ${meta.generatedAt}${
      meta.confidencePct !== null ? ` · confiance globale ${meta.confidencePct} %` : ""
    }`,
    pageWidth - margin,
    11,
    { align: "right" }
  );

  // Image, mise à l'échelle en conservant le rapport d'aspect.
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - headerHeight - footerHeight - margin;
  const ratio = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
  const imgWidth = canvas.width * ratio;
  const imgHeight = canvas.height * ratio;

  pdf.addImage(
    canvas.toDataURL("image/png"),
    "PNG",
    (pageWidth - imgWidth) / 2,
    headerHeight + 4,
    imgWidth,
    imgHeight
  );

  // Bandeau d'avertissement
  pdf.setFillColor(249, 115, 22);
  pdf.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, "F");
  pdf.setTextColor(15, 15, 17);
  pdf.setFontSize(8);
  pdf.text(EXPORT_DISCLAIMER, margin, pageHeight - footerHeight + 6, {
    maxWidth: pageWidth - margin * 2,
  });

  pdf.save(`${filename}.pdf`);
  return true;
}
