import type {
  AvailabilityState,
  ComboAvailability,
  ComboStatus,
  StockReading,
} from "../types/combos";

export type AvailabilityMessage = { label: string; semantic: "neutral" | "info" | "warning" | "success" };

export interface AvailabilityComponent {
  sku: string;
  quantity: number;
  active: boolean;
}

// Informative availability: min(floor(stockDisponibleSKU / cantidadRequeridaSKU)).
// It never reserves, never builds a combo balance and never coerces an unknown
// balance into a confident zero. Unknown/incompatible readings short-circuit to
// an incomplete or unverifiable state with quantity null.
export function calculateInformativeAvailability(
  status: ComboStatus,
  components: AvailabilityComponent[],
  readings: ReadonlyMap<string, StockReading>,
  calculatedAt: string | null = new Date().toISOString(),
): ComboAvailability {
  if (status === "INACTIVO") {
    return {
      state: "COMBO_INACTIVO",
      verifiable: false,
      quantity: null,
      freshness: "INCOMPLETA",
      calculatedAt: null,
      reason: "El combo está administrativamente inactivo y no se ofrece para nuevas ventas.",
    };
  }
  if (components.length === 0) {
    return {
      state: "INCOMPLETA",
      verifiable: false,
      quantity: null,
      freshness: "INCOMPLETA",
      calculatedAt: null,
      reason: "No hay componentes para calcular la disponibilidad.",
    };
  }
  if (components.some((component) => !component.active)) {
    return {
      state: "COMPONENTE_INACTIVO",
      verifiable: false,
      quantity: null,
      freshness: "INCOMPLETA",
      calculatedAt: null,
      reason: "Al menos un componente no está activo y no permite nuevas ventas.",
    };
  }

  let min = Number.POSITIVE_INFINITY;
  let stale = false;
  let incomplete = false;

  for (const component of components) {
    if (!Number.isSafeInteger(component.quantity) || component.quantity < 1) {
      return {
        state: "NO_VERIFICABLE",
        verifiable: false,
        quantity: null,
        freshness: "NO_VERIFICABLE",
        calculatedAt: null,
        reason: "La cantidad de un componente no es verificable.",
      };
    }
    const reading = readings.get(component.sku);
    if (!reading || !reading.locationsCompatible || reading.stock === null ||
      !Number.isFinite(reading.stock) || reading.stock < 0) {
      incomplete = true;
      continue;
    }
    if (reading.stale) stale = true;
    min = Math.min(min, Math.floor(reading.stock / component.quantity));
  }

  if (min === Number.POSITIVE_INFINITY) {
    return incomplete
      ? {
          state: "INCOMPLETA",
          verifiable: false,
          quantity: null,
          freshness: "INCOMPLETA",
          calculatedAt: null,
          reason: "El snapshot de inventario no permite verificar todos los componentes.",
        }
      : {
          state: "NO_VERIFICABLE",
          verifiable: false,
          quantity: null,
          freshness: "NO_VERIFICABLE",
          calculatedAt: null,
          reason: "No hay datos verificables de disponibilidad para los componentes.",
        };
  }

  if (stale) {
    return {
      state: "DESACTUALIZADA",
      verifiable: true,
      quantity: min,
      freshness: "DESACTUALIZADA",
      calculatedAt,
      reason: "La información de inventario consultada está desactualizada.",
    };
  }
  if (min === 0) {
    return {
      state: "AGOTADO",
      verifiable: true,
      quantity: 0,
      freshness: "ACTUALIZADA",
      calculatedAt,
      reason: "La disponibilidad informativa confirmada es cero.",
    };
  }
  return {
    state: "DISPONIBLE",
    verifiable: true,
    quantity: min,
    freshness: "ACTUALIZADA",
    calculatedAt,
    reason: null,
  };
}

export function isVerifiedPositiveAvailability(availability: ComboAvailability): boolean {
  return availability.state === "DISPONIBLE" &&
    availability.verifiable &&
    availability.freshness === "ACTUALIZADA" &&
    availability.quantity !== null &&
    availability.quantity > 0;
}

export function isUnavailableForNewSales(combo: { status: ComboStatus; availability: ComboAvailability }): boolean {
  return combo.status === "INACTIVO" ||
    combo.availability.state === "AGOTADO" ||
    combo.availability.state === "COMPONENTE_INACTIVO" ||
    !isVerifiedPositiveAvailability(combo.availability);
}

const STATE_LABELS: Record<AvailabilityState, { label: string; semantic: AvailabilityMessage["semantic"] }> = {
  DISPONIBLE: { label: "Disponible (estimado)", semantic: "success" },
  AGOTADO: { label: "Agotado (0 confirmado)", semantic: "warning" },
  DESACTUALIZADA: { label: "Disponibilidad desactualizada", semantic: "warning" },
  INCOMPLETA: { label: "Disponibilidad incompleta", semantic: "info" },
  NO_VERIFICABLE: { label: "Disponibilidad no verificable", semantic: "info" },
  COMBO_INACTIVO: { label: "Combo inactivo", semantic: "neutral" },
  COMPONENTE_INACTIVO: { label: "Componente inactivo", semantic: "warning" },
};

export function availabilityMessage(combo: { status: ComboStatus; availability: ComboAvailability }): AvailabilityMessage {
  const state = combo.status === "INACTIVO" ? "COMBO_INACTIVO" : combo.availability.state;
  const entry = STATE_LABELS[state];
  if (state === "DISPONIBLE" && combo.availability.quantity !== null) {
    return { label: `${combo.availability.quantity} combos estimados`, semantic: "success" };
  }
  if (state === "DESACTUALIZADA" && combo.availability.quantity !== null) {
    return { label: `Desactualizada (${combo.availability.quantity} combos estimados)`, semantic: "warning" };
  }
  return entry;
}

export function availabilityMessageText(combo: { status: ComboStatus; availability: ComboAvailability }): string {
  const message = availabilityMessage(combo);
  if (combo.status === "INACTIVO") return "La definición administrativa se conserva y no se ofrece para nuevas ventas.";
  return combo.availability.reason ?? message.label;
}
