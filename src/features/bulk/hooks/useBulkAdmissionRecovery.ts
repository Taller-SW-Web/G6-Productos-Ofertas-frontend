import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBulkRepository } from "./useBulkRepository";
import { useBulkUploadContext } from "../context/BulkUploadContext";
import { reconcileBulkAdmission } from "../services/bulkAdmissionRecovery";

export type BulkAdmissionRecoveryView =
  | { status: "disabled"; message: string }
  | { status: "checking"; message: string }
  | { status: "timed_out"; message: string }
  | { status: "authentication_required"; message: string }
  | { status: "owner_changed"; message: string }
  | { status: "blocked"; message: string };

export function useBulkAdmissionRecovery(): {
  view: BulkAdmissionRecoveryView;
  reconcileAgain: () => void;
} {
  const repository = useBulkRepository();
  const navigate = useNavigate();
  const {
    selectedFile,
    admissionStatus,
    pendingAdmission,
    recoveryOwnerIsCurrent,
    confirmReconciliation,
  } = useBulkUploadContext();
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<BulkAdmissionRecoveryView>({
    status: "disabled",
    message: "La conciliación aún no está homologada ni habilitada para este entorno.",
  });

  useEffect(() => {
    if (admissionStatus !== "uncertain" || !pendingAdmission) {
      return;
    }
    if (!repository.reconciliationEnabled || !repository.reconcileImport) {
      return;
    }
    const controller = new AbortController();
    void reconcileBulkAdmission({
      repository,
      intent: pendingAdmission,
      signal: controller.signal,
      isOwnerCurrent: recoveryOwnerIsCurrent,
      timeoutMs: 60_000,
    }).then((result) => {
      if (controller.signal.aborted) return;
      switch (result.status) {
        case "confirmed": {
          if (result.admission.correlation_id !== pendingAdmission.correlationId || !recoveryOwnerIsCurrent()) {
            setView({ status: "owner_changed", message: "La sesión cambió; la intención original permanece sin modificar." });
            return;
          }
          if (confirmReconciliation(pendingAdmission, result.admission.batch_id)) {
            navigate(`/carga-masiva/importaciones/${result.admission.batch_id}`);
          } else {
            setView({ status: "owner_changed", message: "No se pudo confirmar con la identidad original; se conserva el marcador incierto." });
          }
          return;
        }
        case "timed_out":
          setView({ status: "timed_out", message: "No hubo una respuesta conciliable durante 60 segundos. La admisión sigue incierta y no se reenvió." });
          return;
        case "authentication_required":
          setView({ status: "authentication_required", message: "Recupera una sesión G7 válida del mismo usuario para continuar la conciliación." });
          return;
        case "owner_changed":
          setView({ status: "owner_changed", message: "La sesión cambió; la intención original permanece sin modificar." });
          return;
        case "cancelled":
          return;
        case "blocked":
          setView({ status: "blocked", message: result.message });
      }
    });
    return () => controller.abort();
  }, [admissionStatus, attempt, confirmReconciliation, navigate, pendingAdmission, recoveryOwnerIsCurrent, repository, selectedFile]);

  const reconcileAgain = useCallback(() => {
    if (view.status === "timed_out" || view.status === "authentication_required" || view.status === "blocked") {
      setView({ status: "checking", message: "Consultando la misma intención por su correlación…" });
      setAttempt((value) => value + 1);
    }
  }, [view.status]);

  if (admissionStatus !== "uncertain" || !pendingAdmission) {
    return { view: { status: "disabled", message: "No hay una admisión incierta que conciliar." }, reconcileAgain };
  }
  if (!repository.reconciliationEnabled || !repository.reconcileImport) {
    return { view: { status: "disabled", message: "La operación de conciliación permanece deshabilitada hasta acreditar el endpoint compatible." }, reconcileAgain };
  }
  if (!recoveryOwnerIsCurrent()) {
    return { view: { status: "owner_changed", message: "La sesión actual no corresponde al propietario original; la intención se conserva sin cambios." }, reconcileAgain };
  }
  return { view: view.status === "disabled" ? { status: "checking", message: "Consultando la misma intención por su correlación…" } : view, reconcileAgain };
}

