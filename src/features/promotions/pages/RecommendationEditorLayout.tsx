import { useCallback } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Button, Skeleton, Stack, Text } from "@mantine/core";
import { EmptyState, FeedbackAlert } from "../../../components/shared";
import { useAdministrationRead } from "../hooks/useAdministrationRead";
import { useAdministrationEditor } from "../hooks/useAdministrationEditor";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import {
  administrationScenario,
  checkAdministrationRead,
} from "../services/administration";
import { recommendationService } from "../services/recommendationService";
import { promotionCatalogService } from "../services/catalogService";
import {
  recommendationErrors,
  normalizeRecommendationDraft,
} from "../services/recommendationValidation";
import {
  emptyRecommendation,
  type RecommendationDraft,
  type RecommendationKind,
  type RecommendationView,
} from "../services/recommendationRepository";
import type {
  CatalogCategoryChoice,
  CatalogProductChoice,
} from "../services/catalogRepository";
const draftOf = (record: RecommendationView) =>
  structuredClone(record.configuration);
export interface RecommendationEditorContext {
  form: ReturnType<
    typeof useAdministrationEditor<RecommendationView, RecommendationDraft>
  >;
  initial: RecommendationView | null;
  root: string;
  suffix: string;
  products: CatalogProductChoice[];
  categories: CatalogCategoryChoice[];
  catalogLoading: boolean;
  catalogError: string | undefined;
  navigationBlocked: boolean;
}
export function RecommendationEditorLayout({
  kind = "cross-sell",
}: {
  kind?: RecommendationKind;
}) {
  const { ruleId } = useParams();
  const [params] = useSearchParams(),
    scenario = administrationScenario(params);
  const read = useCallback(
    (signal: AbortSignal) =>
      ruleId
        ? recommendationService.read(ruleId, scenario, signal)
        : checkAdministrationRead(
            scenario === "session" || scenario === "forbidden"
              ? scenario
              : "default",
            signal,
          ).then(() => null),
    [ruleId, scenario],
  );
  const state = useAdministrationRead(JSON.stringify([ruleId, scenario]), read);
  if (state.status === "loading")
    return (
      <Stack role="status">
        <Text>Cargando regla…</Text>
        <Skeleton height={200} />
      </Stack>
    );
  if (state.status === "error")
    return (
      <Stack>
        <FeedbackAlert semantic="error" title="No se puede editar">
          {state.message}
        </FeedbackAlert>
        <Button component={Link} to="/recomendaciones">
          Volver al listado
        </Button>
      </Stack>
    );
  if (ruleId && !state.result)
    return (
      <EmptyState
        title="Regla no encontrada"
        description="Selecciona otro registro para editar."
        action={
          <Button component={Link} to="/recomendaciones">
            Volver al listado
          </Button>
        }
      />
    );
  return (
    <RecommendationEditorProvider
      key={ruleId ?? kind}
      kind={kind}
      initial={state.result}
    />
  );
}
function RecommendationEditorProvider({
  initial,
  kind,
}: {
  initial: RecommendationView | null;
  kind: RecommendationKind;
}) {
  const [params] = useSearchParams(),
    scenario = administrationScenario(params),
    suffix = params.size ? `?${params}` : "";
  const root = initial
    ? `/recomendaciones/${initial.id}/editar`
    : `/recomendaciones/nueva/${kind === "upsell" ? "upselling" : "venta-cruzada"}`;
  const form = useAdministrationEditor(
    initial,
    { ...emptyRecommendation, kind },
    draftOf,
    recommendationErrors,
    recommendationService,
    scenario,
    normalizeRecommendationDraft,
  );
  const guard = useUnsavedChanges(
    form.dirty && !form.confirmed,
    form.submitting,
    root,
  );
  const readCatalog = useCallback(
    async (signal: AbortSignal) => ({
      products: await promotionCatalogService.products(
        scenario === "selection-error" || scenario === "selection-empty"
          ? scenario
          : "default",
        signal,
      ),
      categories: await promotionCatalogService.categories("default", signal),
    }),
    [scenario],
  );
  const catalog = useAdministrationRead(`catalog:${scenario}`, readCatalog);
  if (form.confirmed) {
    const next = new URLSearchParams(params);
    next.delete("escenario");
    return (
      <Navigate
        replace
        to={`/recomendaciones/${form.confirmed.id}?${next}`}
        state={{ saved: true }}
      />
    );
  }
  const context: RecommendationEditorContext = {
    form,
    initial,
    root,
    suffix,
    products: catalog.status === "success" ? catalog.result.products : [],
    categories: catalog.status === "success" ? catalog.result.categories : [],
    catalogLoading: catalog.status === "loading",
    catalogError: catalog.status === "error" ? catalog.message : undefined,
    navigationBlocked: guard.blocked,
  };
  return (
    <>
      <Outlet context={context} />
      <UnsavedChangesDialog
        opened={guard.blocked}
        submitting={form.submitting}
        onStay={guard.stay}
        onDiscard={guard.discard}
      />
    </>
  );
}
