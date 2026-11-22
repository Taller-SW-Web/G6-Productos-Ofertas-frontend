import { useState } from "react";
import { usePricingRuntime } from "../services/PricingContext";
import type { PrevalidationView } from "../services/pricingModels";
import { usePricingAction } from "./usePricingRequest";

export function usePriceImport() {
  const { service } = usePricingRuntime();
  const [file, setFile] = useState<File | null>(null);
  const [selectedPolicy, setPolicy] = useState<"all" | "partial" | "">("");
  const [step, setStep] = useState(0);
  const preview = usePricingAction<PrevalidationView>();
  const admission = usePricingAction<string>();
  const imports = service.importAdmission;
  const recovery = imports?.recovery();
  const pending = !!recovery && !recovery.batchId;
  const policy = pending ? (recovery.allowPartial ? "partial" : "all") : selectedPolicy;
  const busy = preview.busy || admission.busy;
  const reviewed = step === 1 ? preview.result : undefined;
  const canConfirm =
    !!imports?.canSubmit() && !!file && !!policy && !busy &&
    (pending || (!!reviewed && (reviewed.valid ||
      (policy === "partial" && reviewed.total > reviewed.errors.length))));
  function invalidate() {
    preview.clear();
    admission.clear();
    setStep(0);
  }
  return {
    file,
    policy,
    step,
    preview,
    admission,
    busy,
    pending,
    canConfirm,
    lastBatchId: recovery?.batchId,
    admissionAvailable: !!imports?.canSubmit(),
    changeFile: (value: File | null) => {
      if (!busy) {
        setFile(value);
        invalidate();
      }
    },
    changePolicy: (value: string) => {
      if (!busy && !pending && (value === "all" || value === "partial")) {
        setPolicy(value);
        invalidate();
      }
    },
    back: () => setStep(0),
    prevalidate: async () => {
      if (!file || !policy || busy || pending) return;
      const result = await preview.run((signal) =>
        service.prevalidate(
          { file, allowPartial: policy === "partial" },
          signal,
        ),
      );
      if (result) setStep(1);
    },
    confirm: () => {
      if (!canConfirm || !imports || !file) return;
      void admission.run((signal) =>
        imports.submit({ file, allowPartial: policy === "partial" }, signal, pending),
      );
    },
  };
}
