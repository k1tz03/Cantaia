"use client";

import { useTranslations } from "next-intl";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { AnimatedSection } from "./AnimatedSection";

const faqKeys = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
] as const;

export function FAQSection() {
  const t = useTranslations("landing.faq");

  return (
    <section className="px-6 py-24" style={{ backgroundColor: "#F8FAFC" }}>
      <div className="mx-auto max-w-3xl">
        {/* Title */}
        <AnimatedSection className="text-center">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            {t("title")}
          </h2>
        </AnimatedSection>

        {/* Accordion */}
        <AnimatedSection delay={0.1} className="mt-12">
          <Accordion.Root type="single" collapsible className="space-y-3">
            {faqKeys.map((key) => (
              <Accordion.Item
                key={key}
                value={`faq-${key}`}
                className="rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center justify-between px-6 py-5 text-left text-sm font-semibold text-slate-900 transition-colors hover:text-amber-600">
                    {t(`q${key}`)}
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-300 ease-in-out group-data-[state=open]:rotate-180" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                  <div className="px-6 pb-5 text-sm leading-relaxed text-slate-600">
                    {t(`a${key}`)}
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </AnimatedSection>
      </div>
    </section>
  );
}
