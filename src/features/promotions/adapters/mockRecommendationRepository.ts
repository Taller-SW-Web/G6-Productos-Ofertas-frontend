import { recommendationFixtures } from "../mocks/recommendations";
import type { PromotionCatalogRepository } from "../services/catalogRepository";
import { AdministrationError, pageOf } from "../services/administration";
import {
  recommendationErrors,
  normalizeRecommendationDraft,
} from "../services/recommendationValidation";
import type {
  RecommendationRepository,
  RecommendationView,
} from "../services/recommendationRepository";
export function createMockRecommendationRepository(
  catalog: () => PromotionCatalogRepository,
  fixtures: readonly RecommendationView[] = recommendationFixtures,
): RecommendationRepository {
  const records: RecommendationView[] = fixtures.map((item) =>
    structuredClone(item),
  );
  let sequence = 0;
  return {
    async list(query, signal) {
      signal.throwIfAborted();
      return pageOf(
        records.filter(
          (item) =>
            (query.status === "all" || item.status === query.status) &&
            (query.kind === "all" || item.configuration.kind === query.kind),
        ),
        query.page,
        query.pageSize,
      );
    },
    async read(id, signal) {
      signal.throwIfAborted();
      const record = records.find((item) => item.id === id);
      return record ? structuredClone(record) : null;
    },
    async save(id, draft, signal) {
      signal.throwIfAborted();
      const errors = recommendationErrors(draft);
      const catalogProducts = await catalog().products(signal);
      const catalogCategories = await catalog().categories(signal);
      signal.throwIfAborted();
      const origins =
        draft.originType === "category" ? catalogCategories : catalogProducts;
      if (!origins.some((item) => item.id === draft.originId && item.active))
        errors.origin = "El origen no está disponible o está inactivo.";
      draft.candidates.forEach((candidate, index) => {
        if (
          !catalogProducts.some(
            (item) => item.id === candidate.productId && item.active,
          )
        )
          errors[`candidate-${index}`] =
            "El producto recomendado no está disponible o está inactivo.";
      });
      const previous = id ? records.find((item) => item.id === id) : null;
      if (id && !previous)
        throw new AdministrationError(
          "rejected",
          "La regla no está disponible para editar.",
        );
      if (previous && draft.kind !== previous.configuration.kind)
        errors.kind =
          "La edición conserva el tipo de regla. Crea una regla nueva para otro tipo.";
      if (Object.keys(errors).length)
        throw new AdministrationError(
          "validation",
          "Revisa los campos indicados. El borrador se conserva.",
          errors,
        );
      if (draft.status !== "active" && draft.status !== "inactive")
        throw new AdministrationError(
          "validation",
          "Selecciona un estado inicial.",
        );
      const record: RecommendationView = {
        id: id ?? `regla-demo-${++sequence}`,
        name: draft.name.trim(),
        status: previous?.status ?? draft.status,
        configuration: {
          ...normalizeRecommendationDraft(draft),
          name: draft.name.trim(),
          status: previous?.status ?? draft.status,
          candidates: draft.candidates.map((item) => ({
            ...item,
            criterion: draft.kind === "cross-sell" ? "" : item.criterion,
            justification:
              draft.kind === "cross-sell" ? "" : item.justification,
          })),
        },
      };
      if (id) records[records.findIndex((item) => item.id === id)] = record;
      else records.push(record);
      return structuredClone(record);
    },
    async changeStatus(id, status, signal) {
      signal.throwIfAborted();
      if (status !== "active" && status !== "inactive")
        throw new AdministrationError(
          "validation",
          "Selecciona un estado válido.",
        );
      const index = records.findIndex((item) => item.id === id),
        previous = records[index];
      if (!previous)
        throw new AdministrationError(
          "rejected",
          "La regla no está disponible.",
        );
      const record = {
        ...previous,
        status,
        configuration: { ...previous.configuration, status },
      };
      records[index] = record;
      return structuredClone(record);
    },
  };
}
