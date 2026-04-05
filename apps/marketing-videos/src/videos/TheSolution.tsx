import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { COLORS, FONTS, SAFE_ZONE } from "../design-tokens";
import { CantaiaLogo } from "../components/CantaiaLogo";
import { FadeIn } from "../components/FadeIn";
import { ModuleCard } from "../components/ModuleCard";
import { GlowBar } from "../components/GlowBar";

/**
 * Video 2 — "La Solution" (30s @ 30fps = 900 frames)
 *
 * Narrative arc:
 * [0-3s]    Logo + "Et si votre IA gérait tout ça ?"
 * [3-8s]    Module group 1: Mail + Soumissions + Planning (fast-cut cards)
 * [8-13s]   Module group 2: PV + Plans + Prix (fast-cut cards)
 * [13-18s]  Module group 3: Portail + Rapports + Chat IA (fast-cut cards)
 * [18-22s]  Module group 4: Direction + Table Ronde IA
 * [22-26s]  Full dashboard mockup reveal with glow
 * [26-30s]  CTA: "Essayez Cantaia" + tagline
 */

const MODULES = [
  // Group 1 — Communication & Planning
  { icon: "📧", title: "Cantaia Mail", desc: "Sync Outlook + classification IA automatique", color: COLORS.blue },
  { icon: "📋", title: "Soumissions", desc: "Appels d'offres et comparaison fournisseurs", color: COLORS.orange },
  { icon: "📅", title: "Planning IA", desc: "Gantt auto-généré depuis vos soumissions", color: COLORS.green },

  // Group 2 — Documentation
  { icon: "📝", title: "PV de Chantier", desc: "Transcription audio → PV structuré", color: COLORS.amber },
  { icon: "🗺️", title: "Plans", desc: "Registre + analyse Vision IA multi-modèle", color: COLORS.blue },
  { icon: "💰", title: "Prix", desc: "Intelligence prix et chiffrage IA", color: COLORS.green },

  // Group 3 — Terrain
  { icon: "👷", title: "Portail Terrain", desc: "Rapports journaliers PIN, mobile-first", color: COLORS.orange },
  { icon: "📊", title: "Rapports", desc: "Heures et bons centralisés pour assistantes", color: COLORS.amber },
  { icon: "🤖", title: "Chat IA", desc: "Assistant contextuel Claude pour vos projets", color: COLORS.blue },

  // Group 4 — Direction
  { icon: "🏢", title: "Direction", desc: "Rentabilité org, KPIs, marge par projet", color: COLORS.green },
  { icon: "🧠", title: "Table Ronde IA", desc: "Claude × GPT × Gemini en discussion autonome", color: COLORS.orange },
];

export const TheSolution: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeep, fontFamily: FONTS.body }}>
      {/* Animated gradient background */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 30% 50%, ${COLORS.orange}08 0%, transparent 60%)`,
        }}
      />

      {/* Dot grid */}
      <AbsoluteFill style={{ opacity: 0.04 }}>
        {Array.from({ length: 400 }).map((_, i) => {
          const col = i % 20;
          const row = Math.floor(i / 20);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: col * 96,
                top: row * 54,
                width: 2,
                height: 2,
                borderRadius: 1,
                background: COLORS.white,
              }}
            />
          );
        })}
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          top: SAFE_ZONE.vertical,
          left: SAFE_ZONE.horizontal,
          right: SAFE_ZONE.horizontal,
          bottom: SAFE_ZONE.vertical,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Scene 1: Opening (0-3s, frames 0-90) */}
        <Sequence from={0} durationInFrames={90}>
          <AbsoluteFill
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: 32,
            }}
          >
            <CantaiaLogo size={64} animateIn />
            <FadeIn delay={15} duration={12} direction="up">
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 52,
                  color: COLORS.white,
                  fontWeight: 700,
                  textAlign: "center",
                  lineHeight: 1.3,
                }}
              >
                Et si votre{" "}
                <span style={{ color: COLORS.orange }}>IA</span>
                <br />
                gérait tout ça ?
              </div>
            </FadeIn>
          </AbsoluteFill>
        </Sequence>

        {/* Scene 2-5: Module groups (3-22s) — fast-cut carousel */}
        {/* Group 1: frames 90-240 */}
        <Sequence from={90} durationInFrames={150}>
          <ModuleGroup
            modules={MODULES.slice(0, 3)}
            groupLabel="Communication & Planification"
            groupIndex={0}
          />
        </Sequence>

        {/* Group 2: frames 240-390 */}
        <Sequence from={240} durationInFrames={150}>
          <ModuleGroup
            modules={MODULES.slice(3, 6)}
            groupLabel="Documentation & Analyse"
            groupIndex={1}
          />
        </Sequence>

        {/* Group 3: frames 390-540 */}
        <Sequence from={390} durationInFrames={150}>
          <ModuleGroup
            modules={MODULES.slice(6, 9)}
            groupLabel="Terrain & Assistance"
            groupIndex={2}
          />
        </Sequence>

        {/* Group 4: frames 540-660 */}
        <Sequence from={540} durationInFrames={120}>
          <ModuleGroup
            modules={MODULES.slice(9, 11)}
            groupLabel="Direction & Intelligence"
            groupIndex={3}
          />
        </Sequence>

        {/* Scene 6: Dashboard reveal (22-26s, frames 660-780) */}
        <Sequence from={660} durationInFrames={120}>
          <DashboardReveal />
        </Sequence>

        {/* Scene 7: CTA (26-30s, frames 780-900) */}
        <Sequence from={780}>
          <AbsoluteFill
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: 28,
            }}
          >
            <CantaiaLogo size={56} animateIn />
            <FadeIn delay={8} duration={12} direction="up">
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 56,
                  fontWeight: 800,
                  color: COLORS.white,
                  textAlign: "center",
                }}
              >
                Essayez{" "}
                <span
                  style={{
                    background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.orangeDark})`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  Cantaia
                </span>
              </div>
            </FadeIn>
            <FadeIn delay={16} duration={10} direction="up">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: `${COLORS.orange}15`,
                  border: `1px solid ${COLORS.orange}40`,
                  borderRadius: 40,
                  padding: "14px 40px",
                }}
              >
                <span
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 22,
                    color: COLORS.orange,
                    fontWeight: 600,
                  }}
                >
                  cantaia.io
                </span>
              </div>
            </FadeIn>
            <FadeIn delay={22} duration={10} direction="up">
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 18,
                  color: COLORS.muted,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                L'IA au service du chantier
              </span>
            </FadeIn>
          </AbsoluteFill>
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};

