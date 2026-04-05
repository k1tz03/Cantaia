import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS, SAFE_ZONE } from "../design-tokens";
import { CantaiaLogo } from "../components/CantaiaLogo";
import { AnimatedCounter } from "../components/AnimatedCounter";
import { FadeIn } from "../components/FadeIn";

/**
 * Video 1 — "Le Probleme" (15s @ 30fps = 450 frames)
 *
 * Narrative arc:
 * [0-2s]   Dark opening + headline "Chaque semaine sur un chantier suisse..."
 * [2-6s]   3 animated counters slam in: 8h emails, 5h admin, 12h coordination
 * [6-9s]   Total reveal: "25 heures perdues" with red pulse
 * [9-12s]  Pain text: "Pendant ce temps, le chantier avance sans vous."
 * [12-15s] Logo + tagline transition
 */
export const TheProblem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Subtle background pulse
  const bgPulse = interpolate(frame, [180, 270], [0, 0.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bgDeep,
        fontFamily: FONTS.body,
      }}
    >
      {/* Subtle red vignette during total reveal */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 40%, ${COLORS.red}${Math.round(bgPulse * 255)
            .toString(16)
            .padStart(2, "0")} 100%)`,
        }}
      />

      {/* Grid lines background */}
      <AbsoluteFill style={{ opacity: 0.03 }}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: i * 54,
              height: 1,
              background: COLORS.white,
            }}
          />
        ))}
      </AbsoluteFill>

      {/* Content container with safe zones */}
      <div
        style={{
          position: "absolute",
          top: SAFE_ZONE.vertical,
          left: SAFE_ZONE.horizontal,
          right: SAFE_ZONE.horizontal,
          bottom: SAFE_ZONE.vertical,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Scene 1: Opening headline (0-2s, frames 0-60) */}
        <Sequence from={0} durationInFrames={360}>
          <FadeIn delay={0} duration={15} direction="up">
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 42,
                color: COLORS.muted,
                textAlign: "center",
                fontWeight: 500,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                marginBottom: 60,
              }}
            >
              Chaque semaine sur un chantier suisse...
            </div>
          </FadeIn>
        </Sequence>

        {/* Scene 2: Three counters (2-6s, frames 60-180) */}
        <Sequence from={45}>
          <div
            style={{
              display: "flex",
              gap: 120,
              justifyContent: "center",
              alignItems: "flex-start",
              marginBottom: 60,
            }}
          >
            <AnimatedCounter
              from={0}
              to={8}
              startFrame={15}
              duration={30}
              suffix="h"
              label="Emails & relances"
              color={COLORS.amber}
              fontSize={96}
            />
            <AnimatedCounter
              from={0}
              to={5}
              startFrame={30}
              duration={30}
              suffix="h"
              label="Administratif"
              color={COLORS.amber}
              fontSize={96}
            />
            <AnimatedCounter
              from={0}
              to={12}
              startFrame={45}
              duration={30}
              suffix="h"
              label="Coordination"
              color={COLORS.amber}
              fontSize={96}
            />
          </div>
        </Sequence>

        {/* Scene 3: Total reveal (6-9s, frames 180-270) */}
        <Sequence from={180} durationInFrames={270}>
          <TotalReveal />
        </Sequence>

        {/* Scene 4: Pain statement (9-12s, frames 270-360) */}
        <Sequence from={270} durationInFrames={180}>
          <FadeIn delay={0} duration={15} direction="up">
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 36,
                color: COLORS.secondary,
                textAlign: "center",
                maxWidth: 900,
                lineHeight: 1.5,
                fontWeight: 400,
                marginTop: 30,
              }}
            >
              Pendant ce temps,{" "}
              <span style={{ color: COLORS.white, fontWeight: 600 }}>
                le chantier avance sans vous.
              </span>
            </div>
          </FadeIn>
        </Sequence>

        {/* Scene 5: Logo outro (12-15s, frames 360-450) */}
        <Sequence from={360}>
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            <CantaiaLogo size={52} animateIn delay={0} />
            <FadeIn delay={8} duration={10} direction="up">
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 20,
                  color: COLORS.muted,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                L'IA au service du chantier
              </span>
            </FadeIn>
          </div>
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};

const TotalReveal: React.FC = () => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [0, 6, 10], [0.6, 1.08, 1], {
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [0, 6], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Red line expanding
  const lineWidth = interpolate(frame, [8, 25], [0, 400], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          height: 2,
          width: lineWidth,
          background: `linear-gradient(90deg, transparent, ${COLORS.red}, transparent)`,
          marginBottom: 16,
        }}
      />
      <span
        style={{
          fontFamily: FONTS.display,
          fontSize: 120,
          fontWeight: 800,
          color: COLORS.red,
          lineHeight: 1,
          letterSpacing: "-0.04em",
        }}
      >
        25h
      </span>
      <span
        style={{
          fontFamily: FONTS.display,
          fontSize: 32,
          fontWeight: 600,
          color: COLORS.white,
          letterSpacing: "0.02em",
        }}
      >
        perdues chaque semaine
      </span>
    </div>
  );
};
