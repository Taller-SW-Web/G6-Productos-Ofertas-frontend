import { Badge } from "@mantine/core";
import type { ComboStatus, FreshnessStatus } from "../types/combos";

interface ComboStatusBadgeProps {
  status: ComboStatus;
}

export function ComboStatusBadge({ status }: ComboStatusBadgeProps) {
  if (status === "ACTIVO") {
    return (
      <Badge color="gray" variant="filled" size="md">
        Activo
      </Badge>
    );
  }

  return (
    <Badge color="gray" variant="outline" size="md">
      Inactivo
    </Badge>
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
  if (availability === null) {
    if (freshness === "INCOMPLETA") {
      return (
        <Badge color="yellow" variant="light" size="md">
          Disponibilidad incompleta
        </Badge>
      );
    }
    return (
      <Badge color="gray" variant="light" size="md">
        Disponibilidad no verificable
      </Badge>
    );
  }

  if (availability === 0) {
    return (
      <Badge color="red" variant="light" size="md">
        Agotado actualmente
      </Badge>
    );
  }

  if (freshness === "DESACTUALIZADA") {
    return (
      <Badge color="yellow" variant="light" size="md">
        Desactualizada ({availability} combos)
      </Badge>
    );
  }

  return (
    <Badge color="green" variant="light" size="md">
      {availability} combos estimados
    </Badge>
  );
}
