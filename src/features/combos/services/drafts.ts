import type { Combo, ComboDraft } from "../types/combos";

export const blankComboDraft: ComboDraft = { name: "", description: "", components: [], price: "" };

export function draftFromCombo(combo?: Combo): ComboDraft {
  return combo
    ? { name: combo.name, description: combo.description ?? "", components: combo.components.map(({ sku, productName, quantity }) => ({ sku, productName, quantity })), price: (combo.priceMinor / 100).toFixed(2) }
    : { ...blankComboDraft, components: [] };
}

export function keepDraftAfterVersionConflict(draft: ComboDraft, currentVersion: Combo | undefined) {
  return { draft, currentVersion };
}
