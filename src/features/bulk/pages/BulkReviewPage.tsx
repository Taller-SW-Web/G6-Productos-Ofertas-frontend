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
import { bulkService } from "../services/bulkService";

export function BulkReviewPage() {
  const navigate = useNavigate();
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
    setSubmitting(true);
    setSubmissionError(null);
    try {
      const batch = await bulkService.createImport(selectedFile);
      setSubmitting(false);
      // Navigate to tracking screen S03
      navigate(`/carga-masiva/importaciones/${batch.batch_id}`);
    } catch (err: unknown) {
      setSubmitting(false);
      const message =
        err instanceof Error
          ? err.message
          : "El servicio no pudo admitir el lote de importación.";
      setSubmissionError(message);
    }
  };

  const hasBlockingErrors = !fileCheck.valid;

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
              disabled={submitting || hasBlockingErrors}
            >
              Confirmar importación
            </Button>
          </Group>
        }
      />

      <Stack gap="lg">
        {submissionError && (
          <FeedbackAlert semantic="error" title="Rechazo en la admisión del lote">
            {submissionError}
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
            disabled={submitting || hasBlockingErrors}
          >
            Confirmar importación
          </Button>
        </Group>
      </Stack>
    </>
  );
}
