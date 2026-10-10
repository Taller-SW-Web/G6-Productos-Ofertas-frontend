import { SimpleGrid, Stack, Text } from "@mantine/core";
import {
  EntityTable,
  FeedbackAlert,
  MetricCard,
  type TableColumn,
  StatusBadge,
} from "../../../components/shared";
import { sampleImportRows } from "../mocks/prices";

type Row = (typeof sampleImportRows)[number];
const columns: TableColumn<Row>[] = [
  { key: "row", header: "Fila", width: 80, render: (row) => row.id },
  { key: "sku", header: "SKU", width: 160, render: (row) => row.sku },
  {
    key: "status",
    header: "Resultado",
    width: 200,
    render: (row) => (
      <StatusBadge semantic={row.failed ? "error" : "success"}>
        {row.status}
      </StatusBadge>
    ),
  },
  { key: "detail", header: "Detalle", render: (row) => row.detail },
];
export function ImportResultExample() {
  return (
    <Stack gap="lg">
      <FeedbackAlert
        semantic="warning"
        title="Completado parcialmente — ejemplo"
      >
        Fixture de S05 con 2 filas confirmadas y 1 rechazada. No proviene de un
        archivo seleccionado ni de un lote real.
      </FeedbackAlert>
      <SimpleGrid cols={3} spacing="lg">
        <MetricCard label="Total de filas" value="3" />
        <MetricCard label="Confirmadas" value="2" />
        <MetricCard label="Rechazadas" value="1" />
      </SimpleGrid>
      <EntityTable
        caption="Resultado por fila del fixture de Pricing"
        columns={columns}
        rows={sampleImportRows}
        rowKey={(row) => row.id}
        state={{ status: "success" }}
        empty={{
          title: "Detalle no disponible",
          description: "La ausencia de filas no acredita éxito.",
        }}
      />
      <Text size="sm">
        Las filas confirmadas se conservan. La recuperación de Pricing requiere
        corregir el archivo y revisar un nuevo intento; no se ofrece reanudar el
        lote.
      </Text>
      <Text size="sm" c="dimmed">
        La descarga del reporte y el seguimiento del lote requieren implementar
        el adapter correspondiente.
      </Text>
    </Stack>
  );
}
