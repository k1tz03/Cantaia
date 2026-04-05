import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONTS } from "../design-tokens";

export const Tagline: React.FC<{
  text: string;
  delay?: number;
  fontSize?: number;
  color?: string;
}> = ({ text, delay = 0, fontSize = 24, color = COLORS.secondary }) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);

  const opacity = interpolate(f, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(f, [0, 10], [15, 0], { extrapolateRight: "clamp" });

  return (
    <div
      style={{
        fontFamily: FONTS.body,
        fontSize,
        color,
        opacity,
        transform: `translateY(${y}px)`,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontWeight: 500,
      }}
    >
      {text}
    </div>
  );
};
