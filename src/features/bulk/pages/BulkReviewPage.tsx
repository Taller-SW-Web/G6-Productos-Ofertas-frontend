import { useRef } from "react";
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

export function BulkReviewPage() {
  const navigate = useNavigate();
  const bulkRepository = useBulkRepository();
  const isSubmittingRef = useRef(false);
  const {
    selectedFile,
    fileCheck,
    submitting,
    setSubmitting,
    submissionError,
    setSubmissionError,
  } = useBulkUploadContext();

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

  const handleConfirmImport = async () => {
    if (submitting || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setSubmissionError(null);
    try {
      const batch = await bulkRepository.createImport(selectedFile, {
        detectedRows: fileCheck.detectedRows,
      });
      // Navigate to tracking screen S03
      navigate(`/carga-masiva/importaciones/${batch.batch_id}`);
    } catch (err: unknown) {
      isSubmittingRef.current = false;
      setSubmitting(false);
      const message =
        err instanceof Error
          ? err.message
          : "El servicio no pudo admitir el lote de importación.";
      const category = err instanceof BulkRepositoryError ? err.category : "unknown";
      setSubmissionError({ category, message });
    }
  };

  const hasBlockingErrors = !fileCheck.valid;
  const admissionUnknown = submissionError?.category === "unknown";

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
              disabled={submitting}
            >
              Cambiar archivo
            </Button>
            <Button
              leftSection={<IconCheck size={18} stroke={2} aria-hidden="true" />}
              onClick={handleConfirmImport}
              loading={submitting}
              disabled={submitting || hasBlockingErrors || admissionUnknown}
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
                  ? "Servicio de carga masiva no configurado"
                  : submissionError.category === "communication"
                    ? "No se pudo comunicar con el servicio"
                    : "No se confirmó el resultado de admisión"
            }
          >
            {submissionError.message}
            {submissionError.category === "unknown" && (
              <div>Consulta el lote antes de intentar enviar el archivo otra vez.</div>
            )}
          </FeedbackAlert>
        )}

        <BulkFileReview check={fileCheck} />

        <Group justify="flex-end" gap="sm">
          <Button
            component={Link}
            to="/carga-masiva"
            variant="outline"
            disabled={submitting}
          >
            Volver
          </Button>
          <Button
            leftSection={<IconCheck size={18} stroke={2} aria-hidden="true" />}
            onClick={handleConfirmImport}
            loading={submitting}
            disabled={submitting || hasBlockingErrors || admissionUnknown}
          >
            Confirmar importación
          </Button>
        </Group>
      </Stack>
    </>
  );
}
