"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Search, Send, Eye, Trash2, X, Plus, Check,
  ChevronDown, ChevronRight, Zap, Paperclip,
  CheckCircle2, Loader2, Package as PackageIcon,
  Camera, XCircle, Sparkles, Undo2,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface WizardItem {
  id: string;
  item_number: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  material_group: string;
  cfc_code: string | null;
}

interface SupplierInfo {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  specialties: any;
  cfc_codes: any;
  overall_score: number | null;
  response_rate: number | null;
  status?: string;
}

interface ExistingRequest {
  id: string;
  supplier_id: string | null;
  sent_at: string | null;
  material_group: string;
  items_requested: any[];
  suppliers?: { company_name: string } | null;
}

interface AssignmentPackage {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierEmail: string | null;
  itemIds: string[];
  customBodies: Record<string, string>; // material_group → custom body text
}

interface AttachmentFile {
  file: File;
  name: string;
  size: number;
}

interface PreviewData {
  group: string;
  subject: string;
  body_text: string;
  to: string | null;
  supplier_name: string;
  tracking_code: string;
  items_count: number;
}

export interface PriceRequestV2Props {
  submissionId: string;
  items: WizardItem[];
  suppliers: SupplierInfo[];
  existingRequests?: ExistingRequest[];
  deadline?: string | null;
  onComplete?: () => void;
}

type FilterMode = "all" | "unassigned" | "assigned";

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function matchSuppliersByRelevance(
  groupName: string,
  groupCfc: string | null,
  suppliers: SupplierInfo[]
): (SupplierInfo & { relevance_score: number })[] {
  const lotCfc = groupCfc || "";
  const nameLower = groupName.toLowerCase();

  const scored = suppliers
    .filter((s) => s.status !== "blacklisted" && s.status !== "inactive")
    .map((s) => {
      let score = 0;
      const cfcs = Array.isArray(s.cfc_codes) ? s.cfc_codes : [];
      const specs = Array.isArray(s.specialties) ? s.specialties : [];

      if (lotCfc && cfcs.some((c: string) => c === lotCfc || lotCfc.startsWith(c) || c.startsWith(lotCfc))) {
        score += 40;
      }

      const keywords = nameLower.split(/[\s,/()-]+/).filter((w: string) => w.length > 3);
      for (const kw of keywords) {
        if (specs.some((sp: string) => sp.toLowerCase().includes(kw))) {
          score += 20;
          break;
        }
      }

      if (s.overall_score && s.overall_score >= 80) score += 10;
      if (s.response_rate && s.response_rate >= 50) score += 5;

      return { ...s, relevance_score: score };
    });

  return scored
    .filter((s) => s.relevance_score > 0)
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 8);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

let pkgCounter = 0;
function nextPkgId(): string {
  return `pkg-${Date.now()}-${++pkgCounter}`;
}

/* ═══════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════ */

