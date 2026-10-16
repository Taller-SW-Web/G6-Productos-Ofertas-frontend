import { StatusBadge } from "../../../components/shared/StatusBadge";
import type { ComboStatus, FreshnessStatus } from "../types/combos";

interface ComboStatusBadgeProps {
  status: ComboStatus;
}

export function ComboStatusBadge({ status }: ComboStatusBadgeProps) {
  if (status === "ACTIVO") {
    return (
      <StatusBadge semantic="neutral" size="md">
        Activo
      </StatusBadge>
    );
  }

  return (
    <StatusBadge semantic="neutral" size="md">
      Inactivo
    </StatusBadge>
  );
}

interface AvailabilityBadgeProps {
  availability: number | null;
  freshness: FreshnessStatus | null;
}

export function AvailabilityBadge({
  availability,
  freshness,
}: AvailabilityBadgeProps) {
  if (freshness === "ERROR_CONSULTA") {
    return (
      <StatusBadge semantic="error" size="md">
        Fallo de consulta de inventario
      </StatusBadge>
    );
  }

  if (availability === null) {
    if (freshness === "INCOMPLETA") {
      return (
        <StatusBadge semantic="warning" size="md">
          Disponibilidad incompleta
        </StatusBadge>
      );
    }
    if (freshness === "NO_VERIFICABLE") {
      return (
        <StatusBadge semantic="neutral" size="md">
          Disponibilidad no verificable
        </StatusBadge>
      );
    }
    return (
      <StatusBadge semantic="neutral" size="md">
        Disponibilidad no confirmada
      </StatusBadge>
    );
  }

  if (availability === 0) {
    if (freshness === "DESACTUALIZADA") {
      return (
        <StatusBadge semantic="warning" size="md">
          Desactualizada (0 un. sin confirmar)
        </StatusBadge>
      );
    }
    return (
      <StatusBadge semantic="error" size="md">
        Agotado actualmente (0 un.)
      </StatusBadge>
    );
  }

  if (freshness === "DESACTUALIZADA") {
    return (
      <StatusBadge semantic="warning" size="md">
        Desactualizada ({availability} un.)
      </StatusBadge>
    );
  }

  if (freshness === "ACTUALIZADA") {
    return (
      <StatusBadge semantic="success" size="md">
        {availability} combos estimados
      </StatusBadge>
    );
  }

  return (
    <StatusBadge semantic="info" size="md">
      {availability} combos estimados
    </StatusBadge>
  );
}
