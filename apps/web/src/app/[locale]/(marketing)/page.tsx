import dynamic from "next/dynamic";
import { HeroSection } from "@/components/landing";

const ProofSection = dynamic(() => import("@/components/landing/ProofSection").then((m) => m.ProofSection));
const ProblemSection = dynamic(() => import("@/components/landing/ProblemSection").then((m) => m.ProblemSection));
const FeaturesSection = dynamic(() => import("@/components/landing/FeaturesSection").then((m) => m.FeaturesSection));
const SpotlightSection = dynamic(() => import("@/components/landing/SpotlightSection").then((m) => m.SpotlightSection));
const FeaturePrixSection = dynamic(() => import("@/components/landing/BentoGrid").then((m) => m.FeaturePrixSection));
const HowItWorksSection = dynamic(() => import("@/components/landing/HowItWorksSection").then((m) => m.HowItWorksSection));
const TrustSection = dynamic(() => import("@/components/landing/FAQSection").then((m) => m.TrustSection));
const PricingSection = dynamic(() => import("@/components/landing/PricingSection").then((m) => m.PricingSection));
const FinalCTASection = dynamic(() => import("@/components/landing/FinalCTASection").then((m) => m.FinalCTASection));

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <ProofSection />
      <ProblemSection />
      <FeaturesSection />
      <SpotlightSection />
      <FeaturePrixSection />
      <HowItWorksSection />
      <TrustSection />
      <PricingSection />
      <FinalCTASection />
    </>
  );
}