export function PriceRequestV2({
  submissionId,
  items,
  suppliers,
  existingRequests = [],
  deadline,
  onComplete,
}: PriceRequestV2Props) {
  // ── AI filtering state ──────────────────────────────────────
  const [excludedItems, setExcludedItems] = useState<Map<string, string>>(new Map()); // id → reason
  const [aiFilterLoading, setAiFilterLoading] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  // ── Selection state ─────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [packages, setPackages] = useState<AssignmentPackage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // ── Modals ──────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPkgId, setPreviewPkgId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTab, setPreviewTab] = useState(0);
  const [editedBodies, setEditedBodies] = useState<Record<string, string>>({});

  // ── Attachments ─────────────────────────────────────────────
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Send state ──────────────────────────────────────────────
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; saved: number; errors: number } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // ── AI item filtering (on mount) ────────────────────────────
  useEffect(() => {
    if (items.length === 0) return;
    setAiFilterLoading(true);
    fetch(`/api/submissions/${submissionId}/filter-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((i) => ({
          id: i.id,
          description: i.description,
          unit: i.unit,
          cfc_code: i.cfc_code,
          material_group: i.material_group,
        })),
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.excluded && data.excluded.length > 0) {
          const map = new Map<string, string>();
          for (const e of data.excluded) map.set(e.id, e.reason);
          setExcludedItems(map);
        }
      })
      .catch(() => {})
      .finally(() => setAiFilterLoading(false));
  }, [submissionId, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Active items = all items minus AI-excluded ones
  const activeItems = useMemo(() => items.filter((i) => !excludedItems.has(i.id)), [items, excludedItems]);
  const excludedItemsList = useMemo(() => items.filter((i) => excludedItems.has(i.id)), [items, excludedItems]);

  const restoreItem = useCallback((itemId: string) => {
    setExcludedItems((prev) => {
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  const excludeItem = useCallback((itemId: string) => {
    setExcludedItems((prev) => {
      const next = new Map(prev);
      next.set(itemId, "Exclu manuellement");
      return next;
    });
    // Also deselect it
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  // ── Derived data ────────────────────────────────────────────
  const materialGroups = useMemo(() => {
    const groups: string[] = [];
    const seen = new Set<string>();
    for (const item of activeItems) {
      if (!seen.has(item.material_group)) {
        seen.add(item.material_group);
        groups.push(item.material_group);
      }
    }
    return groups;
  }, [activeItems]);

  const itemsById = useMemo(() => {
    const map = new Map<string, WizardItem>();
    for (const item of items) map.set(item.id, item);
    return map;
  }, [items]);

  const assignedItemMap = useMemo(() => {
    // item id → list of { supplierId, supplierName }
    const map = new Map<string, { supplierId: string; supplierName: string }[]>();
    for (const pkg of packages) {
      for (const itemId of pkg.itemIds) {
        const list = map.get(itemId) || [];
        list.push({ supplierId: pkg.supplierId, supplierName: pkg.supplierName });
        map.set(itemId, list);
      }
    }
    return map;
  }, [packages]);

  const existingRequestMap = useMemo(() => {
    // item_number or id → { sent_at, supplier }
    const map = new Map<string, { date: string; supplier: string }>();
    for (const req of existingRequests) {
      if (!req.sent_at) continue;
      const supplierName = req.suppliers?.company_name || "Fournisseur";
      for (const it of req.items_requested || []) {
        const key = it.item_number || it.id || it;
        map.set(String(key), { date: req.sent_at, supplier: supplierName });
      }
    }
    return map;
  }, [existingRequests]);

  const filteredItems = useMemo(() => {
    let result = activeItems;
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          (i.item_number && i.item_number.toLowerCase().includes(q)) ||
          i.description.toLowerCase().includes(q) ||
          (i.cfc_code && i.cfc_code.toLowerCase().includes(q))
      );
    }
    // Assignment filter
    if (filter === "assigned") {
      result = result.filter((i) => assignedItemMap.has(i.id));
    } else if (filter === "unassigned") {
      result = result.filter((i) => !assignedItemMap.has(i.id));
    }
    return result;
  }, [activeItems, searchQuery, filter, assignedItemMap]);

  const counts = useMemo(() => {
    const assigned = activeItems.filter((i) => assignedItemMap.has(i.id)).length;
    return { total: activeItems.length, assigned, unassigned: activeItems.length - assigned };
  }, [activeItems, assignedItemMap]);

  const totalEmails = useMemo(() => {
    // Each package × number of distinct material groups in its items
    let count = 0;
    for (const pkg of packages) {
      const groups = new Set(pkg.itemIds.map((id) => itemsById.get(id)?.material_group).filter(Boolean));
      count += groups.size;
    }
    return count;
  }, [packages, itemsById]);

  // ── Selection handlers ──────────────────────────────────────

  const toggleItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleGroup = useCallback(
    (group: string) => {
      const groupItemIds = filteredItems.filter((i) => i.material_group === group).map((i) => i.id);
      const allSelected = groupItemIds.every((id) => selectedIds.has(id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of groupItemIds) {
          if (allSelected) next.delete(id);
          else next.add(id);
        }
        return next;
      });
    },
    [filteredItems, selectedIds]
  );

  const toggleGroupCollapse = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredItems.map((i) => i.id)));
  }, [filteredItems]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ── Package handlers ────────────────────────────────────────

  const openSupplierPicker = useCallback(() => {
    setPickerSearch("");
    setPickerSelected(new Set());
    setPickerOpen(true);
  }, []);

  const confirmAssignment = useCallback(() => {
    if (pickerSelected.size === 0 || selectedIds.size === 0) return;

    setPackages((prev) => {
      const next = [...prev];
      for (const suppId of pickerSelected) {
        const supplier = suppliers.find((s) => s.id === suppId);
        if (!supplier) continue;

        const existing = next.find((p) => p.supplierId === suppId);
        if (existing) {
          // Merge items into existing package
          const merged = new Set(existing.itemIds);
          for (const id of selectedIds) merged.add(id);
          existing.itemIds = Array.from(merged);
        } else {
          next.push({
            id: nextPkgId(),
            supplierId: suppId,
            supplierName: supplier.company_name,
            supplierEmail: supplier.email,
            itemIds: Array.from(selectedIds),
            customBodies: {},
          });
        }
      }
      return next;
    });

    setSelectedIds(new Set());
    setPickerOpen(false);
  }, [pickerSelected, selectedIds, suppliers]);

  // removeItemFromPackage kept for future package-card inline editing
  // const removeItemFromPackage = useCallback((pkgId: string, itemId: string) => { ... }, []);

  const deletePackage = useCallback((pkgId: string) => {
    setPackages((prev) => prev.filter((p) => p.id !== pkgId));
  }, []);

  const removeSupplierFromItem = useCallback((supplierId: string, itemId: string) => {
    setPackages((prev) =>
      prev
        .map((p) =>
          p.supplierId === supplierId ? { ...p, itemIds: p.itemIds.filter((id) => id !== itemId) } : p
        )
        .filter((p) => p.itemIds.length > 0)
    );
  }, []);

  // ── Attachments ─────────────────────────────────────────────

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const newFiles: AttachmentFile[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) continue; // 10MB max
      newFiles.push({ file, name: file.name, size: file.size });
    }
    setAttachments((prev) => [...prev, ...newFiles]);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const captureScreen = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0);

      stream.getTracks().forEach((t) => t.stop());

      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], `capture-${Date.now()}.png`, { type: "image/png" });
        setAttachments((prev) => [...prev, { file, name: file.name, size: file.size }]);
      }, "image/png");
    } catch {
      // User cancelled or API not supported
    }
  }, []);

  // ── Preview ─────────────────────────────────────────────────

  const openPreview = useCallback(
    async (pkgId: string) => {
      const pkg = packages.find((p) => p.id === pkgId);
      if (!pkg) return;

      setPreviewPkgId(pkgId);
      setPreviewLoading(true);
      setPreviewData([]);
      setPreviewTab(0);
      setPreviewOpen(true);

      // Group items by material_group
      const byGroup = new Map<string, string[]>();
      for (const itemId of pkg.itemIds) {
        const item = itemsById.get(itemId);
        if (!item) continue;
        const list = byGroup.get(item.material_group) || [];
        list.push(itemId);
        byGroup.set(item.material_group, list);
      }

      // Fetch preview for each group
      const previews: PreviewData[] = [];
      for (const [group, itemIdList] of byGroup) {
        try {
          const params = new URLSearchParams({
            group,
            supplier_id: pkg.supplierId,
            item_ids: itemIdList.join(","),
          });
          if (deadline) params.set("deadline", deadline);

          const res = await fetch(`/api/submissions/${submissionId}/preview-email?${params}`);
          if (res.ok) {
            const data = await res.json();
            previews.push({
              group,
              subject: data.subject,
              body_text: pkg.customBodies[group] || data.body_text,
              to: data.to,
              supplier_name: data.supplier_name,
              tracking_code: data.tracking_code,
              items_count: data.items_count,
            });
          }
        } catch {
          // skip failed preview
        }
      }

      // Initialize edited bodies from package if exists
      const bodies: Record<string, string> = {};
      for (const p of previews) {
        if (pkg.customBodies[p.group]) {
          bodies[`${pkgId}-${p.group}`] = pkg.customBodies[p.group];
        }
      }
      setEditedBodies(bodies);
      setPreviewData(previews);
      setPreviewLoading(false);
    },
    [packages, itemsById, submissionId, deadline]
  );

  const savePreviewBody = useCallback(
    (group: string, body: string) => {
      if (!previewPkgId) return;
      setPackages((prev) =>
        prev.map((p) =>
          p.id === previewPkgId ? { ...p, customBodies: { ...p.customBodies, [group]: body } } : p
        )
      );
    },
    [previewPkgId]
  );

  // ── Send ────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    if (packages.length === 0) return;
    setSending(true);
    setSendError(null);

    try {
      // Convert packages to API groups format
      const groups: { material_group: string; supplier_ids: string[]; item_ids: string[] }[] = [];
      const customBodies: Record<string, string> = {};

      for (const pkg of packages) {
        // Group items by material_group
        const byGroup = new Map<string, string[]>();
        for (const itemId of pkg.itemIds) {
          const item = itemsById.get(itemId);
          if (!item) continue;
          const list = byGroup.get(item.material_group) || [];
          list.push(itemId);
          byGroup.set(item.material_group, list);
        }

        for (const [group, itemIdList] of byGroup) {
          groups.push({
            material_group: group,
            supplier_ids: [pkg.supplierId],
            item_ids: itemIdList,
          });
          if (pkg.customBodies[group]) {
            customBodies[pkg.supplierId] = pkg.customBodies[group];
          }
        }
      }

      // Convert attachments to base64
      const attachmentData: { filename: string; contentType: string; content: string }[] = [];
      for (const att of attachments) {
        const buffer = await att.file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        attachmentData.push({ filename: att.name, contentType: att.file.type, content: base64 });
      }

      const body: any = {
        groups,
        deadline: deadline || undefined,
        custom_bodies: Object.keys(customBodies).length > 0 ? customBodies : undefined,
        attachments: attachmentData.length > 0 ? attachmentData : undefined,
      };

      const res = await fetch(`/api/submissions/${submissionId}/send-price-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        const errors = (json.results || []).filter((r: any) => r.status === "error").length;
        setSendResult({ sent: json.sent || 0, saved: json.saved || 0, errors });
        onComplete?.();
      } else {
        setSendError(json.error || "Erreur lors de l'envoi");
      }
    } catch (err: any) {
      setSendError(err.message || "Erreur réseau");
    } finally {
      setSending(false);
    }
  }, [packages, itemsById, attachments, deadline, submissionId, onComplete]);

  // ── Supplier picker data ────────────────────────────────────

  const pickerData = useMemo(() => {
    // Find which groups are represented by the selected items
    const selectedGroups = new Set<string>();
    const cfcCodes = new Map<string, string>();
    for (const id of selectedIds) {
      const item = itemsById.get(id);
      if (item) {
        selectedGroups.add(item.material_group);
        if (item.cfc_code) cfcCodes.set(item.material_group, item.cfc_code);
      }
    }

    // Get AI recommendations based on dominant group
    const dominantGroup = Array.from(selectedGroups)[0] || "";
    const dominantCfc = cfcCodes.get(dominantGroup) || null;
    const recommended = matchSuppliersByRelevance(dominantGroup, dominantCfc, suppliers);
    const recommendedIds = new Set(recommended.map((s) => s.id));

    // Filter suppliers by search
    const q = pickerSearch.toLowerCase();
    const allSuppliers = suppliers.filter(
      (s) =>
        s.status !== "blacklisted" &&
        s.status !== "inactive" &&
        (!q || s.company_name.toLowerCase().includes(q) || (s.email && s.email.toLowerCase().includes(q)))
    );

    const others = allSuppliers.filter((s) => !recommendedIds.has(s.id));

    return { recommended, others, dominantGroup };
  }, [selectedIds, itemsById, suppliers, pickerSearch]);

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */

  // ── Success state ───────────────────────────────────────────
  if (sendResult) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 mb-4">
          <CheckCircle2 className="h-8 w-8 text-green-400" />
        </div>
        <h3 className="text-lg font-semibold text-[#FAFAFA] mb-2">Demandes envoyées</h3>
        <p className="text-sm text-[#A1A1AA] mb-1">
          {sendResult.sent > 0 && <>{sendResult.sent} email{sendResult.sent > 1 ? "s" : ""} envoyé{sendResult.sent > 1 ? "s" : ""}</>}
          {sendResult.saved > 0 && <> · {sendResult.saved} enregistré{sendResult.saved > 1 ? "s" : ""}</>}
        </p>
        {sendResult.errors > 0 && (
          <p className="text-xs text-amber-400">{sendResult.errors} erreur{sendResult.errors > 1 ? "s" : ""}</p>
        )}
        <button
          onClick={() => { setSendResult(null); setPackages([]); }}
          className="mt-6 px-5 py-2 rounded-lg bg-[#F97316] text-white text-sm font-medium hover:bg-[#EA580C] transition-colors"
        >
          Fermer
        </button>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────
  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F97316]/10">
            <Zap className="h-4 w-4 text-[#F97316]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#FAFAFA]">Demandes de prix</h2>
            <p className="text-xs text-[#71717A]">
              {activeItems.length} postes · {materialGroups.length} groupes
              {excludedItemsList.length > 0 && (
                <span className="text-[#52525B]"> · {excludedItemsList.length} exclus par IA</span>
              )}
              {aiFilterLoading && <span className="text-[#F97316] ml-1">· Analyse IA...</span>}
            </p>
          </div>
        </div>
        {deadline && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#27272A] text-xs text-[#A1A1AA]">
            📅 {new Date(deadline).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" })}
          </span>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-5" style={{ minHeight: 500 }}>
        {/* ── Left: Items table ──────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#52525B]" />
              <input
                type="text"
                placeholder="Rechercher par n°, description ou CFC..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#18181B] border border-[#27272A] rounded-lg text-sm text-[#FAFAFA] placeholder-[#52525B] focus:outline-none focus:border-[#F97316]/50"
              />
            </div>
            {(["all", "unassigned", "assigned"] as FilterMode[]).map((f) => {
              const label = f === "all" ? "Tous" : f === "unassigned" ? "Non assignés" : "Assignés";
              const count = f === "all" ? counts.total : f === "unassigned" ? counts.unassigned : counts.assigned;
              const active = filter === f;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                    active
                      ? "bg-[#F97316]/10 border-[#F97316]/30 text-[#F97316]"
                      : "bg-[#18181B] border-[#27272A] text-[#71717A] hover:text-[#A1A1AA] hover:border-[#3F3F46]"
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>

          {/* Items table */}
          <div className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[40px_60px_1fr_80px_60px_minmax(140px,200px)_32px] items-center px-3 py-2 bg-[#111113] border-b border-[#27272A] text-[10px] font-medium text-[#52525B] uppercase tracking-wider">
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={filteredItems.length > 0 && filteredItems.every((i) => selectedIds.has(i.id))}
                  onChange={() => {
                    if (filteredItems.every((i) => selectedIds.has(i.id))) deselectAll();
                    else selectAll();
                  }}
                  className="accent-[#F97316] h-3.5 w-3.5"
                />
              </div>
              <div>N°</div>
              <div>Description</div>
              <div className="text-right">Quantité</div>
              <div className="text-center">Unité</div>
              <div>Assigné à</div>
              <div></div>
            </div>

            {/* Grouped items */}
            <div className="max-h-[600px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#27272A #18181B" }}>
              {materialGroups.map((group) => {
                const groupItems = filteredItems.filter((i) => i.material_group === group);
                if (groupItems.length === 0) return null;

                const collapsed = collapsedGroups.has(group);
                const groupSelectedCount = groupItems.filter((i) => selectedIds.has(i.id)).length;
                const allGroupSelected = groupSelectedCount === groupItems.length;
                const someGroupSelected = groupSelectedCount > 0 && !allGroupSelected;

                return (
                  <div key={group}>
                    {/* Group header */}
                    <div
                      className="grid grid-cols-[40px_1fr_auto] items-center px-3 py-2 bg-[#0F0F11] border-y border-[#27272A] cursor-pointer hover:bg-[#18181B] transition-colors"
                      onClick={() => toggleGroupCollapse(group)}
                    >
                      <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={allGroupSelected}
                          ref={(el) => { if (el) el.indeterminate = someGroupSelected; }}
                          onChange={() => toggleGroup(group)}
                          className="accent-[#F97316] h-3.5 w-3.5"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        {collapsed ? (
                          <ChevronRight className="h-3.5 w-3.5 text-[#52525B]" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-[#52525B]" />
                        )}
                        <span className="text-xs font-semibold text-[#FAFAFA]">{group}</span>
                      </div>
                      <span className="text-[10px] text-[#52525B] bg-[#27272A] px-2 py-0.5 rounded-full">
                        {groupItems.length} postes
                      </span>
                    </div>

                    {/* Group items */}
                    {!collapsed &&
                      groupItems.map((item) => {
                        const isSelected = selectedIds.has(item.id);
                        const assignedTo = assignedItemMap.get(item.id) || [];
                        const existingReq = existingRequestMap.get(item.item_number || item.id);

                        return (
                          <div
                            key={item.id}
                            onClick={() => toggleItem(item.id)}
                            className={`grid grid-cols-[40px_60px_1fr_80px_60px_minmax(140px,200px)_32px] items-center px-3 py-2 border-b border-[#27272A]/50 cursor-pointer transition-colors ${
                              isSelected ? "bg-[#F97316]/[0.04]" : "hover:bg-[#1C1C1F]"
                            }`}
                          >
                            <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleItem(item.id)}
                                className="accent-[#F97316] h-3.5 w-3.5"
                              />
                            </div>
                            <div className="text-xs text-[#A1A1AA] font-mono">{item.item_number || "—"}</div>
                            <div className="min-w-0 pr-2">
                              <div className="text-xs text-[#FAFAFA]">{item.description}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {item.cfc_code && (
                                  <span className="text-[10px] text-[#52525B]">{item.cfc_code}</span>
                                )}
                                {existingReq && (
                                  <span className="text-[10px] text-blue-400/70">
                                    Demandé le {new Date(existingReq.date).toLocaleDateString("fr-CH")}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-[#A1A1AA] text-right font-mono">
                              {item.quantity != null ? Number(item.quantity).toLocaleString("fr-CH") : "—"}
                            </div>
                            <div className="text-xs text-[#71717A] text-center">{item.unit || "—"}</div>
                            <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                              {assignedTo.map((a) => (
                                <span
                                  key={a.supplierId}
                                  className="inline-flex items-center gap-1 max-w-[130px] px-1.5 py-0.5 rounded bg-[#F97316]/10 text-[10px] text-[#F97316] font-medium"
                                >
                                  <span className="truncate">{a.supplierName}</span>
                                  <button
                                    onClick={() => removeSupplierFromItem(a.supplierId, item.id)}
                                    className="shrink-0 hover:text-red-400 transition-colors"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                            <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => excludeItem(item.id)}
                                className="p-1 rounded hover:bg-[#27272A] text-[#52525B] hover:text-amber-500 transition-colors"
                                title="Exclure ce poste"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })}

              {filteredItems.length === 0 && (
                <div className="py-12 text-center text-sm text-[#52525B]">
                  Aucun poste trouvé
                </div>
              )}
            </div>
          </div>

          {/* ── AI Excluded items section ──────────────────── */}
          {excludedItemsList.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowExcluded(!showExcluded)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A] hover:border-[#3F3F46] transition-colors text-left"
              >
                {showExcluded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-[#52525B]" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-[#52525B]" />
                )}
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-medium text-[#A1A1AA]">
                  Postes exclus par l&apos;IA
                </span>
                <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full font-medium">
                  {excludedItemsList.length}
                </span>
              </button>

              {showExcluded && (
                <div className="mt-2 bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-amber-500/5 border-b border-[#27272A] text-[10px] text-amber-500/80">
                    Ces postes ont été identifiés comme ne nécessitant pas de demande de prix (services, location, main d&apos;œuvre). Cliquez sur ↩ pour les réintégrer.
                  </div>
                  <div className="max-h-[300px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#27272A #18181B" }}>
                    {excludedItemsList.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 px-3 py-2 border-b border-[#27272A]/50 hover:bg-[#1C1C1F] transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#71717A]">{item.description}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.item_number && <span className="text-[10px] text-[#52525B] font-mono">{item.item_number}</span>}
                            <span className="text-[10px] text-amber-500/60 italic">{excludedItems.get(item.id)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => restoreItem(item.id)}
                          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded bg-[#27272A] hover:bg-[#3F3F46] text-[10px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                          title="Réintégrer ce poste"
                        >
                          <Undo2 className="h-3 w-3" />
                          Restaurer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Packages panel ─────────────────────────── */}
        <div className="w-[340px] shrink-0">
          <div className="sticky top-4 space-y-4">
            {/* Packages */}
            <div className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[#27272A] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PackageIcon className="h-4 w-4 text-[#F97316]" />
                  <span className="text-sm font-medium text-[#FAFAFA]">Paquets</span>
                </div>
                {packages.length > 0 && (
                  <span className="text-[10px] bg-[#F97316]/10 text-[#F97316] px-2 py-0.5 rounded-full font-medium">
                    {packages.length}
                  </span>
                )}
              </div>

              <div className="max-h-[380px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#27272A #18181B" }}>
                {packages.length === 0 ? (
                  <div className="py-10 text-center">
                    <PackageIcon className="h-8 w-8 text-[#27272A] mx-auto mb-2" />
                    <p className="text-xs text-[#52525B]">Sélectionnez des postes et assignez-les</p>
                    <p className="text-xs text-[#52525B]">à un ou plusieurs fournisseurs</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#27272A]">
                    {packages.map((pkg) => {
                      const groupNames = Array.from(
                        new Set(pkg.itemIds.map((id) => itemsById.get(id)?.material_group).filter(Boolean))
                      );
                      return (
                        <div key={pkg.id} className="p-3 hover:bg-[#1C1C1F] transition-colors">
                          <div className="flex items-start justify-between mb-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-[#FAFAFA] truncate">{pkg.supplierName}</div>
                              <div className="text-[10px] text-[#52525B] truncate">{pkg.supplierEmail || "Pas d'email"}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <button
                                onClick={() => openPreview(pkg.id)}
                                className="p-1.5 rounded hover:bg-[#27272A] text-[#71717A] hover:text-[#FAFAFA] transition-colors"
                                title="Prévisualiser"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => deletePackage(pkg.id)}
                                className="p-1.5 rounded hover:bg-red-500/10 text-[#71717A] hover:text-red-400 transition-colors"
                                title="Supprimer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {/* Item chips */}
                          <div className="flex flex-wrap gap-1 mb-2">
                            {pkg.itemIds.slice(0, 4).map((itemId) => {
                              const item = itemsById.get(itemId);
                              if (!item) return null;
                              return (
                                <span
                                  key={itemId}
                                  className="inline-flex items-center gap-1 max-w-[150px] px-1.5 py-0.5 rounded bg-[#27272A] text-[10px] text-[#A1A1AA]"
                                >
                                  <span className="font-mono text-[#71717A]">{item.item_number || "—"}</span>
                                  <span className="truncate">{item.description}</span>
                                </span>
                              );
                            })}
                            {pkg.itemIds.length > 4 && (
                              <span className="px-1.5 py-0.5 rounded bg-[#27272A] text-[10px] text-[#71717A]">
                                +{pkg.itemIds.length - 4}
                              </span>
                            )}
                          </div>
                          {/* Stats */}
                          <div className="flex items-center gap-2 text-[10px] text-[#52525B]">
                            <span>{pkg.itemIds.length} postes</span>
                            <span>·</span>
                            <span>{groupNames.join(", ")}</span>
                            {attachments.length > 0 && (
                              <>
                                <span>·</span>
                                <span className="text-blue-400">{attachments.length} PJ</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Attachments */}
            <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Paperclip className="h-3.5 w-3.5 text-[#71717A]" />
                <span className="text-xs font-medium text-[#A1A1AA]">Pièces jointes</span>
              </div>
              {attachments.length > 0 && (
                <div className="space-y-1 mb-2">
                  {attachments.map((att, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-[#27272A]">
                      <span className="text-[11px] text-[#A1A1AA] truncate">{att.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-[#52525B]">{formatFileSize(att.size)}</span>
                        <button onClick={() => removeAttachment(i)} className="text-[#52525B] hover:text-red-400">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#27272A] text-xs text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#3F3F46] transition-colors"
                >
                  <Plus className="h-3 w-3" /> Fichier
                </button>
                <button
                  onClick={captureScreen}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#27272A] text-xs text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#3F3F46] transition-colors"
                >
                  <Camera className="h-3 w-3" /> Capture
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>

            {/* Send */}
            {packages.length > 0 && (
              <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-3">
                <p className="text-xs text-[#71717A] mb-3">
                  {totalEmails} email{totalEmails > 1 ? "s" : ""} à {packages.length} fournisseur{packages.length > 1 ? "s" : ""}
                  {" "}pour {new Set(packages.flatMap((p) => p.itemIds)).size} postes
                </p>
                {sendError && (
                  <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                    {sendError}
                  </div>
                )}
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#F97316] text-white text-sm font-medium hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {sending ? "Envoi en cours..." : `Envoyer tout (${totalEmails})`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Floating action bar ──────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-xl bg-[#18181B] border border-[#27272A] shadow-2xl shadow-black/50">
          <span className="text-sm font-medium text-[#FAFAFA]">
            {selectedIds.size} poste{selectedIds.size > 1 ? "s" : ""} sélectionné{selectedIds.size > 1 ? "s" : ""}
          </span>
          <div className="w-px h-5 bg-[#27272A]" />
          <button
            onClick={openSupplierPicker}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] text-white text-sm font-medium hover:bg-[#EA580C] transition-colors"
          >
            <Zap className="h-3.5 w-3.5" />
            Assigner à un fournisseur
          </button>
          <button
            onClick={deselectAll}
            className="px-3 py-2 rounded-lg text-sm text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#27272A] transition-colors"
          >
            Désélectionner
          </button>
        </div>
      )}

      {/* ── Supplier picker modal ────────────────────────────── */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPickerOpen(false)}>
          <div className="w-[520px] max-h-[80vh] bg-[#18181B] border border-[#27272A] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#27272A] shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-[#FAFAFA]">Choisir un fournisseur</h3>
                <p className="text-xs text-[#52525B] mt-0.5">
                  {selectedIds.size} poste{selectedIds.size > 1 ? "s" : ""} à assigner
                </p>
              </div>
              <button onClick={() => setPickerOpen(false)} className="p-1.5 rounded-lg hover:bg-[#27272A] text-[#71717A]">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-[#27272A] shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#52525B]" />
                <input
                  type="text"
                  placeholder="Rechercher un fournisseur..."
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#0F0F11] border border-[#27272A] rounded-lg text-sm text-[#FAFAFA] placeholder-[#52525B] focus:outline-none focus:border-[#F97316]/50"
                  autoFocus
                />
              </div>
            </div>

            {/* Supplier list */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#27272A #18181B" }}>
              {/* AI Recommended */}
              {pickerData.recommended.length > 0 && (
                <div>
                  <div className="px-5 py-2 flex items-center gap-2">
                    <Zap className="h-3 w-3 text-[#F97316]" />
                    <span className="text-[10px] font-medium text-[#F97316] uppercase tracking-wider">Recommandés par l'IA</span>
                  </div>
                  {pickerData.recommended.map((s) => (
                    <SupplierPickerRow
                      key={s.id}
                      supplier={s}
                      score={s.relevance_score}
                      checked={pickerSelected.has(s.id)}
                      onToggle={() => {
                        setPickerSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.add(s.id);
                          return next;
                        });
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Others */}
              {pickerData.others.length > 0 && (
                <div>
                  <div className="px-5 py-2 mt-1">
                    <span className="text-[10px] font-medium text-[#52525B] uppercase tracking-wider">
                      Autres fournisseurs ({pickerData.others.length})
                    </span>
                  </div>
                  {pickerData.others.map((s) => (
                    <SupplierPickerRow
                      key={s.id}
                      supplier={s}
                      checked={pickerSelected.has(s.id)}
                      onToggle={() => {
                        setPickerSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.add(s.id);
                          return next;
                        });
                      }}
                    />
                  ))}
                </div>
              )}

              {pickerData.recommended.length === 0 && pickerData.others.length === 0 && (
                <div className="py-10 text-center text-sm text-[#52525B]">Aucun fournisseur trouvé</div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#27272A] bg-[#111113] shrink-0">
              <span className="text-xs text-[#52525B]">
                {pickerSelected.size > 0 ? `${pickerSelected.size} sélectionné${pickerSelected.size > 1 ? "s" : ""}` : "Aucun sélectionné"}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPickerOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#27272A] transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmAssignment}
                  disabled={pickerSelected.size === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F97316] text-white text-sm font-medium hover:bg-[#EA580C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Email preview modal ──────────────────────────────── */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPreviewOpen(false)}>
          <div className="w-[640px] max-h-[85vh] bg-[#18181B] border border-[#27272A] rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#27272A]">
              <h3 className="text-sm font-semibold text-[#FAFAFA]">Prévisualisation email</h3>
              <button onClick={() => setPreviewOpen(false)} className="p-1.5 rounded-lg hover:bg-[#27272A] text-[#71717A]">
                <X className="h-4 w-4" />
              </button>
            </div>

            {previewLoading ? (
              <div className="py-16 flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
                <span className="text-xs text-[#52525B]">Chargement de l'aperçu...</span>
              </div>
            ) : (
              <>
                {/* Tabs if multiple groups */}
                {previewData.length > 1 && (
                  <div className="flex border-b border-[#27272A]">
                    {previewData.map((p, i) => (
                      <button
                        key={p.group}
                        onClick={() => setPreviewTab(i)}
                        className={`flex-1 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
                          previewTab === i
                            ? "border-[#F97316] text-[#F97316]"
                            : "border-transparent text-[#71717A] hover:text-[#A1A1AA]"
                        }`}
                      >
                        {p.group} ({p.items_count})
                      </button>
                    ))}
                  </div>
                )}

                {previewData[previewTab] && (
                  <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(85vh-140px)]" style={{ scrollbarWidth: "thin", scrollbarColor: "#27272A #18181B" }}>
                    {/* To */}
                    <div>
                      <label className="text-[10px] font-medium text-[#52525B] uppercase tracking-wider">À</label>
                      <p className="text-sm text-[#FAFAFA] mt-1">{previewData[previewTab].to || "—"}</p>
                    </div>
                    {/* Subject */}
                    <div>
                      <label className="text-[10px] font-medium text-[#52525B] uppercase tracking-wider">Objet</label>
                      <p className="text-sm text-[#FAFAFA] mt-1">{previewData[previewTab].subject}</p>
                    </div>
                    {/* Tracking */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                      <span className="text-[10px] text-blue-400">Code suivi :</span>
                      <span className="text-xs text-blue-300 font-mono">{previewData[previewTab].tracking_code}</span>
                    </div>
                    {/* Body */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-medium text-[#52525B] uppercase tracking-wider">Corps du message</label>
                        {editedBodies[`${previewPkgId}-${previewData[previewTab].group}`] && (
                          <button
                            onClick={() => {
                              const key = `${previewPkgId}-${previewData[previewTab].group}`;
                              setEditedBodies((prev) => {
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                              savePreviewBody(previewData[previewTab].group, "");
                            }}
                            className="text-[10px] text-[#F97316] hover:underline"
                          >
                            Réinitialiser
                          </button>
                        )}
                      </div>
                      <textarea
                        value={
                          editedBodies[`${previewPkgId}-${previewData[previewTab].group}`] ??
                          previewData[previewTab].body_text
                        }
                        onChange={(e) => {
                          const key = `${previewPkgId}-${previewData[previewTab].group}`;
                          setEditedBodies((prev) => ({ ...prev, [key]: e.target.value }));
                          savePreviewBody(previewData[previewTab].group, e.target.value);
                        }}
                        rows={14}
                        className="w-full p-3 bg-[#0F0F11] border border-[#27272A] rounded-lg text-xs text-[#FAFAFA] font-mono leading-relaxed focus:outline-none focus:border-[#F97316]/50 resize-y"
                      />
                    </div>
                    {/* Attachments */}
                    {attachments.length > 0 && (
                      <div>
                        <label className="text-[10px] font-medium text-[#52525B] uppercase tracking-wider">Pièces jointes</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {attachments.map((att, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#27272A] text-[10px] text-[#A1A1AA]">
                              <Paperclip className="h-2.5 w-2.5" />
                              {att.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════ */

function SupplierPickerRow({
  supplier,
  score,
  checked,
  onToggle,
}: {
  supplier: SupplierInfo;
  score?: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors ${
        checked ? "bg-[#F97316]/[0.06]" : "hover:bg-[#1C1C1F]"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="accent-[#F97316] h-3.5 w-3.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#FAFAFA] font-medium truncate">{supplier.company_name}</span>
          {score != null && score > 0 && (
            <span className="shrink-0 text-[10px] font-medium text-[#F97316] bg-[#F97316]/10 px-1.5 py-0.5 rounded">
              {Math.min(Math.round((score / 75) * 100), 99)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[#52525B] mt-0.5">
          {supplier.email && <span className="truncate">{supplier.email}</span>}
          {supplier.overall_score != null && supplier.overall_score > 0 && (
            <>
              <span>·</span>
              <span>Score {supplier.overall_score}</span>
            </>
          )}
          {supplier.response_rate != null && supplier.response_rate > 0 && (
            <>
              <span>·</span>
              <span>Réponse {supplier.response_rate}%</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
