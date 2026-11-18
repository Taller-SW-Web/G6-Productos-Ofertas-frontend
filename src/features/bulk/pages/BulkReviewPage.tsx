import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Group, Stack } from "@mantine/core";
import {
  IconArrowLeft,
  IconCheck,
  IconUpload,
} from "@tabler/icons-react";
import {
  EmptyState,
  FeedbackAlert,
  PageHeader,
} from "../../../components/shared";
import { BulkFileReview } from "../components/BulkFileReview";
import { useBulkUploadContext } from "../context/BulkUploadContext";
import { BulkRepositoryError } from "../services/bulkService";
import { useBulkRepository } from "../hooks/useBulkRepository";
import { runSingleFlight } from "../utils/asyncGuards";

export function BulkReviewPage() {
  const navigate = useNavigate();
  const bulkRepository = useBulkRepository();
  const isSubmittingRef = useRef(false);
  const pageIsActiveRef = useRef(true);
  const recoveryControllerRef = useRef<AbortController | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<"idle" | "loading" | "not_found" | "unauthorized" | "forbidden" | "unavailable">("idle");
  const {
    selectedFile,
    fileCheck,
    admissionStatus,
    pendingCorrelationId,
    expectedBatchId,
    confirmRecoveredBatch,
    recoveryOwnerIsCurrent,
    recoveryOwnerId,
    beginAdmission,
    finishAdmission,
    submissionError,
  } = useBulkUploadContext();

  useEffect(() => {
    pageIsActiveRef.current = true;
    return () => {
      pageIsActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (admissionStatus !== "uncertain" || !expectedBatchId || !recoveryOwnerIsCurrent()) return;
    const controller = new AbortController();
    recoveryControllerRef.current?.abort();
    recoveryControllerRef.current = controller;
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setRecoveryStatus("loading");
      void bulkRepository.getImport(expectedBatchId, controller.signal, recoveryOwnerId() ?? undefined).then(batch => {
        if (controller.signal.aborted || !pageIsActiveRef.current || !recoveryOwnerIsCurrent()) return;
        if (batch?.batch_id === expectedBatchId && confirmRecoveredBatch(expectedBatchId)) {
          const owner = recoveryOwnerId();
          if (owner && pendingCorrelationId) bulkRepository.confirmRecoveredImport?.(expectedBatchId, owner, pendingCorrelationId);
          setRecoveryStatus("idle");
          navigate(`/carga-masiva/importaciones/${batch.batch_id}`);
        } else setRecoveryStatus("not_found");
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const status = error instanceof BulkRepositoryError ? error.status : undefined;
        setRecoveryStatus(status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "unavailable");
      });
    });
    return () => { controller.abort(); if (recoveryControllerRef.current === controller) recoveryControllerRef.current = null; };
  }, [admissionStatus, bulkRepository, confirmRecoveredBatch, expectedBatchId, navigate, pendingCorrelationId, recoveryOwnerId, recoveryOwnerIsCurrent]);

  const recheckImport = async () => {
    if (!expectedBatchId || !recoveryOwnerIsCurrent() || recoveryStatus === "loading") return;
    const controller = new AbortController();
    recoveryControllerRef.current?.abort();
    recoveryControllerRef.current = controller;
    setRecoveryStatus("loading");
    try {
      const batch = await bulkRepository.getImport(expectedBatchId, controller.signal, recoveryOwnerId() ?? undefined);
      if (controller.signal.aborted || !pageIsActiveRef.current || !recoveryOwnerIsCurrent()) return;
      if (batch?.batch_id === expectedBatchId && confirmRecoveredBatch(expectedBatchId)) {
        const owner = recoveryOwnerId();
        if (owner && pendingCorrelationId) bulkRepository.confirmRecoveredImport?.(expectedBatchId, owner, pendingCorrelationId);
        setRecoveryStatus("idle");
        navigate(`/carga-masiva/importaciones/${batch.batch_id}`);
      } else setRecoveryStatus("not_found");
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      const status = error instanceof BulkRepositoryError ? error.status : undefined;
      setRecoveryStatus(status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "unavailable");
    }
  };

  // If page is accessed directly without selecting a file
  if (!selectedFile || !fileCheck) {
    return (
      <>
        <PageHeader
          title="Revisión de archivo"
          description="Comprobación preliminar de estructura antes de confirmar la importación."
          breadcrumbs={[
            { label: "Catálogo", to: "/carga-masiva" },
            { label: "Carga masiva", to: "/carga-masiva" },
            { label: "Revisión de archivo" },
          ]}
        />
        <Stack gap="lg">
          <EmptyState
            title="Ningún archivo seleccionado"
            description="Para revisar la estructura debe seleccionar primero un archivo CSV o XLSX en la pantalla de carga masiva."
            action={
              <Button
                component={Link}
                to="/carga-masiva"
                leftSection={<IconUpload size={18} stroke={2} aria-hidden="true" />}
              >
                Ir a selección de archivo
              </Button>
            }
          />
        </Stack>
      </>
    );
  }

  const handleConfirmImport = async (retryUncertain = false) => {
    if (admissionStatus === "pending") return;
    const task = beginAdmission(selectedFile, retryUncertain);
    if (!task) return;
    await runSingleFlight(isSubmittingRef, async () => {
      try {
        const batch = await bulkRepository.createImport(selectedFile, {
          detectedRows: fileCheck.detectedRows,
          correlationId: task.correlationId,
          ...(task.expectedBatchId && task.owner && task.contentHash ? {
            expectedBatchId: task.expectedBatchId,
            owner: task.owner,
            contentHash: task.contentHash,
          } : {}),
        });
        const isCurrentAdmission = finishAdmission(task, "accepted");
        if (isCurrentAdmission && pageIsActiveRef.current && task.isCurrent()) {
          // Navigate only when this review screen still owns the current operation.
          navigate(`/carga-masiva/importaciones/${batch.batch_id}`);
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "No se pudo iniciar la importación.";
        const category = err instanceof BulkRepositoryError ? err.category : "unknown";
        const status = category === "communication" || category === "unknown"
          ? "uncertain"
          : "ready";
        finishAdmission(task, status, { category, message });
      }
    });
  };

  const hasBlockingErrors = !fileCheck.valid;
  const admissionPending = admissionStatus === "pending";
  const admissionUncertain = admissionStatus === "uncertain";
  const admissionAlreadyAccepted = admissionStatus === "accepted";
  const admissionBlocked = admissionPending || admissionUncertain || admissionAlreadyAccepted;

  return (
    <>
      <PageHeader
        title="Revisión de archivo para importación"
        description="Verifica la estructura y columnas antes de enviar el lote a procesamiento asíncrono."
        breadcrumbs={[
          { label: "Catálogo", to: "/carga-masiva" },
          { label: "Carga masiva", to: "/carga-masiva" },
          { label: "Revisión de archivo" },
        ]}
        actions={
          <Group gap="xs">
            <Button
              component={Link}
              to="/carga-masiva"
              variant="outline"
              leftSection={<IconArrowLeft size={18} stroke={2} aria-hidden="true" />}
              disabled={admissionPending}
            >
              Cambiar archivo
            </Button>
            <Button
              leftSection={<IconCheck size={18} stroke={2} aria-hidden="true" />}
              onClick={() => void handleConfirmImport()}
              loading={admissionPending}
              disabled={admissionBlocked || hasBlockingErrors}
            >
              Confirmar importación
            </Button>
          </Group>
        }
      />

      <Stack gap="lg">
        {submissionError && (
          <FeedbackAlert
            semantic="error"
            title={
              submissionError.category === "rejected"
                ? "Archivo rechazado en la admisión"
                : submissionError.category === "configuration"
                  ? "Importación no disponible"
                  : submissionError.category === "communication"
                    ? "No se pudo completar la solicitud"
                    : "No se confirmó el resultado de admisión"
            }
          >
            {submissionError.message}
            {admissionUncertain && (
              <>
                <div>Se consulta el batchId determinista. Si el GET devuelve 404, el resultado sigue sin acreditarse y no se reenvía el archivo.</div>
                {pendingCorrelationId && <div>Correlación recuperada: {pendingCorrelationId}</div>}
                {recoveryStatus === "not_found" && <div>GET 404: lote no localizado; la admisión original permanece incierta.</div>}
                {recoveryStatus === "unauthorized" && <div>La sesión expiró. Inicia sesión con el propietario original antes de consultar.</div>}
                {recoveryStatus === "forbidden" && <div>La identidad original no tiene permiso para consultar el lote.</div>}
                {recoveryStatus === "unavailable" && <div>La consulta no está disponible; la intención sigue protegida.</div>}
                <Button variant="outline" onClick={() => void recheckImport()} loading={recoveryStatus === "loading"} disabled={!recoveryOwnerIsCurrent()}>Volver a consultar lote</Button>
              </>
            )}
          </FeedbackAlert>
        )}

        {admissionAlreadyAccepted && (
          <FeedbackAlert semantic="success" title="Archivo ya admitido">
            Este archivo ya fue admitido. No se enviará otra importación para el mismo archivo e identidad.
          </FeedbackAlert>
        )}

        <BulkFileReview check={fileCheck} />

        <Group justify="flex-end" gap="sm">
          <Button
            component={Link}
            to="/carga-masiva"
            variant="outline"
            disabled={admissionPending}
          >
            Volver
          </Button>
          <Button
            variant="outline"
            onClick={() => expectedBatchId && navigate(`/carga-masiva/importaciones/${expectedBatchId}`)}
            disabled={!admissionAlreadyAccepted || !expectedBatchId || !recoveryOwnerIsCurrent()}
          >
            Continuar seguimiento
          </Button>
          <Button
            leftSection={<IconCheck size={18} stroke={2} aria-hidden="true" />}
            onClick={() => void handleConfirmImport()}
            loading={admissionPending}
            disabled={admissionBlocked || hasBlockingErrors}
          >
            Confirmar importación
          </Button>
        </Group>
      </Stack>
    </>
  );
}
