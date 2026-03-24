"use client";

import { motion } from "framer-motion";
import { Mail, ClipboardList, CalendarRange, HardHat, Bot, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Mail,
    title: "Mail IA",
    description: "Classification automatique de vos emails Outlook par projet, fournisseur et priorité. Filtrage spam, extraction de tâches et suggestions de réponse.",
  },
  {
    icon: ClipboardList,
    title: "Soumissions",
    description: "Upload Excel ou PDF, analyse IA des postes CFC, envoi des demandes aux fournisseurs et suivi des réponses.",
  },
  {
    icon: CalendarRange,
    title: "Planning Gantt",
    description: "Génération IA du planning depuis vos soumissions, édition interactive, dépendances CFC, export PDF format A3 et partage public.",
  },
  {
    icon: HardHat,
    title: "Portail Terrain",
    description: "Rapports journaliers pour chefs d'équipe. Accès par PIN, saisie heures, machines et bons de livraison depuis le mobile.",
  },
  {
    icon: Bot,
    title: "Assistant IA",
    description: "Chat Claude avec contexte projet, upload de documents PDF et Excel. Briefing quotidien automatique avec alertes et priorités.",
  },
  {
    icon: BarChart3,
    title: "Direction",
    description: "Rentabilité par projet, statistiques équipe, marge, KPIs direction. Vue consolidée de l'ensemble de vos chantiers actifs.",
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

export function FeaturesSection() {
  return (
    <section id="features" className="relative bg-[#0F0F11]">
      {/* Subtle top gradient */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#27272A] to-transparent" />

      <div className="mx-auto max-w-[1200px] px-6 py-24 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[#27272A] bg-[#18181B] px-4 py-1.5 text-xs font-semibold text-[#A1A1AA] mb-6">
            Plateforme
          </div>
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            Tout ce dont vous avez besoin
          </h2>
          <p className="mt-4 text-lg text-[#71717A] max-w-[560px] mx-auto">
            Une seule plateforme pour gerer vos chantiers, de l&apos;email au rapport financier.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={cardVariants}
              className="group rounded-2xl border border-[#27272A] bg-[#18181B] p-8 transition-all duration-300 hover:border-[#F97316]/30 hover:bg-[#1C1C1F]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F97316]/10 text-[#F97316] transition-colors duration-300 group-hover:bg-[#F97316]/15">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-white">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#71717A]">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
