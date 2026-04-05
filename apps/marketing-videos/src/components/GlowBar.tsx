import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS } from "../design-tokens";

/** Horizontal progress bar with orange glow, used across videos */
export const GlowBar: React.FC<{
  progress: number;
  startFrame: number;
  width?: number;
  height?: number;
  color?: string;
}> = ({ progress, startFrame, width = 600, height = 6, color = COLORS.orange }) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - startFrame);

  const currentProgress = interpolate(f, [0, 30], [0, progress], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        width,
        height,
        borderRadius: height / 2,
        background: COLORS.bgElevated,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          width: `${currentProgress * 100}%`,
          height: "100%",
          borderRadius: height / 2,
          background: `linear-gradient(90deg, ${color}, ${COLORS.orangeDark})`,
          boxShadow: `0 0 20px ${color}60`,
        }}
      />
    </div>
  );
};
