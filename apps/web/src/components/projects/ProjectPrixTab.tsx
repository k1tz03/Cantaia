"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@cantaia/ui";
import { ChevronRight, DollarSign, TrendingUp } from "lucide-react";

const CFC_LABELS: Record<string, string> = {
  "111": "Démolition",
  "151": "Transport / Grue",
  "211": "Terrassement",
  "214": "Fondations / Béton maigre",
  "215": "Béton armé",
  "216": "Maçonnerie",
  "221": "Fenêtres",
  "222": "Serrurerie / Métal",
  "224": "Isolation",
  "225": "Étanchéité",
  "227": "Toiture",
  "232": "Électricité",
  "241": "Chauffage",
  "242": "Ventilation",
  "251": "Sanitaire",
  "271": "Chapes",
  "273": "Carrelage",
  "274": "Parquet",
  "275": "Peinture",
  "281": "Menuiserie",
  "291": "Essais / Laboratoire",
  "421": "Aménagements extérieurs",
  "422": "Mobilier urbain / Jeux",
  "423": "Clôtures / Abris",
};

function normalizeDesc(desc: string): string {
  return desc
    .toLowerCase()
    // Remove delivery / transport details
    .replace(/franco[- ]chantier/gi, "")
    .replace(/par (semi|camion|3 essieux|5 essieux)[^,.]*/gi, "")
    .replace(/livraison[^,.]*/gi, "")
    .replace(/rendu chantier/gi, "")
    .replace(/transport(é)?( compris| inclus)?/gi, "")
    .replace(/déchargé( sur place)?/gi, "")
    // Remove norms & standards
    .replace(/\(s\.\s*SN\s*EN\s*\d+[^)]*\)/gi, "")
    .replace(/\(s\.\s*VSS\s*\d+[^)]*\)/gi, "")
    .replace(/s\.\s*SN\s*EN\s*\d+[-\d]*/gi, "")
    .replace(/norme\s+SIA\s*\d*/gi, "")
    .replace(/EN\s*\d{3,}/gi, "")
    // Remove abbreviations & qualifiers
    .replace(/GNT/gi, "")
    .replace(/fourniture( et pose)?( de| du| des)?/gi, "")
    .replace(/prix (matière )?départ (carrière|usine)/gi, "")
    .replace(/mise en (place|œuvre|oeuvre)/gi, "")
    .replace(/y\s*\.\s*c\.\s*/gi, "")
    // Normalize granulometry: "0/32", "0-32", "0 à 32" → "0/32"
    .replace(/(\d+)\s*[-àa]\s*(\d+)\s*(mm)?/g, "$1/$2")
    // Normalize synonyms for common materials
    .replace(/gravier (concassé|roulé|naturel)/gi, "gravier")
    .replace(/grave (concassée|recyclée|naturelle)/gi, "grave")
    .replace(/sable (fin|gros|lavé|naturel)/gi, "sable")
    .replace(/béton (armé|coffré|maigre|de propreté)/gi, (_, type) => `béton ${type.toLowerCase()}`)
    .replace(/tout[- ]venant/gi, "tout-venant")
    .replace(/enrobé (bitumineux )?/gi, "enrobé ")
    // Remove trailing precision in parentheses: "(env. 30cm)", "(selon plans)"
    .replace(/\(env\.?\s*[^)]+\)/gi, "")
    .replace(/\(selon\s+[^)]+\)/gi, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

function getCfcPrefix(code: string | null | undefined): string {
  if (!code) return "";
  const parts = code.split(".");
  return parts[0] || "";
}

interface CfcSection {
  cfc: string;
  label: string;
  articles: {
    description: string;
    displayDescription: string;
    unite: string;
    suppliers: { name: string; price: number }[];
  }[];
}

