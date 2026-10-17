import { useState } from "react";
import { Button, Group, Radio, Stack, Text } from "@mantine/core";
import { IconDownload, IconFileSpreadsheet, IconRefresh } from "@tabler/icons-react";
import { FeedbackAlert, SectionCard, StatusBadge } from "../../../components/shared";
import type { BulkExportFormat, BulkExportJob } from "../types/bulk";
import type { DataMode } from "../../../app/config/dataMode";

export interface ExportJobPanelProps {
  job: BulkExportJob | null;
  onRequestExport: (format: BulkExportFormat) => Promise<void>;
  onRefreshJob: () => Promise<void>;
  onDownloadExport: () => Promise<void>;
  submitting?: boolean;
  refreshing?: boolean;
  downloading?: boolean;
  // True when the visible job snapshot is no longer confirmed by the latest
  // query. A stale snapshot never authorizes a download.
  stale?: boolean;
  dataMode: DataMode;
}

export function ExportJobPanel({
  job,
  onRequestExport,
  onRefreshJob,
  onDownloadExport,
  submitting = false,
  refreshing = false,
  downloading = false,
  stale = false,
  dataMode,
}: ExportJobPanelProps) {
  const [selectedFormat, setSelectedFormat] = useState<BulkExportFormat>("CSV");

  const isCompleted = job?.status === "COMPLETED";
  const isProcessing = job?.status === "PROCESSING";
  const isQueued = job?.status === "QUEUED";
  const isFailed = job?.status === "FAILED_GENERAL";

  // Only a completed, current job with a genuine downloadable resource may be
  // downloaded. Mock mode exposes a real CSV artifact and never fakes XLSX.
  const canDownload =
    isCompleted && !stale && (dataMode === "api" || job?.format === "CSV");

  return (
    <SectionCard
      title="Exportación masiva del catálogo"
      description="Genera un archivo consolidado asíncrono con productos, precios base/oferta y existencias de inventario"
    >
      <Stack gap="lg">
        <Text size="xs" c="dimmed">
          {dataMode === "mock"
            ? "Modo demostración · Generación asíncrona simulada de exportación"
            : "Trabajo de exportación completo del catálogo, sin filtros adicionales"}
        </Text>
        <Text size="sm">
          La exportación procesa la totalidad del catálogo activo en segundo plano sin bloquear las consultas transaccionales.
        </Text>

        {/* Format selector & Request action */}
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
          <Radio.Group
            label="Formato de exportación"
            description="Seleccione el formato consolidado requerido"
            value={selectedFormat}
            onChange={(val) => setSelectedFormat(val as BulkExportFormat)}
          >
            <Group mt="xs" gap="lg">
              <Radio value="CSV" label="CSV (Valores separados por comas)" />
              <Radio value="XLSX" label="XLSX (Libro de Excel)" />
            </Group>
          </Radio.Group>

          <Button
            leftSection={<IconFileSpreadsheet size={18} stroke={2} aria-hidden="true" />}
            onClick={() => onRequestExport(selectedFormat)}
            loading={submitting}
            disabled={submitting}
          >
            Solicitar exportación
          </Button>
        </Group>

        {/* Active Job Tracking */}
        {job && (
          <SectionCard
            title={`Trabajo de exportación: ${job.export_id}`}
            description={`Formato solicitado: ${job.format} · Actualizado: ${new Date(job.updated_at).toLocaleTimeString("es-PE")}`}
            actions={
              <Group gap="xs">
                {isCompleted && <StatusBadge semantic="success">Exportación terminada</StatusBadge>}
                {isProcessing && <StatusBadge semantic="warning">Generando archivo…</StatusBadge>}
                {isQueued && <StatusBadge semantic="neutral">En cola</StatusBadge>}
                {isFailed && <StatusBadge semantic="error">Fallo de exportación</StatusBadge>}

                {(!isCompleted || stale) && !isFailed && (
                  <Button
                    variant="outline"
                    size="xs"
                    leftSection={<IconRefresh size={14} stroke={2} aria-hidden="true" />}
                    onClick={onRefreshJob}
                    loading={refreshing}
                  >
                    Actualizar estado
                  </Button>
                )}
              </Group>
            }
          >
            <Stack gap="md">
              {isQueued && (
                <FeedbackAlert semantic="info" title="Solicitud recibida en cola">
                  {dataMode === "mock"
                    ? "La demostración mock recibió la solicitud y espera iniciar la consolidación."
                    : "El provider informó la admisión del trabajo, que permanece pendiente de consolidación."}
                </FeedbackAlert>
              )}

              {isProcessing && (
                <FeedbackAlert semantic="info" title="Consolidando catálogo">
                  {dataMode === "mock"
                    ? "La demostración simula la consolidación del snapshot. Pulse &quot;Actualizar estado&quot; para consultar el estado."
                    : "El provider informó que está consolidando el catálogo. Pulse &quot;Actualizar estado&quot; para consultar el estado."}
                </FeedbackAlert>
              )}

              {isCompleted && (
                <FeedbackAlert
                    semantic={job.format === "CSV" || dataMode === "api" ? "success" : "warning"}
                    title={
                      job.format === "CSV" || dataMode === "api"
                        ? "Exportación terminada"
                        : "XLSX completado sin archivo descargable"
                    }
                  >
                    {job.format === "CSV"
                      ? `${job.file_name ?? "catalogo_exportado.csv"}${dataMode === "mock" ? " · Archivo de demostración listo para descargar." : ""}`
                      : dataMode === "mock"
                        ? "La demostración no genera libros XLSX ni renombra un CSV como XLSX."
                        : "El provider informó que el trabajo terminó. Solicita el archivo mediante la acción de descarga."}
                </FeedbackAlert>
              )}

              {isFailed && (
                <FeedbackAlert semantic="error" title="No se pudo completar la exportación">
                  {job.error_message ?? "El servicio no pudo generar el archivo consolidado."}
                </FeedbackAlert>
              )}

              {isCompleted && stale && (
                <FeedbackAlert semantic="warning" title="Información de exportación desactualizada">
                  La consulta más reciente no confirmó el estado actual de {job.export_id}. La descarga permanece deshabilitada hasta actualizar o reintentar la consulta.
                </FeedbackAlert>
              )}

              <Group justify="flex-end">
                <Button
                  leftSection={<IconDownload size={18} stroke={2} aria-hidden="true" />}
                  onClick={onDownloadExport}
                  loading={downloading}
                  disabled={!canDownload}
                >
                  {job.format === "CSV"
                    ? "Descargar archivo CSV consolidado"
                    : dataMode === "mock"
                      ? "Descarga XLSX no disponible en demo"
                      : "Descargar archivo XLSX consolidado"}
                </Button>
              </Group>
            </Stack>
          </SectionCard>
        )}
      </Stack>
    </SectionCard>
  );
}
