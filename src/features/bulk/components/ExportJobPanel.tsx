import { useState } from "react";
import { Button, Group, Radio, Stack, Text } from "@mantine/core";
import { IconDownload, IconFileSpreadsheet, IconRefresh } from "@tabler/icons-react";
import { FeedbackAlert, SectionCard, StatusBadge } from "../../../components/shared";
import type { BulkExportFormat, BulkExportJob } from "../types/bulk";

export interface ExportJobPanelProps {
  job: BulkExportJob | null;
  onRequestExport: (format: BulkExportFormat) => Promise<void>;
  onRefreshJob: () => Promise<void>;
  onDownloadExport: () => Promise<void>;
  submitting?: boolean;
  refreshing?: boolean;
  downloading?: boolean;
}

export function ExportJobPanel({
  job,
  onRequestExport,
  onRefreshJob,
  onDownloadExport,
  submitting = false,
  refreshing = false,
  downloading = false,
}: ExportJobPanelProps) {
  const [selectedFormat, setSelectedFormat] = useState<BulkExportFormat>("CSV");

  const isCompleted = job?.status === "COMPLETED";
  const isProcessing = job?.status === "PROCESSING";
  const isQueued = job?.status === "QUEUED";
  const isFailed = job?.status === "FAILED_GENERAL";

  return (
    <SectionCard
      title="Exportación masiva del catálogo"
      description="Genera un archivo consolidado asíncrono con productos, precios base/oferta y existencias de inventario"
    >
      <Stack gap="lg">
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
                {isCompleted && <StatusBadge semantic="success">Exportación lista</StatusBadge>}
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
                    Actualizar
                  </Button>
                )}
              </Group>
            }
          >
            <Stack gap="md">
              {isQueued && (
                <FeedbackAlert semantic="info" title="Solicitud en cola (202 Accepted)">
                  El trabajo de exportación fue recibido y está en espera de consolidación.
                </FeedbackAlert>
              )}

              {isProcessing && (
                <FeedbackAlert semantic="info" title="Consolidando catálogo">
                  Extrayendo snapshot de Catálogo, Pricing e Inventario. Pulse &quot;Actualizar&quot; para comprobar cuando esté terminado.
                </FeedbackAlert>
              )}

              {isCompleted && (
                <FeedbackAlert semantic="success" title="Archivo consolidado disponible">
                  {job.file_name} · {job.file_size ? `${(job.file_size / 1024).toFixed(1)} KB` : "Listo para descarga"}
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
                  disabled={!isCompleted}
                >
                  Descargar archivo consolidado
                </Button>
              </Group>
            </Stack>
          </SectionCard>
        )}
      </Stack>
    </SectionCard>
  );
}
