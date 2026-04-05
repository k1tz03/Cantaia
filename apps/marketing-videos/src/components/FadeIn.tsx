import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

export const FadeIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
  style?: React.CSSProperties;
}> = ({
  children,
  delay = 0,
  duration = 12,
  direction = "up",
  distance = 40,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);

  const opacity = interpolate(f, [0, duration], [0, 1], {
    extrapolateRight: "clamp",
  });

  const translate = interpolate(f, [0, duration], [distance, 0], {
    extrapolateRight: "clamp",
  });

  const transforms: Record<string, string> = {
    up: `translateY(${translate}px)`,
    down: `translateY(${-translate}px)`,
    left: `translateX(${translate}px)`,
    right: `translateX(${-translate}px)`,
    none: "none",
  };

  return (
    <div
      style={{
        opacity,
        transform: transforms[direction],
        ...style,
      }}
    >
      {children}
    </div>
  );
};
