"use client";

import { useRef, useEffect, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  opacity: number;
  color: string;
  pulse: number;
  pulseSpeed: number;
  gravity: number;
}

const DEFAULT_PARTICLE_COUNT = 35;
const CONNECTION_DISTANCE = 120;
const DEFAULT_COLORS = [
  "rgba(249,115,22,",  // orange
  "rgba(234,88,12,",   // orange-dark
  "rgba(251,146,60,",  // orange-light
  "rgba(59,130,246,",  // blue (rare)
];

export interface ParticleCanvasProps {
  particleCount?: number;
  opacity?: [number, number];
  showConnections?: boolean;
  mouseGravity?: number;
  colors?: string[];
  className?: string;
}

export function ParticleCanvas({
  particleCount = DEFAULT_PARTICLE_COUNT,
  opacity: opacityRange = [0.1, 0.5],
  showConnections = true,
  mouseGravity = 0.00008,
  colors = DEFAULT_COLORS,
  className,
}: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef<number>(0);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    // Initial size
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;

    const [opMin, opMax] = opacityRange;
    const opRange = opMax - opMin;

    // Create particles
    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      const blueThreshold = Math.floor(particleCount * 0.85);
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 3 + 1,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -Math.random() * 0.4 - 0.1,
        opacity: Math.random() * opRange + opMin,
        color: colors[i < blueThreshold ? Math.floor(Math.random() * Math.min(3, colors.length)) : Math.min(3, colors.length - 1)],
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.01,
        gravity: Math.random() * mouseGravity + mouseGravity * 0.25,
      });
    }
    particlesRef.current = particles;

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      const rect = parent.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
    };
    parent.addEventListener("mousemove", handleMouseMove);

    // Resize
    window.addEventListener("resize", handleResize);

    // Animation loop
    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mouse = mouseRef.current;

      for (const p of particles) {
        // Pulse opacity
        p.pulse += p.pulseSpeed;
        const currentOpacity = p.opacity * (0.6 + 0.4 * Math.sin(p.pulse));

        // Soft gravity toward mouse
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 50) {
          p.vx += (dx / dist) * p.gravity * 10;
          p.vy += (dy / dist) * p.gravity * 10;
        }

        // Damping
        p.vx *= 0.998;
        p.vy *= 0.998;

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < -20) p.x = canvas.width + 20;
        if (p.x > canvas.width + 20) p.x = -20;
        if (p.y < -20) p.y = canvas.height + 20;
        if (p.y > canvas.height + 20) p.y = -20;

        // Draw glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        gradient.addColorStop(0, p.color + currentOpacity + ")");
        gradient.addColorStop(1, p.color + "0)");
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + currentOpacity + ")";
        ctx.fill();
      }

      // Draw connections between nearby particles
      if (showConnections) {
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < CONNECTION_DISTANCE) {
              const alpha = (1 - dist / CONNECTION_DISTANCE) * 0.06;
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.strokeStyle = `rgba(249,115,22,${alpha})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      parent.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
    };
  }, [handleResize, particleCount, opacityRange, showConnections, mouseGravity, colors]);

  return (
    <canvas
      ref={canvasRef}
      className={className || "pointer-events-none absolute inset-0 z-[1]"}
    />
  );
}

// Default export for dynamic imports
export default ParticleCanvas;

