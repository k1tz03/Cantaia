import type { ReactNode } from "react";

export function Hazard({
  className = "",
  height = "h-[10px]",
}: {
  className?: string;
  height?: string;
}) {
  return (
    <div
      className={`${height} w-full ${className}`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, #0A0A0C 0 8px, #F97316 8px 16px)",
      }}
      aria-hidden
    />
  );
}

export function Crosshair({
  className = "",
  size = 14,
  color = "#F97316",
}: {
  className?: string;
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={className}
      aria-hidden
    >
      <line x1="7" y1="0" x2="7" y2="14" stroke={color} strokeWidth="1" />
      <line x1="0" y1="7" x2="14" y2="7" stroke={color} strokeWidth="1" />
      <circle
        cx="7"
        cy="7"
        r="2.5"
        fill="none"
        stroke={color}
        strokeWidth="1"
      />
    </svg>
  );
}

export function RegMarks({
  className = "",
  blink = true,
}: {
  className?: string;
  blink?: boolean;
}) {
  const positions = [
    "top-4 left-4",
    "top-4 right-4",
    "bottom-4 left-4",
    "bottom-4 right-4",
  ];
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden>
      {positions.map((p) => (
        <div key={p} className={`absolute ${p} ${blink ? "animate-blink-reg" : ""}`}>
          <Crosshair size={14} />
        </div>
      ))}
    </div>
  );
}

export function SitePlacard({
  lot,
  title,
  cfc,
  className = "",
}: {
  lot: string;
  title: string;
  cfc: string;
  className?: string;
}) {
  return (
    <div
      className={`flex w-full items-stretch border border-[#27272A] bg-[#111114] ${className}`}
    >
      <div className="flex items-center border-r border-[#27272A] bg-[#0A0A0C] px-4 py-3">
        <span className="font-tech text-[11px] font-bold tracking-[0.14em] text-[#F97316]">
          {lot}
        </span>
      </div>
      <div className="flex flex-1 items-center px-5 py-3">
        <span className="font-condensed text-[15px] font-700 uppercase tracking-[0.2em] text-[#FAFAFA]">
          {title}
        </span>
      </div>
      <div className="flex items-center border-l border-[#27272A] bg-[#0A0A0C] px-4 py-3">
        <span className="font-tech text-[10px] font-semibold tracking-[0.18em] text-[#A1A1AA]">
          {cfc}
        </span>
      </div>
    </div>
  );
}

export function MetricTag({
  code,
  value,
  label,
  unit,
  source,
  active = false,
  className = "",
}: {
  code: string;
  value: string;
  label: string;
  unit?: string;
  source?: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`group relative border bg-[#0A0A0C] px-5 py-5 transition-colors ${
        active
          ? "border-[#F97316] shadow-[0_0_0_1px_#F97316_inset]"
          : "border-[#27272A] hover:border-[#F97316]/60"
      } ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-tech text-[10px] font-bold tracking-[0.22em] text-[#F97316]">
          {code}
        </span>
        {source && (
          <span className="font-tech text-[9px] tracking-[0.18em] text-[#52525B]">
            {source}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-condensed text-[46px] font-900 leading-[0.9] tracking-[-0.02em] text-[#FAFAFA]">
          {value}
        </span>
        {unit && (
          <span className="font-tech text-[12px] font-semibold tracking-[0.08em] text-[#A1A1AA]">
            {unit}
          </span>
        )}
      </div>
      <div className="mt-3 font-condensed text-[12px] font-600 uppercase tracking-[0.14em] text-[#A1A1AA]">
        {label}
      </div>
    </div>
  );
}

export function SiteStamp({
  number,
  subtitle,
  className = "",
}: {
  number: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden>
      <div
        className="font-condensed font-900 leading-[0.85] tracking-[-0.04em]"
        style={{
          fontSize: "clamp(140px, 22vw, 340px)",
          color: "transparent",
          WebkitTextStroke: "1px rgba(249,115,22,0.22)",
        }}
      >
        {number}
      </div>
      {subtitle && (
        <div className="mt-2 font-tech text-[11px] font-semibold tracking-[0.3em] text-[#52525B]">
          {subtitle}
        </div>
      )}
    </div>
  );
}

export function SceneLabel({
  code,
  value,
  x,
  y,
  leader = "right",
}: {
  code: string;
  value: string;
  x: string;
  y: string;
  leader?: "left" | "right";
}) {
  return (
    <div
      className="pointer-events-none absolute flex items-center gap-2 font-tech text-[10px] tracking-[0.14em]"
      style={{ left: x, top: y }}
      aria-hidden
    >
      {leader === "left" && (
        <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#F97316]" />
      )}
      <div className="border border-[#F97316] bg-[#0A0A0C]/90 px-2 py-1 backdrop-blur-sm">
        <span className="font-bold text-[#F97316]">{code}</span>
        <span className="mx-1.5 text-[#3F3F46]">·</span>
        <span className="text-[#FAFAFA]">{value}</span>
      </div>
      {leader === "right" && (
        <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#F97316]" />
      )}
    </div>
  );
}

export function SectionHeader({
  step,
  title,
  caption,
  className = "",
}: {
  step: string;
  title: string;
  caption?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-6 ${className}`}>
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#F97316] bg-[#0A0A0C] font-tech text-[11px] font-bold tracking-[0.14em] text-[#F97316]">
          {step}
        </div>
        <div>
          <h2 className="font-condensed text-[44px] font-900 uppercase leading-[0.92] tracking-[-0.01em] text-[#FAFAFA] sm:text-[56px]">
            {title}
          </h2>
          {caption && (
            <p className="mt-3 max-w-[560px] font-sans text-[15px] leading-relaxed text-[#A1A1AA]">
              {caption}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function FicheRow({
  k,
  v,
  accent = false,
}: {
  k: string;
  v: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-3 border-b border-dashed border-[#27272A] py-2.5 last:border-b-0">
      <span className="font-tech text-[10px] font-semibold uppercase tracking-[0.18em] text-[#52525B]">
        {k}
      </span>
      <span
        className={`font-tech text-[12px] ${
          accent ? "text-[#F97316]" : "text-[#FAFAFA]"
        }`}
      >
        {v}
      </span>
    </div>
  );
}

export function ChantierButton({
  children,
  variant = "primary",
  href,
  onClick,
  className = "",
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  variant?: "primary" | "ghost";
  href?: string;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const base =
    "group relative inline-flex items-center gap-3 overflow-hidden px-6 py-3.5 font-condensed text-[13px] font-800 uppercase tracking-[0.22em] transition-all disabled:opacity-50";
  const variants = {
    primary:
      "border border-[#F97316] bg-[#F97316] text-[#0A0A0C] hover:bg-[#EA580C] hover:border-[#EA580C]",
    ghost:
      "border border-[#27272A] bg-transparent text-[#FAFAFA] hover:border-[#F97316] hover:text-[#F97316]",
  };
  const cls = `${base} ${variants[variant]} ${className}`;

  const content = (
    <>
      <span>{children}</span>
      <span className="font-tech text-[11px] opacity-70">→</span>
    </>
  );

  if (href) {
    return (
      <a href={href} className={cls}>
        {content}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {content}
    </button>
  );
}
