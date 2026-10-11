import { useState } from "react";
import { Button, Select, Skeleton } from "@mantine/core";
import { Link } from "react-router-dom";
import { EmptyState, FeedbackAlert } from "../../../components/shared";
import { usePricingContext } from "../hooks/usePricingContext";
import { useEditableRead } from "../hooks/usePriceEdit";
import type { ReviewScenario } from "../services/pricingModels";
import { PricingPageFrame } from "../components/PricingPageFrame";
import { PricingScenarioControl } from "../components/PricingScenarioControl";
import { mutationScenarios, readScenarios } from "../services/pricingScenarios";
import { PriceEditForm } from "../components/PriceEditForm";

export function EditPricePage() {
  const context = usePricingContext();
  const [readScenario, setReadScenario] = useState<ReviewScenario>("default");
  const [scenario, setScenario] = useState<ReviewScenario>("default");
  const scope =
    context.target?.kind === "variant" &&
    context.params.get("scope") !== "product"
      ? "sku"
      : "product";
  const target = {
    targetId: scope === "product" ? "base" : context.query.targetId,
    channel: scope === "product" ? ("global" as const) : context.query.channel,
  };
  const read = useEditableRead(target, readScenario);
  return (
    <PricingPageFrame
      title="Editar precio"
      description="Revisa el objetivo y su versión antes de confirmar una propuesta."
    >
      <Select
        label="Alcance del precio"
        value={scope}
        data={[
          { value: "product", label: "Precio base del producto" },
          ...(context.target?.kind === "variant"
            ? [
                {
                  value: "sku",
                  label: "Precio específico del SKU seleccionado",
                },
              ]
            : []),
        ]}
        onChange={(value) =>
          context.setParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("scope", value === "sku" ? "sku" : "product");
            return next;
          })
        }
        maw={480}
      />
      <PricingScenarioControl
        visible={context.review}
        value={readScenario}
        onChange={setReadScenario}
        options={[...readScenarios]}
        label="Escenario de lectura"
      />
      <PricingScenarioControl
        visible={context.review}
        value={scenario}
        onChange={setScenario}
        options={mutationScenarios}
        label="Escenario de guardado"
      />
      {read.state.status === "loading" && (
        <>
          <span role="status">Cargando objetivo de escritura…</span>
          <Skeleton height={120} />
        </>
      )}
      {read.state.status === "error" && (
        <FeedbackAlert
          semantic="error"
          title="Lectura requerida para editar"
          actions={
            <Button
              variant="outline"
              onClick={() => setReadScenario("default")}
            >
              Volver a consultar
            </Button>
          }
        >
          {read.state.message} La mutación está bloqueada.
        </FeedbackAlert>
      )}
      {read.state.status === "success" &&
        (read.state.result ? (
          <PriceEditForm
            key={`${target.targetId}:${target.channel}:${read.state.result.view.version}`}
            target={target}
            initial={read.state.result}
            scenario={scenario}
            back={`/precios${context.suffix}`}
          />
        ) : (
          <EmptyState
            title="Sin precio para editar"
            description="Selecciona un objetivo con una lectura disponible."
            action={
              <Button
                component={Link}
                to={`/precios${context.suffix}`}
                variant="outline"
              >
                Volver a precios
              </Button>
            }
          />
        ))}
    </PricingPageFrame>
  );
}
