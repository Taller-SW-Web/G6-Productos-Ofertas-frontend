import { useState } from "react";
import { Button, Group, SimpleGrid, Text } from "@mantine/core";
import { Link, useParams } from "react-router-dom";
import {
  EmptyState,
  FeedbackAlert,
  MetricCard,
} from "../../../components/shared";
import { usePricingContext } from "../hooks/usePricingContext";
import { usePriceBatch } from "../hooks/usePriceBatch";
import type { BatchScenario } from "../services/pricingModels";
import { PricingPageFrame } from "../components/PricingPageFrame";
import { PricingScenarioControl } from "../components/PricingScenarioControl";
import { ImportRowsTable } from "../components/ImportRowsTable";

const labels = {
  QUEUED: "Solicitud recibida — en cola",
  PROCESSING: "En proceso",
  COMPLETED: "Completado",
  PARTIAL: "Completado parcialmente",
  FAILED: "Fallido",
};
export function PriceImportResultPage() {
  const { batchId = "" } = useParams();
  return (
    <PricingPageFrame
      title="Resultado de importación"
      description="Consulta el estado y los resultados publicados de un lote identificado."
    >
      <BatchContent key={batchId} id={batchId} />
    </PricingPageFrame>
  );
}
function BatchContent({ id }: { id: string }) {
  const context = usePricingContext();
  const [scenario, setScenario] = useState<BatchScenario>("default");
  const response = usePriceBatch(id, scenario);
  const batch =
    response.state.status === "success"
      ? response.state.result
      : response.previous;
  const fresh = response.state.status === "success";
  const terminal =
    batch && ["PARTIAL", "COMPLETED", "FAILED"].includes(batch.status);
  return (
    <>
      <Text size="sm" fw={600}>
        Lote: {id}
      </Text>
      <PricingScenarioControl
        visible={context.review}
        value={scenario}
        onChange={(value) => {
          response.report.clear();
          setScenario(value);
        }}
        label="Escenario del lote"
        options={[
          { value: "default", label: "Parcial: 2 confirmadas y 1 rechazada" },
          { value: "queued", label: "En cola" },
          { value: "processing", label: "En proceso" },
          { value: "completed", label: "Completado" },
          { value: "failed", label: "Fallido" },
          { value: "no-rows", label: "Detalle de filas ausente" },
          { value: "error", label: "Error de refresco" },
          { value: "loading", label: "Cargando" },
          { value: "forbidden", label: "Sin autorización" },
        ]}
      />
      <Group gap="sm">
        <Button variant="outline" onClick={response.refresh}>
          Consultar estado
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setScenario("default");
            response.refresh();
          }}
        >
          Recuperar consulta del ejemplo
        </Button>
      </Group>
      {response.state.status === "loading" && (
        <Text size="sm" role="status">
          Consultando estado del lote…
        </Text>
      )}
      {response.state.status === "error" && (
        <FeedbackAlert semantic="error" title="No se pudo actualizar el lote">
          {response.state.message}
        </FeedbackAlert>
      )}
      {batch && (
        <>
          {!fresh && (
            <FeedbackAlert semantic="warning" title="Última consulta del lote">
              Se conserva el último resultado conocido. No acredita una
              actualización; la descarga está bloqueada.
            </FeedbackAlert>
          )}
          <FeedbackAlert
            semantic={
              batch.status === "PARTIAL"
                ? "warning"
                : batch.status === "FAILED"
                  ? "error"
                  : batch.status === "COMPLETED"
                    ? "success"
                    : "info"
            }
            title={labels[batch.status]}
          >
            Política del lote:{" "}
            {batch.allowPartial
              ? "Permitir resultados parciales"
              : "Rechazar el lote si hay errores"}
            .{" "}
            {terminal
              ? "El resultado corresponde a una respuesta ficticia terminal."
              : "La admisión no confirma que los precios se hayan actualizado. No hay reporte terminal disponible."}
          </FeedbackAlert>
          <SimpleGrid cols={3} spacing="lg">
            <MetricCard label="Total de filas" value={String(batch.total)} />
            <MetricCard label="Confirmadas" value={String(batch.completed)} />
            <MetricCard label="Rechazadas" value={String(batch.failed)} />
          </SimpleGrid>
          {batch.rows ? (
            <ImportRowsTable
              caption="Resultados por fila del lote ficticio"
              rows={batch.rows}
            />
          ) : (
            <EmptyState
              title="Detalle de filas no disponible"
              description="La ausencia de filas no implica que todas se hayan confirmado."
            />
          )}
          <Group gap="sm">
            <Button
              variant="outline"
              disabled={!terminal || !fresh || response.report.busy}
              loading={response.report.busy}
              onClick={() => void response.download()}
            >
              Preparar reporte ficticio
            </Button>
            {response.report.result && fresh && (
              <Button
                component="a"
                variant="outline"
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(response.report.result)}`}
                download={`reporte-ficticio-${id}.csv`}
              >
                Guardar CSV de demostración
              </Button>
            )}
            {batch.failed > 0 && (
              <Button
                component={Link}
                to={`/precios/importar${context.suffix}`}
                variant="outline"
              >
                Corregir archivo
              </Button>
            )}
          </Group>
          {response.report.error && (
            <FeedbackAlert semantic="error" title="Reporte no disponible">
              {response.report.error.message}
            </FeedbackAlert>
          )}
          <Text size="sm">
            Las filas confirmadas se conservan en el resultado. Para corregir
            debes revisar un archivo nuevo; no se reenvía el lote ni se duplican
            automáticamente las filas confirmadas.
          </Text>
        </>
      )}
      {fresh && !batch && (
        <EmptyState
          title="Lote no encontrado"
          description="La referencia no corresponde a un lote disponible en el adapter de demostración. No se ha creado otro lote."
        />
      )}
    </>
  );
}
