import { useState } from "react";
import { Button } from "@mantine/core";
import { FeedbackAlert } from "../../../components/shared";
import { usePricingContext } from "../hooks/usePricingContext";
import { useEditableRead } from "../hooks/usePriceEdit";
import { usePriceSchedules } from "../hooks/usePriceSchedules";
import type { ReviewScenario } from "../services/pricingModels";
import {
  PricingContextLabel,
  PricingPageFrame,
} from "../components/PricingPageFrame";
import { PricingScenarioControl } from "../components/PricingScenarioControl";
import { mutationScenarios, readScenarios } from "../services/pricingScenarios";
import { SchedulesTable } from "../components/SchedulesTable";
import { ScheduleForm } from "../components/ScheduleForm";

export function PriceSchedulesPage() {
  const context = usePricingContext();
  return (
    <PricingPageFrame
      title="Programaciones de precio"
      description="Consulta las vigencias y registra propuestas futuras para el objetivo seleccionado."
    >
      <SchedulesContent
        key={`${context.query.targetId}:${context.query.channel}`}
      />
    </PricingPageFrame>
  );
}
function SchedulesContent() {
  const context = usePricingContext();
  const [scenario, setScenario] = useState<ReviewScenario>("default");
  const [writeScenario, setWriteScenario] = useState<ReviewScenario>("default");
  const list = usePriceSchedules(context.query.targetId, scenario);
  const objective = useEditableRead(context.query, "default");
  const state = list.listing.state;
  return (
    <>
      <PricingContextLabel
        label={context.target?.label ?? "Objetivo no disponible"}
        channel={context.query.channel}
      />
      <PricingScenarioControl
        visible={context.review}
        value={scenario}
        onChange={setScenario}
        options={[...readScenarios]}
        label="Escenario del listado"
      />
      <Button
        style={{ alignSelf: "flex-start" }}
        variant="outline"
        onClick={() => {
          setScenario("default");
          list.refresh();
        }}
      >
        Consultar programaciones
      </Button>
      <SchedulesTable
        result={state.status === "success" ? state.result : undefined}
        state={
          state.status === "error"
            ? { status: "error", message: state.message }
            : { status: state.status }
        }
        page={list.page}
        onPage={list.setPage}
      />
      <PricingScenarioControl
        visible={context.review}
        value={writeScenario}
        onChange={setWriteScenario}
        options={mutationScenarios.filter((row) => row.value !== "conflict")}
        label="Escenario de programación"
      />
      {objective.state.status === "success" && objective.state.result ? (
        <ScheduleForm
          targetId={context.query.targetId}
          currency={objective.state.result.currency}
          channel={context.query.channel}
          scenario={writeScenario}
          onCreated={() => {
            setScenario("default");
            list.refresh();
          }}
        />
      ) : (
        <FeedbackAlert semantic="info" title="Lectura del objetivo requerida">
          {objective.state.status === "loading"
            ? "Cargando contexto…"
            : "La creación está bloqueada hasta disponer de una lectura del objetivo."}
        </FeedbackAlert>
      )}
    </>
  );
}