export function ProjectPrixTab({
  benchmark,
}: {
  benchmark: any[];
}) {
  const t = useTranslations("projects");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const sections = useMemo<CfcSection[]>(() => {
    // Flatten all supplier lines from benchmark groups
    const allLines: { cfc: string; desc: string; displayDesc: string; unite: string; supplierName: string; price: number }[] = [];

    for (const group of benchmark) {
      const suppliers = group.suppliers || [];
      const cfc = getCfcPrefix(group.cfc_subcode || group.cfc_code);
      const desc = normalizeDesc(group.display_description || group.description || "");
      const displayDesc = group.display_description || group.description || "—";
      const unite = group.unit_normalized || group.unit || "—";

      for (const s of suppliers) {
        allLines.push({
          cfc: cfc || "",
          desc,
          displayDesc,
          unite,
          supplierName: s.supplier_name || "Inconnu",
          price: Number(s.unit_price) || 0,
        });
      }
    }

    // Group by CFC → then by normalized description
    const cfcMap = new Map<string, Map<string, { displayDesc: string; unite: string; suppliers: Map<string, number> }>>();

    for (const line of allLines) {
      const cfcKey = line.cfc || "zzz";
      if (!cfcMap.has(cfcKey)) cfcMap.set(cfcKey, new Map());
      const articleMap = cfcMap.get(cfcKey)!;

      const artKey = `${line.desc}::${line.unite}`;
      if (!articleMap.has(artKey)) {
        articleMap.set(artKey, { displayDesc: line.displayDesc, unite: line.unite, suppliers: new Map() });
      }
      const art = articleMap.get(artKey)!;
      // Keep lowest price per supplier
      const existing = art.suppliers.get(line.supplierName);
      if (!existing || line.price < existing) {
        art.suppliers.set(line.supplierName, line.price);
      }
    }

    // Build sections sorted by CFC code
    const result: CfcSection[] = [];
    const sortedCfcs = [...cfcMap.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const cfc of sortedCfcs) {
      const articleMap = cfcMap.get(cfc)!;
      const articles = [...articleMap.entries()]
        .map(([, art]) => ({
          description: art.displayDesc,
          displayDescription: art.displayDesc,
          unite: art.unite,
          suppliers: [...art.suppliers.entries()]
            .map(([name, price]) => ({ name, price }))
            .sort((a, b) => a.price - b.price),
        }))
        .sort((a, b) => a.description.localeCompare(b.description));

      result.push({
        cfc: cfc === "zzz" ? "" : cfc,
        label: cfc === "zzz" ? "Non classifié" : (CFC_LABELS[cfc] || `CFC ${cfc}`),
        articles,
      });
    }

    return result;
  }, [benchmark]);

  const toggleSection = (cfc: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(cfc)) next.delete(cfc);
      else next.add(cfc);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{t("prixTitle")}</h3>
            <p className="mt-1 text-xs text-slate-500">{t("prixDescription")}</p>
          </div>
          <Link
            href="/cantaia-prix"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            {t("viewCantaiaPrix")}
          </Link>
        </div>

        {sections.length === 0 || benchmark.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50">
            <div className="text-center">
              <DollarSign className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-500">{t("noPricesYet")}</p>
              <p className="mt-1 text-xs text-slate-400">{t("pricesWillAppear")}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {sections.map((section) => {
              const isCollapsed = collapsedSections.has(section.cfc || "zzz");
              const totalArticles = section.articles.length;
              return (
                <div key={section.cfc || "zzz"} className="rounded-lg border border-slate-200 overflow-hidden">
                  {/* CFC Section Header */}
                  <button
                    type="button"
                    onClick={() => toggleSection(section.cfc || "zzz")}
                    className="flex w-full items-center gap-3 bg-gray-50 border-l-4 border-blue-500 px-4 py-3 text-left hover:bg-gray-100 transition-colors"
                  >
                    <ChevronRight className={cn(
                      "h-4 w-4 text-slate-400 transition-transform shrink-0",
                      !isCollapsed && "rotate-90"
                    )} />
                    {section.cfc && (
                      <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-medium text-blue-700 shrink-0">
                        CFC {section.cfc}
                      </span>
                    )}
                    <span className="text-sm font-medium text-slate-800">{section.label}</span>
                    <span className="ml-auto text-xs text-slate-400 shrink-0">
                      {totalArticles} article{totalArticles > 1 ? "s" : ""}
                    </span>
                  </button>

                  {/* Articles inside this CFC section */}
                  {!isCollapsed && (
                    <div className="divide-y divide-slate-100">
                      {section.articles.map((article, aIdx) => {
                        const minPrice = article.suppliers.length > 0 ? article.suppliers[0].price : 0;
                        const showBest = article.suppliers.length >= 2;
                        return (
                          <div key={aIdx} className="px-4 py-3">
                            {/* Article header */}
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm font-medium text-slate-800">{article.displayDescription}</span>
                              <span className="text-xs text-slate-400 shrink-0 ml-3">
                                {article.unite} — {article.suppliers.length} fournisseur{article.suppliers.length > 1 ? "s" : ""}
                              </span>
                            </div>
                            {/* Supplier lines */}
                            <div className="space-y-1 pl-2 border-l-2 border-slate-200 ml-1">
                              {article.suppliers.map((sup, sIdx) => {
                                const isBest = sup.price === minPrice && showBest;
                                const overPct = minPrice > 0 ? Math.round(((sup.price - minPrice) / minPrice) * 100) : 0;
                                return (
                                  <div key={sIdx} className="flex items-center gap-3 py-0.5 text-xs">
                                    <span className="w-36 truncate text-slate-600">{sup.name}</span>
                                    <span className="font-mono font-medium text-slate-800">
                                      {sup.price.toFixed(2)} CHF/{article.unite}
                                    </span>
                                    {isBest ? (
                                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                                        ★ Meilleur
                                      </span>
                                    ) : showBest && overPct > 0 ? (
                                      <span className="text-[10px] text-amber-600">+{overPct}%</span>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
