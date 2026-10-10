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

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <SectionCard
                title="Archivo CSV de ejemplo (Demostración)"
                description="Formato de texto delimitado por comas con codificación UTF-8"
              >
                <Stack gap="sm">
                  <Text size="xs" c="dimmed">
                    Contiene datos de muestra ficticios para validar la estructura del flujo.
                  </Text>
                  <Group justify="flex-end">
                    <Button
                      variant="outline"
                      size="sm"
                      leftSection={<IconDownload size={16} stroke={2} aria-hidden="true" />}
                      onClick={() => downloadTemplate("CSV")}
                      loading={downloadingTemplate}
                    >
                      Descargar CSV de ejemplo
                    </Button>
                  </Group>
                </Stack>
              </SectionCard>

              <SectionCard
                title="Plantilla XLSX"
                description="Libro de Microsoft Excel con validación de celdas"
              >
                <Stack gap="sm">
                  <Text size="xs" c="dimmed">
                    Plantilla oficial pendiente de publicación por el proveedor de catálogo.
                  </Text>
                  <Group justify="flex-end">
                    <Button
                      variant="outline"
                      size="sm"
                      leftSection={<IconDownload size={16} stroke={2} aria-hidden="true" />}
                      disabled
                    >
                      No disponible en demo
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
