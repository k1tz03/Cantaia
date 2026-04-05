import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONTS } from "../design-tokens";

export const AnimatedCounter: React.FC<{
  from: number;
  to: number;
  startFrame: number;
  duration: number;
  suffix?: string;
  prefix?: string;
  label: string;
  color?: string;
  fontSize?: number;
  decimals?: number;
}> = ({
  from,
  to,
  startFrame,
  duration,
  suffix = "",
  prefix = "",
  label,
  color = COLORS.orange,
  fontSize = 72,
  decimals = 0,
}) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - startFrame);

  const value = interpolate(f, [0, duration], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = interpolate(f, [0, 6], [0, 1], { extrapolateRight: "clamp" });
  const labelOpacity = interpolate(f, [4, 12], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(f, [0, 10], [30, 0], { extrapolateRight: "clamp" });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      <span
        style={{
          fontFamily: FONTS.display,
          fontSize,
          fontWeight: 800,
          color,
          lineHeight: 1,
          letterSpacing: "-0.03em",
        }}
      >
        {prefix}
        {value.toFixed(decimals)}
        {suffix}
      </span>
      <span
        style={{
          fontFamily: FONTS.body,
          fontSize: fontSize * 0.28,
          color: COLORS.secondary,
          opacity: labelOpacity,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
    </div>
  );
};
