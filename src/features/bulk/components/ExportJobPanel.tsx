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
  dataMode,
}: ExportJobPanelProps) {
  const [selectedFormat, setSelectedFormat] = useState<BulkExportFormat>("CSV");

  const isCompleted = job?.status === "COMPLETED";
  const isProcessing = job?.status === "PROCESSING";
  const isQueued = job?.status === "QUEUED";
  const isFailed = job?.status === "FAILED_GENERAL";

  const canDownload =
    isCompleted && (job?.format === "CSV" || dataMode === "api");

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

                {!isCompleted && !isFailed && (
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
                  Extrayendo snapshot de Catálogo, Pricing e Inventario. Pulse &quot;Actualizar estado&quot; para consultar el estado.
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
                        : "El trabajo terminó y el archivo está disponible según el provider API configurado."}
                </FeedbackAlert>
              )}

              {isFailed && (
                <FeedbackAlert semantic="error" title="No se pudo completar la exportación">
                  {job.error_message ?? "El servicio no pudo generar el archivo consolidado."}
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
