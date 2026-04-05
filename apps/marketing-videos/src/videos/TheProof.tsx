import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { COLORS, FONTS, SAFE_ZONE } from "../design-tokens";
import { CantaiaLogo } from "../components/CantaiaLogo";
import { AnimatedCounter } from "../components/AnimatedCounter";
import { FadeIn } from "../components/FadeIn";
import { GlowBar } from "../components/GlowBar";

/**
 * Video 3 — "La Preuve" (20s @ 30fps = 600 frames)
 *
 * Narrative arc:
 * [0-3s]    "Avant Cantaia" — dark, chaotic metrics
 * [3-6s]    Transition wipe: orange line sweep
 * [6-12s]   "Après Cantaia" — bright stats with counters
 * [12-16s]  Key metrics: 11 modules, 3 IA, 2h/jour saved
 * [16-20s]  Logo + "100% Suisse" badge + CTA
 */
export const TheProof: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeep, fontFamily: FONTS.body }}>
      {/* Scene 1: "Avant" (0-3s, frames 0-90) */}
      <Sequence from={0} durationInFrames={180}>
        <BeforeScene />
      </Sequence>

      {/* Scene 2: Orange wipe transition (3-6s, frames 90-180) */}
      <Sequence from={90} durationInFrames={90}>
        <OrangeWipe />
      </Sequence>

      {/* Scene 3: "Après" stats (6-12s, frames 180-360) */}
      <Sequence from={180} durationInFrames={180}>
        <AfterScene />
      </Sequence>

      {/* Scene 4: Key metrics (12-16s, frames 360-480) */}
      <Sequence from={360} durationInFrames={120}>
        <KeyMetrics />
      </Sequence>

      {/* Scene 5: CTA (16-20s, frames 480-600) */}
      <Sequence from={480}>
        <CTAScene />
      </Sequence>
    </AbsoluteFill>
  );
};

