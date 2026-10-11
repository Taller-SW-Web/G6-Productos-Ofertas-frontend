import { useState } from "react";
import { pricingService } from "../services/pricingService";
import type { PrevalidationView } from "../services/pricingModels";
import { usePricingAction } from "./usePricingRequest";

export function usePriceImport() {
  const [file, setFile] = useState<File | null>(null);
  const [policy, setPolicy] = useState<"all" | "partial" | "">("");
  const [step, setStep] = useState(0);
  const [scenario, setScenario] = useState<
    "valid" | "rows" | "unreadable" | "error"
  >("valid");
  const preview = usePricingAction<PrevalidationView>();
  function invalidate() {
    preview.clear();
    setStep(0);
  }
  return {
    file,
    policy,
    step,
    scenario,
    preview,
    changeFile: (value: File | null) => {
      if (!preview.busy) {
        setFile(value);
        invalidate();
      }
    },
    changePolicy: (value: string) => {
      if (!preview.busy && (value === "all" || value === "partial")) {
        setPolicy(value);
        invalidate();
      }
    },
    changeScenario: (value: typeof scenario) => {
      if (!preview.busy) {
        setScenario(value);
        invalidate();
      }
    },
    back: () => setStep(0),
    simulate: async () => {
      if (!file || !policy) return;
      const result = await preview.run((signal) =>
        pricingService.previewFixture(scenario, signal),
      );
      if (result) setStep(1);
    },
  };
}
