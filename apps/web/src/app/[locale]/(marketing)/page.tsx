import dynamic from "next/dynamic";
import { HeroSection } from "@/components/landing";

const ProblemSection = dynamic(() => import("@/components/landing/ProblemSection").then((m) => m.ProblemSection));
const FeaturesSection = dynamic(() => import("@/components/landing/FeaturesSection").then((m) => m.FeaturesSection));
const SpotlightSection = dynamic(() => import("@/components/landing/SpotlightSection").then((m) => m.SpotlightSection));
const HowItWorksSection = dynamic(() => import("@/components/landing/HowItWorksSection").then((m) => m.HowItWorksSection));
const ProofSection = dynamic(() => import("@/components/landing/ProofSection").then((m) => m.ProofSection));
const PricingSection = dynamic(() => import("@/components/landing/PricingSection").then((m) => m.PricingSection));
const FAQSection = dynamic(() => import("@/components/landing/FAQSection").then((m) => m.FAQSection));
const FinalCTASection = dynamic(() => import("@/components/landing/FinalCTASection").then((m) => m.FinalCTASection));

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <ProblemSection />
      <FeaturesSection />
      <SpotlightSection />
      <HowItWorksSection />
      <ProofSection />
      <PricingSection />
      <FAQSection />
      <FinalCTASection />
    </>
  );
}
