"use client";

import { ComingSoonProduct } from "@/components/app/ComingSoonProduct";
import { FileText } from "lucide-react";

export default function PVPage() {
  return (
    <ComingSoonProduct
      icon={FileText}
      titleKey="products.pv.title"
      descriptionKey="products.pv.coming_soon_description"
      estimatedDate="Q3 2026"
      features={[
        "products.pv.feature.audio_recording",
        "products.pv.feature.whisper_transcription",
        "products.pv.feature.ai_pv_generation",
        "products.pv.feature.sia_format",
        "products.pv.feature.export_word_pdf",
      ]}
    />
  );
}
