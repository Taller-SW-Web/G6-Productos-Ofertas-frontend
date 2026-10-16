import type { Combo } from "../types/combos";

export type AvailabilityMessage = { label: string; semantic: "neutral" | "info" | "warning" };

export function hasVerifiedPositiveAvailability(combo: Combo): boolean {
  return combo.status === "ACTIVO" &&
    combo.availability.verifiable &&
    combo.availability.freshness === "ACTUALIZADA" &&
    combo.availability.quantity !== null &&
    combo.availability.quantity > 0;
}

export function availabilityMessage(combo: Combo): AvailabilityMessage {
  if (combo.status === "INACTIVO") return { label: "No disponible para nuevas ventas", semantic: "neutral" };
  const { availability } = combo;
  if (!availability.verifiable) {
    return { label: "No se puede confirmar la disponibilidad actual.", semantic: "info" };
  }
  if (availability.freshness === "DESACTUALIZADA") {
    return { label: "Disponibilidad desactualizada", semantic: "warning" };
  }
  if (availability.freshness === "INCOMPLETA") {
    return { label: "Disponibilidad incompleta", semantic: "info" };
  }
  if (availability.quantity === null) {
    return { label: "No se puede confirmar la disponibilidad actual.", semantic: "info" };
  }
  if (availability.quantity === 0) return { label: "Agotado actualmente", semantic: "warning" };
  return { label: `${availability.quantity} combos estimados`, semantic: "neutral" };
}
