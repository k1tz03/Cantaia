import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONTS } from "../design-tokens";

/** Module card used in the Solution video to showcase features */
export const ModuleCard: React.FC<{
  icon: string;
  title: string;
  description: string;
  delay: number;
  accentColor?: string;
}> = ({ icon, title, description, delay, accentColor = COLORS.orange }) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);

  const opacity = interpolate(f, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(f, [0, 10], [0.85, 1], { extrapolateRight: "clamp" });
  const y = interpolate(f, [0, 10], [20, 0], { extrapolateRight: "clamp" });

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale}) translateY(${y}px)`,
        background: COLORS.bgCard,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: "28px 32px",
        display: "flex",
        alignItems: "center",
        gap: 24,
        width: 520,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: `${accentColor}15`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 22,
            fontWeight: 700,
            color: COLORS.white,
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontFamily: FONTS.body,
            fontSize: 15,
            color: COLORS.secondary,
            lineHeight: 1.4,
          }}
        >
          {description}
        </span>
      </div>
    </div>
  );
};
