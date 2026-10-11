import { useCallback, useState } from "react";
import { pricingService } from "../services/pricingService";
import type {
  ReviewScenario,
  ScheduleDraft,
  ScheduleView,
} from "../services/pricingModels";
import { validateSchedule } from "../services/pricingValidation";
import { usePricingAction, usePricingRead } from "./usePricingRequest";

export const initialSchedule: ScheduleDraft = {
  kind: "REGULAR",
  amount: "",
  currency: "PEN",
  channel: "global",
  start: "",
  end: "",
  reason: "",
};
export function usePriceSchedules(targetId: string, scenario: ReviewScenario) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const read = useCallback(
    (signal: AbortSignal) =>
      pricingService.listSchedules(targetId, page, scenario, signal),
    [targetId, page, scenario],
  );
  const listing = usePricingRead(
    `${targetId}:${page}:${scenario}:${revision}`,
    read,
  );
  return {
    listing,
    page,
    setPage,
    refresh: () => {
      setPage(1);
      setRevision((value) => value + 1);
    },
  };
}
export function useScheduleForm(
  targetId: string,
  currency: string,
  channel: "global" | "retail",
  scenario: ReviewScenario,
  onCreated: () => void,
) {
  const [draft, setDraft] = useState({ ...initialSchedule, currency, channel });
  const [dirty, setDirty] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof validateSchedule>>({});
  const action = usePricingAction<ScheduleView>();
  const change = (next: ScheduleDraft) => {
    setDraft(next);
    setDirty(true);
  };
  const validate = () => {
    const next = validateSchedule(draft);
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  async function create() {
    if (!validate() || action.error?.kind === "unknown" || action.result)
      return;
    const result = await action.run((signal) =>
      pricingService.schedule(targetId, draft, scenario, signal),
    );
    setReviewing(false);
    if (result) {
      setDirty(false);
      onCreated();
    }
  }
  function newDraft() {
    action.clear();
    setDraft({ ...initialSchedule, currency, channel });
    setDirty(false);
    setErrors({});
  }
  return {
    draft,
    change,
    dirty,
    reviewing,
    setReviewing,
    errors,
    validate,
    create,
    action,
    newDraft,
  };
}
