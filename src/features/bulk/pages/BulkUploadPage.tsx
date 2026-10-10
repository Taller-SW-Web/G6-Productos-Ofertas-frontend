import { Link, useNavigate } from "react-router-dom";
import { Button, Group, Stack } from "@mantine/core";
import {
  IconArrowRight,
  IconDownload,
  IconFileSpreadsheet,
} from "@tabler/icons-react";
import {
  FeedbackAlert,
  FileSelection,
  PageHeader,
  SectionCard,
} from "../../../components/shared";
import { useBulkUploadContext } from "../context/BulkUploadContext";

export function BulkUploadPage() {
  const navigate = useNavigate();
  const { selectedFile, fileCheck, setSelectedFile, clearSelection } =
    useBulkUploadContext();

  const handleFileChange = async (file: File | null) => {
    await setSelectedFile(file);
  };

  const hasBlockingErrors = fileCheck ? !fileCheck.valid : false;
  const canContinue = selectedFile !== null && !hasBlockingErrors;

  return (
    <>
      <PageHeader
        title="Carga masiva de productos"
        description="Selecciona un archivo CSV o XLSX con la estructura requerida para dar de alta o actualizar productos en lote."
        breadcrumbs={[{ label: "Catálogo" }, { label: "Carga masiva" }]}
        actions={
          <Group gap="xs">
            <Button
              component={Link}
              to="/carga-masiva/descargas"
              variant="outline"
              leftSection={<IconDownload size={18} stroke={2} aria-hidden="true" />}
            >
              Descargar plantilla
            </Button>
            <Button
              component={Link}
              to="/carga-masiva/descargas"
              variant="outline"
              leftSection={<IconFileSpreadsheet size={18} stroke={2} aria-hidden="true" />}
            >
              Exportar catálogo
            </Button>
          </Group>
        }
      />

      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Flujo de carga masiva">
          Seleccione su archivo para realizar una comprobación local de formato y estructura. Podrá revisar las columnas detectadas antes de confirmar la importación asíncrona.
        </FeedbackAlert>

        <SectionCard
          title="Selección de archivo"
          description="Formatos admitidos: CSV delimitado por comas (.csv) o Microsoft Excel (.xlsx)"
        >
          <Stack gap="md">
            <FileSelection
              label="Archivo de catálogo"
              value={selectedFile}
              onChange={handleFileChange}
              description="Tamaño máximo recomendado: 25 MB. El archivo debe contener al menos las columnas de SKU y datos básicos."
              accept=".csv,.xlsx"
              error={
                fileCheck && !fileCheck.valid
                  ? fileCheck.errors.join(". ")
                  : undefined
              }
            />

            {fileCheck && fileCheck.warnings.length > 0 && (
              <FeedbackAlert
                semantic="warning"
                title="Aviso previo a la revisión"
              >
                {fileCheck.warnings[0]}
              </FeedbackAlert>
            )}

            <Group justify="flex-end" gap="sm">
              {selectedFile && (
                <Button variant="subtle" color="gray" onClick={clearSelection}>
                  Limpiar selección
                </Button>
              )}
              <Button
                rightSection={<IconArrowRight size={18} stroke={2} aria-hidden="true" />}
                onClick={() => navigate("/carga-masiva/revisar")}
                disabled={!canContinue}
              >
                Continuar a revisión
              </Button>
            </Group>
          </Stack>
        </SectionCard>
      </Stack>
    </>
  );
}
