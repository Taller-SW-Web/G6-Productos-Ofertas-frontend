import type { ReactNode } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import {
  EmptyState,
  FeedbackAlert,
  PageHeader,
} from "../../../components/shared";
import { usePricingContext } from "../hooks/usePricingContext";

export function PricingPageFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const context = usePricingContext();
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[
          { label: "Precios", to: `/precios${context.suffix}` },
          { label: title },
        ]}
        actions={
          <Button
            component={Link}
            to={`/precios${context.suffix}`}
            variant="outline"
          >
            Volver a precios
          </Button>
        }
      />
      <Stack gap="lg">
        <FeedbackAlert semantic="info" title="Demostración local de Pricing">
          Datos y respuestas ficticios. No hay operaciones comerciales reales.
          Los cambios locales se reinician al recargar.
        </FeedbackAlert>
        {context.invalid ? (
          <EmptyState
            title="Selecciona un objetivo válido"
            description="El contexto de la dirección no corresponde a un producto o SKU de demostración."
            action={
              <Button component={Link} to="/precios" variant="outline">
                Seleccionar producto o SKU
              </Button>
            }
          />
        ) : (
          children
        )}
      </Stack>
    </>
  );
}
export function PricingLinks({ suffix }: { suffix: string }) {
  return (
    <Group gap="sm" aria-label="Tareas de precios">
      <Button component={Link} to={`/precios/editar${suffix}`}>
        Editar precio
      </Button>
      <Button
        component={Link}
        to={`/precios/programaciones${suffix}`}
        variant="outline"
      >
        Programar precio
      </Button>
      <Button
        component={Link}
        to={`/precios/historico${suffix}`}
        variant="outline"
      >
        Consultar histórico
      </Button>
    </Group>
  );
}
export function PricingContextLabel({
  label,
  channel,
}: {
  label: string;
  channel: string;
}) {
  return (
    <Text size="sm" fw={600}>
      {label} · Canal solicitado: {channel === "retail" ? "Retail" : "Global"}
    </Text>
  );
}
