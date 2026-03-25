"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Mail, BarChart3, CalendarRange, MessageSquare } from "lucide-react";

interface FeatureCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  animationType: "mail" | "submissions" | "planning" | "chat";
  isActive: boolean;
}

function MailAnimation({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex h-full items-center justify-center gap-4">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3B82F6]/20"
          initial={{ x: 60, opacity: 0 }}
          animate={isActive ? { x: 0, opacity: 1 } : { x: 60, opacity: 0 }}
          transition={{ delay: i * 0.2, duration: 0.5 }}
        >
          <Mail className="h-5 w-5 text-[#3B82F6]" />
        </motion.div>
      ))}
      <motion.div
        className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F97316]/20"
        initial={{ scale: 0 }}
        animate={isActive ? { scale: 1 } : { scale: 0 }}
        transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
      >
        <div className="h-6 w-6 rounded-md bg-[#F97316]" />
      </motion.div>
    </div>
  );
}

function SubmissionsAnimation({ isActive }: { isActive: boolean }) {
  const widths = [85, 65, 92, 48];
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-4">
      {widths.map((w, i) => (
        <motion.div
          key={i}
          className="h-3 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C]"
          initial={{ width: 0 }}
          animate={isActive ? { width: `${w}%` } : { width: 0 }}
          transition={{ delay: i * 0.15, duration: 0.6, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

function PlanningAnimation({ isActive }: { isActive: boolean }) {
  const bars = [
    { color: "#3B82F6", width: 70, offset: 0 },
    { color: "#F97316", width: 55, offset: 20 },
    { color: "#10B981", width: 80, offset: 10 },
    { color: "#F59E0B", width: 45, offset: 35 },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-2.5 px-4">
      {bars.map((bar, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-12 text-right text-[10px] text-[#71717A]">T{i + 1}</div>
          <div className="flex-1">
            <motion.div
              className="h-4 rounded"
              style={{
                backgroundColor: bar.color,
                marginLeft: `${bar.offset}%`,
              }}
              initial={{ width: 0 }}
              animate={isActive ? { width: `${bar.width}%` } : { width: 0 }}
              transition={{ delay: i * 0.2, duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatAnimation({ isActive }: { isActive: boolean }) {
  const messages = [
    { align: "left" as const, width: "w-32" },
    { align: "right" as const, width: "w-28" },
    { align: "left" as const, width: "w-36" },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-4">
      {messages.map((msg, i) => (
        <motion.div
          key={i}
          className={`flex ${msg.align === "right" ? "justify-end" : "justify-start"}`}
          initial={{ scale: 0, opacity: 0 }}
          animate={isActive ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={{ delay: i * 0.3, type: "spring", stiffness: 300, damping: 20 }}
        >
          <div
            className={`${msg.width} h-8 rounded-xl ${
              msg.align === "right"
                ? "rounded-br-sm bg-[#F97316]/20"
                : "rounded-bl-sm bg-[#27272A]"
            }`}
          />
        </motion.div>
      ))}
    </div>
  );
}

const ANIMATION_MAP = {
  mail: MailAnimation,
  submissions: SubmissionsAnimation,
  planning: PlanningAnimation,
  chat: ChatAnimation,
};

// Icon map to suppress unused import warnings; icons come in through props
const _iconRef = { Mail, BarChart3, CalendarRange, MessageSquare };
void _iconRef;

export function FeatureCard({
  title,
  description,
  icon: Icon,
  animationType,
  isActive,
}: FeatureCardProps) {
  const AnimationComponent = ANIMATION_MAP[animationType];

  return (
    <div className="min-w-[280px] overflow-hidden rounded-xl border border-[#27272A] bg-[#18181B]">
      <div className="h-[200px] border-b border-[#27272A] bg-[#0F0F11]">
        <AnimationComponent isActive={isActive} />
      </div>
      <div className="p-6">
        <div className="mb-2 flex items-center gap-2">
          <Icon className="h-5 w-5 text-[#F97316]" />
          <h3 className="font-display font-semibold text-[#FAFAFA]">{title}</h3>
        </div>
        <p className="text-sm text-[#A1A1AA]">{description}</p>
      </div>
    </div>
  );
}
