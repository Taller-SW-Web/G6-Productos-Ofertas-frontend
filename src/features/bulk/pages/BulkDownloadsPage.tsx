import { Button, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import {
  IconArrowLeft,
  IconDownload,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import {
  FeedbackAlert,
  PageHeader,
  SectionCard,
} from "../../../components/shared";
import { ExportJobPanel } from "../components/ExportJobPanel";
import { useBulkDownloads } from "../hooks/useBulkFlow";

export function BulkDownloadsPage() {
  const {
    exportJob,
    submittingExport,
    refreshingJob,
    downloadingExport,
    downloadingTemplate,
    error,
    requestExport,
    refreshJob,
    downloadExportFile,
    downloadTemplate,
  } = useBulkDownloads();

  return (
    <>
      <PageHeader
        title="Descargas y exportación masiva"
        description="Descarga de plantillas oficiales de carga y generación asíncrona del catálogo consolidado."
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
        {error && (
          <FeedbackAlert semantic="error" title="Observación en la descarga">
            {error}
          </FeedbackAlert>
        )}

        {/* Template Downloads Section */}
        <SectionCard
          title="Plantillas oficiales de importación"
          description="Estructura estándar de campos para la carga masiva de productos, variantes, precios y stock"
        >
          <Stack gap="md">
            <Text size="sm">
              Utilice estas plantillas para preparar sus archivos de catálogo. Cada archivo debe incluir las columnas requeridas (SKU, nombre, precio regular y moneda).
            </Text>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <SectionCard
                title="Plantilla CSV"
                description="Formato de texto delimitado por comas con codificación UTF-8"
              >
                <Stack gap="sm">
                  <Text size="xs" c="dimmed">
                    Recomendado para volúmenes grandes y procesamiento rápido.
                  </Text>
                  <Group justify="flex-end">
                    <Button
                      variant="outline"
                      size="sm"
                      leftSection={<IconDownload size={16} stroke={2} aria-hidden="true" />}
                      onClick={() => downloadTemplate("CSV")}
                      loading={downloadingTemplate}
                    >
                      Descargar plantilla CSV
                    </Button>
                  </Group>
                </Stack>
              </SectionCard>

              <SectionCard
                title="Plantilla XLSX"
                description="Libro de Microsoft Excel con hojas y validación de celdas"
              >
                <Stack gap="sm">
                  <Text size="xs" c="dimmed">
                    Formato para edición en hojas de cálculo tradicionales.
                  </Text>
                  <Group justify="flex-end">
                    <Button
                      variant="outline"
                      size="sm"
                      leftSection={<IconDownload size={16} stroke={2} aria-hidden="true" />}
                      onClick={() => downloadTemplate("XLSX")}
                      loading={downloadingTemplate}
                    >
                      Descargar plantilla XLSX
                    </Button>
                  </Group>
                </Stack>
              </SectionCard>
            </SimpleGrid>
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
        />
      </Stack>
    </>
  );
}
