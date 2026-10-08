import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Group, Select, Skeleton, Stack, Text } from "@mantine/core";
import { IconPencil, IconCalendar, IconUpload } from "@tabler/icons-react";
import {
  EmptyState,
  FeedbackAlert,
  PageHeader,
} from "../../../components/shared";
import { PriceSummary } from "../components/PriceSummary";
import { PriceBreakdown } from "../components/PriceBreakdown";
import { PriceFilters } from "../components/PriceFilters";
import { useCurrentPrice } from "../hooks/useCurrentPrice";
import { priceTargets } from "../mocks/prices";
import type { PriceQuery, PriceScenario } from "../services/pricingRepository";

const scenarios: { value: PriceScenario; label: string }[] = [
  { value: "default", label: "Precio disponible" },
  { value: "loading", label: "Cargando" },
  { value: "empty", label: "Sin precio" },
  { value: "error", label: "Error de consulta" },
];
export function CurrentPricePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const targetId =
    priceTargets.find((item) => item.id === params.get("target"))?.id ?? "base";
  const query: PriceQuery = {
    targetId,
    channel:
      params.get("channel") === "retail" && targetId !== "base"
        ? "retail"
        : "global",
  };
  const [draft, setDraft] = useState(query);
  const [scenario, setScenario] = useState<PriceScenario>("default");
  const [revision, setRevision] = useState(0);
  const { state, previous } = useCurrentPrice(query, scenario, revision);
  const snapshot = state.status === "success" ? state.result : previous;
  const fresh = state.status === "success" && state.result !== null;
  const demoPath = (panel: string) =>
    `/foundation/pricing?panel=${panel}&target=${query.targetId}&channel=${query.channel}`;
  const consult = () => {
    setParams({ target: draft.targetId, channel: draft.channel });
    setRevision((value) => value + 1);
  };
  return (
    <>
      <PageHeader
        title="Gestión de precios"
        description="Consulta el precio vigente y distingue el precio base del producto de los overrides por SKU."
        breadcrumbs={[{ label: "Precios" }, { label: "Precio vigente" }]}
        actions={
          <Button
            component={Link}
            to={demoPath("import")}
            variant="outline"
            leftSection={<IconUpload size={20} stroke={2} aria-hidden="true" />}
          >
            Componentes de carga masiva
          </Button>
        }
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Piloto con datos ficticios">
          Consulta local de MK-013-S01. Las acciones abren muestras de
          componentes y no modifican precios reales.
        </FeedbackAlert>
        <PriceFilters
          draft={draft}
          applied={query}
          onChange={setDraft}
          onConsult={consult}
        />
        <Select
          label="Escenario de revisión del piloto"
          value={scenario}
          data={scenarios}
          maw={320}
          onChange={(value) => {
            const option = scenarios.find((item) => item.value === value);
            if (option) setScenario(option.value);
          }}
        />
        {state.status === "loading" && (
          <Stack gap="sm" role="status">
            <Text size="sm">
              {previous ? "Actualizando consulta…" : "Cargando precio…"}
            </Text>
            {!previous && <Skeleton height={120} radius="md" />}
          </Stack>
        )}
        {state.status === "error" && (
          <FeedbackAlert
            semantic="error"
            title="Precio no disponible"
            actions={
              <Button
                variant="outline"
                onClick={() => {
                  setScenario("default");
                  setRevision((value) => value + 1);
                }}
              >
                Volver a consultar
              </Button>
            }
          >
            {state.message}
          </FeedbackAlert>
        )}
        {snapshot && (
          <>
            {!fresh && (
              <FeedbackAlert
                semantic="warning"
                title="Última consulta disponible"
              >
                Se conserva la última lectura de este objetivo; no se presenta
                como una consulta actualizada. Las acciones que requieren
                lectura vigente están bloqueadas.
              </FeedbackAlert>
            )}
            {query.channel === "retail" && (
              <FeedbackAlert semantic="info" title="Fallback al precio global">
                Solicitaste Retail. El fixture consultado resuelve al alcance
                global; no es una tarifa exclusiva de Retail.
              </FeedbackAlert>
            )}
            <PriceSummary price={snapshot.price} />
            <Group gap="sm">
              <Button
                onClick={() => navigate(demoPath("edit"))}
                disabled={!fresh}
                leftSection={
                  <IconPencil size={20} stroke={2} aria-hidden="true" />
                }
              >
                Revisar edición de precio
              </Button>
              <Button
                onClick={() => navigate(demoPath("schedule"))}
                variant="outline"
                disabled={!fresh}
                leftSection={
                  <IconCalendar size={20} stroke={2} aria-hidden="true" />
                }
              >
                Revisar programación futura
              </Button>
            </Group>
            <PriceBreakdown rows={snapshot.breakdown} />
            <Text size="sm" c="dimmed">
              Cada fila es una lectura fixture disponible. El navegador no
              calcula la resolución comercial de precios, ahorro ni cantidad de
              variantes afectadas.
            </Text>
          </>
        )}
        {state.status === "success" && !state.result && (
          <EmptyState
            title="Sin precio aplicable"
            description="No hay un precio disponible para la selección de este escenario. Esto no confirma preparación ni representa un importe de cero."
          />
        )}
      </Stack>
    </>
  );
}
