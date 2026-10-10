import { Button, Group, SimpleGrid, Stack } from "@mantine/core";
import { IconRefresh, IconArrowRight, IconRotateClockwise, IconUpload } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import {
  FeedbackAlert,
  MetricCard,
  SectionCard,
  StatusBadge,
} from "../../../components/shared";
import type { BulkImportBatch } from "../types/bulk";

export interface BatchStatusPanelProps {
  batch: BulkImportBatch;
  onRefresh?: () => void;
  onResume?: () => void;
  refreshing?: boolean;
  resuming?: boolean;
  showDetailsLink?: boolean;
  showNewUploadLink?: boolean;
}

export function BatchStatusPanel({
  batch,
  onRefresh,
  onResume,
  refreshing = false,
  resuming = false,
  showDetailsLink = false,
  showNewUploadLink = false,
}: BatchStatusPanelProps) {
  const isTerminal =
    batch.status === "COMPLETED" || batch.status === "FAILED_GENERAL";
  const isPartial = batch.status === "COMPLETED" && batch.failed_rows > 0;
  const isSuccess = batch.status === "COMPLETED" && batch.failed_rows === 0;
  const isFailedGeneral = batch.status === "FAILED_GENERAL";
  const isProcessing = batch.status === "PROCESSING";
  const isQueued = batch.status === "QUEUED";

  // Semantic presentation for StatusBadge
  const statusSemantic = isSuccess
    ? "success"
    : isPartial || isProcessing
      ? "warning"
      : isFailedGeneral
        ? "error"
        : "neutral";

  const statusLabel = isSuccess
    ? "Completado"
    : isPartial
      ? "Completado con observaciones"
      : isFailedGeneral
        ? "Fallo general"
        : isProcessing
          ? "Procesando lote"
          : "En cola de procesamiento";

  return (
    <SectionCard
      title={`Lote de importación: ${batch.batch_id}`}
      description={
        batch.file_name
          ? `Archivo de origen: ${batch.file_name} · Actualizado: ${new Date(batch.updated_at).toLocaleTimeString("es-PE")}`
          : `Actualizado: ${new Date(batch.updated_at).toLocaleTimeString("es-PE")}`
      }
      actions={
        <Group gap="sm">
          <StatusBadge semantic={statusSemantic} size="md">
            {statusLabel}
          </StatusBadge>
          {onRefresh && (
            <Button
              variant="outline"
              size="xs"
              leftSection={<IconRefresh size={16} stroke={2} aria-hidden="true" />}
              onClick={onRefresh}
              loading={refreshing}
            >
              Actualizar estado
            </Button>
          )}
        </Group>
      }
    >
      <Stack gap="lg">
        {/* KPI Metrics */}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <MetricCard
            label="Total de filas"
            value={batch.total_rows}
            description="Filas declaradas en el archivo"
          />
          <MetricCard
            label="Filas completadas"
            value={batch.completed_rows}
            description={
              isProcessing
                ? `${batch.completed_rows} de ${batch.total_rows} filas concluidas`
                : "Aplicadas en dominios"
            }
          />
          <MetricCard
            label="Filas con fallos"
            value={batch.failed_rows}
            description={
              batch.needs_reconciliation
                ? "Requieren reconciliación"
                : "Sin rechazos registrados"
            }
          />
        </SimpleGrid>

        {/* Feedback Alert according to batch state */}
        {isSuccess && (
          <FeedbackAlert semantic="success" title="Importación completada satisfactoriamente">
            Todas las {batch.total_rows} filas del catálogo fueron inicializadas correctamente en Catálogo, Precios e Inventario.
          </FeedbackAlert>
        )}

        {isPartial && (
          <FeedbackAlert
            semantic="warning"
            title="Importación completada con observaciones"
          >
            Se procesaron {batch.completed_rows} filas exitosamente y {batch.failed_rows} presentaron rechazo en algún dominio.
            {batch.needs_reconciliation &&
              " Los dominios completados conservan sus registros (no hay rollback destructivo). Puede descargar el reporte de errores o reanudar el lote para reintentar operaciones pendientes."}
          </FeedbackAlert>
        )}

        {isFailedGeneral && (
          <FeedbackAlert
            semantic="error"
            title="Fallo general en la importación"
          >
            No se pudo completar el procesamiento del lote. Los servicios de Catálogo, Precios o Inventario no admitieron la solicitud o el archivo presentó inconsistencias críticas.
          </FeedbackAlert>
        )}

        {isProcessing && (
          <FeedbackAlert semantic="info" title="Lote en procesamiento asíncrono">
            El servicio se encuentra procesando las filas en Catálogo, Precios e Inventario. Pulse &quot;Actualizar estado&quot; para comprobar el avance.
          </FeedbackAlert>
        )}

        {isQueued && (
          <FeedbackAlert semantic="info" title="Solicitud admitida en cola">
            La importación ha sido admitida por el proveedor (202 Accepted) y está a la espera de un hilo de procesamiento.
          </FeedbackAlert>
        )}

        {/* Action buttons */}
        <Group justify="flex-end" gap="sm">
          {onResume && batch.needs_reconciliation && (
            <Button
              variant="outline"
              leftSection={<IconRotateClockwise size={18} stroke={2} aria-hidden="true" />}
              onClick={onResume}
              loading={resuming}
            >
              Reanudar lote
            </Button>
          )}

          {showDetailsLink && isTerminal && (
            <Button
              component={Link}
              to={`/carga-masiva/importaciones/${batch.batch_id}/resultado`}
              rightSection={<IconArrowRight size={18} stroke={2} aria-hidden="true" />}
            >
              Ver resultado final
            </Button>
          )}

          {showNewUploadLink && (
            <Button
              component={Link}
              to="/carga-masiva"
              variant="light"
              leftSection={<IconUpload size={18} stroke={2} aria-hidden="true" />}
            >
              Nueva carga masiva
            </Button>
          )}
        </Group>
      </Stack>
    </SectionCard>
  );
}