const BeforeScene: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [75, 90], [1, 0], { extrapolateRight: "clamp" });

  const items = [
    { label: "Emails non traités", value: "127", icon: "📧" },
    { label: "Retard planning", value: "+3 sem.", icon: "⏰" },
    { label: "PV en attente", value: "8", icon: "📝" },
    { label: "Relances oubliées", value: "23", icon: "🔔" },
  ];

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 40,
        opacity: opacity * fadeOut,
        padding: SAFE_ZONE.horizontal,
      }}
    >
      <FadeIn delay={0} duration={10} direction="none">
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 18,
            color: COLORS.red,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            fontWeight: 700,
          }}
        >
          Avant Cantaia
        </div>
      </FadeIn>

      <div style={{ display: "flex", gap: 40 }}>
        {items.map((item, i) => (
          <FadeIn key={item.label} delay={8 + i * 6} duration={10} direction="up">
            <div
              style={{
                background: COLORS.bgCard,
                border: `1px solid ${COLORS.red}30`,
                borderRadius: 16,
                padding: "28px 36px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                width: 220,
              }}
            >
              <span style={{ fontSize: 36 }}>{item.icon}</span>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 36,
                  fontWeight: 800,
                  color: COLORS.red,
                }}
              >
                {item.value}
              </span>
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 14,
                  color: COLORS.muted,
                  textAlign: "center",
                }}
              >
                {item.label}
              </span>
            </div>
          </FadeIn>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const OrangeWipe: React.FC = () => {
  const frame = useCurrentFrame();

  const wipeX = interpolate(frame, [0, 30], [-200, 2200], {
    extrapolateRight: "clamp",
  });

  const glow = interpolate(frame, [0, 15, 30], [0, 1, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      {/* Wipe line */}
      <div
        style={{
          position: "absolute",
          left: wipeX - 100,
          top: 0,
          width: 200,
          height: "100%",
          background: `linear-gradient(90deg, transparent, ${COLORS.orange}80, ${COLORS.orange}, ${COLORS.orange}80, transparent)`,
          filter: "blur(2px)",
        }}
      />
      {/* Flash overlay */}
      <AbsoluteFill
        style={{
          background: COLORS.orange,
          opacity: glow * 0.1,
        }}
      />
    </AbsoluteFill>
  );
};

const AfterScene: React.FC = () => {
  const frame = useCurrentFrame();

  const items = [
    { label: "Emails classés automatiquement", before: "127 non traités", after: "100%", color: COLORS.green },
    { label: "Planning respecté", before: "+3 sem. retard", after: "À jour", color: COLORS.green },
    { label: "PV générés en 1 clic", before: "8 en attente", after: "Instantané", color: COLORS.blue },
    { label: "Relances automatiques", before: "23 oubliées", after: "0 oubli", color: COLORS.orange },
  ];

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 40,
        padding: SAFE_ZONE.horizontal,
      }}
    >
      <FadeIn delay={0} duration={10} direction="none">
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 18,
            color: COLORS.green,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            fontWeight: 700,
          }}
        >
          Avec Cantaia
        </div>
      </FadeIn>

      <div style={{ display: "flex", gap: 32 }}>
        {items.map((item, i) => (
          <FadeIn key={item.label} delay={8 + i * 8} duration={12} direction="up">
            <div
              style={{
                background: COLORS.bgCard,
                border: `1px solid ${item.color}30`,
                borderRadius: 16,
                padding: "28px 32px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                width: 240,
              }}
            >
              {/* Before (crossed out) */}
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 14,
                  color: COLORS.faint,
                  textDecoration: "line-through",
                }}
              >
                {item.before}
              </span>

              {/* Arrow */}
              <span style={{ fontSize: 20, color: COLORS.muted }}>↓</span>

              {/* After (highlighted) */}
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 32,
                  fontWeight: 800,
                  color: item.color,
                }}
              >
                {item.after}
              </span>

              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  color: COLORS.secondary,
                  textAlign: "center",
                  lineHeight: 1.4,
                }}
              >
                {item.label}
              </span>
            </div>
          </FadeIn>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const KeyMetrics: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 48,
        padding: SAFE_ZONE.horizontal,
      }}
    >
      <FadeIn delay={0} duration={10} direction="up">
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 40,
            fontWeight: 700,
            color: COLORS.white,
            textAlign: "center",
          }}
        >
          Une plateforme.{" "}
          <span style={{ color: COLORS.orange }}>Tout intégré.</span>
        </div>
      </FadeIn>

      <div style={{ display: "flex", gap: 100 }}>
        <AnimatedCounter
          from={0}
          to={11}
          startFrame={10}
          duration={25}
          label="Modules"
          color={COLORS.orange}
          fontSize={80}
        />
        <AnimatedCounter
          from={0}
          to={3}
          startFrame={18}
          duration={20}
          label="Moteurs IA"
          color={COLORS.blue}
          fontSize={80}
        />
        <AnimatedCounter
          from={0}
          to={2}
          startFrame={26}
          duration={20}
          suffix="h"
          label="Gagnées / jour"
          color={COLORS.green}
          fontSize={80}
        />
      </div>

      {/* Progress bar filling to 100% */}
      <GlowBar progress={1} startFrame={15} width={800} height={6} />
    </AbsoluteFill>
  );
};

const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 24,
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COLORS.orange}12, transparent 70%)`,
          filter: "blur(60px)",
        }}
      />

      <CantaiaLogo size={60} animateIn />

      <FadeIn delay={10} duration={12} direction="up">
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 52,
            fontWeight: 800,
            color: COLORS.white,
            textAlign: "center",
            lineHeight: 1.3,
          }}
        >
          Prêt à gagner{" "}
          <span style={{ color: COLORS.orange }}>2 heures</span>
          <br />
          par jour ?
        </div>
      </FadeIn>

      <FadeIn delay={18} duration={10} direction="up">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 8,
          }}
        >
          {/* Swiss badge */}
          <div
            style={{
              background: `${COLORS.red}15`,
              border: `1px solid ${COLORS.red}30`,
              borderRadius: 8,
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>🇨🇭</span>
            <span
              style={{
                fontFamily: FONTS.body,
                fontSize: 14,
                color: COLORS.white,
                fontWeight: 600,
              }}
            >
              Conçu en Suisse
            </span>
          </div>

          {/* CTA pill */}
          <div
            style={{
              background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.orangeDark})`,
              borderRadius: 40,
              padding: "12px 36px",
              boxShadow: `0 4px 24px ${COLORS.orange}40`,
            }}
          >
            <span
              style={{
                fontFamily: FONTS.display,
                fontSize: 20,
                color: "#FFFFFF",
                fontWeight: 700,
              }}
            >
              cantaia.io
            </span>
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={24} duration={10} direction="up">
        <span
          style={{
            fontFamily: FONTS.body,
            fontSize: 18,
            color: COLORS.muted,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginTop: 8,
          }}
        >
          L'IA au service du chantier
        </span>
      </FadeIn>
    </AbsoluteFill>
  );
};
