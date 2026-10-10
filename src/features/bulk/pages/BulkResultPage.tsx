import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Group, Skeleton, Stack, Text } from "@mantine/core";
import {
  IconDownload,
  IconRotateClockwise,
  IconUpload,
  IconArrowLeft,
} from "@tabler/icons-react";
import {
  ConfirmDialog,
  EmptyState,
  FeedbackAlert,
  PageHeader,
} from "../../../components/shared";
import { BatchRowsTable } from "../components/BatchRowsTable";
import { BatchStatusPanel } from "../components/BatchStatusPanel";
import { useBulkBatch } from "../hooks/useBulkFlow";

export function BulkResultPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();
  const [confirmResumeOpen, setConfirmResumeOpen] = useState(false);

  const {
    batch,
    loading,
    error,
    resuming,
    downloadingReport,
    refreshBatch,
    resumeBatch,
    downloadReport,
  } = useBulkBatch(batchId);

  const handleConfirmResume = async () => {
    try {
      await resumeBatch();
      setConfirmResumeOpen(false);
      // After resuming, navigate to progress tracking S03 with same batchId
      navigate(`/carga-masiva/importaciones/${batchId}`);
    } catch {
      // Error handled in hook state
    }
  };

  return (
    <>
      <PageHeader
        title={`Resultado de importación: ${batchId ?? "Sin identificar"}`}
        description="Resumen consolidado del lote, resultados por fila y acciones de recuperación."
        breadcrumbs={[
          { label: "Carga masiva", to: "/carga-masiva" },
          {
            label: "Seguimiento",
            to: batchId ? `/carga-masiva/importaciones/${batchId}` : undefined,
          },
          { label: "Resultado del lote" },
        ]}
        actions={
          <Group gap="xs">
            <Button
              component={Link}
              to="/carga-masiva"
              variant="outline"
              leftSection={<IconUpload size={18} stroke={2} aria-hidden="true" />}
            >
              Nueva carga masiva
            </Button>
            {batch && batch.failed_rows > 0 && (
              <Button
                variant="outline"
                leftSection={<IconDownload size={18} stroke={2} aria-hidden="true" />}
                onClick={downloadReport}
                loading={downloadingReport}
              >
                Descargar reporte de errores
              </Button>
            )}
            {batch && batch.needs_reconciliation && (
              <Button
                leftSection={
                  <IconRotateClockwise size={18} stroke={2} aria-hidden="true" />
                }
                onClick={() => setConfirmResumeOpen(true)}
                loading={resuming}
              >
                Reanudar operaciones pendientes
              </Button>
            )}
          </Group>
        }
      />

      <Stack gap="lg">
        {loading && !batch && (
          <Stack gap="md" role="status" aria-label="Cargando resultado del lote">
            <Text size="sm">Cargando resultado del lote…</Text>
            <Skeleton height={140} radius="xs" />
            <Skeleton height={260} radius="xs" />
          </Stack>
        )}

        {error && (
          <FeedbackAlert
            semantic="error"
            title="Error al consultar el lote"
            actions={
              <Button size="xs" variant="outline" onClick={refreshBatch}>
                Reintentar consulta
              </Button>
            }
          >
            {error}
          </FeedbackAlert>
        )}

        {!loading && !batch && !error && (
          <EmptyState
            title="Lote no encontrado"
            description="No se encontró información para el identificador de lote especificado."
            action={
              <Button
                component={Link}
                to="/carga-masiva"
                leftSection={<IconArrowLeft size={18} stroke={2} aria-hidden="true" />}
              >
                Volver a carga masiva
              </Button>
            }
          />
        )}

        {batch && (
          <>
            <BatchStatusPanel
              batch={batch}
              onRefresh={refreshBatch}
              onResume={
                batch.needs_reconciliation
                  ? () => setConfirmResumeOpen(true)
                  : undefined
              }
              refreshing={loading}
              resuming={resuming}
              showNewUploadLink
            />

            <BatchRowsTable
              rows={batch.rows ?? []}
              caption={`Detalle de filas del lote ${batch.batch_id}`}
            />
          </>
        )}
      </Stack>

      <ConfirmDialog
        opened={confirmResumeOpen}
        title="Reanudar lote de importación"
        confirmLabel="Confirmar reanudación"
        onCancel={() => setConfirmResumeOpen(false)}
        onConfirm={handleConfirmResume}
        submitting={resuming}
      >
        <Stack gap="sm">
          <Text size="sm">
            Se reanudarán únicamente las filas que presentaron fallos o requieren
            reconciliación en Catálogo, Precios o Inventario.
          </Text>
          <Text size="sm" c="dimmed">
            Las filas y dominios confirmados previamente no serán duplicados ni
            reprocesados destructivamente. Identificador del lote: <strong>{batchId}</strong>.
          </Text>
        </Stack>
      </ConfirmDialog>
    </>
  );
}
