import {
  ComboRepositoryError,
  type CombosRepository,
} from "../services/combosRepository";
import type {
  ComboPageResult,
  ComboView,
  ComponentPricingSnapshot,
} from "../types/combos";

export class UnavailableApiCombosRepository implements CombosRepository {
  private fail(): never {
    throw new ComboRepositoryError(
      "SERVICIO_NO_DISPONIBLE",
      "Integración API no disponible para Combos. El backend real aún no está enlazado a esta vista.",
    );
  }

  async listCombos(): Promise<ComboPageResult> {
    this.fail();
  }

  async getCombo(): Promise<ComboView | null> {
    this.fail();
  }

  async createCombo(): Promise<ComboView> {
    this.fail();
  }

  async updateCombo(): Promise<ComboView> {
    this.fail();
  }

  async deactivateCombo(): Promise<ComboView> {
    this.fail();
  }

  async getComponentsPricing(): Promise<Record<string, ComponentPricingSnapshot>> {
    this.fail();
  }
}

export const unavailableApiCombosRepository =
  new UnavailableApiCombosRepository();
