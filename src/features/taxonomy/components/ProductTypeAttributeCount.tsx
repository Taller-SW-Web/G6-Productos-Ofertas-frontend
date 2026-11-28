import { useState } from "react";
import { Button, Stack, Text } from "@mantine/core";
import { useProductTypeSchema } from "../hooks/useProductTypeSchema";

export function ProductTypeAttributeCount({ id }: { id: string }) {
  const [requested, setRequested] = useState(false);
  return requested ? <ResolvedCount id={id} /> : (
    <Button variant="subtle" size="compact-sm" onClick={() => setRequested(true)}>
      Consultar cantidad
    </Button>
  );
}

function ResolvedCount({ id }: { id: string }) {
  const { state, reload } = useProductTypeSchema(id);
  if (state.status === "loading") return <Text size="sm" role="status">Consultando…</Text>;
  if (state.status === "success") return <Text size="sm">{state.esquema.caracteristicas.length} asociadas</Text>;
  return <Stack gap={4}>
    <Text size="xs" c="dimmed">{state.status === "not-found" ? "Esquema no encontrado" : "No se pudo consultar"}</Text>
    <Button variant="subtle" size="compact-sm" onClick={reload}>Reintentar cantidad</Button>
  </Stack>;
}
