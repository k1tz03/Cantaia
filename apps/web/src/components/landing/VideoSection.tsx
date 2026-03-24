"use client";

import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export function VideoSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const t = useTranslations("landing.video");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        video.muted = true;
        if (overlayRef.current) {
          overlayRef.current.style.opacity = "1";
          overlayRef.current.style.pointerEvents = "auto";
        }
        setVideoPlaying(false);
      }
    };

    video.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      video.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleClick = () => {
    if (!videoRef.current) return;
    if (!videoPlaying) {
      videoRef.current.muted = false;
      videoRef.current.currentTime = 0;
      if (overlayRef.current) {
        overlayRef.current.style.opacity = "0";
        overlayRef.current.style.pointerEvents = "none";
      }
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
      setVideoPlaying(true);
    }
  };

  return (
    <section className="relative text-center" style={{ padding: "100px 48px" }}>
      <motion.div
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
        className="text-[12px] uppercase tracking-[0.2em] text-[#F97316] font-semibold text-center mb-3"
      >
        {t("label")}
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.85, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="font-display text-[46px] font-extrabold text-[#FAFAFA] text-center tracking-[-1.5px] leading-[1.1] mb-10"
      >
        {t("title")}
      </motion.h2>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto max-w-[960px] rounded-[20px] overflow-hidden relative border border-[#27272A] cursor-pointer"
        style={{ animation: "videoGlow 4s ease-in-out infinite" }}
        onClick={handleClick}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          className="w-full block aspect-video object-cover bg-black"
        >
          <source src="/landing/demo.mp4" type="video/mp4" />
        </video>

        {/* Play overlay */}
        <div
          ref={overlayRef}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/35 transition-[background] duration-300 hover:bg-black/20"
        >
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#F97316] to-[#EA580C] flex items-center justify-center shadow-[0_0_50px_rgba(249,115,22,0.4)] transition-transform duration-300 hover:scale-110">
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white ml-1">
              <polygon points="8,5 19,12 8,19" />
            </svg>
          </div>
          <div className="absolute bottom-5 text-[13px] text-white/50">
            {t("caption")}
          </div>
        </div>
      </motion.div>

      <style jsx>{`
        @keyframes videoGlow {
          0%, 100% { box-shadow: 0 0 40px rgba(249,115,22,0.06), 0 20px 80px rgba(0,0,0,0.5); }
          50% { box-shadow: 0 0 80px rgba(249,115,22,0.14), 0 20px 80px rgba(0,0,0,0.5); }
        }
      `}</style>
    </section>
  );
}
