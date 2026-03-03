"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, Mail } from "lucide-react";
import { AnimatedSection } from "./AnimatedSection";

interface FormData {
  name: string;
  email: string;
  company: string;
  sites: string;
  message: string;
}

const initialFormData: FormData = {
  name: "",
  email: "",
  company: "",
  sites: "",
  message: "",
};

export function FinalCTASection() {
  const t = useTranslations("landing.finalCta");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would POST to an API route
    setSubmitted(true);
  };

  return (
    <section
      className="relative overflow-hidden px-6 py-24"
      style={{
        background: "linear-gradient(to bottom, #0A1F30, #1A3A52)",
      }}
    >
      {/* Background glow accents */}
      <div className="absolute left-1/4 top-0 h-48 w-48 rounded-full bg-gold/5 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 h-48 w-48 rounded-full bg-gold/5 blur-3xl" />

      <div className="relative mx-auto max-w-3xl text-center">
        {/* Title */}
        <AnimatedSection>
          <h2 className="font-heading text-3xl font-bold text-white sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-300">
            {t("subtitle")}
          </p>
        </AnimatedSection>

        {/* CTA Buttons */}
        {!showForm && !submitted && (
          <AnimatedSection delay={0.1}>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-gold px-8 py-3.5 text-sm font-semibold text-slate-900 shadow-lg shadow-gold/25 transition-all hover:bg-gold-dark hover:shadow-xl"
              >
                <CalendarDays className="h-4 w-4" />
                {t("ctaPrimary")}
              </button>
              <a
                href="mailto:contact@cantaia.ch"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:border-white/40 hover:bg-white/5"
              >
                <Mail className="h-4 w-4" />
                {t("ctaSecondary")}
              </a>
            </div>
          </AnimatedSection>
        )}

        {/* Inline demo form */}
        {showForm && !submitted && (
          <AnimatedSection delay={0}>
            <form
              onSubmit={handleSubmit}
              className="mx-auto mt-10 max-w-lg space-y-4 rounded-2xl border border-white/10 bg-white/5 p-8 text-left backdrop-blur-sm"
            >
              {/* Name */}
              <div>
                <label
                  htmlFor="cta-name"
                  className="mb-1.5 block text-sm font-medium text-slate-300"
                >
                  {t("formName")}
                </label>
                <input
                  id="cta-name"
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/20"
                />
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="cta-email"
                  className="mb-1.5 block text-sm font-medium text-slate-300"
                >
                  {t("formEmail")}
                </label>
                <input
                  id="cta-email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/20"
                />
              </div>

              {/* Company */}
              <div>
                <label
                  htmlFor="cta-company"
                  className="mb-1.5 block text-sm font-medium text-slate-300"
                >
                  {t("formCompany")}
                </label>
                <input
                  id="cta-company"
                  name="company"
                  type="text"
                  required
                  value={formData.company}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/20"
                />
              </div>

              {/* Number of sites dropdown */}
              <div>
                <label
                  htmlFor="cta-sites"
                  className="mb-1.5 block text-sm font-medium text-slate-300"
                >
                  {t("formSites")}
                </label>
                <select
                  id="cta-sites"
                  name="sites"
                  required
                  value={formData.sites}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/20"
                >
                  <option value="" disabled className="bg-slate-800">
                    --
                  </option>
                  <option value="1-3" className="bg-slate-800">
                    {t("formSites1")}
                  </option>
                  <option value="4-10" className="bg-slate-800">
                    {t("formSites2")}
                  </option>
                  <option value="10+" className="bg-slate-800">
                    {t("formSites3")}
                  </option>
                </select>
              </div>

              {/* Message */}
              <div>
                <label
                  htmlFor="cta-message"
                  className="mb-1.5 block text-sm font-medium text-slate-300"
                >
                  {t("formMessage")}
                </label>
                <textarea
                  id="cta-message"
                  name="message"
                  rows={3}
                  value={formData.message}
                  onChange={handleChange}
                  className="w-full resize-none rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/20"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="w-full rounded-lg bg-gold px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-gold/25 transition-colors hover:bg-gold-dark"
              >
                {t("formSubmit")}
              </button>
            </form>
          </AnimatedSection>
        )}

        {/* Success message */}
        {submitted && (
          <AnimatedSection delay={0}>
            <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-gold/30 bg-gold/10 p-8 backdrop-blur-sm">
              <p className="text-lg font-semibold text-gold">
                {t("formSuccess")}
              </p>
            </div>
          </AnimatedSection>
        )}
      </div>
    </section>
  );
}
