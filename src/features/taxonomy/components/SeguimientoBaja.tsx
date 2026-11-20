import { Button } from "@mantine/core";
import { FeedbackAlert } from "../../../components/shared";
import type { useSeguimientoBaja } from "../hooks/useSeguimientoBaja";

export function SeguimientoBaja({ seguimiento }: { seguimiento: ReturnType<typeof useSeguimientoBaja> }) {
  const { estado, mensaje, operacionId, reintentar } = seguimiento;
  if (estado === "idle" || estado === "recuperando") return null;
  return (
    <div role="status" aria-live="polite">
      <FeedbackAlert
        semantic={estado === "confirmada" ? "success" : estado === "rechazada" || estado === "error" ? "error" : "warning"}
        title={estado === "pendiente" ? "PENDING_DEACTIVATION — solicitud en verificación" : estado === "confirmada" ? "Baja confirmada" : estado === "rechazada" ? "Baja rechazada" : "No se pudo consultar la operación"}
        actions={estado === "error" && operacionId ? <Button onClick={reintentar}>Consultar nuevamente</Button> : undefined}
      >
        {mensaje || "La solicitud está pendiente de una decisión terminal."}
      </FeedbackAlert>
    </div>
  );
}