const ModuleGroup: React.FC<{
  modules: typeof MODULES;
  groupLabel: string;
  groupIndex: number;
}> = ({ modules, groupLabel, groupIndex }) => {
  const frame = useCurrentFrame();

  // Group label fade
  const labelOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Module number badge
  const badgeText = `${groupIndex * 3 + 1}-${groupIndex * 3 + modules.length} / 11`;

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
      {/* Group header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 12,
          opacity: labelOpacity,
        }}
      >
        <span
          style={{
            fontFamily: FONTS.body,
            fontSize: 14,
            color: COLORS.orange,
            background: `${COLORS.orange}15`,
            border: `1px solid ${COLORS.orange}30`,
            borderRadius: 20,
            padding: "4px 14px",
            fontWeight: 600,
          }}
        >
          {badgeText}
        </span>
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 20,
            color: COLORS.secondary,
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {groupLabel}
        </span>
      </div>

      {/* Module cards — staggered */}
      {modules.map((mod, i) => (
        <ModuleCard
          key={mod.title}
          icon={mod.icon}
          title={mod.title}
          description={mod.desc}
          delay={10 + i * 15}
          accentColor={mod.color}
        />
      ))}

      {/* Progress bar */}
      <div style={{ marginTop: 16 }}>
        <GlowBar
          progress={(groupIndex * 3 + modules.length) / 11}
          startFrame={10}
          width={520}
          height={4}
        />
      </div>
    </AbsoluteFill>
  );
};

const DashboardReveal: React.FC = () => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [0, 20], [0.9, 1], {
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });
  const glowOpacity = interpolate(frame, [10, 30, 90, 120], [0, 0.6, 0.6, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Glow behind dashboard */}
      <div
        style={{
          position: "absolute",
          width: 1000,
          height: 600,
          borderRadius: 24,
          background: `radial-gradient(ellipse, ${COLORS.orange}30, transparent 70%)`,
          opacity: glowOpacity,
          filter: "blur(40px)",
        }}
      />

      {/* Dashboard mockup frame */}
      <div
        style={{
          opacity,
          transform: `scale(${scale})`,
          width: 1100,
          height: 650,
          background: COLORS.bgBase,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: `0 0 80px ${COLORS.orange}15`,
          display: "flex",
        }}
      >
        {/* Sidebar mock */}
        <div
          style={{
            width: 200,
            background: COLORS.bgCard,
            borderRight: `1px solid ${COLORS.border}`,
            padding: "24px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <CantaiaLogo size={28} animateIn={false} />
          </div>
          {["Mail", "Projets", "Soumissions", "Plans", "Planning", "Chat IA", "Direction"].map(
            (item, i) => (
              <div
                key={item}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: i === 0 ? `${COLORS.orange}15` : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: i === 0 ? COLORS.orange : COLORS.faint,
                  }}
                />
                <span
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 13,
                    color: i === 0 ? COLORS.orange : COLORS.secondary,
                    fontWeight: i === 0 ? 600 : 400,
                  }}
                >
                  {item}
                </span>
              </div>
            )
          )}
        </div>

        {/* Main content mock */}
        <div style={{ flex: 1, padding: 32, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span
              style={{
                fontFamily: FONTS.display,
                fontSize: 22,
                fontWeight: 700,
                color: COLORS.white,
              }}
            >
              Tableau de bord
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.orangeDark})`,
              }}
            />
          </div>

          {/* KPI cards */}
          <div style={{ display: "flex", gap: 16 }}>
            {[
              { label: "Projets actifs", value: "12", color: COLORS.blue },
              { label: "Emails traités", value: "847", color: COLORS.green },
              { label: "Heures gagnées", value: "156h", color: COLORS.orange },
              { label: "Marge moyenne", value: "18.4%", color: COLORS.amber },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  flex: 1,
                  background: COLORS.bgElevated,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  padding: "16px 18px",
                }}
              >
                <div
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 11,
                    color: COLORS.muted,
                    marginBottom: 6,
                  }}
                >
                  {kpi.label}
                </div>
                <div
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 24,
                    fontWeight: 800,
                    color: kpi.color,
                  }}
                >
                  {kpi.value}
                </div>
              </div>
            ))}
          </div>

          {/* Chart placeholder */}
          <div
            style={{
              flex: 1,
              background: COLORS.bgElevated,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              display: "flex",
              alignItems: "flex-end",
              padding: "20px 24px",
              gap: 8,
            }}
          >
            {Array.from({ length: 24 }).map((_, i) => {
              const h = 40 + Math.sin(i * 0.5) * 30 + Math.random() * 20;
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    borderRadius: 4,
                    background:
                      i >= 18
                        ? `linear-gradient(to top, ${COLORS.orange}, ${COLORS.orangeDark})`
                        : COLORS.bgCard,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
