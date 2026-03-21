"use client";

import React from "react";
import {
  MapPin,
  Truck,
  Percent,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import { PricingConfig, MARGIN_OPTIONS } from "./types";

interface EstimateConfigSectionProps {
  config: PricingConfig;
  setConfig: React.Dispatch<React.SetStateAction<PricingConfig>>;
  scope: "general" | "line_by_line";
  setScope: (scope: "general" | "line_by_line") => void;
  exclusionsText: string;
  setExclusionsText: (text: string) => void;
  context: string;
  setContext: (context: string) => void;
}

export function EstimateConfigSection({
  config,
  setConfig,
  scope,
  setScope,
  exclusionsText,
  setExclusionsText,
  context,
  setContext,
}: EstimateConfigSectionProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">
        Configuration
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Taux horaire */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Taux horaire ouvrier
          </label>
          <div className="relative">
            <input
              type="number"
              value={config.hourly_rate}
              onChange={(e) =>
                setConfig({ ...config, hourly_rate: Number(e.target.value) || 0 })
              }
              className="w-full rounded-md border border-border bg-background py-2 pl-3 pr-14 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              CHF/h
            </span>
          </div>
        </div>

        {/* Lieu du chantier */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            <MapPin className="mr-1 inline h-3 w-3" />
            Lieu du chantier
          </label>
          <input
            type="text"
            value={config.site_location}
            onChange={(e) =>
              setConfig({ ...config, site_location: e.target.value })
            }
            placeholder="ex: Lausanne, VD"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        {/* Lieu de départ */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            <Truck className="mr-1 inline h-3 w-3" />
            Lieu de départ
          </label>
          <input
            type="text"
            value={config.departure_location}
            onChange={(e) =>
              setConfig({ ...config, departure_location: e.target.value })
            }
            placeholder="ex: Bussigny, VD"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      {/* Margin level */}
      <div className="mt-4">
        <label className="mb-2 block text-xs font-medium text-muted-foreground">
          <Percent className="mr-1 inline h-3 w-3" />
          Niveau de marge
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {MARGIN_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                setConfig({ ...config, margin_level: opt.value })
              }
              className={cn(
                "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
                config.margin_level === opt.value
                  ? "border-brand bg-brand/5 text-brand"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {opt.label}
            </button>
          ))}
          {config.margin_level === "custom" && (
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                value={config.custom_margin_percent ?? 15}
                onChange={(e) =>
                  setConfig({ ...config, custom_margin_percent: Number(e.target.value) || 0 })
                }
                className="w-24 rounded-md border border-brand bg-brand/5 py-2 pl-3 pr-7 text-sm font-medium text-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-brand">%</span>
            </div>
          )}
        </div>
      </div>

      {/* Scope toggle */}
      <div className="mt-4">
        <label className="mb-2 block text-xs font-medium text-muted-foreground">
          Périmètre
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setScope("general")}
            className={cn(
              "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
              scope === "general"
                ? "border-brand bg-brand/5 text-brand"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            Estimation globale
          </button>
          <button
            type="button"
            onClick={() => setScope("line_by_line")}
            className={cn(
              "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
              scope === "line_by_line"
                ? "border-brand bg-brand/5 text-brand"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            Chiffrage poste par poste
          </button>
        </div>
      </div>

      {/* Exclusions */}
      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Exclusions
        </label>
        <input
          type="text"
          value={exclusionsText}
          onChange={(e) => setExclusionsText(e.target.value)}
          placeholder="ex: honoraires architecte, mobilier, aménagement extérieur"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Séparez les éléments par des virgules
        </p>
      </div>

      {/* Context textarea */}
      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          À quoi concerne cette demande
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={3}
          placeholder="ex: Rénovation complète d'un immeuble locatif de 12 appartements, 3 étages, construction 1970..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand resize-none"
        />
      </div>
    </div>
  );
}
