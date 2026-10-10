import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Select, Skeleton, Stack, Text } from "@mantine/core";
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
  const targetId =
    priceTargets.find((item) => item.id === params.get("target"))?.id ?? "base";
  const query: PriceQuery = {
    targetId,
    channel:
      params.get("channel") === "retail" && targetId !== "base"
        ? "retail"
        : "global",
  };
  const isRevisionMode =
    import.meta.env.DEV && params.get("modoRevision") === "1";

  // Applied URL context owns the draft lifetime. Back/Forward replaces stale drafts
  // without an effect that overwrites edits on ordinary re-renders.
  return (
    <CurrentPriceContent
      key={`${query.targetId}:${query.channel}`}
      query={query}
      isRevisionMode={isRevisionMode}
      onApply={(next) =>
        setParams((prev) => {
          const nextParams = new URLSearchParams(prev);
          nextParams.set("target", next.targetId);
          nextParams.set("channel", next.channel);
          return nextParams;
        })
      }
    />
  );
}

function CurrentPriceContent({
  query,
  isRevisionMode,
  onApply,
}: {
  query: PriceQuery;
  isRevisionMode: boolean;
  onApply: (query: PriceQuery) => void;
}) {
  const [draft, setDraft] = useState(query);
  const [scenario, setScenario] = useState<PriceScenario>("default");
  const [revision, setRevision] = useState(0);
  const { state, previous } = useCurrentPrice(query, scenario, revision);
  const snapshot = state.status === "success" ? state.result : previous;
  const fresh = state.status === "success" && state.result !== null;

  const consult = () => {
    onApply(draft);
    setRevision((value) => value + 1);
  };

  return (
    <>
      <PageHeader
        title="Gestión de precios"
        description="Consulta los precios vigentes de productos y variantes (SKU)."
        breadcrumbs={[{ label: "Precios" }, { label: "Precio vigente" }]}
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Datos de demostración">
          Los precios mostrados son simulados. Esta pantalla no consulta ni
          modifica información comercial real.
        </FeedbackAlert>
        <PriceFilters
          draft={draft}
          applied={query}
          onChange={setDraft}
          onConsult={consult}
        />
        {isRevisionMode && (
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
        )}
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
                Para el canal Retail seleccionado, el precio disponible
                corresponde al alcance global.
              </FeedbackAlert>
            )}
            <PriceSummary price={snapshot.price} />
            <PriceBreakdown rows={snapshot.breakdown} />
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
