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
import { useBulkAdmissionRecovery } from "../hooks/useBulkAdmissionRecovery";
import { runSingleFlight } from "../utils/asyncGuards";

export function BulkReviewPage() {
  const navigate = useNavigate();
  const bulkRepository = useBulkRepository();
  const { view: reconciliationView, reconcileAgain } = useBulkAdmissionRecovery();
  const isSubmittingRef = useRef(false);
  const pageIsActiveRef = useRef(true);
  const [replaySubmitting, setReplaySubmitting] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const {
    selectedFile,
    fileCheck,
    admissionStatus,
    pendingCorrelationId,
    pendingAdmission,
    expectedBatchId,
    recoveryOwnerIsCurrent,
    beginAdmission,
    finishAdmission,
    confirmReconciliation,
    submissionError,
  } = useBulkUploadContext();

  useEffect(() => {
    pageIsActiveRef.current = true;
    return () => {
      pageIsActiveRef.current = false;
    };
  }, []);

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
          {pendingAdmission && (
            <FeedbackAlert semantic="warning" title="Admisión incierta recuperada">
              <p>{reconciliationView.message}</p>
              <p>Correlación conservada: {pendingAdmission.correlationId}</p>
              {(reconciliationView.status === "timed_out" || reconciliationView.status === "authentication_required" || reconciliationView.status === "blocked") && (
                <Button variant="outline" onClick={reconcileAgain}>Volver a conciliar</Button>
              )}
            </FeedbackAlert>
          )}
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
          ...(task.owner && task.contentHash ? {
            owner: task.owner,
            contentHash: task.contentHash,
          } : {}),
        });
        const isCurrentAdmission = finishAdmission(task, "accepted", null, batch.batch_id);
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

  const handleReplaySameIntent = async () => {
    if (!selectedFile || !pendingAdmission || !bulkRepository.replaySupported || !recoveryOwnerIsCurrent() || replaySubmitting) return;
    if (!window.confirm("¿Reintentar exactamente la misma intención? Se conservarán el archivo, SHA-256, usuario y X-Correlation-Id originales.")) return;
    setReplaySubmitting(true);
    setReplayError(null);
    try {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await selectedFile.arrayBuffer()));
      const contentHash = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
      if (contentHash !== pendingAdmission.contentHash) throw new Error("Selecciona el archivo original; su SHA-256 no coincide con la intención incierta.");
      const batch = await bulkRepository.replayImport?.(selectedFile, {
        owner: pendingAdmission.owner,
        contentHash,
        correlationId: pendingAdmission.correlationId,
      }, true);
      if (!batch) throw new Error("El repositorio no habilitó el replay idempotente.");
      if (confirmReconciliation(pendingAdmission, batch.batch_id)) navigate(`/carga-masiva/importaciones/${batch.batch_id}`);
      else throw new Error("La sesión o el marcador cambiaron; se conserva la admisión incierta.");
    } catch (error) {
      setReplayError(error instanceof Error ? error.message : "No se pudo repetir la misma intención.");
    } finally {
      setReplaySubmitting(false);
    }
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
                <div>{reconciliationView.message}</div>
                {pendingCorrelationId && <div>Correlación recuperada: {pendingCorrelationId}</div>}
                {reconciliationView.status === "timed_out" && (
                  <Group mt="sm" gap="sm">
                    <Button variant="outline" onClick={reconcileAgain}>
                      Volver a conciliar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void handleReplaySameIntent()}
                      loading={replaySubmitting}
                      disabled={!bulkRepository.replaySupported || !selectedFile || !pendingAdmission || !recoveryOwnerIsCurrent()}
                    >
                      Reintentar la misma intención
                    </Button>
                  </Group>
                )}
                {replayError && <div role="alert">{replayError}</div>}
                {reconciliationView.status === "timed_out" && !bulkRepository.replaySupported && (
                  <div>El replay permanece bloqueado hasta acreditar idempotencia concurrente del backend.</div>
                )}
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
