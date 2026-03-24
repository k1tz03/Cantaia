"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause } from "lucide-react";

export function VideoSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <section className="relative bg-[#0F0F11] overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#27272A] to-transparent" />

      <div className="mx-auto max-w-[1200px] px-6 py-24 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[#27272A] bg-[#18181B] px-4 py-1.5 text-xs font-semibold text-[#A1A1AA] mb-6">
            <Play className="w-3 h-3 text-[#F97316]" />
            Voir en action
          </div>
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            Cantaia en <span className="bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">15 secondes</span>
          </h2>
          <p className="mt-4 text-lg text-[#71717A] max-w-xl mx-auto">
            De l&apos;email entrant au rapport généré — voyez comment l&apos;IA transforme votre quotidien.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7 }}
          className="relative mx-auto max-w-[900px]"
        >
          {/* Glow behind video */}
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-b from-[#F97316]/10 via-[#F97316]/5 to-transparent blur-2xl" />

          <div className="relative rounded-2xl border border-[#27272A] bg-[#18181B] shadow-2xl shadow-black/50 overflow-hidden ring-1 ring-white/5">
            {/* Browser bar */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[#0F0F11] border-b border-[#27272A]">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#EF4444]/80" />
                <div className="w-3 h-3 rounded-full bg-[#F59E0B]/80" />
                <div className="w-3 h-3 rounded-full bg-[#22C55E]/80" />
              </div>
              <div className="flex-1 mx-8">
                <div className="mx-auto max-w-[220px] rounded-md bg-[#27272A] px-3 py-1 text-[11px] text-[#71717A] text-center">
                  app.cantaia.io — Démo
                </div>
              </div>
            </div>

            {/* Video container */}
            <div className="relative aspect-video bg-[#0F0F11] cursor-pointer" onClick={togglePlay}>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                loop
                muted
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              >
                <source src="/landing/demo.mp4" type="video/mp4" />
              </video>

              {/* Play overlay */}
              <div
                className={`absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity duration-300 ${
                  isPlaying ? "opacity-0 hover:opacity-100" : "opacity-100"
                }`}
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#F97316] to-[#EA580C] shadow-2xl shadow-[#F97316]/30 transition-transform hover:scale-110 active:scale-95">
                  {isPlaying ? (
                    <Pause className="w-8 h-8 text-white" />
                  ) : (
                    <Play className="w-8 h-8 text-white ml-1" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
