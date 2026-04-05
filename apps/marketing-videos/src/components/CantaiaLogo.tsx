import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONTS } from "../design-tokens";

export const CantaiaLogo: React.FC<{
  size?: number;
  showText?: boolean;
  animateIn?: boolean;
  delay?: number;
}> = ({ size = 48, showText = true, animateIn = true, delay = 0 }) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);

  const scale = animateIn ? interpolate(f, [0, 12], [0.5, 1], { extrapolateRight: "clamp" }) : 1;
  const opacity = animateIn ? interpolate(f, [0, 8], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const textOpacity = animateIn
    ? interpolate(f, [6, 16], [0, 1], { extrapolateRight: "clamp" })
    : 1;
  const textX = animateIn ? interpolate(f, [6, 16], [20, 0], { extrapolateRight: "clamp" }) : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.3, opacity }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.22,
          background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.orangeDark})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${scale})`,
          boxShadow: `0 4px 24px ${COLORS.orange}40`,
        }}
      >
        <span
          style={{
            color: "#FFFFFF",
            fontSize: size * 0.55,
            fontWeight: 800,
            fontFamily: FONTS.display,
            lineHeight: 1,
          }}
        >
          C
        </span>
      </div>
      {showText && (
        <span
          style={{
            color: COLORS.white,
            fontSize: size * 0.6,
            fontWeight: 700,
            fontFamily: FONTS.display,
            opacity: textOpacity,
            transform: `translateX(${textX}px)`,
            letterSpacing: "-0.02em",
          }}
        >
          Cantaia
        </span>
      )}
    </div>
  );
};
