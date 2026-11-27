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
  const discardAction = usePricingAction<boolean>();
  const imports = service.importAdmission;
  const recovery = imports?.recovery();
  const pending = recovery?.pending;
  const policy = pending ? (pending.allowPartial ? "partial" : "all") : selectedPolicy;
  const busy = preview.busy || admission.busy || discardAction.busy;
  const reviewed = step === 1 ? preview.result : undefined;
  const canConfirm =
    !!imports?.canSubmit() && !!file && !!policy && !busy && !admission.result &&
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
    discardAction,
    lastBatchId: recovery?.lastBatchId,
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
        imports.submit({ file, allowPartial: policy === "partial" }, signal, pending?.key),
      );
    },
    discard: async (key: string) => {
      if (!imports || busy) return false;
      const discarded = await discardAction.run(async (signal) => {
        await imports.discard(key, signal);
        return true;
      });
      if (!discarded) return false;
      setFile(null);
      setPolicy("");
      invalidate();
      return true;
    },
  };
}
