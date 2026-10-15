import { useContext, useState } from "react";
import { Button, Group, Radio, Stack } from "@mantine/core";
import {
  IconArrowLeft,
  IconDownload,
} from "@tabler/icons-react";
import { DataModeContext } from "../../../app/config/DataModeContext";
import { Link, useSearchParams } from "react-router-dom";
import {
  FeedbackAlert,
  PageHeader,
  SectionCard,
} from "../../../components/shared";
import { ExportJobPanel } from "../components/ExportJobPanel";
import { useBulkDownloads } from "../hooks/useBulkFlow";
import type { BulkExportFormat } from "../types/bulk";

export function BulkDownloadsPage() {
  const dataMode = useContext(DataModeContext);
  const [searchParams] = useSearchParams();
  const initialExportId = searchParams.get("export_id") ?? undefined;
  const [templateFormat, setTemplateFormat] = useState<BulkExportFormat>("CSV");

  const {
    exportJob,
    submittingExport,
    refreshingJob,
    downloadingExport,
    downloadingTemplate,
    error,
    initialQueryStatus,
    initialQueryError,
    requestExport,
    refreshJob,
    retryInitialQuery,
    downloadExportFile,
    downloadTemplate,
  } = useBulkDownloads(initialExportId);

  return (
    <>
      <PageHeader
        title="Descargas y exportación masiva"
        description="Descarga de archivos de ejemplo de carga y generación asíncrona del catálogo consolidado."
        breadcrumbs={[
          { label: "Carga masiva", to: "/carga-masiva" },
          { label: "Descargas y exportación" },
        ]}
        actions={
          <Button
            component={Link}
            to="/carga-masiva"
            variant="outline"
            leftSection={<IconArrowLeft size={18} stroke={2} aria-hidden="true" />}
          >
            Volver a carga de archivo
          </Button>
        }
      />

      <Stack gap="lg">
        {initialQueryStatus === "loading" && (
          <FeedbackAlert semantic="info" title="Consultando exportación">
            Consultando el trabajo {initialExportId}…
          </FeedbackAlert>
        )}
        {initialQueryStatus === "not_found" && (
          <FeedbackAlert semantic="warning" title="Exportación no encontrada">
            No existe un trabajo de exportación con identificador {initialExportId}.
          </FeedbackAlert>
        )}
        {initialQueryError && (
          <FeedbackAlert
            semantic="error"
            title="No se pudo consultar la exportación"
            actions={
              <Button size="xs" variant="outline" onClick={retryInitialQuery}>
                Reintentar consulta
              </Button>
            }
          >
            {initialQueryError}
          </FeedbackAlert>
        )}
        {error && (
          <FeedbackAlert semantic="error" title="Observación en la descarga">
            {error}
          </FeedbackAlert>
        )}

        {/* Template Downloads Section */}
        <SectionCard
          title="Archivos de ejemplo para importación"
          description="Estructura de referencia para preparar archivos de importación masiva"
        >
          <Stack gap="md">
            <FeedbackAlert semantic="info" title="Disponibilidad de plantillas oficiales">
              La plantilla oficial estará disponible cuando se habilite el servicio de carga masiva. Para pruebas y demostración se ofrece el archivo CSV de muestra.
            </FeedbackAlert>

            <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
              <Radio.Group
                label="Formato de plantilla"
                description="La muestra CSV es ficticia; el modo mock no incluye una plantilla XLSX."
                value={templateFormat}
                onChange={(value) => setTemplateFormat(value as BulkExportFormat)}
              >
                <Group mt="xs" gap="lg">
                  <Radio value="CSV" label="CSV de ejemplo" />
                  <Radio value="XLSX" label="XLSX" />
                </Group>
              </Radio.Group>
              <Button
                variant="outline"
                size="sm"
                leftSection={<IconDownload size={16} stroke={2} aria-hidden="true" />}
                onClick={() => downloadTemplate(templateFormat)}
                loading={downloadingTemplate}
                disabled={downloadingTemplate}
              >
                Descargar {templateFormat} {templateFormat === "CSV" ? "de ejemplo" : ""}
              </Button>
            </Group>
          </Stack>
        </SectionCard>

        {/* Catalog Export Section */}
        <ExportJobPanel
          job={exportJob}
          onRequestExport={requestExport}
          onRefreshJob={refreshJob}
          onDownloadExport={downloadExportFile}
          submitting={submittingExport}
          refreshing={refreshingJob}
          downloading={downloadingExport}
          dataMode={dataMode ?? "mock"}
        />
      </Stack>
    </>
  );
}
