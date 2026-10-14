import type {
  ComboListQuery,
  ComboPageResult,
  ComboView,
  CreateComboPayload,
  UpdateComboPayload,
  ComponentPricingSnapshot,
} from "../types/combos";

export class ComboRepositoryError extends Error {
  constructor(
    public readonly code:
      | "COMBO_NO_ENCONTRADO"
      | "COMBO_PRECIO_INVALIDO"
      | "COMBO_COMPONENTES_INSUFICIENTES"
      | "COMBO_COMPONENTE_DUPLICADO"
      | "COMBO_ANIDADO_NO_PERMITIDO"
      | "VERSION_CONFLICT"
      | "SKU_NO_ENCONTRADO"
      | "SERVICIO_NO_DISPONIBLE"
      | "ERROR_INTERNO",
    message: string,
    public readonly currentVersion?: number,
  ) {
    super(message);
    this.name = "ComboRepositoryError";
  }
}

export interface CombosRepository {
  listCombos(query: ComboListQuery, signal?: AbortSignal): Promise<ComboPageResult>;
  getCombo(comboId: string, signal?: AbortSignal): Promise<ComboView | null>;
  createCombo(payload: CreateComboPayload, signal?: AbortSignal): Promise<ComboView>;
  updateCombo(comboId: string, payload: UpdateComboPayload, signal?: AbortSignal): Promise<ComboView>;
  deactivateCombo(comboId: string, signal?: AbortSignal): Promise<ComboView>;
  getComponentsPricing(skus: string[], signal?: AbortSignal): Promise<Record<string, ComponentPricingSnapshot>>;
}
