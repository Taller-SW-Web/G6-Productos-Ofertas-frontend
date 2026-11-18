import { useState } from "react";
import {
  CouponWriteError,
  type CouponField,
  type CouponFieldErrors,
  type CouponInput,
  type CouponView,
  type CouponRepository,
} from "../services/couponRepository";
import {
  couponDraftFromRecord,
  emptyCouponDraft,
  validateCouponDraft,
  type CouponDraft,
} from "../services/couponValidation";
import { usePromotionCommand } from "./usePromotionCommand";

export function useCouponForm(
  initial: CouponView | null,
  repository: CouponRepository,
  confirmedRepository: CouponRepository = repository,
) {
  const [original] = useState(() =>
    initial ? couponDraftFromRecord(initial) : { ...emptyCouponDraft },
  );
  const [draft, setDraft] = useState(original);
  const [confirmed, setConfirmed] = useState<CouponView | null>(null);
  const [errors, setErrors] = useState<CouponFieldErrors>({});
  const [proposal, setProposal] = useState<CouponInput | null>(null);
  const [checking, setChecking] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string>();
  const command = usePromotionCommand<CouponView>();
  const uncertain =
    command.error instanceof CouponWriteError &&
    command.error.kind === "unknown";
  const conflict =
    command.error instanceof CouponWriteError &&
    command.error.kind === "conflict";
  const update = <K extends keyof CouponDraft>(
    field: K,
    value: CouponDraft[K],
  ) => {
    if (command.submitting || uncertain) return;
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setRecoveryMessage(undefined);
  };
  const submit = async (onInvalid: (field: CouponField) => void) => {
    if (command.submitting || uncertain || conflict) return;
    const validation = validateCouponDraft(draft);
    setErrors(validation.errors);
    if (!validation.values) {
      const field = Object.keys(validation.errors)[0] as
        | CouponField
        | undefined;
      if (field) onInvalid(field);
      return;
    }
    setProposal(validation.values);
    const result = await command.run(async (signal) => {
      try {
        if (!initial)
          return await repository.create(
            validation.values!,
            signal,
          );
        const { status, ...values } = validation.values!;
        void status;
        return await repository.update(
          initial.id,
          values,
          signal,
        );
      } catch (cause: unknown) {
        if (cause instanceof CouponWriteError && cause.kind === "validation") {
          setErrors(cause.fields);
          const field = Object.keys(cause.fields)[0] as CouponField | undefined;
          if (field) onInvalid(field);
        }
        throw cause;
      }
    });
    if (result) setConfirmed(result);
  };
  const reconcile = async () => {
    if (!proposal || checking) return;
    setChecking(true);
    try {
      const controller = new AbortController();
      if (!confirmedRepository.reconcilePending) { setRecoveryMessage("El repositorio no expone conciliación de intenciones pendientes."); return; }
      const result = await confirmedRepository.reconcilePending(initial?.id ?? null, initial ? null : proposal.code, controller.signal);
      if (result.status === "reconciled") setConfirmed(result.value);
      else setRecoveryMessage(result.status === "access_denied" ? "No tienes permiso para consultar la intención pendiente." : result.status === "unavailable" ? "La conciliación no está disponible; se conserva la intención bloqueada." : "La lectura no acredita la mutación. Conservamos el borrador y la intención bloqueada.");
    } catch {
      setRecoveryMessage(
        "No se pudo consultar el resultado. El guardado no se volverá a enviar automáticamente.",
      );
    } finally {
      setChecking(false);
    }
  };
  return {
    confirmed,
    draft,
    update,
    errors,
    submit,
    uncertain,
    conflict,
    reconcile,
    checking,
    recoveryMessage,
    dirty: JSON.stringify(draft) !== JSON.stringify(original),
    submitting: command.submitting,
    message: command.error instanceof Error ? command.error.message : undefined,
  };
}
