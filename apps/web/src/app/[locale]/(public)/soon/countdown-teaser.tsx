"use client";

/**
 * Pre-launch teaser — countdown + waitlist form.
 *
 * Target: mercredi 22 avril 2026, 07h00 CEST (J12 of the LinkedIn campaign).
 * Design mirrors `marketing/linkedin/countdown.html` exactly (the version
 * Julien validated). The waitlist form posts to /api/waitlist/subscribe.
 */

import { useEffect, useRef, useState } from "react";

// Target locked to CEST (+02:00) so every visitor sees the same countdown
// regardless of their browser timezone.
const TARGET = new Date("2026-04-22T07:00:00+02:00").getTime();

type Parts = { days: string; hours: string; minutes: string; seconds: string };

const ZERO: Parts = { days: "00", hours: "00", minutes: "00", seconds: "00" };

function pad(n: number): string {
  return String(Math.max(0, n)).padStart(2, "0");
}

function computeParts(now: number): { parts: Parts; launched: boolean } {
  const diff = TARGET - now;
  if (diff <= 0) return { parts: ZERO, launched: true };
  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const m = Math.floor((diff / (1000 * 60)) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return {
    parts: { days: pad(d), hours: pad(h), minutes: pad(m), seconds: pad(s) },
    launched: false,
  };
}

type FormStatus = "idle" | "submitting" | "success" | "error";

export default function CountdownTeaser() {
  // Start at ZERO so server-render and first client-render agree (no hydration mismatch).
  // The real values kick in on mount via the effect below.
  const [parts, setParts] = useState<Parts>(ZERO);
  const [launched, setLaunched] = useState(false);
  const [mounted, setMounted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Waitlist form state
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);

    const tick = () => {
      const { parts: next, launched: done } = computeParts(Date.now());
      setParts(next);
      setLaunched(done);
      if (done && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const start = () => {
      if (intervalRef.current) return;
      tick();
      intervalRef.current = setInterval(tick, 1000);
    };

    const stop = () => {
      if (!intervalRef.current) return;
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Dynamic document title — mirrors the HTML version's behaviour
  useEffect(() => {
    if (!mounted) return;
    if (launched) {
      document.title = "Cantaia — Disponible maintenant";
      return;
    }
    const d = Number(parts.days);
    document.title = `J-${d} · ${parts.hours}:${parts.minutes}:${parts.seconds} — Cantaia`;
  }, [parts, launched, mounted]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;

    const trimmed = email.trim();
    if (!trimmed || !/.+@.+\..+/.test(trimmed)) {
      setStatus("error");
      setMessage("Merci d'entrer une adresse email valide.");
      return;
    }

    setStatus("submitting");
    setMessage(null);

    try {
      const res = await fetch("/api/waitlist/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          locale: "fr",
          source: "teaser",
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        duplicate?: boolean;
      };

      if (!res.ok || !json.ok) {
        setStatus("error");
        setMessage(json.error ?? "Une erreur est survenue. Réessayez dans un instant.");
        return;
      }

      setStatus("success");
      setMessage(
        json.duplicate
          ? "Vous êtes déjà sur la liste. On vous prévient au lancement."
          : "Merci ! Vous serez prévenu le jour du lancement.",
      );
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Connexion perdue. Réessayez dans un instant.");
    }
  }

  return (
    <>
      {/* Inline style block — mirrors marketing/linkedin/countdown.html exactly */}
      <style>{CSS}</style>

      <div className="teaser-container">
        <div className="logo">
          <div className="logo-c">C</div>
          <div className="logo-text">Cantaia</div>
        </div>

        <div className="badge">
          <div className="badge-dot"></div>
          Lancement imminent
        </div>

        <h1 className="title">
          Quelque chose
          <br />
          <span className="highlight">arrive.</span>
        </h1>

        <p className="subtitle">L&apos;IA au service du chantier suisse.</p>

        <div
          className={`countdown ${launched ? "hidden" : ""}`}
          role="timer"
          aria-live="polite"
        >
          <div className="unit">
            <div className="value" aria-label="jours">{parts.days}</div>
            <div className="label">Jours</div>
          </div>
          <div className="unit">
            <div className="value" aria-label="heures">{parts.hours}</div>
            <div className="label">Heures</div>
          </div>
          <div className="unit">
            <div className="value" aria-label="minutes">{parts.minutes}</div>
            <div className="label">Minutes</div>
          </div>
          <div className="unit">
            <div className="value" aria-label="secondes">{parts.seconds}</div>
            <div className="label">Secondes</div>
          </div>
        </div>

        {launched && (
          <div className="launched active">
            <h2>
              C&apos;est <span>parti.</span>
            </h2>
            <a className="cta" href="/fr" rel="noopener">
              Découvrir Cantaia →
            </a>
          </div>
        )}

        <p className="target">
          Jusqu&apos;au <strong>mercredi 22 avril 2026</strong>
          <span className="separator">•</span>
          <strong>07h00</strong> heure suisse
        </p>

        {/* ─── Waitlist form ────────────────────────────── */}
        <form className="waitlist" onSubmit={handleSubmit} noValidate>
          <label className="waitlist-label" htmlFor="waitlist-email">
            Soyez prévenu au lancement
          </label>
          <div className="waitlist-row">
            <input
              id="waitlist-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="vous@exemple.ch"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "submitting" || status === "success"}
              required
              aria-label="Adresse email"
            />
            <button
              type="submit"
              disabled={status === "submitting" || status === "success"}
              aria-busy={status === "submitting"}
            >
              {status === "submitting" ? "Envoi…" : "Me prévenir"}
            </button>
          </div>
          {message && (
            <p className={`waitlist-msg ${status}`} role="status">
              {message}
            </p>
          )}
        </form>

        <p className="tagline">
          <strong>12 modules. 3 IA. 100% adapté au chantier suisse.</strong>
          <br />
          Essai gratuit 14 jours dès le lancement.
        </p>

        <div className="domain">cantaia.io</div>
      </div>
    </>
  );
}

// ─── Style block: identical visual language to countdown.html ───────────
const CSS = `
  :root {
    --bg-deep: #09090B;
    --bg-base: #0F0F11;
    --bg-card: #18181B;
    --bg-elevated: #1C1C1F;
    --border: #27272A;
    --border-hover: #3F3F46;
    --text-white: #FAFAFA;
    --text-secondary: #A1A1AA;
    --text-muted: #71717A;
    --text-faint: #52525B;
    --orange: #F97316;
    --orange-dark: #EA580C;
    --orange-light: #FB923C;
  }

  html, body { height: 100%; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg-base);
    color: var(--text-white);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 2.5rem 1.5rem;
    position: relative;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(249, 115, 22, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(249, 115, 22, 0.04) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none;
    mask-image: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.85) 0%, transparent 75%);
    -webkit-mask-image: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.85) 0%, transparent 75%);
    z-index: 0;
  }

  body::after {
    content: '';
    position: fixed;
    width: min(900px, 140vw);
    height: min(900px, 140vw);
    border-radius: 50%;
    background: radial-gradient(circle, rgba(249, 115, 22, 0.14) 0%, rgba(249, 115, 22, 0.03) 40%, transparent 70%);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 0;
    filter: blur(20px);
    animation: breathe 8s ease-in-out infinite;
  }

  @keyframes breathe {
    0%, 100% { opacity: 0.85; transform: translate(-50%, -50%) scale(1); }
    50%      { opacity: 1;    transform: translate(-50%, -50%) scale(1.05); }
  }

  .teaser-container {
    position: relative;
    z-index: 2;
    text-align: center;
    max-width: 920px;
    width: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2.5rem 1.5rem;
  }

  .logo {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 3rem;
    animation: fadeInDown 0.8s ease-out both;
  }

  .logo-c {
    width: 52px;
    height: 52px;
    border-radius: 13px;
    background: linear-gradient(135deg, var(--orange), var(--orange-dark));
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 26px;
    font-weight: 800;
    color: #fff;
    box-shadow: 0 0 40px rgba(249, 115, 22, 0.35), 0 4px 24px rgba(0, 0, 0, 0.4);
    letter-spacing: -1px;
  }

  .logo-text {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 26px;
    font-weight: 700;
    color: var(--text-white);
    letter-spacing: -0.6px;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 9px 22px;
    border-radius: 99px;
    background: rgba(249, 115, 22, 0.1);
    border: 1px solid rgba(249, 115, 22, 0.35);
    font-size: 12px;
    font-weight: 700;
    color: var(--orange);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 2.25rem;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    animation: fadeInDown 0.8s 0.1s ease-out both;
  }

  .badge-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--orange);
    box-shadow: 0 0 12px var(--orange);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1;   transform: scale(1); }
    50%      { opacity: 0.4; transform: scale(0.75); }
  }

  .title {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: clamp(40px, 7vw, 76px);
    font-weight: 800;
    line-height: 1.05;
    margin-bottom: 1.25rem;
    letter-spacing: -2px;
    animation: fadeInUp 0.8s 0.2s ease-out both;
  }

  .title .highlight {
    background: linear-gradient(135deg, var(--orange-light) 0%, var(--orange) 50%, var(--orange-dark) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    color: transparent;
  }

  .subtitle {
    font-size: clamp(16px, 2vw, 20px);
    color: var(--text-secondary);
    margin-bottom: 4rem;
    font-weight: 400;
    line-height: 1.5;
    max-width: 540px;
    animation: fadeInUp 0.8s 0.3s ease-out both;
  }

  .countdown {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    width: 100%;
    max-width: 780px;
    margin: 0 auto 3rem;
    animation: fadeInUp 0.8s 0.4s ease-out both;
  }

  .countdown.hidden { display: none; }

  .unit {
    position: relative;
    background: linear-gradient(180deg, var(--bg-card) 0%, var(--bg-elevated) 100%);
    border: 1px solid var(--border);
    border-radius: 22px;
    padding: 2.25rem 0.75rem 1.75rem;
    transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
    overflow: hidden;
  }

  .unit::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(249, 115, 22, 0.5), transparent);
  }

  .unit::after {
    content: '';
    position: absolute;
    top: -50%; left: -50%;
    width: 200%; height: 200%;
    background: radial-gradient(circle at center, rgba(249, 115, 22, 0.08) 0%, transparent 40%);
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  .unit:hover {
    border-color: rgba(249, 115, 22, 0.35);
    transform: translateY(-3px);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(249, 115, 22, 0.15) inset;
  }

  .unit:hover::after { opacity: 1; }

  .value {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: clamp(44px, 8vw, 82px);
    font-weight: 800;
    color: var(--text-white);
    line-height: 1;
    margin-bottom: 0.75rem;
    font-variant-numeric: tabular-nums;
    letter-spacing: -2px;
    text-shadow: 0 0 40px rgba(249, 115, 22, 0.2);
  }

  .label {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 2px;
    font-weight: 600;
  }

  .target {
    font-size: 16px;
    color: var(--text-secondary);
    margin-bottom: 1rem;
    font-weight: 500;
    animation: fadeInUp 0.8s 0.5s ease-out both;
  }

  .target strong { color: var(--orange); font-weight: 700; }
  .target .separator { color: var(--text-faint); margin: 0 10px; }

  /* ─── Waitlist form ──────────────────────────── */
  .waitlist {
    width: 100%;
    max-width: 520px;
    margin: 2.5rem auto 0;
    animation: fadeInUp 0.8s 0.6s ease-out both;
  }

  .waitlist-label {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 0.85rem;
  }

  .waitlist-row {
    display: flex;
    gap: 0.5rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 0.5rem;
    transition: border-color 0.25s ease, box-shadow 0.25s ease;
  }

  .waitlist-row:focus-within {
    border-color: rgba(249, 115, 22, 0.5);
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.12);
  }

  .waitlist-row input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-white);
    font-family: inherit;
    font-size: 15px;
    font-weight: 500;
    padding: 0.65rem 0.9rem;
  }

  .waitlist-row input::placeholder { color: var(--text-faint); }
  .waitlist-row input:disabled { opacity: 0.6; cursor: not-allowed; }

  .waitlist-row button {
    flex-shrink: 0;
    padding: 0.75rem 1.25rem;
    border-radius: 10px;
    background: linear-gradient(135deg, var(--orange), var(--orange-dark));
    color: #fff;
    border: none;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
    box-shadow: 0 8px 24px rgba(249, 115, 22, 0.35);
    white-space: nowrap;
  }

  .waitlist-row button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 12px 32px rgba(249, 115, 22, 0.45);
  }

  .waitlist-row button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .waitlist-msg {
    margin-top: 0.9rem;
    font-size: 13px;
    font-weight: 500;
  }

  .waitlist-msg.success { color: #22c55e; }
  .waitlist-msg.error   { color: #f87171; }

  .tagline {
    font-size: 14px;
    color: var(--text-muted);
    margin-top: 2.5rem;
    max-width: 520px;
    line-height: 1.7;
    animation: fadeInUp 0.8s 0.7s ease-out both;
  }

  .tagline strong { color: var(--text-secondary); font-weight: 600; }

  .domain {
    display: inline-block;
    margin-top: 2.25rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: var(--text-secondary);
    padding: 10px 18px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid var(--border);
    letter-spacing: 0.5px;
    animation: fadeInUp 0.8s 0.8s ease-out both;
    transition: all 0.3s ease;
  }

  .domain:hover {
    border-color: rgba(249, 115, 22, 0.3);
    color: var(--orange);
  }

  .launched {
    display: none;
    animation: fadeInUp 1s ease-out both;
  }

  .launched.active {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 2rem;
  }

  .launched h2 {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: clamp(48px, 9vw, 96px);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -2.5px;
    margin-bottom: 1.5rem;
  }

  .launched h2 span {
    background: linear-gradient(135deg, var(--orange-light), var(--orange), var(--orange-dark));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    color: transparent;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 18px 36px;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--orange), var(--orange-dark));
    color: #fff;
    text-decoration: none;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 16px;
    font-weight: 700;
    margin-top: 2rem;
    box-shadow: 0 12px 40px rgba(249, 115, 22, 0.4);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }

  .cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 50px rgba(249, 115, 22, 0.55);
  }

  @keyframes fadeInDown {
    0%   { opacity: 0; transform: translateY(-20px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  @keyframes fadeInUp {
    0%   { opacity: 0; transform: translateY(20px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 640px) {
    .teaser-container { padding: 2rem 1rem; }
    .countdown {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
      margin-bottom: 2.5rem;
    }
    .unit { padding: 1.75rem 0.5rem 1.25rem; border-radius: 18px; }
    .logo { margin-bottom: 2rem; }
    .logo-c { width: 44px; height: 44px; border-radius: 11px; font-size: 22px; }
    .logo-text { font-size: 22px; }
    .badge { font-size: 10px; padding: 7px 16px; margin-bottom: 1.75rem; }
    .subtitle { margin-bottom: 3rem; }
    .target { font-size: 14px; }
    .target .separator { display: block; height: 4px; margin: 2px 0; }
    .waitlist-row { flex-direction: column; gap: 0.4rem; }
    .waitlist-row button { width: 100%; padding: 0.85rem; }
  }

  @media (max-width: 380px) {
    .value { font-size: 42px; }
  }
`;
