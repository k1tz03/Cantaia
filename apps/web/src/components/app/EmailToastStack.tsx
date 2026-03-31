"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { X, Mail, AlertTriangle } from "lucide-react";

export interface EmailToast {
  id: string;
  senderName: string;
  subject: string;
  preview: string;
  classification?: string;
}

interface Props {
  toasts: EmailToast[];
  onDismiss: (id: string) => void;
}

// Génère des initiales et une couleur déterministe depuis le nom
function getAvatar(name: string): { initials: string; color: string } {
  const colors = [
    "linear-gradient(135deg,#F97316,#EA580C)",
    "linear-gradient(135deg,#3B82F6,#2563EB)",
    "linear-gradient(135deg,#10B981,#059669)",
    "linear-gradient(135deg,#8B5CF6,#7C3AED)",
    "linear-gradient(135deg,#EC4899,#DB2777)",
  ];
  const words = name.trim().split(/\s+/);
  const initials = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  const colorIndex = name.charCodeAt(0) % colors.length;
  return { initials, color: colors[colorIndex] };
}

// Un toast individuel avec auto-dismiss
function EmailToastItem({
  toast,
  index,
  total,
  onDismiss,
  onOpen,
}: {
  toast: EmailToast;
  index: number; // 0 = premier plan, 1+ = derrière
  total: number;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUrgent =
    toast.classification === "urgent" || toast.classification === "action_required";
  const { initials, color } = getAvatar(toast.senderName);

  // Auto-dismiss après 7s pour le toast de premier plan
  useEffect(() => {
    if (index !== 0) return;
    timerRef.current = setTimeout(onDismiss, 7000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [index, onDismiss]);

  const depthStyle: React.CSSProperties =
    index === 0
      ? { position: "relative", zIndex: 30, transform: "translateY(0) scale(1)", opacity: 1 }
      : index === 1
      ? { position: "absolute", top: 8, left: 0, right: 0, zIndex: 20, transform: "scale(0.97)", opacity: 0.7, pointerEvents: "none" }
      : { position: "absolute", top: 14, left: 0, right: 0, zIndex: 10, transform: "scale(0.94)", opacity: 0.4, pointerEvents: "none" };

  return (
    <div
      style={depthStyle}
      className={[
        "w-full rounded-xl border bg-[#1C1C1F] px-4 py-3",
        "shadow-[0_8px_32px_rgba(0,0,0,0.6)]",
        "transition-all duration-300 ease-out",
        isUrgent
          ? "border-red-500/50 shadow-red-500/10"
          : "border-[#3F3F46] hover:border-[#F97316]/60",
        index === 0 ? "cursor-pointer" : "",
      ].join(" ")}
      onClick={index === 0 ? onOpen : undefined}
    >
      <div className="flex gap-3 items-start">
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: isUrgent ? "linear-gradient(135deg,#EF4444,#DC2626)" : color }}
        >
          {initials}
        </div>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[13px] font-semibold text-[#FAFAFA] truncate">
              {toast.senderName}
            </span>
            {isUrgent && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 flex-shrink-0">
                <AlertTriangle className="w-3 h-3" />
                URGENT
              </span>
            )}
          </div>
          <p className="text-[12px] text-[#A1A1AA] mt-0.5 truncate font-medium">
            {toast.subject}
          </p>
          {toast.preview && (
            <p className="text-[11px] text-[#71717A] mt-1 line-clamp-2 leading-relaxed">
              {toast.preview}
            </p>
          )}

          {/* Actions */}
          {index === 0 && (
            <div className="flex gap-2 mt-2.5">
              <button
                onClick={(e) => { e.stopPropagation(); onOpen(); }}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-[#F97316] text-white hover:bg-[#EA580C] transition-colors"
              >
                <Mail className="w-3 h-3" />
                Ouvrir
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-[#27272A] text-[#A1A1AA] hover:bg-[#3F3F46] hover:text-[#FAFAFA] transition-colors"
              >
                Ignorer
              </button>
            </div>
          )}
        </div>

        {/* Fermer */}
        {index === 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="flex-shrink-0 w-5 h-5 rounded-full bg-[#27272A] hover:bg-[#3F3F46] flex items-center justify-center transition-colors"
          >
            <X className="w-3 h-3 text-[#71717A]" />
          </button>
        )}
      </div>

      {/* Badge empilé si plusieurs */}
      {index === 0 && total > 1 && (
        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#F97316] text-white text-[10px] font-bold flex items-center justify-center shadow-lg shadow-orange-500/30">
          {total}
        </div>
      )}
    </div>
  );
}

// ─── Stack ────────────────────────────────────────────────────────────────────

export function EmailToastStack({ toasts, onDismiss }: Props) {
  const router = useRouter();
  const locale = useLocale();

  if (toasts.length === 0) return null;

  const visible = toasts.slice(0, 3); // Max 3 cartes visibles

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] w-[340px]"
      style={{ minHeight: visible.length > 1 ? "120px" : undefined }}
    >
      <div className="relative">
        {visible.map((toast, index) => (
          <EmailToastItem
            key={toast.id}
            toast={toast}
            index={index}
            total={toasts.length}
            onDismiss={() => onDismiss(toast.id)}
            onOpen={() => {
              onDismiss(toast.id);
              // Bulk summary toasts (id starts with "bulk-") navigate to /mail without emailId
              const isBulk = toast.id.startsWith("bulk-");
              router.push(isBulk ? `/${locale}/mail` : `/${locale}/mail?emailId=${toast.id}`);
            }}
          />
        ))}
      </div>
    </div>
  );
}
